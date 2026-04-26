"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 모바일 인트로(문 열기) 완료 처리.
 *
 * - JS 하이드레이션이 이미 끝났다면 클라이언트에서 쿠키를 심고 state 만 토글하면 되지만,
 *   iOS WebView 에서 첫 로딩 중 JS 가 늦게 파싱돼 버튼이 아예 안 먹는 경우가 있다.
 *   그 상황에서도 `<form action={finishClosetIntroAction}>` 의 기본 폼 submit 이
 *   서버에서 쿠키를 설정하고 `/` 로 리다이렉트해 주기 때문에 "아무 반응 없음" 문제를 회피할 수 있다.
 */
export async function finishClosetIntroAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: "closet-intro-done",
    value: "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
  redirect("/");
}
