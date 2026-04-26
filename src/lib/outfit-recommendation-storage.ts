import type { OutfitVariant } from "@/types/models";

/** DB `outfit_recommendations.outfits` jsonb: 구형은 배열, 신형은 { keyword_outfits, other_outfits } */
export function parseStoredOutfitGroups(raw: unknown): {
  keyword_outfits: OutfitVariant[];
  other_outfits: OutfitVariant[];
} {
  if (Array.isArray(raw)) {
    return { keyword_outfits: raw as OutfitVariant[], other_outfits: [] };
  }
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const kw = Array.isArray(r.keyword_outfits)
      ? (r.keyword_outfits as OutfitVariant[])
      : [];
    const ot = Array.isArray(r.other_outfits)
      ? (r.other_outfits as OutfitVariant[])
      : [];
    return { keyword_outfits: kw, other_outfits: ot };
  }
  return { keyword_outfits: [], other_outfits: [] };
}

export function mergeOutfitsForFitting(
  keyword: OutfitVariant[],
  other: OutfitVariant[]
): OutfitVariant[] {
  return [...keyword, ...other];
}
