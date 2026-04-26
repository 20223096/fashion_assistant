import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import {
  mergeOutfitsForFitting,
  parseStoredOutfitGroups,
} from "@/lib/outfit-recommendation-storage";
import type { ClothesRow, OutfitVariant } from "@/types/models";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const user = await getUserOrNull(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rec } = await supabase
    .from("outfit_recommendations")
    .select("outfits, requested_style")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { keyword_outfits, other_outfits } = parseStoredOutfitGroups(rec?.outfits);
  const rawOutfits = mergeOutfitsForFitting(keyword_outfits, other_outfits);
  if (rawOutfits.length === 0) {
    return NextResponse.json({
      requested_style: rec?.requested_style ?? null,
      outfits: [] as { title: string; rationale: string; pieces: ClothesRow[] }[],
    });
  }

  const allIds = [...new Set(rawOutfits.flatMap((o) => o.piece_ids))];
  const { data: clothes } = await supabase
    .from("clothes_inventory")
    .select("*")
    .in("id", allIds);

  const byId = new Map((clothes ?? []).map((c) => [c.id, c as ClothesRow]));

  const outfits = rawOutfits
    .map((o) => ({
      title: o.title,
      rationale: o.rationale,
      pieces: o.piece_ids
        .map((id) => byId.get(id))
        .filter((x): x is ClothesRow => Boolean(x)),
    }))
    .filter((o) => o.pieces.length > 0);

  return NextResponse.json({
    requested_style: rec?.requested_style ?? null,
    outfits,
  });
}
