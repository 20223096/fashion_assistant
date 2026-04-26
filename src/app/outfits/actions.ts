"use server";

import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createClient } from "@/lib/supabase/server";
import { generateOutfitRecommendations } from "@/lib/outfit-engine";
import type { RecommendActionState } from "./recommend-state";

/**
 * 코디 추천 서버 액션.
 *
 * `<form action={formAction}>` 에 연결되어 있어서
 *  - JS 하이드레이션 **이전**에 submit 되면 브라우저가 폼을 POST → 서버가 계산 후
 *    같은 페이지를 새 state 로 재렌더 (iOS WebView 에서 번들 파싱이 느려도 동작 보장)
 *  - JS 하이드레이션 **이후**에는 React 가 가로채서 네트워크 왕복 없이 state 만 갱신
 */
export async function requestOutfitsAction(
  prev: RecommendActionState,
  formData: FormData
): Promise<RecommendActionState> {
  const style =
    String(formData.get("style") ?? "").trim() || "데일리 미니멀";

  const supabase = await createClient();
  const user = await getUserOrNull(supabase);
  if (!user) {
    return {
      ...prev,
      result: null,
      error: "로그인이 필요합니다. 로그아웃 후 다시 로그인해 주세요.",
      style,
      nonce: prev.nonce + 1,
    };
  }

  const { data: clothes, error: fetchError } = await supabase
    .from("clothes_inventory")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (fetchError) {
    return {
      ...prev,
      result: null,
      error: "옷장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      style,
      nonce: prev.nonce + 1,
    };
  }

  try {
    const result = await generateOutfitRecommendations(clothes ?? [], style);

    // 히스토리 저장은 실패해도 추천 결과 자체는 돌려준다.
    const { error: saveError } = await supabase
      .from("outfit_recommendations")
      .insert({
        user_id: user.id,
        requested_style: style,
        outfits: {
          keyword_outfits: result.keyword_outfits,
          other_outfits: result.other_outfits,
        },
        purchase_suggestions: result.purchase_suggestions,
      });
    if (saveError) {
      console.error("[requestOutfitsAction] save recommendation failed:", saveError);
    }

    return {
      result,
      error: null,
      style,
      nonce: prev.nonce + 1,
    };
  } catch (e) {
    console.error("[requestOutfitsAction] failed:", e);
    return {
      ...prev,
      result: null,
      error:
        e instanceof Error
          ? e.message
          : "코디 추천 생성 중 알 수 없는 오류가 발생했습니다.",
      style,
      nonce: prev.nonce + 1,
    };
  }
}
