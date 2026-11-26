import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import type { Listing } from '../types';
import type { DealEvaluation } from '../lib/intelligence';

interface ValuationBadgeProps {
  listing: Listing;
  deal: DealEvaluation;
  compact?: boolean;
}

export const ValuationBadge: React.FC<ValuationBadgeProps> = ({
  listing,
  deal,
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

  const bg =
    deal.status === 'underpriced'
      ? '#e6f4ea'
      : deal.status === 'overpriced'
        ? '#fce8e6'
        : 'var(--surface-subtle)';
  const fg =
    deal.status === 'underpriced'
      ? '#137333'
      : deal.status === 'overpriced'
        ? '#c5221f'
        : 'var(--ink-2)';
  const borderCol =
    deal.status === 'underpriced'
      ? 'rgba(19, 115, 51, 0.24)'
      : deal.status === 'overpriced'
        ? 'rgba(197, 34, 31, 0.24)'
        : 'var(--line)';

  const labelText = compact
    ? deal.status === 'fair'
      ? 'Fair Value'
      : deal.status === 'underpriced'
        ? `Good Deal · ${Math.abs(deal.diffPct)}% Under`
        : `Overpriced · +${deal.diffPct}%`
    : deal.badgeLabel;

  return (
    <>
      <button
        type="button"
        className="priv-val"
        title="Click to see valuation argument & comp math"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: compact ? '2px 8px' : '4px 10px',
          borderRadius: 999,
          border: `1px solid ${borderCol}`,
          background: bg,
          color: fg,
          fontSize: compact ? 11 : 11.5,
          fontWeight: 600,
          cursor: 'pointer',
          lineHeight: 1.3,
        }}
      >
        <span>{labelText}</span>
        <HelpCircle size={compact ? 11 : 12} style={{ opacity: 0.75 }} />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Valuation argument for ${listing.address}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
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
                maxWidth: 540,
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
                    Bellport Village Valuation Argument
                  </span>
                  <h3 style={{ fontSize: 20, margin: 0 }}>{listing.address}</h3>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>
                    {listing.beds} bd · {listing.baths} ba · {listing.sqft.toLocaleString()} ft² ·{' '}
                    {listing.lotAcres} ac · Built {listing.yearBuilt}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close valuation modal"
                  className="icon-btn"
                  style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Headline Verdict */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: bg,
                  border: `1px solid ${borderCol}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <strong style={{ color: fg, fontSize: 14 }}>{deal.badgeLabel}</strong>
                <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{deal.argumentHeadline}</span>
              </div>

              {/* Price vs Fair Value Side-by-Side */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'block' }}>
                    {listing.marketStatus === 'sold'
                      ? 'Closed Sale Price'
                      : listing.marketStatus === 'active'
                        ? 'Asking Price'
                        : 'Assessed / Est. Value'}
                  </span>
                  <strong style={{ fontSize: 17, fontFamily: 'var(--font-mono)' }}>
                    ${listing.price.toLocaleString()}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block' }}>
                    ${Math.round(listing.price / Math.max(1, listing.sqft))}/ft²
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)', display: 'block' }}>
                    Model Fair Value
                  </span>
                  <strong style={{ fontSize: 17, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                    ${deal.estimatedFairPrice.toLocaleString()}
                  </strong>
                  <span style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block' }}>
                    ${Math.round(deal.estimatedFairPrice / Math.max(1, listing.sqft))}/ft²
                  </span>
                </div>
              </div>

              {/* Plain-English Argument */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--ink-2)',
                    marginBottom: 6,
                  }}
                >
                  Our Valuation Thesis
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
                  {deal.argumentSummary}
                </p>
              </div>

              {/* Itemized Fair-Value Ledger */}
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--ink-2)',
                    marginBottom: 8,
                  }}
                >
                  Component-by-Component Math
                </div>
                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  {deal.breakdown.map((row, idx) => (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        padding: '9px 12px',
                        borderBottom:
                          idx < deal.breakdown.length - 1 ? '1px solid var(--line)' : 'none',
                        fontSize: 12.5,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.label}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{row.detail}</div>
                      </div>
                      <strong style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {row.amountText}
                      </strong>
                    </div>
                  ))}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--surface-subtle)',
                      borderTop: '1px solid var(--line)',
                      fontSize: 13,
                    }}
                  >
                    <strong>Estimated Fair Value</strong>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                      ${deal.estimatedFairPrice.toLocaleString()}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
