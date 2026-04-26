import { VirtualFittingRoom } from "@/components/fitting/VirtualFittingRoom";
import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function TryOnPage() {
  const supabase = await createClient();
  const user = await getUserOrNull(supabase);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#fff1f2_0%,#fafaf9_45%)] md:bg-stone-50">
      <header className="flex items-center justify-between border-b border-rose-100/80 bg-white/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-top))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:border-stone-200 md:pb-3 md:pt-3 sm:px-8">
        <Link
          href="/"
          className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-900 shadow-sm md:rounded-none md:bg-transparent md:px-0 md:py-0 md:text-sm md:font-medium md:text-amber-900 md:shadow-none md:hover:underline"
        >
          ← 옷장
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400 md:text-xs md:font-semibold md:tracking-widest md:text-stone-500">
          피팅룸
        </span>
        <span className="w-12 md:w-16" />
      </header>
      <VirtualFittingRoom />
    </div>
  );
}
