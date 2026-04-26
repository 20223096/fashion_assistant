import { getSupabaseAdmin } from "./admin";

const BUCKET_ID = "closet-images";

/**
 * `closet-images` 버킷이 없으면 생성합니다.
 * `SUPABASE_SERVICE_ROLE_KEY`가 있어야 동작합니다 (대시보드 SQL 없이 해결).
 */
export async function ensureClosetImagesBucket(): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn(
      "[storage] SUPABASE_SERVICE_ROLE_KEY가 없어 버킷을 자동 생성할 수 없습니다. Supabase SQL Editor에서 storage.buckets에 closet-images를 추가하거나, .env.local에 service_role 키를 넣어 주세요."
    );
    return;
  }

  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) {
    console.error("[storage] listBuckets:", listErr);
    return;
  }

  if (buckets?.some((b) => b.id === BUCKET_ID)) return;

  const { error: createErr } = await admin.storage.createBucket(BUCKET_ID, {
    public: true,
  });
  if (createErr) {
    console.error("[storage] createBucket:", createErr);
  }
}
