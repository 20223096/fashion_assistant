import sharp from "sharp";

/**
 * 트림된 RGBA 이미지에서 알파가 의미 있는 영역의 bbox·무게중심.
 * TODO: SAM 등으로 실루엣 마스크를 받아 이 함수 입력 전에 대체 가능.
 */
export type AlphaShapeMetrics = {
  imageWidth: number;
  imageHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** 알파 가중 무게중심 (픽셀) */
  centroidX: number;
  centroidY: number;
};

const ALPHA_THRESH = 12;

/** 투명 바깥 제거 후 알파 통계 — 합성 파이프라인과 동일한 trim 느낌 */
export async function trimForAlphaMeasure(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function measureAlphaShapeFromBuffer(
  input: Buffer
): Promise<AlphaShapeMetrics> {
  const trimmed = await trimForAlphaMeasure(input);
  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const rgba = new Uint8Array(data);
  const channels = info.channels;

  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  let wSum = 0;
  let wx = 0;
  let wy = 0;

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const i = (row + x) * channels;
      const a = rgba[i + 3] ?? 0;
      if (a <= ALPHA_THRESH) continue;
      const w = a / 255;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      wSum += w;
      wx += w * x;
      wy += w * y;
    }
  }

  if (wSum < 1e-6 || maxX < 0) {
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;
    return {
      imageWidth: W,
      imageHeight: H,
      minX: 0,
      minY: 0,
      maxX: W - 1,
      maxY: H - 1,
      centroidX: cx,
      centroidY: cy,
    };
  }

  return {
    imageWidth: W,
    imageHeight: H,
    minX,
    minY,
    maxX,
    maxY,
    centroidX: wx / wSum,
    centroidY: wy / wSum,
  };
}
