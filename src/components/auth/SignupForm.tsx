"use client";

import { signupAction, type AuthFormState } from "@/app/auth/actions";
import Link from "next/link";
import { useActionState } from "react";

const initial: AuthFormState = { error: null, info: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initial);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label htmlFor="signup-email" className="text-xs font-medium text-stone-600">
          이메일
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm outline-none ring-amber-500/30 focus:ring-2"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="signup-password" className="text-xs font-medium text-stone-600">
          비밀번호 (6자 이상)
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm outline-none ring-amber-500/30 focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="signup-confirm" className="text-xs font-medium text-stone-600">
          비밀번호 확인
        </label>
        <input
          id="signup-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-2.5 text-sm outline-none ring-amber-500/30 focus:ring-2"
        />
      </div>
      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.info && (
        <p className="text-sm text-stone-700" role="status">
          {state.info}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
      >
        {pending ? "처리 중…" : "회원가입"}
      </button>
      <p className="text-center text-sm text-stone-500">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-amber-800 underline-offset-2 hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
