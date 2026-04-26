"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type AuthFormState = {
  error: string | null;
  info: string | null;
};

function toAuthErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "인증 요청 중 오류가 발생했습니다.";
  const cause = (err as Error & { cause?: { code?: string; errno?: number } })
    .cause;
  const code = cause?.code;
  if (code === "ENOTFOUND") {
    return "Supabase 주소를 찾을 수 없습니다. .env.local의 NEXT_PUBLIC_SUPABASE_URL이 현재 프로젝트 값인지 확인하고 서버를 재시작해 주세요.";
  }
  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ECONNREFUSED") {
    return "Supabase와 연결이 끊겼습니다. 네트워크·VPN을 확인한 뒤 잠시 후 다시 시도해 주세요.";
  }
  if (/fetch failed/i.test(err.message)) {
    return "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도하거나 Supabase 상태를 확인해 주세요.";
  }
  return err.message || "인증 요청 중 오류가 발생했습니다.";
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", info: null };
  }

  const supabase = await createClient();
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message, info: null };
    }
  } catch (err) {
    return { error: toAuthErrorMessage(err), info: null };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상으로 설정해 주세요.", info: null };
  }
  if (password !== confirm) {
    return { error: "비밀번호 확인이 일치하지 않습니다.", info: null };
  }
  if (!email) {
    return { error: "이메일을 입력해 주세요.", info: null };
  }

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const fromRequest = host ? `${proto}://${host}` : "";
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || fromRequest;

  const supabase = await createClient();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: siteBase ? `${siteBase}/auth/callback` : undefined,
      },
    });

    if (error) {
      return { error: error.message, info: null };
    }

    if (data.session) {
      revalidatePath("/", "layout");
      redirect("/");
    }
  } catch (err) {
    return { error: toAuthErrorMessage(err), info: null };
  }

  return {
    error: null,
    info: "가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요. (Supabase에서 이메일 인증을 끄면 바로 로그인됩니다.)",
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
