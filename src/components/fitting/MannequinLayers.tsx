"use client";

import type { BottomSubtype, ClothesRow } from "@/types/models";
import { useId, useMemo, useState } from "react";

/**
 * 기존 DB 행에 `bottom_subtype`이 없을 때 features/style_tags 텍스트로 추정.
 * vision 쪽의 추정기와 동기화된 간단 버전.
 */
function resolveBottomSubtype(piece: ClothesRow): BottomSubtype {
  const explicit = piece.bottom_subtype ?? null;
  if (
    explicit === "pants" ||
    explicit === "shorts" ||
    explicit === "skirt" ||
    explicit === "tennis_skirt"
  ) {
    return explicit;
  }
  const blob = [piece.features ?? "", ...(piece.style_tags ?? [])]
    .join(" ")
    .toLowerCase();
  if (
    /테니스\s*(치마|스커트)|치어리더|cheer(leader)?|tennis\s*skirt|플리츠\s*(치마|스커트|미니)/.test(
      blob
    )
  ) {
    return "tennis_skirt";
  }
  if (/반바지|쇼츠|숏\s*팬츠|버뮤다|\bshorts?\b|\bbermuda\b/.test(blob)) {
    return "shorts";
  }
  if (/치마|스커트|\bskirt\b/.test(blob)) {
    return "skirt";
  }
  return "pants";
}

/** 코디에 같은 카테고리가 여러 벌이면 첫 벌만 사용 (슬롯은 하나) */
function pickPieces(pieces: ClothesRow[]) {
  const byCat = new Map<string, ClothesRow>();
  for (const p of pieces) {
    if (!byCat.has(p.category)) byCat.set(p.category, p);
  }
  return {
    dress: byCat.get("원피스"),
    top: byCat.get("상의"),
    bottom: byCat.get("하의"),
    outer: byCat.get("아우터"),
    shoes: byCat.get("신발"),
    bag: byCat.get("가방"),
  };
}

/** viewBox — 하단 여유를 두어 신발이 잘리지 않게 */
const VB = { w: 240, h: 508 };

/** 넥라인보다 아래로 앵커를 내림 → 상의와 더 겹침(얼굴은 SVG 아래·상의가 위) */
const FACE_EXTRA_DOWN_VB = 32;

/** 긴바지: 허리~발목까지 **한 덩어리** 실루엣.
 *  예전 PATH 는 두 다리 사이에 좁은 가랑이(플랫레이 한 장 이미지의 중앙·허벅지)를
 *  clip 밖으로 빼서, 세로로 찢어진 것처럼 보이는 문제가 있었음.
 *  플랫레이 PNG 는 가랑이 구멍이 없으므로, clip 도 단일 영역으로 맞춤. */
const PATH_LEGS =
  "M70 220 Q70 206 82 200 L158 200 Q170 206 170 220 L182 454 L120 462 L58 454 Z";

/** 반바지: 허리~허벅지 중간까지의 사다리꼴 (기장 짧음, 가로는 긴바지와 비슷하게 넉넉) */
const PATH_SHORTS =
  "M62 214 Q62 206 78 206 L162 206 Q178 206 178 214 L192 298 L48 298 Z";

/** 스커트: 허리~무릎 위까지, 밑단으로 갈수록 조금 퍼짐(A라인) */
const PATH_SKIRT =
  "M80 212 L160 212 L172 360 L68 360 Z";

/** 테니스스커트: 허리~허벅지 중상단, 플리츠 느낌 — 짧고 더 많이 퍼짐 */
const PATH_TENNIS_SKIRT =
  "M82 214 L158 214 L180 318 L60 318 Z";

/** 상의: 어깨~골반 사다리꼴 (어깨 넓고 허리 좁게) */
const PATH_TORSO =
  // 어깨는 부드럽게, 하단 라운드는 아주 약하게(미세 round)
  "M66 136 Q74 116 94 108 Q120 100 146 108 Q166 116 174 136 L178 206 Q172 236 150 246 Q120 254 90 246 Q68 236 62 206 L62 241 Q62 246 67 246 L173 246 Q178 246 178 241 Z";

/** 아우터: 어깨 패드·기장 넉넉 */
const PATH_OUTER =
  "M60 100 L180 100 L188 270 L52 270 Z";

/** 신발: 발목~바닥 (viewBox 하단 안쪽까지) — 하의와 닿도록 위로 올림 */
const PATH_FEET =
  "M72 372 L168 372 L170 488 L70 488 Z";

/** 가방: 옆구리 슬롯 */
const PATH_BAG =
  "M172 128 L232 128 L232 248 L168 248 Z";

/** SVG는 뒤에 그린 요소가 앞면. `piece.category` 기준으로 정렬해 슬롯 키 실수에도 겹침 순서 보장. */
/** 신발을 먼저 그려 하의·상의 아래(발 쪽)에 깔림 */
const CATEGORY_PAINT_RANK: Record<string, number> = {
  신발: 5,
  하의: 12,
  상의: 22,
  원피스: 22,
  아우터: 30,
  가방: 40,
  액세서리: 3,
};

const SLOT_PAINT_KEYS = [
  "shoes",
  "bottom",
  "dress",
  "top",
  "outer",
  "bag",
] as const;

function slotPaintRank(piece: ClothesRow): number {
  return CATEGORY_PAINT_RANK[piece.category] ?? 15;
}

function slotKeyOrder(key: string): number {
  const i = SLOT_PAINT_KEYS.indexOf(key as (typeof SLOT_PAINT_KEYS)[number]);
  return i === -1 ? 99 : i;
}

type GarmentSlot = {
  piece: ClothesRow | undefined;
  clipPathId?: string;
  /** clip path 바깥 직사각형 (이미지 배치·slice 기준) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** flat lay 사진에서 어느 쪽을 몸에 맞출지 */
  preserveAspectRatio: string;
  opacity?: number;
  /**
   * false: 상의 등 얼굴·머리 위에 올릴 때 drop-shadow 가 반투명 경계와 섞여
   * 흰 막처럼 보이는 경우가 있어 상의만 끔.
   */
  dropShadow?: boolean;
};

function GarmentImage({
  href,
  slot,
}: {
  href: string;
  slot: GarmentSlot;
}) {
  const { clipPathId, x, y, width, height, preserveAspectRatio, opacity } =
    slot;

  const shadowClass =
    slot.dropShadow === false
      ? undefined
      : "drop-shadow-[0_2px_6px_rgba(0,0,0,0.2)]";

  return (
    <image
      href={href}
      x={x}
      y={y}
      width={width}
      height={height}
      preserveAspectRatio={preserveAspectRatio}
      {...(clipPathId ? { clipPath: `url(#${clipPathId})` } : {})}
      {...(shadowClass ? { className: shadowClass } : {})}
      style={{ opacity: opacity ?? 1 }}
    />
  );
}

/** viewBox 안에서만 그림 — 신발·하의 뒤, 상의·원피스 앞 (알파 한 번만 섞임) */
const FACE_VB_W = 74;
const FACE_VB_H = 102;

function MannequinFaceInSvg({
  faceImageUrl,
  faceAnchorY,
}: {
  faceImageUrl?: string;
  /** viewBox Y: 목·턱 기준선(foreignObject 하단에 맞춤) */
  faceAnchorY: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const canUsePhoto = Boolean(faceImageUrl) && !imgFailed;
  const x = (VB.w - FACE_VB_W) / 2;
  const y = Math.max(4, faceAnchorY - FACE_VB_H);

  if (canUsePhoto) {
    // iOS WebKit(WKWebView) 은 <foreignObject> 안의 <img> 에서 %-치수가 깨져
    // 이미지가 원본 크기로 그려지면서 좌측이 잘려 나가는 알려진 버그가 있다.
    // 안전하게 SVG 의 네이티브 <image> 로 그리고, preserveAspectRatio 로
    //  - xMid : 가로 중앙 정렬
    //  - YMax : 세로 하단(턱 라인) 정렬
    //  - meet : 종횡비 유지하며 박스 안에 맞춤
    // 동일한 정렬 규칙을 옷 슬롯과 같은 경로로 통일해 WebKit/Chromium 양쪽에서 일관되게 동작한다.
    return (
      <image
        href={faceImageUrl}
        x={x}
        y={y}
        width={FACE_VB_W}
        height={FACE_VB_H}
        preserveAspectRatio="xMidYMax meet"
        onError={() => setImgFailed(true)}
        className="pointer-events-none"
        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))" }}
        aria-hidden
      />
    );
  }

  const sc = FACE_VB_W / 100;
  return (
    <g
      transform={`translate(${x}, ${y + (FACE_VB_H - 110 * sc) / 2}) scale(${sc})`}
      className="pointer-events-none text-stone-300 drop-shadow-sm"
      aria-hidden
    >
      <ellipse
        cx="50"
        cy="48"
        rx="38"
        ry="42"
        fill="#fafaf9"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <ellipse cx="38" cy="44" rx="4" ry="5" fill="#57534e" />
      <ellipse cx="62" cy="44" rx="4" ry="5" fill="#57534e" />
      <path
        d="M38 62 Q50 72 62 62"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  );
}

export function MannequinLayers({
  pieces,
  faceImageUrl,
}: {
  pieces: ClothesRow[];
  faceImageUrl?: string;
}) {
  const { dress, top, bottom, outer, shoes, bag } = pickPieces(pieces);
  const hasDress = Boolean(dress);

  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "") || "fit";

  const clips = useMemo(
    () => ({
      legs: `${uid}-clip-legs`,
      shorts: `${uid}-clip-shorts`,
      skirt: `${uid}-clip-skirt`,
      tennisSkirt: `${uid}-clip-tennis-skirt`,
      torso: `${uid}-clip-torso`,
      dress: `${uid}-clip-dress`,
      outer: `${uid}-clip-outer`,
      feet: `${uid}-clip-feet`,
      bag: `${uid}-clip-bag`,
    }),
    [uid]
  );

  // 상의 슬롯 (얼굴 위치는 `faceNecklineY`로 이 Y에 턱 맞춤, 좌표는 변경하지 않음)
  const TOP_X = 56;
  const TOP_Y = 96;
  const TOP_W = 126;
  const TOP_H = 124;

  /**
   * 하의 subtype 별 슬롯 프로파일.
   *
   * 설계 원칙:
   *   - y(허리 시작)는 서브타입 관계없이 210 으로 고정 → 상의 하단과 맞물리는 라인이 일정
   *   - height 는 subtype 의 실제 기장 비율을 반영 (pants 100% ~ tennis_skirt ~55%)
   *   - width 는 실루엣이 퍼지는 정도(스커트 > 테니스스커트 > 긴바지 > 반바지) 를 반영
   *   - clip 은 실제 실루엣과 가장 비슷한 path (긴바지는 플랫레이용 단일 실루엣)
   *   - preserveAspectRatio 는 언제나 `xMidYMin meet` → 원본 비율 유지 + 허리 라인 상단 정렬
   *     이렇게 해야 원본이 어떤 비율이든 세로로 과하게 늘어나지 않습니다.
   */
  type BottomProfile = {
    x: number;
    y: number;
    width: number;
    height: number;
    clipKey: keyof typeof clips | null;
  };

  const BOTTOM_PROFILES: Record<BottomSubtype, BottomProfile> = {
    // 바지 계열(pants/shorts)만 가로폭을 크게 늘리고 스커트 계열은 원래 실루엣 유지.
    // x 는 width 변경 시 viewBox 중심(120)에 정렬되도록 함께 이동.
    // 긴바지·반바지의 clip path 도 함께 넓혀서 실제 시각적 폭이 같이 늘어나도록 맞춤.
    pants: { x: 50, y: 210, width: 140, height: 186, clipKey: "legs" },
    shorts: { x: 50, y: 210, width: 140, height: 96, clipKey: "shorts" },
    skirt: { x: 62, y: 210, width: 116, height: 150, clipKey: "skirt" },
    // 테니스스커트: 마네킹 전체(508) 기준 약 22%, 하의 기본 영역(186) 의 ~58% 만 차지
    tennis_skirt: {
      x: 58,
      y: 210,
      width: 124,
      height: 110,
      clipKey: "tennisSkirt",
    },
  };

  const slots: { key: string; slot: GarmentSlot }[] = [];

  if (shoes) {
    slots.push({
      key: "shoes",
      slot: {
        piece: shoes,
        clipPathId: clips.feet,
        x: 70,
        y: 378,
        width: 100,
        height: 110,
        preserveAspectRatio: "xMidYMid meet",
      },
    });
  }

  if (!hasDress && bottom) {
    const subtype = resolveBottomSubtype(bottom);
    const profile = BOTTOM_PROFILES[subtype];
    slots.push({
      key: "bottom",
      slot: {
        piece: bottom,
        clipPathId: profile.clipKey ? clips[profile.clipKey] : undefined,
        x: profile.x,
        y: profile.y,
        width: profile.width,
        height: profile.height,
        // ❗ `slice` 대신 `meet` 로 바꿔서 세로로 강제로 잡아 늘리는 현상을 방지.
        //    허리(상단)를 기준선에 맞추기 위해 YMin 정렬.
        preserveAspectRatio: "xMidYMin meet",
      },
    });
  }

  if (hasDress && dress) {
    slots.push({
      key: "dress",
      slot: {
        piece: dress,
        clipPathId: clips.dress,
        x: 56,
        y: 88,
        width: 128,
        height: 360,
        preserveAspectRatio: "xMidYMid slice",
      },
    });
  } else if (top) {
    slots.push({
      key: "top",
      slot: {
        piece: top,
        x: TOP_X,
        y: TOP_Y,
        width: TOP_W,
        height: TOP_H,
        /** 상의 좌우 여백을 유지하면서 어깨선에 맞춤 */
        preserveAspectRatio: "xMidYMin meet",
        dropShadow: false,
      },
    });
  }

  if (outer) {
    slots.push({
      key: "outer",
      slot: {
        piece: outer,
        clipPathId: clips.outer,
        x: 44,
        y: 72,
        width: 152,
        height: 228,
        preserveAspectRatio: "xMidYMid slice",
        opacity: 0.97,
      },
    });
  }

  if (bag) {
    slots.push({
      key: "bag",
      slot: {
        piece: bag,
        clipPathId: clips.bag,
        x: 162,
        y: 108,
        width: 78,
        height: 142,
        preserveAspectRatio: "xMidYMid slice",
      },
    });
  }

  /** 상의 슬롯 넥라인 + 추가 하향 → 상의와 겹침(얼굴은 SVG 아래 레이어) */
  const faceNecklineY = hasDress ? 88 : top ? TOP_Y : 100;
  const faceAnchorY = Math.min(VB.h - 4, faceNecklineY + FACE_EXTRA_DOWN_VB);

  const orderedSlots = [...slots].sort((a, b) => {
    const pa = a.slot.piece;
    const pb = b.slot.piece;
    if (!pa || !pb) return 0;
    const ra = slotPaintRank(pa);
    const rb = slotPaintRank(pb);
    if (ra !== rb) return ra - rb;
    return slotKeyOrder(a.key) - slotKeyOrder(b.key);
  });

  /** SVG paint 순서: 신발·하의 → 얼굴 → 상의·원피스·아우터·가방 (상의가 얼굴 위, 알파 한 번만) */
  const behindFaceKeys = new Set(["shoes", "bottom"]);
  const slotsBehindFace = orderedSlots.filter((s) => behindFaceKeys.has(s.key));
  const slotsInFrontOfFace = orderedSlots.filter((s) => !behindFaceKeys.has(s.key));

  return (
    <div className="relative mx-auto w-[min(100%,360px)]">
      <div
        className="relative w-full overflow-visible rounded-3xl bg-stone-100 shadow-inner ring-1 ring-stone-200/90"
        style={{ aspectRatio: `${VB.w} / ${VB.h}` }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="가상 피팅 마네킹"
        >
          <defs>
            <clipPath id={clips.legs} clipPathUnits="userSpaceOnUse">
              <path d={PATH_LEGS} />
            </clipPath>
            <clipPath id={clips.shorts} clipPathUnits="userSpaceOnUse">
              <path d={PATH_SHORTS} />
            </clipPath>
            <clipPath id={clips.skirt} clipPathUnits="userSpaceOnUse">
              <path d={PATH_SKIRT} />
            </clipPath>
            <clipPath id={clips.tennisSkirt} clipPathUnits="userSpaceOnUse">
              <path d={PATH_TENNIS_SKIRT} />
            </clipPath>
            <clipPath id={clips.torso} clipPathUnits="userSpaceOnUse">
              <path d={PATH_TORSO} />
            </clipPath>
            <clipPath id={clips.dress} clipPathUnits="userSpaceOnUse">
              <path d={PATH_TORSO} />
              <path d={PATH_LEGS} />
            </clipPath>
            <clipPath id={clips.outer} clipPathUnits="userSpaceOnUse">
              <path d={PATH_OUTER} />
            </clipPath>
            <clipPath id={clips.feet} clipPathUnits="userSpaceOnUse">
              <path d={PATH_FEET} />
            </clipPath>
            <clipPath id={clips.bag} clipPathUnits="userSpaceOnUse">
              <path d={PATH_BAG} />
            </clipPath>
          </defs>

          {slotsBehindFace.map(({ key, slot }) =>
            slot.piece ? (
              <GarmentImage key={key} href={slot.piece.image_url} slot={slot} />
            ) : null
          )}

          <MannequinFaceInSvg
            faceImageUrl={faceImageUrl}
            faceAnchorY={faceAnchorY}
          />

          {slotsInFrontOfFace.map(({ key, slot }) =>
            slot.piece ? (
              <GarmentImage key={key} href={slot.piece.image_url} slot={slot} />
            ) : null
          )}
        </svg>
      </div>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-stone-500">
        겹침은 SVG 안 순서(하의·얼굴·상의)로만 처리해 흐릿한 이중 알파가
        나지 않게 했습니다.
      </p>
    </div>
  );
}
