import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  BEAUTIFUL_STREET_OPTIONS,
  DESIGN_FEATURE_LABELS,
  DESIGN_FEATURE_OPTIONS,
  fmtShortDollar,
  INITIAL_UNIFIED_FILTERS,
  isAnyUnifiedFilterActive,
  MECE_VILLAGE_AREAS,
  parseFlexibleNumber,
  type UnifiedFilters,
} from '../lib/unifiedCatalog';
import { parseNaturalLanguageQuery } from '../lib/nlSearch';

interface UnifiedFilterBarProps {
  filters: UnifiedFilters;
  onChange: (next: UnifiedFilters) => void;
  context: 'map' | 'listings';
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

type OpenMenu = 'status' | 'price' | 'size' | 'lot' | 'area' | 'streets' | 'feat' | null;

const NL_SUGGESTIONS = [
  'All white houses',
  'Houses with large lawns',
  'Shingled 4+ bed on Bellport Ln or Livingston with pool or room for pool',
  '★ Perfect Fit below South Country Rd',
  'Quiet streets walkable to shops with porch',
];

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

  const parsedNl = useMemo(() => parseNaturalLanguageQuery(filters.nlQuery), [filters.nlQuery]);

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

  const streetsActive = filters.beautifulStreetsOnly || filters.beautifulStreets.length > 0;
  const streetsSummary = !streetsActive
    ? 'Beautiful Streets'
    : filters.beautifulStreets.length === 1
      ? BEAUTIFUL_STREET_OPTIONS.find((s) => s.id === filters.beautifulStreets[0])?.label ??
        'Beautiful Street'
      : filters.beautifulStreets.length > 1
        ? `Beautiful Streets (${filters.beautifulStreets.length})`
        : 'All Beautiful Streets';

  const hasPoolFeat = filters.feats.includes('pool');
  const hasSpacePoolFeat = filters.feats.includes('space_pool');
  const featCount = filters.feats.length;
  const featSummary =
    featCount === 0
      ? 'Features'
      : featCount === 2 && hasPoolFeat && hasSpacePoolFeat
        ? 'Pool or Room for Pool'
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

  const setPoolMode = (mode: 'none' | 'pool_only' | 'pool_or_room' | 'room_only') => {
    const rest = filters.feats.filter((f) => f !== 'pool' && f !== 'space_pool');
    if (mode === 'pool_only') patch({ feats: [...rest, 'pool'] });
    else if (mode === 'room_only') patch({ feats: [...rest, 'space_pool'] });
    else if (mode === 'pool_or_room') patch({ feats: [...rest, 'pool', 'space_pool'] });
    else patch({ feats: rest });
  };

  const toggleBeautifulStreetId = (id: string) => {
    const exists = filters.beautifulStreets.includes(id);
    const next = exists
      ? filters.beautifulStreets.filter((x) => x !== id)
      : [...filters.beautifulStreets, id];
    patch({
      beautifulStreets: next,
      beautifulStreetsOnly: next.length > 0,
    });
  };

  return (
    <div ref={barRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Natural Language House Search Bar */}
      <div
        style={{
          padding: '10px 14px',
          borderRadius: 16,
          background: 'var(--surface)',
          border: filters.nlQuery.trim() ? '1.5px solid var(--accent)' : '1px solid var(--line)',
          boxShadow: filters.nlQuery.trim() ? '0 2px 10px rgba(26,115,232,0.08)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="search"
            value={filters.nlQuery}
            onChange={(e) => patch({ nlQuery: e.target.value, q: '' })}
            placeholder='Search in plain English or by address — e.g. "all white houses", "houses with large lawns", or "shingled 4+ bed on Bellport Ln with pool or room for pool"'
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13.5,
              color: 'var(--ink)',
            }}
          />
          {filters.nlQuery && (
            <button
              type="button"
              onClick={() => patch({ nlQuery: '' })}
              aria-label="Clear natural language search"
              style={{
                border: 'none',
                background: 'var(--surface-subtle)',
                borderRadius: 999,
                width: 24,
                height: 24,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ink-2)',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {parsedNl.active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Matched criteria:
            </span>
            {parsedNl.chips.length > 0 ? (
              parsedNl.chips.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 11.5,
                    padding: '2px 9px',
                    borderRadius: 999,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {c}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                Matching description keywords across all Bellport Village homes
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', flexShrink: 0 }}>Try:</span>
            {NL_SUGGESTIONS.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => patch({ nlQuery: sug })}
                style={{
                  fontSize: 11.5,
                  padding: '3px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-subtle)',
                  color: 'var(--ink-2)',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Structured Filter Dropdown Row */}
      <div
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
              <div className="filter-popover">
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>Within:</span>
                        {[1, 3, 5, 10, 20].map((yr) => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => patch({ soldYears: yr })}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 999,
                              border: '1px solid var(--line)',
                              background: filters.soldYears === yr ? 'var(--accent)' : '#ffffff',
                              color: filters.soldYears === yr ? '#ffffff' : 'var(--ink)',
                              fontSize: 11,
                            }}
                          >
                            {yr}y
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={35}
                          value={filters.soldYears}
                          onChange={(e) =>
                            patch({ soldYears: Math.max(1, Math.min(35, Number(e.target.value) || 3)) })
                          }
                          style={{ ...inputStyle, width: 52, height: 26, padding: '0 6px' }}
                        />
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>Within:</span>
                        {[1, 3, 5, 10, 20].map((yr) => (
                          <button
                            key={yr}
                            type="button"
                            onClick={() => patch({ builtYears: yr })}
                            style={{
                              padding: '3px 8px',
                              borderRadius: 999,
                              border: '1px solid var(--line)',
                              background: filters.builtYears === yr ? 'var(--accent)' : '#ffffff',
                              color: filters.builtYears === yr ? '#ffffff' : 'var(--ink)',
                              fontSize: 11,
                            }}
                          >
                            {yr}y
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={filters.builtYears}
                          onChange={(e) =>
                            patch({ builtYears: Math.max(1, Math.min(40, Number(e.target.value) || 5)) })
                          }
                          style={{ ...inputStyle, width: 52, height: 26, padding: '0 6px' }}
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />

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
                    <span>All Past Sales (1993–2026)</span>
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
                    <span>All Village Homes (1,058)</span>
                    <span>{filters.allHomes ? '✓' : ''}</span>
                  </button>

                  <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                  <strong style={{ fontSize: 10.5, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Valuation Rating
                  </strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['', 'underpriced', 'overpriced'] as const).map((v) => (
                      <button
                        key={v || 'any'}
                        type="button"
                        onClick={() => patch({ valuation: v })}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: 999,
                          border: '1px solid var(--line)',
                          background: filters.valuation === v ? 'var(--accent)' : 'transparent',
                          color: filters.valuation === v ? '#ffffff' : 'var(--ink)',
                          fontSize: 11.5,
                        }}
                      >
                        {v === '' ? 'Any' : v === 'underpriced' ? 'Underpriced' : 'Overpriced'}
                      </button>
                    ))}
                  </div>

                  <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />
                  <strong style={{ fontSize: 10.5, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Fit for Robbie
                  </strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {(
                      [
                        ['', 'Any'],
                        ['perfect', '★ Perfect Fit'],
                        ['great_plus', 'Great + Perfect'],
                        ['good_plus', 'Good Fit+'],
                      ] as const
                    ).map(([v, lbl]) => (
                      <button
                        key={v || 'any-fit'}
                        type="button"
                        onClick={() => patch({ robbieFit: v })}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 999,
                          border: '1px solid var(--line)',
                          background: filters.robbieFit === v ? 'var(--accent)' : 'transparent',
                          color: filters.robbieFit === v ? '#ffffff' : 'var(--ink)',
                          fontSize: 11.5,
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. PRICE (LOW / HIGH) */}
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
              <div className="filter-popover">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Price Range ($)
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)' }}>Low ($)</label>
                    <input
                      style={inputStyle}
                      placeholder="No min (e.g. 800k)"
                      defaultValue={filters.minPrice ?? ''}
                      onBlur={(e) => patch({ minPrice: parseFlexibleNumber(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          patch({ minPrice: parseFlexibleNumber((e.target as HTMLInputElement).value) });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)' }}>High ($)</label>
                    <input
                      style={inputStyle}
                      placeholder="No max (e.g. 2.5m)"
                      defaultValue={filters.maxPrice ?? ''}
                      onBlur={(e) => patch({ maxPrice: parseFlexibleNumber(e.target.value) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          patch({ maxPrice: parseFlexibleNumber((e.target as HTMLInputElement).value) });
                        }
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[
                    ['<$1M', null, 1_000_000],
                    ['$1M–$2M', 1_000_000, 2_000_000],
                    ['$2M–$3.5M', 2_000_000, 3_500_000],
                    ['$3.5M+', 3_500_000, null],
                  ].map(([lbl, lo, hi]) => (
                    <button
                      key={lbl as string}
                      type="button"
                      onClick={() =>
                        patch({ minPrice: lo as number | null, maxPrice: hi as number | null })
                      }
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--line)',
                        background: 'var(--bg)',
                        fontSize: 11.5,
                      }}
                    >
                      {lbl as string}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. SIZE (BEDS, BATHS, SQ FT) */}
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
              <div className="filter-popover filter-popover--wide">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
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
                      Clear all
                    </button>
                  )}
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Bedrooms
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      max={12}
                      style={inputStyle}
                      placeholder="Min beds"
                      value={filters.minBeds ?? ''}
                      onChange={(e) =>
                        patch({ minBeds: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      max={12}
                      style={inputStyle}
                      placeholder="Max beds"
                      value={filters.maxBeds ?? ''}
                      onChange={(e) =>
                        patch({ maxBeds: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Bathrooms
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={12}
                      style={inputStyle}
                      placeholder="Min baths"
                      value={filters.minBaths ?? ''}
                      onChange={(e) =>
                        patch({ minBaths: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={12}
                      style={inputStyle}
                      placeholder="Max baths"
                      value={filters.maxBaths ?? ''}
                      onChange={(e) =>
                        patch({ maxBaths: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Interior Square Footage
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input
                      type="number"
                      step={100}
                      style={inputStyle}
                      placeholder="Low sq ft"
                      value={filters.minSqft ?? ''}
                      onChange={(e) =>
                        patch({ minSqft: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    <input
                      type="number"
                      step={100}
                      style={inputStyle}
                      placeholder="High sq ft"
                      value={filters.maxSqft ?? ''}
                      onChange={(e) =>
                        patch({ maxSqft: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. LOT (LOW / HIGH ACRES) */}
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
              <div className="filter-popover">
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)' }}>Low (ac)</label>
                    <input
                      type="number"
                      step="0.05"
                      style={inputStyle}
                      placeholder="No min"
                      value={filters.minLot ?? ''}
                      onChange={(e) =>
                        patch({ minLot: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)' }}>High (ac)</label>
                    <input
                      type="number"
                      step="0.05"
                      style={inputStyle}
                      placeholder="No max"
                      value={filters.maxLot ?? ''}
                      onChange={(e) =>
                        patch({ maxLot: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[0.25, 0.5, 0.75, 1.0].map((ac) => (
                    <button
                      key={ac}
                      type="button"
                      onClick={() => patch({ minLot: ac })}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--line)',
                        background: filters.minLot === ac ? 'var(--accent)' : 'var(--bg)',
                        color: filters.minLot === ac ? '#ffffff' : 'var(--ink)',
                        fontSize: 11.5,
                      }}
                    >
                      {ac}+ ac
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. BEAUTIFUL STREETS & SECTIONS */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={triggerStyle(streetsActive)}
              onClick={() => setOpenMenu((m) => (m === 'streets' ? null : 'streets'))}
            >
              <span>{streetsSummary}</span>
              <ChevronDown size={13} />
            </button>
            {openMenu === 'streets' && (
              <div className="filter-popover filter-popover--wide">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Most Beautiful Streets & Sections
                  </strong>
                  {streetsActive && (
                    <button
                      type="button"
                      onClick={() => patch({ beautifulStreetsOnly: false, beautifulStreets: [] })}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    patch({
                      beautifulStreetsOnly: ! (filters.beautifulStreetsOnly && filters.beautifulStreets.length === 0),
                      beautifulStreets: [],
                    })
                  }
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 12,
                    border:
                      filters.beautifulStreetsOnly && filters.beautifulStreets.length === 0
                        ? '1px solid var(--accent)'
                        : '1px solid var(--line)',
                    background:
                      filters.beautifulStreetsOnly && filters.beautifulStreets.length === 0
                        ? 'var(--accent-soft)'
                        : 'var(--bg)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                      All 8 Scenic Streets & Best Sections
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                      Highlights every selected lane directly on the Village map
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {filters.beautifulStreetsOnly && filters.beautifulStreets.length === 0 ? '✓' : ''}
                  </span>
                </button>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    maxHeight: 300,
                    overflowY: 'auto',
                  }}
                >
                  {BEAUTIFUL_STREET_OPTIONS.map((st) => {
                    const on = filters.beautifulStreets.includes(st.id);
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => toggleBeautifulStreetId(st.id)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 10,
                          border: 'none',
                          background: on ? 'var(--accent-soft)' : 'transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          textAlign: 'left',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: on ? 600 : 400 }}>{st.label}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{st.sub}</div>
                        </div>
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                          {on ? '✓' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 6. AREA */}
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
              <div className="filter-popover filter-popover--wide">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Village Areas (100% Coverage)
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
                    padding: '9px 12px',
                    borderRadius: 12,
                    border: filters.belowSC ? '1px solid var(--accent)' : '1px solid var(--line)',
                    background: filters.belowSC ? 'var(--accent-soft)' : 'var(--bg)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>Below South Country Road</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                      South of Main St · Bay, Marina & Historic Lanes
                    </div>
                  </div>
                  <span style={{ fontWeight: 700 }}>{filters.belowSC ? '✓' : ''}</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {MECE_VILLAGE_AREAS.map((a) => {
                    const on = filters.areas.includes(a.value);
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() =>
                          patch({
                            areas: on
                              ? filters.areas.filter((x) => x !== a.value)
                              : [...filters.areas, a.value],
                          })
                        }
                        style={{
                          padding: '7px 10px',
                          borderRadius: 10,
                          border: 'none',
                          background: on ? 'var(--accent-soft)' : 'transparent',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          textAlign: 'left',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: on ? 600 : 400 }}>{a.label}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink-2)' }}>{a.sub}</div>
                        </div>
                        <span>{on ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 7. DESIGN & GROUNDS FEATURES (WITH POOL OR-LOGIC) */}
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
              <div className="filter-popover filter-popover--wide">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Pool, Grounds & Architecture
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

                {/* Dedicated Pool Selector: Current Pool Only vs Pool or Room for Pool vs Room for Pool */}
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>
                    Pool Preference
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      {
                        mode: 'pool_only' as const,
                        label: 'Current Pool Only',
                        active: hasPoolFeat && !hasSpacePoolFeat,
                      },
                      {
                        mode: 'pool_or_room' as const,
                        label: 'Pool or Room for Pool',
                        active: hasPoolFeat && hasSpacePoolFeat,
                      },
                      {
                        mode: 'room_only' as const,
                        label: 'Room for Pool Only',
                        active: !hasPoolFeat && hasSpacePoolFeat,
                      },
                      {
                        mode: 'none' as const,
                        label: 'Any / No Filter',
                        active: !hasPoolFeat && !hasSpacePoolFeat,
                      },
                    ].map((opt) => (
                      <button
                        key={opt.mode}
                        type="button"
                        onClick={() => setPoolMode(opt.mode)}
                        style={{
                          padding: '6px 8px',
                          borderRadius: 8,
                          border: opt.active ? '1px solid var(--accent)' : '1px solid var(--line)',
                          background: opt.active ? 'var(--accent)' : '#ffffff',
                          color: opt.active ? '#ffffff' : 'var(--ink)',
                          fontSize: 11.5,
                          fontWeight: opt.active ? 600 : 400,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {(['Grounds & Water', 'Architecture & Spaces'] as const).map((grp) => (
                  <div key={grp} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: 'var(--ink-2)',
                        textTransform: 'uppercase',
                        margin: '6px 0 4px',
                      }}
                    >
                      {grp}
                    </div>
                    {DESIGN_FEATURE_OPTIONS.filter((f) => f.group === grp).map((f) => {
                      const on = filters.feats.includes(f.value);
                      return (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() =>
                            patch({
                              feats: on
                                ? filters.feats.filter((x) => x !== f.value)
                                : [...filters.feats, f.value],
                            })
                          }
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: 9,
                            border: 'none',
                            background: on ? 'var(--accent-soft)' : 'transparent',
                            fontWeight: on ? 600 : 400,
                            fontSize: 12.5,
                            display: 'flex',
                            justifyContent: 'space-between',
                            textAlign: 'left',
                          }}
                        >
                          <span>{f.label}</span>
                          <span>{on ? '✓' : ''}</span>
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
              onClick={() => onChange(INITIAL_UNIFIED_FILTERS)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'transparent',
                color: 'var(--ink-2)',
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
