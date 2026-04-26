import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import { generateOutfitRecommendations } from "@/lib/outfit-engine";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const user = await getUserOrNull(supabase);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { style?: string };
    const style = (body.style ?? "").trim() || "데일리 미니멀";

    const { data: clothes, error: fetchError } = await supabase
      .from("clothes_inventory")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      return NextResponse.json({ error: "옷장을 불러오지 못했습니다." }, { status: 500 });
    }

    const result = await generateOutfitRecommendations(clothes ?? [], style);

    const { error: saveError } = await supabase.from("outfit_recommendations").insert({
      user_id: user.id,
      requested_style: style,
      outfits: {
        keyword_outfits: result.keyword_outfits,
        other_outfits: result.other_outfits,
      },
      purchase_suggestions: result.purchase_suggestions,
    });

    if (saveError) {
      console.error(saveError);
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "추천 생성 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
