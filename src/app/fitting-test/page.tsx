"use client";

/**
 * 로컬 업로드 + 수동/알파 기반 자동 anchor 로 `/api/fitting/composite` MVP 테스트.
 */

import type { LayerPlacementDebug } from "@/lib/fitting/types";
import {
  DEFAULT_BOTTOM_ANCHORS,
  DEFAULT_FACE_ANCHORS,
  DEFAULT_SHOES_ANCHORS,
  DEFAULT_TOP_ANCHORS,
} from "@/lib/fitting/anchors";
import type {
  BottomAnchors,
  FaceAnchors,
  ShoesAnchors,
  TopAnchors,
} from "@/lib/fitting/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function fileToPngBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const data = r.result as string;
      const i = data.indexOf(",");
      resolve(i >= 0 ? data.slice(i + 1) : data);
    };
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function NumPair({
  label,
  aKey,
  bKey,
  a,
  b,
  onChange,
}: {
  label: string;
  aKey: string;
  bKey: string;
  a: number;
  b: number;
  onChange: (key: string, v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-stone-600">{label}</span>
      <input
        type="number"
        step={0.01}
        min={0}
        max={1}
        value={a}
        onChange={(e) => onChange(aKey, Number(e.target.value))}
        className="w-20 rounded border border-stone-200 px-1 py-0.5"
      />
      <input
        type="number"
        step={0.01}
        min={0}
        max={1}
        value={b}
        onChange={(e) => onChange(bKey, Number(e.target.value))}
        className="w-20 rounded border border-stone-200 px-1 py-0.5"
      />
      <span className="col-span-3 grid grid-cols-2 gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={a}
          onChange={(e) => onChange(aKey, Number(e.target.value))}
          className="w-full"
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={b}
          onChange={(e) => onChange(bKey, Number(e.target.value))}
          className="w-full"
        />
      </span>
    </div>
  );
}

const KIND_COLORS: Record<string, string> = {
  face: "#ef4444",
  top: "#3b82f6",
  bottom: "#22c55e",
  shoes: "#f59e0b",
};

export default function FittingTestPage() {
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [topFile, setTopFile] = useState<File | null>(null);
  const [bottomFile, setBottomFile] = useState<File | null>(null);
  const [shoesFile, setShoesFile] = useState<File | null>(null);

  const [faceAnchors, setFaceAnchors] = useState<FaceAnchors>({
    ...DEFAULT_FACE_ANCHORS,
  });
  const [topAnchors, setTopAnchors] = useState<TopAnchors>({
    ...DEFAULT_TOP_ANCHORS,
  });
  const [bottomAnchors, setBottomAnchors] = useState<BottomAnchors>({
    ...DEFAULT_BOTTOM_ANCHORS,
  });
  const [shoesAnchors, setShoesAnchors] = useState<ShoesAnchors>({
    ...DEFAULT_SHOES_ANCHORS,
  });

  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(1120);
  const [transparentBg, setTransparentBg] = useState(true);
  const [debug, setDebug] = useState(false);
  /** true면 합성 시 클라이언트 앵커 대신 서버에서 알파 실루엣 기준 자동 추정 */
  const [autoAnchorsOnCompose, setAutoAnchorsOnCompose] = useState(false);

  const [loading, setLoading] = useState(false);
  const [estimatingAnchors, setEstimatingAnchors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [placements, setPlacements] = useState<LayerPlacementDebug[] | null>(
    null
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      const u = previewUrlRef.current;
      if (u?.startsWith("blob:")) URL.revokeObjectURL(u);
    };
  }, []);

  const ready = useMemo(
    () => Boolean(faceFile && topFile && bottomFile && shoesFile),
    [faceFile, topFile, bottomFile, shoesFile]
  );

  const setFace = useCallback((key: string, v: number) => {
    setFaceAnchors((s) => ({ ...s, [key]: v }));
  }, []);
  const setTop = useCallback((key: string, v: number) => {
    setTopAnchors((s) => ({ ...s, [key]: v }));
  }, []);
  const setBottom = useCallback((key: string, v: number) => {
    setBottomAnchors((s) => ({ ...s, [key]: v }));
  }, []);
  const setShoes = useCallback((key: string, v: number) => {
    setShoesAnchors((s) => ({ ...s, [key]: v }));
  }, []);

  const runAutoAnchors = useCallback(async () => {
    setErr(null);
    if (!ready || !faceFile || !topFile || !bottomFile || !shoesFile) {
      setErr("face / top / bottom / shoes PNG를 모두 선택해 주세요.");
      return;
    }
    setEstimatingAnchors(true);
    try {
      const [f, t, b, s] = await Promise.all([
        fileToPngBase64(faceFile),
        fileToPngBase64(topFile),
        fileToPngBase64(bottomFile),
        fileToPngBase64(shoesFile),
      ]);

      const res = await fetch("/api/fitting/estimate-anchors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: {
            face: { pngBase64: f },
            top: { pngBase64: t },
            bottom: { pngBase64: b },
            shoes: { pngBase64: s },
          },
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }

      const j = (await res.json()) as {
        anchors: {
          face: FaceAnchors;
          top: TopAnchors;
          bottom: BottomAnchors;
          shoes: ShoesAnchors;
        };
      };
      setFaceAnchors(j.anchors.face);
      setTopAnchors(j.anchors.top);
      setBottomAnchors(j.anchors.bottom);
      setShoesAnchors(j.anchors.shoes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "앵커 추정 실패");
    } finally {
      setEstimatingAnchors(false);
    }
  }, [ready, faceFile, topFile, bottomFile, shoesFile]);

  const runComposite = useCallback(async () => {
    setErr(null);
    setPlacements(null);
    if (!ready || !faceFile || !topFile || !bottomFile || !shoesFile) {
      setErr("face / top / bottom / shoes PNG를 모두 선택해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const [f, t, b, s] = await Promise.all([
        fileToPngBase64(faceFile),
        fileToPngBase64(topFile),
        fileToPngBase64(bottomFile),
        fileToPngBase64(shoesFile),
      ]);

      const res = await fetch("/api/fitting/composite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          width,
          height,
          transparentBackground: transparentBg,
          debug,
          autoAnchors: autoAnchorsOnCompose,
          parts: {
            face: { pngBase64: f, anchors: faceAnchors },
            top: { pngBase64: t, anchors: topAnchors },
            bottom: { pngBase64: b, anchors: bottomAnchors },
            shoes: { pngBase64: s, anchors: shoesAnchors },
          },
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }

      if (debug) {
        const j = (await res.json()) as {
          imageBase64: string;
          placements: LayerPlacementDebug[];
        };
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return `data:image/png;base64,${j.imageBase64}`;
        });
        setPlacements(j.placements ?? []);
      } else {
        const blob = await res.blob();
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setPlacements(null);
      }
    } catch (e) {
      setPreviewUrl(null);
      setPlacements(null);
      setErr(e instanceof Error ? e.message : "합성 실패");
    } finally {
      setLoading(false);
    }
  }, [
    ready,
    faceFile,
    topFile,
    bottomFile,
    shoesFile,
    width,
    height,
    transparentBg,
    debug,
    faceAnchors,
    topAnchors,
    bottomAnchors,
    shoesAnchors,
    autoAnchorsOnCompose,
  ]);

  useEffect(() => {
    if (!previewUrl || !debug || !placements?.length) return;
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.width = width;
      c.height = height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (!transparentBg) {
        ctx.fillStyle = "#fafaf9";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      for (const layer of placements) {
        for (const pt of layer.points) {
          ctx.fillStyle = KIND_COLORS[layer.kind] ?? "#111";
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#1c1917";
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillText(`${layer.kind}:${pt.label}`, pt.x + 10, pt.y + 4);
        }
      }
    };
    img.src = previewUrl;
  }, [previewUrl, placements, debug, width, height, transparentBg]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">
          Fitting composite MVP 테스트
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          로컬 PNG 업로드 → (선택) 알파 기반 자동 anchor →{" "}
          <code className="rounded bg-stone-100 px-1">/api/fitting/composite</code>{" "}
          미리보기 (DB 없음).
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">1. PNG 업로드</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["face", "얼굴·머리", faceFile, setFaceFile] as const,
              ["top", "상의", topFile, setTopFile] as const,
              ["bottom", "하의", bottomFile, setBottomFile] as const,
              ["shoes", "신발", shoesFile, setShoesFile] as const,
            ] as const
          ).map(([id, label, file, setF]) => (
            <label
              key={id}
              className="flex cursor-pointer flex-col gap-1 rounded-xl border border-dashed border-stone-300 bg-stone-50/80 px-3 py-2 text-xs hover:bg-stone-100"
            >
              <span className="font-medium text-stone-700">{label}</span>
              <input
                type="file"
                accept="image/png"
                className="text-[11px] file:mr-2 file:rounded file:border-0 file:bg-amber-100 file:px-2 file:py-1 file:text-amber-900"
                onChange={(e) => setF(e.target.files?.[0] ?? null)}
              />
              {file && (
                <span className="truncate text-stone-500">{file.name}</span>
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">
          2. Anchor (0~1, 트림 후 이미지 기준)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">Face</p>
            <NumPair
              label="neck center (x,y)"
              aKey="neckCenterX"
              bKey="neckCenterY"
              a={faceAnchors.neckCenterX}
              b={faceAnchors.neckCenterY}
              onChange={setFace}
            />
          </div>
          <div className="space-y-2 rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">Top</p>
            <NumPair
              label="neck (x,y)"
              aKey="neckCenterX"
              bKey="neckCenterY"
              a={topAnchors.neckCenterX}
              b={topAnchors.neckCenterY}
              onChange={setTop}
            />
            <NumPair
              label="waist (x,y)"
              aKey="waistCenterX"
              bKey="waistCenterY"
              a={topAnchors.waistCenterX}
              b={topAnchors.waistCenterY}
              onChange={setTop}
            />
          </div>
          <div className="space-y-2 rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">Bottom</p>
            <NumPair
              label="waist (x,y)"
              aKey="waistCenterX"
              bKey="waistCenterY"
              a={bottomAnchors.waistCenterX}
              b={bottomAnchors.waistCenterY}
              onChange={setBottom}
            />
            <NumPair
              label="hem (x,y)"
              aKey="hemCenterX"
              bKey="hemCenterY"
              a={bottomAnchors.hemCenterX}
              b={bottomAnchors.hemCenterY}
              onChange={setBottom}
            />
          </div>
          <div className="space-y-2 rounded-lg bg-stone-50 p-3">
            <p className="text-xs font-medium text-stone-700">Shoes</p>
            <NumPair
              label="top center (x,y)"
              aKey="topCenterX"
              bKey="topCenterY"
              a={shoesAnchors.topCenterX}
              b={shoesAnchors.topCenterY}
              onChange={setShoes}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
          <button
            type="button"
            disabled={!ready || estimatingAnchors}
            onClick={() => void runAutoAnchors()}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-40"
          >
            {estimatingAnchors
              ? "알파 기준 추정 중…"
              : "알파 기준 자동 앵커 (폼에 반영)"}
          </button>
          <p className="max-w-md text-[11px] leading-relaxed text-stone-500">
            각 PNG의 알파 bbox·무게중심으로 neck / neckline·waist / hem 등을
            휴리스틱 추정합니다. 세부 조정은 위 슬라이더로 이어서 하면 됩니다.
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-800">3. 캔버스 & 옵션</h2>
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <label className="flex flex-col gap-1">
            <span className="text-stone-500">width</span>
            <input
              type="number"
              value={width}
              min={256}
              max={2048}
              onChange={(e) => setWidth(Number(e.target.value))}
              className="w-24 rounded border border-stone-200 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-stone-500">height</span>
            <input
              type="number"
              value={height}
              min={256}
              max={2048}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="w-24 rounded border border-stone-200 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
            />
            투명 배경
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={debug}
              onChange={(e) => setDebug(e.target.checked)}
            />
            디버그 (앵커 점 오버레이)
          </label>
          <label className="flex max-w-xs items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoAnchorsOnCompose}
              onChange={(e) => setAutoAnchorsOnCompose(e.target.checked)}
            />
            <span>
              합성 시 서버 <code className="rounded bg-stone-100 px-0.5">autoAnchors</code>
              (위 폼 앵커 무시, 매 요청마다 알파 기준 재추정)
            </span>
          </label>
        </div>
        <button
          type="button"
          disabled={!ready || loading}
          onClick={() => void runComposite()}
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
        >
          {loading ? "합성 중…" : "합성하기"}
        </button>
        {!ready && (
          <p className="text-xs text-amber-800">네 장의 PNG를 모두 올리면 버튼이 활성화됩니다.</p>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </section>

      {previewUrl && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-stone-800">4. 미리보기</h2>
          <div
            className="inline-block max-w-full overflow-auto rounded-2xl border border-stone-200 bg-[repeating-conic-gradient(#e7e5e4_0%_25%,transparent_0%_50%)_50%/16px_16px] p-2"
            style={{ maxHeight: "80vh" }}
          >
            {debug && placements?.length ? (
              <canvas
                ref={canvasRef}
                className="block max-h-[75vh] w-auto max-w-full"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt="composite"
                width={width}
                height={height}
                className="block max-h-[75vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
          {debug && placements && (
            <pre className="max-h-48 overflow-auto rounded-lg bg-stone-900 p-3 text-[10px] text-green-400">
              {JSON.stringify(placements, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
