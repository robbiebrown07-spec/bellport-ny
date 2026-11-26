import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Sparkles, X } from 'lucide-react';
import type { Listing } from '../types';
import type { RobbieFitEvaluation } from '../lib/robbieFit';

interface RobbieFitBadgeProps {
  listing: Listing;
  fit: RobbieFitEvaluation;
  compact?: boolean;
}

export const RobbieFitBadge: React.FC<RobbieFitBadgeProps> = ({
  listing,
  fit,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!fit.tier) return null;

  const palette =
    fit.tier === 'perfect'
      ? {
          bg: '#1a73e8',
          fg: '#ffffff',
          border: '#1a73e8',
          softBg: '#e8f0fe',
          softFg: '#174ea6',
        }
      : fit.tier === 'great'
        ? {
            bg: '#e8f0fe',
            fg: '#174ea6',
            border: 'rgba(26, 115, 232, 0.28)',
            softBg: '#e8f0fe',
            softFg: '#174ea6',
          }
        : {
            bg: '#fef7e0',
            fg: '#b06000',
            border: 'rgba(251, 188, 4, 0.45)',
            softBg: '#fef7e0',
            softFg: '#b06000',
          };

  return (
    <>
      <button
        type="button"
        title="Click to see how this home matches Robbie’s architectural & property wish list"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: compact ? '2px 8px' : '3px 10px',
          borderRadius: 999,
          border: `1px solid ${palette.border}`,
          background: palette.bg,
          color: palette.fg,
          fontSize: compact ? 10.5 : 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          lineHeight: 1.3,
        }}
      >
        <span>{fit.badgeLabel}</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Robbie fit breakdown for ${listing.address}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1210,
              background: 'rgba(32, 33, 36, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 520,
                maxHeight: '88vh',
                overflowY: 'auto',
                borderRadius: 20,
                background: '#ffffff',
                border: '1px solid var(--line)',
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.18)',
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <span className="eyebrow" style={{ marginBottom: 4 }}>
                    Personal Taste Match · {fit.score}/100
                  </span>
                  <h3 style={{ fontSize: 20, margin: 0 }}>{listing.address}</h3>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>
                    {listing.style} · {listing.lotAcres} ac · {listing.beds} bd / {listing.baths} ba
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close fit modal"
                  className="icon-btn"
                  style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
                >
                  <X size={15} />
                </button>
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: palette.softBg,
                  color: palette.softFg,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
                  <Sparkles size={14} />
                  <span>{fit.badgeLabel} for Robbie</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>
                  {fit.summary}
                </p>
              </div>

              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {fit.criteria.map((c, idx) => (
                  <div
                    key={c.label}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 12px',
                      borderBottom: idx < fit.criteria.length - 1 ? '1px solid var(--line)' : 'none',
                      fontSize: 12.5,
                    }}
                  >
                    <span
                      style={{
                        marginTop: 2,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: c.met ? '#e6f4ea' : 'var(--surface-subtle)',
                        color: c.met ? '#137333' : 'var(--ink-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {c.met ? <Check size={12} /> : <Minus size={12} />}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, color: c.met ? 'var(--ink)' : 'var(--ink-2)' }}>
                        {c.label}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{c.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
