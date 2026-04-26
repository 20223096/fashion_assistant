import sharp from "sharp";
import type {
  BottomAnchors,
  CanvasSpec,
  CompositeMvpInput,
  CompositeMvpResult,
  DebugAnchorPoint,
  FaceAnchors,
  LayerPlacementDebug,
  PartInput,
  PartKind,
  ShoesAnchors,
  TopAnchors,
} from "./types";
import { defaultCanvasAnchors } from "./anchors";

// TODO: optionalFeatherAlpha — 마스크 가장자리만 가우시안 후 알파 재결합
// TODO: segmentationModelHook — rembg/SAM/MediaPipe 로 buffer·anchors 대체

/** 상·하의는 동일 기본 예산 + 합성 시 너비 맞춤(아래 placeTorsoPair) */
const TORSO_DEFAULT_MAX_SIDE = 320;

/** 상의와 동기화한 뒤 하의만 살짝 좁힘 (≈4% 축소) */
const BOTTOM_SUBTLE_WIDTH_SCALE = 0.96;

const DEFAULT_MAX_SIDE: Record<PartKind, number> = {
  face: 220,
  top: TORSO_DEFAULT_MAX_SIDE,
  bottom: TORSO_DEFAULT_MAX_SIDE,
  shoes: 200,
};

/** 알파 기준 외곽 trim — bbox crop이 아니라 투명 여백 제거 */
async function trimAlpha(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .png({ compressionLevel: 7, adaptiveFiltering: true })
    .toBuffer();
}

function canvasTargetForPart(
  kind: PartKind,
  c: ReturnType<typeof defaultCanvasAnchors>
): { x: number; y: number } {
  switch (kind) {
    case "face":
      return c.faceNeck;
    case "top":
      return c.topNeckline;
    case "bottom":
      return c.bottomWaistline;
    case "shoes":
      return c.shoesTop;
  }
}

function anchorInTrimmedPixels(
  kind: PartKind,
  anchors: PartInput["anchors"],
  w: number,
  h: number
): { x: number; y: number } {
  if (kind === "face") {
    const a = anchors as FaceAnchors;
    return { x: a.neckCenterX * w, y: a.neckCenterY * h };
  }
  if (kind === "top") {
    const a = anchors as TopAnchors;
    return { x: a.neckCenterX * w, y: a.neckCenterY * h };
  }
  if (kind === "bottom") {
    const a = anchors as BottomAnchors;
    return { x: a.waistCenterX * w, y: a.waistCenterY * h };
  }
  const a = anchors as ShoesAnchors;
  return { x: a.topCenterX * w, y: a.topCenterY * h };
}

async function resizeInside(
  trimmed: Buffer,
  maxSide: number
): Promise<{ buf: Buffer; w: number; h: number }> {
  const buf = await sharp(trimmed)
    .resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width ?? 1, h: m.height ?? 1 };
}

/** 가로를 `targetW` 픽셀로 맞추고 세로는 비율 유지 (너비 정렬용) */
async function resizeToWidth(
  image: Buffer,
  targetW: number
): Promise<{ buf: Buffer; w: number; h: number }> {
  const tw = Math.max(1, Math.round(targetW));
  const buf = await sharp(image)
    .resize({
      width: tw,
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width ?? 1, h: m.height ?? 1 };
}

async function resizeUniformByScale(
  image: Buffer,
  scale: number
): Promise<Buffer> {
  const s = Math.max(0.05, Math.min(4, scale));
  const m = await sharp(image).metadata();
  const W = Math.max(1, m.width ?? 1);
  const H = Math.max(1, m.height ?? 1);
  const nw = Math.max(1, Math.round(W * s));
  const nh = Math.max(1, Math.round(H * s));
  return sharp(image)
    .resize({
      width: nw,
      height: nh,
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png({ compressionLevel: 6, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * `yNorm` 주변 세로 밴드에서, 알파가 있는 열들의 최대 가로 폭(실루엣 폭)을 구한다.
 * bbox 전체 너비가 아니라 "허리 줄" 근처 실제 옷 너비에 가깝다.
 */
async function alphaMaxSpanInWaistBand(
  trimmedPng: Buffer,
  yNorm: number,
  bandFrac = 0.08
): Promise<{ span: number; width: number; height: number }> {
  const { data, info } = await sharp(trimmedPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  if (w < 1 || h < 1 || ch < 4) {
    return { span: Math.max(1, w), width: w, height: h };
  }
  const yCenter = Math.min(h - 1, Math.max(0, Math.round(yNorm * (h - 1))));
  const half = Math.max(1, Math.round((h * bandFrac) / 2));
  const y0 = Math.max(0, yCenter - half);
  const y1 = Math.min(h - 1, yCenter + half);
  const thr = 14;
  let best = 0;
  for (let y = y0; y <= y1; y++) {
    let minX = w;
    let maxX = -1;
    const row = y * w * ch;
    for (let x = 0; x < w; x++) {
      if (data[row + x * ch + 3] > thr) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (maxX >= minX) {
      const span = maxX - minX + 1;
      if (span > best) best = span;
    }
  }
  if (best < 1) best = Math.max(1, w);
  return { span: best, width: w, height: h };
}

/**
 * 상의 waist Y·하의 waist Y 근처 실루엣 가로 폭을 맞추기 위해, 더 넓은 쪽만 축소한다.
 * (SAM/세그먼트로 골반 마스크 폭을 쓰면 이 단계만 교체하면 됨)
 */
async function harmonizeTorsoWaistSilhouette(
  trimmedTop: Buffer,
  topAnchors: TopAnchors,
  trimmedBottom: Buffer,
  bottomAnchors: BottomAnchors
): Promise<{ top: Buffer; bottom: Buffer }> {
  let topBuf = trimmedTop;
  let botBuf = trimmedBottom;
  const st = await alphaMaxSpanInWaistBand(topBuf, topAnchors.waistCenterY);
  const sb = await alphaMaxSpanInWaistBand(botBuf, bottomAnchors.waistCenterY);
  const minReliable = 6;
  if (st.span < minReliable || sb.span < minReliable) {
    return { top: topBuf, bottom: botBuf };
  }
  const eps = 0.02;
  if (sb.span > st.span * (1 + eps)) {
    botBuf = await resizeUniformByScale(botBuf, st.span / sb.span);
  } else if (st.span > sb.span * (1 + eps)) {
    topBuf = await resizeUniformByScale(topBuf, sb.span / st.span);
  }
  return { top: topBuf, bottom: botBuf };
}

/**
 * 상의·하의를 같은 `maxSide` 예산으로 먼저 맞춘 뒤, 더 좁은 쪽 너비에 맞춰
 * 두 레이어의 표시 너비를 동일하게 맞춘다. (추후 포즈/마네킹 폭으로 대체 가능)
 */
async function placeTorsoPair(
  top: PartInput,
  bottom: PartInput,
  canvas: ReturnType<typeof defaultCanvasAnchors>,
  maxSideTop: number,
  maxSideBottom: number,
  canvasHeight: number
): Promise<{ top: Placed; bottom: Placed }> {
  const torsoCap = Math.min(maxSideTop, maxSideBottom);
  const trimmedTop = await trimAlpha(top.buffer);
  const trimmedBottom = await trimAlpha(bottom.buffer);
  const { top: topHarm, bottom: botHarm } = await harmonizeTorsoWaistSilhouette(
    trimmedTop,
    top.anchors as TopAnchors,
    trimmedBottom,
    bottom.anchors as BottomAnchors
  );
  let topR = await resizeInside(topHarm, torsoCap);
  let botR = await resizeInside(botHarm, torsoCap);

  let wTarget = Math.min(topR.w, botR.w);
  if (wTarget < topR.w || wTarget < botR.w) {
    topR = await resizeToWidth(topR.buf, wTarget);
    botR = await resizeToWidth(botR.buf, wTarget);
  }

  const maxTorsoH = Math.max(1, Math.round(canvasHeight * 0.72));
  const hPair = Math.max(topR.h, botR.h);
  if (hPair > maxTorsoH) {
    const f = maxTorsoH / hPair;
    wTarget = Math.max(1, Math.round(wTarget * f));
    topR = await resizeToWidth(topR.buf, wTarget);
    botR = await resizeToWidth(botR.buf, wTarget);
  }

  const bottomW = Math.max(
    1,
    Math.round(botR.w * BOTTOM_SUBTLE_WIDTH_SCALE)
  );
  botR = await resizeToWidth(botR.buf, bottomW);

  const topAnchorPx = anchorInTrimmedPixels("top", top.anchors, topR.w, topR.h);
  const botAnchorPx = anchorInTrimmedPixels(
    "bottom",
    bottom.anchors,
    botR.w,
    botR.h
  );
  const topTarget = canvasTargetForPart("top", canvas);
  const botTarget = canvasTargetForPart("bottom", canvas);

  return {
    top: {
      kind: "top",
      buf: topR.buf,
      left: Math.round(topTarget.x - topAnchorPx.x),
      top: Math.round(topTarget.y - topAnchorPx.y),
      w: topR.w,
      h: topR.h,
    },
    bottom: {
      kind: "bottom",
      buf: botR.buf,
      left: Math.round(botTarget.x - botAnchorPx.x),
      top: Math.round(botTarget.y - botAnchorPx.y),
      w: botR.w,
      h: botR.h,
    },
  };
}

type Placed = {
  kind: PartKind;
  buf: Buffer;
  left: number;
  top: number;
  w: number;
  h: number;
};

function debugPointsForLayer(
  kind: PartKind,
  anchors: PartInput["anchors"],
  left: number,
  top: number,
  w: number,
  h: number
): DebugAnchorPoint[] {
  const pts: DebugAnchorPoint[] = [];
  const P = (label: string, u: number, v: number) =>
    pts.push({ label, x: left + u * w, y: top + v * h });

  if (kind === "face") {
    const a = anchors as FaceAnchors;
    P("neck", a.neckCenterX, a.neckCenterY);
  } else if (kind === "top") {
    const a = anchors as TopAnchors;
    P("neck", a.neckCenterX, a.neckCenterY);
    P("waist", a.waistCenterX, a.waistCenterY);
  } else if (kind === "bottom") {
    const a = anchors as BottomAnchors;
    P("waist", a.waistCenterX, a.waistCenterY);
    P("hem", a.hemCenterX, a.hemCenterY);
  } else {
    const a = anchors as ShoesAnchors;
    P("topCenter", a.topCenterX, a.topCenterY);
  }
  return pts;
}

async function placePart(
  part: PartInput,
  kind: PartKind,
  canvas: ReturnType<typeof defaultCanvasAnchors>,
  maxSide: number
): Promise<Placed> {
  const trimmed = await trimAlpha(part.buffer);
  const { buf, w, h } = await resizeInside(trimmed, maxSide);
  const anchorPx = anchorInTrimmedPixels(kind, part.anchors, w, h);
  const target = canvasTargetForPart(kind, canvas);
  const left = Math.round(target.x - anchorPx.x);
  const top = Math.round(target.y - anchorPx.y);
  return { kind, buf, left, top, w, h };
}

/** 뒤에서 앞으로 그릴 순서 — 마지막이 최상단(상의가 얼굴 위에 덮임) */
const Z_BACK_TO_FRONT: PartKind[] = ["shoes", "bottom", "face", "top"];

async function composeCore(
  input: CompositeMvpInput,
  placed: Placed[]
): Promise<Buffer> {
  const { canvas } = input;
  const bg = canvas.transparentBackground
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 250, g: 250, b: 249, alpha: 1 };

  const composites = placed.map((p) => ({
    input: p.buf,
    left: p.left,
    top: p.top,
    blend: "over" as const,
  }));

  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: bg,
    },
  })
    .composite(composites)
    .png({ compressionLevel: 7, adaptiveFiltering: true })
    .toBuffer();
}

async function placeAll(input: CompositeMvpInput): Promise<Placed[]> {
  const { face, top, bottom, shoes, maxSide } = input;
  const c = defaultCanvasAnchors(input.canvas.width, input.canvas.height);
  const msTop = maxSide?.top ?? DEFAULT_MAX_SIDE.top;
  const msBottom = maxSide?.bottom ?? DEFAULT_MAX_SIDE.bottom;
  const torso = await placeTorsoPair(
    top,
    bottom,
    c,
    msTop,
    msBottom,
    input.canvas.height
  );

  const placed: Placed[] = [];
  for (const kind of Z_BACK_TO_FRONT) {
    if (kind === "top") {
      placed.push(torso.top);
      continue;
    }
    if (kind === "bottom") {
      placed.push(torso.bottom);
      continue;
    }
    const p = kind === "face" ? face : shoes;
    const ms = maxSide?.[kind] ?? DEFAULT_MAX_SIDE[kind];
    placed.push(await placePart(p, kind, c, ms));
  }
  return placed;
}

/**
 * alpha PNG 네 장을 단일 캔버스에 anchor 기준으로 sharp composite.
 * bbox 자르기 없음 — trim은 투명 여백만 제거.
 */
export async function composeFittingMvp(
  input: CompositeMvpInput
): Promise<Buffer> {
  const placed = await placeAll(input);
  return composeCore(input, placed);
}

/** PNG + 각 레이어 앵커의 캔버스 좌표(디버그 오버레이) */
export async function composeFittingMvpWithPlacements(
  input: CompositeMvpInput
): Promise<CompositeMvpResult> {
  const placed = await placeAll(input);
  const png = await composeCore(input, placed);
  const parts: Record<PartKind, PartInput> = {
    face: input.face,
    top: input.top,
    bottom: input.bottom,
    shoes: input.shoes,
  };
  const placements: LayerPlacementDebug[] = placed.map((p) => ({
    kind: p.kind,
    left: p.left,
    top: p.top,
    width: p.w,
    height: p.h,
    points: debugPointsForLayer(p.kind, parts[p.kind].anchors, p.left, p.top, p.w, p.h),
  }));
  return { png, placements };
}

export function canvasFromSpec(spec: {
  width: number;
  height: number;
  transparentBackground?: boolean;
}): CanvasSpec {
  return {
    width: spec.width,
    height: spec.height,
    transparentBackground: spec.transparentBackground ?? true,
  };
}
