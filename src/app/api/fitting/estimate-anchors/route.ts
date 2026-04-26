import { promises as fs } from "node:fs";
import path from "node:path";
import { estimateAllAnchorsFromBuffers } from "@/lib/fitting/estimate-anchors";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const partB64Schema = z.object({
  pngBase64: z.string().min(8).optional(),
});

const bodySchema = z
  .object({
    usePublicSamples: z.boolean().optional(),
    parts: z
      .object({
        face: partB64Schema.optional(),
        top: partB64Schema.optional(),
        bottom: partB64Schema.optional(),
        shoes: partB64Schema.optional(),
      })
      .optional(),
  })
  .refine(
    (d) =>
      d.usePublicSamples === true ||
      Boolean(
        d.parts?.face?.pngBase64 &&
          d.parts?.top?.pngBase64 &&
          d.parts?.bottom?.pngBase64 &&
          d.parts?.shoes?.pngBase64
      ),
    {
      message:
        "`usePublicSamples`: true 이거나 네 파츠의 `pngBase64`가 모두 필요합니다.",
    }
  );

function samplesDir(): string {
  return path.join(process.cwd(), "public", "fitting-samples");
}

async function readSample(name: "face" | "top" | "bottom" | "shoes"): Promise<Buffer> {
  return fs.readFile(path.join(samplesDir(), `${name}.png`));
}

// TODO: SAM / pose 파이프라인에서 동일 엔드포인트로 대체 가능

export async function POST(request: Request) {
  try {
    const json = (await request.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Bad Request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const d = parsed.data;
    let face: Buffer;
    let top: Buffer;
    let bottom: Buffer;
    let shoes: Buffer;

    if (d.usePublicSamples) {
      [face, top, bottom, shoes] = await Promise.all([
        readSample("face"),
        readSample("top"),
        readSample("bottom"),
        readSample("shoes"),
      ]);
    } else {
      const p = d.parts!;
      face = Buffer.from(p.face!.pngBase64!, "base64");
      top = Buffer.from(p.top!.pngBase64!, "base64");
      bottom = Buffer.from(p.bottom!.pngBase64!, "base64");
      shoes = Buffer.from(p.shoes!.pngBase64!, "base64");
    }

    const anchors = await estimateAllAnchorsFromBuffers({
      face,
      top,
      bottom,
      shoes,
    });

    return NextResponse.json({ anchors });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "estimate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
