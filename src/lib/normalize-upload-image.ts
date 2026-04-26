import sharp from "sharp";

/**
 * 업로드 이미지를 JPEG로 통일 (HEIC/방향/이상 MIME 완화).
 * Sharp가 실패하면 원본을 그대로 돌려 OpenAI·스토리지에 맡김.
 */
export async function normalizeUploadImage(input: Buffer): Promise<{
  buffer: Buffer;
  mimeType: string;
  usedSharp: boolean;
}> {
  try {
    const pipeline = sharp(input).rotate();
    const meta = await pipeline.metadata();
    if (meta.hasAlpha) {
      const out = await pipeline
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      return { buffer: out, mimeType: "image/png", usedSharp: true };
    }
    const out = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    return { buffer: out, mimeType: "image/jpeg", usedSharp: true };
  } catch (err) {
    console.warn("normalizeUploadImage: sharp failed, using original buffer", err);
    return { buffer: input, mimeType: "image/jpeg", usedSharp: false };
  }
}
