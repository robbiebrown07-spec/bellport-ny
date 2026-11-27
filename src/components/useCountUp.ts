import { useEffect, useRef, useState } from 'react';

export interface CountUpOptions {
  durationMs?: number;
  decimals?: number;
  enabled?: boolean;
}

/**
 * High-velocity cubic-out / quintic-out number ticker.
 * Smoothly animates from 0 on initial mount (when enabled) and between subsequent target changes,
 * while strictly respecting `prefers-reduced-motion: reduce`.
 */
export function useCountUp(target: number, options?: number | CountUpOptions): number {
  const opts: CountUpOptions =
    typeof options === 'number' ? { durationMs: options } : (options ?? {});
  const durationMs = opts.durationMs ?? 480;
  const decimals = opts.decimals ?? 0;
  const enabled = opts.enabled ?? true;

  const prefersReduced =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const factor = Math.pow(10, decimals);
  const roundedTarget = Math.round(target * factor) / factor;

  const [displayValue, setDisplayValue] = useState<number>(() =>
    prefersReduced || !Number.isFinite(roundedTarget) ? roundedTarget : 0
  );
  const currentRef = useRef<number>(prefersReduced ? roundedTarget : 0);

  useEffect(() => {
    if (!Number.isFinite(roundedTarget)) return;
    if (!enabled) return;

    if (prefersReduced || durationMs <= 0) {
      const rafImmediate = window.requestAnimationFrame(() => {
        currentRef.current = roundedTarget;
        setDisplayValue(roundedTarget);
      });
      return () => window.cancelAnimationFrame(rafImmediate);
    }

    const startVal = currentRef.current;
    const delta = roundedTarget - startVal;
    if (Math.abs(delta) < 0.00001) return;

    let rafId = 0;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // Snappy quintic ease-out: rockets through early digits and lands crisply
      const eased = 1 - Math.pow(1 - t, 4);
      const rawNext = startVal + delta * eased;
      const next =
        t >= 1 ? roundedTarget : Math.round(rawNext * factor) / factor;
      currentRef.current = next;
      setDisplayValue(next);
      if (t < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [durationMs, enabled, factor, prefersReduced, roundedTarget]);

  return prefersReduced ? roundedTarget : displayValue;
}
