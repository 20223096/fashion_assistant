"use client";

import type { ClothesRow } from "@/types/models";
import { useRouter } from "next/navigation";
import { useState } from "react";

const seasonLabel: Record<string, string> = {
  spring_summer: "봄·여름",
  fall_winter: "가을·겨울",
  all_season: "사계절",
};

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ClothingItemCard({ item }: { item: ClothesRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("이 옷을 옷장에서 삭제할까요? (저장된 이미지도 함께 지워집니다)")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/clothes/${item.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      router.refresh();
    } catch {
      alert("네트워크 오류입니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="relative overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm transition hover:shadow-md">
      <div
        className="group/image relative aspect-[3/4] bg-stone-100"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
        }}
      >
        {/* 호버 시에만 X — 터치 기기에서는 항상 살짝 보이게 */}
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          aria-label="옷장에서 삭제"
          className={`pointer-events-auto absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-100 shadow-md backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-50 md:pointer-events-none md:opacity-0 md:transition-opacity md:duration-200 md:group-hover/image:pointer-events-auto md:group-hover/image:opacity-100 ${busy ? "md:!opacity-100" : ""}`}
        >
          {busy ? (
            <span className="text-xs">…</span>
          ) : (
            <CloseIcon />
          )}
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image_url}
          alt=""
          className="h-full w-full object-contain p-2 transition duration-300 group-hover/image:scale-[1.02]"
        />
      </div>
      <div className="space-y-1.5 p-3">
        <p className="text-xs font-medium text-amber-900/90">
          {item.style_tags.slice(0, 3).join(" · ")}
        </p>
        <p className="line-clamp-2 text-xs text-stone-600">{item.features}</p>
        <div className="flex flex-wrap gap-1">
          {item.colors.slice(0, 4).map((color) => (
            <span
              key={color}
              className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600"
            >
              {color}
            </span>
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-wide text-stone-400">
          {seasonLabel[item.season] ?? item.season}
        </p>
      </div>
    </li>
  );
}
