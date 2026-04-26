import type { SupabaseClient, User } from "@supabase/supabase-js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableFetchFailure(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (/fetch failed/i.test(e.message)) return true;
  const code = (e as Error & { cause?: { code?: string } }).cause?.code;
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN"
  );
}

/**
 * `getUser()`는 네트워크 오류 시 예외를 던질 수 있음 → 미들웨어/RSC가 500으로 터지지 않게 null 처리.
 * ECONNRESET 등은 짧게 재시도(총 3회).
 */
export async function getUserOrNull(
  supabase: SupabaseClient
): Promise<User | null> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (attempt === 1) {
          console.warn("[supabase] getUser:", error.message);
        }
        return null;
      }
      return data.user;
    } catch (e) {
      const retry = isRetryableFetchFailure(e) && attempt < maxAttempts;
      if (retry) {
        await sleep(120 * attempt);
        continue;
      }
      console.warn("[supabase] getUser failed:", e);
      return null;
    }
  }
  return null;
}
