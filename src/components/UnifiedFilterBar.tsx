import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { answerVillageQuestion, useVillageQa } from '../lib/villageQa';
import { VillageQaCard } from './VillageQaCard';

interface UnifiedFilterBarProps {
  filters: UnifiedFilters;
  onChange: (next: UnifiedFilters) => void;
  context: 'map' | 'listings';
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

type OpenMenu = 'status' | 'price' | 'size' | 'lot' | 'area' | 'streets' | 'feat' | null;

interface FilterPopoverProps {
  wide?: boolean;
  alignRight?: boolean;
  isMobile: boolean;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}

const FilterPopover: React.FC<FilterPopoverProps> = ({
  wide,
  alignRight,
  isMobile,
  popoverRef,
  onClose,
  children,
}) => {
  if (isMobile && typeof document !== 'undefined') {
    return createPortal(
      <>
        <div className="filter-mobile-backdrop" onClick={onClose} aria-hidden="true" />
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          className="filter-popover filter-popover--mobile-sheet"
        >
          {children}
          <div className="filter-popover__mobile-done">
            <button
              type="button"
              className="icon-btn icon-btn--primary"
              onClick={onClose}
              style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
            >
              Done
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  const cls = [
    'filter-popover',
    wide ? 'filter-popover--wide' : '',
    alignRight ? 'filter-popover--right' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={popoverRef} className={cls}>
      {children}
    </div>
  );
};

export const UnifiedFilterBar: React.FC<UnifiedFilterBarProps> = ({
  filters,
  onChange,
  context,
  searchInputRef,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 700 : false
  );
  const [minPriceDraft, setMinPriceDraft] = useState<string>(() =>
    filters.minPrice !== null ? String(filters.minPrice) : ''
  );
  const [maxPriceDraft, setMaxPriceDraft] = useState<string>(() =>
    filters.maxPrice !== null ? String(filters.maxPrice) : ''
  );
  const barRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const openOrToggleMenu = (menu: Exclude<OpenMenu, null>) => {
    if (menu === 'price' && openMenu !== 'price') {
      setMinPriceDraft(filters.minPrice !== null ? String(filters.minPrice) : '');
      setMaxPriceDraft(filters.maxPrice !== null ? String(filters.maxPrice) : '');
    }
    setOpenMenu((m) => (m === menu ? null : menu));
  };

  useEffect(() => {
    if (!openMenu) return;
    const onOutside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (barRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const patch = (p: Partial<UnifiedFilters>) => onChange({ ...filters, ...p });

  const qaCtx = useVillageQa();
  const [forcedQuery, setForcedQuery] = useState<string>('');
  const [immediateTrigger, setImmediateTrigger] = useState<number>(0);
  const [quickKeyOpen, setQuickKeyOpen] = useState<boolean>(false);
  const [quickKeyDraft, setQuickKeyDraft] = useState<string>('');

  const isForcedOpen = Boolean(filters.nlQuery.trim()) && forcedQuery === filters.nlQuery.trim();
  const parsedNl = useMemo(() => parseNaturalLanguageQuery(filters.nlQuery), [filters.nlQuery]);
  const qaAnswer = useMemo(
    () =>
      qaCtx && filters.nlQuery.trim()
        ? answerVillageQuestion(filters.nlQuery, qaCtx, filters, isForcedOpen)
        : null,
    [filters, isForcedOpen, qaCtx]
  );

  const triggerAskGeminiNow = () => {
    const q = filters.nlQuery.trim();
    if (!q) return;
    setForcedQuery(q);
    setImmediateTrigger((n) => n + 1);
  };

  const handleOneTapConnectKey = async () => {
    if (!qaCtx?.onSaveGeminiKey) return;
    try {
      if (navigator.clipboard?.readText) {
        const clip = (await navigator.clipboard.readText()).trim();
        if (/^(?:AQ\.|AIza)[A-Za-z0-9_.-]{16,}$/.test(clip)) {
          qaCtx.onSaveGeminiKey(clip);
          setQuickKeyOpen(false);
          return;
        }
      }
    } catch {
      // Clipboard read requires user paste gesture on iOS Safari — open inline paste input
    }
    setQuickKeyOpen((v) => !v);
  };

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
    height: 36,
    padding: '0 10px',
    borderRadius: 10,
    border: '1px solid var(--line-strong)',
    background: '#ffffff',
    color: '#202124',
    fontFamily: 'var(--font-mono)',
    fontSize: 12.5,
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
      {/* Minimalist Search with Gemini Bar */}
      <div
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          background: 'var(--surface)',
          border: filters.nlQuery.trim() ? '1.5px solid var(--accent)' : '1px solid var(--line)',
          boxShadow: filters.nlQuery.trim() ? '0 2px 10px rgba(26,115,232,0.08)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <Sparkles size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          type="search"
          value={filters.nlQuery}
          onChange={(e) => patch({ nlQuery: e.target.value, q: '' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filters.nlQuery.trim()) {
              e.preventDefault();
              triggerAskGeminiNow();
            }
          }}
          placeholder="Search homes or ask Gemini any complex question…"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            height: 26,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: isMobile ? 16 : 13.5,
            color: 'var(--ink)',
          }}
        />
        {parsedNl.active &&
          !parsedNl.isAdvisoryOnly &&
          (qaCtx?.geminiPlan && qaCtx.geminiPlan.query === filters.nlQuery.trim() && qaCtx.geminiPlan.aiChips.length > 0
            ? qaCtx.geminiPlan.aiChips.map((c) => (
                <span
                  key={`ai-${c}`}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#e8f0fe',
                    color: '#174ea6',
                    fontWeight: 600,
                  }}
                >
                  ✦ {c}
                </span>
              ))
            : parsedNl.chips.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {c}
                </span>
              )))}
        {qaCtx?.onSaveGeminiKey && !qaCtx.geminiApiKey && !qaAnswer && (
          <button
            type="button"
            onClick={() => void handleOneTapConnectKey()}
            style={{
              border: '1px solid rgba(26,115,232,0.32)',
              background: '#f3f7fe',
              color: '#174ea6',
              borderRadius: 999,
              height: 26,
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <span>Paste Gemini Key</span>
          </button>
        )}
        {filters.nlQuery.trim() && !qaAnswer && (
          <button
            type="button"
            onClick={triggerAskGeminiNow}
            style={{
              border: '1px solid rgba(26,115,232,0.35)',
              background: '#e8f0fe',
              color: '#174ea6',
              borderRadius: 999,
              height: 26,
              padding: '0 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <Sparkles size={12} />
            <span>Ask Gemini</span>
          </button>
        )}
        {filters.nlQuery && (
          <button
            type="button"
            onClick={() => {
              setForcedQuery('');
              patch({ nlQuery: '' });
            }}
            aria-label="Clear search"
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

      {quickKeyOpen && qaCtx?.onSaveGeminiKey && !qaCtx.geminiApiKey && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!quickKeyDraft.trim()) return;
            qaCtx.onSaveGeminiKey?.(quickKeyDraft.trim());
            setQuickKeyDraft('');
            setQuickKeyOpen(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '10px 12px',
            borderRadius: 14,
            background: '#f6f9fe',
            border: '1px solid rgba(26,115,232,0.3)',
          }}
        >
          <input
            type="password"
            value={quickKeyDraft}
            onChange={(e) => setQuickKeyDraft(e.target.value)}
            placeholder="Long-press → Paste your Gemini API key…"
            autoFocus
            autoComplete="off"
            style={{
              flex: '1 1 200px',
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid var(--line-strong)',
              background: '#ffffff',
              color: '#202124',
              fontSize: 16,
              fontFamily: 'var(--font-mono)',
            }}
          />
          <button
            type="submit"
            className="icon-btn icon-btn--primary"
            disabled={!quickKeyDraft.trim()}
            style={{ height: 36, fontWeight: 600 }}
          >
            <span>Save &amp; Enable Gemini</span>
          </button>
        </form>
      )}

      {!qaAnswer &&
        qaCtx?.geminiPlan &&
        qaCtx.geminiPlan.query === filters.nlQuery.trim() &&
        qaCtx.geminiPlan.aiNote && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12.5,
              color: '#174ea6',
              background: '#f3f7fe',
              border: '1px solid rgba(26,115,232,0.22)',
              borderRadius: 12,
              padding: '7px 12px',
            }}
          >
            <Sparkles size={13} style={{ flexShrink: 0 }} />
            <span>{qaCtx.geminiPlan.aiNote}</span>
          </div>
        )}

      {qaCtx && qaAnswer && (
        <VillageQaCard
          query={filters.nlQuery}
          immediateTrigger={immediateTrigger}
          answer={qaAnswer}
          qaCtx={qaCtx}
          onClear={() => {
            setForcedQuery('');
            patch({ nlQuery: '' });
          }}
        />
      )}

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
              <FilterPopover
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
              </FilterPopover>
            )}
          </div>

          {/* 2. PRICE (LOW / HIGH) */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={triggerStyle(priceActive)}
              onClick={() => openOrToggleMenu('price')}
            >
              <span>{priceSummary}</span>
              <ChevronDown size={13} />
            </button>
            {openMenu === 'price' && (
              <FilterPopover
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong style={{ fontSize: 11, color: 'var(--ink-2)', textTransform: 'uppercase' }}>
                    Price Range ($)
                  </strong>
                  {priceActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setMinPriceDraft('');
                        setMaxPriceDraft('');
                        patch({ minPrice: null, maxPrice: null });
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 11 }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                      Min ($)
                    </label>
                    <input
                      type="text"
                      inputMode="text"
                      style={inputStyle}
                      placeholder="e.g. 800k"
                      value={minPriceDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (/^\s*[<≤]/.test(raw)) {
                          const cleaned = raw.replace(/^\s*[<≤=]+\s*/, '');
                          setMinPriceDraft('');
                          setMaxPriceDraft(cleaned);
                          patch({ minPrice: null, maxPrice: parseFlexibleNumber(cleaned) });
                          return;
                        }
                        setMinPriceDraft(raw);
                        patch({ minPrice: parseFlexibleNumber(raw) });
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--ink-2)', display: 'block', marginBottom: 4 }}>
                      Max ($)
                    </label>
                    <input
                      type="text"
                      inputMode="text"
                      style={inputStyle}
                      placeholder="e.g. 3m"
                      value={maxPriceDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (/^\s*[>≥]/.test(raw)) {
                          const cleaned = raw.replace(/^\s*[>≥=]+\s*/, '');
                          setMaxPriceDraft('');
                          setMinPriceDraft(cleaned);
                          patch({ maxPrice: null, minPrice: parseFlexibleNumber(cleaned) });
                          return;
                        }
                        setMaxPriceDraft(raw);
                        patch({ maxPrice: parseFlexibleNumber(raw) });
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {[
                    ['<$1M', null, 1_000_000],
                    ['<$2M', null, 2_000_000],
                    ['<$3M', null, 3_000_000],
                    ['$1M–$2.5M', 1_000_000, 2_500_000],
                    ['$3M+', 3_000_000, null],
                  ].map(([lbl, lo, hi]) => (
                    <button
                      key={lbl as string}
                      type="button"
                      onClick={() => {
                        setMinPriceDraft(lo !== null ? fmtShortDollar(lo as number).replace('$', '') : '');
                        setMaxPriceDraft(hi !== null ? fmtShortDollar(hi as number).replace('$', '') : '');
                        patch({ minPrice: lo as number | null, maxPrice: hi as number | null });
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--line)',
                        background: '#ffffff',
                        color: '#202124',
                        fontSize: 11.5,
                      }}
                    >
                      {lbl as string}
                    </button>
                  ))}
                </div>
              </FilterPopover>
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
              <FilterPopover
                wide
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
                      inputMode="decimal"
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
                      inputMode="decimal"
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
              </FilterPopover>
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
              <FilterPopover
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
                      inputMode="decimal"
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
                      inputMode="decimal"
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
              </FilterPopover>
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
              <FilterPopover
                wide
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
                    maxHeight: 280,
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
              </FilterPopover>
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
              <FilterPopover
                wide
                alignRight
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
              </FilterPopover>
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
              <FilterPopover
                wide
                alignRight
                isMobile={isMobile}
                popoverRef={popoverRef}
                onClose={() => setOpenMenu(null)}
              >
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
              </FilterPopover>
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
