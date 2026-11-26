import { createContext, useContext } from 'react';
import { GoogleGenAI } from '@google/genai';
import { median } from 'd3-array';
import type { HistoricalSaleRecord, Listing } from '../types';
import { evaluateGoodDeal } from './intelligence';
import { detectQuestionQuery, parseNaturalLanguageQuery } from './nlSearch';
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

export interface VillageQaAnswer {
  headline: string;
  bullets: string[];
  parameterPills: string[];
  stats: QaStatTile[];
  homeLinks: QaHomeLink[];
  groundingDigest: string;
}

export interface VillageQaContextValue {
  catalog: UnifiedHome[];
  salesHistory: HistoricalSaleRecord[];
  allListings: Listing[];
  tasteFilters: UnifiedFilters;
  activeFilters: UnifiedFilters;
  idealSearchNotes: string;
  geminiApiKey?: string;
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
  const feats = Array.from(
    new Set([...tasteFilters.feats, ...currentFilters.feats, ...tasteNl.feats, ...nl.feats])
  );
  const poolPref = nl.poolMode ?? tasteNl.poolMode;
  if (poolPref === 'pool_or_room') {
    if (!feats.includes('pool')) feats.push('pool');
    if (!feats.includes('space_pool')) feats.push('space_pool');
  } else if (poolPref === 'pool_only' && !feats.includes('pool')) {
    feats.push('pool');
  } else if (poolPref === 'room_only' && !feats.includes('space_pool')) {
    feats.push('space_pool');
  }

  const minPrice =
    currentFilters.minPrice ?? nl.minPrice ?? tasteFilters.minPrice ?? tasteNl.minPrice;
  const maxPrice =
    currentFilters.maxPrice ?? nl.maxPrice ?? tasteFilters.maxPrice ?? tasteNl.maxPrice;
  const minBeds =
    currentFilters.minBeds ?? nl.minBeds ?? tasteFilters.minBeds ?? tasteNl.minBeds;
  const maxBeds =
    currentFilters.maxBeds ?? nl.maxBeds ?? tasteFilters.maxBeds ?? tasteNl.maxBeds;
  const minBaths =
    currentFilters.minBaths ?? nl.minBaths ?? tasteFilters.minBaths ?? tasteNl.minBaths;
  const maxBaths = currentFilters.maxBaths ?? tasteFilters.maxBaths;
  const minSqft =
    currentFilters.minSqft ?? nl.minSqft ?? tasteFilters.minSqft ?? tasteNl.minSqft;
  const maxSqft = currentFilters.maxSqft ?? tasteFilters.maxSqft;
  const minLot = currentFilters.minLot ?? nl.minLot ?? tasteFilters.minLot ?? tasteNl.minLot;
  const maxLot = currentFilters.maxLot ?? tasteFilters.maxLot;
  const belowSC =
    currentFilters.belowSC || nl.belowSC || tasteFilters.belowSC || tasteNl.belowSC;
  const beautifulStreets = Array.from(
    new Set([...tasteFilters.beautifulStreets, ...currentFilters.beautifulStreets])
  );
  const beautifulStreetsOnly =
    currentFilters.beautifulStreetsOnly ||
    nl.beautifulStreetsOnly ||
    tasteFilters.beautifulStreetsOnly ||
    tasteNl.beautifulStreetsOnly ||
    beautifulStreets.length > 0;
  const areas = Array.from(new Set([...tasteFilters.areas, ...currentFilters.areas]));
  const robbieFit =
    currentFilters.robbieFit || nl.robbieFit || tasteFilters.robbieFit || tasteNl.robbieFit || '';
  const valuation =
    currentFilters.valuation || nl.valuation || tasteFilters.valuation || tasteNl.valuation || '';

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

export function answerVillageQuestion(
  rawQuery: string,
  ctx: VillageQaContextValue,
  localFilters: UnifiedFilters
): VillageQaAnswer | null {
  const q = rawQuery.trim();
  if (!detectQuestionQuery(q)) return null;

  const s = q.toLowerCase();
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
    // Default target profile when no custom dropdowns are set yet:
    // Classic Shingled / Historic Village character (Good/Great/Perfect Fit), 3+ bd, 2+ ba, pool-ready, <= $3M
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

  // Helper for annual sales stats (2024, 2025 full calendar years + 2026 YTD)
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

    const digest = `Question: ${q}\nAnnual Sales: 2024=${salesByYear[0].total}, 2025=${salesByYear[1].total}, 2026YTD=${salesByYear[2].total} (avg ${fullYrAvgTotal}/yr out of ${catalog.length} Village homes). Matching user parameters (${paramPills.join(', ')}): 2024=${salesByYear[0].matched}, 2025=${salesByYear[1].matched}, 2026YTD=${salesByYear[2].matched} (avg ${fullYrAvgMatch}/yr, ${matchSharePct}%). Loved architecture subset: ${fullYrAvgLoved}/yr. Active matching today: ${activeMatching.length}/${activeHomes.length}. Notes: ${idealSearchNotes}`;

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
      groundingDigest: digest,
    };
  }

  // 2. PRICING, MEDIAN / AVERAGE COST, $/SQFT & VALUATION DEALS
  if (/\b(median|average|avg|price|cost|expensive|ppsf|sq\s*ft|square\s*foot|underpriced|good\s+deal|overpriced|value)\b/i.test(s)) {
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

    const digest = `Question: ${q}\nActive listings (${activeHomes.length}): median ${fmtShortDollar(activeMed)} ($${activePpsf}/sqft). 2024-2026 Closed Sales (${recentSales.length}): median ${fmtShortDollar(soldMed)} (Below S. Country Rd median ${fmtShortDollar(southMed)} across ${southSales.length} sales vs North of Main St median ${fmtShortDollar(northMed)} across ${northSales.length} sales). Underpriced Good Deals today: ${goodDeals.length}.`;

    return {
      headline: `Bellport Village median asking price is ${fmtShortDollar(activeMed)} (~$${activePpsf}/ft²), vs. ${fmtShortDollar(soldMed)} median across ${recentSales.length} recent closings (2024–2026).`,
      bullets: [
        `South vs. North of Main St (2024–2026 closings): Homes below South Country Rd closed at a ${fmtShortDollar(southMed)} median (${southSales.length} sales), compared with ${fmtShortDollar(northMed)} north of Main St (${northSales.length} sales).`,
        `Active listings matching your parameters: ${activeMatching.length} of ${activeHomes.length} active homes match (${activeMatching.length > 0 ? `median ${fmtShortDollar(Math.round(median(activeMatching, (x) => x.price) ?? 0))}` : 'none currently listed'}).`,
        `Good Deals (Underpriced): ${goodDeals.length} active Village ${goodDeals.length === 1 ? 'listing trades' : 'listings trade'} meaningfully below our Village comp benchmark.`,
      ],
      parameterPills: paramPills,
      stats: [
        { label: 'Active Median', value: fmtShortDollar(activeMed), sub: `${activeHomes.length} For Sale` },
        { label: 'Closed Median', value: fmtShortDollar(soldMed), sub: '2024–2026 sales' },
        { label: 'Below S. Country', value: fmtShortDollar(southMed), sub: `vs ${fmtShortDollar(northMed)} North` },
        { label: 'Good Deals Now', value: String(goodDeals.length), sub: 'Underpriced active' },
      ],
      homeLinks: (goodDeals.length > 0 ? goodDeals.map((g) => g.h) : activeMatching)
        .slice(0, 5)
        .map((h) => ({
          parcelId: h.parcelId,
          address: h.address,
          badge: `${fmtShortDollar(h.price)} · ${h.beds}bd`,
        })),
      groundingDigest: digest,
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

  const digest = `Question: ${q}\nTotal Village residential homes: ${catalog.length}. Matching user parameters across all Village homes: ${allMatchingVillage.length} (${activeMatching.length} currently For Sale). Existing pools: ${poolCount} (${Math.round((poolCount / catalog.length) * 100)}%), additional pool-ready lots: ${roomPoolCount}. Second-home/absentee owners: ${secondHomeCount} (${Math.round((secondHomeCount / catalog.length) * 100)}%). ★ Perfect Fit (all 5 criteria met): ${perfectHomes.length} homes; Great Fit: ${greatHomes.length} homes.`;

  return {
    headline: `Across all ${catalog.length.toLocaleString()} Incorporated Bellport Village homes, ${allMatchingVillage.length.toLocaleString()} (${Math.round((allMatchingVillage.length / catalog.length) * 100)}%) match your search parameters — with ${activeMatching.length} currently for sale.`,
    bullets: [
      `Pool & yard scarcity: ${poolCount} Village homes (${Math.round((poolCount / catalog.length) * 100)}%) already have an in-ground pool, and another ${roomPoolCount} have pool-ready grounds (0.31+ ac).`,
      `Architectural Fit breakdown: ${perfectHomes.length} Village homes earn ★ Perfect Fit (meeting all 5 criteria including a detached barn/pool house/studio), and ${greatHomes.length} earn Great Fit.`,
      `Ownership mix: ${secondHomeCount} homes (${Math.round((secondHomeCount / catalog.length) * 100)}%) mail property taxes to a second-home / absentee address outside Bellport, while ${catalog.length - secondHomeCount} are full-time local residences.`,
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
    groundingDigest: digest,
  };
}

export async function fetchLiveGeminiEnhancement(
  question: string,
  groundingDigest: string,
  geminiApiKey?: string
): Promise<string | null> {
  if (!geminiApiKey?.trim()) return null;
  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() });
    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are Bellport Watch's Village Intelligence advisor helping Robbie find a family vacation home strictly inside Incorporated Bellport Village, NY.
Answer the user's question concisely (2–4 crisp sentences max, plain text, zero markdown headers) using ONLY these verified Bellport Village statistics:
${groundingDigest}

User question: "${question}"`,
    });
    return (resp.text ?? '').trim() || null;
  } catch {
    return null;
  }
}
