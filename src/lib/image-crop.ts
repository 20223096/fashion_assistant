import sharp from "sharp";
import type { BottomSubtype } from "@/types/models";

export type BBoxNormalized = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** bbox가 의미 있게 좁은 영역인지 (전체 사진 한 장만 찍힌 경우 제외) */
export function isUsableBbox(b: BBoxNormalized): boolean {
  const w = Math.abs(b.x_max - b.x_min);
  const h = Math.abs(b.y_max - b.y_min);
  if (w < 0.03 || h < 0.03) return false;
  if (w > 0.98 && h > 0.98) return false;
  return true;
}

type RefineInsets = {
  /** 좌우 각각 안쪽으로 줄일 비율(bbox width 대비). */
  x: number;
  /** 위쪽에서 줄일 비율. */
  top: number;
  /** 아래쪽에서 줄일 비율 — 긴바지는 바닥이 많이 섞여서 크게, 반바지·스커트는 하단이 이미 의류 끝이므로 작게. */
  bottom: number;
  /** 좌우 최대 절대 inset. */
  xCap?: number;
};

/**
 * subtype 별 refine 프로파일.
 * - 긴바지(pants)는 기존 규칙 유지(바닥이 많이 섞이므로 아래쪽을 크게 깎음).
 * - 반바지/스커트/테니스스커트는 하단에서 옷이 이미 끝나기 때문에 아래쪽 inset을 최소화.
 *   테니스스커트는 플리츠가 퍼지는 실루엣이라 좌우는 약간만.
 * 대응되는 카테고리가 아니면 default 를 사용.
 */
const REFINE_PROFILES: Record<BottomSubtype | "default", RefineInsets> = {
  pants: { x: 0.06, top: 0.045, bottom: 0.14, xCap: 0.035 },
  shorts: { x: 0.05, top: 0.05, bottom: 0.04, xCap: 0.03 },
  skirt: { x: 0.04, top: 0.05, bottom: 0.05, xCap: 0.03 },
  tennis_skirt: { x: 0.03, top: 0.05, bottom: 0.04, xCap: 0.025 },
  default: { x: 0.06, top: 0.045, bottom: 0.14, xCap: 0.035 },
};

/**
 * 모델 bbox가 넓게 잡혀 바닥·배경이 섞이는 경우를 줄이기 위해 안쪽으로 조입니다.
 * 긴바지 기준으로 아래쪽을 크게 깎지만, subtype 을 주면 반바지·스커트에 맞게 덜 깎습니다.
 */
export function refineBboxForGarmentCrop(
  b: BBoxNormalized,
  subtype?: BottomSubtype | null
): BBoxNormalized {
  let x_min = clamp01(b.x_min);
  let y_min = clamp01(b.y_min);
  let x_max = clamp01(b.x_max);
  let y_max = clamp01(b.y_max);
  if (x_max < x_min) [x_min, x_max] = [x_max, x_min];
  if (y_max < y_min) [y_min, y_max] = [y_max, y_min];

  const w = x_max - x_min;
  const h = y_max - y_min;
  if (w < 0.05 || h < 0.05) {
    return b;
  }

  const profile = REFINE_PROFILES[subtype ?? "default"] ?? REFINE_PROFILES.default;
  const insetX = Math.min(w * profile.x, profile.xCap ?? 0.035);
  const insetTop = h * profile.top;
  const insetBottom = h * profile.bottom;

  const nxMin = clamp01(x_min + insetX);
  const nxMax = clamp01(x_max - insetX);
  const nyMin = clamp01(y_min + insetTop);
  const nyMax = clamp01(y_max - insetBottom);

  if (nxMax - nxMin < 0.04 || nyMax - nyMin < 0.04) {
    return b;
  }

  return { x_min: nxMin, y_min: nyMin, x_max: nxMax, y_max: nyMax };
}

/**
 * 정규화 좌표(0~1)로 원본에서 해당 의류 영역만 잘라 JPEG 버퍼로 반환.
 */
export async function cropByNormalizedBBox(
  input: Buffer,
  bbox: BBoxNormalized,
  outFormat: "jpeg" | "png" = "jpeg"
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (!iw || !ih) {
    throw new Error("이미지 크기를 읽을 수 없습니다.");
  }

  let x0 = clamp01(bbox.x_min) * iw;
  let y0 = clamp01(bbox.y_min) * ih;
  let x1 = clamp01(bbox.x_max) * iw;
  let y1 = clamp01(bbox.y_max) * ih;

  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];

  let left = Math.floor(x0);
  let top = Math.floor(y0);
  let width = Math.ceil(x1 - x0);
  let height = Math.ceil(y1 - y0);

  const MIN = 40;
  width = Math.max(MIN, width);
  height = Math.max(MIN, height);

  left = Math.max(0, Math.min(left, iw - 1));
  top = Math.max(0, Math.min(top, ih - 1));
  width = Math.min(width, iw - left);
  height = Math.min(height, ih - top);

  if (width < MIN || height < MIN) {
    throw new Error("크롭 영역이 너무 작습니다.");
  }

  const extracted = sharp(input).extract({ left, top, width, height });
  if (outFormat === "png") {
    return extracted
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  }
  return extracted.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
