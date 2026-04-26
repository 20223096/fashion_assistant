import sharp from "sharp";

type Rgb = { r: number; g: number; b: number };

function dist(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function average(points: Rgb[]): Rgb {
  const n = Math.max(1, points.length);
  return points.reduce(
    (acc, p) => ({ r: acc.r + p.r / n, g: acc.g + p.g / n, b: acc.b + p.b / n }),
    { r: 0, g: 0, b: 0 }
  );
}

function cornerSamples(
  rgba: Uint8Array,
  width: number,
  height: number,
  patch = 12
): Rgb[] {
  const out: Rgb[] = [];
  const boxes = [
    { x0: 0, y0: 0 },
    { x0: Math.max(0, width - patch), y0: 0 },
    { x0: 0, y0: Math.max(0, height - patch) },
    { x0: Math.max(0, width - patch), y0: Math.max(0, height - patch) },
  ];
  for (const { x0, y0 } of boxes) {
    for (let y = y0; y < Math.min(height, y0 + patch); y++) {
      for (let x = x0; x < Math.min(width, x0 + patch); x++) {
        const i = (y * width + x) * 4;
        out.push({ r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0, b: rgba[i + 2] ?? 0 });
      }
    }
  }
  return out;
}

/**
 * 배경이 비교적 단색/균일한 의류 이미지를 투명 PNG로 정리합니다.
 * 배경이 복잡하면 null을 반환해 원본을 그대로 사용합니다.
 */
export async function tryCutoutGarmentByBgColor(
  input: Buffer,
  category?: string
): Promise<Buffer | null> {
  const raw = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = raw.info.width;
  const height = raw.info.height;
  const rgba = new Uint8Array(raw.data);
  const channels = raw.info.channels;

  // 이미 투명 배경(알파 포함)이라면 색 보정/투명화 재처리하지 않음.
  if (channels >= 4) {
    let transparentPixels = 0;
    const total = width * height;
    for (let i = 0; i < total; i++) {
      const a = rgba[i * 4 + 3] ?? 255;
      if (a < 250) transparentPixels++;
    }
    if (transparentPixels / Math.max(1, total) > 0.01) {
      return null;
    }
  }

  const corners = cornerSamples(rgba, width, height, Math.max(10, Math.floor(width * 0.04)));
  const bg = average(corners);
  const variance =
    corners.reduce((s, c) => s + dist(c, bg), 0) / Math.max(1, corners.length);

  const isTopLike =
    category === "상의" || category === "아우터" || category === "원피스";
  // 상의 계열은 배경 분리를 조금 더 공격적으로 허용
  const varianceLimit = isTopLike ? 42 : 28;
  // 코너 색이 제각각이면 배경이 복잡한 것으로 판단하고 패스
  if (variance > varianceLimit) return null;

  let strongRemoved = 0;
  let softRemoved = 0;
  const total = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = { r: rgba[i] ?? 0, g: rgba[i + 1] ?? 0, b: rgba[i + 2] ?? 0 };
      const d = dist(c, bg);
      const strong = isTopLike ? 24 : 18;
      const soft = isTopLike ? 58 : 42;
      if (d <= strong) {
        rgba[i + 3] = 0;
        strongRemoved++;
      } else if (d < soft) {
        const t = (d - strong) / (soft - strong);
        rgba[i + 3] = Math.round((rgba[i + 3] ?? 255) * t);
        softRemoved++;
      }
    }
  }

  const removedRatio = (strongRemoved + softRemoved) / Math.max(1, total);
  // 제거율이 너무 낮으면 배경 분리 의미가 적어서 패스
  const minRemoved = isTopLike ? 0.03 : 0.06;
  if (removedRatio < minRemoved) return null;

  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 6 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

