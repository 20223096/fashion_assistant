"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  threshold?: number;
  cooldownMs?: number;
  onClap: () => void;
};

/**
 * 마이크로 짧은 소리 스파이크(박수) 감지. start() 호출 후 동작, stop()으로 종료.
 */
export function useClapDetector({
  threshold = 0.12,
  cooldownMs = 900,
  onClap,
}: Options) {
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastClapRef = useRef(0);
  const prevRmsRef = useRef(0);
  const onClapRef = useRef(onClap);
  onClapRef.current = onClap;

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setMicReady(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const prev = prevRmsRef.current;
        prevRmsRef.current = rms;

        const now = performance.now();
        if (
          rms > threshold &&
          prev < threshold * 0.35 &&
          now - lastClapRef.current > cooldownMs
        ) {
          lastClapRef.current = now;
          onClapRef.current();
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      setMicReady(true);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "마이크를 사용할 수 없습니다.";
      setMicError(msg);
      setMicReady(false);
    }
  }, [stop, threshold, cooldownMs]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, micReady, micError };
}
