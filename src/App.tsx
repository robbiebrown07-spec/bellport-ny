import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, LayoutGrid, List, RotateCcw } from 'lucide-react';
import { median } from 'd3-array';
import type {
  EmailAlertRule,
  FilterState,
  HistoricalSaleRecord,
  Listing,
  PersistedAppState,
  PrimaryView,
  SyncMetadata,
  VillageParcelsBundle,
} from './types';
import { fetchSeedListings, loadBootstrap, saveState } from './lib/storage';
import { evaluateGoodDeal } from './lib/intelligence';
import { evaluateRobbieFit } from './lib/robbieFit';
import { evaluateArchitecturalBeauty } from './lib/ownerAndAirbnb';
import { parseNaturalLanguageQuery } from './lib/nlSearch';
import {
  INITIAL_UNIFIED_FILTERS,
  buildUnifiedVillageCatalog,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  resolveAssetUrl,
  toPseudoListing,
  type UnifiedFilters,
} from './lib/unifiedCatalog';
import { LoadingMark } from './components/AppMark';
import { TopBar } from './components/TopBar';
import { PropertyIllustration } from './components/PropertyIllustration';
import { HighlightedText } from './components/HighlightedText';
import { PropertyDrawer } from './components/PropertyDrawer';
import { SyncModal } from './components/SyncModal';
import { SettingsDrawer } from './components/SettingsDrawer';
import { FavoritesAndTasteView } from './components/FavoritesAndTasteView';
import { EmailAlertsView } from './components/EmailAlertsView';
import { PriceDropsHistoryView } from './components/PriceDropsHistoryView';
import { VillageParcelMapView } from './components/VillageParcelMapView';
import { AboutBellportView } from './components/AboutBellportView';
import { UnifiedFilterBar } from './components/UnifiedFilterBar';
import { ValuationBadge } from './components/ValuationBadge';
import { RobbieFitBadge } from './components/RobbieFitBadge';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<PersistedAppState | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMetadata>({
    apiConfigured: false,
    cachedDetailsCount: 0,
  });
  const [parcelsBundle, setParcelsBundle] = useState<VillageParcelsBundle | null>(null);
  const [salesHistory, setSalesHistory] = useState<HistoricalSaleRecord[]>([]);
  const [activeView, setActiveView] = useState<PrimaryView>('map');
  const [unifiedFilters, setUnifiedFilters] = useState<UnifiedFilters>(INITIAL_UNIFIED_FILTERS);
  const [sortBy, setSortBy] = useState<
    | 'featured'
    | 'robbie-fit'
    | 'beauty-desc'
    | 'underpriced'
    | 'price-asc'
    | 'price-desc'
    | 'sqft-desc'
    | 'acres-desc'
  >('featured');
  const [layout, setLayout] = useState<FilterState['layout']>('grid');
  const [homesLimit, setHomesLimit] = useState(24);
  const [selectedParcelOrListingId, setSelectedParcelOrListingId] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadBootstrap(),
      fetch(resolveAssetUrl('/data/bellport-parcels.json') ?? '/data/bellport-parcels.json').then(
        (r) => r.json() as Promise<VillageParcelsBundle>
      ),
      fetch(
        resolveAssetUrl('/data/bellport-sales-history.json') ?? '/data/bellport-sales-history.json'
      ).then((r) => r.json() as Promise<HistoricalSaleRecord[]>),
    ])
      .then(([payload, pBundle, sHist]) => {
        if (!active) return;
        setAppState(payload.state);
        setSyncMeta(payload.syncMeta);
        setParcelsBundle(pBundle);
        setSalesHistory(sHist);
      })
      .catch((err) => {
        console.error('Failed to bootstrap Bellport NY:', err);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!appState) return;
    document.documentElement.setAttribute('data-theme', appState.preferences.theme);
    document.documentElement.setAttribute(
      'data-privacy',
      appState.preferences.privacyBlur ? 'blur' : 'normal'
    );
  }, [appState]);

  useEffect(() => {
    if (!appState) return;
    const timer = window.setTimeout(() => {
      void saveState(appState);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [appState]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (!inEditable && !selectedParcelOrListingId && !syncOpen && !settingsOpen && e.key === '/') {
        e.preventDefault();
        window.setTimeout(() => searchInputRef.current?.focus(), 20);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedParcelOrListingId, syncOpen, settingsOpen]);

  const allListings = useMemo(
    () =>
      (appState?.listings ?? []).filter(
        (l) => l.inVillage && l.area !== 'Outside Village (11713)'
      ),
    [appState]
  );

  const savedParcelIds = useMemo<Record<string, boolean>>(
    () => appState?.savedParcelIds ?? {},
    [appState?.savedParcelIds]
  );

  const emailAlerts = useMemo<EmailAlertRule[]>(() => {
    if (appState?.emailAlerts && appState.emailAlerts.length > 0) {
      return appState.emailAlerts;
    }
    return [
      {
        id: 'email-alert-default',
        name: 'Historic Lanes Family Vacation House',
        email: 'robbiebrown07@gmail.com',
        frequency: 'immediately',
        minPrice: null,
        maxPrice: 2_500_000,
        minBeds: 3,
        minBaths: 2,
        minSqft: null,
        minLotAcres: null,
        belowSC: true,
        beautifulStreetsOnly: false,
        selectedStreets: ['bellport-lane', 'browns-lane', 'bell-hulse-pocket', 'livingston-rogers'],
        poolMode: 'pool_or_room',
        feats: [],
        naturalQuery: '',
        notifyOnPriceDrop: true,
        enabled: true,
        createdAt: '2026-11-26',
      },
    ];
  }, [appState?.emailAlerts]);

  const catalog = useMemo(
    () =>
      parcelsBundle
        ? buildUnifiedVillageCatalog(
            parcelsBundle.parcels,
            allListings,
            salesHistory,
            savedParcelIds
          )
        : [],
    [parcelsBundle, allListings, salesHistory, savedParcelIds]
  );

  const parsedNl = useMemo(
    () => parseNaturalLanguageQuery(unifiedFilters.nlQuery),
    [unifiedFilters.nlQuery]
  );

  const matchedHomes = useMemo(() => {
    const list = catalog.filter((h) => homeMatchesUnifiedFilters(h, unifiedFilters, true));
    list.sort((a, b) => {
      if (sortBy === 'featured') {
        if (a.isForSale !== b.isForSale) return a.isForSale ? -1 : 1;
        if (parsedNl.sortHint === 'lawn_desc') return b.openLawnAc - a.openLawnAc;
        if (parsedNl.sortHint === 'beauty_desc') {
          return (
            evaluateArchitecturalBeauty(toPseudoListing(b)).score10 -
            evaluateArchitecturalBeauty(toPseudoListing(a)).score10
          );
        }
        if (a.hasPastSale !== b.hasPastSale) return a.hasPastSale ? -1 : 1;
        return b.price - a.price;
      }
      if (sortBy === 'robbie-fit') {
        const fa = evaluateRobbieFit(toPseudoListing(a)).score;
        const fb = evaluateRobbieFit(toPseudoListing(b)).score;
        if (fb !== fa) return fb - fa;
        return a.isForSale === b.isForSale ? 0 : a.isForSale ? -1 : 1;
      }
      if (sortBy === 'beauty-desc') {
        const ba = evaluateArchitecturalBeauty(toPseudoListing(a)).score10;
        const bb = evaluateArchitecturalBeauty(toPseudoListing(b)).score10;
        return bb - ba;
      }
      if (sortBy === 'underpriced') {
        const da = evaluateGoodDeal(toPseudoListing(a), allListings).diffPct;
        const db = evaluateGoodDeal(toPseudoListing(b), allListings).diffPct;
        return da - db;
      }
      if (sortBy === 'price-asc') return a.price - b.price;
      if (sortBy === 'price-desc') return b.price - a.price;
      if (sortBy === 'sqft-desc') return b.sqft - a.sqft;
      if (sortBy === 'acres-desc') return b.lotAcres - a.lotAcres;
      return 0;
    });
    return list;
  }, [allListings, catalog, parsedNl.sortHint, sortBy, unifiedFilters]);

  const visibleHomes = useMemo(
    () => matchedHomes.slice(0, homesLimit),
    [matchedHomes, homesLimit]
  );

  const medianPrice = useMemo(
    () => Math.round(median(matchedHomes, (d) => d.price) ?? 0),
    [matchedHomes]
  );

  const drawerHome = useMemo(() => {
    if (!selectedParcelOrListingId) return null;
    return (
      catalog.find(
        (h) =>
          h.parcelId === selectedParcelOrListingId ||
          h.listingId === selectedParcelOrListingId ||
          h.uid === selectedParcelOrListingId
      ) ?? null
    );
  }, [catalog, selectedParcelOrListingId]);

  const drawerListing: Listing | null = useMemo(() => {
    if (drawerHome) return toPseudoListing(drawerHome);
    if (!selectedParcelOrListingId) return null;
    return allListings.find((l) => l.id === selectedParcelOrListingId) ?? null;
  }, [allListings, drawerHome, selectedParcelOrListingId]);

  if (!appState) {
    return (
      <main className="container" style={{ display: 'flex', justifyContent: 'center' }}>
        <LoadingMark />
      </main>
    );
  }

  const hasSampleData = appState.listings.some((l) => l.isSample);

  const updateListing = (id: string, patch: Partial<Listing>) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const exists = prev.listings.some((item) => item.id === id);
      if (!exists && patch.isFavorite !== undefined) {
        return {
          ...prev,
          savedParcelIds: {
            ...(prev.savedParcelIds ?? {}),
            [id]: Boolean(patch.isFavorite),
          },
        };
      }
      return {
        ...prev,
        listings: prev.listings.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      };
    });
  };

  const toggleHomeFavorite = (parcelId: string, listingId: string | null) => {
    setAppState((prev) => {
      if (!prev) return prev;
      if (listingId && prev.listings.some((item) => item.id === listingId)) {
        return {
          ...prev,
          listings: prev.listings.map((item) =>
            item.id === listingId ? { ...item, isFavorite: !item.isFavorite } : item
          ),
        };
      }
      const cur = Boolean((prev.savedParcelIds ?? {})[parcelId]);
      return {
        ...prev,
        savedParcelIds: {
          ...(prev.savedParcelIds ?? {}),
          [parcelId]: !cur,
        },
      };
    });
  };

  const deleteListing = (id: string) => {
    setSelectedParcelOrListingId(null);
    setAppState((prev) =>
      prev ? { ...prev, listings: prev.listings.filter((item) => item.id !== id) } : prev
    );
  };

  const addEmailAlert = (rule: EmailAlertRule) => {
    setAppState((prev) =>
      prev ? { ...prev, emailAlerts: [rule, ...emailAlerts] } : prev
    );
  };

  const toggleEmailAlert = (id: string) => {
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            emailAlerts: emailAlerts.map((r) =>
              r.id === id ? { ...r, enabled: !r.enabled } : r
            ),
          }
        : prev
    );
  };

  const deleteEmailAlert = (id: string) => {
    setAppState((prev) =>
      prev ? { ...prev, emailAlerts: emailAlerts.filter((r) => r.id !== id) } : prev
    );
  };

  return (
    <>
      <TopBar
        activeView={activeView}
        onSelectView={(v) => setActiveView(v)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main>
        {activeView === 'map' && (
          <VillageParcelMapView
            listings={allListings}
            savedParcelIds={savedParcelIds}
            onToggleFavorite={toggleHomeFavorite}
            unifiedFilters={unifiedFilters}
            onChangeUnifiedFilters={(next) => {
              setUnifiedFilters(next);
              setHomesLimit(24);
            }}
            privacyBlur={appState.preferences.privacyBlur}
            onOpenHomeDrawer={(parcelId) => setSelectedParcelOrListingId(parcelId)}
            onSyncMetaUpdate={(meta) => setSyncMeta(meta)}
          />
        )}

        {activeView === 'favorites' && (
          <FavoritesAndTasteView
            listings={catalog.length > 0 ? catalog.map(toPseudoListing) : allListings}
            aiTasteMemo={appState.aiTasteMemo}
            onOpenListing={(id) => setSelectedParcelOrListingId(id)}
            onToggleFavorite={(id) => {
              const found = catalog.find(
                (h) => h.parcelId === id || h.listingId === id || h.uid === id
              );
              if (found) toggleHomeFavorite(found.parcelId, found.listingId);
              else toggleHomeFavorite(id, id);
            }}
            onUpdateAiTasteMemo={(memo) =>
              setAppState((prev) => (prev ? { ...prev, aiTasteMemo: memo } : prev))
            }
          />
        )}

        {activeView === 'alerts' && (
          <EmailAlertsView
            rules={emailAlerts}
            catalog={catalog}
            activeUnifiedFilters={unifiedFilters}
            onAddRule={addEmailAlert}
            onToggleRule={toggleEmailAlert}
            onDeleteRule={deleteEmailAlert}
            onOpenListing={(id) => setSelectedParcelOrListingId(id)}
          />
        )}

        {activeView === 'history' && (
          <PriceDropsHistoryView
            listings={allListings}
            privacyBlur={appState.preferences.privacyBlur}
            onOpenListing={(id) => setSelectedParcelOrListingId(id)}
          />
        )}

        {activeView === 'about' && (
          <AboutBellportView
            pois={parcelsBundle?.pois ?? []}
            onJumpToMap={() => setActiveView('map')}
          />
        )}

        {activeView === 'listings' && (
          <>
            <section className="filter-band" aria-label="Bellport Village filters">
              <div
                className="container"
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <UnifiedFilterBar
                  filters={unifiedFilters}
                  onChange={(next) => {
                    setUnifiedFilters(next);
                    setHomesLimit(24);
                  }}
                  context="listings"
                  searchInputRef={searchInputRef}
                />

                {/* Scope Switcher (For Sale, All Past Sales, All 1,058 Village Homes) + Sort */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`pill-toggle ${
                        !unifiedFilters.allPastSales &&
                        !unifiedFilters.allHomes &&
                        !unifiedFilters.soldRecent
                          ? 'is-active'
                          : ''
                      }`}
                      onClick={() => {
                        setUnifiedFilters((f) => ({
                          ...f,
                          forSale: true,
                          allPastSales: false,
                          allHomes: false,
                          soldRecent: false,
                        }));
                        setHomesLimit(24);
                      }}
                    >
                      <span>For Sale (12)</span>
                    </button>

                    <button
                      type="button"
                      className={`pill-toggle ${
                        unifiedFilters.allPastSales && !unifiedFilters.allHomes ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        setUnifiedFilters((f) => ({
                          ...f,
                          forSale: false,
                          allPastSales: true,
                          allHomes: false,
                        }));
                        setHomesLimit(36);
                      }}
                    >
                      <span>All Past Sales (236)</span>
                    </button>

                    <button
                      type="button"
                      className={`pill-toggle ${unifiedFilters.allHomes ? 'is-active' : ''}`}
                      onClick={() => {
                        setUnifiedFilters((f) => ({
                          ...f,
                          forSale: false,
                          allPastSales: false,
                          allHomes: true,
                        }));
                        setHomesLimit(36);
                      }}
                    >
                      <span>All Village Homes (1,058)</span>
                    </button>

                    <span style={{ color: 'var(--ink-2)', marginLeft: 6 }}>
                      <strong>{matchedHomes.length.toLocaleString()}</strong>{' '}
                      {matchedHomes.length === 1 ? 'home' : 'homes'}
                      {medianPrice > 0 && (
                        <span className="priv-val">
                          {' '}
                          · Median{' '}
                          <strong style={{ color: 'var(--ink)' }}>
                            {fmtShortDollar(medianPrice)}
                          </strong>
                        </span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className="filter-field__select"
                      style={{ height: 34, fontSize: 12.5 }}
                      value={unifiedFilters.valuation}
                      onChange={(e) =>
                        setUnifiedFilters((f) => ({
                          ...f,
                          valuation: e.target.value as UnifiedFilters['valuation'],
                        }))
                      }
                    >
                      <option value="">All Valuations</option>
                      <option value="underpriced">Underpriced Only</option>
                      <option value="overpriced">Overpriced Only</option>
                    </select>

                    <select
                      className="filter-field__select"
                      style={{ height: 34, fontSize: 12.5 }}
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    >
                      <option value="featured">Sort: Featured</option>
                      <option value="robbie-fit">Best Fit for Robbie</option>
                      <option value="beauty-desc">Architectural Beauty</option>
                      <option value="underpriced">Most Underpriced</option>
                      <option value="price-asc">Price: Low → High</option>
                      <option value="price-desc">Price: High → Low</option>
                      <option value="sqft-desc">Largest Sq Ft</option>
                      <option value="acres-desc">Largest Lot</option>
                    </select>

                    <div className="segmented-tabs" role="group" aria-label="Layout toggle">
                      <button
                        type="button"
                        className={`segmented-tabs__tab ${layout === 'grid' ? 'is-active' : ''}`}
                        onClick={() => setLayout('grid')}
                        aria-label="Card grid view"
                      >
                        <LayoutGrid size={14} />
                      </button>
                      <button
                        type="button"
                        className={`segmented-tabs__tab ${layout === 'table' ? 'is-active' : ''}`}
                        onClick={() => setLayout('table')}
                        aria-label="Table view"
                      >
                        <List size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="results-band" aria-label="Bellport Village properties">
              <div className="container">
                <div style={{ marginBottom: 14 }}>
                  <span className="eyebrow" style={{ marginBottom: 2 }}>
                    Village Directory
                  </span>
                </div>
                {matchedHomes.length === 0 ? (
                  <div className="empty-state">
                    <p style={{ color: 'var(--ink-2)', marginBottom: 12 }}>
                      No Bellport Village homes match those filters.
                    </p>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setUnifiedFilters(INITIAL_UNIFIED_FILTERS)}
                    >
                      <RotateCcw size={14} />
                      <span>Reset</span>
                    </button>
                  </div>
                ) : layout === 'grid' ? (
                  <div className="listing-grid">
                    {visibleHomes.map((h) => {
                      const ppsf = h.sqft > 0 ? Math.round(h.price / h.sqft) : 0;
                      const pseudo = toPseudoListing(h);
                      const deal = evaluateGoodDeal(pseudo, allListings);
                      const fit = evaluateRobbieFit(pseudo);
                      const beauty = evaluateArchitecturalBeauty(pseudo);

                      return (
                        <article key={h.parcelId} className="listing-card">
                          <div
                            className="listing-card__media"
                            onClick={() => setSelectedParcelOrListingId(h.parcelId)}
                          >
                            <PropertyIllustration
                              archetype={h.archetype}
                              address={h.address}
                              styleName={h.style}
                              photoUrl={h.photoUrl}
                            />
                            <div className="listing-card__badges">
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                <RobbieFitBadge listing={pseudo} fit={fit} compact />
                                <span
                                  className="badge"
                                  style={{
                                    background: 'rgba(255,255,255,0.94)',
                                    color: 'var(--ink)',
                                  }}
                                >
                                  {h.area}
                                </span>
                              </div>

                              <button
                                type="button"
                                className="status-dot-btn"
                                aria-label={`Save ${h.address}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHomeFavorite(h.parcelId, h.listingId);
                                }}
                                style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                              >
                                <Heart
                                  size={14}
                                  fill={h.isFavorite ? 'var(--g-red)' : 'none'}
                                  color={h.isFavorite ? 'var(--g-red)' : 'currentColor'}
                                />
                              </button>
                            </div>

                            <span
                              className="badge"
                              style={{
                                position: 'absolute',
                                left: 12,
                                bottom: 10,
                                fontSize: 11,
                                background: h.isForSale
                                  ? '#9be3b0'
                                  : h.hasPastSale
                                    ? 'rgba(32,33,36,0.82)'
                                    : 'rgba(255,255,255,0.92)',
                                color: h.isForSale
                                  ? '#124d2c'
                                  : h.hasPastSale
                                    ? '#ffffff'
                                    : 'var(--ink-2)',
                                border: 'none',
                              }}
                            >
                              {h.isForSale
                                ? 'For Sale'
                                : h.hasPastSale
                                  ? `Sold ${h.soldYear ?? ''}`
                                  : 'Off-Market · Est. Value'}
                            </span>

                            {h.photoSource && h.photoSource !== 'mls' && (
                              <span
                                style={{
                                  position: 'absolute',
                                  right: 10,
                                  bottom: 10,
                                  padding: '2px 7px',
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 500,
                                  background: 'rgba(32,33,36,0.68)',
                                  color: '#ffffff',
                                }}
                              >
                                {h.photoSource === 'aerial' ? 'Aerial View' : 'Street View'}
                              </span>
                            )}
                          </div>

                          <div className="listing-card__body">
                            <div>
                              <div className="listing-card__top">
                                <span className="listing-card__price priv-val">
                                  {h.isForSale || h.hasPastSale ? '' : 'Est. '}$
                                  {h.price.toLocaleString()}
                                </span>
                                <ValuationBadge listing={pseudo} deal={deal} compact />
                              </div>

                              <h3
                                className="listing-card__address"
                                onClick={() => setSelectedParcelOrListingId(h.parcelId)}
                              >
                                <HighlightedText
                                  text={h.address}
                                  query={unifiedFilters.nlQuery}
                                />
                              </h3>
                              <div className="listing-card__sub">
                                <strong>{h.style}</strong>
                              </div>
                            </div>

                            <p className="listing-card__headline" style={{ margin: 0 }}>
                              <HighlightedText
                                text={h.styleSummary}
                                query={unifiedFilters.nlQuery}
                              />
                            </p>

                            <div
                              style={{
                                fontSize: 11.5,
                                color: 'var(--ink-2)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}
                            >
                              <span>Stores: {h.distStoresMi} mi ({h.walkStoresMin}m)</span>
                              <span>Marina: {h.distMarinaMi} mi ({h.walkMarinaMin}m)</span>
                            </div>

                            <div
                              className="listing-card__specs"
                              style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                            >
                              <div>
                                <strong>
                                  {h.beds}/{h.baths}
                                </strong>
                                <span>Bd/Ba</span>
                              </div>
                              <div>
                                <strong>{h.sqft.toLocaleString()}</strong>
                                <span>Sq Ft</span>
                              </div>
                              <div>
                                <strong className="priv-val">{ppsf > 0 ? `$${ppsf}` : '—'}</strong>
                                <span>$/Ft²</span>
                              </div>
                              <div>
                                <strong>{h.lotAcres}</strong>
                                <span>Acres</span>
                              </div>
                              <div>
                                <strong style={{ color: 'var(--accent)' }}>{beauty.display}</strong>
                                <span>Beauty</span>
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
                          <th>Fit</th>
                          <th>Area</th>
                          <th>Price / Value</th>
                          <th>Valuation</th>
                          <th>Bd/Ba</th>
                          <th>Sq Ft</th>
                          <th>$/Ft²</th>
                          <th>Acres</th>
                          <th>Beauty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleHomes.map((h) => {
                          const ppsf = h.sqft > 0 ? Math.round(h.price / h.sqft) : 0;
                          const pseudo = toPseudoListing(h);
                          const deal = evaluateGoodDeal(pseudo, allListings);
                          const fit = evaluateRobbieFit(pseudo);
                          const beauty = evaluateArchitecturalBeauty(pseudo);

                          return (
                            <tr
                              key={h.parcelId}
                              onClick={() => setSelectedParcelOrListingId(h.parcelId)}
                            >
                              <td
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleHomeFavorite(h.parcelId, h.listingId);
                                }}
                              >
                                <button
                                  type="button"
                                  className="status-dot-btn"
                                  aria-label={`Save ${h.address}`}
                                >
                                  <Heart
                                    size={14}
                                    fill={h.isFavorite ? 'var(--g-red)' : 'none'}
                                    color={h.isFavorite ? 'var(--g-red)' : 'currentColor'}
                                  />
                                </button>
                              </td>
                              <td>
                                <strong style={{ display: 'block' }}>
                                  <HighlightedText
                                    text={h.address}
                                    query={unifiedFilters.nlQuery}
                                  />
                                </strong>
                                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                                  {h.style} · Stores {h.distStoresMi}mi · Marina {h.distMarinaMi}mi
                                </span>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <RobbieFitBadge listing={pseudo} fit={fit} compact />
                              </td>
                              <td>{h.area}</td>
                              <td className="num priv-val">
                                <strong>
                                  {h.isForSale ? '' : h.hasPastSale ? 'Sold ' : 'Est. '}$
                                  {h.price.toLocaleString()}
                                </strong>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <ValuationBadge listing={pseudo} deal={deal} compact />
                              </td>
                              <td className="num">
                                {h.beds}/{h.baths}
                              </td>
                              <td className="num">{h.sqft.toLocaleString()}</td>
                              <td className="num priv-val">{ppsf > 0 ? `$${ppsf}` : '—'}</td>
                              <td className="num">{h.lotAcres}</td>
                              <td className="num" style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                {beauty.display}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {matchedHomes.length > visibleHomes.length && (
                  <div style={{ textAlign: 'center', marginTop: 24 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setHomesLimit((n) => n + 36)}
                    >
                      <span>
                        Show more homes ({visibleHomes.length} of{' '}
                        {matchedHomes.length.toLocaleString()})
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Universal Slide-Over Property Detail Sheet (Opens for ANY of the 1,058 Village Homes!) */}
      <PropertyDrawer
        key={drawerListing?.id ?? 'none'}
        listing={drawerListing}
        parcelMeta={
          drawerHome
            ? {
                parcelId: drawerHome.parcelId,
                owner: drawerHome.owner,
                mail: drawerHome.mail,
                absentee: drawerHome.parcelRef.absentee,
              }
            : null
        }
        allListings={allListings}
        privacyBlur={appState.preferences.privacyBlur}
        searchQuery={unifiedFilters.nlQuery}
        hasPrev={false}
        hasNext={false}
        onPrev={() => {}}
        onNext={() => {}}
        onClose={() => setSelectedParcelOrListingId(null)}
        onUpdateListing={updateListing}
        onDeleteListing={deleteListing}
      />

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

      <SettingsDrawer
        open={settingsOpen}
        state={appState}
        hasSampleData={hasSampleData}
        onClose={() => setSettingsOpen(false)}
        onImportState={(next) => setAppState(next)}
        onClearSampleData={() =>
          setAppState((prev) =>
            prev ? { ...prev, listings: prev.listings.filter((l) => !l.isSample) } : prev
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
