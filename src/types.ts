export const SCHEMA_VERSION = 1 as const;

export type MarketStatus = 'active' | 'off-market' | 'contingent' | 'sold';

export type UserTrackStatus = 'shortlist' | 'watching' | 'unreviewed' | 'pass';

export type BellportMicroArea =
  | 'Historic Lanes'
  | 'Country Club & Golf'
  | 'Village Center'
  | 'East Lanes & Circuit'
  | 'Outside Village (11713)';

export type FloodZone = 'X' | 'AE' | 'VE';

export type ArchetypeIllustration =
  | 'colonial'
  | 'shingle-pool'
  | 'bayfront'
  | 'modern-barn'
  | 'victorian'
  | 'cottage';

export type PriceEventType =
  | 'Listed'
  | 'Price Cut'
  | 'Price Increase'
  | 'In Contract'
  | 'Sold'
  | 'Observed';

export interface PricePoint {
  date: string; // ISO YYYY-MM-DD
  price: number;
  event: PriceEventType;
}

export interface Listing {
  id: string; // Immutable slug — never rename once persisted overrides exist
  externalId?: string; // Realtor/Redfin property_id for safe sync deduplication
  address: string;
  area: BellportMicroArea;
  inVillage: boolean; // True = Incorporated Village of Bellport (Ho-Hum ferry + Marina + Country Club resident rates)
  latitude?: number;
  longitude?: number;
  marketStatus: MarketStatus;
  userStatus: UserTrackStatus;
  isFavorite?: boolean;
  price: number;
  originalPrice?: number;
  soldPrice?: number;
  priceHistory?: PricePoint[];
  beds: number;
  baths: number;
  sqft: number;
  lotAcres: number;
  yearBuilt: number;
  annualTaxes: number;
  floodZone: FloodZone;
  walkToMarinaMin?: number;
  daysOnMarket: number;
  listedDate: string; // ISO YYYY-MM-DD
  style: string;
  archetype: ArchetypeIllustration;
  headline: string;
  description: string;
  features: string[];
  brokerage: string;
  mlsId?: string;
  sourceUrl?: string;
  photoUrl?: string;
  photos?: string[]; // Full photo gallery URLs
  personalNotes: string;
  lastSyncedAt?: string;
  isSample?: boolean;
}

export interface StreetAlertRule {
  id: string;
  street: string; // e.g. "Bellport Lane", "Browns Lane", "South Howells Point"
  maxPrice: number | null;
  minBeds: number | null;
  mustHaveKeyword: string;
  notifyOnPriceDrop: boolean;
  enabled: boolean;
  createdAt: string;
}

export type PrimaryView = 'listings' | 'map' | 'favorites' | 'alerts' | 'history';

export type ParcelStatusCategory = 'for_sale' | 'built_3yr' | 'sold_3yr' | 'other';

export interface VillageParcel {
  id: string;
  sbl: string;
  addr: string;
  area: BellportMicroArea;
  cat: ParcelStatusCategory;
  cls: string;
  clsLabel: string;
  res: boolean;
  lat: number;
  lon: number;
  acres: number;
  front: number;
  depth: number;
  beds?: number | null;
  baths?: number | null;
  est4br: boolean;
  yr?: number | null;
  sqft?: number | null;
  val?: number | null;
  mktVal: number;
  av: number;
  walkMin: number;
  owner?: string | null;
  mail?: string | null;
  absentee: boolean;
  pool: boolean;
  waterfront: boolean;
  historic: boolean;
  built3yr: boolean;
  sold3yr: boolean;
  soldDate?: string | null;
  soldPrice?: number | null;
  listingId?: string | null;
  mlsPhotos: number;
  pastRemarks?: string | null;
  sourceUrl?: string | null;
  rings: number[][][];
  bldgs?: number[][][];
}

export interface VillageStreet {
  name: string;
  segments: number[][][];
}

export interface VillageStreetLabel {
  name: string;
  lon: number;
  lat: number;
  major: boolean;
}

export type VillagePoiKind = 'golf' | 'beach' | 'park' | 'public' | 'dining' | 'shop';

export interface VillagePoi {
  id: string;
  name: string;
  kind: VillagePoiKind;
  lon: number;
  lat: number;
  addr: string;
  desc: string;
}

export interface VillageParcelsBundle {
  generatedAt: string;
  municipality: string;
  totalParcels: number;
  counts: {
    for_sale: number;
    sold_3yr: number;
    built_3yr: number;
    other: number;
    pools: number;
    absentee: number;
    waterfront: number;
    est4br_prospects: number;
  };
  bbox: { west: number; south: number; east: number; north: number };
  aerialBounds: { west: number; south: number; east: number; north: number; z: number };
  boundaryRings: number[][][];
  waterRings?: number[][][];
  outsideBldgs?: number[][][];
  streets: VillageStreet[];
  streetLabels: VillageStreetLabel[];
  pois: VillagePoi[];
  parcels: VillageParcel[];
}

export interface OffMarketDossier {
  address: string;
  fetchedAt: string;
  fromCache?: boolean;
  creditsRemaining?: number;
  lastSoldPrice?: number | null;
  lastSoldDate?: string | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  beds?: number | null;
  baths?: number | null;
  streetViewUrl?: string | null;
  archivedPhotos: string[];
  avmEstimates: Array<{ source: string; estimate: number }>;
  taxHistory: Array<{ year: number; tax: number }>;
  propertyHistory: Array<{ date: string; event: string; price: number; source: string }>;
  floodZone?: string | null;
  floodFactor?: number | null;
  floodInsuranceText?: string | null;
}

export interface FilterState {
  view: PrimaryView;
  tab: 'all' | 'shortlist' | 'comps';
  q: string;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  minSqft: number | null;
  minAcres: number | null;
  area: BellportMicroArea | 'all';
  villageOnly: boolean;
  zoneXOnly: boolean;
  minDealScore: number | null;
  airbnbEligibleOnly: boolean;
  marketStatus: MarketStatus | 'all';
  sortBy:
    | 'newest'
    | 'deal-desc'
    | 'rental-desc'
    | 'price-cut'
    | 'price-asc'
    | 'price-desc'
    | 'sqft-desc'
    | 'ppsf-asc'
    | 'acres-desc';
  layout: 'grid' | 'table';
}

export interface SyncMetadata {
  apiConfigured: boolean;
  geminiConfigured?: boolean;
  maskedKey?: string;
  lastSyncAt?: string;
  creditsRemaining?: number;
  creditsLimit?: number;
  cachedDetailsCount: number;
  lastSyncSummary?: string;
}

export interface PersistedAppState {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  listings: Listing[];
  streetAlerts?: StreetAlertRule[];
  aiTasteMemo?: {
    text: string;
    basedOnIds: string[];
    source: 'gemini' | 'local';
    updatedAt: string;
  };
  copyOverrides: Record<string, string>;
  scratchpad: string;
  preferences: {
    theme: 'light' | 'dark';
    privacyBlur: boolean;
    editMode: boolean;
  };
}
