import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Search, X } from 'lucide-react';
import {
  DESIGN_FEATURE_LABELS,
  DESIGN_FEATURE_OPTIONS,
  fmtShortDollar,
  INITIAL_UNIFIED_FILTERS,
  isAnyUnifiedFilterActive,
  MECE_VILLAGE_AREAS,
  parseFlexibleNumber,
  type UnifiedFilters,
} from '../lib/unifiedCatalog';

interface UnifiedFilterBarProps {
  filters: UnifiedFilters;
  onChange: (next: UnifiedFilters) => void;
  context: 'map' | 'listings';
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

type OpenMenu = 'status' | 'price' | 'size' | 'lot' | 'area' | 'feat' | null;

export const UnifiedFilterBar: React.FC<UnifiedFilterBarProps> = ({
  filters,
  onChange,
  context,
  searchInputRef,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const patch = (p: Partial<UnifiedFilters>) => onChange({ ...filters, ...p });

  // Summaries
  const statusParts: string[] = [];
  if (filters.forSale) statusParts.push('For Sale');
  if (filters.soldRecent) statusParts.push(`Sold ≤${filters.soldYears}y`);
  if (filters.builtRecent) statusParts.push(`Built ≤${filters.builtYears}y`);
  if (filters.allPastSales) statusParts.push('Past Sales');
  if (filters.allHomes) statusParts.push('All Homes');
  const statusActive = statusParts.length > 0;
  const statusSummary = statusActive
    ? statusParts.join(', ')
    : context === 'listings'
      ? 'Status: For Sale'
      : 'Status';

  const priceActive = filters.minPrice !== null || filters.maxPrice !== null;
  const priceSummary = !priceActive
    ? 'Price'
    : filters.minPrice !== null && filters.maxPrice !== null
      ? `${fmtShortDollar(filters.minPrice)} – ${fmtShortDollar(filters.maxPrice)}`
      : filters.minPrice !== null
        ? `${fmtShortDollar(filters.minPrice)}+`
        : `Up to ${fmtShortDollar(filters.maxPrice ?? 0)}`;

  const sizeParts: string[] = [];
  if (filters.minBeds !== null || filters.maxBeds !== null) {
    sizeParts.push(
      filters.minBeds && filters.maxBeds
        ? `${filters.minBeds}–${filters.maxBeds} bd`
        : filters.minBeds
          ? `${filters.minBeds}+ bd`
          : `≤${filters.maxBeds} bd`
    );
  }
  if (filters.minBaths !== null || filters.maxBaths !== null) {
    sizeParts.push(
      filters.minBaths && filters.maxBaths
        ? `${filters.minBaths}–${filters.maxBaths} ba`
        : filters.minBaths
          ? `${filters.minBaths}+ ba`
          : `≤${filters.maxBaths} ba`
    );
  }
  if (filters.minSqft !== null || filters.maxSqft !== null) {
    sizeParts.push(
      filters.minSqft && filters.maxSqft
        ? `${filters.minSqft}–${filters.maxSqft} ft²`
        : filters.minSqft
          ? `${filters.minSqft}+ ft²`
          : `≤${filters.maxSqft} ft²`
    );
  }
  const sizeActive = sizeParts.length > 0;
  const sizeSummary = sizeActive ? sizeParts.join(' · ') : 'Size';

  const lotActive = filters.minLot !== null || filters.maxLot !== null;
  const lotSummary = !lotActive
    ? 'Lot'
    : filters.minLot !== null && filters.maxLot !== null
      ? `${filters.minLot}–${filters.maxLot} ac`
      : filters.minLot !== null
        ? `${filters.minLot}+ ac`
        : `≤${filters.maxLot} ac`;

  const areaCount = (filters.belowSC ? 1 : 0) + filters.areas.length;
  const areaSummary =
    filters.belowSC && filters.areas.length === 0
      ? 'Below S Country Rd'
      : !filters.belowSC && filters.areas.length === 1
        ? filters.areas[0]
        : areaCount > 0
          ? `Area (${areaCount})`
          : 'Area';

  const featCount = filters.feats.length;
  const featSummary =
    featCount === 0
      ? 'Features'
      : featCount === 1
        ? DESIGN_FEATURE_LABELS[filters.feats[0]] ?? filters.feats[0]
        : `Features (${featCount})`;

  const triggerStyle = (active: boolean): React.CSSProperties => ({
    height: 36,
    padding: '0 13px',
    borderRadius: 999,
    border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? '#ffffff' : 'var(--ink)',
    fontSize: 12.5,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  });

  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    zIndex: 45,
    width: 280,
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 18,
    boxShadow: 'var(--shadow-2)',
    padding: 14,
    fontSize: 12.5,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 34,
    padding: '0 10px',
    borderRadius: 10,
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  };

  return (
    <div
      ref={barRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* 1. STATUS + TIMELINE */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(statusActive)}
            onClick={() => setOpenMenu((m) => (m === 'status' ? null : 'status'))}
          >
            <span>{statusSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'status' && (
            <div style={popoverStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Property Status
                </strong>
                {statusActive && (
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        forSale: false,
                        soldRecent: false,
                        builtRecent: false,
                        allPastSales: false,
                        allHomes: false,
                      })
                    }
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => patch({ forSale: !filters.forSale })}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 10,
                    border: 'none',
                    background: filters.forSale ? 'var(--accent-soft)' : 'transparent',
                    fontWeight: filters.forSale ? 600 : 400,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 3,
                        background: '#9be3b0',
                        border: '1px solid #1f7a46',
                      }}
                    />
                    For Sale
                  </span>
                  <span>{filters.forSale ? '✓' : ''}</span>
                </button>

                {/* Sold Recently + Years Selector */}
                <div
                  style={{
                    borderRadius: 12,
                    padding: filters.soldRecent ? 8 : 0,
                    background: filters.soldRecent ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => patch({ soldRecent: !filters.soldRecent })}
                    style={{
                      width: '100%',
                      padding: filters.soldRecent ? '2px 2px 6px' : '7px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      fontWeight: filters.soldRecent ? 600 : 400,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 3,
                          background: '#9cd3e8',
                          border: '1px solid #1e6b8c',
                        }}
                      />
                      Sold recently
                    </span>
                    <span>{filters.soldRecent ? '✓' : ''}</span>
                  </button>
                  {filters.soldRecent && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                        <span>Within last (years):</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={filters.soldYears}
                          onChange={(e) =>
                            patch({ soldYears: Math.max(1, Math.min(25, Number(e.target.value) || 3)) })
                          }
                          style={{ ...inputStyle, width: 56, height: 26, textAlign: 'center' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1, 2, 3, 5, 10].map((yr) => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => patch({ soldYears: yr })}
                            style={{
                              flex: 1,
                              padding: '4px 0',
                              borderRadius: 8,
                              border: '1px solid var(--line)',
                              background: filters.soldYears === yr ? 'var(--accent)' : '#ffffff',
                              color: filters.soldYears === yr ? '#ffffff' : 'var(--ink)',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {yr}y
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Built Recently + Years Selector */}
                <div
                  style={{
                    borderRadius: 12,
                    padding: filters.builtRecent ? 8 : 0,
                    background: filters.builtRecent ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => patch({ builtRecent: !filters.builtRecent })}
                    style={{
                      width: '100%',
                      padding: filters.builtRecent ? '2px 2px 6px' : '7px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      fontWeight: filters.builtRecent ? 600 : 400,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: 3,
                          background: '#f7d98c',
                          border: '1px solid #b07412',
                        }}
                      />
                      Built recently
                    </span>
                    <span>{filters.builtRecent ? '✓' : ''}</span>
                  </button>
                  {filters.builtRecent && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                        <span>Within last (years):</span>
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={filters.builtYears}
                          onChange={(e) =>
                            patch({ builtYears: Math.max(1, Math.min(40, Number(e.target.value) || 5)) })
                          }
                          style={{ ...inputStyle, width: 56, height: 26, textAlign: 'center' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1, 3, 5, 10, 20].map((yr) => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => patch({ builtYears: yr })}
                            style={{
                              flex: 1,
                              padding: '4px 0',
                              borderRadius: 8,
                              border: '1px solid var(--line)',
                              background: filters.builtYears === yr ? 'var(--accent)' : '#ffffff',
                              color: filters.builtYears === yr ? '#ffffff' : 'var(--ink)',
                              fontSize: 11,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {yr}y
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => patch({ allPastSales: !filters.allPastSales })}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: filters.allPastSales ? 'var(--accent-soft)' : 'transparent',
                      fontWeight: filters.allPastSales ? 600 : 400,
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>All Past Sales</span>
                    <span>{filters.allPastSales ? '✓' : ''}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ allHomes: !filters.allHomes })}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: filters.allHomes ? 'var(--accent-soft)' : 'transparent',
                      fontWeight: filters.allHomes ? 600 : 400,
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>All Homes (1,058)</span>
                    <span>{filters.allHomes ? '✓' : ''}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. PRICE (LOW & HIGH) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(priceActive)}
            onClick={() => setOpenMenu((m) => (m === 'price' ? null : 'price'))}
          >
            <span>{priceSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'price' && (
            <div style={popoverStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Price / Est. Value
                </strong>
                {priceActive && (
                  <button
                    type="button"
                    onClick={() => patch({ minPrice: null, maxPrice: null })}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                    Low ($)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 800k"
                    defaultValue={filters.minPrice ?? ''}
                    onChange={(e) => patch({ minPrice: parseFlexibleNumber(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                    High ($)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2.5m"
                    defaultValue={filters.maxPrice ?? ''}
                    onChange={(e) => patch({ maxPrice: parseFlexibleNumber(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[1_000_000, 1_500_000, 2_000_000, 3_000_000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch({ minPrice: null, maxPrice: v })}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: filters.maxPrice === v ? 'var(--accent)' : 'var(--bg)',
                      color: filters.maxPrice === v ? '#ffffff' : 'var(--ink)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    ≤{fmtShortDollar(v)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3. SIZE (BEDROOMS, BATHROOMS, SQUARE FOOTAGE) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(sizeActive)}
            onClick={() => setOpenMenu((m) => (m === 'size' ? null : 'size'))}
          >
            <span>{sizeSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'size' && (
            <div style={{ ...popoverStyle, width: 295, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Home Size
                </strong>
                {sizeActive && (
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        minBeds: null,
                        maxBeds: null,
                        minBaths: null,
                        maxBaths: null,
                        minSqft: null,
                        maxSqft: null,
                      })
                    }
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Bedrooms</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select
                    value={filters.minBeds ?? ''}
                    onChange={(e) => patch({ minBeds: e.target.value ? Number(e.target.value) : null })}
                    style={inputStyle}
                  >
                    <option value="">Min Beds</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}+ bd
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.maxBeds ?? ''}
                    onChange={(e) => patch({ maxBeds: e.target.value ? Number(e.target.value) : null })}
                    style={inputStyle}
                  >
                    <option value="">Max Beds</option>
                    {[2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>
                        ≤ {n} bd
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Bathrooms</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <select
                    value={filters.minBaths ?? ''}
                    onChange={(e) => patch({ minBaths: e.target.value ? Number(e.target.value) : null })}
                    style={inputStyle}
                  >
                    <option value="">Min Baths</option>
                    {[1, 1.5, 2, 2.5, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}+ ba
                      </option>
                    ))}
                  </select>
                  <select
                    value={filters.maxBaths ?? ''}
                    onChange={(e) => patch({ maxBaths: e.target.value ? Number(e.target.value) : null })}
                    style={inputStyle}
                  >
                    <option value="">Max Baths</option>
                    {[1.5, 2, 2.5, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        ≤ {n} ba
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>Square Footage (ft²)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Low ft²"
                    defaultValue={filters.minSqft ?? ''}
                    onChange={(e) => patch({ minSqft: parseFlexibleNumber(e.target.value) })}
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="High ft²"
                    defaultValue={filters.maxSqft ?? ''}
                    onChange={(e) => patch({ maxSqft: parseFlexibleNumber(e.target.value) })}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. LOT (LOW & HIGH ACRES) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(lotActive)}
            onClick={() => setOpenMenu((m) => (m === 'lot' ? null : 'lot'))}
          >
            <span>{lotSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'lot' && (
            <div style={popoverStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Lot Size (Acres)
                </strong>
                {lotActive && (
                  <button
                    type="button"
                    onClick={() => patch({ minLot: null, maxLot: null })}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder="Low ac"
                  defaultValue={filters.minLot ?? ''}
                  onChange={(e) => patch({ minLot: parseFlexibleNumber(e.target.value) })}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="High ac"
                  defaultValue={filters.maxLot ?? ''}
                  onChange={(e) => patch({ maxLot: parseFlexibleNumber(e.target.value) })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0.35, 0.5, 0.75, 1.0].map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => patch({ minLot: a, maxLot: null })}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      borderRadius: 8,
                      border: '1px solid var(--line)',
                      background: filters.minLot === a ? 'var(--accent)' : 'var(--bg)',
                      color: filters.minLot === a ? '#ffffff' : 'var(--ink)',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {a}+ ac
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. AREA (BELOW SOUTH COUNTRY RD + 4 COLLECTIVELY EXHAUSTIVE AREAS) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(areaCount > 0)}
            onClick={() => setOpenMenu((m) => (m === 'area' ? null : 'area'))}
          >
            <span>{areaSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'area' && (
            <div style={popoverStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Village Area
                </strong>
                {areaCount > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ belowSC: false, areas: [] })}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => patch({ belowSC: !filters.belowSC })}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: filters.belowSC ? 'var(--accent)' : 'var(--bg)',
                  color: filters.belowSC ? '#ffffff' : 'var(--ink)',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span>Below South Country Rd</span>
                <span>{filters.belowSC ? '✓' : ''}</span>
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {MECE_VILLAGE_AREAS.map((a) => {
                  const active = filters.areas.includes(a.value);
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() =>
                        patch({
                          areas: active
                            ? filters.areas.filter((x) => x !== a.value)
                            : [...filters.areas, a.value],
                        })
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: 10,
                        border: 'none',
                        background: active ? 'var(--accent-soft)' : 'transparent',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: active ? 600 : 400 }}>{a.label}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{a.sub}</div>
                      </div>
                      <span>{active ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 6. FEATURES & DESIGN ELEMENTS */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            style={triggerStyle(featCount > 0)}
            onClick={() => setOpenMenu((m) => (m === 'feat' ? null : 'feat'))}
          >
            <span>{featSummary}</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === 'feat' && (
            <div style={{ ...popoverStyle, width: 295, maxHeight: 380, overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                  Features &amp; Design
                </strong>
                {featCount > 0 && (
                  <button
                    type="button"
                    onClick={() => patch({ feats: [] })}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {(['Grounds & Water', 'Architecture & Spaces'] as const).map((grp) => (
                <div key={grp} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--ink-2)',
                      padding: '4px 8px',
                    }}
                  >
                    {grp}
                  </div>
                  {DESIGN_FEATURE_OPTIONS.filter((f) => f.group === grp).map((f) => {
                    const active = filters.feats.includes(f.value);
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() =>
                          patch({
                            feats: active
                              ? filters.feats.filter((x) => x !== f.value)
                              : [...filters.feats, f.value],
                          })
                        }
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: 10,
                          border: 'none',
                          background: active ? 'var(--accent-soft)' : 'transparent',
                          fontWeight: active ? 600 : 400,
                          textAlign: 'left',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{f.label}</span>
                        <span>{active ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {isAnyUnifiedFilterActive(filters) && (
          <button
            type="button"
            className="icon-btn"
            style={{ height: 36 }}
            onClick={() => onChange(INITIAL_UNIFIED_FILTERS)}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Keyword / Address Search */}
      <div className="search-box" style={{ minWidth: 210 }}>
        <Search size={15} className="search-box__icon" />
        <input
          id="keyword-search-input"
          ref={searchInputRef}
          type="search"
          className="search-box__input"
          style={{ height: 36, fontSize: 12.5 }}
          value={filters.q}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="Search street or feature…"
          aria-label="Search Bellport Village homes"
        />
        {filters.q && (
          <button
            type="button"
            className="search-box__clear"
            onClick={() => patch({ q: '' })}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
};
