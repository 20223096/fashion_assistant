import type { BottomSubtype, Season } from "@/types/models";
import { getOpenAI } from "@/lib/openai";

const CATEGORIES = new Set([
  "상의",
  "하의",
  "아우터",
  "원피스",
  "신발",
  "가방",
  "액세서리",
]);

export type BBoxNormalized = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type VisionItem = {
  category: string;
  style_tags: string[];
  season: Season;
  colors: string[];
  features: string;
  bbox_normalized?: BBoxNormalized;
  /** 시계 방향(도). 크롭된 썸네일 기준으로 세로(입었을 때 머리→발)가 이미지 위쪽과 맞도록. */
  fitting_rotation_deg: number;
  /** 카테고리가 "하의"일 때만 채움. 긴바지/반바지/스커트/테니스스커트 구분. */
  bottom_subtype?: BottomSubtype;
};

const VISION_PROMPT = `You are a fashion vision assistant. The user photo may contain multiple separate clothing items laid out or worn.
List EVERY distinct garment as its own item (e.g. nine separate folded pieces = nine items).

For EVERY item, output one object with:
- category: MUST be exactly one of: 상의, 하의, 아우터, 원피스, 신발, 가방, 액세서리
- style_tags: array of 1-4 strings (e.g. 미니멀, 캐주얼, 스트릿)
- season: MUST be exactly one of these three English strings: spring_summer OR fall_winter OR all_season
- colors: array of dominant color names in Korean (e.g. 네이비, 크림)
- features: one short Korean phrase describing THIS item only (not the whole photo)
- bbox_normalized: REQUIRED. x_min, y_min, x_max, y_max are 0–1 fractions of full image width/height.
- fitting_rotation_deg: REQUIRED integer -180 to 180. The saved crop will be this item only. How many degrees CLOCKWISE must that crop be rotated so the garment's natural wear direction (shirt: collar toward top of image, hem toward bottom; pants: waist toward top, legs toward bottom; shoes: sole toward bottom) matches "standing upright" in the image? Examples: pants or jeans lying FLAT on floor with leg direction mostly LEFT-RIGHT in the frame → 90 or -90 (pick one with smaller absolute value that achieves vertical legs in image). Garment already vertical as on a hanger → 0. Diagonal flat lay → round to nearest 15 (e.g. 45, -30).
- bottom_subtype: REQUIRED when category is "하의". MUST be exactly one of: "pants", "shorts", "skirt", "tennis_skirt".
  * pants: long trousers reaching around the ankle — jeans, slacks, chinos, joggers, cargo pants, leggings, wide leg pants.
  * shorts: short pants ending mid-thigh to just above the knee (inseam typically < 20cm) — denim shorts, sweat shorts, bermuda. NOT skirts.
  * skirt: standard skirt (mini/midi/maxi) with no leg separation. A-line, pencil, wrap, pleated skirt.
  * tennis_skirt: short pleated / flared athletic-style skirt typically reaching upper thigh, often with visible pleats or box pleats, sporty silhouette. Treat cheerleader-style or very short pleated skirts as tennis_skirt.
  Omit this field entirely for non-하의 categories.

CRITICAL for bbox_normalized:
- The rectangle must contain ONLY that one garment's fabric/folded shape. Do NOT include parquet floor, rug, wood grain, plants, bookshelf, buttons box, or empty floor around the item.
- Tight fit: margins between adjacent garments should NOT be inside the box; each box is only one pile/shirt/pants.
- If two items overlap in the image, the bbox for the bottom item must still exclude the top item's fabric and vice versa (split as best as possible).
- y_max should be at the lowest pixel row of THAT garment, not the floor below it.
- When in doubt, make the box slightly smaller rather than including background.

Return ONLY valid JSON: {"items":[...]} no markdown.`;

function stripJsonFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) return m[1].trim();
  return t;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) {
    return [v.trim()];
  }
  return [];
}

function coerceSeason(v: unknown): Season {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    s === "spring_summer" ||
    s === "spring-summer" ||
    s.includes("봄") ||
    s.includes("여름")
  ) {
    return "spring_summer";
  }
  if (
    s === "fall_winter" ||
    s === "fall-winter" ||
    s.includes("가을") ||
    s.includes("겨울")
  ) {
    return "fall_winter";
  }
  if (s === "all_season" || s === "allseason" || s.includes("사계절")) {
    return "all_season";
  }
  return "all_season";
}

const CATEGORY_ALIASES: Record<string, string> = {
  top: "상의",
  tops: "상의",
  shirt: "상의",
  bottom: "하의",
  bottoms: "하의",
  pants: "하의",
  trousers: "하의",
  skirt: "하의",
  outerwear: "아우터",
  outer: "아우터",
  jacket: "아우터",
  coat: "아우터",
  dress: "원피스",
  shoes: "신발",
  shoe: "신발",
  sneakers: "신발",
  bag: "가방",
  bags: "가방",
  accessory: "액세서리",
  accessories: "액세서리",
};

function coerceCategory(v: unknown): string {
  const c = String(v ?? "").trim();
  if (CATEGORIES.has(c)) return c;
  const low = c.toLowerCase().normalize("NFKC");

  if (CATEGORY_ALIASES[low]) return CATEGORY_ALIASES[low];

  // 모델이 허용 목록 밖의 한글·영문을 쓰면 예전엔 전부 "상의"로 떨어져
  // 바지가 상의 슬롯(가슴 좌표)에 그려지는 치명적 오분류가 났음.
  if (/원피스|드레스|점프수트/.test(c)) return "원피스";
  if (/재킷|코트|점퍼|패딩|아우터|블루종|가디건\s*코트|트렌치/.test(c)) {
    return "아우터";
  }
  if (
    /바지|팬츠|슬랙스|스커트|치마|반바지|데님|조거|레깅스|하의|슬랙|쇼츠|트라우저/.test(
      c
    )
  ) {
    return "하의";
  }
  if (
    /셔츠|티\s*셔츠|티셔츠|맨투맨|후드|탑|상의|베스트|블라우스|니트\s*탑|슬리브리스|민소매|탱크톱|폴로|가디건/.test(
      c
    )
  ) {
    return "상의";
  }
  if (/신발|스니커즈|부츠|샌들|로퍼|힐|슬리퍼/.test(c)) return "신발";
  if (/가방|백팩|토트|클러치|숄더/.test(c)) return "가방";

  if (
    /\b(dress|jumpsuit|romper)\b/i.test(low) &&
    !/\b(shirt\s*dress)\b/i.test(low)
  ) {
    return "원피스";
  }
  if (
    /\b(jacket|coat|blazer|parka|anorak|windbreaker|bomber|outerwear|cardigan)\b/i.test(
      low
    )
  ) {
    return "아우터";
  }
  if (
    /\b(pants|jeans|shorts|trousers|slacks|leggings|joggers|chinos|skirt|culottes|wide\s*leg)\b/i.test(
      low
    ) ||
    /\bcargo\b/i.test(low)
  ) {
    return "하의";
  }
  if (
    /\b(shirt|tee|blouse|sweater|tank|cami|hoodie|polo|henley|sleeveless|crop\s*top|knitwear)\b/i.test(
      low
    ) ||
    /\bt[-\s]?shirt\b/i.test(low)
  ) {
    return "상의";
  }
  if (/\b(shoes|sneakers|boots|sandals|loafers|heels|footwear)\b/i.test(low)) {
    return "신발";
  }
  if (/\b(bag|backpack|tote|clutch|handbag)\b/i.test(low)) {
    return "가방";
  }

  return "액세서리";
}

const BOTTOM_SUBTYPE_SET: ReadonlySet<BottomSubtype> = new Set<BottomSubtype>([
  "pants",
  "shorts",
  "skirt",
  "tennis_skirt",
]);

/** vision 이 줄 수 있는 다양한 표기를 표준 subtype 으로 정규화 */
function coerceBottomSubtype(v: unknown): BottomSubtype | undefined {
  if (typeof v !== "string") return undefined;
  const low = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!low) return undefined;
  if (BOTTOM_SUBTYPE_SET.has(low as BottomSubtype)) return low as BottomSubtype;
  // 표기 변형 허용
  if (/^(trousers|long_?pants|jeans|slacks|leggings|joggers|chinos|cargos?|wide_?leg)$/.test(low)) {
    return "pants";
  }
  if (/^(short|shorts|shortpants|bermuda|hot_?pants|denim_?shorts)$/.test(low)) {
    return "shorts";
  }
  if (/^(tennis|tennis_?skirt|pleated_?skirt|cheer(leader)?_?skirt|sport_?skirt)$/.test(low)) {
    return "tennis_skirt";
  }
  if (/^(skirt|mini_?skirt|midi_?skirt|maxi_?skirt|a_?line|pencil|wrap_?skirt)$/.test(low)) {
    return "skirt";
  }
  return undefined;
}

/**
 * vision 이 subtype 을 빼먹었거나 하의 외 카테고리에서 잘못 넣은 경우를
 * 한국어/영문 features · category 텍스트에서 휴리스틱으로 추정.
 * 추정이 불확실하면 pants 로 떨어져 기존 동작과 동일하게 유지됩니다.
 */
export function inferBottomSubtypeFromText(
  texts: Array<string | undefined | null>
): BottomSubtype {
  const blob = texts.filter(Boolean).join(" ").toLowerCase();
  // 테니스치마 / 플리츠 스포츠 스커트는 subtype 판별에서 가장 먼저 체크
  if (
    /테니스\s*(치마|스커트)|치어리더|cheer(leader)?|tennis\s*skirt|플리츠\s*(치마|스커트|미니)/.test(
      blob
    )
  ) {
    return "tennis_skirt";
  }
  if (/반바지|쇼츠|숏\s*팬츠|버뮤다|\bshorts?\b|\bbermuda\b|\bhot\s*pants?\b/.test(blob)) {
    return "shorts";
  }
  if (/치마|스커트|\bskirt\b/.test(blob)) {
    return "skirt";
  }
  return "pants";
}

function coerceFittingRotation(v: unknown): number {
  const n = num(v);
  if (n === undefined || !Number.isFinite(n)) return 0;
  let r = Math.round(n) % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

function coerceBbox(o: Record<string, unknown>): BBoxNormalized | undefined {
  const raw =
    (o.bbox_normalized as Record<string, unknown> | undefined) ??
    (o.bbox as Record<string, unknown> | undefined) ??
    (o.bounding_box as Record<string, unknown> | undefined);
  if (!raw || typeof raw !== "object") return undefined;

  const xMin =
    num(raw.x_min) ??
    num(raw.xMin) ??
    num(raw.left);
  const yMin =
    num(raw.y_min) ??
    num(raw.yMin) ??
    num(raw.top);
  const xMax =
    num(raw.x_max) ??
    num(raw.xMax) ??
    num(raw.right);
  const yMax =
    num(raw.y_max) ??
    num(raw.yMax) ??
    num(raw.bottom);

  if (
    xMin === undefined ||
    yMin === undefined ||
    xMax === undefined ||
    yMax === undefined
  ) {
    return undefined;
  }

  return {
    x_min: xMin,
    y_min: yMin,
    x_max: xMax,
    y_max: yMax,
  };
}

function coerceItem(raw: unknown): VisionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const category = coerceCategory(o.category);
  const style_tags = coerceStringArray(o.style_tags);
  const colors = coerceStringArray(o.colors);
  const features =
    typeof o.features === "string" && o.features.trim()
      ? o.features.trim()
      : "의류";

  const season = coerceSeason(o.season);
  const bbox_normalized = coerceBbox(o);
  const fitting_rotation_deg = coerceFittingRotation(o.fitting_rotation_deg);

  // 하의일 때만 subtype 부여. 모델이 빠뜨렸거나 이상한 값이면 features 텍스트로 추정.
  let bottom_subtype: BottomSubtype | undefined;
  if (category === "하의") {
    bottom_subtype =
      coerceBottomSubtype(o.bottom_subtype) ??
      coerceBottomSubtype(o.bottomSubtype) ??
      coerceBottomSubtype(o.subtype) ??
      inferBottomSubtypeFromText([
        String(o.category ?? ""),
        features,
        ...style_tags,
      ]);
  }

  return {
    category,
    style_tags: style_tags.length ? style_tags : ["캐주얼"],
    season,
    colors: colors.length ? colors : ["믹스"],
    features,
    fitting_rotation_deg,
    ...(bbox_normalized ? { bbox_normalized } : {}),
    ...(bottom_subtype ? { bottom_subtype } : {}),
  };
}

function parseVisionItems(raw: string): VisionItem[] {
  const text = stripJsonFence(raw);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "이미지 분석 JSON을 읽지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
  }

  const root = data as { items?: unknown };
  if (!Array.isArray(root.items)) {
    throw new Error(
      "이미지에서 옷 목록을 찾지 못했습니다. 다른 사진으로 시도해 보세요."
    );
  }

  const items = root.items
    .map(coerceItem)
    .filter((x): x is VisionItem => x !== null);

  if (items.length === 0) {
    throw new Error("인식된 옷이 없습니다.");
  }

  return items;
}

export async function analyzeClothingImageBase64(
  mimeType: string,
  base64: string
): Promise<VisionItem[]> {
  const openai = getOpenAI();
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8192,
    temperature: 0.15,
  });

  const choice = completion.choices[0];
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error("이미지 분석 결과가 비어 있습니다. 다시 시도해 주세요.");
  }

  if (choice?.finish_reason === "length") {
    throw new Error(
      "분석 응답이 너무 길어 잘렸습니다. 한 번에 옷이 너무 많으면 사진을 나눠 올려 주세요."
    );
  }

  return parseVisionItems(raw);
}
