import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// --- 흰색 의류 감지 (alpha > GARMENT_ALPHA_STATS_MIN 인 픽셀만 통계) ---

/** 의류로 보고 통계에 넣을 최소 알파 */
export const GARMENT_ALPHA_STATS_MIN = 100;

/** 의류 픽셀 중 R,G,B 가 모두 이 값 이상이면 "밝은 흰 계열" 로 카운트 */
export const WHITE_RGB_COMPONENT_MIN = 218;

/** 밝은 흰 계열 비율이 이 이상이면 흰 의류로 간주 */
export const WHITE_RATIO_THRESHOLD = 0.3;

/** 평균 휘도(가중)가 이 이상이면 흰 의류 후보 강화 */
export const WHITE_MEAN_LUMA_MIN = 198;

/** 흰 의류 보조 조건: 평균 휘도 높을 때 요구하는 최소 white ratio */
export const WHITE_RATIO_SECONDARY = 0.18;

// --- 일반 / 흰색 알파 정리 (soft 픽셀 제거 + 경계 강화) ---

/** 일반: 이 알파 이하는 완전 투명 */
export const NORMAL_ALPHA_FLOOR = 30;

/** 일반: 이 알파 이상은 완전 불투명 */
export const NORMAL_ALPHA_CEIL = 200;

/** 흰 의류: 이 알파 이하는 완전 투명 (halo·반투명 잔광 제거) */
export const WHITE_ALPHA_FLOOR = 100;

/** 흰 의류: 이 알파 이상은 완전 불투명 */
export const WHITE_ALPHA_CEIL = 180;

// --- halo (밝은 배경 잔여) ---

/** 거의 흰색으로 보는 RGB 하한 */
export const HALO_RGB_MIN = 235;

/** halo 로 보고 지울 때: 알파가 이 미만이면 제거 (권장 180 미만) */
export const HALO_ALPHA_MAX = 179;

/** 거의 흰 배경이지만 RGB가 235에 못 미치는 잔광 (상의·아우터 경계) */
export const HALO2_RGB_MIN = 220;

/** HALO2 + 이 미만 알파면 제거 */
export const HALO2_ALPHA_MAX = 195;

// --- 상의/아우터: 머리·얼굴 위 겹침 시 보이는 “밝은 반투명 막” 제거 ---

/** 상의 전용: 채도(max−min)가 낮고 밝으며 알파가 낮으면 배경 경계로 간주 */
export const TOP_FRINGE_SAT_MAX = 34;

export const TOP_FRINGE_LUMA_MIN = 176;

export const TOP_FRINGE_RGB_MIN = 186;

/** 상의 전용: 이 알파 이하는 완전 투명 (일반보다 조금 강함) */
export const TOP_ALPHA_FLOOR = 48;

/** 상의 전용: 이 알파 이상은 불투명 */
export const TOP_ALPHA_CEIL = 198;

/** 상의 soft fringe: 알파 상한 (너무 불투명한 본체는 유지) */
export const TOP_FRINGE_ALPHA_MAX = 158;

export type WhiteGarmentStats = {
  garmentPixelCount: number;
  brightWhiteCount: number;
  whiteRatio: number;
  meanLuma: number;
  meanR: number;
  meanG: number;
  meanB: number;
};

export type CleanCutoutResult = {
  buffer: Buffer;
  isWhiteGarment: boolean;
  stats: WhiteGarmentStats;
};

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * alpha > GARMENT_ALPHA_STATS_MIN 인 픽셀만 "의류"로 보고
 * 평균 밝기·밝은 흰 비율로 흰색 의류 여부를 판단합니다.
 */
export function detectWhiteGarmentFromRgba(
  data: Uint8Array,
  width: number,
  height: number
): { isWhiteGarment: boolean; stats: WhiteGarmentStats } {
  let garmentPixelCount = 0;
  let brightWhiteCount = 0;
  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const a = data[o + 3] ?? 0;
    if (a <= GARMENT_ALPHA_STATS_MIN) continue;

    garmentPixelCount++;
    const r = data[o] ?? 0;
    const g = data[o + 1] ?? 0;
    const b = data[o + 2] ?? 0;
    sumL += luma(r, g, b);
    sumR += r;
    sumG += g;
    sumB += b;

    if (
      r >= WHITE_RGB_COMPONENT_MIN &&
      g >= WHITE_RGB_COMPONENT_MIN &&
      b >= WHITE_RGB_COMPONENT_MIN
    ) {
      brightWhiteCount++;
    }
  }

  if (garmentPixelCount < 40) {
    const stats: WhiteGarmentStats = {
      garmentPixelCount,
      brightWhiteCount,
      whiteRatio: 0,
      meanLuma: 0,
      meanR: 0,
      meanG: 0,
      meanB: 0,
    };
    return { isWhiteGarment: false, stats };
  }

  const whiteRatio = brightWhiteCount / garmentPixelCount;
  const meanLuma = sumL / garmentPixelCount;
  const meanR = sumR / garmentPixelCount;
  const meanG = sumG / garmentPixelCount;
  const meanB = sumB / garmentPixelCount;

  const stats: WhiteGarmentStats = {
    garmentPixelCount,
    brightWhiteCount,
    whiteRatio,
    meanLuma,
    meanR,
    meanG,
    meanB,
  };

  const isWhiteGarment =
    whiteRatio >= WHITE_RATIO_THRESHOLD ||
    (meanLuma >= WHITE_MEAN_LUMA_MIN && whiteRatio >= WHITE_RATIO_SECONDARY);

  return { isWhiteGarment, stats };
}

function isTopLikeCategory(category: string | undefined): boolean {
  return category === "상의" || category === "아우터";
}

/**
 * 일반: alpha < 30 → 0, alpha > 200 → 255, 그 사이는 선형 확장.
 * 흰 의류: alpha < 100 → 0, alpha > 180 → 255, 그 사이는 선형 확장.
 * 상의·아우터(흰 의류 아님): 경계 막 제거를 위해 floor/ceil 조금 강화.
 */
function remapAlphaChannel(
  a: number,
  isWhiteGarment: boolean,
  topLike: boolean
): number {
  if (isWhiteGarment) {
    if (a < WHITE_ALPHA_FLOOR) return 0;
    if (a > WHITE_ALPHA_CEIL) return 255;
    const span = WHITE_ALPHA_CEIL - WHITE_ALPHA_FLOOR;
    return Math.round(((a - WHITE_ALPHA_FLOOR) / span) * 255);
  }
  if (topLike) {
    if (a < TOP_ALPHA_FLOOR) return 0;
    if (a > TOP_ALPHA_CEIL) return 255;
    const span = TOP_ALPHA_CEIL - TOP_ALPHA_FLOOR;
    return Math.round(((a - TOP_ALPHA_FLOOR) / span) * 255);
  }
  if (a < NORMAL_ALPHA_FLOOR) return 0;
  if (a > NORMAL_ALPHA_CEIL) return 255;
  const span = NORMAL_ALPHA_CEIL - NORMAL_ALPHA_FLOOR;
  return Math.round(((a - NORMAL_ALPHA_FLOOR) / span) * 255);
}

/** 상의 어깨~목선 부근의 반투명 밝은 잔광(저채도) 제거 */
function killTopSoftFringe(
  r: number,
  g: number,
  b: number,
  a: number
): boolean {
  if (a <= 0 || a > TOP_FRINGE_ALPHA_MAX) return false;
  const minc = Math.min(r, g, b);
  if (minc < TOP_FRINGE_RGB_MIN) return false;
  const maxc = Math.max(r, g, b);
  const sat = maxc - minc;
  if (sat > TOP_FRINGE_SAT_MAX) return false;
  return luma(r, g, b) >= TOP_FRINGE_LUMA_MIN;
}

/**
 * 배경 제거 직후 PNG 에 대해:
 * 1) 흰 의류 감지
 * 2) halo 픽셀(R,G,B 높고 알파 낮음) 제거
 * 3) 일반 vs 흰 의류에 다른 알파 floor/ceil 로 정리
 *
 * `DEBUG_GARMENT_CUTOUT=1` 또는 `SAVE_CUTOUT_DEBUG=1` 이면
 * `tmp/cutout-debug/<debugId>/` 에 original_cutout.png, cleaned_cutout.png 저장.
 */
export async function cleanGarmentCutoutAlpha(
  inputPng: Buffer,
  options?: {
    /** 디렉터리 이름에 쓸 식별자 (없으면 랜덤) */
    debugId?: string;
    /** 로그용 */
    category?: string;
  }
): Promise<CleanCutoutResult> {
  const { data, info } = await sharp(inputPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  if (channels < 4) {
    return {
      buffer: inputPng,
      isWhiteGarment: false,
      stats: {
        garmentPixelCount: 0,
        brightWhiteCount: 0,
        whiteRatio: 0,
        meanLuma: 0,
        meanR: 0,
        meanG: 0,
        meanB: 0,
      },
    };
  }

  const copy = new Uint8Array(data);
  const { isWhiteGarment, stats } = detectWhiteGarmentFromRgba(
    copy,
    width,
    height
  );

  const topLike = isTopLikeCategory(options?.category);
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = copy[o] ?? 0;
    let g = copy[o + 1] ?? 0;
    let b = copy[o + 2] ?? 0;
    let a = copy[o + 3] ?? 0;

    // halo 1: 거의 순백 + 반투명
    if (
      r > HALO_RGB_MIN &&
      g > HALO_RGB_MIN &&
      b > HALO_RGB_MIN &&
      a < 180
    ) {
      r = 0;
      g = 0;
      b = 0;
      a = 0;
    } else if (
      // halo 2: 상의·흰옷 위주 — 밝은 회색 배경이 남긴 220~235 구간 잔광
      (topLike || isWhiteGarment) &&
      r > HALO2_RGB_MIN &&
      g > HALO2_RGB_MIN &&
      b > HALO2_RGB_MIN &&
      a > 0 &&
      a <= HALO2_ALPHA_MAX
    ) {
      r = 0;
      g = 0;
      b = 0;
      a = 0;
    } else if (topLike && killTopSoftFringe(r, g, b, a)) {
      r = 0;
      g = 0;
      b = 0;
      a = 0;
    } else {
      a = remapAlphaChannel(a, isWhiteGarment, topLike);
      if (a === 0) {
        r = 0;
        g = 0;
        b = 0;
      }
    }

    copy[o] = r;
    copy[o + 1] = g;
    copy[o + 2] = b;
    copy[o + 3] = a;
  }

  const buffer = await sharp(Buffer.from(copy), {
    raw: { width, height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const saveDebug =
    process.env.DEBUG_GARMENT_CUTOUT === "1" ||
    process.env.SAVE_CUTOUT_DEBUG === "1";

  if (saveDebug) {
    const id =
      options?.debugId?.replace(/[^a-zA-Z0-9_-]/g, "") ||
      `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const dir = path.join(process.cwd(), "tmp", "cutout-debug", id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "original_cutout.png"), inputPng);
    await writeFile(path.join(dir, "cleaned_cutout.png"), buffer);
    if (options?.category) {
      await writeFile(
        path.join(dir, "meta.txt"),
        `category=${options.category}\nisWhiteGarment=${isWhiteGarment}\nwhiteRatio=${stats.whiteRatio.toFixed(4)}\nmeanLuma=${stats.meanLuma.toFixed(2)}\n`,
        "utf8"
      );
    }
  }

  if (isWhiteGarment) {
    console.info(
      `[garment-alpha-clean] white garment alpha cleanup category=${options?.category ?? "?"} whiteRatio=${stats.whiteRatio.toFixed(3)} meanLuma=${stats.meanLuma.toFixed(1)}`
    );
  }

  return { buffer, isWhiteGarment, stats };
}
