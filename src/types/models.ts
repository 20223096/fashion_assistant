export type Season = "spring_summer" | "fall_winter" | "all_season";

/**
 * 하의 세부 타입. 긴바지·반바지·일반 스커트·테니스 스커트를 구분해서
 * 가상 피팅 시 실루엣/기장을 다르게 그리기 위해 사용합니다.
 * 하의가 아닌 카테고리에서는 null/undefined 입니다.
 */
export type BottomSubtype = "pants" | "shorts" | "skirt" | "tennis_skirt";

export const BOTTOM_SUBTYPES: readonly BottomSubtype[] = [
  "pants",
  "shorts",
  "skirt",
  "tennis_skirt",
] as const;

export type ClothesRow = {
  id: string;
  user_id: string;
  image_url: string;
  category: string;
  style_tags: string[];
  season: Season;
  colors: string[];
  features: string;
  /** 시계 방향(도). 가상 피팅 시 세로 실루엣에 맞춤. */
  fitting_rotation_deg?: number | null;
  /** 카테고리 "하의"일 때만 의미 있는 세부 타입. 긴바지·반바지·스커트·테니스치마. */
  bottom_subtype?: BottomSubtype | null;
  created_at: string;
};

/**
 * 옷장에 신발이 없거나 스타일에 맞는 신발이 없을 때,
 * 코디 추천에 함께 제시하는 "이런 신발이 어울려요" 정보.
 */
export type ShoeRecommendationKind =
  | "sneakers"
  | "loafers"
  | "boots"
  | "heels"
  | "sandals"
  | "slippers"
  | "mules"
  | "others";

export const SHOE_RECOMMENDATION_KINDS: readonly ShoeRecommendationKind[] = [
  "sneakers",
  "loafers",
  "boots",
  "heels",
  "sandals",
  "slippers",
  "mules",
  "others",
] as const;

export type ShoeRecommendation = {
  /** 대략적인 신발 종류 (UI에서 아이콘·프리셋 이미지 선택에 사용) */
  kind: ShoeRecommendationKind;
  /** 한국어 표시용 이름. 예: "화이트 로우 스니커즈" */
  name: string;
  /** 한 줄 설명. 왜 이 코디에 어울리는지. */
  description: string;
};

/**
 * 이 코디가 "어떤 실제 레퍼런스 룩"을 재현하려 했는지 설명.
 * Stage 1(web search) 로 수집된 reference recipe 를 Stage 2 가 선택해서 채운다.
 */
export type OutfitReference = {
  /** 레퍼런스 룩 이름 (예: "오버사이즈 블레이저 + 플리츠 스커트 룩") */
  title: string;
  /** 어디서 자주 보이는지 힌트 (예: "pinterest minimal board / #quietluxury") */
  source_hint?: string | null;
  /** 원본 URL. web_search 결과에 있으면 채움. */
  source_url?: string | null;
};

export type OutfitVariant = {
  title: string;
  piece_ids: string[];
  rationale: string;
  /**
   * piece_ids 안에 "신발" 카테고리가 없을 때만 UI 에서 표시된다.
   * LLM 응답 또는 서버 후처리 단계에서 채워진다.
   */
  shoe_recommendation?: ShoeRecommendation | null;
  /**
   * Pinterest/Instagram 등에서 검색된 레퍼런스 룩.
   * 이 코디가 어떤 실제 유행 코디를 재현하려 했는지 UI 에 표시할 수 있다.
   */
  reference?: OutfitReference | null;
};

export type PurchaseSuggestion = {
  category: string;
  item_idea: string;
  reason: string;
};

export type RecommendationResult = {
  /** 요청 스타일 키워드에 맞춘 코디(여러 벌) */
  keyword_outfits: OutfitVariant[];
  /** 키워드와 다른 무드·조합의 추가 코디 */
  other_outfits: OutfitVariant[];
  purchase_suggestions: PurchaseSuggestion[];
};

export const CATEGORY_ORDER = [
  "상의",
  "하의",
  "아우터",
  "원피스",
  "신발",
  "가방",
  "액세서리",
] as const;
