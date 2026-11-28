export const SCHEMA_VERSION = 1 as const;

export type MarketStatus = 'active' | 'off-market' | 'contingent' | 'sold';

export type UserTrackStatus = 'shortlist' | 'watching' | 'unreviewed' | 'pass';

export type BellportMicroArea =
  | 'Historic Lanes'
  | 'South Howells & Bay'
  | 'Country Club & West'
  | 'Village North & East'
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
  id: string;
  externalId?: string;
  address: string;
  area: BellportMicroArea;
  belowSC?: boolean;
  inVillage: boolean;
  latitude?: number;
  longitude?: number;
  marketStatus: MarketStatus;
  userStatus: UserTrackStatus;
  isFavorite?: boolean;
  price: number;
  originalPrice?: number;
  soldPrice?: number;
  soldDate?: string;
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
  listedDate: string;
  style: string;
  styleSummary?: string;
  archetype: ArchetypeIllustration;
  headline: string;
  description: string;
  features: string[];
  feats?: string[];
  brokerage: string;
  mlsId?: string;
  sourceUrl?: string;
  photoUrl?: string;
  photos?: string[];
  personalNotes: string;
  lastSyncedAt?: string;
  isSample?: boolean;
}

export interface StreetAlertRule {
  id: string;
  street: string;
  maxPrice: number | null;
  minBeds: number | null;
  mustHaveKeyword: string;
  notifyOnPriceDrop: boolean;
  enabled: boolean;
  createdAt: string;
}

export type EmailAlertFrequency = 'immediately' | 'daily' | 'weekly';

export type AlertPoolMode = 'any' | 'pool_only' | 'pool_or_room' | 'room_only';

export interface EmailAlertRule {
  id: string;
  name: string;
  email: string;
  frequency: EmailAlertFrequency;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  minBaths: number | null;
  minSqft: number | null;
  minLotAcres: number | null;
  belowSC: boolean;
  beautifulStreetsOnly: boolean;
  selectedStreets: string[];
  poolMode: AlertPoolMode;
  feats: string[];
  naturalQuery: string;
  notifyOnPriceDrop: boolean;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: string | null;
}

export type PrimaryView = 'listings' | 'map' | 'favorites' | 'alerts' | 'history' | 'about';

export type ParcelStatusCategory = 'for_sale' | 'built_3yr' | 'sold_3yr' | 'other';

export interface VillageParcel {
  id: string;
  sbl: string;
  addr: string;
  area: BellportMicroArea;
  belowSC?: boolean;
  underwater?: boolean;
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
  fpSqft?: number;
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
  mlsPhotoUrls?: string[];
  photoUrl?: string;
  photoSource?: 'mls' | 'streetview' | 'aerial';
  pastRemarks?: string | null;
  sourceUrl?: string | null;
  style?: string;
  styleSummary?: string;
  feats?: string[];
  beautifulStreet?: boolean;
  beautifulStreetId?: string;
  beautifulStreetName?: string;
  extColor?: string;
  openLawnAc?: number;
  traits?: string[];
  poiKind?: VillagePoiKind;
  poiName?: string;
  rings: number[][][];
  bldgs?: number[][][];
}

export interface HistoricalSaleRecord {
  id: string;
  address: string;
  date: string; // YYYY-MM-DD
  price: number;
  listPrice?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  acres?: number | null;
  yearBuilt?: number | null;
  inVillage: boolean;
  area: BellportMicroArea;
  belowSC?: boolean;
  beautifulStreet?: string | null;
  pool: boolean;
  ppsf?: number | null;
  parcelId?: string | null;
  source: string;
}

export interface BeautifulStreetSection {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  description: string;
  homeCount: number;
  labelLon: number;
  labelLat: number;
  segments: number[][][];
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
  parcelId?: string | null;
  photoUrl?: string;
  websiteUrl?: string;
  websiteLabel?: string;
  mapsUrl?: string;
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
  bayAerialBounds?: { west: number; south: number; east: number; north: number; z: number };
  boundaryRings: number[][][];
  waterRings?: number[][][];
  fireIslandRings?: number[][][];
  hoHumBeachRings?: number[][][];
  ferryRoute?: {
    name: string;
    durationText: string;
    northDock: { name: string; lon: number; lat: number };
    southDock: { name: string; lon: number; lat: number };
    waypoints: number[][];
  };
  outsideBldgs?: number[][][];
  southCountryLine?: number[][];
  beautifulStreets?: BeautifulStreetSection[];
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

export interface UserReactionsVault {
  vaultVersion: 1;
  updatedAt: string;
  saved: Record<string, boolean>;
  hidden: Record<string, boolean>;
  notes: Record<string, string>;
  statuses: Record<string, UserTrackStatus>;
  timestamps: Record<string, string>;
}

export interface PersistedAppState {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: string;
  listings: Listing[];
  savedParcelIds?: Record<string, boolean>;
  hiddenParcelIds?: Record<string, boolean>;
  parcelNotes?: Record<string, string>;
  parcelStatuses?: Record<string, UserTrackStatus>;
  reactionsVault?: UserReactionsVault;
  activeFilters?: Record<string, unknown>;
  tasteFilters?: Record<string, unknown>;
  idealSearchNotes?: string;
  streetAlerts?: StreetAlertRule[];
  emailAlerts?: EmailAlertRule[];
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
