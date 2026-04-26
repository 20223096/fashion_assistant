import type { ClothesRow, OutfitVariant } from "@/types/models";

/** 올블랙 모드에서 colors 문자열이 블랙 톤만인지 대략 판별 */
const NON_BLACK = new RegExp(
  [
    "화이트|흰색|white|아이보|ivory|크림|cream|베이지|beige",
    "라이트그레이|light\\s*grey|light\\s*gray|연회색|밝은\\s*회",
    "옐로|yellow|핑크|pink|민트|mint|라임|lime|스카이|sky",
    "레드|red|버건디|burgundy|와인|wine|오렌지|orange|코랄|coral",
    "그린|green|카키|khaki|올리브|olive|브라운|brown|탄|tan|카멜|camel",
    "블루|blue|네이비|navy|인디고|indigo|청|데님|denim|연청|밝은",
    "보라|purple|라벤더|lavender|골드|gold|실버|silver|메탈",
    "아이보리|파스텔|원색|형광|neon|밝은",
  ].join("|"),
  "i"
);

const BLACKISH = new RegExp(
  "블랙|검정|black|차콜|charcoal|graphite|그래파이트|그레이|grey|gray|회색|먹색|다크그레이|dark\\s*grey|dark\\s*gray|짙은\\s*회|묵직한\\s*회",
  "i"
);

export function pieceFitsAllBlackPalette(colors: string[]): boolean {
  if (colors.length === 0) {
    return true;
  }
  for (const c of colors) {
    const t = c.trim();
    if (!t) continue;
    if (NON_BLACK.test(t)) {
      return false;
    }
    if (!BLACKISH.test(t) && !/다크|dark|딥|deep|짙은|어두운/i.test(t)) {
      return false;
    }
  }
  return true;
}

export function filterOutfitsToAllBlackPieces(
  outfits: OutfitVariant[],
  clothes: ClothesRow[]
): OutfitVariant[] {
  const byId = new Map(clothes.map((c) => [c.id, c]));
  return outfits
    .map((o) => {
      const piece_ids = o.piece_ids.filter((id) => {
        const row = byId.get(id);
        return row && pieceFitsAllBlackPalette(row.colors);
      });
      return { ...o, piece_ids };
    })
    .filter((o) => o.piece_ids.length > 0);
}
