import { promises as fs } from "node:fs";
import path from "node:path";
import { removeFlatStudioBg } from "@/lib/studio-bg-removal";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function defaultFaceSourcePath(): string {
  return path.join(process.cwd(), "public", "avatar", "face-source.png");
}

let faceCache: { absPath: string; mtimeMs: number; buffer: Buffer } | null =
  null;

async function loadProcessedFace(absPath: string): Promise<Buffer> {
  const st = await fs.stat(absPath);
  if (
    faceCache &&
    faceCache.absPath === absPath &&
    faceCache.mtimeMs === st.mtimeMs
  ) {
    return faceCache.buffer;
  }
  const raw = await fs.readFile(absPath);
  const out = await removeFlatStudioBg(raw);
  faceCache = { absPath, mtimeMs: st.mtimeMs, buffer: out };
  return out;
}

export async function GET() {
  const src = process.env.AVATAR_FACE_SOURCE_PATH?.trim();
  const absPath = src ? path.resolve(src) : defaultFaceSourcePath();
  try {
    const out = await loadProcessedFace(absPath);

    return new NextResponse(new Uint8Array(out), {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "face image not found" },
      { status: 404 }
    );
  }
}
