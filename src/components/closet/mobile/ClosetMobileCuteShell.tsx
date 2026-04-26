"use client";

import { signOutAction } from "@/app/auth/actions";
import { CategoryLibrary } from "@/components/closet/CategoryLibrary";
import { RecommendPanel } from "@/components/closet/RecommendPanel";
import { UploadZone } from "@/components/closet/UploadZone";
import type { ClothesRow } from "@/types/models";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClosetDoorIntro } from "./ClosetDoorIntro";

const STORAGE_KEY = "closet-pet-door-v1";
const COOKIE_KEY = "closet-intro-done";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1년

function writeIntroDoneCookie() {
  try {
    document.cookie = `${COOKIE_KEY}=1; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } catch {
    /* ignore */
  }
}

type Props = {
  clothes: ClothesRow[];
  displayName?: string | null;
  email?: string | null;
  /**
   * 서버에서 쿠키로 미리 판단한 "인트로 완료 여부".
   * 이 값을 초기 state 로 사용해서 하이드레이션 전 스피너 게이트를 없앤다.
   */
  initialIntroDone: boolean;
};

export function ClosetMobileCuteShell({
  clothes,
  displayName,
  email,
  initialIntroDone,
}: Props) {
  const [introDone, setIntroDone] = useState<boolean>(initialIntroDone);

  // 과거 버전에서 localStorage 에만 저장해 둔 사용자에게도 호환되도록,
  // 쿠키가 없으면 localStorage 값을 읽어 쿠키와 state 를 동기화한다.
  useEffect(() => {
    if (initialIntroDone) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") {
        writeIntroDoneCookie();
        setIntroDone(true);
      }
    } catch {
      /* ignore */
    }
  }, [initialIntroDone]);

  const finishIntro = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    writeIntroDoneCookie();
    setIntroDone(true);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-[linear-gradient(180deg,#fff1f2_0%,#fff7ed_35%,#fafaf9_100%)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-rose-100/80 bg-white/85 px-4 py-3 backdrop-blur-md">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
            my closet
          </p>
          <p className="truncate text-sm font-semibold text-rose-950">
            {displayName ?? email ?? "옷장"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/try-on"
            className="rounded-full bg-linear-to-r from-rose-400 to-amber-400 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-200/50 active:scale-[0.98]"
          >
            피팅룸
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full border border-rose-200 bg-white px-3 py-2 text-[11px] font-medium text-rose-800"
            >
              나가기
            </button>
          </form>
        </div>
      </header>

      {!introDone ? (
        <ClosetDoorIntro onEnter={finishIntro} />
      ) : (
        <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6 pt-4">
          <section className="rounded-3xl border border-rose-100 bg-white/90 p-4 shadow-sm shadow-rose-100/60">
            <h2 className="flex items-center gap-2 text-base font-bold text-rose-950">
              <span className="text-lg" aria-hidden>
                🪞
              </span>
              내 옷들
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-rose-800/70">
              문 너머에 걸린 옷이에요. 카테고리별로 모아 두었어요.
            </p>
            <div className="mt-4">
              <CategoryLibrary clothes={clothes} density="cozy" />
            </div>
          </section>

          <section className="rounded-3xl border border-amber-100 bg-white/95 p-4 shadow-sm shadow-amber-100/50">
            <RecommendPanel clothes={clothes} surface="cosy" />
          </section>

          <section className="rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-sm shadow-rose-100/60">
            <h2 className="flex items-center gap-2 text-base font-bold text-rose-950">
              <span className="text-lg" aria-hidden>
                📷
              </span>
              옷 등록하기
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-rose-800/70">
              사진을 올리면 AI가 자동으로 카테고리를 분류해줘요.
            </p>
            <div className="mt-3">
              <UploadZone variant="cosy" />
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
