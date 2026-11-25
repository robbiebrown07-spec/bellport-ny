import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import type { Listing, UserTrackStatus } from '../types';
import { PropertyIllustration } from './PropertyIllustration';
import { HighlightedText } from './HighlightedText';

interface PropertyDrawerProps {
  listing: Listing | null;
  searchQuery: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onUpdateListing: (id: string, patch: Partial<Listing>) => void;
  onDeleteListing: (id: string) => void;
}

const STATUS_OPTIONS: Array<{ value: UserTrackStatus; label: string }> = [
  { value: 'shortlist', label: 'Shortlist' },
  { value: 'watching', label: 'Watching' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'pass', label: 'Pass' },
];

export const PropertyDrawer: React.FC<PropertyDrawerProps> = ({
  listing,
  searchQuery,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onUpdateListing,
  onDeleteListing,
}) => {
  const [newTag, setNewTag] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    setNewTag('');
  }, [listing?.id]);

  useEffect(() => {
    if (!listing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (!inInput && e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (!inInput && e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [listing, hasPrev, hasNext, onPrev, onNext, onClose]);

  if (!listing) return null;

  const ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTag.trim().toLowerCase();
    if (!cleaned) return;
    if (!listing.features.some((f) => f.toLowerCase() === cleaned)) {
      onUpdateListing(listing.id, { features: [...listing.features, cleaned] });
    }
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    onUpdateListing(listing.id, {
      features: listing.features.filter((f) => f !== tag),
    });
  };

  return (
    <div
      className="backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-listing-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer">
        <div className="drawer__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="icon-btn"
              disabled={!hasPrev}
              onClick={onPrev}
              title="Previous listing (←)"
              aria-label="Previous listing"
              style={{ opacity: hasPrev ? 1 : 0.4 }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              disabled={!hasNext}
              onClick={onNext}
              title="Next listing (→)"
              aria-label="Next listing"
              style={{ opacity: hasNext ? 1 : 0.4 }}
            >
              <ChevronRight size={16} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-muted)', marginLeft: 4 }}>
              Use ← / → or Esc
            </span>
          </div>

          <button
            id="btn-close-drawer"
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close property details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="drawer__body">
          <div
            style={{
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              border: '1px solid var(--line)',
              aspectRatio: '16 / 9',
            }}
          >
            <PropertyIllustration
              archetype={listing.archetype}
              address={listing.address}
              styleName={listing.style}
              photoUrl={listing.photoUrl}
            />
          </div>

          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className={`badge ${listing.inVillage ? 'badge--village' : 'badge--outside'}`}>
                {listing.inVillage
                  ? 'Incorporated Village ✓ (Ho-Hum Ferry + Marina)'
                  : 'Outside Village Boundary (No Ho-Hum Ferry)'}
              </span>
              <span className="badge">Flood Zone {listing.floodZone}</span>
              <span className="badge" style={{ textTransform: 'capitalize' }}>
                {listing.marketStatus}
              </span>
            </div>

            <h2 id="drawer-listing-title" style={{ fontSize: 28, marginBottom: 4 }}>
              <HighlightedText text={listing.address} query={searchQuery} />
            </h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>
              {listing.area} · {listing.style} · Built {listing.yearBuilt}
              {listing.walkToMarinaMin ? ` · ${listing.walkToMarinaMin} min walk to Marina` : ''}
            </p>
          </div>

          {/* Triage Status Selector */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}>
              SECOND-HOME TRACKING STATUS
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`status-dot-btn ${listing.userStatus === opt.value ? 'is-active' : ''}`}
                  style={
                    listing.userStatus === opt.value
                      ? {
                          borderColor: 'var(--accent)',
                          background: 'var(--accent-soft)',
                          color: 'var(--ink)',
                        }
                      : undefined
                  }
                  onClick={() => onUpdateListing(listing.id, { userStatus: opt.value })}
                >
                  <span className={`status-dot status-dot--${opt.value}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Core Specs Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Asking Price</div>
              <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>
                ${listing.price.toLocaleString()}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Price / Sq Ft</div>
              <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>
                ${ppsf}/ft²
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Est. Annual Taxes</div>
              <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>
                ${listing.annualTaxes.toLocaleString()}/yr
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Bedrooms / Baths</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                {listing.beds} bd · {listing.baths} ba
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Interior Space</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                {listing.sqft.toLocaleString()} sq ft
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Lot Size</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                {listing.lotAcres} acres
              </strong>
            </div>
          </div>

          {/* Description with live keyword highlight */}
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Property Overview</h3>
            <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.6 }}>
              <HighlightedText text={listing.description} query={searchQuery} />
            </p>
          </div>

          {/* Searchable Keyword Tags */}
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Features & Searchable Keywords</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {listing.features.map((tag) => (
                <span
                  key={tag}
                  className="tag-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <HighlightedText text={tag} query={searchQuery} />
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      color: 'var(--ink-muted)',
                      lineHeight: 1,
                    }}
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={handleAddTag} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="input"
                placeholder="Add custom keyword (e.g., quiet lane, morning sun)..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="icon-btn">
                <Plus size={15} />
                <span>Tag</span>
              </button>
            </form>
          </div>

          {/* Personal Second-Home Notes */}
          <div>
            <label
              htmlFor="drawer-personal-notes"
              style={{ display: 'block', fontSize: 16, fontWeight: 500, marginBottom: 6 }}
            >
              Personal Second-Home Notes
            </label>
            <textarea
              id="drawer-personal-notes"
              className="textarea priv-val"
              value={listing.personalNotes}
              onChange={(e) => onUpdateListing(listing.id, { personalNotes: e.target.value })}
              placeholder="Record renovation estimates, walkability feel, broker feedback, or target offer..."
            />
          </div>

          {/* Footer metadata & actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 14,
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              {listing.brokerage}
              {listing.mlsId ? ` · ${listing.mlsId}` : ''} · {listing.daysOnMarket}d on market
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {listing.sourceUrl && (
                <a
                  href={listing.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <span>Source</span>
                  <ExternalLink size={14} />
                </a>
              )}

              {!confirmDelete ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setConfirmDelete(true)}
                  style={{ color: 'var(--g-red-600)' }}
                >
                  <Trash2 size={14} />
                  <span>Remove</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn"
                  style={{
                    background: 'var(--g-red)',
                    borderColor: 'var(--g-red)',
                    color: 'var(--white)',
                  }}
                  onClick={() => onDeleteListing(listing.id)}
                >
                  Confirm Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
