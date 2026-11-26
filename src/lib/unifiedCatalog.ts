import type {
  ArchetypeIllustration,
  BellportMicroArea,
  HistoricalSaleRecord,
  Listing,
  UserTrackStatus,
  VillageParcel,
} from '../types';
import { evaluateGoodDeal } from './intelligence';
import { parseNaturalLanguageQuery } from './nlSearch';
import {
  evaluateArchitecturalBeauty,
  getOwnerAndAirbnbProfile,
} from './ownerAndAirbnb';
import { evaluateRobbieFit } from './robbieFit';

export const CURRENT_VILLAGE_YEAR = 2026;

export interface UnifiedFilters {
  forSale: boolean;
  soldRecent: boolean;
  soldYears: number;
  builtRecent: boolean;
  builtYears: number;
  allPastSales: boolean;
  allHomes: boolean;
  valuation: '' | 'underpriced' | 'overpriced';
  robbieFit: '' | 'perfect' | 'great_plus' | 'good_plus';
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  minBaths: number | null;
  maxBaths: number | null;
  minSqft: number | null;
  maxSqft: number | null;
  minLot: number | null;
  maxLot: number | null;
  belowSC: boolean;
  beautifulStreetsOnly: boolean;
  beautifulStreets: string[];
  areas: string[];
  feats: string[];
  q: string;
  nlQuery: string;
}

export const INITIAL_UNIFIED_FILTERS: UnifiedFilters = {
  forSale: false,
  soldRecent: false,
  soldYears: 3,
  builtRecent: false,
  builtYears: 5,
  allPastSales: false,
  allHomes: false,
  valuation: '',
  robbieFit: '',
  minPrice: null,
  maxPrice: null,
  minBeds: null,
  maxBeds: null,
  minBaths: null,
  maxBaths: null,
  minSqft: null,
  maxSqft: null,
  minLot: null,
  maxLot: null,
  belowSC: false,
  beautifulStreetsOnly: false,
  beautifulStreets: [],
  areas: [],
  feats: [],
  q: '',
  nlQuery: '',
};

export const BEAUTIFUL_STREET_OPTIONS = [
  {
    id: 'bellport-lane',
    label: 'Bellport Lane',
    sub: 'Main St south to Marina · Historic District',
  },
  {
    id: 'browns-lane',
    label: 'Browns Lane',
    sub: 'Shaded Shingle-Style canopy south of Main St',
  },
  {
    id: 'bell-hulse-pocket',
    label: 'Bell St & Hulse St Pocket',
    sub: 'Intimate historic cross-lanes off Bellport & Browns',
  },
  {
    id: 'livingston-rogers',
    label: 'Livingston Rd & Rogers Ave',
    sub: 'Leafy lower historic lanes near the Marina',
  },
  {
    id: 'academy-gerard',
    label: 'Academy Lane & Gerard St',
    sub: 'Sycamore corridor parallel to Livingston & Bellport Ln',
  },
  {
    id: 'shore-thornhedge-bay',
    label: 'Shore Rd, Pearl & Thornhedge Bluff',
    sub: 'Great South Bay waterfront & coastal bluff lanes',
  },
  {
    id: 'brewster-south',
    label: 'Brewster Lane (South Section)',
    sub: 'Best section only · Strictly south of Main St',
  },
  {
    id: 'south-howells-lower',
    label: 'S. Howells Point Rd (Lower Estate)',
    sub: 'Best section only · Country Club to Bay',
  },
] as const;

export const MECE_VILLAGE_AREAS = [
  { value: 'Historic Lanes', label: 'Historic Lanes', sub: 'Below S Country · East/Center' },
  { value: 'South Howells & Bay', label: 'South Howells & Bay', sub: 'Below S Country · West' },
  { value: 'Country Club & West', label: 'Country Club & West', sub: 'Above S Country · West' },
  { value: 'Village North & East', label: 'Village North & East', sub: 'Above S Country · East' },
] as const;

export const DESIGN_FEATURE_OPTIONS = [
  { value: 'pool', label: 'Current pool', group: 'Grounds & Water' },
  { value: 'space_pool', label: 'Room for a pool', group: 'Grounds & Water' },
  { value: 'lawn', label: 'Beautiful lawn', group: 'Grounds & Water' },
  { value: 'waterfront', label: 'Waterfront', group: 'Grounds & Water' },
  { value: 'shingles', label: 'Shingles', group: 'Architecture & Spaces' },
  { value: 'arch', label: 'Beautiful architecture', group: 'Architecture & Spaces' },
  { value: 'second_floor', label: 'Second floor', group: 'Architecture & Spaces' },
  { value: 'basement', label: 'Basement', group: 'Architecture & Spaces' },
  { value: 'fireplace', label: 'Fireplace', group: 'Architecture & Spaces' },
  {
    value: 'addl_struct',
    label: 'Additional structure (ADU, studio, pool house)',
    group: 'Architecture & Spaces',
  },
] as const;

export const DESIGN_FEATURE_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    DESIGN_FEATURE_OPTIONS.map((f) => [
      f.value,
      f.label.replace(' (ADU, studio, pool house)', ''),
    ])
  ),
  beautiful_street: 'Beautiful street',
};

export function parseFlexibleNumber(raw: string): number | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/^[<>≤≥=~+-]+/, '')
    .replace(/[$,\s]/g, '');
  if (!s) return null;
  if (s.endsWith('m')) {
    const n = parseFloat(s.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }
  if (s.endsWith('k')) {
    const n = parseFloat(s.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n * 1_000) : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtShortDollar(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(2).replace(/0$/, '')}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function resolveAssetUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const base = import.meta.env?.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}${raw.replace(/^\//, '')}`;
}

export function isAnyUnifiedFilterActive(f: UnifiedFilters): boolean {
  return (
    f.forSale ||
    f.soldRecent ||
    f.builtRecent ||
    f.allPastSales ||
    f.allHomes ||
    Boolean(f.valuation) ||
    Boolean(f.robbieFit) ||
    f.minPrice !== null ||
    f.maxPrice !== null ||
    f.minBeds !== null ||
    f.maxBeds !== null ||
    f.minBaths !== null ||
    f.maxBaths !== null ||
    f.minSqft !== null ||
    f.maxSqft !== null ||
    f.minLot !== null ||
    f.maxLot !== null ||
    f.belowSC ||
    f.beautifulStreetsOnly ||
    f.beautifulStreets.length > 0 ||
    f.areas.length > 0 ||
    f.feats.length > 0 ||
    f.q.trim() !== '' ||
    f.nlQuery.trim() !== ''
  );
}

function tokenizeQuery(q: string): string[] {
  const out: string[] = [];
  const rx = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(q.trim())) !== null) {
    const tok = (m[1] ?? m[2] ?? '').toLowerCase().trim();
    if (tok) out.push(tok);
  }
  return out;
}

// Commercial District Stores (Bellport General, Copper Beech, Brewport, Apothecary on Main St):
export const COMMERCIAL_STORES_COORD = { lat: 40.7575, lon: -72.9390 };
// Bellport Town Marina & Whalehouse Point Ferry Dock (Foot of Bellport Lane):
export const TOWN_MARINA_COORD = { lat: 40.7518, lon: -72.9337 };

export function getVillageDistances(lat?: number, lon?: number): {
  distStoresMi: number;
  walkStoresMin: number;
  distMarinaMi: number;
  walkMarinaMin: number;
} {
  const la = lat ?? 40.7575;
  const lo = lon ?? -72.9390;
  const storesMiles = Math.max(
    0.05,
    Math.hypot((la - COMMERCIAL_STORES_COORD.lat) * 69.0, (lo - COMMERCIAL_STORES_COORD.lon) * 52.3) *
      1.24
  );
  const marinaMiles = Math.max(
    0.05,
    Math.hypot((la - TOWN_MARINA_COORD.lat) * 69.0, (lo - TOWN_MARINA_COORD.lon) * 52.3) * 1.24
  );
  return {
    distStoresMi: Number(storesMiles.toFixed(2)),
    walkStoresMin: Math.max(1, Math.round(storesMiles * 20)),
    distMarinaMi: Number(marinaMiles.toFixed(2)),
    walkMarinaMin: Math.max(1, Math.round(marinaMiles * 20)),
  };
}

export interface UnifiedHome {
  uid: string;
  parcelId: string;
  listingId: string | null;
  address: string;
  area: BellportMicroArea;
  belowSC: boolean;
  beautifulStreet: boolean;
  beautifulStreetId: string | null;
  beautifulStreetName: string | null;
  walkMin: number;
  distStoresMi: number;
  walkStoresMin: number;
  distMarinaMi: number;
  walkMarinaMin: number;
  isForSale: boolean;
  hasPastSale: boolean;
  soldDate: string | null;
  soldYear: number | null;
  soldPrice: number | null;
  price: number;
  estVal: number;
  beds: number;
  baths: number;
  sqft: number;
  lotAcres: number;
  yearBuilt: number;
  style: string;
  styleSummary: string;
  description: string;
  feats: string[];
  extColor: string;
  openLawnAc: number;
  traits: string[];
  photos: string[];
  photoUrl?: string;
  photoSource?: 'mls' | 'streetview' | 'aerial';
  archetype: ArchetypeIllustration;
  isFavorite: boolean;
  isHidden: boolean;
  personalNotes: string;
  userStatus: UserTrackStatus;
  lat: number;
  lon: number;
  owner?: string | null;
  mail?: string | null;
  listingRef: Listing | null;
  parcelRef: VillageParcel;
}

export function buildUnifiedVillageCatalog(
  parcels: VillageParcel[],
  listings: Listing[],
  sales: HistoricalSaleRecord[],
  parcelFavorites: Record<string, boolean> = {},
  parcelHidden: Record<string, boolean> = {},
  parcelNotes: Record<string, string> = {},
  parcelStatuses: Record<string, UserTrackStatus> = {}
): UnifiedHome[] {
  const listingsById = new Map(listings.map((l) => [l.id, l]));
  const salesByPid = new Map<string, HistoricalSaleRecord>();
  for (const s of sales) {
    if (!s.parcelId) continue;
    const prev = salesByPid.get(s.parcelId);
    if (!prev || s.date > prev.date) salesByPid.set(s.parcelId, s);
  }

  const catalog: UnifiedHome[] = [];
  for (const p of parcels) {
    if (!p.res) continue;
    const linked = p.listingId ? (listingsById.get(p.listingId) ?? null) : null;
    const saleRec = salesByPid.get(p.id) ?? null;
    const soldDate =
      (linked?.marketStatus === 'sold' ? (linked.soldDate ?? linked.listedDate) : null) ??
      p.soldDate ??
      saleRec?.date ??
      null;
    const soldYear = soldDate ? Number(soldDate.slice(0, 4)) : null;
    const isForSale = p.cat === 'for_sale' || linked?.marketStatus === 'active';
    const hasPastSale = Boolean(soldDate || linked?.marketStatus === 'sold');
    const soldPrice =
      p.soldPrice ??
      saleRec?.price ??
      (linked?.marketStatus === 'sold' ? linked.price : null);

    const displayPrice = isForSale
      ? (linked?.price ?? p.val ?? 950_000)
      : hasPastSale && soldPrice
        ? soldPrice
        : (p.val ?? 950_000);

    const dists = getVillageDistances(p.lat, p.lon);
    const sqftVal = linked?.sqft ?? p.sqft ?? 1800;
    const lotAcVal = linked?.lotAcres ?? p.acres;
    const fallbackLawn = Number(
      Math.max(0.04, lotAcVal - ((p.fpSqft || sqftVal * 0.62) / 43560)).toFixed(2)
    );
    const isHidden = Boolean(
      parcelHidden[p.id] || (linked?.id ? parcelHidden[linked.id] : false)
    );
    const explicitFav =
      parcelFavorites[p.id] !== undefined
        ? parcelFavorites[p.id]
        : linked?.id && parcelFavorites[linked.id] !== undefined
          ? parcelFavorites[linked.id]
          : undefined;
    const isFavorite =
      !isHidden && (explicitFav !== undefined ? Boolean(explicitFav) : Boolean(linked?.isFavorite));

    const personalNotes =
      parcelNotes[p.id] !== undefined
        ? parcelNotes[p.id]
        : linked?.id && parcelNotes[linked.id] !== undefined
          ? parcelNotes[linked.id]
          : (linked?.personalNotes ?? '');

    const userStatus: UserTrackStatus =
      parcelStatuses[p.id] ??
      (linked?.id ? parcelStatuses[linked.id] : undefined) ??
      linked?.userStatus ??
      'unreviewed';

    catalog.push({
      uid: linked?.id ?? p.id,
      parcelId: p.id,
      listingId: linked?.id ?? null,
      address: linked?.address ?? p.addr,
      area: p.area,
      belowSC: Boolean(p.belowSC),
      beautifulStreet: Boolean(p.beautifulStreet),
      beautifulStreetId: p.beautifulStreetId ?? null,
      beautifulStreetName: p.beautifulStreetName ?? null,
      walkMin: dists.walkMarinaMin,
      distStoresMi: dists.distStoresMi,
      walkStoresMin: dists.walkStoresMin,
      distMarinaMi: dists.distMarinaMi,
      walkMarinaMin: dists.walkMarinaMin,
      isForSale,
      hasPastSale,
      soldDate,
      soldYear,
      soldPrice,
      price: displayPrice,
      estVal: p.val ?? displayPrice,
      beds: linked?.beds ?? p.beds ?? 3,
      baths: linked?.baths ?? p.baths ?? 2,
      sqft: sqftVal,
      lotAcres: lotAcVal,
      yearBuilt: linked?.yearBuilt ?? p.yr ?? 1955,
      style: linked?.style ?? p.style ?? 'Bellport Village Home',
      styleSummary: linked?.styleSummary ?? linked?.headline ?? p.styleSummary ?? '',
      description: linked?.description ?? p.pastRemarks ?? p.styleSummary ?? '',
      feats: p.feats ?? [],
      extColor: p.extColor ?? 'cedar',
      openLawnAc: p.openLawnAc ?? fallbackLawn,
      traits: p.traits ?? [],
      photos: (
        linked?.photos?.length
          ? linked.photos
          : linked?.photoUrl
            ? [linked.photoUrl]
            : p.mlsPhotoUrls?.length
              ? p.mlsPhotoUrls
              : p.photoUrl
                ? [p.photoUrl]
                : []
      )
        .map((u) => resolveAssetUrl(u))
        .filter((u): u is string => Boolean(u)),
      photoUrl: resolveAssetUrl(
        linked?.photos?.[0] ?? linked?.photoUrl ?? p.photoUrl ?? p.mlsPhotoUrls?.[0]
      ),
      photoSource:
        linked?.photos?.length || linked?.photoUrl
          ? 'mls'
          : (p.photoSource ?? 'streetview'),
      archetype:
        linked?.archetype ??
        (p.waterfront ? 'bayfront' : p.pool ? 'shingle-pool' : 'colonial'),
      isFavorite,
      isHidden,
      personalNotes,
      userStatus,
      lat: p.lat,
      lon: p.lon,
      owner: p.owner,
      mail: p.mail,
      listingRef: linked,
      parcelRef: p,
    });
  }
  return catalog;
}

export function toPseudoListing(h: UnifiedHome): Listing {
  if (h.listingRef) {
    return {
      ...h.listingRef,
      isFavorite: h.isFavorite,
      personalNotes: h.personalNotes,
      userStatus: h.userStatus,
    };
  }
  return {
    id: h.parcelId,
    address: h.address,
    area: h.area,
    belowSC: h.belowSC,
    inVillage: true,
    latitude: h.lat,
    longitude: h.lon,
    marketStatus: h.isForSale ? 'active' : h.hasPastSale ? 'sold' : 'off-market',
    userStatus: h.userStatus,
    isFavorite: h.isFavorite,
    price: h.price,
    soldPrice: h.soldPrice ?? undefined,
    soldDate: h.soldDate ?? undefined,
    beds: h.beds,
    baths: h.baths,
    sqft: h.sqft,
    lotAcres: h.lotAcres,
    yearBuilt: h.yearBuilt,
    annualTaxes: Math.round(h.estVal * 0.009),
    floodZone:
      h.parcelRef.waterfront && h.lat < 40.7435
        ? 'VE'
        : h.lat < 40.748 || h.parcelRef.waterfront
          ? 'AE'
          : 'X',
    daysOnMarket: 0,
    listedDate: h.soldDate ?? '2026-01-01',
    style: h.style,
    styleSummary: h.styleSummary,
    archetype: h.archetype,
    headline: h.styleSummary,
    description: h.description,
    features: h.feats.map((fk) => DESIGN_FEATURE_LABELS[fk] ?? fk),
    feats: h.feats,
    brokerage: 'Bellport Village Public Roll',
    personalNotes: h.personalNotes,
    photos: h.photos,
    photoUrl: h.photoUrl,
  };
}

export function homeMatchesUnifiedFilters(
  h: UnifiedHome,
  filters: UnifiedFilters,
  isDirectoryMode: boolean,
  savedTasteFilters?: UnifiedFilters
): boolean {
  if (h.isHidden) return false;
  const nl = filters.nlQuery.trim() ? parseNaturalLanguageQuery(filters.nlQuery) : null;

  const anyStatus =
    filters.forSale ||
    filters.soldRecent ||
    filters.builtRecent ||
    filters.allPastSales ||
    filters.allHomes;

  if (nl?.isQuestion && nl.statusIntent === 'past_sales') {
    if (!h.hasPastSale) return false;
    if (nl.soldYears && (!h.soldYear || h.soldYear < CURRENT_VILLAGE_YEAR - nl.soldYears)) {
      return false;
    }
  } else if (anyStatus) {
    let ok = false;
    if (filters.allHomes) ok = true;
    if (filters.forSale && h.isForSale) ok = true;
    if (filters.allPastSales && h.hasPastSale) ok = true;
    if (
      filters.soldRecent &&
      h.soldYear !== null &&
      h.soldYear >= CURRENT_VILLAGE_YEAR - filters.soldYears
    ) {
      ok = true;
    }
    if (filters.builtRecent && h.yearBuilt >= CURRENT_VILLAGE_YEAR - filters.builtYears) {
      ok = true;
    }
    if (!ok) return false;
  } else if (nl?.statusIntent) {
    if (nl.statusIntent === 'for_sale' && !h.isForSale) return false;
    if (nl.statusIntent === 'past_sales') {
      if (!h.hasPastSale) return false;
      if (nl.soldYears && (!h.soldYear || h.soldYear < CURRENT_VILLAGE_YEAR - nl.soldYears)) {
        return false;
      }
    }
  } else if (isDirectoryMode) {
    // On the Homes directory tab, default to active For Sale listings unless the user
    // explicitly selected Past Sales, Sold Recently, Built Recently, or All Village Homes.
    if (!h.isForSale) return false;
  }

  // When a query asks about "our search parameters" / "my criteria", enforce saved Taste Profile criteria (or Robbie Fit)
  if (nl?.useSavedParameters) {
    const tf = savedTasteFilters;
    const hasCustomTaste =
      tf &&
      (tf.minPrice !== null ||
        tf.maxPrice !== null ||
        tf.minBeds !== null ||
        tf.maxBeds !== null ||
        tf.minBaths !== null ||
        tf.maxBaths !== null ||
        tf.minSqft !== null ||
        tf.maxSqft !== null ||
        tf.minLot !== null ||
        tf.maxLot !== null ||
        tf.belowSC ||
        tf.beautifulStreetsOnly ||
        tf.beautifulStreets.length > 0 ||
        tf.areas.length > 0 ||
        tf.feats.length > 0);

    const hasInlineStruct =
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.minBeds !== null ||
      filters.minBaths !== null ||
      filters.minSqft !== null ||
      filters.minLot !== null ||
      filters.belowSC ||
      filters.beautifulStreetsOnly ||
      filters.beautifulStreets.length > 0 ||
      filters.areas.length > 0 ||
      filters.feats.length > 0;

    if (hasCustomTaste && tf) {
      if (
        !homeMatchesUnifiedFilters(
          h,
          {
            ...tf,
            forSale: false,
            allPastSales: false,
            allHomes: true,
            soldRecent: false,
            builtRecent: false,
            nlQuery: '',
          },
          false
        )
      ) {
        return false;
      }
    } else if (!hasInlineStruct) {
      // Default to Robbie's Architectural & Grounds Fit profile (Good / Great / ★ Perfect Fit)
      const fit = evaluateRobbieFit(toPseudoListing(h));
      if (!fit.tier) return false;
    }
  }

  // Always compare against the exact displayed price (`h.price`) so no card ever exceeds maxPrice or falls below minPrice
  const cmpPrice = h.price;
  if (filters.minPrice !== null && cmpPrice < filters.minPrice) return false;
  if (filters.maxPrice !== null && cmpPrice > filters.maxPrice) return false;
  if (filters.minBeds !== null && h.beds < filters.minBeds) return false;
  if (filters.maxBeds !== null && h.beds > filters.maxBeds) return false;
  if (filters.minBaths !== null && h.baths < filters.minBaths) return false;
  if (filters.maxBaths !== null && h.baths > filters.maxBaths) return false;
  if (filters.minSqft !== null && h.sqft < filters.minSqft) return false;
  if (filters.maxSqft !== null && h.sqft > filters.maxSqft) return false;
  if (filters.minLot !== null && h.lotAcres < filters.minLot) return false;
  if (filters.maxLot !== null && h.lotAcres > filters.maxLot) return false;
  if (filters.belowSC && !h.belowSC) return false;

  // Beautiful streets filter
  if (filters.beautifulStreets.length > 0) {
    if (!h.beautifulStreetId || !filters.beautifulStreets.includes(h.beautifulStreetId)) {
      return false;
    }
  } else if (filters.beautifulStreetsOnly && !h.beautifulStreet) {
    return false;
  }

  if (filters.areas.length > 0 && !filters.areas.includes(h.area)) return false;

  // Features with smart Pool OR-logic:
  // - 'pool' + 'space_pool' together -> EITHER current pool OR room for pool!
  // - 'pool' alone -> ONLY homes with a current pool!
  // - 'space_pool' alone -> homes with room for a pool!
  if (filters.feats.length > 0) {
    const wantsPool = filters.feats.includes('pool');
    const wantsSpacePool = filters.feats.includes('space_pool');
    if (wantsPool && wantsSpacePool) {
      if (!h.feats.includes('pool') && !h.feats.includes('space_pool')) return false;
    } else if (wantsPool) {
      if (!h.feats.includes('pool')) return false;
    } else if (wantsSpacePool) {
      if (!h.feats.includes('space_pool')) return false;
    }

    for (const fk of filters.feats) {
      if (fk === 'pool' || fk === 'space_pool') continue;
      if (!h.feats.includes(fk)) return false;
    }
  }

  if (filters.valuation) {
    const deal = evaluateGoodDeal(toPseudoListing(h), []);
    if (deal.status !== filters.valuation) return false;
  }

  const wantedFit = filters.robbieFit || nl?.robbieFit || '';
  if (wantedFit) {
    const fit = evaluateRobbieFit(toPseudoListing(h));
    if (wantedFit === 'perfect' && fit.tier !== 'perfect') return false;
    if (wantedFit === 'great_plus' && fit.tier !== 'perfect' && fit.tier !== 'great') return false;
    if (wantedFit === 'good_plus' && !fit.tier) return false;
  }

  if (filters.q.trim()) {
    const tokens = tokenizeQuery(filters.q);
    const hay = [
      h.address,
      h.area,
      h.beautifulStreetName ?? '',
      h.style,
      h.styleSummary,
      h.description,
      h.feats.map((f) => DESIGN_FEATURE_LABELS[f] ?? f).join(' '),
      h.owner ?? '',
      h.mail ?? '',
    ]
      .join(' ')
      .toLowerCase();
    if (!tokens.every((t: string) => hay.includes(t))) return false;
  }

  // Natural Language Search evaluation (structured + visual/photo + GIS spatial + synonym-expanded)
  if (nl?.active && !nl.isAdvisoryOnly) {
    if (nl.minPrice !== null && cmpPrice < nl.minPrice) return false;
    if (nl.maxPrice !== null && cmpPrice > nl.maxPrice) return false;
    if (nl.minBeds !== null && h.beds < nl.minBeds) return false;
    if (nl.maxBeds !== null && h.beds > nl.maxBeds) return false;
    if (nl.minBaths !== null && h.baths < nl.minBaths) return false;
    if (nl.minSqft !== null && h.sqft < nl.minSqft) return false;
    if (nl.minLot !== null && h.lotAcres < nl.minLot) return false;
    if (nl.maxWalkMin !== null && h.walkMin > nl.maxWalkMin) return false;
    if (nl.maxWalkStoresMin !== null && h.walkStoresMin > nl.maxWalkStoresMin) return false;
    if (nl.belowSC && !h.belowSC) return false;
    if (nl.beautifulStreetsOnly && !h.beautifulStreet) return false;
    if (nl.maxYearBuilt !== null && h.yearBuilt > nl.maxYearBuilt) return false;
    if (nl.minYearBuilt !== null && h.yearBuilt < nl.minYearBuilt) return false;

    if (nl.extColors.length > 0) {
      if (!nl.extColors.includes(h.extColor)) return false;
    }

    for (const tr of nl.requiredTraits) {
      if (tr === 'large_lawn') {
        if (!h.traits.includes('large_lawn') && h.openLawnAc < 0.34 && !h.feats.includes('lawn')) {
          return false;
        }
      } else if (!h.traits.includes(tr)) {
        return false;
      }
    }

    if (nl.airbnbOnly) {
      const prof = getOwnerAndAirbnbProfile({
        parcelId: h.parcelId,
        owner: h.owner,
        mail: h.mail,
        absentee: h.parcelRef.absentee,
        listing: toPseudoListing(h),
      });
      if (!prof.isListedOnAirbnb) return false;
    }

    if (nl.minBeauty !== null) {
      const b = evaluateArchitecturalBeauty(toPseudoListing(h));
      if (b.score10 < nl.minBeauty) return false;
    }

    if (nl.streetMentions.length > 0) {
      const addrLow = h.address
        .toLowerCase()
        .replace(/\broad\b/g, 'rd')
        .replace(/\blane\b/g, 'ln')
        .replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave');
      if (!nl.streetMentions.some((sm) => addrLow.includes(sm))) return false;
    }

    if (nl.poolMode === 'pool_or_room') {
      if (!h.feats.includes('pool') && !h.feats.includes('space_pool')) return false;
    } else if (nl.poolMode === 'pool_only') {
      if (!h.feats.includes('pool')) return false;
    } else if (nl.poolMode === 'room_only') {
      if (!h.feats.includes('space_pool')) return false;
    }

    for (const fk of nl.feats) {
      if (!h.feats.includes(fk)) return false;
    }

    if (nl.styleTokens.length > 0) {
      const styleHay = `${h.style} ${h.styleSummary} ${h.description}`.toLowerCase();
      if (!nl.styleTokens.some((st) => styleHay.includes(st))) return false;
    }

    if (nl.valuation) {
      const deal = evaluateGoodDeal(toPseudoListing(h), []);
      if (deal.status !== nl.valuation) return false;
    }

    if (nl.residualTokens.length > 0) {
      const hay = [
        h.address,
        h.area,
        h.beautifulStreetName ?? '',
        h.style,
        h.styleSummary,
        h.description,
        h.extColor,
        h.traits.join(' '),
        h.feats.map((f) => DESIGN_FEATURE_LABELS[f] ?? f).join(' '),
        h.owner ?? '',
        h.mail ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .replace(/\broad\b/g, 'rd')
        .replace(/\blane\b/g, 'ln')
        .replace(/\bstreet\b/g, 'st')
        .replace(/\bavenue\b/g, 'ave');

      const synMap: Record<string, string[]> = {
        modern: ['modern', 'contemporary', '202', 'barn'],
        beach: ['waterfront', 'bay', 'coastal', 'marina', 'shore'],
        ocean: ['waterfront', 'bay', 'ho-hum', 'shore'],
        tennis: ['tennis', 'court', 'estate_grounds'],
        garage: ['garage', 'addl_struct', 'carriage'],
        deck: ['deck', 'patio', 'porch', 'bluestone'],
        patio: ['patio', 'deck', 'bluestone', 'terrace'],
        fence: ['picket', 'fence', 'hedged', 'privet'],
        corner: ['wide_lot', 'corner'],
      };

      const matchesResidual = nl.residualTokens.every((tok) => {
        const alts = synMap[tok] ?? [tok];
        return alts.some((alt) => hay.includes(alt));
      });
      if (!matchesResidual) return false;
    }
  }

  return true;
}
