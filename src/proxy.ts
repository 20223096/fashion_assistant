import { getUserOrNull } from "@/lib/supabase/get-user-safe";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

let loggedMissingSupabaseEnv = false;

function readSupabasePublicEnv(): { url: string; anon: string } | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url.startsWith("http") || anon.length < 20) {
    return null;
  }
  return { url, anon };
}

export async function proxy(request: NextRequest) {
  try {
    let supabaseResponse = NextResponse.next({
      request,
    });

    /** 연결 진단용 — Supabase가 죽어 있어도 getUser를 부르지 않음 */
    if (request.nextUrl.pathname === "/api/health") {
      return supabaseResponse;
    }

    const env = readSupabasePublicEnv();
    if (!env) {
      if (!loggedMissingSupabaseEnv) {
        loggedMissingSupabaseEnv = true;
        console.error(
          "[proxy] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없거나 잘못되었습니다. 프로젝트 루트에 .env.local 을 두고 `next dev` 를 다시 실행하세요."
        );
      }
      return NextResponse.next({ request });
    }

    const supabase = createServerClient(
      env.url,
      env.anon,
      {
        cookieOptions: {
          secure: process.env.NODE_ENV === "production",
        },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const user = await getUserOrNull(supabase);

    const path = request.nextUrl.pathname;

    if (!user && (path === "/" || path === "/try-on")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (user && (path === "/login" || path === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (e) {
    console.error("[proxy] failed:", e);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
