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
 * Elements gently fade and glide into view as the user scrolls closer to them,
 * while strictly honoring prefers-reduced-motion.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  direction = 'up',
  delayMs = 0,
  style,
  className,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  });

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
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
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  const initialTransform =
    direction === 'left'
      ? 'translate3d(-26px, 8px, 0)'
      : direction === 'right'
        ? 'translate3d(26px, 8px, 0)'
        : 'translate3d(0, 24px, 0)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate3d(0, 0, 0)' : initialTransform,
        transition: `opacity 560ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms, transform 620ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
        willChange: visible ? 'auto' : 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
