import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-linear-to-b from-amber-50/50 to-stone-100 px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-stone-200/80 bg-white p-10 shadow-xl shadow-stone-200/50">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-amber-800/70">
          my-closet
        </p>
        <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight text-stone-900">
          회원가입
        </h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-stone-500">
          계정을 만들고 옷장을 시작하세요.
        </p>
        <SignupForm />
      </div>
    </div>
  );
}
