import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { median } from 'd3-array';
import type {
  BellportMicroArea,
  FilterState,
  Listing,
  MarketStatus,
  PersistedAppState,
  PrimaryView,
  StreetAlertRule,
  SyncMetadata,
} from './types';
import { fetchSeedListings, loadBootstrap, saveState } from './lib/storage';
import { filterAndSortListings } from './lib/search';
import { parseListingSnippet } from './lib/parser';
import {
  evaluateGoodDeal,
  evaluateStreetAlerts,
  getPriceChangeStats,
} from './lib/intelligence';
import { LoadingMark } from './components/AppMark';
import { TopBar } from './components/TopBar';
import { EditableText } from './components/EditableText';
import { PropertyIllustration } from './components/PropertyIllustration';
import { HighlightedText } from './components/HighlightedText';
import { PriceSpaceChart } from './components/PriceSpaceChart';
import { PropertyDrawer } from './components/PropertyDrawer';
import { AddListingModal } from './components/AddListingModal';
import { SyncModal } from './components/SyncModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { FavoritesAndTasteView } from './components/FavoritesAndTasteView';
import { StreetAlertsView } from './components/StreetAlertsView';
import { PriceDropsHistoryView } from './components/PriceDropsHistoryView';
import { VillageParcelMapView } from './components/VillageParcelMapView';
import { CornerDock } from './components/CornerDock';
import { MeceFilterDropdown, type MeceBucketOption } from './components/MeceFilterDropdown';
import { useCountUp } from './components/useCountUp';

const DEFAULT_FILTERS: FilterState = {
  view: 'map',
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
  minDealScore: null,
  airbnbEligibleOnly: false,
  marketStatus: 'active',
  sortBy: 'newest',
  layout: 'grid',
};

const LISTING_STATUS_OPTS: MeceBucketOption[] = [
  { value: 'active', label: 'For Sale', swatch: '#ea4335' },
  { value: 'sold', label: 'Sold Comps', swatch: '#34a853' },
];

const LISTING_PRICE_OPTS: MeceBucketOption[] = [
  { value: 'p1', label: 'Under $1M' },
  { value: 'p2', label: '$1M – $2M' },
  { value: 'p3', label: '$2M – $3M' },
  { value: 'p4', label: '$3M+' },
];

const LISTING_SIZE_OPTS: MeceBucketOption[] = [
  { value: 's1', label: '< 1,800 ft² (1–2 BR)' },
  { value: 's2', label: '1,800 – 2,349 ft² (3 BR)' },
  { value: 's3', label: '2,350 – 3,499 ft² (4 BR)' },
  { value: 's4', label: '3,500+ ft² (5+ BR)' },
];

const LISTING_LOT_OPTS: MeceBucketOption[] = [
  { value: 'l1', label: '< 0.35 ac' },
  { value: 'l2', label: '0.35 – 0.49 ac' },
  { value: 'l3', label: '0.50 – 0.99 ac' },
  { value: 'l4', label: '1.00+ ac' },
];

const LISTING_AREA_OPTS: MeceBucketOption[] = [
  { value: 'Historic Lanes', label: 'Historic Lanes' },
  { value: 'Country Club & Golf', label: 'Country Club & Golf' },
  { value: 'Village Center', label: 'Village Center' },
  { value: 'East Lanes & Circuit', label: 'East Lanes & Circuit' },
];

const LISTING_VALUATION_OPTS: MeceBucketOption[] = [
  { value: 'underpriced', label: 'Underpriced', swatch: '#34a853' },
  { value: 'overpriced', label: 'Overpriced', swatch: '#ea4335' },
];

function readInitialClipDraft(): Partial<Listing> | null {
  if (typeof window === 'undefined') return null;
  const sp = new URLSearchParams(window.location.search);
  const rawClip = sp.get('clip');
  if (!rawClip) return null;
  try {
    const parsed = JSON.parse(rawClip) as {
      u?: string;
      t?: string;
      b?: string;
      p?: string[];
    };
    const snippetDraft = parseListingSnippet(`${parsed.t ?? ''}\n${parsed.b ?? ''}`);
    return {
      ...snippetDraft,
      sourceUrl: parsed.u ?? snippetDraft.sourceUrl,
      photos: parsed.p ?? [],
      photoUrl: parsed.p?.[0],
    };
  } catch {
    return null;
  }
}

function readFiltersFromUrl(): FilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  const sp = new URLSearchParams(window.location.search);
  const numOrNull = (key: string): number | null => {
    const raw = sp.get(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const view = sp.get('view');
  const tab = sp.get('tab');
  const layout = sp.get('layout');
  const sortBy = sp.get('sort');
  const area = sp.get('area');
  const marketStatus = sp.get('status');

  const validView: PrimaryView =
    view === 'listings' || view === 'favorites' || view === 'alerts' || view === 'history'
      ? view
      : 'map';

  const validSorts: Array<FilterState['sortBy']> = [
    'newest',
    'deal-desc',
    'rental-desc',
    'price-cut',
    'price-asc',
    'price-desc',
    'sqft-desc',
    'ppsf-asc',
    'acres-desc',
  ];

  return {
    view: validView,
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
    minDealScore: numOrNull('deal'),
    airbnbEligibleOnly: sp.get('airbnb') === '1',
    marketStatus: (marketStatus as MarketStatus) || 'all',
    sortBy: validSorts.includes(sortBy as FilterState['sortBy'])
      ? (sortBy as FilterState['sortBy'])
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
  const [syncMeta, setSyncMeta] = useState<SyncMetadata>({
    apiConfigured: false,
    cachedDetailsCount: 0,
  });
  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromUrl());
  const [selectedId, setSelectedId] = useState<string | null>(() => readHashListingId());
  const [clipDraft, setClipDraft] = useState<Partial<Listing> | null>(() =>
    readInitialClipDraft()
  );
  const [addOpen, setAddOpen] = useState<boolean>(() => Boolean(readInitialClipDraft()));
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lStatusSet, setLStatusSet] = useState<Set<string>>(() => new Set(['active']));
  const [lPriceSet, setLPriceSet] = useState<Set<string>>(() => new Set());
  const [lSizeSet, setLSizeSet] = useState<Set<string>>(() => new Set());
  const [lLotSet, setLLotSet] = useState<Set<string>>(() => new Set());
  const [lAreaSet, setLAreaSet] = useState<Set<string>>(() => new Set());
  const [lValSet, setLValSet] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Bootstrap from /api/bootstrap (with IndexedDB fallback)
  useEffect(() => {
    let active = true;
    loadBootstrap()
      .then((payload) => {
        if (active) {
          setAppState(payload.state);
          setSyncMeta(payload.syncMeta);
        }
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

  // Debounced auto-save to server + IndexedDB
  useEffect(() => {
    if (!appState) return;
    const timer = window.setTimeout(() => {
      void saveState(appState);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [appState]);

  // Sync filters to URL search params
  useEffect(() => {
    const sp = new URLSearchParams();
    if (filters.view !== 'listings') sp.set('view', filters.view);
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
    if (filters.minDealScore !== null) sp.set('deal', String(filters.minDealScore));
    if (filters.airbnbEligibleOnly) sp.set('airbnb', '1');
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
        setFilters((f) => ({ ...f, view: 'listings' }));
        window.setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 20);
        return;
      }

      if (!inEditable && !selectedId && !addOpen && !syncOpen && !settingsOpen && e.key === '/') {
        e.preventDefault();
        setFilters((f) => ({ ...f, view: 'listings' }));
        window.setTimeout(() => searchInputRef.current?.focus(), 20);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, addOpen, syncOpen, settingsOpen]);

  const openListingDrawer = (id: string | null) => {
    setSelectedId(id);
    const qs = window.location.search;
    if (id) {
      window.history.pushState(
        null,
        '',
        `${window.location.pathname}${qs}#item/${encodeURIComponent(id)}`
      );
    } else {
      window.history.pushState(null, '', `${window.location.pathname}${qs}`);
    }
  };

  const allListings = useMemo(
    () =>
      (appState?.listings ?? []).filter(
        (l) => l.inVillage && l.area !== 'Outside Village (11713)'
      ),
    [appState]
  );
  const streetAlerts = useMemo(() => appState?.streetAlerts ?? [], [appState]);

  const visibleListings = useMemo(() => {
    const base = filterAndSortListings(allListings, { ...filters, marketStatus: 'all' });
    return base.filter((item) => {
      if (lStatusSet.size > 0 && !lStatusSet.has(item.marketStatus)) return false;
      if (lPriceSet.size > 0) {
        const pb =
          item.price < 1_000_000
            ? 'p1'
            : item.price < 2_000_000
              ? 'p2'
              : item.price < 3_000_000
                ? 'p3'
                : 'p4';
        if (!lPriceSet.has(pb)) return false;
      }
      if (lSizeSet.size > 0) {
        const sf = item.sqft || item.beds * 620;
        const sb = sf < 1800 ? 's1' : sf < 2350 ? 's2' : sf < 3500 ? 's3' : 's4';
        if (!lSizeSet.has(sb)) return false;
      }
      if (lLotSet.size > 0) {
        const lb =
          item.lotAcres < 0.35
            ? 'l1'
            : item.lotAcres < 0.5
              ? 'l2'
              : item.lotAcres < 1.0
                ? 'l3'
                : 'l4';
        if (!lLotSet.has(lb)) return false;
      }
      if (lAreaSet.size > 0 && !lAreaSet.has(item.area)) return false;
      if (lValSet.size > 0) {
        const deal = evaluateGoodDeal(item, allListings);
        if (!lValSet.has(deal.status)) return false;
      }
      return true;
    });
  }, [allListings, filters, lStatusSet, lPriceSet, lSizeSet, lLotSet, lAreaSet, lValSet]);

  const navCounts = useMemo(() => {
    const alertTriggered = evaluateStreetAlerts(streetAlerts, allListings);
    const uniqueAlertHitIds = new Set(
      alertTriggered.flatMap((t) => t.matches.map((m) => m.listing.id))
    );
    const priceDrops = allListings.filter(
      (l) => getPriceChangeStats(l).totalDropDollar > 0
    ).length;

    return {
      listings: allListings.filter((l) => l.marketStatus === 'active').length,
      parcels: 1213,
      favorites: allListings.filter((l) => l.isFavorite).length,
      alertHits: uniqueAlertHitIds.size,
      priceDrops,
    };
  }, [allListings, streetAlerts]);

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

  const animMatches = useCountUp(visibleListings.length);
  const animPpsf = useCountUp(medianPpsf);

  if (!appState) {
    return (
      <main className="container" style={{ display: 'flex', justifyContent: 'center' }}>
        <LoadingMark />
      </main>
    );
  }

  const hasSampleData = appState.listings.some((l) => l.isSample);

  const hasActiveFilters =
    filters.q !== '' ||
    lPriceSet.size > 0 ||
    lSizeSet.size > 0 ||
    lLotSet.size > 0 ||
    lAreaSet.size > 0 ||
    lValSet.size > 0 ||
    !(lStatusSet.size === 1 && lStatusSet.has('active'));

  const resetListingMece = () => {
    setFilters((prev) => ({ ...prev, q: '' }));
    setLStatusSet(new Set(['active']));
    setLPriceSet(new Set());
    setLSizeSet(new Set());
    setLLotSet(new Set());
    setLAreaSet(new Set());
    setLValSet(new Set());
  };

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

  const toggleFavorite = (id: string) => {
    setAppState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        listings: prev.listings.map((item) =>
          item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
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

  const addStreetAlert = (rule: StreetAlertRule) => {
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            streetAlerts: [rule, ...(prev.streetAlerts ?? [])],
          }
        : prev
    );
  };

  const toggleStreetAlert = (id: string) => {
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            streetAlerts: (prev.streetAlerts ?? []).map((r) =>
              r.id === id ? { ...r, enabled: !r.enabled } : r
            ),
          }
        : prev
    );
  };

  const deleteStreetAlert = (id: string) => {
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            streetAlerts: (prev.streetAlerts ?? []).filter((r) => r.id !== id),
          }
        : prev
    );
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

  return (
    <>
      <TopBar
        activeView={filters.view}
        counts={navCounts}
        apiConfigured={syncMeta.apiConfigured}
        editMode={appState.preferences.editMode}
        onSelectView={(view) => setFilters((f) => ({ ...f, view }))}
        onOpenSync={() => setSyncOpen(true)}
        onOpenAdd={() => {
          setClipDraft(null);
          setAddOpen(true);
        }}
        onToggleEditMode={() =>
          setAppState((prev) =>
            prev
              ? {
                  ...prev,
                  preferences: {
                    ...prev.preferences,
                    editMode: !prev.preferences.editMode,
                  },
                }
              : prev
          )
        }
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main>
        {filters.view === 'map' && (
          <VillageParcelMapView
            listings={allListings}
            privacyBlur={appState.preferences.privacyBlur}
            onOpenListingDrawer={(id) => openListingDrawer(id)}
            onSyncMetaUpdate={(meta) => setSyncMeta(meta)}
          />
        )}

        {filters.view === 'favorites' && (
          <FavoritesAndTasteView
            listings={allListings}
            aiTasteMemo={appState.aiTasteMemo}
            onOpenListing={(id) => openListingDrawer(id)}
            onToggleFavorite={toggleFavorite}
            onUpdateAiTasteMemo={(memo) =>
              setAppState((prev) => (prev ? { ...prev, aiTasteMemo: memo } : prev))
            }
          />
        )}

        {filters.view === 'alerts' && (
          <StreetAlertsView
            rules={streetAlerts}
            listings={allListings}
            onAddRule={addStreetAlert}
            onToggleRule={toggleStreetAlert}
            onDeleteRule={deleteStreetAlert}
            onOpenListing={(id) => openListingDrawer(id)}
          />
        )}

        {filters.view === 'history' && (
          <PriceDropsHistoryView
            listings={allListings}
            privacyBlur={appState.preferences.privacyBlur}
            onOpenListing={(id) => openListingDrawer(id)}
          />
        )}

        {filters.view === 'listings' && (
          <>
            {/* Lean Header Band */}
            <section className="hero-band">
              <div className="container hero-band__grid">
                <div>
                  <h1 className="hero-band__title">
                    <EditableText
                      id="hero-title"
                      fallback="Bellport NY"
                      overrides={appState.copyOverrides}
                      editMode={appState.preferences.editMode}
                      onSave={handleSaveCopyOverride}
                    />
                  </h1>
                  <p className="hero-band__lede">
                    <EditableText
                      id="hero-lede"
                      fallback="Search for a beach house"
                      overrides={appState.copyOverrides}
                      editMode={appState.preferences.editMode}
                      onSave={handleSaveCopyOverride}
                    />
                  </p>
                </div>

                <div className="hero-band__kpis" aria-label="Bellport Village summary">
                  <div className="kpi-item">
                    <div className="kpi-item__val">{animMatches}</div>
                    <div className="kpi-item__label">Homes</div>
                  </div>
                  <div className="kpi-item">
                    <div className="kpi-item__val priv-val">
                      {medianPrice > 0 ? `$${(medianPrice / 1_000_000).toFixed(2)}M` : '—'}
                    </div>
                    <div className="kpi-item__label">Median</div>
                  </div>
                  <div className="kpi-item">
                    <div className="kpi-item__val priv-val">
                      {animPpsf > 0 ? `$${animPpsf}` : '—'}
                    </div>
                    <div className="kpi-item__label">$/Sq Ft</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Clean MECE Dropdown Filter Bar */}
            <section className="filter-band" aria-label="Bellport Village filters">
              <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <MeceFilterDropdown
                      label="Status"
                      options={LISTING_STATUS_OPTS}
                      selected={lStatusSet}
                      onChange={setLStatusSet}
                    />
                    <MeceFilterDropdown
                      label="Price"
                      options={LISTING_PRICE_OPTS}
                      selected={lPriceSet}
                      onChange={setLPriceSet}
                    />
                    <MeceFilterDropdown
                      label="Size"
                      options={LISTING_SIZE_OPTS}
                      selected={lSizeSet}
                      onChange={setLSizeSet}
                    />
                    <MeceFilterDropdown
                      label="Lot"
                      options={LISTING_LOT_OPTS}
                      selected={lLotSet}
                      onChange={setLLotSet}
                    />
                    <MeceFilterDropdown
                      label="Area"
                      options={LISTING_AREA_OPTS}
                      selected={lAreaSet}
                      onChange={setLAreaSet}
                    />
                    <MeceFilterDropdown
                      label="Valuation"
                      options={LISTING_VALUATION_OPTS}
                      selected={lValSet}
                      onChange={setLValSet}
                    />
                    {hasActiveFilters && (
                      <button
                        id="btn-reset-filters"
                        type="button"
                        className="icon-btn"
                        style={{ height: 34 }}
                        onClick={resetListingMece}
                      >
                        <RotateCcw size={13} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-box" style={{ minWidth: 220 }}>
                      <Search size={15} className="search-box__icon" />
                      <input
                        id="keyword-search-input"
                        ref={searchInputRef}
                        type="search"
                        className="search-box__input"
                        style={{ height: 34, fontSize: 13 }}
                        value={filters.q}
                        onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                        placeholder="Search address or style…"
                        aria-label="Search Bellport Village listings"
                      />
                      {filters.q && (
                        <button
                          type="button"
                          className="search-box__clear"
                          onClick={() => setFilters((f) => ({ ...f, q: '' }))}
                          aria-label="Clear search query"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    <select
                      id="select-sort-by"
                      className="filter-field__select"
                      style={{ height: 34, fontSize: 12.5 }}
                      value={filters.sortBy}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          sortBy: e.target.value as FilterState['sortBy'],
                        }))
                      }
                      aria-label="Sort listings"
                    >
                      <option value="newest">Newest</option>
                      <option value="deal-desc">Most Underpriced</option>
                      <option value="price-asc">Price: Low → High</option>
                      <option value="price-desc">Price: High → Low</option>
                      <option value="sqft-desc">Largest Sq Ft</option>
                      <option value="acres-desc">Largest Lot</option>
                    </select>

                    <div className="segmented-tabs" role="group" aria-label="Layout toggle">
                      <button
                        type="button"
                        className={`segmented-tabs__tab ${filters.layout === 'grid' ? 'is-active' : ''}`}
                        onClick={() => setFilters((f) => ({ ...f, layout: 'grid' }))}
                        aria-label="Card grid view"
                      >
                        <LayoutGrid size={14} />
                      </button>
                      <button
                        type="button"
                        className={`segmented-tabs__tab ${filters.layout === 'table' ? 'is-active' : ''}`}
                        onClick={() => setFilters((f) => ({ ...f, layout: 'table' }))}
                        aria-label="Table view"
                      >
                        <List size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Bellport Village Listings */}
            <section className="results-band" aria-label="Bellport Village properties">
              <div className="container">
                {visibleListings.length === 0 ? (
                  <div className="empty-state">
                    <p style={{ color: 'var(--ink-2)', marginBottom: 12 }}>
                      No Bellport Village homes match those filters.
                    </p>
                    <button type="button" className="icon-btn" onClick={resetListingMece}>
                      <RotateCcw size={14} />
                      <span>Reset</span>
                    </button>
                  </div>
                ) : filters.layout === 'grid' ? (
                  <div className="listing-grid">
                    {visibleListings.map((item) => {
                      const ppsf = item.sqft > 0 ? Math.round(item.price / item.sqft) : 0;
                      const priceStats = getPriceChangeStats(item);
                      const deal = evaluateGoodDeal(item, allListings);
                      const photoCount = item.photos?.length ?? (item.photoUrl ? 1 : 0);

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
                              photoUrl={item.photos?.[0] ?? item.photoUrl}
                            />
                            <div className="listing-card__badges">
                              <span
                                className={`badge ${
                                  item.marketStatus === 'sold' ? '' : 'badge--village'
                                }`}
                              >
                                {item.marketStatus === 'sold' ? 'Sold' : 'Bellport Village'}
                              </span>

                              <button
                                type="button"
                                className="status-dot-btn"
                                aria-label={`Favorite ${item.address}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(item.id);
                                }}
                                style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                              >
                                <Heart
                                  size={14}
                                  fill={item.isFavorite ? 'var(--g-red)' : 'none'}
                                  color={item.isFavorite ? 'var(--g-red)' : 'currentColor'}
                                />
                              </button>
                            </div>

                            {photoCount > 1 && (
                              <span
                                className="badge"
                                style={{
                                  position: 'absolute',
                                  left: 12,
                                  bottom: 10,
                                  fontSize: 11,
                                  pointerEvents: 'none',
                                }}
                              >
                                {photoCount} photos
                              </span>
                            )}
                          </div>

                          <div className="listing-card__body">
                            <div>
                              <div className="listing-card__top">
                                <div>
                                  <span className="listing-card__price priv-val">
                                    ${item.price.toLocaleString()}
                                  </span>
                                  {priceStats.totalDropDollar > 0 && (
                                    <span className="listing-card__price-cut priv-val">
                                      ↓ ${Math.round(priceStats.totalDropDollar / 1000)}k
                                    </span>
                                  )}
                                </div>
                                <span
                                  className="priv-val"
                                  style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}
                                >
                                  Est. ${(deal.estimatedFairPrice / 1_000_000).toFixed(2)}M
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
                                <strong>{item.style}</strong>
                              </div>
                            </div>

                            {/* Explicit Overpriced / Underpriced Rating & Amount */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                className={`badge priv-val ${
                                  deal.status === 'underpriced'
                                    ? 'badge--village'
                                    : deal.status === 'overpriced'
                                      ? 'badge--outside'
                                      : ''
                                }`}
                              >
                                {deal.badgeLabel}
                              </span>
                            </div>

                            {/* Brief Architectural Style Description */}
                            <p className="listing-card__headline" style={{ margin: 0 }}>
                              <HighlightedText
                                text={item.styleSummary ?? item.headline}
                                query={filters.q}
                              />
                            </p>

                            <div className="listing-card__specs">
                              <div>
                                <strong>
                                  {item.beds}/{item.baths}
                                </strong>
                                <span>Bd/Ba</span>
                              </div>
                              <div>
                                <strong>{item.sqft > 0 ? item.sqft.toLocaleString() : '—'}</strong>
                                <span>Sq Ft</span>
                              </div>
                              <div>
                                <strong className="priv-val">{ppsf > 0 ? `$${ppsf}` : '—'}</strong>
                                <span>$/Ft²</span>
                              </div>
                              <div>
                                <strong>{item.lotAcres}</strong>
                                <span>Acres</span>
                              </div>
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
                          <th>♥</th>
                          <th>Address &amp; Architectural Style</th>
                          <th>Price</th>
                          <th>Valuation Rating</th>
                          <th>Bd/Ba</th>
                          <th>Sq Ft</th>
                          <th>$/Ft²</th>
                          <th>Acres</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleListings.map((item) => {
                          const deal = evaluateGoodDeal(item, allListings);
                          const pStats = getPriceChangeStats(item);

                          return (
                            <tr key={item.id} onClick={() => openListingDrawer(item.id)}>
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(item.id);
                                }}
                              >
                                <button
                                  type="button"
                                  className="status-dot-btn"
                                  aria-label={`Favorite ${item.address}`}
                                >
                                  <Heart
                                    size={14}
                                    fill={item.isFavorite ? 'var(--g-red)' : 'none'}
                                    color={item.isFavorite ? 'var(--g-red)' : 'currentColor'}
                                  />
                                </button>
                              </td>
                              <td>
                                <strong style={{ display: 'block' }}>
                                  <HighlightedText text={item.address} query={filters.q} />
                                </strong>
                                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                                  {item.style} — {item.styleSummary ?? item.headline}
                                </span>
                              </td>
                              <td className="num priv-val">
                                <strong>${item.price.toLocaleString()}</strong>
                                {pStats.totalDropDollar > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--g-green-600)' }}>
                                    ↓ ${Math.round(pStats.totalDropDollar / 1000)}k
                                  </div>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`badge priv-val ${
                                    deal.status === 'underpriced'
                                      ? 'badge--village'
                                      : deal.status === 'overpriced'
                                        ? 'badge--outside'
                                        : ''
                                  }`}
                                >
                                  {deal.badgeLabel}
                                </span>
                              </td>
                              <td className="num">
                                {item.beds}/{item.baths}
                              </td>
                              <td className="num">
                                {item.sqft > 0 ? item.sqft.toLocaleString() : '—'}
                              </td>
                              <td className="num priv-val">
                                {item.sqft > 0 ? `$${Math.round(item.price / item.sqft)}` : '—'}
                              </td>
                              <td className="num">{item.lotAcres}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Price vs. Space Valuation Scatterplot */}
            <PriceSpaceChart
              listings={visibleListings}
              privacyBlur={appState.preferences.privacyBlur}
              onSelectListing={(id) => openListingDrawer(id)}
            />
          </>
        )}
      </main>

      {/* Quiet Bottom-Right Floating Corner Dock */}
      <CornerDock
        theme={appState.preferences.theme}
        privacyBlur={appState.preferences.privacyBlur}
        scratchpad={appState.scratchpad}
        onFocusSearch={() => {
          setFilters((f) => ({ ...f, view: 'listings' }));
          window.setTimeout(() => {
            searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInputRef.current?.focus();
          }, 30);
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
        key={selectedListing?.id ?? 'none'}
        listing={selectedListing}
        allListings={allListings}
        privacyBlur={appState.preferences.privacyBlur}
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

      {/* Add / URL Clipper / Bookmarklet / CSV Modal */}
      <AddListingModal
        key={clipDraft ? `clip-${clipDraft.sourceUrl ?? 'draft'}` : 'manual'}
        open={addOpen}
        initialClipDraft={clipDraft}
        onClose={() => {
          setAddOpen(false);
          setClipDraft(null);
        }}
        onAddListings={addListings}
      />

      {/* Live RealtyAPI Polygon Sync Modal */}
      <SyncModal
        open={syncOpen}
        syncMeta={syncMeta}
        onClose={() => setSyncOpen(false)}
        onSyncMetaChange={(meta) => setSyncMeta(meta)}
        onSyncComplete={(nextState, meta) => {
          setAppState(nextState);
          setSyncMeta(meta);
        }}
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
