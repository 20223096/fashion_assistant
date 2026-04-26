import { promises as fs } from "node:fs";
import path from "node:path";
import {
  defaultAnchorsForPart,
} from "@/lib/fitting/anchors";
import {
  canvasFromSpec,
  composeFittingMvp,
  composeFittingMvpWithPlacements,
} from "@/lib/fitting/composite";
import { estimateAllAnchorsFromBuffers } from "@/lib/fitting/estimate-anchors";
import type {
  BottomAnchors,
  FaceAnchors,
  PartInput,
  PartKind,
  ShoesAnchors,
  TopAnchors,
} from "@/lib/fitting/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const faceAnchorsSchema = z.object({
  neckCenterX: z.number().min(0).max(1),
  neckCenterY: z.number().min(0).max(1),
});

const topAnchorsSchema = z.object({
  neckCenterX: z.number().min(0).max(1),
  neckCenterY: z.number().min(0).max(1),
  waistCenterX: z.number().min(0).max(1),
  waistCenterY: z.number().min(0).max(1),
});

const bottomAnchorsSchema = z.object({
  waistCenterX: z.number().min(0).max(1),
  waistCenterY: z.number().min(0).max(1),
  hemCenterX: z.number().min(0).max(1),
  hemCenterY: z.number().min(0).max(1),
});

const shoesAnchorsSchema = z.object({
  topCenterX: z.number().min(0).max(1),
  topCenterY: z.number().min(0).max(1),
});

const partB64Schema = z.object({
  pngBase64: z.string().min(8).optional(),
  anchors: z.unknown().optional(),
});

const bodySchema = z
  .object({
    width: z.number().int().min(256).max(2048).default(640),
    height: z.number().int().min(256).max(2048).default(1120),
    transparentBackground: z.boolean().default(true),
    /** true면 `public/fitting-samples/*.png` 로 즉시 테스트 */
    usePublicSamples: z.boolean().optional(),
    parts: z
      .object({
        face: partB64Schema.optional(),
        top: partB64Schema.optional(),
        bottom: partB64Schema.optional(),
        shoes: partB64Schema.optional(),
      })
      .optional(),
    maxSide: z
      .object({
        face: z.number().positive().optional(),
        top: z.number().positive().optional(),
        bottom: z.number().positive().optional(),
        shoes: z.number().positive().optional(),
      })
      .optional(),
    /** true면 JSON `{ imageBase64, placements }` — 미리보기 디버그용 */
    debug: z.boolean().optional(),
    /** true면 알파 실루엣 기반으로 anchors 무시하고 자동 추정 */
    autoAnchors: z.boolean().optional(),
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
        "`usePublicSamples`: true 이거나, `parts.face|top|bottom|shoes.pngBase64` 네 개를 모두 보내야 합니다.",
    }
  );

function samplesDir(): string {
  return path.join(process.cwd(), "public", "fitting-samples");
}

async function readSample(name: "face" | "top" | "bottom" | "shoes"): Promise<Buffer> {
  const p = path.join(samplesDir(), `${name}.png`);
  return fs.readFile(p);
}

function mergeFaceAnchors(v: unknown): FaceAnchors {
  const d = faceAnchorsSchema.safeParse(v);
  return d.success ? d.data : (defaultAnchorsForPart("face") as FaceAnchors);
}

function mergeTopAnchors(v: unknown): TopAnchors {
  const d = topAnchorsSchema.safeParse(v);
  return d.success ? d.data : (defaultAnchorsForPart("top") as TopAnchors);
}

function mergeBottomAnchors(v: unknown): BottomAnchors {
  const d = bottomAnchorsSchema.safeParse(v);
  return d.success ? d.data : (defaultAnchorsForPart("bottom") as BottomAnchors);
}

function mergeShoesAnchors(v: unknown): ShoesAnchors {
  const d = shoesAnchorsSchema.safeParse(v);
  return d.success ? d.data : (defaultAnchorsForPart("shoes") as ShoesAnchors);
}

function decodePart(
  kind: PartKind,
  b64: string | undefined,
  anchors: unknown,
  sampleBuf?: Buffer
): PartInput {
  const buf = sampleBuf ?? Buffer.from(b64!, "base64");
  switch (kind) {
    case "face":
      return { kind, buffer: buf, anchors: mergeFaceAnchors(anchors) };
    case "top":
      return { kind, buffer: buf, anchors: mergeTopAnchors(anchors) };
    case "bottom":
      return { kind, buffer: buf, anchors: mergeBottomAnchors(anchors) };
    case "shoes":
      return { kind, buffer: buf, anchors: mergeShoesAnchors(anchors) };
  }
}

async function loadPartBuffers(
  d: z.infer<typeof bodySchema>
): Promise<{ face: Buffer; top: Buffer; bottom: Buffer; shoes: Buffer }> {
  if (d.usePublicSamples) {
    const [face, top, bottom, shoes] = await Promise.all([
      readSample("face"),
      readSample("top"),
      readSample("bottom"),
      readSample("shoes"),
    ]);
    return { face, top, bottom, shoes };
  }
  const p = d.parts!;
  return {
    face: Buffer.from(p.face!.pngBase64!, "base64"),
    top: Buffer.from(p.top!.pngBase64!, "base64"),
    bottom: Buffer.from(p.bottom!.pngBase64!, "base64"),
    shoes: Buffer.from(p.shoes!.pngBase64!, "base64"),
  };
}

function partInput(
  kind: PartKind,
  buffer: Buffer,
  anchors: FaceAnchors | TopAnchors | BottomAnchors | ShoesAnchors
): PartInput {
  return { kind, buffer, anchors } as PartInput;
}

// TODO: 인증 + 본인 옷장 URL만 허용하는 프로덕션 모드
// TODO: segmentation 파이프라인에서 buffer·anchors 주입

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
    const bufs = await loadPartBuffers(d);

    let faceIn: PartInput;
    let topIn: PartInput;
    let bottomIn: PartInput;
    let shoesIn: PartInput;

    if (d.autoAnchors === true) {
      const est = await estimateAllAnchorsFromBuffers(bufs);
      faceIn = partInput("face", bufs.face, est.face);
      topIn = partInput("top", bufs.top, est.top);
      bottomIn = partInput("bottom", bufs.bottom, est.bottom);
      shoesIn = partInput("shoes", bufs.shoes, est.shoes);
    } else {
      const p = d.parts ?? {};
      if (d.usePublicSamples) {
        faceIn = decodePart("face", undefined, p.face?.anchors, bufs.face);
        topIn = decodePart("top", undefined, p.top?.anchors, bufs.top);
        bottomIn = decodePart("bottom", undefined, p.bottom?.anchors, bufs.bottom);
        shoesIn = decodePart("shoes", undefined, p.shoes?.anchors, bufs.shoes);
      } else {
        const q = d.parts!;
        faceIn = partInput("face", bufs.face, mergeFaceAnchors(q.face!.anchors));
        topIn = partInput("top", bufs.top, mergeTopAnchors(q.top!.anchors));
        bottomIn = partInput(
          "bottom",
          bufs.bottom,
          mergeBottomAnchors(q.bottom!.anchors)
        );
        shoesIn = partInput("shoes", bufs.shoes, mergeShoesAnchors(q.shoes!.anchors));
      }
    }

    const canvas = canvasFromSpec({
      width: d.width,
      height: d.height,
      transparentBackground: d.transparentBackground,
    });

    const input = {
      canvas,
      face: faceIn,
      top: topIn,
      bottom: bottomIn,
      shoes: shoesIn,
      maxSide: d.maxSide,
    };

    if (d.debug === true) {
      const { png, placements } = await composeFittingMvpWithPlacements(input);
      return NextResponse.json({
        imageBase64: png.toString("base64"),
        placements,
      });
    }

    const png = await composeFittingMvp(input);

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "composite failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
