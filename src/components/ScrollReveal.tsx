import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: 'up' | 'left' | 'right';
  delayMs?: number;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * Observe-only NYT-feature-style scroll reveal:
 * Elements gently fade and glide into view as the user scrolls closer to them.
 * Once revealed and settled, transform/opacity/willChange are cleared completely
 * so revealed containers NEVER trap dropdown popovers in a CSS stacking context.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  direction = 'up',
  delayMs = 0,
  style,
  className,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  const [visible, setVisible] = useState<boolean>(reducedMotion);
  const [settled, setSettled] = useState<boolean>(reducedMotion);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      setSettled(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -24px 0px' }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || settled) return;
    const timer = window.setTimeout(() => {
      setSettled(true);
    }, delayMs + 640);
    return () => window.clearTimeout(timer);
  }, [delayMs, settled, visible]);

  const initialTransform =
    direction === 'left'
      ? 'translate3d(-24px, 8px, 0)'
      : direction === 'right'
        ? 'translate3d(24px, 8px, 0)'
        : 'translate3d(0, 22px, 0)';

  if (settled) {
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : initialTransform,
        transition: `opacity 540ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform 600ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
