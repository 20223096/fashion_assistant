import { ClosetHeader } from "@/components/closet/Header";
import { CategoryLibrary } from "@/components/closet/CategoryLibrary";
import { ClosetMobileCuteShell } from "@/components/closet/mobile/ClosetMobileCuteShell";
import { RecommendPanel } from "@/components/closet/RecommendPanel";
import { UploadZone } from "@/components/closet/UploadZone";
import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import type { ClothesRow } from "@/types/models";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 이 세그먼트에서 동작하는 서버 액션(requestOutfitsAction) 은
 * Stage 1(web_search_preview) + Stage 2(GPT-4o) 두 번의 LLM 호출을
 * 직렬로 수행하므로 기본 10s 한도로는 부족할 수 있다.
 */
export const maxDuration = 120;

export default async function Home() {
  const supabase = await createClient();
  const user = await getUserOrNull(supabase);

  if (!user) {
    redirect("/login");
  }

  // 모바일 인트로(문 열기)를 한 번이라도 끝냈으면 쿠키가 남아 있다.
  // 서버에서 먼저 읽어두면, 클라이언트 하이드레이션을 기다리는
  // "옷장 여는 중…" 스피너를 완전히 제거할 수 있다.
  const cookieStore = await cookies();
  const initialIntroDone =
    cookieStore.get("closet-intro-done")?.value === "1";

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("clothes_inventory")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const clothes = (rows ?? []) as ClothesRow[];

  return (
    <>
      <div className="hidden min-h-full bg-stone-50 md:block">
        <ClosetHeader
          email={profile?.email ?? user.email}
          displayName={profile?.display_name}
        />
        <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
            <div className="space-y-8">
              <CategoryLibrary clothes={clothes} />
            </div>
            <aside className="space-y-6 lg:sticky lg:top-6">
              <UploadZone />
              <RecommendPanel clothes={clothes} />
            </aside>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <ClosetMobileCuteShell
          clothes={clothes}
          displayName={profile?.display_name}
          email={profile?.email ?? user.email}
          initialIntroDone={initialIntroDone}
        />
      </div>
    </>
  );
}
