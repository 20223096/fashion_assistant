"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

function buildFormData(fileList: FileList | File[]) {
  const fd = new FormData();
  const arr = Array.from(fileList);
  for (const f of arr) {
    fd.append("files", f);
  }
  return fd;
}

export function UploadZone({ variant = "default" }: { variant?: "default" | "cosy" }) {
  const cosy = variant === "cosy";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);

  const uploadFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      setBusy(true);
      setMessage(null);
      setMessageOk(true);
      try {
        const fd = buildFormData(fileList);
        const res = await fetch("/api/clothes/analyze", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json()) as {
          error?: string;
          items?: unknown[];
          failures?: { name: string; error: string }[];
        };
        if (!res.ok) {
          setMessageOk(false);
          setMessage(data.error ?? "업로드 실패");
          return;
        }
        const n = data.items?.length ?? 0;
        let text = `총 ${n}개 아이템이 옷장에 추가되었습니다.`;
        if (data.failures?.length) {
          text += ` (${data.failures.length}장 실패: ${data.failures.map((f) => `${f.name}(${f.error})`).join(", ")})`;
        }
        setMessageOk(true);
        setMessage(text);
        router.refresh();
      } catch {
        setMessageOk(false);
        setMessage("네트워크 오류가 발생했습니다.");
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      void uploadFiles(list);
      e.target.value = "";
    },
    [uploadFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { files } = e.dataTransfer;
      if (files?.length) void uploadFiles(files);
    },
    [uploadFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      className={
        cosy
          ? "rounded-2xl border-2 border-dashed border-rose-200/80 bg-linear-to-br from-rose-50/90 to-amber-50/50 p-3 shadow-inner"
          : "rounded-2xl border border-stone-200 bg-linear-to-br from-white to-stone-50 p-6 shadow-sm"
      }
    >
      <h2
        className={
          cosy ? "text-sm font-bold text-rose-950" : "text-base font-semibold text-stone-900"
        }
      >
        {cosy ? "옷 등록하기" : "옷 사진 등록"}
      </h2>
      <p
        className={
          cosy ? "mt-0.5 text-[11px] leading-relaxed text-rose-800/75" : "mt-1 text-sm text-stone-500"
        }
      >
        {cosy
          ? "여러 장 골라도 돼요. 한 장에 옷이 여러 벌이면 AI가 나눠 저장해요."
          : "여러 장을 한 번에 선택하거나 끌어다 놓을 수 있습니다. 한 장 안에 옷이 여러 벌이면 AI가 벌마다 영역을 잘라 각 카드에 다른 썸네일로 저장합니다."}
      </p>
      <label
        className={
          cosy
            ? "mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rose-300/70 bg-white/70 px-3 py-6 transition active:scale-[0.99] hover:border-rose-400 hover:bg-white"
            : "mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white/60 px-4 py-10 transition hover:border-amber-400/80 hover:bg-amber-50/30"
        }
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={busy}
          onChange={onInputChange}
        />
        <span className={cosy ? "text-2xl" : "text-3xl"}>📷</span>
        <span
          className={
            cosy ? "mt-1 text-xs font-bold text-rose-900" : "mt-2 text-sm font-medium text-stone-700"
          }
        >
          {busy ? "분석 중…" : cosy ? "탭해서 사진 고르기 · 드래그도 OK" : "이미지 여러 장 선택 · 또는 여기로 드래그"}
        </span>
        <span className={cosy ? "mt-0.5 text-[10px] text-rose-600/70" : "mt-1 text-xs text-stone-400"}>
          {cosy
            ? "최대 12장 · Vercel에서는 약 4MB/요청"
            : "JPEG/PNG/HEIC 등, 로컬은 파일당 최대 12MB · Vercel 배포 시 약 4MB 제한 · 최대 12장"}
        </span>
      </label>
      {message && (
        <p
          className={`mt-3 text-sm ${messageOk ? "text-stone-700" : "text-red-600"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
