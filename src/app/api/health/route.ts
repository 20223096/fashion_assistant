import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 서버 → Supabase 연결만 검사 (미들웨어는 `/api/health` 에서 getUser 생략).
 * 갑자기 안 열릴 때: 터미널에서 `curl -s localhost:3000/api/health | jq`
 */
export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const envOk = base.startsWith("http") && anon.length >= 20;

  if (!envOk) {
    return NextResponse.json(
      {
        ok: false,
        envConfigured: false,
        hint: ".env.local 의 NEXT_PUBLIC_SUPABASE_* 를 확인한 뒤 dev 서버를 재시작하세요.",
      },
      { status: 503 }
    );
  }

  const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
  const paths = ["/auth/v1/health", "/rest/v1/"];

  let supabaseReachable = false;
  let lastDetail: string | null = null;

  for (const path of paths) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(`${base}${path}`, { signal: ac.signal, headers });
      clearTimeout(t);
      if (res.ok) {
        supabaseReachable = true;
        lastDetail = null;
        break;
      }
      lastDetail = `${path} → HTTP ${res.status}`;
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(
    {
      ok: supabaseReachable,
      envConfigured: true,
      supabaseReachable,
      supabaseDetail: lastDetail,
      hint: supabaseReachable
        ? null
        : "Supabase에 연결되지 않습니다. 프로젝트 일시정지(무료 플랜)·VPN·방화벽·supabase 상태를 확인하세요.",
    },
    { status: supabaseReachable ? 200 : 503 }
  );
}
