import { createContext, useContext } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { median } from 'd3-array';
import type { HistoricalSaleRecord, Listing } from '../types';
import { evaluateGoodDeal } from './intelligence';
import { detectQuestionQuery, OPEN_WORLD_TOPIC_RX, parseNaturalLanguageQuery } from './nlSearch';
import { classifyArchitecturalTaste, getOwnerAndAirbnbProfile } from './ownerAndAirbnb';
import { evaluateRobbieFit } from './robbieFit';
import {
  BEAUTIFUL_STREET_OPTIONS,
  DESIGN_FEATURE_LABELS,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  INITIAL_UNIFIED_FILTERS,
  toPseudoListing,
  type UnifiedFilters,
  type UnifiedHome,
} from './unifiedCatalog';

export interface QaStatTile {
  label: string;
  value: string;
  sub?: string;
}

export interface QaHomeLink {
  parcelId: string;
  address: string;
  badge: string;
}

export interface QaWebSource {
  title: string;
  uri: string;
}

export interface QaChatTurn {
  role: 'user' | 'model';
  text: string;
  webSources?: QaWebSource[];
  mentionedHomes?: QaHomeLink[];
  usedWebSearch?: boolean;
}

export interface VillageQaAnswer {
  headline: string;
  bullets: string[];
  parameterPills: string[];
  stats: QaStatTile[];
  homeLinks: QaHomeLink[];
  groundingDigest: string;
  /** True when the question requires open-world reasoning / web knowledge beyond local parcel & sales tables */
  isOffDatabase: boolean;
}

export interface VillageQaContextValue {
  catalog: UnifiedHome[];
  salesHistory: HistoricalSaleRecord[];
  allListings: Listing[];
  tasteFilters: UnifiedFilters;
  activeFilters: UnifiedFilters;
  idealSearchNotes: string;
  geminiApiKey?: string;
  geminiPlan?: import('./geminiSearchPlanner').GeminiSearchPlan | null;
  onSaveGeminiKey?: (key: string) => void;
  onOpenHome: (parcelId: string) => void;
  onOpenSavedTab?: () => void;
}

export const VillageQaContext = createContext<VillageQaContextValue | null>(null);

export const useVillageQa = (): VillageQaContextValue | null => useContext(VillageQaContext);

function describeMergedParameters(
  merged: UnifiedFilters,
  hasExplicit: boolean,
  requireLovedArch: boolean
): string[] {
  if (!hasExplicit) {
    return [
      'Classic Shingled / Pre-War Architecture',
      'Pool or Pool-Ready Yard',
      '3+ Beds · 2+ Baths',
      'Up to $3M',
    ];
  }

  const pills: string[] = [];
  if (merged.minPrice !== null && merged.maxPrice !== null) {
    pills.push(`${fmtShortDollar(merged.minPrice)}–${fmtShortDollar(merged.maxPrice)}`);
  } else if (merged.maxPrice !== null) {
    pills.push(`≤ ${fmtShortDollar(merged.maxPrice)}`);
  } else if (merged.minPrice !== null) {
    pills.push(`${fmtShortDollar(merged.minPrice)}+`);
  }

  if (merged.minBeds !== null) pills.push(`${merged.minBeds}+ Beds`);
  if (merged.minBaths !== null) pills.push(`${merged.minBaths}+ Baths`);
  if (merged.minSqft !== null) pills.push(`${merged.minSqft.toLocaleString()}+ ft²`);
  if (merged.minLot !== null) pills.push(`${merged.minLot}+ ac`);
  if (merged.belowSC) pills.push('Below S. Country Rd');
  if (merged.beautifulStreets.length > 0) {
    const names = merged.beautifulStreets
      .map((id): string | undefined => BEAUTIFUL_STREET_OPTIONS.find((s) => s.id === id)?.label)
      .filter((x): x is string => Boolean(x));
    if (names.length > 0) pills.push(names.slice(0, 2).join(', '));
  } else if (merged.beautifulStreetsOnly) {
    pills.push('Beautiful Streets');
  }
  if (merged.areas.length > 0) pills.push(merged.areas.join(', '));

  const hasP = merged.feats.includes('pool');
  const hasS = merged.feats.includes('space_pool');
  if (hasP && hasS) pills.push('Pool or Room for Pool');
  else if (hasP) pills.push('Current Pool');
  else if (hasS) pills.push('Room for Pool');

  for (const fk of merged.feats) {
    if (fk === 'pool' || fk === 'space_pool') continue;
    pills.push(DESIGN_FEATURE_LABELS[fk] ?? fk);
  }
  if (merged.robbieFit === 'perfect') pills.push('★ Perfect Fit');
  else if (merged.robbieFit === 'great_plus') pills.push('Great+ Fit');
  else if (merged.robbieFit === 'good_plus') pills.push('Good+ Fit');
  else if (requireLovedArch) pills.push('Excludes High-Ranch / Tract Boxes');

  return pills.length > 0 ? pills : ['All Incorporated Bellport Village Homes'];
}

export function buildMergedUserParameters(
  currentFilters: UnifiedFilters,
  tasteFilters: UnifiedFilters,
  idealSearchNotes = ''
): {
  merged: UnifiedFilters;
  hasExplicit: boolean;
} {
  const nl = parseNaturalLanguageQuery(currentFilters.nlQuery);
  const tasteNl = parseNaturalLanguageQuery(`${tasteFilters.nlQuery} ${idealSearchNotes}`);
  const nlStruct = nl.isAdvisoryOnly ? null : nl;

  const feats = Array.from(
    new Set([
      ...tasteFilters.feats,
      ...currentFilters.feats,
      ...tasteNl.feats,
      ...(nlStruct ? nlStruct.feats : []),
    ])
  );
  const poolPref = nlStruct?.poolMode ?? tasteNl.poolMode;
  if (poolPref === 'pool_or_room') {
    if (!feats.includes('pool')) feats.push('pool');
    if (!feats.includes('space_pool')) feats.push('space_pool');
  } else if (poolPref === 'pool_only' && !feats.includes('pool')) {
    feats.push('pool');
  } else if (poolPref === 'room_only' && !feats.includes('space_pool')) {
    feats.push('space_pool');
  }

  const minPrice =
    currentFilters.minPrice ??
    nlStruct?.minPrice ??
    tasteFilters.minPrice ??
    tasteNl.minPrice;
  const maxPrice =
    currentFilters.maxPrice ??
    nlStruct?.maxPrice ??
    tasteFilters.maxPrice ??
    tasteNl.maxPrice;
  const minBeds =
    currentFilters.minBeds ?? nlStruct?.minBeds ?? tasteFilters.minBeds ?? tasteNl.minBeds;
  const maxBeds =
    currentFilters.maxBeds ?? nlStruct?.maxBeds ?? tasteFilters.maxBeds ?? tasteNl.maxBeds;
  const minBaths =
    currentFilters.minBaths ?? nlStruct?.minBaths ?? tasteFilters.minBaths ?? tasteNl.minBaths;
  const maxBaths = currentFilters.maxBaths ?? tasteFilters.maxBaths;
  const minSqft =
    currentFilters.minSqft ?? nlStruct?.minSqft ?? tasteFilters.minSqft ?? tasteNl.minSqft;
  const maxSqft = currentFilters.maxSqft ?? tasteFilters.maxSqft;
  const minLot =
    currentFilters.minLot ?? nlStruct?.minLot ?? tasteFilters.minLot ?? tasteNl.minLot;
  const maxLot = currentFilters.maxLot ?? tasteFilters.maxLot;
  const belowSC =
    currentFilters.belowSC ||
    Boolean(nlStruct?.belowSC) ||
    tasteFilters.belowSC ||
    tasteNl.belowSC;
  const beautifulStreets = Array.from(
    new Set([...tasteFilters.beautifulStreets, ...currentFilters.beautifulStreets])
  );
  const beautifulStreetsOnly =
    currentFilters.beautifulStreetsOnly ||
    Boolean(nlStruct?.beautifulStreetsOnly) ||
    tasteFilters.beautifulStreetsOnly ||
    tasteNl.beautifulStreetsOnly ||
    beautifulStreets.length > 0;
  const areas = Array.from(new Set([...tasteFilters.areas, ...currentFilters.areas]));
  const robbieFit =
    currentFilters.robbieFit ||
    nlStruct?.robbieFit ||
    tasteFilters.robbieFit ||
    tasteNl.robbieFit ||
    '';
  const valuation =
    currentFilters.valuation ||
    nlStruct?.valuation ||
    tasteFilters.valuation ||
    tasteNl.valuation ||
    '';

  const hasExplicit =
    minPrice !== null ||
    maxPrice !== null ||
    minBeds !== null ||
    maxBeds !== null ||
    minBaths !== null ||
    maxBaths !== null ||
    minSqft !== null ||
    maxSqft !== null ||
    minLot !== null ||
    maxLot !== null ||
    belowSC ||
    beautifulStreetsOnly ||
    areas.length > 0 ||
    feats.length > 0 ||
    Boolean(robbieFit) ||
    Boolean(valuation);

  return {
    merged: {
      ...INITIAL_UNIFIED_FILTERS,
      allHomes: true,
      minPrice,
      maxPrice,
      minBeds,
      maxBeds,
      minBaths,
      maxBaths,
      minSqft,
      maxSqft,
      minLot,
      maxLot,
      belowSC,
      beautifulStreetsOnly,
      beautifulStreets,
      areas,
      feats,
      robbieFit,
      valuation,
    },
    hasExplicit,
  };
}

export function isOffDatabaseComplexQuery(rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return false;
  if (OPEN_WORLD_TOPIC_RX.test(q)) return true;
  if (
    /\b(?:why|should\s+we|should\s+i|would\s+you|recommend|advice|advise|strategy|negotiate|offer|bid|inspection|architectural\s+digest|lifestyle|vibe|neighbors?|community|ferry|beach|clubs?|pros|cons|tradeoffs?|worth|if\s+we|what\s+if)\b/i.test(
      q
    )
  ) {
    return true;
  }
  // If it's a question that does NOT ask about simple sales counts, medians, or parcel counts, treat as complex open-ended
  const isLocalDbStatQuery =
    /\b(?:how\s+many\s+(?:homes?|houses?|listings?|pools?|second\s+homes?)|sell\s+per\s+year|turnover|median\s+price|average\s+price|good\s+deals?|underpriced)\b/i.test(
      q
    );
  return detectQuestionQuery(q) && !isLocalDbStatQuery;
}

/**
 * Builds a rich, token-efficient Bellport Village + Buyer Profile briefing
 * so Live Gemini can combine open-web reasoning with exact Bellport parcel, listing, and comp facts.
 */
export function buildComprehensiveBellportContext(
  ctx: VillageQaContextValue,
  localFilters: UnifiedFilters
): string {
  const { catalog, salesHistory, allListings, tasteFilters, idealSearchNotes } = ctx;
  const { merged, hasExplicit } = buildMergedUserParameters(
    localFilters,
    tasteFilters,
    idealSearchNotes
  );
  const paramPills = describeMergedParameters(merged, hasExplicit, false);

  const activeHomes = catalog.filter((h) => h.isForSale && !h.isHidden);
  const savedHomes = catalog.filter((h) => h.isFavorite);
  const hiddenCount = catalog.filter((h) => h.isHidden).length;

  const sales2024 = salesHistory.filter((r) => r.date.startsWith('2024'));
  const sales2025 = salesHistory.filter((r) => r.date.startsWith('2025'));
  const sales2026 = salesHistory.filter((r) => r.date.startsWith('2026'));
  const recentSales = [...sales2026, ...sales2025, ...sales2024];
  const southMed = Math.round(
    median(
      recentSales.filter((r) => r.belowSC),
      (r) => r.price
    ) ?? 0
  );
  const northMed = Math.round(
    median(
      recentSales.filter((r) => !r.belowSC),
      (r) => r.price
    ) ?? 0
  );
  const poolCount = catalog.filter((h) => h.feats.includes('pool')).length;
  const roomPoolCount = catalog.filter(
    (h) => !h.feats.includes('pool') && (h.feats.includes('space_pool') || h.lotAcres >= 0.31)
  ).length;

  const activeLines = activeHomes
    .map((h) => {
      const pseudo = toPseudoListing(h);
      const fit = evaluateRobbieFit(pseudo);
      const deal = evaluateGoodDeal(pseudo, allListings);
      return `- ${h.address} (${h.belowSC ? 'South of SCR' : 'North of SCR'}): ${fmtShortDollar(h.price)}, ${h.beds}bd/${h.baths}ba, ${h.sqft}sf, ${h.lotAcres.toFixed(2)}ac, yr${h.yearBuilt}, ${h.style}, Fit=${fit.tier ?? 'none'}, ${deal.status}`;
    })
    .join('\n');

  const compLines = [...salesHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map(
      (r) =>
        `- ${r.address} (${r.belowSC ? 'South' : 'North'}): Sold ${r.date} ${fmtShortDollar(r.price)}, ${r.beds ?? '?'}bd, ${r.acres ?? '?'}ac${r.pool ? ', Pool' : ''}`
    )
    .join('\n');

  const savedLines =
    savedHomes.length > 0
      ? savedHomes
          .slice(0, 6)
          .map((h) => `${h.address} (${fmtShortDollar(h.price)})`)
          .join('; ')
      : 'None yet';

  return [
    `BUYER PROFILE (Incorporated Bellport Village NY 11713 ONLY, 1,058 homes; exclude E. Patchogue / Brookhaven / N. Bellport):`,
    `Criteria: ${paramPills.join(' · ')} | Notes: ${idealSearchNotes.trim() || 'Shingled Cape/Greek Revival/historic lane; pool or room for pool; avoid High Ranches & tract boxes.'} | Saved: ${savedLines} (${hiddenCount} hidden)`,
    `VILLAGE STATS: ~45 sales/yr (44 in '24, 46 in '25, 32 in '26 YTD). Median sold: ${fmtShortDollar(southMed)} Below S Country Rd vs ${fmtShortDollar(northMed)} North. Pools: ${poolCount} existing + ${roomPoolCount} pool-ready.`,
    `ACTIVE FOR SALE (${activeHomes.length}):\n${activeLines}`,
    `RECENT SOLD COMPS:\n${compLines}`,
  ].join('\n');
}

export function extractMentionedHomes(text: string, catalog: UnifiedHome[]): QaHomeLink[] {
  if (!text.trim() || catalog.length === 0) return [];
  const low = text
    .toLowerCase()
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bpoint\b/g, 'pt')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n');

  const matches: QaHomeLink[] = [];
  const seen = new Set<string>();

  for (const h of catalog) {
    if (seen.has(h.parcelId)) continue;
    const normAddr = h.address
      .toLowerCase()
      .replace(/,.*$/, '')
      .replace(/\broad\b/g, 'rd')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\bpoint\b/g, 'pt')
      .replace(/\bsouth\b/g, 's')
      .replace(/\bnorth\b/g, 'n')
      .trim();
    if (normAddr.length < 5 || !/^\d+\s+/.test(normAddr)) continue;
    const escaped = normAddr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(low)) {
      seen.add(h.parcelId);
      matches.push({
        parcelId: h.parcelId,
        address: h.address,
        badge: `${h.isForSale ? 'For Sale' : h.hasPastSale ? 'Sold' : 'Village Home'} · ${fmtShortDollar(h.price)}`,
      });
      if (matches.length >= 6) break;
    }
  }

  return matches;
}

export function answerVillageQuestion(
  rawQuery: string,
  ctx: VillageQaContextValue,
  localFilters: UnifiedFilters,
  forceOpen = false
): VillageQaAnswer | null {
  const q = rawQuery.trim();
  if (!q) return null;
  if (!forceOpen && !detectQuestionQuery(q)) return null;

  const s = q.toLowerCase();
  const offDb = isOffDatabaseComplexQuery(q);
  const { catalog, salesHistory, allListings, tasteFilters, idealSearchNotes } = ctx;
  const homeByPid = new Map(catalog.map((h) => [h.parcelId, h]));

  const { merged, hasExplicit } = buildMergedUserParameters(
    localFilters,
    tasteFilters,
    idealSearchNotes
  );
  const paramPills = describeMergedParameters(merged, hasExplicit, false);

  const matchesUserSpec = (h: UnifiedHome, salePriceOverride?: number): boolean => {
    const candidate: UnifiedHome =
      salePriceOverride !== undefined ? { ...h, price: salePriceOverride } : h;

    if (hasExplicit) {
      return homeMatchesUnifiedFilters(candidate, merged, false);
    }
    const pseudo = toPseudoListing(candidate);
    const fit = evaluateRobbieFit(pseudo);
    const poolReady =
      candidate.feats.includes('pool') ||
      candidate.feats.includes('space_pool') ||
      candidate.lotAcres >= 0.31;
    return (
      Boolean(fit.tier) &&
      poolReady &&
      candidate.beds >= 3 &&
      candidate.baths >= 2 &&
      candidate.price <= 3_000_000
    );
  };

  const years = ['2024', '2025', '2026'] as const;
  const salesByYear = years.map((yr) => {
    const yrSales = salesHistory.filter((rec) => rec.date.startsWith(yr));
    const matchedRecs = yrSales.filter((rec) => {
      const h = rec.parcelId ? homeByPid.get(rec.parcelId) : undefined;
      if (!h || h.isHidden) return false;
      return matchesUserSpec(h, rec.price);
    });
    const lovedArchRecs = matchedRecs.filter((rec) => {
      const h = rec.parcelId ? homeByPid.get(rec.parcelId) : undefined;
      if (!h) return false;
      return classifyArchitecturalTaste(toPseudoListing(h)).bucket === 'loved';
    });
    return {
      year: yr,
      total: yrSales.length,
      matched: matchedRecs.length,
      lovedMatched: lovedArchRecs.length,
      matchedRecs,
    };
  });

  const fullYrAvgTotal = Math.round(((salesByYear[0].total + salesByYear[1].total) / 2) * 10) / 10;
  const fullYrAvgMatch =
    Math.round(((salesByYear[0].matched + salesByYear[1].matched) / 2) * 10) / 10;
  const fullYrAvgLoved =
    Math.round(((salesByYear[0].lovedMatched + salesByYear[1].lovedMatched) / 2) * 10) / 10;
  const matchSharePct =
    fullYrAvgTotal > 0 ? Math.round((fullYrAvgMatch / fullYrAvgTotal) * 100) : 0;

  const activeHomes = catalog.filter((h) => h.isForSale && !h.isHidden);
  const activeMatching = activeHomes.filter((h) => matchesUserSpec(h));
  const activeLovedMatching = activeMatching.filter(
    (h) => classifyArchitecturalTaste(toPseudoListing(h)).bucket === 'loved'
  );

  const comprehensiveContext = buildComprehensiveBellportContext(ctx, localFilters);

  // 0. OPEN-ENDED / BEYOND-DATABASE COMPLEX QUESTIONS (taxes, ARB, renovation/pool costs, commute, comparisons, etc.)
  if (
    offDb &&
    !/\b(sell\s+per\s+year|sales\s+per\s+year|how\s+many\s+homes?\s+sell)\b/i.test(s)
  ) {
    const activeMed = Math.round(median(activeHomes, (h) => h.price) ?? 0);
    const links: QaHomeLink[] = (activeMatching.length > 0 ? activeMatching : activeHomes)
      .slice(0, 4)
      .map((h) => ({
        parcelId: h.parcelId,
        address: h.address,
        badge: `For Sale · ${fmtShortDollar(h.price)}`,
      }));

    return {
      headline: `Complex Question: “${q}”`,
      bullets: [
        `This question goes beyond static parcel & deed fields — Live Gemini 3.8 Flash combines open-domain expertise (zoning/ARB rules, tax rates, construction costs, commute, neighborhood comparisons) with all ${catalog.length.toLocaleString()} Bellport Village homes and your search parameters.`,
        `Local Bellport snapshot ready for grounding: ${activeHomes.length} active listings (median ${fmtShortDollar(activeMed)}, ${activeMatching.length} matching your current criteria) and ${salesHistory.length} historical Village closings.`,
      ],
      parameterPills: paramPills,
      stats: [],
      homeLinks: links,
      groundingDigest: comprehensiveContext,
      isOffDatabase: true,
    };
  }

  // 1. ANNUAL SALES VOLUME & PARAMETER FUNNEL QUESTIONS
  if (
    /\b(sell|sells|sold|sales|turnover|per\s+year|each\s+year|annually|how\s+often|come\s+up|hit\s+the\s+market)\b/i.test(
      s
    ) ||
    /\b(meet|match|fit)\s+(?:our|my|the)\b/i.test(s)
  ) {
    const recentMatchedSales = [
      ...salesByYear[2].matchedRecs,
      ...salesByYear[1].matchedRecs,
      ...salesByYear[0].matchedRecs,
    ];
    const medMatchPrice = Math.round(median(recentMatchedSales, (r) => r.price) ?? 0);

    const bullets: string[] = [
      `Village-wide sales pace: ~${Math.round(fullYrAvgTotal)} homes sell per year in Incorporated Bellport Village (${salesByYear[0].total} in 2024 · ${salesByYear[1].total} in 2025 · ${salesByYear[2].total} in 2026 YTD — ~4.3% annual turnover across all ${catalog.length.toLocaleString()} Village homes).`,
      `Meeting your search parameters: ~${fullYrAvgMatch} homes/year (${matchSharePct}% of Village sales) met your criteria (${salesByYear[0].matched} of ${salesByYear[0].total} in 2024 · ${salesByYear[1].matched} of ${salesByYear[1].total} in 2025 · ${salesByYear[2].matched} of ${salesByYear[2].total} in 2026 YTD${medMatchPrice > 0 ? `, median closing ${fmtShortDollar(medMatchPrice)}` : ''}).`,
    ];

    if (hasExplicit && fullYrAvgLoved !== fullYrAvgMatch) {
      bullets.push(
        `Filtering further for classic shingled / pre-war Village architecture (excluding post-war High Ranches & suburban builder Colonials): ~${fullYrAvgLoved} homes/year (${salesByYear[0].lovedMatched} in 2024 · ${salesByYear[1].lovedMatched} in 2025 · ${salesByYear[2].lovedMatched} in 2026 YTD).`
      );
    }

    bullets.push(
      `On the market today: ${activeMatching.length} of ${activeHomes.length} active Village listings currently meet your parameters${hasExplicit && activeLovedMatching.length !== activeMatching.length ? ` (${activeLovedMatching.length} with classic shingled/historic character)` : ''}.`
    );

    const links: QaHomeLink[] = [
      ...activeMatching.slice(0, 3).map((h) => ({
        parcelId: h.parcelId,
        address: h.address,
        badge: `For Sale · ${fmtShortDollar(h.price)}`,
      })),
      ...recentMatchedSales.slice(0, 3).map((r) => ({
        parcelId: r.parcelId ?? '',
        address: r.address,
        badge: `Sold ${r.date.slice(0, 4)} · ${fmtShortDollar(r.price)}`,
      })),
    ].filter((x) => Boolean(x.parcelId));

    return {
      headline: `~${Math.round(fullYrAvgTotal)} homes sell per year in Bellport Village — and ~${fullYrAvgMatch} per year (${matchSharePct}%) meet your search parameters.`,
      bullets,
      parameterPills: paramPills,
      stats: [
        {
          label: 'Village Sales / Yr',
          value: `~${Math.round(fullYrAvgTotal)}`,
          sub: '44 in ’24 · 46 in ’25',
        },
        {
          label: 'Meet Your Criteria',
          value: `~${fullYrAvgMatch} / yr`,
          sub: `${matchSharePct}% of Village sales`,
        },
        {
          label: 'Classic Arch. Subset',
          value: `~${fullYrAvgLoved} / yr`,
          sub: 'Shingled / historic character',
        },
        {
          label: 'For Sale Right Now',
          value: `${activeMatching.length} of ${activeHomes.length}`,
          sub: 'Active Village matches',
        },
      ],
      homeLinks: links.slice(0, 5),
      groundingDigest: comprehensiveContext,
      isOffDatabase: false,
    };
  }

  // 2. PRICING, MEDIAN / AVERAGE COST, $/SQFT & VALUATION DEALS
  if (
    /\b(median|average|avg|price|cost|expensive|ppsf|sq\s*ft|square\s*foot|underpriced|good\s+deal|overpriced|value)\b/i.test(
      s
    )
  ) {
    const activeMed = Math.round(median(activeHomes, (h) => h.price) ?? 0);
    const activePpsf = Math.round(
      median(
        activeHomes.filter((h) => h.sqft > 0),
        (h) => h.price / h.sqft
      ) ?? 0
    );
    const recentSales = salesHistory.filter((r) => r.date >= '2024-01-01');
    const soldMed = Math.round(median(recentSales, (r) => r.price) ?? 0);
    const southSales = recentSales.filter((r) => r.belowSC);
    const northSales = recentSales.filter((r) => !r.belowSC);
    const southMed = Math.round(median(southSales, (r) => r.price) ?? 0);
    const northMed = Math.round(median(northSales, (r) => r.price) ?? 0);

    const goodDeals = activeHomes
      .map((h) => ({ h, deal: evaluateGoodDeal(toPseudoListing(h), allListings) }))
      .filter((x) => x.deal.status === 'underpriced')
      .sort((a, b) => a.deal.diffPct - b.deal.diffPct);

    return {
      headline: `Bellport Village median asking price is ${fmtShortDollar(activeMed)} (~$${activePpsf}/ft²), vs. ${fmtShortDollar(soldMed)} median across ${recentSales.length} recent closings (2024–2026).`,
      bullets: [
        `South vs. North of Main St (2024–2026 closings): Homes below South Country Rd closed at a ${fmtShortDollar(southMed)} median (${southSales.length} sales), compared with ${fmtShortDollar(northMed)} north of Main St (${northSales.length} sales).`,
        `Active listings matching your parameters: ${activeMatching.length} of ${activeHomes.length} active homes match (${activeMatching.length > 0 ? `median ${fmtShortDollar(Math.round(median(activeMatching, (x) => x.price) ?? 0))}` : 'none currently listed'}).`,
        `Good Deals (Underpriced): ${goodDeals.length} active Village ${goodDeals.length === 1 ? 'listing trades' : 'listings trade'} meaningfully below our Village comp benchmark.`,
      ],
      parameterPills: paramPills,
      stats: [
        {
          label: 'Active Median',
          value: fmtShortDollar(activeMed),
          sub: `${activeHomes.length} For Sale`,
        },
        { label: 'Closed Median', value: fmtShortDollar(soldMed), sub: '2024–2026 sales' },
        {
          label: 'Below S. Country',
          value: fmtShortDollar(southMed),
          sub: `vs ${fmtShortDollar(northMed)} North`,
        },
        { label: 'Good Deals Now', value: String(goodDeals.length), sub: 'Underpriced active' },
      ],
      homeLinks: (goodDeals.length > 0 ? goodDeals.map((g) => g.h) : activeMatching)
        .slice(0, 5)
        .map((h) => ({
          parcelId: h.parcelId,
          address: h.address,
          badge: `${fmtShortDollar(h.price)} · ${h.beds}bd`,
        })),
      groundingDigest: comprehensiveContext,
      isOffDatabase: false,
    };
  }

  // 3. POOLS, SECOND HOMES, AIRBNB, STREETS & FIT SCARCITY ACROSS ALL 1,058 VILLAGE HOMES
  const poolCount = catalog.filter((h) => h.feats.includes('pool')).length;
  const roomPoolCount = catalog.filter(
    (h) => !h.feats.includes('pool') && (h.feats.includes('space_pool') || h.lotAcres >= 0.31)
  ).length;
  const secondHomeCount = catalog.filter((h) => {
    const prof = getOwnerAndAirbnbProfile({
      parcelId: h.parcelId,
      owner: h.owner,
      mail: h.mail,
      absentee: h.parcelRef.absentee,
      listing: toPseudoListing(h),
    });
    return prof.residencyStatus === 'second_home';
  }).length;
  const perfectHomes = catalog.filter(
    (h) => !h.isHidden && evaluateRobbieFit(toPseudoListing(h)).tier === 'perfect'
  );
  const greatHomes = catalog.filter(
    (h) => !h.isHidden && evaluateRobbieFit(toPseudoListing(h)).tier === 'great'
  );
  const allMatchingVillage = catalog.filter((h) => !h.isHidden && matchesUserSpec(h));

  return {
    headline: `Across all ${catalog.length.toLocaleString()} Incorporated Bellport Village homes, ${allMatchingVillage.length.toLocaleString()} (${Math.round((allMatchingVillage.length / Math.max(1, catalog.length)) * 100)}%) match your search parameters — with ${activeMatching.length} currently for sale.`,
    bullets: [
      `Pool & yard scarcity: ${poolCount} Village homes (${Math.round((poolCount / Math.max(1, catalog.length)) * 100)}%) already have an in-ground pool, and another ${roomPoolCount} have pool-ready grounds (0.31+ ac).`,
      `Architectural Fit breakdown: ${perfectHomes.length} Village homes earn ★ Perfect Fit (meeting all 5 criteria including a detached barn/pool house/studio), and ${greatHomes.length} earn Great Fit.`,
      `Ownership mix: ${secondHomeCount} homes (${Math.round((secondHomeCount / Math.max(1, catalog.length)) * 100)}%) mail property taxes to a second-home / absentee address outside Bellport, while ${catalog.length - secondHomeCount} are full-time local residences.`,
    ],
    parameterPills: paramPills,
    stats: [
      {
        label: 'Village Matches',
        value: allMatchingVillage.length.toLocaleString(),
        sub: `of ${catalog.length.toLocaleString()} homes`,
      },
      {
        label: 'For Sale Matches',
        value: `${activeMatching.length}`,
        sub: `of ${activeHomes.length} active`,
      },
      {
        label: '★ Perfect / Great Fit',
        value: `${perfectHomes.length} / ${greatHomes.length}`,
        sub: 'All Village parcels',
      },
      {
        label: 'Existing Pools',
        value: `${poolCount}`,
        sub: `+${roomPoolCount} pool-ready`,
      },
    ],
    homeLinks: (activeMatching.length > 0 ? activeMatching : perfectHomes.concat(greatHomes))
      .slice(0, 5)
      .map((h) => ({
        parcelId: h.parcelId,
        address: h.address,
        badge: `${h.isForSale ? 'For Sale' : h.hasPastSale ? 'Sold' : 'Off-Mkt'} · ${fmtShortDollar(h.price)}`,
      })),
    groundingDigest: comprehensiveContext,
    isOffDatabase: false,
  };
}

export interface LiveGeminiResult {
  status: 'ok' | 'needs_key' | 'error';
  text?: string;
  webSources?: QaWebSource[];
  mentionedHomes?: QaHomeLink[];
  usedWebSearch?: boolean;
  errorMessage?: string;
}

const GEMINI_SYSTEM_PROMPT = `You are Bellport Watch’s Senior Real Estate & Architecture Advisor for Robbie’s search strictly inside Incorporated Bellport Village, NY (11713, Town of Brookhaven, Suffolk County).
1. Answer ANY complex or open-ended question — even when NOT in the local database (taxes, Bellport Historic District & ARB rules, gunite pool & renovation costs, I/A OWTS septic, coastal AE/VE flood insurance, LIRR/driving commute, Ho-Hum Beach ferry, Country Club, short-term rental laws, Hamptons comparisons) — while citing real Bellport Village addresses/comps from context when relevant.
2. Be crisp, concrete, and fast to scan: lead immediately with the bottom-line numbers/rules, use short bullets (\`- \`) with \`**bold**\` highlights, never mention "Flood Zone X", and keep answers tight (90–175 words unless asked for more).`;

const responseCache = new Map<string, LiveGeminiResult>();
let stickyFastModel: string | null = null;

function extractWebSourcesFromCandidate(candidate: unknown): QaWebSource[] {
  if (!candidate || typeof candidate !== 'object') return [];
  const gm = (candidate as { groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } })
    .groundingMetadata;
  const chunks = gm?.groundingChunks ?? [];
  const out: QaWebSource[] = [];
  const seen = new Set<string>();
  for (const ch of chunks) {
    const uri = ch.web?.uri?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    let fallbackTitle = 'Web source';
    try {
      fallbackTitle = new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      // keep default
    }
    out.push({
      title: ch.web?.title?.trim() || fallbackTitle,
      uri,
    });
    if (out.length >= 5) break;
  }
  return out;
}

export async function askBellportGemini(params: {
  question: string;
  history?: QaChatTurn[];
  contextBriefing: string;
  catalog: UnifiedHome[];
  geminiApiKey?: string;
  onStreamText?: (partialText: string) => void;
  signal?: AbortSignal;
}): Promise<LiveGeminiResult> {
  const { question, history = [], contextBriefing, catalog, geminiApiKey, onStreamText, signal } =
    params;
  const trimmedQ = question.trim();
  if (!trimmedQ) return { status: 'needs_key' };

  const keyClean = (geminiApiKey ?? '').trim();
  const cacheKey = `${keyClean ? keyClean.slice(-6) : 'srv'}::${history.length}::${trimmedQ}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.status === 'ok') {
    if (cached.text && onStreamText) onStreamText(cached.text);
    return cached;
  }

  // 1. If no browser key is stored, try local backend `/api/ask` first
  if (!keyClean) {
    try {
      const srvResp = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQ,
          history: history.map((h) => ({ role: h.role, text: h.text })),
          contextBriefing,
        }),
        signal,
      });
      if (srvResp.ok) {
        const data = (await srvResp.json()) as {
          ok?: boolean;
          missingKey?: boolean;
          text?: string;
          webSources?: QaWebSource[];
          usedWebSearch?: boolean;
        };
        if (data.ok && data.text) {
          if (onStreamText) onStreamText(data.text);
          const result: LiveGeminiResult = {
            status: 'ok',
            text: data.text,
            webSources: data.webSources ?? [],
            mentionedHomes: extractMentionedHomes(data.text, catalog),
            usedWebSearch: Boolean(data.usedWebSearch),
          };
          responseCache.set(cacheKey, result);
          return result;
        }
        if (data.missingKey) {
          return { status: 'needs_key' };
        }
      }
    } catch {
      // Static host (GitHub Pages) — fall through to needs_key
    }
    return { status: 'needs_key' };
  }

  // 2. Direct Streaming Gemini call with LOW thinking budget for sub-second first token!
  const ai = new GoogleGenAI({ apiKey: keyClean });
  const contents = [
    ...history.map((turn, idx) => ({
      role: turn.role,
      parts: [
        {
          text:
            idx === 0 && turn.role === 'user'
              ? `${contextBriefing}\n\nQuestion: ${turn.text}`
              : turn.text,
        },
      ],
    })),
    {
      role: 'user' as const,
      parts: [
        {
          text: history.length === 0 ? `${contextBriefing}\n\nQuestion: ${trimmedQ}` : trimmedQ,
        },
      ],
    },
  ];

  // Prioritize ultra-low-latency streaming with ThinkingLevel.LOW / MINIMAL (no wasted paid-only tool retries!)
  const defaultOrder: Array<{ model: string; thinking: ThinkingLevel | null }> = [
    { model: 'gemini-3.8-flash', thinking: ThinkingLevel.LOW },
    { model: 'gemini-3.5-flash-lite', thinking: ThinkingLevel.MINIMAL },
    { model: 'gemini-flash-latest', thinking: ThinkingLevel.LOW },
    { model: 'gemini-2.5-flash-lite', thinking: null },
  ];

  const orderedAttempts = stickyFastModel
    ? [
        ...defaultOrder.filter((a) => a.model === stickyFastModel),
        ...defaultOrder.filter((a) => a.model !== stickyFastModel),
      ]
    : defaultOrder;

  let lastErr = '';
  for (const attempt of orderedAttempts) {
    if (signal?.aborted) return { status: 'error', errorMessage: '' };
    try {
      const stream = await ai.models.generateContentStream({
        model: attempt.model,
        contents,
        config: {
          systemInstruction: GEMINI_SYSTEM_PROMPT,
          ...(attempt.thinking ? { thinkingConfig: { thinkingLevel: attempt.thinking } } : {}),
        },
      });

      let accText = '';
      let lastCandidate: unknown = undefined;
      for await (const chunk of stream) {
        if (signal?.aborted) return { status: 'error', errorMessage: '' };
        const piece = chunk.text ?? '';
        if (piece) {
          accText += piece;
          if (onStreamText) onStreamText(accText);
        }
        if (chunk.candidates?.[0]) {
          lastCandidate = chunk.candidates[0];
        }
      }

      const finalText = accText.trim();
      if (finalText) {
        stickyFastModel = attempt.model;
        const webSources = extractWebSourcesFromCandidate(lastCandidate);
        const result: LiveGeminiResult = {
          status: 'ok',
          text: finalText,
          webSources,
          mentionedHomes: extractMentionedHomes(finalText, catalog),
          usedWebSearch: webSources.length > 0,
        };
        responseCache.set(cacheKey, result);
        return result;
      }
    } catch (err) {
      if (signal?.aborted) return { status: 'error', errorMessage: '' };
      lastErr = err instanceof Error ? err.message : String(err);
      if (/API_KEY_INVALID|invalid api key|API key not valid|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(lastErr)) {
        return {
          status: 'error',
          errorMessage:
            'Google did not accept that API key. Re-copy the full key from Google AI Studio (without spaces or quotes) and try again.',
        };
      }
    }
  }

  return {
    status: 'error',
    errorMessage: lastErr || 'Gemini could not complete that request right now. Please try again.',
  };
}

