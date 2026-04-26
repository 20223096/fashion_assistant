import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import { getClosetStorageOperator } from "@/lib/supabase/closet-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** 공개 URL에서 bucket 내 object 경로 추출 */
function closetObjectPathFromUrl(imageUrl: string): string | null {
  const marker = "/object/public/closet-images/";
  const i = imageUrl.indexOf(marker);
  if (i === -1) return null;
  const rest = imageUrl.slice(i + marker.length);
  return decodeURIComponent(rest.split("?")[0] ?? "");
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const user = await getUserOrNull(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("clothes_inventory")
    .select("id, user_id, image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
  }

  const objectPath = closetObjectPathFromUrl(row.image_url);
  if (objectPath) {
    const storage = getClosetStorageOperator(supabase as unknown as SupabaseClient);
    const { error: storageError } = await storage.storage
      .from("closet-images")
      .remove([objectPath]);
    if (storageError) {
      console.error("storage remove:", storageError);
    }
  }

  const { error: delError } = await supabase
    .from("clothes_inventory")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (delError) {
    console.error(delError);
    return NextResponse.json({ error: "DB 삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
