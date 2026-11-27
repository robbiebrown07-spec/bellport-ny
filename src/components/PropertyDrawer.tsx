import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Home,
  MapPin,
  Plus,
  Sparkles,
  ThumbsDown,
  Trash2,
  X,
} from 'lucide-react';
import type { Listing, PricePoint } from '../types';
import { evaluateGoodDeal } from '../lib/intelligence';
import { evaluateRobbieFit } from '../lib/robbieFit';
import {
  evaluateArchitecturalBeauty,
  getOwnerAndAirbnbProfile,
} from '../lib/ownerAndAirbnb';
import { PhotoGallery } from './PhotoGallery';
import { PriceHistoryChart } from './PriceHistoryChart';
import { HighlightedText } from './HighlightedText';
import { ValuationBadge } from './ValuationBadge';
import { RobbieFitBadge } from './RobbieFitBadge';
import { SkimmablePropertyNotes } from './SkimmablePropertyNotes';
import { getVillageDistances } from '../lib/unifiedCatalog';

export interface ParcelOwnerMeta {
  parcelId?: string | null;
  owner?: string | null;
  mail?: string | null;
  absentee?: boolean;
}

interface PropertyDrawerProps {
  listing: Listing | null;
  parcelMeta?: ParcelOwnerMeta | null;
  allListings: Listing[];
  privacyBlur: boolean;
  searchQuery: string;
  isHidden?: boolean;
  backLabel?: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onShowOnMap?: () => void;
  onUpdateListing: (id: string, patch: Partial<Listing>) => void;
  onToggleHidden?: () => void;
  onDeleteListing: (id: string) => void;
}

export const PropertyDrawer: React.FC<PropertyDrawerProps> = ({
  listing,
  parcelMeta,
  allListings,
  privacyBlur,
  searchQuery,
  isHidden = false,
  backLabel = 'Back',
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onShowOnMap,
  onUpdateListing,
  onToggleHidden,
  onDeleteListing,
}) => {
  const [newTag, setNewTag] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const edgeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!listing) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [listing, hasPrev, hasNext, onPrev, onNext, onClose]);

  if (!listing) return null;

  const ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;
  const deal = evaluateGoodDeal(listing, allListings);
  const fit = evaluateRobbieFit(listing);
  const beauty = evaluateArchitecturalBeauty(listing);
  const ownerAirbnb = getOwnerAndAirbnbProfile({
    parcelId: parcelMeta?.parcelId ?? listing.id,
    owner: parcelMeta?.owner,
    mail: parcelMeta?.mail,
    absentee: parcelMeta?.absentee,
    listing,
  });

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

  const handleAddPricePoint = (point: PricePoint, newCurrentPrice: number) => {
    const existing = listing.priceHistory ?? [
      { date: listing.listedDate, price: listing.originalPrice ?? listing.price, event: 'Listed' },
    ];
    const nextHistory = [...existing, point].sort((a, b) => a.date.localeCompare(b.date));
    onUpdateListing(listing.id, {
      price: newCurrentPrice,
      originalPrice: listing.originalPrice ?? listing.price,
      priceHistory: nextHistory,
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
      <div
        className="drawer"
        onTouchStart={(e) => {
          if (e.touches.length === 1 && e.touches[0].clientX <= 28) {
            edgeSwipeStartRef.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          } else {
            edgeSwipeStartRef.current = null;
          }
        }}
        onTouchEnd={(e) => {
          const start = edgeSwipeStartRef.current;
          edgeSwipeStartRef.current = null;
          if (!start || e.changedTouches.length === 0) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = Math.abs(e.changedTouches[0].clientY - start.y);
          if (dx > 75 && dy < 48) {
            onClose();
          }
        }}
      >
        <div className="drawer__header">
          <button
            id="btn-back-drawer"
            type="button"
            className="drawer__back-btn"
            onClick={onClose}
            aria-label={backLabel}
          >
            <ArrowLeft size={16} />
            <span>{backLabel}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <button
              type="button"
              className={`icon-btn ${listing.isFavorite ? 'is-active' : ''}`}
              onClick={() =>
                onUpdateListing(listing.id, { isFavorite: !listing.isFavorite })
              }
              aria-pressed={Boolean(listing.isFavorite)}
              style={{ minWidth: 40, minHeight: 40, padding: '0 10px' }}
            >
              <Heart
                size={15}
                fill={listing.isFavorite ? 'var(--g-red)' : 'none'}
                color={listing.isFavorite ? 'var(--g-red)' : 'currentColor'}
              />
              <span>{listing.isFavorite ? 'Saved' : 'Save'}</span>
            </button>

            {onToggleHidden && (
              <button
                type="button"
                className="icon-btn"
                onClick={onToggleHidden}
                aria-pressed={isHidden}
                title={isHidden ? 'Restore to search results' : 'Remove from search results'}
                style={{
                  minWidth: 40,
                  minHeight: 40,
                  padding: '0 10px',
                  ...(isHidden
                    ? { background: '#fce8e6', color: '#c5221f', borderColor: 'rgba(197,34,31,0.3)' }
                    : {}),
                }}
              >
                <ThumbsDown
                  size={15}
                  fill={isHidden ? '#c5221f' : 'none'}
                  color={isHidden ? '#c5221f' : 'currentColor'}
                />
                <span>{isHidden ? 'Restore' : 'Pass'}</span>
              </button>
            )}

            <button
              id="btn-close-drawer"
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close property details"
              style={{ minWidth: 40, minHeight: 40, padding: 0, flexShrink: 0 }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="drawer__body">
          <PhotoGallery
            photos={listing.photos}
            photoUrl={listing.photoUrl}
            archetype={listing.archetype}
            address={listing.address}
            styleName={listing.style}
          />

          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
              <RobbieFitBadge listing={listing} fit={fit} />
              <span className={`badge ${listing.inVillage ? 'badge--village' : 'badge--outside'}`}>
                {listing.inVillage
                  ? 'Incorporated Village ✓ (Ho-Hum Ferry + Marina)'
                  : 'Outside Village Boundary (No Ho-Hum Ferry)'}
              </span>
              {listing.floodZone !== 'X' && (
                <span
                  className="badge"
                  style={{
                    background: '#fef7e0',
                    color: '#b06000',
                    borderColor: 'rgba(251,188,4,0.5)',
                  }}
                >
                  Flood Zone {listing.floodZone}
                </span>
              )}
              <span className="badge" style={{ textTransform: 'capitalize' }}>
                {listing.marketStatus}
              </span>
              {onShowOnMap && (
                <button
                  type="button"
                  className="show-on-map-btn"
                  style={{ minHeight: 30, padding: '3px 11px', fontSize: 12 }}
                  onClick={onShowOnMap}
                >
                  <MapPin size={13} />
                  <span>Show on Map</span>
                </button>
              )}
            </div>

            <h2 id="drawer-listing-title" style={{ fontSize: 26, marginBottom: 4 }}>
              <HighlightedText text={listing.address} query={searchQuery} />
            </h2>
            <p style={{ color: 'var(--ink-2)', fontSize: 13, marginBottom: 6 }}>
              {listing.area} · {listing.style} · Built {listing.yearBuilt}
            </p>
            {(listing.styleSummary || listing.headline) && (
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink)', margin: 0 }}>
                {listing.styleSummary ?? listing.headline}
              </p>
            )}
          </div>

          {/* Core Specs Grid (Includes Bed/Bath, Sq Ft, $/Ft², Acres, 10-Pt Architectural Beauty & Distances) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: 12,
              padding: 16,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                {listing.marketStatus === 'sold'
                  ? 'Sold Price'
                  : listing.marketStatus === 'off-market'
                    ? 'Est. Market Value'
                    : 'Asking Price'}
              </div>
              <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>
                ${listing.price.toLocaleString()}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Price / Sq Ft</div>
              <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 18 }}>
                {ppsf > 0 ? `$${ppsf}/ft²` : '—'}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Architectural Beauty</div>
              <strong
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 18,
                  color: beauty.score10 >= 8.5 ? 'var(--accent)' : 'var(--ink)',
                }}
              >
                {beauty.display}
              </strong>
              <div style={{ fontSize: 10.5, color: 'var(--ink-2)', marginTop: 1 }}>
                {beauty.tierLabel}
              </div>
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
                {listing.sqft > 0 ? `${listing.sqft.toLocaleString()} sq ft` : '—'}
              </strong>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Lot Size</div>
              <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 16 }}>
                {listing.lotAcres} acres
              </strong>
            </div>
            {(() => {
              const dists = getVillageDistances(listing.latitude, listing.longitude);
              return (
                <>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      Commercial District Stores
                    </div>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                      {dists.distStoresMi} mi · {dists.walkStoresMin}m walk
                    </strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      Town Marina &amp; Ferry
                    </div>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                      {dists.distMarinaMi} mi · {dists.walkMarinaMin}m walk
                    </strong>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Est. Fair Value</div>
                    <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
                      ${deal.estimatedFairPrice.toLocaleString()}
                    </strong>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Architectural Beauty Rationale Callout */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: '#f8fafd',
              border: '1px solid rgba(26, 115, 232, 0.18)',
              fontSize: 12.5,
              color: 'var(--ink-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span>
              <strong style={{ color: 'var(--ink)' }}>
                Architectural Beauty {beauty.display}:
              </strong>{' '}
              {beauty.rationale}
            </span>
          </div>

          {/* Valuation & Owner Residency / Airbnb Cards */}
          <div className="form-grid">
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>
                  VALUATION
                </span>
                <ValuationBadge listing={listing} deal={deal} />
              </div>
              <div style={{ fontSize: 13 }} className="priv-val">
                Est. Village value:{' '}
                <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  ${deal.estimatedFairPrice.toLocaleString()}
                </strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deal.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line)',
                background: 'var(--surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Home size={13} />
                  <span>OWNER &amp; AIRBNB</span>
                </span>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 11,
                    fontWeight: 700,
                    background: ownerAirbnb.isListedOnAirbnb
                      ? '#e6f4ea'
                      : ownerAirbnb.residencyStatus === 'second_home'
                        ? '#e8f0fe'
                        : 'var(--bg)',
                    color: ownerAirbnb.isListedOnAirbnb
                      ? '#137333'
                      : ownerAirbnb.residencyStatus === 'second_home'
                        ? '#174ea6'
                        : 'var(--ink-2)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {ownerAirbnb.isListedOnAirbnb
                    ? 'Active on Airbnb ✓'
                    : ownerAirbnb.residencyStatus === 'second_home'
                      ? 'Second Home'
                      : 'Full-Time Local'}
                </span>
              </div>

              {ownerAirbnb.hasOwnerRecord && (
                <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>
                  <strong>Roll Owner:</strong> {ownerAirbnb.ownerDisplay} (
                  {ownerAirbnb.ownershipStructure})
                </div>
              )}

              <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                <strong style={{ color: 'var(--ink)' }}>{ownerAirbnb.residencyBadge}.</strong>{' '}
                {ownerAirbnb.residencySummary}
              </div>

              {ownerAirbnb.airbnbRecord ? (
                <div
                  style={{
                    marginTop: 2,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#ffffff',
                    border: '1px solid rgba(19, 115, 51, 0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 12.5, color: '#137333' }}>
                      Verified Airbnb Listing ({ownerAirbnb.airbnbRecord.rating})
                    </strong>
                    <a
                      href={ownerAirbnb.airbnbRecord.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--accent)',
                        textDecoration: 'none',
                      }}
                    >
                      <span>Open Airbnb</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                    “{ownerAirbnb.airbnbRecord.title}” · Host: {ownerAirbnb.airbnbRecord.host}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }} className="priv-val">
                    Peak ~<strong>${ownerAirbnb.estPeakNightly.toLocaleString()}/nt</strong> · Off-peak ~
                    <strong>${ownerAirbnb.estShoulderNightly}/nt</strong> · Est. Annual Gross:{' '}
                    <strong>${ownerAirbnb.estAnnualAirbnbRevenue.toLocaleString()}/yr</strong>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    paddingTop: 6,
                    borderTop: '1px dashed var(--line)',
                    fontSize: 12,
                    color: 'var(--ink-2)',
                  }}
                  className="priv-val"
                >
                  <strong style={{ color: 'var(--ink)' }}>Not currently listed on Airbnb.</strong>{' '}
                  If hosted seasonally: Est. Peak ~
                  <strong>${ownerAirbnb.estPeakNightly.toLocaleString()}/nt</strong> · August ~
                  <strong>${ownerAirbnb.estAugustGross.toLocaleString()}</strong> · Est. Annual ~
                  <strong>${ownerAirbnb.estAnnualAirbnbRevenue.toLocaleString()}/yr</strong> (
                  {ownerAirbnb.taxOffsetPct}% of taxes).
                </div>
              )}
            </div>
          </div>

          {/* Longitudinal Price History Chart */}
          <PriceHistoryChart
            listing={listing}
            privacyBlur={privacyBlur}
            onAddPricePoint={handleAddPricePoint}
          />

          {/* Skimmable Bulleted Property Notes + Road/Flood Concerns */}
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Property Highlights &amp; Notes</h3>
            <SkimmablePropertyNotes text={listing.description} listing={listing} />
          </div>

          {/* Searchable Keyword Tags */}
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 8 }}>Features & Searchable Keywords</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {listing.features
                .filter((tag) => !/^(?:flood\s+)?zone\s*x$/i.test(tag.trim()))
                .map((tag) => (
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
                placeholder="Add custom keyword (e.g., morning sun, quiet lane)..."
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

          {/* Bottom Back & Prev/Next Bar (easy thumb reach after scrolling down a listing) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="drawer__back-btn"
              onClick={onClose}
            >
              <ArrowLeft size={16} />
              <span>{backLabel}</span>
            </button>

            {(hasPrev || hasNext) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!hasPrev}
                  onClick={onPrev}
                  aria-label="Previous home"
                  style={{ opacity: hasPrev ? 1 : 0.4, minHeight: 40, padding: '0 11px' }}
                >
                  <ChevronLeft size={16} />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!hasNext}
                  onClick={onNext}
                  aria-label="Next home"
                  style={{ opacity: hasNext ? 1 : 0.4, minHeight: 40, padding: '0 11px' }}
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
