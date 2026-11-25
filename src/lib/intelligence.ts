import type {
  BellportMicroArea,
  Listing,
  PricePoint,
  StreetAlertRule,
} from '../types';

export interface DealEvaluation {
  score: number; // 0-100
  tier: 'Strong Value' | 'Fair Ask' | 'Full Premium' | 'Overpriced';
  tone: 'green' | 'blue' | 'yellow' | 'red';
  estimatedFairPrice: number;
  deltaPct: number; // Negative means priced below estimated fair value (good deal)
  reasons: string[];
}

export interface AirbnbEvaluation {
  score: number; // 0-100
  tier: 'Prime Airbnb & Summer' | 'Strong Seasonal' | 'Moderate Offset' | '30-Night Min Only';
  tone: 'green' | 'blue' | 'yellow' | 'red';
  airbnbShortStayLegal: boolean;
  legalBadge: string;
  estNightlyPeak: number;
  estAugustGross: number;
  taxOffsetPct: number;
  notes: string[];
}

export interface ArchitecturalTasteProfile {
  favoriteCount: number;
  headline: string;
  narrative: string;
  brokerBrief: string;
  signatureTraits: Array<{ trait: string; count: number }>;
  medianYear: number;
  medianSqft: number;
  medianAcres: number;
  preferredAreas: string[];
  recommendations: Array<{ listing: Listing; matchPct: number; sharedTraits: string[] }>;
}

export interface TriggeredStreetAlert {
  rule: StreetAlertRule;
  matches: Array<{
    listing: Listing;
    hasPriceCut: boolean;
    dropAmount: number;
  }>;
}

const AREA_BASELINE_PPSF: Record<BellportMicroArea, number> = {
  'Historic Lanes': 815,
  'Country Club & Golf': 720,
  'Village Center': 685,
  'East Lanes & Circuit': 615,
  'Outside Village (11713)': 480,
};

export function getPriceChangeStats(listing: Listing): {
  history: PricePoint[];
  initialPrice: number;
  currentPrice: number;
  totalDropDollar: number;
  totalDropPct: number;
  cutCount: number;
} {
  const fallbackHistory: PricePoint[] = [];
  if (listing.originalPrice && listing.originalPrice !== listing.price) {
    fallbackHistory.push({
      date: listing.listedDate,
      price: listing.originalPrice,
      event: 'Listed',
    });
    fallbackHistory.push({
      date: new Date().toISOString().slice(0, 10),
      price: listing.price,
      event: listing.price < listing.originalPrice ? 'Price Cut' : 'Price Increase',
    });
  } else {
    fallbackHistory.push({
      date: listing.listedDate,
      price: listing.price,
      event: listing.marketStatus === 'sold' ? 'Sold' : 'Listed',
    });
  }

  const rawHistory =
    listing.priceHistory && listing.priceHistory.length > 0
      ? [...listing.priceHistory]
      : fallbackHistory;

  rawHistory.sort((a, b) => a.date.localeCompare(b.date));

  const initialPrice = rawHistory[0]?.price ?? listing.originalPrice ?? listing.price;
  const currentPrice = listing.soldPrice ?? listing.price;
  const totalDropDollar = Math.max(0, initialPrice - currentPrice);
  const totalDropPct =
    initialPrice > 0 ? Number(((totalDropDollar / initialPrice) * 100).toFixed(1)) : 0;
  const cutCount = rawHistory.filter((p) => p.event === 'Price Cut').length;

  return {
    history: rawHistory,
    initialPrice,
    currentPrice,
    totalDropDollar,
    totalDropPct,
    cutCount,
  };
}

export function evaluateGoodDeal(listing: Listing, allListings: Listing[]): DealEvaluation {
  const areaPeers = allListings.filter((l) => l.area === listing.area && l.sqft > 0);
  const peerMedianPpsf =
    areaPeers.length >= 2
      ? areaPeers
          .map((l) => l.price / l.sqft)
          .sort((a, b) => a - b)[Math.floor(areaPeers.length / 2)]
      : AREA_BASELINE_PPSF[listing.area];

  const basePpsf = (AREA_BASELINE_PPSF[listing.area] * 0.6 + peerMedianPpsf * 0.4);
  const effectiveSqft = listing.sqft > 0 ? listing.sqft : 2200;
  let fairValue = effectiveSqft * basePpsf;

  const text = `${listing.description} ${listing.features.join(' ')}`.toLowerCase();
  const reasons: string[] = [];

  // Amenity & parcel adjustments
  const hasPool =
    /gunite\s+pool|heated\s+pool|saltwater\s+pool|\binground\s+pool\b/.test(text) ||
    listing.features.some((f) => f === 'pool' || f.includes('gunite pool'));
  const hasWaterfront = /direct\s+waterfront|bulkhead|135\s+feet|bayfront/.test(text) || listing.archetype === 'bayfront';
  const hasGuestCottage = /guest\s+(?:cottage|house)|carriage\s+barn\s+studio/.test(text);
  const isTurnkey = /renovated|turnkey|chef'?s\s+kitchen|202[2-6]/.test(text);
  const needsWork = /fixer|cosmetic\s+reimagin|needs/.test(text);

  if (hasWaterfront) {
    fairValue += 1_350_000;
    reasons.push('Direct Bellport Bay frontage & bulkhead scarcity');
  }
  if (hasPool) {
    fairValue += 175_000;
    reasons.push('Existing heated pool (~$175k build value)');
  } else if (/pool\s+permit/.test(text)) {
    fairValue += 45_000;
    reasons.push('Pool permits already approved');
  }

  if (hasGuestCottage) {
    fairValue += 185_000;
    reasons.push('Separate guest cottage / carriage studio');
  }

  // Lot size delta vs 0.48-acre Village norm
  const acreDiff = listing.lotAcres - 0.48;
  fairValue += Math.max(-140_000, Math.min(280_000, acreDiff * 360_000));
  if (listing.lotAcres >= 0.7) {
    reasons.push(`Generous ${listing.lotAcres}-acre parcel for the Village`);
  }

  if (isTurnkey) {
    fairValue *= 1.06;
    reasons.push('Turnkey / renovated mechanicals & finishes');
  } else if (needsWork) {
    fairValue *= 0.87;
    reasons.push('Requires cosmetic/renovation capex');
  }

  if (listing.floodZone !== 'X') {
    fairValue *= 0.93;
    reasons.push(`Flood Zone ${listing.floodZone} insurance & elevation check`);
  } else if (listing.inVillage) {
    reasons.push('High-and-dry Flood Zone X inside Village limits');
  }

  if (!listing.inVillage) {
    fairValue *= 0.88;
    reasons.push('Outside Incorporated Village (no Ho-Hum ferry pass)');
  }

  const estimatedFairPrice = Math.round(fairValue / 5000) * 5000;
  const deltaPct = Number(
    (((listing.price - estimatedFairPrice) / estimatedFairPrice) * 100).toFixed(1)
  );

  // Convert valuation gap + negotiation signals into 0-100 Deal Score
  let score = Math.round(70 - deltaPct * 1.45);

  const { totalDropPct, cutCount } = getPriceChangeStats(listing);
  if (cutCount > 0) {
    score += Math.min(8, Math.round(totalDropPct * 0.7));
    reasons.push(`Price already cut ${totalDropPct}% (${cutCount}x)`);
  }
  if (listing.daysOnMarket >= 60 && listing.marketStatus === 'active') {
    score += 4;
    reasons.push(`${listing.daysOnMarket} days on market adds buyer leverage`);
  }

  score = Math.max(22, Math.min(97, score));

  let tier: DealEvaluation['tier'] = 'Fair Ask';
  let tone: DealEvaluation['tone'] = 'blue';
  if (score >= 78) {
    tier = 'Strong Value';
    tone = 'green';
  } else if (score >= 64) {
    tier = 'Fair Ask';
    tone = 'blue';
  } else if (score >= 50) {
    tier = 'Full Premium';
    tone = 'yellow';
  } else {
    tier = 'Overpriced';
    tone = 'red';
  }

  return {
    score,
    tier,
    tone,
    estimatedFairPrice,
    deltaPct,
    reasons: reasons.slice(0, 4),
  };
}

/**
 * Evaluates Airbnb & Peak Summer Rental viability grounded in 2026 municipal law:
 * - Unincorporated Town of Brookhaven (inVillage = false): Ch. 82 bans stays < 28-30 nights.
 * - Incorporated Village of Bellport (inVillage = true): Independent Village jurisdiction;
 *   allows short-term & summer rentals with a Village Rental License + safety/pool-alarm
 *   inspection, and offers a $650 Seasonal Guest ID card for tenant Ho-Hum ferry access.
 */
export function evaluateAirbnbViability(listing: Listing): AirbnbEvaluation {
  const text = `${listing.description} ${listing.features.join(' ')}`.toLowerCase();
  const hasPool =
    /gunite\s+pool|heated\s+pool|saltwater\s+pool|\binground\s+pool\b/.test(text) ||
    listing.features.some((f) => f === 'pool' || f.includes('gunite pool'));
  const hasGuestCottage = /guest\s+(?:cottage|house)|carriage\s+barn\s+studio/.test(text);
  const hasWaterfront = /waterfront|bay\s+views|bay\s+glimpses/.test(text);
  const isTurnkey = /renovated|turnkey|chef'?s\s+kitchen|updated/.test(text);

  if (!listing.inVillage) {
    const monthlySummer = Math.round((listing.beds * 4200 + (hasPool ? 9000 : 0)) / 500) * 500;
    const taxOffsetPct =
      listing.annualTaxes > 0 ? Math.round((monthlySummer / listing.annualTaxes) * 100) : 100;

    return {
      score: 32,
      tier: '30-Night Min Only',
      tone: 'red',
      airbnbShortStayLegal: false,
      legalBadge: 'Brookhaven 28–30d Min',
      estNightlyPeak: 0,
      estAugustGross: monthlySummer,
      taxOffsetPct,
      notes: [
        'Outside Incorporated Village: Town of Brookhaven Ch. 82 prohibits nightly Airbnb stays under 28–30 nights ($2,500+ fines).',
        'Whole-house monthly leases (30+ nights) are legal with a $500 Town Rental Registration.',
        'Tenants cannot purchase Bellport Village Ho-Hum Beach ferry guest passes.',
      ],
    };
  }

  // Inside Incorporated Village of Bellport
  let score = 58; // Base Village eligibility + ferry draw
  const notes: string[] = [
    'Inside Incorporated Village: eligible for short-term Airbnb & peak summer leases with a Village Rental License & safety inspection.',
    'Summer renters can buy a $650 Seasonal Guest ID at Village Hall for Ho-Hum Beach ferry, golf, and tennis.',
  ];

  if (hasPool) {
    score += 20;
    notes.push('Heated pool commands ~45% higher July/August rates (requires pool door & self-latching gate alarms for Village license).');
  } else {
    notes.push('No existing pool caps peak August weekly rates vs. Country Club pool homes.');
  }

  if (listing.beds >= 4) score += 8;
  if (hasGuestCottage) score += 6;
  if (hasWaterfront) score += 7;
  if (isTurnkey) score += 5;
  if (listing.walkToMarinaMin && listing.walkToMarinaMin <= 10) {
    score += 6;
    notes.push(`${listing.walkToMarinaMin}-minute walk to Marina & Main St boosts car-free NYC weekend bookings.`);
  }

  score = Math.min(96, score);

  // Estimate realistic Bellport Village peak nightly & August monthly gross
  let baseNightly = 450 + listing.beds * 145;
  if (hasPool) baseNightly += 340;
  if (hasWaterfront) baseNightly += 380;
  if (hasGuestCottage) baseNightly += 160;
  if (listing.area === 'Historic Lanes' || listing.area === 'Country Club & Golf') {
    baseNightly += 120;
  }

  const estNightlyPeak = Math.round(baseNightly / 25) * 25;
  // Classic Bellport August full-month lease (~24x nightly equivalent)
  const estAugustGross = Math.round((estNightlyPeak * 24) / 1000) * 1000;
  const taxOffsetPct =
    listing.annualTaxes > 0 ? Math.round((estAugustGross / listing.annualTaxes) * 100) : 100;

  let tier: AirbnbEvaluation['tier'] = 'Moderate Offset';
  let tone: AirbnbEvaluation['tone'] = 'yellow';
  if (score >= 84) {
    tier = 'Prime Airbnb & Summer';
    tone = 'green';
  } else if (score >= 70) {
    tier = 'Strong Seasonal';
    tone = 'blue';
  }

  return {
    score,
    tier,
    tone,
    airbnbShortStayLegal: true,
    legalBadge: 'Village Permit Eligible',
    estNightlyPeak,
    estAugustGross,
    taxOffsetPct,
    notes: notes.slice(0, 4),
  };
}

export function synthesizeArchitecturalTaste(
  allListings: Listing[]
): ArchitecturalTasteProfile {
  const favorites = allListings.filter((l) => l.isFavorite);

  if (favorites.length === 0) {
    return {
      favoriteCount: 0,
      headline: 'Heart (♥) 2 or more listings to map your architectural taste.',
      narrative:
        'As you save favorite homes across Bellport Village, this profile analyzes their construction eras, rooflines, siding materials, porches, pool setups, and lane locations to articulate the exact architectural vernacular you gravitate toward—and surfaces similar homes automatically.',
      brokerBrief: '',
      signatureTraits: [],
      medianYear: 0,
      medianSqft: 0,
      medianAcres: 0,
      preferredAreas: [],
      recommendations: [],
    };
  }

  const sortedYears = favorites.map((f) => f.yearBuilt).sort((a, b) => a - b);
  const sortedSqft = favorites.map((f) => f.sqft).sort((a, b) => a - b);
  const sortedAcres = favorites.map((f) => f.lotAcres).sort((a, b) => a - b);
  const mid = Math.floor(favorites.length / 2);

  const medianYear = sortedYears[mid];
  const medianSqft = sortedSqft[mid];
  const medianAcres = sortedAcres[mid];

  // Count architectural & feature traits
  const traitCounts = new Map<string, number>();
  const areaCounts = new Map<string, number>();
  const styleWords: string[] = [];

  for (const fav of favorites) {
    areaCounts.set(fav.area, (areaCounts.get(fav.area) ?? 0) + 1);
    styleWords.push(fav.style);

    const blob = `${fav.style} ${fav.description} ${fav.features.join(' ')}`.toLowerCase();
    const checks: Array<[boolean, string]> = [
      [/shingle/.test(blob), 'weathered cedar shingle'],
      [/clapboard|colonial/.test(blob), 'classic clapboard colonial'],
      [/gambrel|dutch/.test(blob), 'Dutch gambrel roofline'],
      [/modern\s+barn|casement/.test(blob), 'modern barn glazing'],
      [/screened\s+porch|wrap[-\s]?around\s+porch|sunroom/.test(blob), 'screened / wrap-around porch'],
      [/fireplace|wood\s+stove|hearth/.test(blob), 'wood-burning hearth'],
      [/pool/.test(blob), 'heated pool or pool site'],
      [/guest\s+cottage|carriage|studio/.test(blob), 'detached guest / carriage studio'],
      [/privet|elm|english\s+garden|hydrangea/.test(blob), 'mature privet & tree canopy'],
      [fav.yearBuilt <= 1935, 'pre-1935 historic pedigree'],
      [fav.floodZone === 'X', 'high-and-dry Flood Zone X'],
    ];

    for (const [hit, label] of checks) {
      if (hit) traitCounts.set(label, (traitCounts.get(label) ?? 0) + 1);
    }
  }

  const signatureTraits = Array.from(traitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([trait, count]) => ({ trait, count }));

  const preferredAreas = Array.from(areaCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);

  const historicShare = favorites.filter((f) => f.yearBuilt <= 1935).length / favorites.length;
  const shingleShare =
    favorites.filter((f) => /shingle|gambrel/i.test(`${f.style} ${f.description}`)).length /
    favorites.length;

  let headline = 'Classic Bellport Village Coastal Vernacular';
  if (historicShare >= 0.65 && shingleShare >= 0.5) {
    headline = 'Pre-War Shingle-Style & Historic Clapboard Compounds';
  } else if (historicShare >= 0.65) {
    headline = '19th & Early-20th-Century Village Captain’s Houses';
  } else if (favorites.some((f) => f.archetype === 'modern-barn')) {
    headline = 'Warm Cedar Modernism & Renovated Village Compounds';
  }

  const topTraitNames = signatureTraits.slice(0, 4).map((t) => t.trait);
  const stylesList = Array.from(new Set(styleWords)).slice(0, 3).join(', ');

  const narrative = `Based on your ${favorites.length} saved ${
    favorites.length === 1 ? 'favorite' : 'favorites'
  } (${stylesList}), you gravitate toward ${
    medianYear <= 1935
      ? `authentic pre-war proportions (median c. ${medianYear}) that preserve historic coastal character while incorporating modern kitchen and mechanical updates`
      : `well-proportioned four-season residences (median c. ${medianYear}) with strong indoor-outdoor flow`
  }. Your saved homes cluster around ${preferredAreas.join(' and ')}, averaging ~${medianSqft.toLocaleString()} sq ft on ${medianAcres} acres, defined by ${topTraitNames.join(', ')}.`;

  const brokerBrief = `We are looking inside the Incorporated Village of Bellport (ideally ${preferredAreas.join(' or ')}) for a ~${Math.round(medianSqft / 100) * 100}+ sq ft residence with ${topTraitNames.slice(0, 3).join(', ')}. Strong preference for ${
    historicShare >= 0.5 ? 'pre-war shingle or clapboard architecture' : 'turnkey cedar or classic village architecture'
  } on ~0.45+ acres in Flood Zone X with Marina/ferry walkability.`;

  // Score non-favorited active/off-market listings against signature traits
  const recommendations = allListings
    .filter((l) => !l.isFavorite && l.marketStatus !== 'sold')
    .map((candidate) => {
      const cBlob = `${candidate.style} ${candidate.description} ${candidate.features.join(' ')}`.toLowerCase();
      const sharedTraits: string[] = [];
      let pts = 0;
      let maxPts = 0;

      for (const { trait, count } of signatureTraits) {
        const weight = count * 12;
        maxPts += weight;
        let matches = false;
        if (trait === 'weathered cedar shingle' && /shingle/.test(cBlob)) matches = true;
        else if (trait === 'classic clapboard colonial' && /clapboard|colonial|cape/.test(cBlob)) matches = true;
        else if (trait === 'Dutch gambrel roofline' && /gambrel/.test(cBlob)) matches = true;
        else if (trait === 'modern barn glazing' && /modern\s+barn|casement/.test(cBlob)) matches = true;
        else if (trait === 'screened / wrap-around porch' && /porch|sunroom/.test(cBlob)) matches = true;
        else if (trait === 'wood-burning hearth' && /fireplace|wood\s+stove|hearth/.test(cBlob)) matches = true;
        else if (trait === 'heated pool or pool site' && /pool/.test(cBlob)) matches = true;
        else if (trait === 'detached guest / carriage studio' && /guest|carriage|studio|pool\s+house/.test(cBlob)) matches = true;
        else if (trait === 'mature privet & tree canopy' && /privet|elm|garden|wooded|cul-de-sac/.test(cBlob)) matches = true;
        else if (trait === 'pre-1935 historic pedigree' && candidate.yearBuilt <= 1938) matches = true;
        else if (trait === 'high-and-dry Flood Zone X' && candidate.floodZone === 'X') matches = true;

        if (matches) {
          pts += weight;
          sharedTraits.push(trait);
        }
      }

      if (preferredAreas.includes(candidate.area)) {
        pts += 12;
      }
      maxPts += 12;

      const matchPct = maxPts > 0 ? Math.min(98, Math.round((pts / maxPts) * 100)) : 50;
      return { listing: candidate, matchPct, sharedTraits: sharedTraits.slice(0, 3) };
    })
    .filter((r) => r.matchPct >= 55)
    .sort((a, b) => b.matchPct - a.matchPct)
    .slice(0, 3);

  return {
    favoriteCount: favorites.length,
    headline,
    narrative,
    brokerBrief,
    signatureTraits,
    medianYear,
    medianSqft,
    medianAcres,
    preferredAreas,
    recommendations,
  };
}

function normalizeStreetToken(s: string): string {
  return s
    .toLowerCase()
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bpoint\b/g, 'pt')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluateStreetAlerts(
  rules: StreetAlertRule[],
  listings: Listing[]
): TriggeredStreetAlert[] {
  return rules
    .filter((r) => r.enabled)
    .map((rule) => {
      const target = normalizeStreetToken(rule.street);
      const kw = rule.mustHaveKeyword.trim().toLowerCase();

      const matches = listings
        .filter((item) => {
          if (item.marketStatus === 'sold') return false;
          const normAddr = normalizeStreetToken(item.address);
          if (!normAddr.includes(target)) return false;
          if (rule.maxPrice !== null && item.price > rule.maxPrice) return false;
          if (rule.minBeds !== null && item.beds < rule.minBeds) return false;
          if (kw) {
            const hay = `${item.description} ${item.features.join(' ')} ${item.style}`.toLowerCase();
            if (!hay.includes(kw)) return false;
          }
          return true;
        })
        .map((listing) => {
          const stats = getPriceChangeStats(listing);
          return {
            listing,
            hasPriceCut: stats.totalDropDollar > 0,
            dropAmount: stats.totalDropDollar,
          };
        });

      return { rule, matches };
    });
}
