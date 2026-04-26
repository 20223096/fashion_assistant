"use client";

import { MannequinLayers } from "@/components/fitting/MannequinLayers";
import { useClapDetector } from "@/hooks/use-clap-detector";
import type { ClothesRow } from "@/types/models";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OutfitResolved = {
  title: string;
  rationale: string;
  pieces: ClothesRow[];
};

export function VirtualFittingRoom() {
  const [outfits, setOutfits] = useState<OutfitResolved[]>([]);
  const [styleLabel, setStyleLabel] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const bump = useCallback(() => {
    setIndex((i) => (outfits.length === 0 ? 0 : (i + 1) % outfits.length));
  }, [outfits.length]);

  const { start, stop, micReady, micError } = useClapDetector({
    onClap: bump,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/outfits/fitting");
        const data = (await res.json()) as {
          outfits?: OutfitResolved[];
          requested_style?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setLoadError(data.error ?? "불러오기 실패");
          return;
        }
        if (cancelled) return;
        setOutfits(data.outfits ?? []);
        setStyleLabel(data.requested_style ?? null);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("네트워크 오류");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = outfits[index] ?? null;
  const faceImageUrl = "/api/avatar/face?v=3";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">
          Virtual Studio
        </p>
        <h1 className="mt-1 text-xl font-semibold text-stone-900">가상 피팅룸</h1>
        <p className="mt-1 text-sm text-stone-500">
          온라인 피팅 서비스처럼 아바타에 코디를 레이어링해서 보여 줍니다.
          박수로 다음 코디로 넘길 수 있어요.
        </p>
      </div>

      {loadError && (
        <p className="text-center text-sm text-red-600">{loadError}</p>
      )}

      {outfits.length === 0 && !loadError && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6 text-center text-sm text-stone-700">
          <p>아직 불러올 코디가 없습니다.</p>
          <p className="mt-2">
            메인 화면에서{" "}
            <Link href="/" className="font-medium text-amber-900 underline">
              AI 코디 추천
            </Link>
            을 한 번 받아 주세요.
          </p>
        </div>
      )}

      {current && (
        <>
          {outfits.length > 1 && (
            <div className="md:hidden">
              <p className="mb-2 text-center text-[11px] font-semibold text-rose-500">
                코디를 옆으로 슉 넘겨 골라요
              </p>
              <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {outfits.map((o, i) => {
                  const thumb = o.pieces[0]?.image_url;
                  return (
                    <button
                      key={`${o.title}-${i}`}
                      type="button"
                      onClick={() => setIndex(i)}
                      className={`shrink-0 snap-start overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition ${
                        i === index
                          ? "border-rose-400 ring-2 ring-rose-200"
                          : "border-rose-100 opacity-80"
                      }`}
                      style={{ width: "4.5rem" }}
                    >
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumb} alt="" className="aspect-[3/4] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[3/4] w-full items-center justify-center bg-rose-50 text-[10px] text-rose-400">
                          코디
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <MannequinLayers pieces={current.pieces} faceImageUrl={faceImageUrl} />
          <div className="space-y-1 rounded-2xl border border-stone-100 bg-white p-4 text-center shadow-sm">
            <p className="text-xs text-stone-400">
              코디 {index + 1} / {outfits.length}
              {styleLabel ? ` · ${styleLabel}` : ""}
            </p>
            <p className="font-medium text-stone-900">{current.title}</p>
            <p className="text-sm leading-relaxed text-stone-600">
              {current.rationale}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % outfits.length)}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              다음 코디
            </button>
            {!micReady ? (
              <button
                type="button"
                onClick={() => void start()}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                박수 감지 켜기
              </button>
            ) : (
              <button
                type="button"
                onClick={() => stop()}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
              >
                박수 감지 끄기
              </button>
            )}
          </div>

          {micError && (
            <p className="text-center text-xs text-red-600">{micError}</p>
          )}
          {micReady && (
            <p className="text-center text-xs text-stone-500">
              조용한 곳에서 박수를 치면 다음 코디로 넘어갑니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
