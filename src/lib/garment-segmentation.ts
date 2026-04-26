import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

type SegmentResult = {
  buffer: Buffer;
  mimeType: "image/png";
  /** 이미지 자체에 적용한 회전값(시계 방향, 도) */
  appliedRotationDeg: number;
};

function normalizeDeg(d: number): number {
  let out = d % 360;
  if (out > 180) out -= 360;
  if (out < -180) out += 360;
  return out;
}

/** 알파 마스크 2차 모멘트로 주축(major axis) 각도 추정 */
function estimatePrincipalAxisDeg(
  alpha: Uint8Array,
  width: number,
  height: number
): { angleDeg: number; confidence: number } {
  let m00 = 0;
  let m10 = 0;
  let m01 = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const w = alpha[row + x] / 255;
      if (w < 0.08) continue;
      m00 += w;
      m10 += w * x;
      m01 += w * y;
    }
  }
  if (m00 < 12) return { angleDeg: 0, confidence: 0 };

  const cx = m10 / m00;
  const cy = m01 / m00;

  let mu20 = 0;
  let mu02 = 0;
  let mu11 = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const w = alpha[row + x] / 255;
      if (w < 0.08) continue;
      const dx = x - cx;
      const dy = y - cy;
      mu20 += w * dx * dx;
      mu02 += w * dy * dy;
      mu11 += w * dx * dy;
    }
  }

  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  const trace = mu20 + mu02;
  const det = mu20 * mu02 - mu11 * mu11;
  const disc = Math.max(0, trace * trace - 4 * det);
  const l1 = (trace + Math.sqrt(disc)) / 2;
  const l2 = (trace - Math.sqrt(disc)) / 2;
  const ratio = l2 > 1e-6 ? l1 / l2 : 99;
  const confidence = Math.min(1, Math.max(0, (ratio - 1) / 6));

  return { angleDeg: (theta * 180) / Math.PI, confidence };
}

function chooseRotationDeg(params: {
  category: string;
  principalAxisDeg: number;
  confidence: number;
  fallbackDeg?: number;
}): number {
  const { category, principalAxisDeg, confidence, fallbackDeg } = params;
  const isVerticalGarment =
    category === "상의" ||
    category === "하의" ||
    category === "아우터" ||
    category === "원피스";

  if (!isVerticalGarment) {
    return normalizeDeg(fallbackDeg ?? 0);
  }

  // x축 기준 각도를 y축(90도) 방향으로 세움: rot = 90 - axis
  const byMask = normalizeDeg(90 - principalAxisDeg);
  const snapped = Math.round(byMask / 15) * 15;
  const maskRot = normalizeDeg(snapped);

  if (confidence < 0.22 && typeof fallbackDeg === "number") {
    return normalizeDeg(Math.round(fallbackDeg / 15) * 15);
  }
  return maskRot;
}

function alphaStats(alpha: Uint8Array): {
  coverage: number;
  strongCoverage: number;
  meanAlpha: number;
} {
  let nonZero = 0;
  let strong = 0;
  let sum = 0;
  for (const a of alpha) {
    if (a > 0) nonZero++;
    if (a >= 24) strong++;
    sum += a;
  }
  const total = Math.max(1, alpha.length);
  return {
    coverage: nonZero / total,
    strongCoverage: strong / total,
    meanAlpha: sum / (255 * total),
  };
}

/**
 * AI 모델로 배경만 제거한 PNG 버퍼를 반환합니다. 회전은 건드리지 않습니다.
 * 마스크가 너무 약하면(대부분 투명) Error 를 던집니다 — 호출부에서 fallback 하세요.
 */
export async function removeGarmentBackground(input: Buffer): Promise<Buffer> {
  const stablePng = await sharp(input)
    .rotate()
    .png({ compressionLevel: 9 })
    .toBuffer();

  let segmentedBlob: Blob;
  try {
    segmentedBlob = await removeBackground(
      new Blob([new Uint8Array(stablePng)], { type: "image/png" }),
      {
        model: "medium",
        output: { format: "image/png", quality: 0.9 },
      }
    );
  } catch (firstErr) {
    const message = firstErr instanceof Error ? firstErr.message : "";
    if (!message.toLowerCase().includes("unsupported format")) {
      throw firstErr;
    }
    segmentedBlob = await removeBackground(new Uint8Array(stablePng), {
      model: "medium",
      output: { format: "image/png", quality: 0.9 },
    });
  }
  const segmentedBuf = Buffer.from(await segmentedBlob.arrayBuffer());

  const alphaRaw = await sharp(segmentedBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = alphaRaw.info.width;
  const height = alphaRaw.info.height;
  const channels = alphaRaw.info.channels;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = alphaRaw.data[i * channels + 3] ?? 0;
  }

  const stats = alphaStats(alpha);
  if (stats.strongCoverage < 0.015 || stats.meanAlpha < 0.02) {
    throw new Error(
      `segmentation mask too weak (coverage=${stats.coverage.toFixed(4)}, strong=${stats.strongCoverage.toFixed(4)}, mean=${stats.meanAlpha.toFixed(4)})`
    );
  }

  return sharp(segmentedBuf)
    .trim({ threshold: 8 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export async function segmentAndNormalizeGarment(params: {
  input: Buffer;
  category: string;
  fallbackRotationDeg?: number;
}): Promise<SegmentResult> {
  // 일부 환경에서 raw/JPEG 버퍼를 Unsupported format으로 거부하는 경우가 있어
  // 먼저 표준 PNG로 재인코딩한 뒤 Blob으로 전달합니다.
  const stablePng = await sharp(params.input)
    .rotate()
    .png({ compressionLevel: 9 })
    .toBuffer();

  let segmentedBlob: Blob;
  try {
    segmentedBlob = await removeBackground(
      new Blob([new Uint8Array(stablePng)], { type: "image/png" }),
      {
        model: "medium",
        output: { format: "image/png", quality: 0.9 },
      }
    );
  } catch (firstErr) {
    const message = firstErr instanceof Error ? firstErr.message : "";
    if (!message.toLowerCase().includes("unsupported format")) {
      throw firstErr;
    }
    // 런타임별 Blob 처리 차이 방어: Uint8Array로 한 번 더 시도
    segmentedBlob = await removeBackground(new Uint8Array(stablePng), {
      model: "medium",
      output: { format: "image/png", quality: 0.9 },
    });
  }
  const segmentedBuf = Buffer.from(await segmentedBlob.arrayBuffer());

  const alphaRaw = await sharp(segmentedBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = alphaRaw.info.width;
  const height = alphaRaw.info.height;
  const channels = alphaRaw.info.channels;

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = alphaRaw.data[i * channels + 3] ?? 0;
  }

  const stats = alphaStats(alpha);
  // 흰 바지/밝은 옷에서 모델이 거의 전부를 투명하게 날리는 케이스 방어
  if (stats.strongCoverage < 0.015 || stats.meanAlpha < 0.02) {
    throw new Error(
      `segmentation mask too weak (coverage=${stats.coverage.toFixed(4)}, strong=${stats.strongCoverage.toFixed(4)}, mean=${stats.meanAlpha.toFixed(4)})`
    );
  }

  const { angleDeg, confidence } = estimatePrincipalAxisDeg(alpha, width, height);
  const rotateDeg = chooseRotationDeg({
    category: params.category,
    principalAxisDeg: angleDeg,
    confidence,
    fallbackDeg: params.fallbackRotationDeg,
  });

  const out = await sharp(segmentedBuf)
    .rotate(rotateDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .trim({ threshold: 8 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return { buffer: out, mimeType: "image/png", appliedRotationDeg: rotateDeg };
}
