"use client";

import { signOutAction } from "@/app/auth/actions";
import Link from "next/link";

type Props = {
  email?: string | null;
  displayName?: string | null;
};

export function ClosetHeader({ email, displayName }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200/80 bg-white/80 px-4 py-4 backdrop-blur-md sm:px-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-amber-800/80">
          my-closet
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">
          내 옷장
        </h1>
        {(displayName || email) && (
          <p className="mt-1 text-sm text-stone-500">
            {displayName ?? email}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/try-on"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100"
        >
          가상 피팅룸
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
