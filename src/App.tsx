import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Waves,
  X,
} from 'lucide-react';
import { median } from 'd3-array';
import type {
  BellportMicroArea,
  FilterState,
  Listing,
  MarketStatus,
  PersistedAppState,
  UserTrackStatus,
} from './types';
import { fetchSeedListings, loadInitialState, saveState } from './lib/storage';
import { filterAndSortListings } from './lib/search';
import { LoadingMark } from './components/AppMark';
import { TopBar } from './components/TopBar';
import { EditableText } from './components/EditableText';
import { PropertyIllustration } from './components/PropertyIllustration';
import { HighlightedText } from './components/HighlightedText';
import { PriceSpaceChart } from './components/PriceSpaceChart';
import { PropertyDrawer } from './components/PropertyDrawer';
import { AddListingModal } from './components/AddListingModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { CornerDock } from './components/CornerDock';
import { useCountUp } from './components/useCountUp';

const DEFAULT_FILTERS: FilterState = {
  tab: 'all',
  q: '',
  minPrice: null,
  maxPrice: null,
  minBeds: null,
  minBaths: null,
  minSqft: null,
  minAcres: null,
  area: 'all',
  villageOnly: false,
  zoneXOnly: false,
  marketStatus: 'all',
  sortBy: 'newest',
  layout: 'grid',
};

const QUICK_KEYWORDS = [
  'pool',
  '"Bellport Lane"',
  'guest cottage',
  'screened porch',
  'fireplace',
  'waterfront',
  'off-market',
  'renovated',
];

const NEXT_STATUS: Record<UserTrackStatus, UserTrackStatus> = {
  unreviewed: 'shortlist',
  shortlist: 'watching',
  watching: 'pass',
  pass: 'unreviewed',
};

const STATUS_LABEL: Record<UserTrackStatus, string> = {
  shortlist: 'Shortlist',
  watching: 'Watching',
  pass: 'Pass',
  unreviewed: 'Track',
};

function readFiltersFromUrl(): FilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const sp = new URLSearchParams(window.location.search);
  const numOrNull = (key: string): number | null => {
    const raw = sp.get(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const tab = sp.get('tab');
  const layout = sp.get('layout');
  const sortBy = sp.get('sort');
  const area = sp.get('area');
  const marketStatus = sp.get('status');

  return {
    tab: tab === 'shortlist' || tab === 'comps' ? tab : 'all',
    q: sp.get('q') ?? '',
    minPrice: numOrNull('minPrice'),
    maxPrice: numOrNull('maxPrice'),
    minBeds: numOrNull('beds'),
    minBaths: numOrNull('baths'),
    minSqft: numOrNull('sqft'),
    minAcres: numOrNull('acres'),
    area: (area as BellportMicroArea) || 'all',
    villageOnly: sp.get('village') === '1',
    zoneXOnly: sp.get('zoneX') === '1',
    marketStatus: (marketStatus as MarketStatus) || 'all',
    sortBy:
      sortBy === 'price-asc' ||
      sortBy === 'price-desc' ||
      sortBy === 'sqft-desc' ||
      sortBy === 'ppsf-asc' ||
      sortBy === 'acres-desc'
        ? sortBy
        : 'newest',
    layout: layout === 'table' ? 'table' : 'grid',
  };
}

function readHashListingId(): string | null {
  if (typeof window === 'undefined') return null;
  const h = window.location.hash;
  if (h.startsWith('#item/')) {
    return decodeURIComponent(h.slice('#item/'.length));
  }
  return null;
}

export const App: React.FC = () => {
  const [appState, setAppState] = useState<PersistedAppState | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromUrl());
  const [selectedId, setSelectedId] = useState<string | null>(() => readHashListingId());
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Bootstrap state from IndexedDB / seed JSON
  useEffect(() => {
    let active = true;
    loadInitialState()
      .then((loaded) => {
        if (active) setAppState(loaded);
      })
      .catch((err) => {
        console.error('Failed to bootstrap Bellport Watch:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  // Sync theme and privacy blur attributes onto <html>
  useEffect(() => {
    if (!appState) return;
    document.documentElement.setAttribute('data-theme', appState.preferences.theme);
    document.documentElement.setAttribute(
      'data-privacy',
      appState.preferences.privacyBlur ? 'blur' : 'normal'
    );
  }, [appState]);

  // Debounced auto-save to IndexedDB + localStorage
  useEffect(() => {
    if (!appState) return;
    const timer = window.setTimeout(() => {
      void saveState(appState);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [appState]);

  // Sync filters to URL search params
  useEffect(() => {
    const sp = new URLSearchParams();
    if (filters.tab !== 'all') sp.set('tab', filters.tab);
    if (filters.q) sp.set('q', filters.q);
    if (filters.minPrice !== null) sp.set('minPrice', String(filters.minPrice));
    if (filters.maxPrice !== null) sp.set('maxPrice', String(filters.maxPrice));
    if (filters.minBeds !== null) sp.set('beds', String(filters.minBeds));
    if (filters.minBaths !== null) sp.set('baths', String(filters.minBaths));
    if (filters.minSqft !== null) sp.set('sqft', String(filters.minSqft));
    if (filters.minAcres !== null) sp.set('acres', String(filters.minAcres));
    if (filters.area !== 'all') sp.set('area', filters.area);
    if (filters.villageOnly) sp.set('village', '1');
    if (filters.zoneXOnly) sp.set('zoneX', '1');
    if (filters.marketStatus !== 'all') sp.set('status', filters.marketStatus);
    if (filters.sortBy !== 'newest') sp.set('sort', filters.sortBy);
    if (filters.layout !== 'grid') sp.set('layout', filters.layout);

    const qs = sp.toString();
    const hash = window.location.hash;
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [filters]);

  // Listen to browser Back/Forward for #item/<id> and query params
  useEffect(() => {
    const onNav = () => {
      setSelectedId(readHashListingId());
      setFilters(readFiltersFromUrl());
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  // Global keyboard shortcut: '/' or Cmd/Ctrl+K focuses keyword search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (!inEditable && !selectedId && !addOpen && !settingsOpen && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, addOpen, settingsOpen]);

  const openListingDrawer = (id: string | null) => {
    setSelectedId(id);
    const qs = window.location.search;
    if (id) {
      window.history.pushState(null, '', `${window.location.pathname}${qs}#item/${encodeURIComponent(id)}`);
    } else {
      window.history.pushState(null, '', `${window.location.pathname}${qs}`);
    }
  };

  const allListings = appState?.listings ?? [];

  const tabCounts = useMemo(
    () => ({
      all: allListings.length,
      shortlist: allListings.filter(
        (l) => l.userStatus === 'shortlist' || l.userStatus === 'watching'
      ).length,
      comps: allListings.filter(
        (l) => l.marketStatus === 'sold' || l.marketStatus === 'contingent'
      ).length,
    }),
    [allListings]
  );

  const visibleListings = useMemo(
    () => filterAndSortListings(allListings, filters),
    [allListings, filters]
  );

  // Summary metrics
  const medianPrice = useMemo(
    () => Math.round(median(visibleListings, (d) => d.price) ?? 0),
    [visibleListings]
  );
  const medianPpsf = useMemo(
    () =>
      Math.round(
        median(
          visibleListings.filter((d) => d.sqft > 0),
          (d) => d.price / d.sqft
        ) ?? 0
      ),
    [visibleListings]
  );
  const villageCount = useMemo(
    () => visibleListings.filter((d) => d.inVillage).length,
    [visibleListings]
  );

  const animMatches = useCountUp(visibleListings.length);
  const animPpsf = useCountUp(medianPpsf);
  const animVillage = useCountUp(villageCount);

  if (!appState) {
    return (
      <main className="container" style={{ display: 'flex', justifyContent: 'center' }}>
        <LoadingMark />
      </main>
    );
  }

  const hasSampleData = appState.listings.some((l) => l.isSample);
  const sampleCount = appState.listings.filter((l) => l.isSample).length;

  const hasActiveFilters =
    filters.q !== '' ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.minBeds !== null ||
    filters.minBaths !== null ||
    filters.minSqft !== null ||
    filters.minAcres !== null ||
    filters.area !== 'all' ||
    filters.villageOnly ||
    filters.zoneXOnly ||
    filters.marketStatus !== 'all';

  const selectedIndex = selectedId
    ? visibleListings.findIndex((l) => l.id === selectedId)
    : -1;
  const selectedListing =
    (selectedIndex >= 0 ? visibleListings[selectedIndex] : null) ??
    allListings.find((l) => l.id === selectedId) ??
    null;

  const updateListing = (id: string, patch: Partial<Listing>) => {
    setAppState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        listings: prev.listings.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        ),
      };
    });
  };

  const deleteListing = (id: string) => {
    openListingDrawer(null);
    setAppState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        listings: prev.listings.filter((item) => item.id !== id),
      };
    });
  };

  const addListings = (incoming: Listing[]) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const existingByAddr = new Set(
        prev.listings.map((l) => l.address.toLowerCase().trim())
      );
      const deduped = incoming.filter(
        (item) => !existingByAddr.has(item.address.toLowerCase().trim())
      );
      return {
        ...prev,
        listings: [...deduped, ...prev.listings],
      };
    });
  };

  const handleSaveCopyOverride = (id: string, value: string | null) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const nextOverrides = { ...prev.copyOverrides };
      if (value === null) {
        delete nextOverrides[id];
      } else {
        nextOverrides[id] = value;
      }
      return { ...prev, copyOverrides: nextOverrides };
    });
  };

  const toggleKeywordChip = (kw: string) => {
    setFilters((prev) => {
      const current = prev.q.trim();
      if (current.toLowerCase() === kw.toLowerCase()) {
        return { ...prev, q: '' };
      }
      return { ...prev, q: kw };
    });
  };

  const pricePresetValue = `${filters.minPrice ?? ''}-${filters.maxPrice ?? ''}`;

  return (
    <>
      <TopBar
        activeTab={filters.tab}
        counts={tabCounts}
        editMode={appState.preferences.editMode}
        onSelectTab={(tab) => setFilters((f) => ({ ...f, tab }))}
        onOpenAdd={() => setAddOpen(true)}
        onToggleEditMode={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: { ...prev.preferences, editMode: !prev.preferences.editMode },
                }
              : prev
          )
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main>
        {/* Editorial Header Band */}
        <section className="hero-band">
          <div className="container hero-band__grid">
            <div>
              <span className="eyebrow">Second-Home Search · 11713</span>
              <h1 className="hero-band__title">
                <EditableText
                  id="hero-title"
                  fallback="Tracking second-home candidates in Bellport Village."
                  overrides={appState.copyOverrides}
                  editMode={appState.preferences.editMode}
                  onSave={handleSaveCopyOverride}
                />
              </h1>
              <p className="hero-band__lede">
                <EditableText
                  id="hero-lede"
                  fallback="Filter listings by price, bedrooms, interior space, and lot size—or search remarks for pools, guest cottages, Flood Zone X, and historic lanes south of Main Street."
                  overrides={appState.copyOverrides}
                  editMode={appState.preferences.editMode}
                  onSave={handleSaveCopyOverride}
                />
              </p>
            </div>

            <div className="hero-band__kpis" aria-label="Filtered market summary">
              <div className="kpi-item">
                <div className="kpi-item__val">{animMatches}</div>
                <div className="kpi-item__label">Matching listings</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-item__val priv-val">
                  {medianPrice > 0 ? `$${(medianPrice / 1_000_000).toFixed(2)}M` : '—'}
                </div>
                <div className="kpi-item__label">Median asking price</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-item__val priv-val">
                  {animPpsf > 0 ? `$${animPpsf}` : '—'}
                </div>
                <div className="kpi-item__label">Median price / sq ft</div>
              </div>
              <div className="kpi-item">
                <div className="kpi-item__val">{animVillage}</div>
                <div className="kpi-item__label">In Incorporated Village</div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter & Keyword Search Band */}
        <section className="filter-band" aria-label="Search and category filters">
          <div className="container">
            <div className="search-row">
              <div className="search-box">
                <Search size={18} className="search-box__icon" />
                <input
                  id="keyword-search-input"
                  ref={searchInputRef}
                  type="search"
                  className="search-box__input"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder='Keyword search: e.g. pool, "Bellport Lane", guest cottage, fireplace, ferry...'
                  aria-label="Search listings by keyword"
                />
                {filters.q ? (
                  <button
                    type="button"
                    className="search-box__clear"
                    onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                    aria-label="Clear search query"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span className="search-box__kbd" aria-hidden="true">
                    /
                  </span>
                )}
              </div>
            </div>

            {/* Quick Bellport Keyword Chips */}
            <div className="keyword-chips" role="group" aria-label="Popular keyword searches">
              <span className="keyword-chips__label">Quick keywords:</span>
              {QUICK_KEYWORDS.map((kw) => {
                const active = filters.q.trim().toLowerCase() === kw.toLowerCase();
                return (
                  <button
                    key={kw}
                    type="button"
                    className={`kw-chip ${active ? 'is-active' : ''}`}
                    onClick={() => toggleKeywordChip(kw)}
                  >
                    {kw}
                  </button>
                );
              })}
            </div>

            {/* Major Category Filters */}
            <div className="filter-controls">
              <div className="filter-field">
                <label htmlFor="filter-price" className="filter-field__label">
                  Price Bracket
                </label>
                <select
                  id="filter-price"
                  className="filter-field__select"
                  value={pricePresetValue}
                  onChange={(e) => {
                    const [minStr, maxStr] = e.target.value.split('-');
                    setFilters((f) => ({
                      ...f,
                      minPrice: minStr ? Number(minStr) : null,
                      maxPrice: maxStr ? Number(maxStr) : null,
                    }));
                  }}
                >
                  <option value="-">Any Price</option>
                  <option value="-1250000">Under $1.25M</option>
                  <option value="-1750000">Under $1.75M</option>
                  <option value="-2250000">Under $2.25M</option>
                  <option value="-2750000">Under $2.75M</option>
                  <option value="1500000-2500000">$1.5M – $2.5M</option>
                  <option value="2500000-">$2.5M+</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-beds" className="filter-field__label">
                  Bedrooms
                </label>
                <select
                  id="filter-beds"
                  className="filter-field__select"
                  value={filters.minBeds ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minBeds: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any Beds</option>
                  <option value="2">2+ Beds</option>
                  <option value="3">3+ Beds</option>
                  <option value="4">4+ Beds</option>
                  <option value="5">5+ Beds</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-baths" className="filter-field__label">
                  Bathrooms
                </label>
                <select
                  id="filter-baths"
                  className="filter-field__select"
                  value={filters.minBaths ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minBaths: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any Baths</option>
                  <option value="2">2+ Baths</option>
                  <option value="3">3+ Baths</option>
                  <option value="4">4+ Baths</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-sqft" className="filter-field__label">
                  Interior Space
                </label>
                <select
                  id="filter-sqft"
                  className="filter-field__select"
                  value={filters.minSqft ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minSqft: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any Sq Ft</option>
                  <option value="1500">1,500+ sq ft</option>
                  <option value="2200">2,200+ sq ft</option>
                  <option value="2800">2,800+ sq ft</option>
                  <option value="3400">3,400+ sq ft</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-acres" className="filter-field__label">
                  Lot Space
                </label>
                <select
                  id="filter-acres"
                  className="filter-field__select"
                  value={filters.minAcres ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minAcres: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                >
                  <option value="">Any Lot Size</option>
                  <option value="0.25">0.25+ acres</option>
                  <option value="0.45">0.45+ acres (Pool-friendly)</option>
                  <option value="0.7">0.70+ acres</option>
                  <option value="1">1.00+ acres</option>
                </select>
              </div>

              <div className="filter-field">
                <label htmlFor="filter-area" className="filter-field__label">
                  Micro-Area / Lane
                </label>
                <select
                  id="filter-area"
                  className="filter-field__select"
                  value={filters.area}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      area: (e.target.value as BellportMicroArea) || 'all',
                    }))
                  }
                >
                  <option value="all">All Bellport Areas</option>
                  <option value="Historic Lanes">Historic Lanes (South of Main)</option>
                  <option value="Country Club & Golf">Country Club & Golf</option>
                  <option value="Village Center">Village Center</option>
                  <option value="East Lanes & Circuit">East Lanes & Circuit</option>
                  <option value="Outside Village (11713)">Outside Village (11713)</option>
                </select>
              </div>
            </div>

            {/* Bellport-Specific Guardrail Toggles */}
            <div className="filter-toggles">
              <div className="filter-toggles__left">
                <button
                  id="toggle-village-only"
                  type="button"
                  className={`pill-toggle ${filters.villageOnly ? 'is-active' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, villageOnly: !f.villageOnly }))}
                  aria-pressed={filters.villageOnly}
                >
                  {filters.villageOnly ? <Check size={14} /> : <Waves size={14} />}
                  <span>Inc. Village Only (Ho-Hum Ferry)</span>
                </button>

                <button
                  id="toggle-zonex-only"
                  type="button"
                  className={`pill-toggle ${filters.zoneXOnly ? 'is-active' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, zoneXOnly: !f.zoneXOnly }))}
                  aria-pressed={filters.zoneXOnly}
                >
                  {filters.zoneXOnly ? <Check size={14} /> : <ShieldCheck size={14} />}
                  <span>Flood Zone X Only</span>
                </button>

                <select
                  id="filter-market-status"
                  className="filter-field__select"
                  style={{ height: 36, fontSize: 13 }}
                  value={filters.marketStatus}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      marketStatus: (e.target.value as MarketStatus) || 'all',
                    }))
                  }
                  aria-label="Filter by market status"
                >
                  <option value="all">All Market Statuses</option>
                  <option value="active">Active On-Market</option>
                  <option value="off-market">Off-Market / Whisper</option>
                  <option value="contingent">Contingent / In Contract</option>
                  <option value="sold">Sold Comps</option>
                </select>
              </div>

              <div className="filter-toggles__right">
                {hasActiveFilters && (
                  <button
                    id="btn-reset-filters"
                    type="button"
                    className="icon-btn"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...DEFAULT_FILTERS,
                        tab: prev.tab,
                        layout: prev.layout,
                      }))
                    }
                  >
                    <RotateCcw size={14} />
                    <span>Reset filters</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Listings Results Band */}
        <section className="results-band" aria-label="Matching Bellport properties">
          <div className="container">
            <div className="results-toolbar">
              <p className="results-toolbar__summary">
                Showing <strong>{visibleListings.length}</strong> of {allListings.length} tracked
                properties
                {filters.q ? (
                  <>
                    {' '}
                    matching <strong>&ldquo;{filters.q}&rdquo;</strong>
                  </>
                ) : null}
              </p>

              <div className="results-toolbar__controls">
                <select
                  id="select-sort-by"
                  className="filter-field__select"
                  style={{ height: 38, fontSize: 13 }}
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      sortBy: e.target.value as FilterState['sortBy'],
                    }))
                  }
                  aria-label="Sort listings"
                >
                  <option value="newest">Sort: Newest Listed</option>
                  <option value="price-asc">Price: Low → High</option>
                  <option value="price-desc">Price: High → Low</option>
                  <option value="sqft-desc">Space: Largest Sq Ft</option>
                  <option value="ppsf-asc">Value: Lowest $/Sq Ft</option>
                  <option value="acres-desc">Lot: Largest Acreage</option>
                </select>

                <div className="segmented-tabs" role="group" aria-label="Layout toggle">
                  <button
                    type="button"
                    className={`segmented-tabs__tab ${filters.layout === 'grid' ? 'is-active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, layout: 'grid' }))}
                    aria-label="Card grid view"
                    title="Editorial cards"
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    className={`segmented-tabs__tab ${filters.layout === 'table' ? 'is-active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, layout: 'table' }))}
                    aria-label="Comparison table view"
                    title="Compact comparison table"
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>

            {visibleListings.length === 0 ? (
              <div className="empty-state">
                <h2 style={{ fontSize: 22, marginBottom: 6 }}>
                  No Bellport listings match those exact filters.
                </h2>
                <p style={{ color: 'var(--ink-2)', marginBottom: 16 }}>
                  Try broadening the price ceiling, clearing a keyword chip, or adding a new
                  property via Smart Paste.
                </p>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...DEFAULT_FILTERS,
                      tab: prev.tab,
                      layout: prev.layout,
                    }))
                  }
                >
                  <RotateCcw size={14} />
                  <span>Clear all filters</span>
                </button>
              </div>
            ) : filters.layout === 'grid' ? (
              <div className="listing-grid">
                {visibleListings.map((item) => {
                  const ppsf = item.sqft > 0 ? Math.round(item.price / item.sqft) : 0;
                  const priceDrop =
                    item.originalPrice && item.originalPrice > item.price
                      ? item.originalPrice - item.price
                      : 0;

                  return (
                    <article key={item.id} className="listing-card">
                      <div
                        className="listing-card__media"
                        onClick={() => openListingDrawer(item.id)}
                      >
                        <PropertyIllustration
                          archetype={item.archetype}
                          address={item.address}
                          styleName={item.style}
                          photoUrl={item.photoUrl}
                        />
                        <div className="listing-card__badges">
                          <span
                            className={`badge ${
                              item.marketStatus === 'off-market'
                                ? 'badge--whisper'
                                : item.inVillage
                                  ? 'badge--village'
                                  : 'badge--outside'
                            }`}
                          >
                            {item.marketStatus === 'off-market'
                              ? 'Off-Market Whisper'
                              : item.marketStatus === 'sold'
                                ? 'Sold Comp'
                                : item.marketStatus === 'contingent'
                                  ? 'In Contract'
                                  : item.inVillage
                                    ? 'Inc. Village ✓'
                                    : 'Outside Village'}
                          </span>

                          <button
                            type="button"
                            className="status-dot-btn"
                            title="Click to cycle shortlist status"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateListing(item.id, {
                                userStatus: NEXT_STATUS[item.userStatus],
                              });
                            }}
                          >
                            <span className={`status-dot status-dot--${item.userStatus}`} />
                            <span>{STATUS_LABEL[item.userStatus]}</span>
                          </button>
                        </div>
                      </div>

                      <div className="listing-card__body">
                        <div>
                          <div className="listing-card__top">
                            <div>
                              <span className="listing-card__price priv-val">
                                ${item.price.toLocaleString()}
                              </span>
                              {priceDrop > 0 && (
                                <span className="listing-card__price-cut priv-val">
                                  ↓ ${Math.round(priceDrop / 1000)}k
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                              Zone {item.floodZone}
                            </span>
                          </div>

                          <h3
                            className="listing-card__address"
                            onClick={() => openListingDrawer(item.id)}
                          >
                            <HighlightedText text={item.address} query={filters.q} />
                          </h3>
                          <div className="listing-card__sub">
                            <span>{item.area}</span>
                            <span>·</span>
                            <span>{item.style}</span>
                          </div>
                        </div>

                        <div className="listing-card__specs">
                          <div>
                            <strong>
                              {item.beds} / {item.baths}
                            </strong>
                            <span>Beds/Baths</span>
                          </div>
                          <div>
                            <strong>{item.sqft.toLocaleString()}</strong>
                            <span>Sq Ft</span>
                          </div>
                          <div>
                            <strong className="priv-val">${ppsf}</strong>
                            <span>$/Sq Ft</span>
                          </div>
                          <div>
                            <strong>{item.lotAcres}</strong>
                            <span>Acres</span>
                          </div>
                        </div>

                        <p className="listing-card__headline">
                          <HighlightedText text={item.headline} query={filters.q} />
                        </p>

                        <div className="listing-card__tags">
                          {item.features.slice(0, 4).map((tag) => (
                            <span key={tag} className="tag-pill">
                              <HighlightedText text={tag} query={filters.q} />
                            </span>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="listings-table">
                  <thead>
                    <tr>
                      <th>Track</th>
                      <th>Address & Lane</th>
                      <th>Village</th>
                      <th>Price</th>
                      <th>Beds / Baths</th>
                      <th>Sq Ft</th>
                      <th>$/Sq Ft</th>
                      <th>Acres</th>
                      <th>Taxes</th>
                      <th>Flood</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleListings.map((item) => (
                      <tr key={item.id} onClick={() => openListingDrawer(item.id)}>
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            updateListing(item.id, {
                              userStatus: NEXT_STATUS[item.userStatus],
                            });
                          }}
                        >
                          <button type="button" className="status-dot-btn">
                            <span className={`status-dot status-dot--${item.userStatus}`} />
                            <span>{STATUS_LABEL[item.userStatus]}</span>
                          </button>
                        </td>
                        <td>
                          <strong style={{ display: 'block' }}>
                            <HighlightedText text={item.address} query={filters.q} />
                          </strong>
                          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                            {item.area} · {item.marketStatus}
                          </span>
                        </td>
                        <td>{item.inVillage ? 'Inc. ✓' : 'Outside'}</td>
                        <td className="num priv-val">${item.price.toLocaleString()}</td>
                        <td className="num">
                          {item.beds} / {item.baths}
                        </td>
                        <td className="num">{item.sqft.toLocaleString()}</td>
                        <td className="num priv-val">
                          ${item.sqft > 0 ? Math.round(item.price / item.sqft) : 0}
                        </td>
                        <td className="num">{item.lotAcres}</td>
                        <td className="num priv-val">${item.annualTaxes.toLocaleString()}</td>
                        <td className="num">{item.floodZone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* D3 Price vs. Space Valuation Scatterplot */}
        <PriceSpaceChart
          listings={visibleListings}
          privacyBlur={appState.preferences.privacyBlur}
          onSelectListing={(id) => openListingDrawer(id)}
        />
      </main>

      {/* Subtle Bottom-Left Sample Data Pill (auto-hides once sample items are cleared) */}
      {hasSampleData && (
        <div className="sample-pill" role="status">
          <Sparkles size={13} color="var(--accent)" />
          <span>Sample data ({sampleCount})</span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--accent)',
              fontWeight: 500,
              padding: 0,
              fontSize: 12,
            }}
          >
            Manage
          </button>
        </div>
      )}

      {/* Quiet Bottom-Right Floating Corner Dock */}
      <CornerDock
        theme={appState.preferences.theme}
        privacyBlur={appState.preferences.privacyBlur}
        scratchpad={appState.scratchpad}
        onFocusSearch={() => {
          searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          searchInputRef.current?.focus();
        }}
        onTogglePrivacy={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    privacyBlur: !prev.preferences.privacyBlur,
                  },
                }
              : prev
          )
        }
        onToggleTheme={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    theme: prev.preferences.theme === 'dark' ? 'light' : 'dark',
                  },
                }
              : prev
          )
        }
        onChangeScratchpad={(val) =>
          setAppState((prev) => (prev ? { ...prev, scratchpad: val } : prev))
        }
      />

      {/* Deep-Linkable Slide-Over Detail Sheet */}
      <PropertyDrawer
        listing={selectedListing}
        searchQuery={filters.q}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < visibleListings.length - 1}
        onPrev={() => {
          if (selectedIndex > 0) {
            openListingDrawer(visibleListings[selectedIndex - 1].id);
          }
        }}
        onNext={() => {
          if (selectedIndex >= 0 && selectedIndex < visibleListings.length - 1) {
            openListingDrawer(visibleListings[selectedIndex + 1].id);
          }
        }}
        onClose={() => openListingDrawer(null)}
        onUpdateListing={updateListing}
        onDeleteListing={deleteListing}
      />

      {/* Add / Smart Paste / CSV Import Modal */}
      <AddListingModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAddListings={addListings}
      />

      {/* Settings & Data Ownership Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        state={appState}
        hasSampleData={hasSampleData}
        onClose={() => setSettingsOpen(false)}
        onImportState={(next) => setAppState(next)}
        onClearSampleData={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  listings: prev.listings.filter((l) => !l.isSample),
                }
              : prev
          )
        }
        onRestoreSeedData={() => {
          void fetchSeedListings().then((seed) => {
            setAppState((prev) => (prev ? { ...prev, listings: seed } : prev));
          });
        }}
        onToggleTheme={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    theme: prev.preferences.theme === 'dark' ? 'light' : 'dark',
                  },
                }
              : prev
          )
        }
        onTogglePrivacy={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    privacyBlur: !prev.preferences.privacyBlur,
                  },
                }
              : prev
          )
        }
      />
    </>
  );
};

export default App;
