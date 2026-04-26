import type { RecommendationResult } from "@/types/models";

/**
 * 코디 추천 요청의 결과 상태.
 * `useActionState` 로 관리되며, form 이 submit 될 때마다 새 값으로 교체된다.
 *
 * 주의: 이 모듈은 "use server" 가 아닌 일반 모듈이어야 한다.
 * 서버 액션 파일(`actions.ts`)은 async 함수만 export 가능하므로
 * 런타임 상수(`INITIAL_RECOMMEND_STATE`)·타입을 여기로 분리했다.
 */
export type RecommendActionState = {
  result: RecommendationResult | null;
  error: string | null;
  /** 방금 요청한 스타일 키워드(서버가 정규화·기본값 적용한 값). */
  style: string;
  /** 매 호출마다 증가. 클라이언트에서 "새 결과 도착" 훅 트리거에 사용. */
  nonce: number;
};

export const INITIAL_RECOMMEND_STATE: RecommendActionState = {
  result: null,
  error: null,
  style: "",
  nonce: 0,
};
