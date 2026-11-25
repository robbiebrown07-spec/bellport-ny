import fs from 'node:fs';
import path from 'node:path';
import {
  SCHEMA_VERSION,
  type Listing,
  type PersistedAppState,
  type PricePoint,
  type StreetAlertRule,
  type SyncMetadata,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'store.json');
const DETAILS_CACHE_FILE = path.join(DATA_DIR, 'realty-details-cache.json');
const SYNC_META_FILE = path.join(DATA_DIR, 'sync-meta.json');
const ENV_LOCAL_FILE = path.resolve(process.cwd(), '.env.local');
const SEED_FILE = path.resolve(process.cwd(), 'public/data/seed-listings.json');

export const DEFAULT_STREET_ALERTS: StreetAlertRule[] = [
  {
    id: 'alert-bellport-ln',
    street: 'Bellport Lane',
    maxPrice: null,
    minBeds: 3,
    mustHaveKeyword: '',
    notifyOnPriceDrop: true,
    enabled: true,
    createdAt: '2026-11-01',
  },
  {
    id: 'alert-howells-pt',
    street: 'Howells Point',
    maxPrice: null,
    minBeds: 3,
    mustHaveKeyword: '',
    notifyOnPriceDrop: true,
    enabled: true,
    createdAt: '2026-11-01',
  },
  {
    id: 'alert-country-club',
    street: 'Country Club Road',
    maxPrice: 2000000,
    minBeds: 3,
    mustHaveKeyword: 'pool',
    notifyOnPriceDrop: true,
    enabled: true,
    createdAt: '2026-11-01',
  },
  {
    id: 'alert-circuit-rd',
    street: 'Circuit Road',
    maxPrice: 1650000,
    minBeds: 3,
    mustHaveKeyword: '',
    notifyOnPriceDrop: true,
    enabled: true,
    createdAt: '2026-11-01',
  },
];

export interface StoredSyncMeta {
  lastSyncAt?: string;
  creditsRemaining?: number;
  creditsLimit?: number;
  lastSyncSummary?: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');

export function readEnvLocalVar(name: string): string {
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) {
    return fromProcess.trim();
  }
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8')) as Record<string, string>;
      if (typeof secrets[name] === 'string' && secrets[name].trim()) {
        return secrets[name].trim();
      }
    }
  } catch {
    // Ignore secrets read error
  }
  try {
    if (fs.existsSync(ENV_LOCAL_FILE)) {
      const content = fs.readFileSync(ENV_LOCAL_FILE, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed
          .slice(eqIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (k === name && v) {
          return v;
        }
      }
    }
  } catch {
    // Ignore read error
  }
  return '';
}

export function readRealtyApiKey(): string {
  return readEnvLocalVar('REALTYAPI_KEY');
}

export function readGeminiApiKey(): string {
  return readEnvLocalVar('GEMINI_API_KEY');
}

export function maskApiKey(key: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function saveEnvLocalVar(varName: 'REALTYAPI_KEY' | 'GEMINI_API_KEY', value: string): void {
  ensureDataDir();
  const clean = value.trim();
  let secrets: Record<string, string> = {};
  if (fs.existsSync(SECRETS_FILE)) {
    try {
      secrets = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf-8')) as Record<string, string>;
    } catch {
      secrets = {};
    }
  }
  secrets[varName] = clean;
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), { encoding: 'utf-8', mode: 0o600 });
  process.env[varName] = clean;
}

export function saveRealtyApiKeyToEnvLocal(newKey: string): void {
  saveEnvLocalVar('REALTYAPI_KEY', newKey);
}

export function loadServerState(): PersistedAppState {
  ensureDataDir();
  const seedListings = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8')) as Listing[];

  if (fs.existsSync(STATE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as PersistedAppState;
      if (parsed && parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.listings)) {
        // Hydrate new v2 seed fields (priceHistory, isFavorite, streetAlerts) if upgrading an untouched v1 sample store
        const allSample = parsed.listings.every((l) => l.isSample);
        const missingPriceHistory = parsed.listings.every((l) => !l.priceHistory);
        const upgradedListings =
          allSample && missingPriceHistory ? seedListings : parsed.listings;

        return {
          ...parsed,
          listings: upgradedListings,
          streetAlerts:
            parsed.streetAlerts && parsed.streetAlerts.length > 0
              ? parsed.streetAlerts
              : DEFAULT_STREET_ALERTS,
        };
      }
    } catch {
      // Fall through to fresh seed
    }
  }

  const initial: PersistedAppState = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    listings: seedListings,
    streetAlerts: DEFAULT_STREET_ALERTS,
    copyOverrides: {},
    scratchpad:
      'Bellport Village notes:\n• Confirm Incorporated Village boundary for Ho-Hum ferry & Village Rental License.\n• Check Old Purchase Properties for quiet off-market gambrels south of Main St.',
    preferences: {
      theme: 'light',
      privacyBlur: false,
      editMode: false,
    },
  };
  saveServerState(initial);
  return initial;
}

export function saveServerState(state: PersistedAppState): PersistedAppState {
  ensureDataDir();
  const stamped: PersistedAppState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(stamped, null, 2), 'utf-8');
  return stamped;
}

export function loadDetailsCache(): Record<string, Record<string, unknown>> {
  ensureDataDir();
  if (!fs.existsSync(DETAILS_CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DETAILS_CACHE_FILE, 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >;
  } catch {
    return {};
  }
}

export function saveDetailsCache(cache: Record<string, Record<string, unknown>>): void {
  ensureDataDir();
  fs.writeFileSync(DETAILS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

export function getSyncMetadata(): SyncMetadata {
  ensureDataDir();
  const key = readRealtyApiKey();
  const geminiKey = readGeminiApiKey();
  const cache = loadDetailsCache();
  let meta: StoredSyncMeta = {};
  if (fs.existsSync(SYNC_META_FILE)) {
    try {
      meta = JSON.parse(fs.readFileSync(SYNC_META_FILE, 'utf-8')) as StoredSyncMeta;
    } catch {
      meta = {};
    }
  }
  return {
    apiConfigured: Boolean(key),
    geminiConfigured: Boolean(geminiKey),
    maskedKey: maskApiKey(key),
    lastSyncAt: meta.lastSyncAt,
    creditsRemaining: meta.creditsRemaining,
    creditsLimit: meta.creditsLimit,
    cachedDetailsCount: Object.keys(cache).length,
    lastSyncSummary: meta.lastSyncSummary,
  };
}

export function updateSyncMetadata(patch: Partial<StoredSyncMeta>): SyncMetadata {
  ensureDataDir();
  let current: StoredSyncMeta = {};
  if (fs.existsSync(SYNC_META_FILE)) {
    try {
      current = JSON.parse(fs.readFileSync(SYNC_META_FILE, 'utf-8')) as StoredSyncMeta;
    } catch {
      current = {};
    }
  }
  const next: StoredSyncMeta = { ...current, ...patch };
  fs.writeFileSync(SYNC_META_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return getSyncMetadata();
}

function normalizeAddressKey(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/,?\s*bellport(\s+village)?.*$/i, '')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/[^a-z0-9]/g, '');
}

function mergePriceHistory(
  existing: PricePoint[] | undefined,
  incoming: PricePoint[] | undefined,
  oldPrice: number,
  newPrice: number,
  listedDate: string
): PricePoint[] {
  const byKey = new Map<string, PricePoint>();

  for (const pt of existing ?? []) {
    byKey.set(`${pt.date}:${pt.price}`, pt);
  }
  for (const pt of incoming ?? []) {
    byKey.set(`${pt.date}:${pt.price}`, pt);
  }

  if (byKey.size === 0 && oldPrice > 0) {
    byKey.set(`${listedDate}:${oldPrice}`, {
      date: listedDate,
      price: oldPrice,
      event: 'Listed',
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (newPrice > 0 && oldPrice > 0 && newPrice !== oldPrice) {
    byKey.set(`${today}:${newPrice}`, {
      date: today,
      price: newPrice,
      event: newPrice < oldPrice ? 'Price Cut' : 'Price Increase',
    });
  }

  return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function mergeSyncedListings(
  existingListings: Listing[],
  incomingListings: Listing[]
): { merged: Listing[]; addedCount: number; updatedCount: number } {
  if (incomingListings.length === 0) {
    return { merged: existingListings, addedCount: 0, updatedCount: 0 };
  }

  const retainedExisting = existingListings.filter((item) => !item.isSample);

  const byExternalId = new Map<string, Listing>();
  const byAddrKey = new Map<string, Listing>();
  for (const item of retainedExisting) {
    if (item.externalId) byExternalId.set(item.externalId, item);
    byAddrKey.set(normalizeAddressKey(item.address), item);
  }

  let addedCount = 0;
  let updatedCount = 0;
  const updatedIds = new Set<string>();
  const nextList: Listing[] = [];

  for (const inc of incomingListings) {
    const match =
      (inc.externalId ? byExternalId.get(inc.externalId) : undefined) ??
      byAddrKey.get(normalizeAddressKey(inc.address));

    if (match) {
      updatedCount += 1;
      updatedIds.add(match.id);
      const mergedFeatures = Array.from(new Set([...match.features, ...inc.features]));
      const priceDropped = match.price > inc.price && inc.price > 0;
      const mergedHistory = mergePriceHistory(
        match.priceHistory,
        inc.priceHistory,
        match.price,
        inc.price,
        match.listedDate
      );

      nextList.push({
        ...match,
        externalId: inc.externalId ?? match.externalId,
        marketStatus: inc.marketStatus,
        price: inc.price || match.price,
        originalPrice: priceDropped
          ? (match.originalPrice ?? match.price)
          : (inc.originalPrice ?? match.originalPrice),
        soldPrice: inc.soldPrice ?? match.soldPrice,
        priceHistory: mergedHistory,
        beds: inc.beds || match.beds,
        baths: inc.baths || match.baths,
        sqft: inc.sqft || match.sqft,
        lotAcres: inc.lotAcres || match.lotAcres,
        yearBuilt: inc.yearBuilt || match.yearBuilt,
        annualTaxes: inc.annualTaxes || match.annualTaxes,
        daysOnMarket: inc.daysOnMarket ?? match.daysOnMarket,
        description:
          inc.description && inc.description.length > match.description.length
            ? inc.description
            : match.description,
        headline: match.headline || inc.headline,
        photoUrl: inc.photoUrl ?? match.photoUrl,
        photos: inc.photos && inc.photos.length > 0 ? inc.photos : match.photos,
        sourceUrl: inc.sourceUrl ?? match.sourceUrl,
        mlsId: inc.mlsId ?? match.mlsId,
        brokerage: inc.brokerage || match.brokerage,
        latitude: inc.latitude ?? match.latitude,
        longitude: inc.longitude ?? match.longitude,
        inVillage: inc.inVillage,
        area: inc.area,
        walkToMarinaMin: inc.walkToMarinaMin ?? match.walkToMarinaMin,
        features: mergedFeatures,
        // Strictly preserve owner fields
        id: match.id,
        isFavorite: match.isFavorite,
        userStatus: match.userStatus,
        personalNotes: match.personalNotes,
        lastSyncedAt: new Date().toISOString(),
        isSample: false,
      });
    } else {
      addedCount += 1;
      const initHistory =
        inc.priceHistory && inc.priceHistory.length > 0
          ? inc.priceHistory
          : [{ date: inc.listedDate, price: inc.price, event: 'Listed' as const }];
      nextList.push({
        ...inc,
        priceHistory: initHistory,
        lastSyncedAt: new Date().toISOString(),
        isSample: false,
      });
    }
  }

  for (const old of retainedExisting) {
    if (!updatedIds.has(old.id)) {
      nextList.push(old);
    }
  }

  return { merged: nextList, addedCount, updatedCount };
}
