import type {
  ArchetypeIllustration,
  BellportMicroArea,
  HistoricalSaleRecord,
  Listing,
  VillageParcel,
} from '../types';
import { evaluateGoodDeal } from './intelligence';

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
  areas: string[];
  feats: string[];
  q: string;
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
  areas: [],
  feats: [],
  q: '',
};

export const MECE_VILLAGE_AREAS = [
  { value: 'Historic Lanes', label: 'Historic Lanes', sub: 'Below S Country · East/Center' },
  { value: 'South Howells & Bay', label: 'South Howells & Bay', sub: 'Below S Country · West' },
  { value: 'Country Club & West', label: 'Country Club & West', sub: 'Above S Country · West' },
  { value: 'Village North & East', label: 'Village North & East', sub: 'Above S Country · East' },
] as const;

export const DESIGN_FEATURE_OPTIONS = [
  { value: 'pool', label: 'Pool', group: 'Grounds & Water' },
  { value: 'space_pool', label: 'Space for a pool', group: 'Grounds & Water' },
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

export const DESIGN_FEATURE_LABELS: Record<string, string> = Object.fromEntries(
  DESIGN_FEATURE_OPTIONS.map((f) => [
    f.value,
    f.label.replace(' (ADU, studio, pool house)', ''),
  ])
);

export function parseFlexibleNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, '');
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

export function isAnyUnifiedFilterActive(f: UnifiedFilters): boolean {
  return (
    f.forSale ||
    f.soldRecent ||
    f.builtRecent ||
    f.allPastSales ||
    f.allHomes ||
    Boolean(f.valuation) ||
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
    f.areas.length > 0 ||
    f.feats.length > 0 ||
    f.q.trim() !== ''
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

export interface UnifiedHome {
  uid: string;
  parcelId: string;
  listingId: string | null;
  address: string;
  area: BellportMicroArea;
  belowSC: boolean;
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
  photos: string[];
  photoUrl?: string;
  archetype: ArchetypeIllustration;
  isFavorite: boolean;
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
  parcelFavorites: Record<string, boolean> = {}
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
      (linked?.marketStatus === 'sold' ? linked.listedDate : null) ??
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

    catalog.push({
      uid: linked?.id ?? p.id,
      parcelId: p.id,
      listingId: linked?.id ?? null,
      address: linked?.address ?? p.addr,
      area: p.area,
      belowSC: Boolean(p.belowSC),
      isForSale,
      hasPastSale,
      soldDate,
      soldYear,
      soldPrice,
      price: displayPrice,
      estVal: p.val ?? displayPrice,
      beds: linked?.beds ?? p.beds ?? 3,
      baths: linked?.baths ?? p.baths ?? 2,
      sqft: linked?.sqft ?? p.sqft ?? 1800,
      lotAcres: linked?.lotAcres ?? p.acres,
      yearBuilt: linked?.yearBuilt ?? p.yr ?? 1955,
      style: linked?.style ?? p.style ?? 'Bellport Village Home',
      styleSummary: linked?.styleSummary ?? linked?.headline ?? p.styleSummary ?? '',
      description: linked?.description ?? p.pastRemarks ?? p.styleSummary ?? '',
      feats: p.feats ?? [],
      photos: linked?.photos ?? (linked?.photoUrl ? [linked.photoUrl] : []),
      photoUrl: linked?.photos?.[0] ?? linked?.photoUrl,
      archetype:
        linked?.archetype ??
        (p.waterfront ? 'bayfront' : p.pool ? 'shingle-pool' : 'colonial'),
      isFavorite: linked ? Boolean(linked.isFavorite) : Boolean(parcelFavorites[p.id]),
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
  if (h.listingRef) return h.listingRef;
  return {
    id: h.parcelId,
    address: h.address,
    area: h.area,
    belowSC: h.belowSC,
    inVillage: true,
    latitude: h.lat,
    longitude: h.lon,
    marketStatus: h.isForSale ? 'active' : h.hasPastSale ? 'sold' : 'off-market',
    userStatus: 'unreviewed',
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
    floodZone: 'X',
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
    personalNotes: '',
    photos: h.photos,
    photoUrl: h.photoUrl,
  };
}

export function homeMatchesUnifiedFilters(
  h: UnifiedHome,
  filters: UnifiedFilters,
  isDirectoryMode: boolean
): boolean {
  const anyStatus =
    filters.forSale ||
    filters.soldRecent ||
    filters.builtRecent ||
    filters.allPastSales ||
    filters.allHomes;

  if (anyStatus) {
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
  } else if (isDirectoryMode) {
    const anyNarrowing =
      Boolean(filters.valuation) ||
      filters.minPrice !== null ||
      filters.maxPrice !== null ||
      filters.minBeds !== null ||
      filters.maxBeds !== null ||
      filters.minBaths !== null ||
      filters.maxBaths !== null ||
      filters.minSqft !== null ||
      filters.maxSqft !== null ||
      filters.minLot !== null ||
      filters.maxLot !== null ||
      filters.belowSC ||
      filters.areas.length > 0 ||
      filters.feats.length > 0 ||
      filters.q.trim() !== '';
    if (!anyNarrowing && !h.isForSale) return false;
  }

  if (filters.minPrice !== null && h.price < filters.minPrice) return false;
  if (filters.maxPrice !== null && h.price > filters.maxPrice) return false;
  if (filters.minBeds !== null && h.beds < filters.minBeds) return false;
  if (filters.maxBeds !== null && h.beds > filters.maxBeds) return false;
  if (filters.minBaths !== null && h.baths < filters.minBaths) return false;
  if (filters.maxBaths !== null && h.baths > filters.maxBaths) return false;
  if (filters.minSqft !== null && h.sqft < filters.minSqft) return false;
  if (filters.maxSqft !== null && h.sqft > filters.maxSqft) return false;
  if (filters.minLot !== null && h.lotAcres < filters.minLot) return false;
  if (filters.maxLot !== null && h.lotAcres > filters.maxLot) return false;
  if (filters.belowSC && !h.belowSC) return false;
  if (filters.areas.length > 0 && !filters.areas.includes(h.area)) return false;

  if (filters.feats.length > 0) {
    for (const fk of filters.feats) {
      if (!h.feats.includes(fk)) return false;
    }
  }

  if (filters.valuation) {
    const deal = evaluateGoodDeal(toPseudoListing(h), []);
    if (deal.status !== filters.valuation) return false;
  }

  if (filters.q.trim()) {
    const tokens = tokenizeQuery(filters.q);
    const hay = [
      h.address,
      h.area,
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

  return true;
}
