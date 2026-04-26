"use client";

import { finishClosetIntroAction } from "@/app/closet-intro/actions";
import { useCallback, useState } from "react";

function PetMascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="pet-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="78" rx="48" ry="52" fill="url(#pet-body)" stroke="#d97706" strokeWidth="2" />
      <ellipse cx="60" cy="52" rx="38" ry="36" fill="#fef3c7" stroke="#d97706" strokeWidth="2" />
      <ellipse cx="48" cy="48" rx="5" ry="6" fill="#1c1917" />
      <ellipse cx="72" cy="48" rx="5" ry="6" fill="#1c1917" />
      <ellipse cx="50" cy="50" rx="2" ry="2" fill="#fff" opacity="0.9" />
      <ellipse cx="74" cy="50" rx="2" ry="2" fill="#fff" opacity="0.9" />
      <ellipse cx="42" cy="58" rx="6" ry="4" fill="#fda4af" opacity="0.7" />
      <ellipse cx="78" cy="58" rx="6" ry="4" fill="#fda4af" opacity="0.7" />
      <path
        d="M52 62 Q60 68 68 62"
        fill="none"
        stroke="#92400e"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="60" cy="22" r="6" fill="#f472b6" opacity="0.9" />
    </svg>
  );
}

type Props = {
  onEnter: () => void;
};

/**
 * 첫 방문 귀여운 인트로 — 문 열린 뒤 `onEnter` (localStorage/쿠키 저장은 부모).
 *
 * 전체를 `<form action={finishClosetIntroAction}>` 로 감싸서
 *  - JS 하이드레이션 **이전**에 탭하면 브라우저가 폼을 POST → 서버가 쿠키 심고 `/` 로 리다이렉트
 *  - JS 하이드레이션 **이후**에 탭하면 onClick 에서 `preventDefault` 로 가로채고
 *    짧은 애니메이션 후 `onEnter()` 로 클라이언트 사이드에서 마무리
 *
 * iOS WebView 에서 `next dev` 번들이 늦게 파싱되어 JS 이벤트가 안 먹는 상황을 폼 폴백으로 우회.
 */
export function ClosetDoorIntro({ onEnter }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openDoor = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // JS 가 살아 있으면 폼 submit 은 막고 클라이언트 사이드로 인트로를 닫는다.
      // JS 가 죽어 있으면 이 핸들러 자체가 실행되지 않으므로 기본 폼 submit → 서버 액션이 작동한다.
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      setOpen(true);
      window.setTimeout(() => onEnter(), 260);
    },
    [busy, onEnter]
  );

  const skipIntro = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (busy) return;
      onEnter();
    },
    [busy, onEnter]
  );

  return (
    <form
      action={finishClosetIntroAction}
      className="flex min-h-[min(72vh,520px)] flex-col items-center justify-center px-6 py-10"
    >
      <div className="relative flex w-full max-w-sm flex-col items-center gap-4">
        <div className="flex w-full items-end justify-center gap-2">
          <PetMascot className="h-28 w-28 shrink-0 drop-shadow-md" />
          <div className="relative mb-6 max-w-[200px] rounded-2xl rounded-bl-sm border-2 border-rose-200 bg-white px-3 py-2 shadow-md">
            <p className="text-center text-sm font-semibold leading-snug text-rose-900">
              여기는 내 옷장이야! 문 열고 들어와~
            </p>
            <div className="absolute -bottom-1 left-4 h-3 w-3 rotate-45 border-b-2 border-r-2 border-rose-200 bg-white" />
          </div>
        </div>

        <div className="relative mt-2 w-full max-w-[220px]">
          <div className="absolute inset-x-6 -top-2 h-4 rounded-full bg-stone-900/15 blur-md" />
          <div
            className="relative overflow-hidden rounded-2xl border-4 border-amber-900/30 bg-linear-to-b from-amber-950 to-amber-900 shadow-xl"
            style={{ aspectRatio: "4 / 5" }}
          >
            <div className="absolute inset-2 rounded-xl bg-linear-to-b from-amber-900/40 to-stone-950/90" />
            <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center gap-1 opacity-40">
              <span className="h-1 w-8 rounded-full bg-amber-100/80" />
              <span className="h-1 w-8 rounded-full bg-amber-100/80" />
            </div>

            <button
              type="submit"
              onClick={openDoor}
              className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-6 text-center outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-60"
              aria-label="옷장 문 열기"
            >
              <span className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-amber-950 shadow-md">
                {open ? "들어가는 중…" : "탭해서 문 열기"}
              </span>
            </button>

            <div
              className="absolute inset-y-0 left-0 z-[5] w-1/2 origin-left border-r border-amber-950/40 bg-linear-to-br from-amber-700 to-amber-900 shadow-inner transition-transform duration-300 ease-out"
              style={{
                transform: open ? "translateX(-92%) skewY(2deg)" : "translateX(0)",
              }}
            />
            <div
              className="absolute inset-y-0 right-0 z-[5] w-1/2 origin-right border-l border-amber-950/40 bg-linear-to-bl from-amber-700 to-amber-900 shadow-inner transition-transform duration-300 ease-out"
              style={{
                transform: open ? "translateX(92%) skewY(-2deg)" : "translateX(0)",
              }}
            />
          </div>
        </div>

        <p className="text-center text-[11px] text-rose-800/70">
          한 번 열면 다음부터는 바로 옷장이 열려요
        </p>

        <button
          type="submit"
          onClick={skipIntro}
          className="mt-1 rounded-full border border-rose-200 bg-white/90 px-4 py-1.5 text-[11px] font-semibold text-rose-700 shadow-sm active:scale-[0.98]"
        >
          바로 들어가기
        </button>
      </div>
    </form>
  );
}
