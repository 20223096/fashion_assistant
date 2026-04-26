import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-linear-to-b from-amber-50/50 to-stone-100 px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-stone-200/80 bg-white p-10 shadow-xl shadow-stone-200/50">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-800/70">
          my-closet
        </p>
        <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight text-stone-900">
          로그인
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-stone-500">
          이메일과 비밀번호로 옷장에 들어가세요.
        </p>
        <LoginForm />
        {q.error === "auth" && (
          <p className="mt-4 text-center text-sm text-red-600">
            인증에 실패했습니다. 다시 시도해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
