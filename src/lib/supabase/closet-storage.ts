import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./admin";

/**
 * `SUPABASE_SERVICE_ROLE_KEY`가 있으면 Storage 작업은 서비스 롤로 수행합니다.
 * 버킷만 있으면 되고, storage.objects RLS 정책이 없어도 업로드/삭제가 됩니다.
 * 경로는 항상 `{userId}/...` 로 제한해야 합니다.
 */
export function getClosetStorageOperator(
  sessionSupabase: SupabaseClient
): SupabaseClient {
  return getSupabaseAdmin() ?? sessionSupabase;
}
