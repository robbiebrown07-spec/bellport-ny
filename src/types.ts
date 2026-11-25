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

export type PrimaryView = 'listings' | 'favorites' | 'alerts' | 'history';

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
