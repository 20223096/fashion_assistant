import type { AlphaShapeMetrics } from "./alpha-shape";
import { measureAlphaShapeFromBuffer } from "./alpha-shape";
import type {
  BottomAnchors,
  FaceAnchors,
  PartKind,
  ShoesAnchors,
  TopAnchors,
} from "./types";

/** 0~1 클램프 (앵커가 가장자리에 붙지 않게) */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(0.98, Math.max(0.02, n));
}

function normX(m: AlphaShapeMetrics, px: number): number {
  return clamp01(px / Math.max(1, m.imageWidth));
}

function normY(m: AlphaShapeMetrics, py: number): number {
  return clamp01(py / Math.max(1, m.imageHeight));
}

/**
 * 얼굴/머리: 무게중심 X, 실루엣 하단 근처를 목으로 가정.
 * TODO: pose / face landmark 로 neck 좌표 교체.
 */
export function estimateFaceAnchorsFromAlphaShape(
  m: AlphaShapeMetrics
): FaceAnchors {
  const bh = m.maxY - m.minY + 1;
  const neckY = m.maxY - 0.06 * bh;
  return {
    neckCenterX: normX(m, m.centroidX),
    neckCenterY: normY(m, neckY),
  };
}

/**
 * 상의: bbox 상단 근처 = 넥라인, 하단 근처 = 허리.
 * TODO: keypoint / segmentation neckline·hem.
 */
export function estimateTopAnchorsFromAlphaShape(
  m: AlphaShapeMetrics
): TopAnchors {
  const bh = m.maxY - m.minY + 1;
  const cx = (m.minX + m.maxX + 1) / 2;
  const blendX = 0.55 * m.centroidX + 0.45 * cx;
  const neckY = m.minY + 0.11 * bh;
  const waistY = m.minY + 0.86 * bh;
  const nx = normX(m, blendX);
  return {
    neckCenterX: nx,
    neckCenterY: normY(m, neckY),
    waistCenterX: nx,
    waistCenterY: normY(m, waistY),
  };
}

/**
 * 하의: bbox 위 = 허리밴드, 아래 = 밑단.
 * TODO: 세그 허리/밑단 키포인트.
 */
export function estimateBottomAnchorsFromAlphaShape(
  m: AlphaShapeMetrics
): BottomAnchors {
  const bh = m.maxY - m.minY + 1;
  const cx = (m.minX + m.maxX + 1) / 2;
  const blendX = 0.55 * m.centroidX + 0.45 * cx;
  const waistY = m.minY + 0.09 * bh;
  const hemY = m.maxY - 0.05 * bh;
  const wx = normX(m, blendX);
  return {
    waistCenterX: wx,
    waistCenterY: normY(m, waistY),
    hemCenterX: wx,
    hemCenterY: normY(m, hemY),
  };
}

/**
 * 신발: 실루엣 위쪽 중앙을 발등/입구 쪽으로 가정.
 * TODO: left/right shoe 분리 키포인트.
 */
export function estimateShoesAnchorsFromAlphaShape(
  m: AlphaShapeMetrics
): ShoesAnchors {
  const bh = m.maxY - m.minY + 1;
  const cx = (m.minX + m.maxX + 1) / 2;
  const blendX = 0.5 * m.centroidX + 0.5 * cx;
  const topY = m.minY + 0.2 * bh;
  return {
    topCenterX: normX(m, blendX),
    topCenterY: normY(m, topY),
  };
}

export function estimateAnchorsFromAlphaShape(
  kind: PartKind,
  m: AlphaShapeMetrics
): FaceAnchors | TopAnchors | BottomAnchors | ShoesAnchors {
  switch (kind) {
    case "face":
      return estimateFaceAnchorsFromAlphaShape(m);
    case "top":
      return estimateTopAnchorsFromAlphaShape(m);
    case "bottom":
      return estimateBottomAnchorsFromAlphaShape(m);
    case "shoes":
      return estimateShoesAnchorsFromAlphaShape(m);
    default:
      return estimateTopAnchorsFromAlphaShape(m);
  }
}

/** PNG 버퍼 한 장에서 트림 후 알파 실루엣 기반 앵커 추정 */
export async function estimateAnchorsForPart(
  kind: PartKind,
  pngBuffer: Buffer
): Promise<FaceAnchors | TopAnchors | BottomAnchors | ShoesAnchors> {
  const m = await measureAlphaShapeFromBuffer(pngBuffer);
  return estimateAnchorsFromAlphaShape(kind, m);
}

export type EstimatedAnchorsBundle = {
  face: FaceAnchors;
  top: TopAnchors;
  bottom: BottomAnchors;
  shoes: ShoesAnchors;
};

export async function estimateAllAnchorsFromBuffers(input: {
  face: Buffer;
  top: Buffer;
  bottom: Buffer;
  shoes: Buffer;
}): Promise<EstimatedAnchorsBundle> {
  const [face, top, bottom, shoes] = await Promise.all([
    estimateAnchorsForPart("face", input.face),
    estimateAnchorsForPart("top", input.top),
    estimateAnchorsForPart("bottom", input.bottom),
    estimateAnchorsForPart("shoes", input.shoes),
  ]);
  return {
    face: face as FaceAnchors,
    top: top as TopAnchors,
    bottom: bottom as BottomAnchors,
    shoes: shoes as ShoesAnchors,
  };
}
