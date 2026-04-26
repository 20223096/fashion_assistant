import sharp from "sharp";

function avgRgb(
  rgba: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number
): { r: number; g: number; b: number } {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4;
      sr += rgba[i] ?? 0;
      sg += rgba[i + 1] ?? 0;
      sb += rgba[i + 2] ?? 0;
      n++;
    }
  }
  const d = Math.max(1, n);
  return { r: sr / d, g: sg / d, b: sb / d };
}

function colorDist(
  r: number,
  g: number,
  b: number,
  t: { r: number; g: number; b: number }
): number {
  const dr = r - t.r;
  const dg = g - t.g;
  const db = b - t.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** 단색/스튜디오형 배경을 알파로 흡수 — 얼굴 PNG 전처리용 */
export async function removeFlatStudioBg(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8Array(data);
  const width = info.width;
  const height = info.height;

  const patchW = Math.max(12, Math.floor(width * 0.08));
  const patchH = Math.max(12, Math.floor(height * 0.08));
  const tl = avgRgb(rgba, width, 0, 0, patchW, patchH);
  const tr = avgRgb(rgba, width, width - patchW, 0, patchW, patchH);
  const target = {
    r: (tl.r + tr.r) / 2,
    g: (tl.g + tr.g) / 2,
    b: (tl.b + tr.b) / 2,
  };

  for (let y = 0; y < height; y++) {
    const topWeight = 1 - y / Math.max(1, height - 1);
    const strict = 22 + topWeight * 26;
    const loose = 42 + topWeight * 20;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      const d = colorDist(r, g, b, target);
      if (d < strict) {
        rgba[i + 3] = 0;
      } else if (d < loose) {
        const t = (d - strict) / Math.max(1, loose - strict);
        rgba[i + 3] = Math.round((rgba[i + 3] ?? 255) * t);
      }
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}
