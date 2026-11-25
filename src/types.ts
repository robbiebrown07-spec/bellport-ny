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

export interface Listing {
  id: string; // Immutable slug — never rename once persisted overrides exist
  address: string;
  area: BellportMicroArea;
  inVillage: boolean; // True = Incorporated Village of Bellport (Ho-Hum ferry + Marina + Country Club resident rates)
  marketStatus: MarketStatus;
  userStatus: UserTrackStatus;
  price: number;
  originalPrice?: number;
  soldPrice?: number;
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
  personalNotes: string;
  isSample?: boolean;
}

export interface FilterState {
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
  marketStatus: MarketStatus | 'all';
  sortBy: 'newest' | 'price-asc' | 'price-desc' | 'sqft-desc' | 'ppsf-asc' | 'acres-desc';
  layout: 'grid' | 'table';
}

export interface PersistedAppState {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  listings: Listing[];
  copyOverrides: Record<string, string>;
  scratchpad: string;
  preferences: {
    theme: 'light' | 'dark';
    privacyBlur: boolean;
    editMode: boolean;
  };
}
