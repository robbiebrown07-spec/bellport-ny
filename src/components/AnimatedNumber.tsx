import React, { useEffect, useRef, useState } from 'react';
import { fmtShortDollar } from '../lib/unifiedCatalog';
import { useCountUp } from './useCountUp';

export type NumberFormatKind =
  | 'integer'
  | 'currency'
  | 'shortDollar'
  | 'signedShortDollar'
  | 'decimal'
  | 'pct'
  | 'signedPct';

interface AnimatedNumberProps {
  value: number;
  format?: NumberFormatKind;
  decimals?: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  animateOnView?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

function formatTickValue(val: number, format: NumberFormatKind, decimals: number): string {
  switch (format) {
    case 'currency':
      return `$${Math.round(val).toLocaleString()}`;
    case 'shortDollar':
      return fmtShortDollar(Math.round(val));
    case 'signedShortDollar': {
      const rounded = Math.round(val);
      if (rounded > 0) return `+${fmtShortDollar(rounded)}`;
      if (rounded < 0) return `-${fmtShortDollar(Math.abs(rounded))}`;
      return '$0';
    }
    case 'decimal':
      return decimals > 0 ? val.toFixed(decimals) : String(Math.round(val));
    case 'pct': {
      const v = decimals > 0 ? val.toFixed(decimals) : String(Math.round(val));
      return `${v}%`;
    }
    case 'signedPct': {
      const n = decimals > 0 ? Number(val.toFixed(decimals)) : Math.round(val);
      const str = decimals > 0 ? n.toFixed(decimals) : String(n);
      return n > 0 ? `+${str}%` : `${str}%`;
    }
    case 'integer':
    default:
      return Math.round(val).toLocaleString();
  }
}

/**
 * Self-contained fast-ticking number span (`tabular-nums`) that triggers when scrolled into view
 * and smoothly re-ticks whenever `value` updates (e.g., filter, scope, or timeframe changes).
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = 'integer',
  decimals = 0,
  durationMs = 480,
  prefix = '',
  suffix = '',
  animateOnView = true,
  className,
  style,
}) => {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const [inView, setInView] = useState<boolean>(() => !animateOnView);

  useEffect(() => {
    if (inView || !animateOnView) return;
    const el = spanRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      const raf = window.requestAnimationFrame(() => setInView(true));
      return () => window.cancelAnimationFrame(raf);
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.05, rootMargin: '20px 0px' }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [animateOnView, inView]);

  const effectiveDecimals =
    decimals > 0
      ? decimals
      : format === 'decimal'
        ? 1
        : 0;

  const animated = useCountUp(value, {
    durationMs,
    decimals: effectiveDecimals,
    enabled: inView,
  });

  return (
    <span
      ref={spanRef}
      className={className}
      style={{
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {prefix}
      {formatTickValue(animated, format, effectiveDecimals)}
      {suffix}
    </span>
  );
};
