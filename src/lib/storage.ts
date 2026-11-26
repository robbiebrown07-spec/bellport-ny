import {
  SCHEMA_VERSION,
  type Listing,
  type PersistedAppState,
  type SyncMetadata,
} from '../types';

const DB_NAME = 'bellport-watch-db';
const STORE_NAME = 'app-state';
const RECORD_KEY = 'primary-v1';
const LS_FALLBACK_KEY = 'bellport-watch:v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function readIdb(): Promise<PersistedAppState | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => resolve((req.result as PersistedAppState | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeIdb(state: PersistedAppState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(state, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback handled by localStorage mirror
  }
}

function normalizeAddrKey(addr: string): string {
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

function getBasePrefix(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export async function fetchSeedListings(bustCache = false): Promise<Listing[]> {
  const prefix = getBasePrefix();
  const qs = bustCache ? `?t=${Math.floor(Date.now() / 60_000)}` : '';
  const res = await fetch(`${prefix}data/seed-listings.json${qs}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch seed listings (${res.status})`);
  }
  const list = (await res.json()) as Listing[];
  return list.map((l) => ({
    ...l,
    photoUrl:
      l.photoUrl && !/^(https?:|data:|blob:)/i.test(l.photoUrl)
        ? `${prefix}${l.photoUrl.replace(/^\//, '')}`
        : l.photoUrl,
    photos: l.photos?.map((u) =>
      !/^(https?:|data:|blob:)/i.test(u) ? `${prefix}${u.replace(/^\//, '')}` : u
    ),
  }));
}

export async function fetchRemoteSyncStatus(): Promise<Partial<SyncMetadata>> {
  try {
    const prefix = getBasePrefix();
    const res = await fetch(`${prefix}data/sync-status.json?t=${Math.floor(Date.now() / 60_000)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { lastSyncAt?: string; lastSyncSummary?: string };
    return {
      lastSyncAt: data.lastSyncAt,
      lastSyncSummary: data.lastSyncSummary,
    };
  } catch {
    return {};
  }
}

/**
 * Merges daily-refreshed remote seed listings into the user's saved listings
 * while 100% preserving user favorites, notes, statuses, and custom entries.
 */
export function mergeRemoteSeedListings(existing: Listing[], remoteSeed: Listing[]): Listing[] {
  if (remoteSeed.length === 0) return existing;

  const byId = new Map<string, Listing>();
  const byAddr = new Map<string, Listing>();
  for (const item of existing) {
    byId.set(item.id, item);
    byAddr.set(normalizeAddrKey(item.address), item);
  }

  const matchedIds = new Set<string>();
  const merged: Listing[] = [];

  for (const inc of remoteSeed) {
    const prev = byId.get(inc.id) ?? byAddr.get(normalizeAddrKey(inc.address));
    if (prev) {
      matchedIds.add(prev.id);
      merged.push({
        ...prev,
        ...inc,
        id: prev.id,
        // Strictly preserve all user-owned fields!
        isFavorite: prev.isFavorite,
        userStatus: prev.userStatus,
        personalNotes: prev.personalNotes || inc.personalNotes,
      });
    } else {
      merged.push(inc);
    }
  }

  for (const old of existing) {
    if (!matchedIds.has(old.id)) {
      merged.push(old);
    }
  }

  return merged;
}

export interface BootstrapPayload {
  state: PersistedAppState;
  syncMeta: SyncMetadata;
}

/**
 * Single-round-trip bootstrap from /api/bootstrap with graceful fallback
 * to local IndexedDB / localStorage merged with fresh daily seed JSON.
 */
export async function loadBootstrap(): Promise<BootstrapPayload> {
  try {
    const res = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const payload = (await res.json()) as BootstrapPayload;
      saveStateSyncMirror(payload.state);
      await writeIdb(payload.state);
      return payload;
    }
  } catch {
    // Fall through to static / local IndexedDB + localStorage mode
  }

  // Prefer the newest timestamp between localStorage (synchronous 0ms mirror) and IndexedDB
  let savedState: PersistedAppState | null = null;
  const fromIdb = await readIdb();
  if (fromIdb && fromIdb.schemaVersion === SCHEMA_VERSION && Array.isArray(fromIdb.listings)) {
    savedState = fromIdb;
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAppState;
      if (parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.listings)) {
        if (!savedState || (parsed.updatedAt ?? '') >= (savedState.updatedAt ?? '')) {
          savedState = parsed;
        }
      }
    }
  } catch {
    // Ignore corrupt localStorage
  }

  const remoteStatus = await fetchRemoteSyncStatus();

  if (savedState) {
    try {
      const freshSeed = await fetchSeedListings(true);
      const mergedListings = mergeRemoteSeedListings(savedState.listings, freshSeed);
      const hydrated: PersistedAppState = {
        ...savedState,
        listings: mergedListings,
      };
      saveStateSyncMirror(hydrated);
      await writeIdb(hydrated);
      return {
        state: hydrated,
        syncMeta: {
          apiConfigured: false,
          cachedDetailsCount: mergedListings.length,
          ...remoteStatus,
        },
      };
    } catch {
      return {
        state: savedState,
        syncMeta: {
          apiConfigured: false,
          cachedDetailsCount: savedState.listings.length,
          ...remoteStatus,
        },
      };
    }
  }

  const seedListings = await fetchSeedListings(true);

  const initial: PersistedAppState = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    listings: seedListings,
    emailAlerts: [
      {
        id: 'email-alert-default',
        name: 'Historic Lanes Family Vacation House',
        email: 'robbiebrown07@gmail.com',
        frequency: 'immediately',
        minPrice: null,
        maxPrice: 2_500_000,
        minBeds: 3,
        minBaths: 2,
        minSqft: null,
        minLotAcres: null,
        belowSC: true,
        beautifulStreetsOnly: false,
        selectedStreets: [],
        poolMode: 'pool_or_room',
        feats: [],
        naturalQuery: '',
        notifyOnPriceDrop: true,
        enabled: true,
        createdAt: '2026-11-26',
      },
    ],
    copyOverrides: {},
    scratchpad:
      'Bellport Village notes:\n• Confirm Incorporated Village boundary for Ho-Hum ferry & Marina pass.\n• Ask Old Purchase Properties about quiet spring off-market gambrels south of Main St.',
    preferences: {
      theme: 'light',
      privacyBlur: false,
      editMode: false,
    },
  };

  await saveState(initial);
  return {
    state: initial,
    syncMeta: {
      apiConfigured: false,
      cachedDetailsCount: seedListings.length,
      ...remoteStatus,
    },
  };
}

/**
 * Synchronous 0ms write to localStorage so favorites, downvotes, and ideal search
 * updates are saved immediately even if the user closes/refreshes right away.
 */
export function saveStateSyncMirror(state: PersistedAppState): PersistedAppState {
  const stamped: PersistedAppState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(stamped));
  } catch {
    // Ignore quota error
  }
  return stamped;
}

export async function saveState(state: PersistedAppState): Promise<void> {
  const stamped = saveStateSyncMirror(state);
  await writeIdb(stamped);
  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stamped),
    });
  } catch {
    // Offline or static-only mode; localStorage + IndexedDB hold latest state
  }
}

export async function refreshFromRemoteSeed(
  currentState: PersistedAppState
): Promise<{ state: PersistedAppState; syncMeta: SyncMetadata }> {
  const [freshSeed, remoteStatus] = await Promise.all([
    fetchSeedListings(true),
    fetchRemoteSyncStatus(),
  ]);
  const nextState: PersistedAppState = {
    ...currentState,
    listings: mergeRemoteSeedListings(currentState.listings, freshSeed),
  };
  await saveState(nextState);
  return {
    state: nextState,
    syncMeta: {
      apiConfigured: false,
      cachedDetailsCount: nextState.listings.length,
      ...remoteStatus,
    },
  };
}

export async function saveRealtyApiKey(apiKey: string): Promise<SyncMetadata> {
  const res = await fetch('/api/config/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const data = (await res.json()) as { syncMeta?: SyncMetadata; error?: string };
  if (!res.ok || !data.syncMeta) {
    throw new Error(data.error ?? 'Failed to save API key.');
  }
  return data.syncMeta;
}

export async function triggerServerSync(): Promise<{
  state: PersistedAppState;
  syncMeta: SyncMetadata;
  summary: string;
}> {
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxNewDetails: 22 }),
  });
  const data = (await res.json()) as {
    state?: PersistedAppState;
    syncMeta?: SyncMetadata;
    summary?: string;
    error?: string;
  };
  if (!res.ok || !data.state || !data.syncMeta) {
    throw new Error(data.error ?? 'Bellport sync failed.');
  }
  await writeIdb(data.state);
  return {
    state: data.state,
    syncMeta: data.syncMeta,
    summary: data.summary ?? 'Sync complete.',
  };
}

export async function clipListingByUrl(url: string): Promise<Partial<Listing>> {
  const res = await fetch('/api/clip-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as { draft?: Partial<Listing>; error?: string };
  if (!res.ok || !data.draft) {
    throw new Error(data.error ?? 'Could not fetch listing URL.');
  }
  return data.draft;
}

export function exportStateAsJson(state: PersistedAppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bellport-watch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportListingsAsCsv(listings: Listing[]): void {
  const headers = [
    'id',
    'address',
    'area',
    'inVillage',
    'marketStatus',
    'userStatus',
    'price',
    'beds',
    'baths',
    'sqft',
    'pricePerSqft',
    'lotAcres',
    'yearBuilt',
    'annualTaxes',
    'floodZone',
    'style',
    'features',
    'brokerage',
    'photoCount',
    'personalNotes',
    'sourceUrl',
  ];

  const escapeCsv = (val: unknown): string => {
    const str = val === undefined || val === null ? '' : String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = listings.map((l) => [
    l.id,
    l.address,
    l.area,
    l.inVillage ? 'Yes' : 'No',
    l.marketStatus,
    l.userStatus,
    l.price,
    l.beds,
    l.baths,
    l.sqft,
    l.sqft > 0 ? Math.round(l.price / l.sqft) : '',
    l.lotAcres,
    l.yearBuilt,
    l.annualTaxes,
    l.floodZone,
    l.style,
    l.features.join('; '),
    l.brokerage,
    l.photos?.length ?? (l.photoUrl ? 1 : 0),
    l.personalNotes,
    l.sourceUrl ?? '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bellport-village-listings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedJson(raw: string): PersistedAppState {
  const parsed = JSON.parse(raw) as Partial<PersistedAppState> | Listing[];
  if (Array.isArray(parsed)) {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      listings: parsed.map((item) => ({ ...item, isSample: false })),
      copyOverrides: {},
      scratchpad: '',
      preferences: {
        theme: 'light',
        privacyBlur: false,
        editMode: false,
      },
    };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.listings)) {
    throw new Error('Invalid JSON backup: expected a PersistedAppState object or Listing[] array.');
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    listings: parsed.listings.map((item) => ({ ...item, isSample: false })),
    copyOverrides: parsed.copyOverrides ?? {},
    scratchpad: parsed.scratchpad ?? '',
    preferences: {
      theme: parsed.preferences?.theme ?? 'light',
      privacyBlur: parsed.preferences?.privacyBlur ?? false,
      editMode: false,
    },
  };
}
