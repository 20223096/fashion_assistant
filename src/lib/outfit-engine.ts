import { filterOutfitsToAllBlackPieces } from "@/lib/black-outfit-filter";
import { describeStrictStyleConstraints } from "@/lib/style-constraints";
import { z } from "zod";
import type {
  ClothesRow,
  OutfitReference,
  OutfitVariant,
  RecommendationResult,
  ShoeRecommendation,
  ShoeRecommendationKind,
} from "@/types/models";
import { SHOE_RECOMMENDATION_KINDS } from "@/types/models";
import { getOpenAI } from "@/lib/openai";

/** 코디 추천 프롬프트에 포함되는 최신 트렌드 맥락 — web search 가 실패했을 때의 폴백. */
export const TREND_CONTEXT = `
2024–2026 소셜/보드 트렌드 요약 (인스타·핀터레스트 계열):
- 미니멀 & 콰이어트 럭스: 단정 실루엣, 중성 색, 질감 차이(매트×은은한 광택), 로고 최소화.
- 스트릿 & 고프코어: 기술 소재, 레이어링, 볼륨 있는 하의/아우터, 스니커즈·트레킹 슈즈 믹스.
- 빈티지 & 데님: 워시·틴트 데님, 가죽/스웨이드 액센트, 약간의 해진 듯한 텍스처 허용.
- 페미닌/소프트: 플리츠·시스루 레이어, 파스텔·크림 톤, 악세서리로 포인트.
- 오피스 스럽지만 편안함: 세미와이드 슬랙, 니트 상의, 구조적인 블레이저 완화 핏.

조합 시 색 벨런스(베이스+포인트 1곳), 겹입기 논리(얇은 이너→아우터), 격식 단계 맞추기를 고려한다.
`.trim();

/* ============================================================
 * Stage 1 — 레퍼런스 룩 스카우팅
 * Instagram/Pinterest 계열에서 키워드로 자주 보이는 대표 코디를
 * 실제 web search 로 찾아 JSON 레시피 배열로 정리한다.
 * ============================================================ */

const referenceRecipeSchema = z.object({
  title: z.string(),
  vibe: z.string(),
  dominant_colors: z.array(z.string()).default([]),
  silhouette: z.string().default(""),
  required_pieces: z
    .object({
      top: z.string().nullable().optional(),
      bottom: z.string().nullable().optional(),
      dress: z.string().nullable().optional(),
      outerwear: z.string().nullable().optional(),
      shoes: z.string().nullable().optional(),
      accessories: z.array(z.string()).default([]),
    })
    .default({ accessories: [] }),
  source_hint: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});

export type ReferenceRecipe = z.infer<typeof referenceRecipeSchema>;

const referenceRecipesSchema = z.object({
  recipes: z.array(referenceRecipeSchema).min(1).max(8),
});

/** 응답 문자열에서 첫 JSON 블록만 잘라낸다(web search 모델이 설명 텍스트를 앞뒤에 붙일 수 있음). */
function extractJsonBlock(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

async function scoutReferenceOutfits(
  requestedStyle: string
): Promise<ReferenceRecipe[]> {
  const openai = getOpenAI();

  const instruction = `너는 패션 트렌드 리서처다. Instagram, Pinterest, 패션 블로그, 유명 매거진에서 사용자가 제시한 스타일 키워드로 **자주 보이는 대표 코디 5~6 벌**을 web 검색으로 실제로 찾아, 아래 JSON 스키마에 맞게 정리해라.

사용자 스타일 키워드: "${requestedStyle}"

검색 힌트:
- "\${requestedStyle} outfit pinterest", "\${requestedStyle} instagram look", 한국어 키워드이면 "\${requestedStyle} 코디 핀터레스트" 등을 사용.
- 특정 셀럽/인플루언서/시즌 유행 룩도 포함 가능.

각 recipe 필드:
- title: 1줄짜리 룩 이름 (한국어, 예: "오버사이즈 블레이저 + 플리츠 스커트 룩").
- vibe: 무드 1~2문장 (한국어).
- dominant_colors: 영어 또는 한국어 색 키워드 배열 (예: ["black","white","beige"]).
- silhouette: 실루엣 요약 (예: "크롭 상의 + 와이드 팬츠").
- required_pieces: { top, bottom, dress, outerwear, shoes, accessories } — 각 항목은 필요한 아이템의 "종류·소재·디테일" 을 간결히 (예: top="박시한 흰 셔츠"). 필요 없으면 null, accessories 는 없으면 빈 배열.
- source_hint: 어디서 자주 보이는지 (예: "pinterest #quietluxury", "instagram: 김나영룩"). 모르면 null.
- source_url: 대표 이미지·게시물 URL 하나(있을 때만).

주의:
- 반드시 **서로 다른 5~6 가지 룩**이어야 한다. 같은 실루엣을 색만 바꾼 건 금지.
- 실제 아이템이 떠오르지 않는 추상적인 룩은 제외.

오직 아래 JSON 만 반환 (다른 설명·서문·코드펜스 금지):
{"recipes":[{"title":"...","vibe":"...","dominant_colors":["..."],"silhouette":"...","required_pieces":{"top":"...","bottom":"...","dress":null,"outerwear":"...","shoes":"...","accessories":["..."]},"source_hint":"...","source_url":"..."}]}`;

  try {
    const response = await openai.responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      // web_search + 모델의 자체 판단을 섞어 빠르게 스카우팅.
      input: instruction,
    });

    // Responses API 는 output_text 헬퍼를 제공한다.
    const text = response.output_text ?? "";
    const jsonBlock = extractJsonBlock(text);
    if (!jsonBlock) {
      console.warn("[scoutReferenceOutfits] no JSON in response");
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch (e) {
      console.warn("[scoutReferenceOutfits] JSON.parse failed:", e);
      return [];
    }

    const validated = referenceRecipesSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn(
        "[scoutReferenceOutfits] schema invalid:",
        validated.error.issues.slice(0, 3)
      );
      return [];
    }
    return validated.data.recipes;
  } catch (e) {
    // web_search_preview 미지원 모델·키·리전 등에서 실패해도
    // Stage 2 가 단독으로 동작하도록 빈 배열로 폴백한다.
    console.warn("[scoutReferenceOutfits] failed:", e);
    return [];
  }
}

/* ============================================================
 * Stage 2 — 옷장 매칭
 * 레퍼런스 레시피 + 옷장 JSON 을 GPT-4o 에 넣고,
 * 각 레퍼런스를 내 옷장으로 재현한 코디를 만들게 한다.
 * ============================================================ */

const shoeRecommendationSchema = z.object({
  kind: z.enum(
    SHOE_RECOMMENDATION_KINDS as unknown as [
      ShoeRecommendationKind,
      ...ShoeRecommendationKind[],
    ]
  ),
  name: z.string().min(1),
  description: z.string().min(1),
});

const outfitReferenceSchema = z.object({
  title: z.string(),
  source_hint: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
});

const outfitVariantSchema = z.object({
  title: z.string(),
  piece_ids: z.array(z.string()),
  rationale: z.string(),
  shoe_recommendation: shoeRecommendationSchema.nullable().optional(),
  /** 이 코디가 재현하려 한 레퍼런스. 없을 수도 있음(예: 옷장에 맞는 레퍼런스가 없을 때). */
  reference: outfitReferenceSchema.nullable().optional(),
});

const recommendationSchema = z.object({
  keyword_outfits: z.array(outfitVariantSchema).min(1).max(10),
  other_outfits: z.array(outfitVariantSchema).max(6).default([]),
  purchase_suggestions: z.array(
    z.object({
      category: z.string(),
      item_idea: z.string(),
      reason: z.string(),
    })
  ),
});

function inventoryJson(items: ClothesRow[]) {
  return items.map((c) => ({
    id: c.id,
    category: c.category,
    style_tags: c.style_tags,
    season: c.season,
    colors: c.colors,
    features: c.features,
  }));
}

function outfitHasShoe(
  outfit: OutfitVariant,
  byId: Map<string, ClothesRow>
): boolean {
  return outfit.piece_ids.some((id) => byId.get(id)?.category === "신발");
}

/** 스타일 키워드에서 대강의 신발 종류를 추정. LLM 응답이 비어 있을 때만 쓰는 기본값. */
function inferDefaultShoeKind(style: string): ShoeRecommendationKind {
  const s = style.toLowerCase();
  if (/포멀|formal|오피스|office|클래식|classic|미팅|정장/.test(s)) return "loafers";
  if (/힐|heel|드레시|dressy|파티|party|여성|페미닌/.test(s)) return "heels";
  if (/비치|beach|여름|summer|샌들|sandal/.test(s)) return "sandals";
  if (/겨울|winter|부츠|boots|고프코어|gorp|등산|트레킹/.test(s)) return "boots";
  if (/홈|home|슬리퍼|slipper/.test(s)) return "slippers";
  return "sneakers";
}

function defaultShoeRecommendation(style: string): ShoeRecommendation {
  const kind = inferDefaultShoeKind(style);
  const presets: Record<ShoeRecommendationKind, ShoeRecommendation> = {
    sneakers: {
      kind: "sneakers",
      name: "화이트 로우 스니커즈",
      description:
        "캐주얼·미니멀 무드 어디에나 잘 맞고, 발등 라인을 깔끔하게 정리해 줍니다.",
    },
    loafers: {
      kind: "loafers",
      name: "블랙 페니 로퍼",
      description: "오피스·스마트 캐주얼 코디의 격식을 한 단계 올려줍니다.",
    },
    boots: {
      kind: "boots",
      name: "브라운 첼시 부츠",
      description: "가을·겨울 레이어드 룩과 잘 어울리는 기본 아이템입니다.",
    },
    heels: {
      kind: "heels",
      name: "누드 톤 미드힐 펌프스",
      description: "페미닌·드레시 코디에서 다리 실루엣을 길어 보이게 합니다.",
    },
    sandals: {
      kind: "sandals",
      name: "블랙 스트랩 샌들",
      description: "여름 코디에 시원함을 더하면서 무드를 정돈해 줍니다.",
    },
    slippers: {
      kind: "slippers",
      name: "심플 뮬 슬리퍼",
      description: "릴랙스 무드의 코디를 편하게 마무리해 줍니다.",
    },
    mules: {
      kind: "mules",
      name: "베이지 뮬",
      description: "오피스·데이트 룩 어디에나 어울리는 가볍고 단정한 선택지.",
    },
    others: {
      kind: "others",
      name: "코디에 맞는 신발",
      description: "코디의 톤과 격식에 맞춰 1켤레를 추가해 주세요.",
    },
  };
  return presets[kind];
}

/**
 * 코디 각각에 대해 "신발이 반드시 포함되도록" 보정한다.
 */
function ensureShoesForOutfits(
  outfits: OutfitVariant[],
  clothes: ClothesRow[],
  byId: Map<string, ClothesRow>,
  requestedStyle: string
): OutfitVariant[] {
  const shoesInCloset = clothes.filter((c) => c.category === "신발");

  return outfits.map((outfit) => {
    if (outfitHasShoe(outfit, byId)) {
      return { ...outfit, shoe_recommendation: null };
    }
    if (outfit.shoe_recommendation) {
      return outfit;
    }
    if (shoesInCloset.length > 0) {
      return {
        ...outfit,
        piece_ids: [...outfit.piece_ids, shoesInCloset[0].id],
        shoe_recommendation: null,
      };
    }
    return {
      ...outfit,
      shoe_recommendation: defaultShoeRecommendation(requestedStyle),
    };
  });
}

/** 공개 API — Stage 1 스카우팅 후 Stage 2 매칭으로 결과를 만든다. */
export async function generateOutfitRecommendations(
  clothes: ClothesRow[],
  requestedStyle: string
): Promise<RecommendationResult> {
  if (clothes.length === 0) {
    return {
      keyword_outfits: [],
      other_outfits: [],
      purchase_suggestions: [
        {
          category: "기본",
          item_idea:
            "먼저 티셔츠·데님·슈즈처럼 베이스 아이템 사진을 옷장에 등록해 주세요.",
          reason: "등록된 옷이 없어 코디 조합을 만들 수 없습니다.",
        },
      ],
    };
  }

  // Stage 1: 실제 web search 로 레퍼런스 룩 스카우팅
  const recipes = await scoutReferenceOutfits(requestedStyle);

  // Stage 2: 옷장 매칭
  const openai = getOpenAI();
  const inv = inventoryJson(clothes);
  const strictBlock = describeStrictStyleConstraints(requestedStyle);
  const isAllBlackStrict = Boolean(
    strictBlock && strictBlock.includes("올블랙")
  );

  const hasShoesInCloset = clothes.some((c) => c.category === "신발");
  const shoesGuidanceBlock = hasShoesInCloset
    ? `- 옷장에 등록된 신발 중 스타일에 어울리는 것을 **반드시 1개 이상** piece_ids 에 포함한다.
- 옷장에 있는 모든 신발이 어울리지 않는다면, 그 코디에 한해 shoe_recommendation 필드를 채우고, 그 이유를 rationale 에 짧게 언급한다.`
    : `- 옷장에 "신발" 카테고리 아이템이 **없다**. 따라서 모든 코디에서 piece_ids 에 신발이 포함될 수 없다.
- 대신 **모든 코디**의 shoe_recommendation 필드를 반드시 채운다. (이 필드가 비어 있으면 안 된다.)`;

  // 레퍼런스 유무에 따라 Stage 2 프롬프트가 달라진다.
  const hasRecipes = recipes.length > 0;

  const referenceBlock = hasRecipes
    ? `[Stage 1 — Instagram/Pinterest 에서 방금 검색한 "${requestedStyle}" 대표 레퍼런스 룩 ${recipes.length}벌]
${JSON.stringify(recipes, null, 2)}

위 레퍼런스들은 **실제로 지금 유행하는 코디의 재료**다. 아래 매칭 규칙으로 내 옷장 옷을 사용해서 각 레퍼런스를 **최대한 비슷하게 재현**해라.`
    : `(참고용 트렌드 — web search 가 비어 있어 일반 트렌드 요약만 사용)
${TREND_CONTEXT}`;

  const matchingRule = hasRecipes
    ? `1) keyword_outfits: 위 레퍼런스 룩 각각마다, 내 옷장의 옷 조합으로 **가장 비슷한 한 벌**을 만든다.
   - 각 코디의 reference 필드에 재현 대상 레퍼런스의 title(과 가능하면 source_hint/source_url)을 그대로 채운다.
   - 매칭 우선순위: (a) 색·톤, (b) 실루엣(크롭/오버/와이드/타이트 등), (c) 아이템 종류, (d) 격식 단계.
   - 레퍼런스의 top/bottom/shoes 에 해당하는 아이템이 옷장에 없다면, 가장 유사한 대체재를 고르고 rationale 에 **"레퍼런스의 ~를 옷장의 ~로 대체"** 라고 구체적으로 적는다.
   - 옷장으로 전혀 재현이 불가능한 레퍼런스는 그 코디를 건너뛴다 (모든 레퍼런스를 반드시 써야 하는 것은 아님).
   - 서로 다른 **5~8 벌** 목표. 같은 piece_ids 조합은 한 번만.`
    : `1) keyword_outfits: "${requestedStyle}" 키워드에 맞는 코디만 넣는다. 옷장에서 **서로 다른 조합**을 **4~8개**까지 제안한다. reference 필드는 null 로 둔다.`;

  const otherRule = strictBlock
    ? `2) other_outfits: 제약상 "다른 무드" 코디는 불가능하므로 **빈 배열 []** 로 두거나, keyword와 **완전히 다른 piece_ids 세트**인 같은 제약의 대안을 **최대 2개**만 넣는다(실루엣만 다름). keyword와 동일한 piece_ids 세트는 금지.`
    : `2) other_outfits: 위 키워드("${requestedStyle}")와 **겹치지 않는 다른 스타일 무드**의 코디 **2~4개**. 레퍼런스는 사용하지 않아도 되고(reference=null), keyword_outfits 에 쓴 piece_ids 조합과 **동일한 세트**는 금지.`;

  const systemBase = strictBlock
    ? `You are an expert stylist and wardrobe matcher.\n\n아래 [사용자 스타일 제약]은 레퍼런스보다 **항상 우선**한다. 제약과 충돌하는 색·무드·스타일 라벨은 사용하지 않는다.\n\n${strictBlock}\n\nOutput valid JSON only.`
    : `You are an expert stylist and wardrobe matcher. 실제 유행 코디를 옷장 옷으로 재현하는 데 집중한다.\n\nOutput valid JSON only.`;

  const userPrompt = `
사용자가 원하는 스타일 키워드: "${requestedStyle}"
${strictBlock ? `\n위 키워드에 대한 제약은 시스템 메시지의 [최우선 제약]과 동일하게 적용한다.\n` : ""}
${referenceBlock}

내 옷장(JSON, id 는 clothes_inventory 의 UUID):
${JSON.stringify(inv, null, 2)}

규칙:
${matchingRule}
${otherRule}
3) 각 코디의 piece_ids 는 옷장에 있는 id만 사용한다. 기본적으로 **상의(또는 원피스) + 하의 + 신발** 세 축을 모두 커버해야 한다. 원피스 사용 시 하의는 생략 가능하지만 신발은 절대 생략 불가.
4) **신발은 반드시 있어야 한다.**
${shoesGuidanceBlock}
   shoe_recommendation 스키마: { "kind": "sneakers|loafers|boots|heels|sandals|slippers|mules|others", "name": "화이트 로우 스니커즈처럼 짧은 한국어 이름", "description": "왜 이 코디에 어울리는지 1줄" }.
5) reference 스키마: { "title": "레퍼런스 룩 이름", "source_hint": "pinterest board 이름 등 또는 null", "source_url": "이미지 URL 또는 null" }.
6) rationale 은 한국어 1~2문장. 어떤 레퍼런스를 어떻게 옷장 옷으로 대치했는지 구체적으로 쓴다.
7) purchase_suggestions: 레퍼런스 재현 시 옷장에 특히 부족한 카테고리·아이템(예: 테일러드 블레이저, 로퍼)을 구체적으로 제안한다.

반드시 JSON 만 반환:
{"keyword_outfits":[{"title":"...","piece_ids":["uuid",...],"rationale":"...","shoe_recommendation":{"kind":"sneakers","name":"...","description":"..."},"reference":{"title":"...","source_hint":"...","source_url":null}}],"other_outfits":[{"title":"...","piece_ids":["uuid",...],"rationale":"...","shoe_recommendation":null,"reference":null}],"purchase_suggestions":[{"category":"신발","item_idea":"...","reason":"..."}]}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemBase },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: strictBlock ? 0.25 : 0.45,
    max_tokens: 6000,
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty recommendation response");
  }

  const parsed = JSON.parse(raw) as unknown;
  const validated = recommendationSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Recommendation JSON invalid");
  }

  const validIds = new Set(clothes.map((c) => c.id));
  const byId = new Map(clothes.map((c) => [c.id, c] as const));

  const sanitize = (
    rows: typeof validated.data.keyword_outfits
  ): OutfitVariant[] =>
    rows.map((o) => ({
      title: o.title,
      piece_ids: o.piece_ids.filter((id) => validIds.has(id)),
      rationale: o.rationale,
      shoe_recommendation: o.shoe_recommendation ?? null,
      reference: (o.reference as OutfitReference | null | undefined) ?? null,
    }));

  let keyword_outfits = sanitize(validated.data.keyword_outfits);
  let other_outfits = sanitize(validated.data.other_outfits);

  const setKey = (o: { piece_ids: string[] }) =>
    [...o.piece_ids].sort().join(",");

  if (isAllBlackStrict) {
    keyword_outfits = filterOutfitsToAllBlackPieces(keyword_outfits, clothes);
    other_outfits = filterOutfitsToAllBlackPieces(other_outfits, clothes);
  }

  const kwKeys = new Set(keyword_outfits.map(setKey));
  other_outfits = other_outfits.filter((o) => !kwKeys.has(setKey(o)));

  keyword_outfits = ensureShoesForOutfits(
    keyword_outfits,
    clothes,
    byId,
    requestedStyle
  );
  other_outfits = ensureShoesForOutfits(
    other_outfits,
    clothes,
    byId,
    requestedStyle
  );

  let purchase_suggestions = validated.data.purchase_suggestions;
  if (isAllBlackStrict && keyword_outfits.length === 0) {
    purchase_suggestions = [
      {
        category: "올블랙",
        item_idea:
          "블랙·차콜 톤 상의·하의·신발 등을 옷장에 더 등록하거나, 검은 옷 사진을 다시 올려 색상 태그를 맞춰 보세요.",
        reason:
          "올블랙에 맞는(검정 계열로 태깅된) 조합을 만들 옷이 없습니다.",
      },
    ];
    other_outfits = [];
  }

  return {
    keyword_outfits,
    other_outfits,
    purchase_suggestions,
  };
}
