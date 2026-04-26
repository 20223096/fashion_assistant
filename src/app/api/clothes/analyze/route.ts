import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import { getClosetStorageOperator } from "@/lib/supabase/closet-storage";
import { ensureClosetImagesBucket } from "@/lib/supabase/ensure-closet-bucket";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cropByNormalizedBBox,
  isUsableBbox,
  refineBboxForGarmentCrop,
} from "@/lib/image-crop";
import { tryCutoutGarmentByBgColor } from "@/lib/garment-cutout";
import { cleanGarmentCutoutAlpha } from "@/lib/garment-alpha-clean";
import { removeGarmentBackground } from "@/lib/garment-segmentation";
import { normalizeUploadImage } from "@/lib/normalize-upload-image";
import { analyzeClothingImageBase64 } from "@/lib/vision";
import type { VisionItem } from "@/lib/vision";
import type { ClothesRow } from "@/types/models";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Vercel 서버리스는 요청 본문이 약 4.5MB 제한인 경우가 많음 */
const MAX_BYTES = process.env.VERCEL
  ? 4 * 1024 * 1024
  : 12 * 1024 * 1024;
const MAX_FILES = 12;

function rowFromItem(
  userId: string,
  publicUrl: string,
  item: VisionItem,
  fittingRotationDeg: number
): Omit<ClothesRow, "id" | "created_at"> {
  return {
    user_id: userId,
    image_url: publicUrl,
    category: item.category,
    style_tags: item.style_tags,
    season: item.season,
    colors: item.colors,
    features: item.features,
    fitting_rotation_deg: fittingRotationDeg,
    // 하의일 때만 subtype 저장. 그 외 카테고리는 null 로 명시해 DB 체크 제약 만족.
    bottom_subtype: item.category === "하의" ? (item.bottom_subtype ?? "pants") : null,
  };
}

async function analyzeAndInsertOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File
): Promise<ClothesRow[]> {
  const storage = getClosetStorageOperator(supabase as unknown as SupabaseClient);
  const mimeType = file.type || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }

  let buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    const mb = Math.round(MAX_BYTES / (1024 * 1024));
    throw new Error(
      `파일이 너무 큽니다. ${mb}MB 이하로 줄이거나, ${process.env.VERCEL ? "로컬(npm run dev)에서 시도해 보세요." : "용량을 줄여 주세요."}`
    );
  }

  const normalized = await normalizeUploadImage(buf);
  buf = Buffer.from(normalized.buffer);
  const visionMime = normalized.mimeType;

  const items = await analyzeClothingImageBase64(
    visionMime,
    buf.toString("base64")
  );
  if (items.length === 0) {
    throw new Error("인식된 옷이 없습니다.");
  }

  const rows: ReturnType<typeof rowFromItem>[] = [];

  for (const item of items) {
    let uploadBuf: Buffer;
    let outMime: string;
    const dbRotationDeg = item.fitting_rotation_deg ?? 0;
    const bbox = item.bbox_normalized;
    // 하의 subtype 은 crop refine 에 필요. 상의/아우터 등은 undefined.
    const subtype = item.category === "하의" ? (item.bottom_subtype ?? "pants") : null;

    if (bbox && isUsableBbox(bbox)) {
      try {
        // 긴바지는 기존대로 아래쪽을 많이 깎지만, 반바지·스커트는 하단이 이미 옷 끝이라
        // conservative 하게 깎아야 기장이 보존됩니다.
        const tight = refineBboxForGarmentCrop(bbox, subtype);
        const cropFormat = visionMime.includes("png") ? "png" : "jpeg";
        uploadBuf = await cropByNormalizedBBox(buf, tight, cropFormat);
        outMime = cropFormat === "png" ? "image/png" : "image/jpeg";
      } catch (err) {
        console.warn("crop failed, using full frame:", err);
        uploadBuf = buf;
        outMime = visionMime.includes("png") ? "image/png" : "image/jpeg";
      }
    } else {
      uploadBuf = buf;
      outMime = visionMime.includes("png") ? "image/png" : "image/jpeg";
    }

    // 모든 옷이 동일하게 "배경 없는 투명 PNG"로 저장되도록 3단 폴백을 돕니다.
    //  1) AI 세그멘테이션 (@imgly/background-removal) — 복잡한 배경에도 안정적
    //  2) 단색 배경 휴리스틱 — AI가 실패/타임아웃 났을 때 빠르게 시도
    //  3) 둘 다 실패하면 bbox crop 그대로 사용 (다만 하의는 subtype 맞춤 refine 이 이미 적용됨)
    // 이렇게 해야 옷마다 "segmentation 된 것/안 된 것"이 섞여 보이는 현상이 사라집니다.
    let cutout: Buffer | null = null;
    let cutoutSource: "ai" | "color" | "none" = "none";
    try {
      cutout = await removeGarmentBackground(uploadBuf);
      cutoutSource = "ai";
    } catch (e) {
      console.warn(
        `AI segmentation failed for ${item.category}, falling back to color cutout:`,
        e instanceof Error ? e.message : e
      );
      try {
        cutout = await tryCutoutGarmentByBgColor(uploadBuf, item.category);
        if (cutout) cutoutSource = "color";
      } catch (e2) {
        console.warn(
          "color-based cutout also failed:",
          e2 instanceof Error ? e2.message : e2
        );
      }
    }
    if (cutout) {
      const debugId = `${userId.slice(0, 8)}-${item.category}-${crypto.randomUUID().slice(0, 8)}`;
      const { buffer: cleaned } = await cleanGarmentCutoutAlpha(cutout, {
        debugId,
        category: item.category,
      });
      uploadBuf = cleaned;
      outMime = "image/png";
    }
    // cutoutSource 는 렌더링에서 fallback 인지 AI 세그먼트인지 구분해서
    // conservative/aggressive normalize 를 달리 할 수 있도록 남겨두는 플래그입니다.
    // 현재는 저장 자체는 동일하지만 로그로 남겨 회귀 추적에 사용합니다.
    if (cutoutSource === "none" && item.category === "하의") {
      console.info(
        `bottom stored as rectangle crop (subtype=${subtype}); fitting room will use conservative normalize.`
      );
    }

    const ext = outMime.includes("png") ? "png" : "jpg";
    const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await storage.storage
      .from("closet-images")
      .upload(objectPath, uploadBuf, {
        contentType: outMime,
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
      const hint =
        uploadError.message?.includes("JWT") ||
        uploadError.message?.includes("expired")
          ? " 다시 로그인해 주세요."
          : uploadError.message?.includes("Bucket") ||
              uploadError.message?.includes("not found")
            ? " .env.local에 SUPABASE_SERVICE_ROLE_KEY를 넣고 서버를 재시작하거나, Supabase SQL로 closet-images 버킷을 만드세요."
            : "";
      throw new Error(
        `스토리지 업로드 실패: ${uploadError.message ?? "알 수 없음"}.${hint}`
      );
    }

    const {
      data: { publicUrl },
    } = storage.storage.from("closet-images").getPublicUrl(objectPath);

    rows.push(rowFromItem(userId, publicUrl, item, dbRotationDeg));
  }

  async function insertWithFallback(
    initialRows: Array<Omit<ClothesRow, "id" | "created_at">>,
    missingColumns: Set<string>
  ): Promise<ClothesRow[]> {
    const stripped = initialRows.map((row) => {
      const copy = { ...row } as Record<string, unknown>;
      for (const col of missingColumns) delete copy[col];
      return copy;
    });
    const { data: insertedFallback, error: fallbackError } = await supabase
      .from("clothes_inventory")
      .insert(stripped)
      .select();

    if (!fallbackError) {
      console.warn(
        `Columns missing in DB: [${[...missingColumns].join(", ")}]; inserted without them. 마이그레이션을 실행해 주세요.`
      );
      return (insertedFallback ?? []) as ClothesRow[];
    }

    // 여러 컬럼이 동시에 없을 수 있으므로(예: bottom_subtype + fitting_rotation_deg)
    // 다른 컬럼에 대한 PGRST204가 또 떨어지면 누적해서 한 번 더 시도.
    if (fallbackError.code === "PGRST204") {
      const match = fallbackError.message?.match(
        /'([a-zA-Z0-9_]+)' column|column ['"]([a-zA-Z0-9_]+)['"]/
      );
      const moreMissing = match?.[1] ?? match?.[2];
      if (moreMissing && !missingColumns.has(moreMissing)) {
        const next = new Set(missingColumns);
        next.add(moreMissing);
        return insertWithFallback(initialRows, next);
      }
    }
    console.error(fallbackError);
    throw new Error(
      `DB 저장 실패: ${fallbackError.message ?? "알 수 없음"}${fallbackError.code ? ` (${fallbackError.code})` : ""}`
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("clothes_inventory")
    .insert(rows)
    .select();

  if (insertError) {
    if (insertError.code === "PGRST204") {
      const match = insertError.message?.match(
        /'([a-zA-Z0-9_]+)' column|column ['"]([a-zA-Z0-9_]+)['"]/
      );
      const col = match?.[1] ?? match?.[2];
      if (col) {
        return insertWithFallback(rows, new Set([col]));
      }
    }
    console.error(insertError);
    throw new Error(
      `DB 저장 실패: ${insertError.message ?? "알 수 없음"}${insertError.code ? ` (${insertError.code})` : ""}`
    );
  }

  return (inserted ?? []) as ClothesRow[];
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getUserOrNull(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureClosetImagesBucket();

    const formData = await request.formData();
    let files = formData
      .getAll("files")
      .filter((x): x is File => x instanceof File && x.size > 0);

    if (files.length === 0) {
      const one = formData.get("file");
      if (one instanceof File && one.size > 0) {
        files = [one];
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "files 필드에 이미지를 하나 이상 넣어 주세요." },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_FILES}장까지 업로드할 수 있습니다.` },
        { status: 400 }
      );
    }

    const allItems: ClothesRow[] = [];
    const failures: { name: string; error: string }[] = [];

    for (const file of files) {
      try {
        const inserted = await analyzeAndInsertOne(supabase, user.id, file);
        allItems.push(...inserted);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "분석 실패";
        failures.push({ name: file.name, error: msg });
      }
    }

    if (allItems.length === 0 && failures.length > 0) {
      return NextResponse.json(
        {
          error: failures.map((f) => `${f.name}: ${f.error}`).join(" / "),
          failures,
          items: [],
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      items: allItems,
      failures: failures.length > 0 ? failures : undefined,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "분석 중 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
