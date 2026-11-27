import React, { useMemo } from 'react';
import { Compass, Heart, MapPin, RotateCcw, ThumbsDown } from 'lucide-react';
import type { Listing } from '../types';
import { evaluateGoodDeal } from '../lib/intelligence';
import { evaluateRobbieFit } from '../lib/robbieFit';
import {
  classifyArchitecturalTaste,
  evaluateArchitecturalBeauty,
} from '../lib/ownerAndAirbnb';
import {
  BEAUTIFUL_STREET_OPTIONS,
  DESIGN_FEATURE_LABELS,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  isAnyUnifiedFilterActive,
  toPseudoListing,
  type UnifiedFilters,
  type UnifiedHome,
} from '../lib/unifiedCatalog';
import { UnifiedFilterBar } from './UnifiedFilterBar';
import { PropertyIllustration } from './PropertyIllustration';
import { ValuationBadge } from './ValuationBadge';
import { RobbieFitBadge } from './RobbieFitBadge';
import { ScrollReveal } from './ScrollReveal';

interface FavoritesAndTasteViewProps {
  catalog: UnifiedHome[];
  allListings: Listing[];
  tasteFilters: UnifiedFilters;
  idealSearchNotes: string;
  onChangeTasteFilters: (next: UnifiedFilters) => void;
  onChangeIdealSearchNotes: (next: string) => void;
  onApplyToMap: (next: UnifiedFilters) => void;
  onOpenListing: (id: string) => void;
  onShowOnMap: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleHidden: (id: string) => void;
}

function formatNaturalList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export const FavoritesAndTasteView: React.FC<FavoritesAndTasteViewProps> = ({
  catalog,
  allListings,
  tasteFilters,
  idealSearchNotes,
  onChangeTasteFilters,
  onChangeIdealSearchNotes,
  onApplyToMap,
  onOpenListing,
  onShowOnMap,
  onToggleFavorite,
  onToggleHidden,
}) => {
  const favorites = useMemo(() => catalog.filter((h) => h.isFavorite), [catalog]);
  const hiddenHomes = useMemo(() => catalog.filter((h) => h.isHidden), [catalog]);
  const hasCustomFilters = isAnyUnifiedFilterActive(tasteFilters);

  const profileStats = useMemo(() => {
    const sqfts = favorites.map((f) => f.sqft).filter((n) => n > 0).sort((a, b) => a - b);
    const acres = favorites.map((f) => f.lotAcres).filter((n) => n > 0).sort((a, b) => a - b);
    const medSqft = sqfts.length > 0 ? sqfts[Math.floor(sqfts.length / 2)] : (tasteFilters.minSqft ?? 2400);
    const medAcres = acres.length > 0 ? acres[Math.floor(acres.length / 2)] : (tasteFilters.minLot ?? 0.42);

    const areaMap = new Map<string, number>();
    const traitMap = new Map<string, number>();

    for (const f of favorites) {
      areaMap.set(f.area, (areaMap.get(f.area) ?? 0) + 1);
      const blob = `${f.style} ${f.description} ${f.feats.join(' ')}`.toLowerCase();
      if (/shingle|cape|gambrel/.test(blob)) traitMap.set('weathered cedar shingle', (traitMap.get('weathered cedar shingle') ?? 0) + 1);
      if (f.yearBuilt <= 1945) traitMap.set('historic pre-war proportions', (traitMap.get('historic pre-war proportions') ?? 0) + 1);
      if (f.feats.includes('pool') || f.feats.includes('space_pool') || f.lotAcres >= 0.34) {
        traitMap.set('pool or pool-ready grounds', (traitMap.get('pool or pool-ready grounds') ?? 0) + 1);
      }
      if (f.feats.includes('fireplace') || /fireplace/.test(blob)) {
        traitMap.set('wood-burning fireplace', (traitMap.get('wood-burning fireplace') ?? 0) + 1);
      }
      if (f.feats.includes('addl_struct') || /barn|carriage|studio|pool house/.test(blob)) {
        traitMap.set('detached studio or pool house', (traitMap.get('detached studio or pool house') ?? 0) + 1);
      }
    }

    // Fold in explicit dropdown refinements so Robbie's manual tweaks immediately update the Taste Profile!
    const activeAreas =
      tasteFilters.areas.length > 0
        ? tasteFilters.areas
        : tasteFilters.belowSC
          ? ['Historic Lanes', 'South Howells & Bay']
          : Array.from(areaMap.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([a]) => a);

    const explicitTraits: string[] = [];
    if (tasteFilters.feats.includes('pool') && tasteFilters.feats.includes('space_pool')) {
      explicitTraits.push('pool or room for a pool');
    } else if (tasteFilters.feats.includes('pool')) {
      explicitTraits.push('existing in-ground pool');
    } else if (tasteFilters.feats.includes('space_pool')) {
      explicitTraits.push('room for a pool');
    }
    for (const fk of tasteFilters.feats) {
      if (fk === 'pool' || fk === 'space_pool') continue;
      explicitTraits.push((DESIGN_FEATURE_LABELS[fk] ?? fk).toLowerCase());
    }
    if (tasteFilters.beautifulStreets.length > 0) {
      const names = tasteFilters.beautifulStreets
        .map((id): string | undefined => BEAUTIFUL_STREET_OPTIONS.find((s) => s.id === id)?.label)
        .filter((x): x is string => Boolean(x));
      if (names.length > 0) explicitTraits.push(names.slice(0, 2).join(' and '));
    } else if (tasteFilters.beautifulStreetsOnly) {
      explicitTraits.push('most beautiful tree-lined streets');
    }

    const derivedTraits = Array.from(traitMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);

    const combinedTraits = Array.from(new Set([...explicitTraits, ...derivedTraits])).slice(0, 4);
    if (combinedTraits.length === 0) {
      combinedTraits.push(
        'weathered cedar shingle',
        'pool or pool-ready grounds',
        'lush landscaped yard',
        'classic New England proportions'
      );
    }

    const pricePhrase =
      tasteFilters.minPrice !== null && tasteFilters.maxPrice !== null
        ? `${fmtShortDollar(tasteFilters.minPrice)}–${fmtShortDollar(tasteFilters.maxPrice)}`
        : tasteFilters.maxPrice !== null
          ? `under ${fmtShortDollar(tasteFilters.maxPrice)}`
          : tasteFilters.minPrice !== null
            ? `${fmtShortDollar(tasteFilters.minPrice)}+`
            : null;

    return {
      medSqft: Math.round(medSqft / 50) * 50,
      medAcres: Number(medAcres.toFixed(2)),
      areasText: formatNaturalList(
        activeAreas.length > 0 ? activeAreas : ['Historic Lanes', 'South Howells & Bay']
      ),
      traitsText: formatNaturalList(combinedTraits),
      pricePhrase,
      signatureTraits: Array.from(traitMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    };
  }, [favorites, tasteFilters]);

  // Recommendations matching Robbie's Architectural DNA + active Taste Profile dropdown filters
  const recommendations = useMemo(() => {
    const candidates = catalog.filter((h) => {
      if (h.isFavorite || h.isHidden) return false;
      const pseudo = toPseudoListing(h);
      // Strictly exclude unattractive / suburban-tract houses!
      if (classifyArchitecturalTaste(pseudo).bucket !== 'loved') return false;
      if (hasCustomFilters && !homeMatchesUnifiedFilters(h, { ...tasteFilters, allHomes: !tasteFilters.forSale && !tasteFilters.allPastSales }, false)) {
        return false;
      }
      return true;
    });

    const scored = candidates.map((h) => {
      const pseudo = toPseudoListing(h);
      const fit = evaluateRobbieFit(pseudo);
      const beauty = evaluateArchitecturalBeauty(pseudo);
      const shared: string[] = [];
      if (h.yearBuilt <= 1945) shared.push(`c. ${h.yearBuilt} historic character`);
      else shared.push('classic shingle / Cape proportions');
      if (h.feats.includes('pool')) shared.push('in-ground pool');
      else if (h.feats.includes('space_pool') || h.lotAcres >= 0.34) shared.push(`${h.lotAcres} ac pool-ready yard`);
      if (h.beautifulStreetName) shared.push(h.beautifulStreetName);
      else if (h.belowSC) shared.push('below S. Country Rd');
      if (h.feats.includes('addl_struct')) shared.push('detached structure');

      // Prefer For Sale first, then real MLS-photographed homes with highest Fit + Beauty
      const mlsBonus = h.photoSource === 'mls' ? 14 : 0;
      const saleBonus = h.isForSale ? 25 : h.hasPastSale ? 8 : 0;
      const matchPct = Math.min(98, Math.max(68, Math.round(fit.score * 0.55 + beauty.score10 * 4.4)));
      const rankScore = fit.score + beauty.score10 * 5 + mlsBonus + saleBonus;

      return { home: h, pseudo, fit, beauty, matchPct, rankScore, shared: shared.slice(0, 3) };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    return scored.slice(0, 9);
  }, [catalog, hasCustomFilters, tasteFilters]);

  return (
    <section className="results-band" aria-label="Saved homes and architectural taste">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {/* Refinable Architectural Taste Profile Card */}
        <ScrollReveal style={{ position: 'relative', zIndex: 30 }}>
          <div
            style={{
              padding: 26,
              borderRadius: 'var(--radius)',
              background: '#ffffff',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              position: 'relative',
              zIndex: 30,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}>
                  Architectural Taste Profile
                </span>
                <h2 style={{ fontSize: 24, margin: 0 }}>
                  Classic Shingled New England &amp; Historic Village Character
                </h2>
              </div>

              <button
                type="button"
                className="icon-btn icon-btn--primary"
                onClick={() => onApplyToMap(tasteFilters)}
              >
                <Compass size={14} />
                <span>Apply Taste Profile to Map →</span>
              </button>
            </div>

            {/* Concise Narrative with Key Phrases Bolded & Zero Parenthetical Year/Style Lists */}
            <p
              style={{
                fontSize: 15,
                color: 'var(--ink-2)',
                maxWidth: '78ch',
                lineHeight: 1.62,
                margin: 0,
              }}
            >
              {favorites.length > 0 ? (
                <>
                  Across your{' '}
                  <strong style={{ color: 'var(--ink)' }}>
                    {favorites.length} saved {favorites.length === 1 ? 'home' : 'homes'}
                  </strong>
                  , you gravitate toward{' '}
                  <strong style={{ color: 'var(--ink)' }}>
                    steep-pitched shingled Capes and pre-war Village residences
                  </strong>{' '}
                  with{' '}
                  <strong style={{ color: 'var(--ink)' }}>strong indoor-outdoor flow</strong> —
                  avoiding post-war suburban boxes and garage-forward facades. Your target profile
                  centers on <strong style={{ color: 'var(--ink)' }}>{profileStats.areasText}</strong>{' '}
                  (~<strong style={{ color: 'var(--ink)' }}>{profileStats.medSqft.toLocaleString()} sq ft</strong>{' '}
                  on <strong style={{ color: 'var(--ink)' }}>{profileStats.medAcres} acres</strong>
                  {profileStats.pricePhrase ? (
                    <>
                      , <strong style={{ color: 'var(--ink)' }}>{profileStats.pricePhrase}</strong>
                    </>
                  ) : null}
                  ), defined by <strong style={{ color: 'var(--ink)' }}>{profileStats.traitsText}</strong>.
                </>
              ) : (
                <>
                  Tuned for{' '}
                  <strong style={{ color: 'var(--ink)' }}>
                    classic weathered cedar-shingle Capes and historic Bellport Village homes
                  </strong>{' '}
                  in <strong style={{ color: 'var(--ink)' }}>{profileStats.areasText}</strong>
                  {profileStats.pricePhrase ? (
                    <>
                      {' '}
                      (<strong style={{ color: 'var(--ink)' }}>{profileStats.pricePhrase}</strong>)
                    </>
                  ) : null}
                  , prioritizing <strong style={{ color: 'var(--ink)' }}>{profileStats.traitsText}</strong>.
                  Refine any criterion below or heart (<strong style={{ color: 'var(--ink)' }}>♥</strong>)
                  homes to personalize further.
                </>
              )}
            </p>

            {/* Full Interactive Dropdowns, Checkable Feature Buttons & Persistent Ideal Search Notes */}
            <div
              style={{
                paddingTop: 12,
                borderTop: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Refine Your Taste Profile Criteria (Price, Size, Lot, Streets, Area &amp; Features)
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: '#188038',
                  }}
                >
                  ✓ Auto-saved automatically
                </span>
              </div>
              <UnifiedFilterBar
                filters={tasteFilters}
                onChange={onChangeTasteFilters}
                context="map"
              />
              <div style={{ marginTop: 4 }}>
                <label
                  htmlFor="ideal-search-notes"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    marginBottom: 5,
                  }}
                >
                  Ideal Search Notes &amp; Priorities
                </label>
                <textarea
                  id="ideal-search-notes"
                  rows={2}
                  value={idealSearchNotes}
                  onChange={(e) => onChangeIdealSearchNotes(e.target.value)}
                  placeholder="Write anything else about your ideal Bellport house (e.g., weathered cedar shingles, heated pool or sunny yard for one, detached studio/pool house, quiet lane south of Main St)..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line-strong)',
                    background: '#ffffff',
                    color: 'var(--ink)',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Saved Favorites Grid */}
        <ScrollReveal delayMs={60}>
          <div>
            <h2 style={{ fontSize: 22, marginBottom: 14 }}>
              Saved Homes ({favorites.length})
            </h2>

            {favorites.length === 0 ? (
              <div className="empty-state">
                <p style={{ color: 'var(--ink-2)', margin: 0 }}>
                  Click the heart (♥) button on any home card or map listing to save it here.
                </p>
              </div>
            ) : (
              <div className="listing-grid">
                {favorites.map((h) => {
                  const pseudo = toPseudoListing(h);
                  const ppsf = h.sqft > 0 ? Math.round(h.price / h.sqft) : 0;
                  const deal = evaluateGoodDeal(pseudo, allListings);
                  const fit = evaluateRobbieFit(pseudo);
                  const beauty = evaluateArchitecturalBeauty(pseudo);

                  return (
                    <article key={h.parcelId} className="listing-card">
                      <div
                        className="listing-card__media"
                        onClick={() => onOpenListing(h.parcelId)}
                      >
                        <PropertyIllustration
                          archetype={h.archetype}
                          address={h.address}
                          styleName={h.style}
                          photoUrl={h.photoUrl}
                          photos={h.photos}
                        />
                        <div className="listing-card__badges">
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <RobbieFitBadge listing={pseudo} fit={fit} compact />
                            <span
                              className="badge"
                              style={{ background: 'rgba(255,255,255,0.94)', color: 'var(--ink)' }}
                            >
                              {h.area}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="status-dot-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(h.parcelId);
                            }}
                            aria-label={`Remove ${h.address} from saved`}
                          >
                            <Heart size={14} fill="var(--g-red)" color="var(--g-red)" />
                            <span>Saved</span>
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
                            onClick={() => onOpenListing(h.parcelId)}
                          >
                            {h.address}
                          </h3>
                          <div className="listing-card__sub">
                            <strong>{h.style}</strong>
                          </div>
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

                        <button
                          type="button"
                          className="show-on-map-btn show-on-map-btn--full"
                          onClick={() => onShowOnMap(h.parcelId)}
                        >
                          <MapPin size={13} />
                          <span>Show on Map</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollReveal>

        {/* Unsaved Recommendations Matching Your Architectural DNA (With Photos & Market Status!) */}
        {recommendations.length > 0 && (
          <ScrollReveal delayMs={90}>
            <div>
              <span className="eyebrow" style={{ marginBottom: 2 }}>
                Discovery
              </span>
              <h2 style={{ fontSize: 22, marginBottom: 4 }}>
                Other Homes Matching Your Architectural DNA
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 16 }}>
                Unsaved Bellport Village homes aligned with your architectural taste and profile
                settings — prioritizing active listings and MLS-photographed residences.
              </p>

              <div className="listing-grid">
                {recommendations.map(({ home: h, pseudo, fit, beauty, matchPct, shared }) => {
                  const ppsf = h.sqft > 0 ? Math.round(h.price / h.sqft) : 0;
                  const deal = evaluateGoodDeal(pseudo, allListings);

                  return (
                    <article key={h.parcelId} className="listing-card">
                      <div
                        className="listing-card__media"
                        onClick={() => onOpenListing(h.parcelId)}
                      >
                        <PropertyIllustration
                          archetype={h.archetype}
                          address={h.address}
                          styleName={h.style}
                          photoUrl={h.photoUrl}
                          photos={h.photos}
                        />

                        <div className="listing-card__badges">
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <span
                              className="badge"
                              style={{
                                background: '#e8f0fe',
                                color: '#174ea6',
                                borderColor: 'rgba(26,115,232,0.28)',
                              }}
                            >
                              {matchPct}% Taste Match
                            </span>
                            <RobbieFitBadge listing={pseudo} fit={fit} compact />
                          </div>

                          <div style={{ display: 'flex', gap: 5, pointerEvents: 'auto' }}>
                            <button
                              type="button"
                              className="status-dot-btn"
                              title="Remove from results"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleHidden(h.parcelId);
                              }}
                              aria-label={`Remove ${h.address} from results`}
                              style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                            >
                              <ThumbsDown size={14} color="var(--ink-2)" />
                            </button>
                            <button
                              type="button"
                              className="status-dot-btn"
                              title="Save favorite"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(h.parcelId);
                              }}
                              aria-label={`Save ${h.address}`}
                              style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                            >
                              <Heart size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Market Status Badge (For Sale / Sold YYYY / Off-Market) */}
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
                                ? 'rgba(32,33,36,0.84)'
                                : 'rgba(255,255,255,0.94)',
                            color: h.isForSale
                              ? '#124d2c'
                              : h.hasPastSale
                                ? '#ffffff'
                                : 'var(--ink)',
                            border: 'none',
                          }}
                        >
                          {h.isForSale
                            ? 'For Sale'
                            : h.hasPastSale
                              ? `Sold ${h.soldYear ?? ''}`
                              : 'Off-Market · Est. Value'}
                        </span>
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
                            onClick={() => onOpenListing(h.parcelId)}
                          >
                            {h.address}
                          </h3>
                          <div className="listing-card__sub">
                            <strong>{h.style}</strong> · {h.area}
                          </div>
                        </div>

                        {shared.length > 0 && (
                          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>
                            Matches: <strong style={{ color: 'var(--ink)' }}>{shared.join(' · ')}</strong>
                          </p>
                        )}

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

                        <button
                          type="button"
                          className="show-on-map-btn show-on-map-btn--full"
                          onClick={() => onShowOnMap(h.parcelId)}
                        >
                          <MapPin size={13} />
                          <span>Show on Map</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Discreet Passed / Hidden Homes Restore Bar */}
        {hiddenHomes.length > 0 && (
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                Removed from Results ({hiddenHomes.length})
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                Still clickable on the map · Click any address to restore
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hiddenHomes.map((hh) => (
                <button
                  key={hh.parcelId}
                  type="button"
                  className="icon-btn"
                  style={{ fontSize: 12, height: 30, padding: '0 10px' }}
                  onClick={() => onToggleHidden(hh.parcelId)}
                  title="Restore to search results"
                >
                  <RotateCcw size={12} />
                  <span>{hh.address}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
