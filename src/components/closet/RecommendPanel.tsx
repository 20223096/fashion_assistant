"use client";

import { requestOutfitsAction } from "@/app/outfits/actions";
import { INITIAL_RECOMMEND_STATE } from "@/app/outfits/recommend-state";
import type {
  ClothesRow,
  OutfitVariant,
  ShoeRecommendation,
  ShoeRecommendationKind,
} from "@/types/models";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Props = {
  clothes: ClothesRow[];
  /** 모바일 귀여운 옷장 — 카드·가로 캐러셀 강조 */
  surface?: "default" | "cosy";
};

function styleTokens(style: string): string[] {
  return style
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

const SHOE_KIND_ICON: Record<ShoeRecommendationKind, string> = {
  sneakers: "👟",
  loafers: "👞",
  boots: "🥾",
  heels: "👠",
  sandals: "🩴",
  slippers: "🥿",
  mules: "🥿",
  others: "👢",
};

const SHOE_KIND_LABEL: Record<ShoeRecommendationKind, string> = {
  sneakers: "스니커즈",
  loafers: "로퍼",
  boots: "부츠",
  heels: "힐",
  sandals: "샌들",
  slippers: "슬리퍼",
  mules: "뮬",
  others: "신발",
};

function shouldShowRecommendedShoe(
  outfit: OutfitVariant,
  byId: Map<string, ClothesRow>
): boolean {
  if (!outfit.shoe_recommendation) return false;
  const hasShoeInPieces = outfit.piece_ids.some(
    (id) => byId.get(id)?.category === "신발"
  );
  return !hasShoeInPieces;
}

function RecommendedShoeCard({
  rec,
  cosy,
}: {
  rec: ShoeRecommendation;
  cosy: boolean;
}) {
  return (
    <div
      className={
        cosy
          ? "flex w-28 shrink-0 flex-col overflow-hidden rounded-xl border-2 border-dashed border-rose-300/70 bg-rose-50/60 shadow-sm"
          : "flex w-28 shrink-0 flex-col overflow-hidden rounded-xl border border-dashed border-amber-300 bg-amber-50/60 shadow-sm"
      }
      title={rec.description}
    >
      <div className="flex aspect-[3/4] w-full items-center justify-center text-4xl">
        <span role="img" aria-label={SHOE_KIND_LABEL[rec.kind]}>
          {SHOE_KIND_ICON[rec.kind]}
        </span>
      </div>
      <div className="px-1.5 pb-1.5 pt-1 text-center">
        <p
          className={
            cosy
              ? "text-[10px] font-bold text-rose-700"
              : "text-[10px] font-semibold text-amber-800"
          }
        >
          추천 신발
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-stone-700">
          {rec.name}
        </p>
      </div>
    </div>
  );
}

function scoreOutfitForStyle(
  style: string,
  outfit: { title: string; rationale: string }
): number {
  const tokens = styleTokens(style);
  if (tokens.length === 0) return 0;
  const text = `${outfit.title} ${outfit.rationale}`.toLowerCase();
  let score = 0;
  for (const tk of tokens) {
    if (text.includes(tk)) score += 1;
  }
  return score;
}

export function RecommendPanel({ clothes, surface = "default" }: Props) {
  const cosy = surface === "cosy";
  const [style, setStyle] = useState("미니멀 데일리");
  // 서버 액션 기반. form 이 submit 되면 pending=true → 결과가 state.result 로 들어옴.
  // JS 하이드레이션 전에 submit 돼도 브라우저 기본 폼 전송으로 서버가 처리하고
  // 같은 페이지가 새 state 로 재렌더되기 때문에 iOS WebView 타이밍 문제를 회피할 수 있다.
  const [state, formAction, loading] = useActionState(
    requestOutfitsAction,
    INITIAL_RECOMMEND_STATE
  );
  const result = state.result;
  const err = state.error;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [kwSlide, setKwSlide] = useState(0);

  const byId = new Map(clothes.map((c) => [c.id, c] as const));

  // 결과 정렬은 "요청에 사용된 스타일"(서버가 반환한 state.style) 기준으로 해야
  // 사용자가 입력창을 바꾼 순간에 정렬이 어긋나지 않는다.
  const sortStyle = state.style || style;

  const keywordSorted = useMemo(() => {
    if (!result?.keyword_outfits.length) return [];
    return [...result.keyword_outfits].sort(
      (a, b) =>
        scoreOutfitForStyle(sortStyle, b) - scoreOutfitForStyle(sortStyle, a)
    );
  }, [result?.keyword_outfits, sortStyle]);

  useEffect(() => {
    setKwSlide(0);
    scrollRef.current?.scrollTo({ left: 0 });
    // nonce 는 같은 결과여도 "새로 제출된 이벤트"를 감지할 수 있게 함.
  }, [state.nonce]);

  const scrollKeywordBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const w = el.clientWidth || el.offsetWidth;
    el.scrollBy({ left: dir * w, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || keywordSorted.length <= 1) return;

    const onScroll = () => {
      const w = el.clientWidth || 1;
      const i = Math.round(el.scrollLeft / w);
      setKwSlide(Math.max(0, Math.min(keywordSorted.length - 1, i)));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [keywordSorted.length]);

  function OutfitCard({
    o,
    badge,
  }: {
    o: OutfitVariant;
    badge?: string;
  }) {
    return (
      <article
        className={
          cosy
            ? "flex h-full flex-col overflow-hidden rounded-3xl border-2 border-rose-100 bg-linear-to-b from-rose-50/80 to-white shadow-md shadow-rose-100/40"
            : "flex h-full flex-col overflow-hidden rounded-2xl border border-stone-100 bg-linear-to-b from-stone-50 to-white shadow-sm"
        }
      >
        <div
          className={
            cosy ? "border-b border-rose-100/80 px-3 py-2.5" : "border-b border-stone-100 px-4 py-3"
          }
        >
          {badge && (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
              {badge}
            </span>
          )}
          <p className={`font-medium text-stone-900 ${badge ? "mt-1.5" : ""}`}>
            {o.title}
          </p>
          {o.reference?.title && (
            <p
              className={
                cosy
                  ? "mt-1.5 rounded-full bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900 inline-flex items-center gap-1"
                  : "mt-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700 inline-flex items-center gap-1"
              }
              title={o.reference.source_hint ?? undefined}
            >
              <span aria-hidden>🔗</span>
              <span>레퍼런스: {o.reference.title}</span>
              {o.reference.source_url && (
                <a
                  href={o.reference.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline decoration-dotted underline-offset-2"
                >
                  원본
                </a>
              )}
            </p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-stone-600">
            {o.rationale}
          </p>
          {shouldShowRecommendedShoe(o, byId) && o.shoe_recommendation && (
            <p
              className={
                cosy
                  ? "mt-2 rounded-lg bg-rose-100/70 px-2 py-1.5 text-[11px] leading-relaxed text-rose-900"
                  : "mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900"
              }
            >
              <span className="mr-1" aria-hidden>
                {SHOE_KIND_ICON[o.shoe_recommendation.kind]}
              </span>
              <span className="font-semibold">
                {o.shoe_recommendation.name}
              </span>
              <span className="ml-1 text-stone-600">
                — {o.shoe_recommendation.description}
              </span>
            </p>
          )}
        </div>
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
          {o.piece_ids.map((id) => {
            const piece = byId.get(id);
            if (!piece) return null;
            return (
              <div
                key={id}
                className="w-20 shrink-0 overflow-hidden rounded-xl border border-stone-100 bg-white shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={piece.image_url}
                  alt=""
                  className="aspect-[3/4] w-full object-cover"
                />
                <p className="truncate px-1 py-1 text-center text-[10px] text-stone-500">
                  {piece.category}
                </p>
              </div>
            );
          })}
          {/* 옷장에 신발이 없거나 맞는 신발이 없을 때, 추천 신발을 함께 보여 준다. */}
          {shouldShowRecommendedShoe(o, byId) && o.shoe_recommendation && (
            <RecommendedShoeCard rec={o.shoe_recommendation} cosy={cosy} />
          )}
        </div>
      </article>
    );
  }

  const otherOutfits = result?.other_outfits ?? [];

  return (
    <div
      className={
        cosy
          ? "space-y-4 p-0"
          : "space-y-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
      }
    >
      <div>
        <h2
          className={
            cosy
              ? "flex items-center gap-2 text-base font-bold text-amber-950"
              : "text-base font-semibold text-stone-900"
          }
        >
          {cosy && <span aria-hidden>✨</span>}
          AI 코디 추천
        </h2>
        <p
          className={
            cosy
              ? "mt-1 text-xs leading-relaxed text-amber-900/70"
              : "mt-1 text-sm text-stone-500"
          }
        >
          {cosy
            ? "Pinterest·Instagram 에서 실제 유행 룩을 찾아와 내 옷장으로 최대한 비슷하게 재현해 줘요."
            : "Pinterest·Instagram 에서 유행하는 레퍼런스 룩을 찾아, 내 옷장 아이템으로 가장 가까운 조합을 만들어 제안합니다."}
        </p>
      </div>
      <form
        action={formAction}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="flex-1">
          <span
            className={
              cosy ? "text-[11px] font-bold text-amber-800/80" : "text-xs font-medium text-stone-500"
            }
          >
            스타일 키워드
          </span>
          <input
            name="style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className={
              cosy
                ? "mt-1 w-full rounded-2xl border-2 border-amber-100 bg-amber-50/50 px-3 py-2.5 text-sm text-amber-950 outline-none ring-rose-200/50 focus:ring-2"
                : "mt-1 w-full rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 outline-none ring-amber-500/30 focus:ring-2"
            }
            placeholder="예: 미니멀 데일리, 올블랙"
          />
        </label>
        <button
          type="submit"
          disabled={loading || clothes.length === 0}
          className={
            cosy
              ? "h-11 shrink-0 rounded-2xl bg-linear-to-r from-rose-500 to-amber-500 px-5 text-sm font-bold text-white shadow-md shadow-rose-200/40 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              : "h-10 shrink-0 rounded-lg bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          }
        >
          {loading ? "생성 중…" : "코디 받기"}
        </button>
      </form>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {result && result.keyword_outfits.length > 0 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-stone-800">
                키워드 맞춤 코디
              </h3>
              {keywordSorted.length > 1 && (
                <span className="text-xs text-stone-500">
                  {kwSlide + 1} / {keywordSorted.length}
                </span>
              )}
            </div>
            <div className="relative">
              {keywordSorted.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="이전 코디"
                    onClick={() => scrollKeywordBy(-1)}
                    className={
                      cosy
                        ? "absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-rose-100 bg-white text-lg font-bold text-rose-500 shadow-md"
                        : "absolute left-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md backdrop-blur-sm sm:flex"
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="다음 코디"
                    onClick={() => scrollKeywordBy(1)}
                    className={
                      cosy
                        ? "absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border-2 border-rose-100 bg-white text-lg font-bold text-rose-500 shadow-md"
                        : "absolute right-1 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-700 shadow-md backdrop-blur-sm sm:flex"
                    }
                  >
                    ›
                  </button>
                </>
              )}
              <div
                ref={scrollRef}
                className="flex snap-x snap-mandatory gap-0 overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {keywordSorted.map((o, i) => (
                  <div
                    key={`${o.title}-${i}`}
                    className={
                      cosy
                        ? "w-full min-w-full shrink-0 snap-center snap-always px-2"
                        : "w-full min-w-full shrink-0 snap-center snap-always px-0 sm:px-10"
                    }
                  >
                    <OutfitCard
                      o={o}
                      badge={`${sortStyle} · 코디 ${i + 1}/${keywordSorted.length}`}
                    />
                  </div>
                ))}
              </div>
            </div>
            {keywordSorted.length > 1 && (
              <p
                className={
                  cosy
                    ? "text-center text-[11px] font-medium text-rose-400"
                    : "text-center text-[11px] text-stone-500"
                }
              >
                {cosy
                  ? "손가락으로 쓱 넘기거나 화살표를 눌러 코디를 바꿔 보세요"
                  : "카드를 좌우로 밀어 넘기거나, 화살표 버튼으로 볼 수 있어요."}
              </p>
            )}
            {keywordSorted.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {keywordSorted.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`코디 ${i + 1}로 이동`}
                    onClick={() => {
                      const el = scrollRef.current;
                      if (!el) return;
                      const w = el.clientWidth || el.offsetWidth;
                      el.scrollTo({ left: i * w, behavior: "smooth" });
                      setKwSlide(i);
                    }}
                    className={`h-1.5 rounded-full transition-all ${
                      i === kwSlide
                        ? "w-6 bg-amber-600"
                        : "w-1.5 bg-stone-300 hover:bg-stone-400"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {otherOutfits.length > 0 && (
            <div className="space-y-3 border-t border-stone-100 pt-5">
              <p className="text-sm font-semibold text-stone-700">
                키워드와 다른 추천 코디
              </p>
              <p className="text-xs text-stone-500">
                위에서 입력한 스타일과 겹치지 않게, 다른 무드의 조합입니다.
              </p>
              <ul className="grid gap-4 md:grid-cols-2">
                {otherOutfits.map((o, i) => (
                  <li key={`${o.title}-other-${i}`}>
                    <OutfitCard o={o} badge="다른 무드" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {result &&
        result.keyword_outfits.length === 0 &&
        result.purchase_suggestions.length > 0 && (
          <p className="text-sm text-stone-600">
            이번 키워드로 만들 수 있는 코디가 없습니다. 아래 제안을 참고해 옷을
            더 등록해 보세요.
          </p>
        )}

      {result && result.purchase_suggestions.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
          <h3 className="text-sm font-semibold text-amber-950">추가로 있으면 좋은 아이템</h3>
          <ul className="mt-3 space-y-3">
            {result.purchase_suggestions.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium text-amber-900">{s.category}</span>
                <span className="text-stone-600"> — {s.item_idea}</span>
                <p className="mt-0.5 text-xs text-stone-500">{s.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
