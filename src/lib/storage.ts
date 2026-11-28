import {
  SCHEMA_VERSION,
  type Listing,
  type PersistedAppState,
  type SyncMetadata,
} from '../types';
import {
  applyVaultToAppState,
  canonicalHomeReactionKey,
  extractVaultFromAppState,
  getCachedReactionsVaultSync,
  loadMergedUserReactionsVault,
  mergeUserReactionsVaults,
  persistUserReactionsVault,
} from './userReactionsVault';

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

async function readIdb(): Promise<unknown> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
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
    // Fallback handled by localStorage + dedicated UserReactionsVault mirrors
  }
}

function normalizeAddrKey(addr: string): string {
  return (
    canonicalHomeReactionKey(addr) ??
    addr
      .toLowerCase()
      .replace(/,?\s*bellport(\s+village)?.*$/i, '')
      .replace(/[^a-z0-9]/g, '')
  );
}

/**
 * Forward-compatible state migrator: never discards user data if `SCHEMA_VERSION`
 * increments in a future app update. Preserves all user reactions, filters, and notes.
 */
export function migrateRawSavedState(raw: unknown): PersistedAppState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<PersistedAppState>;
  if (!Array.isArray(candidate.listings)) {
    return null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt:
      typeof candidate.updatedAt === 'string' && candidate.updatedAt
        ? candidate.updatedAt
        : '2000-01-01T00:00:00.000Z',
    listings: candidate.listings.map((item) => ({
      ...item,
      features: stripZoneX(item.features ?? []),
    })),
    savedParcelIds:
      candidate.savedParcelIds && typeof candidate.savedParcelIds === 'object'
        ? { ...candidate.savedParcelIds }
        : {},
    hiddenParcelIds:
      candidate.hiddenParcelIds && typeof candidate.hiddenParcelIds === 'object'
        ? { ...candidate.hiddenParcelIds }
        : {},
    parcelNotes:
      candidate.parcelNotes && typeof candidate.parcelNotes === 'object'
        ? { ...candidate.parcelNotes }
        : {},
    parcelStatuses:
      candidate.parcelStatuses && typeof candidate.parcelStatuses === 'object'
        ? { ...candidate.parcelStatuses }
        : {},
    reactionsVault: candidate.reactionsVault,
    activeFilters:
      candidate.activeFilters && typeof candidate.activeFilters === 'object'
        ? { ...candidate.activeFilters }
        : undefined,
    tasteFilters:
      candidate.tasteFilters && typeof candidate.tasteFilters === 'object'
        ? { ...candidate.tasteFilters }
        : undefined,
    idealSearchNotes:
      typeof candidate.idealSearchNotes === 'string' ? candidate.idealSearchNotes : undefined,
    streetAlerts: Array.isArray(candidate.streetAlerts) ? candidate.streetAlerts : undefined,
    emailAlerts: Array.isArray(candidate.emailAlerts) ? candidate.emailAlerts : undefined,
    aiTasteMemo:
      candidate.aiTasteMemo && typeof candidate.aiTasteMemo === 'object'
        ? candidate.aiTasteMemo
        : undefined,
    copyOverrides:
      candidate.copyOverrides && typeof candidate.copyOverrides === 'object'
        ? { ...candidate.copyOverrides }
        : {},
    scratchpad: typeof candidate.scratchpad === 'string' ? candidate.scratchpad : '',
    preferences: {
      theme: candidate.preferences?.theme === 'dark' ? 'dark' : 'light',
      privacyBlur: Boolean(candidate.preferences?.privacyBlur),
      editMode: Boolean(candidate.preferences?.editMode),
    },
  };
}

function getBasePrefix(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

function stripZoneX(features: string[]): string[] {
  return features.filter((f) => !/^(?:flood\s+)?zone\s*x$/i.test(f.trim()));
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
    features: stripZoneX(l.features ?? []),
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
  if (remoteSeed.length === 0) {
    return existing.map((item) => ({ ...item, features: stripZoneX(item.features ?? []) }));
  }

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
        features: stripZoneX(inc.features ?? prev.features ?? []),
        // Strictly preserve all user-owned fields!
        isFavorite: prev.isFavorite,
        userStatus: prev.userStatus,
        personalNotes: prev.personalNotes || inc.personalNotes,
      });
    } else {
      merged.push({
        ...inc,
        features: stripZoneX(inc.features ?? []),
      });
    }
  }

  for (const old of existing) {
    if (!matchedIds.has(old.id)) {
      merged.push({
        ...old,
        features: stripZoneX(old.features ?? []),
      });
    }
  }

  return merged;
}

export interface BootstrapPayload {
  state: PersistedAppState;
  syncMeta: SyncMetadata;
}

function readLocalStorageState(): PersistedAppState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    return migrateRawSavedState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Single-round-trip bootstrap from /api/bootstrap with graceful fallback
 * to local IndexedDB / localStorage merged with fresh daily seed JSON.
 * Always merges the triple-redundant UserReactionsVault (`localStorage` +
 * `IndexedDB` + `CacheStorage`) so hearts and dislikes survive every update!
 */
export async function loadBootstrap(): Promise<BootstrapPayload> {
  // 1. Always gather any locally stored state + triple-redundant UserReactionsVault FIRST
  //    so a fresh server container or app update can never overwrite saved hearts/dislikes.
  const fromIdb = migrateRawSavedState(await readIdb());
  const fromLs = readLocalStorageState();

  let savedState: PersistedAppState | null = fromIdb;
  if (fromLs && (!savedState || (fromLs.updatedAt ?? '') >= (savedState.updatedAt ?? ''))) {
    savedState = fromLs;
  }

  const vault = await loadMergedUserReactionsVault(
    extractVaultFromAppState(fromIdb),
    extractVaultFromAppState(fromLs)
  );

  try {
    const res = await fetch('/api/bootstrap', { cache: 'no-store' });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const payload = (await res.json()) as BootstrapPayload;
      const migratedServer = migrateRawSavedState(payload.state) ?? payload.state;
      const combinedVault = mergeUserReactionsVaults(
        extractVaultFromAppState(migratedServer),
        vault
      );
      await persistUserReactionsVault(combinedVault);

      const protectedServerState = applyVaultToAppState(
        {
          ...migratedServer,
          activeFilters: migratedServer.activeFilters ?? savedState?.activeFilters,
          tasteFilters: migratedServer.tasteFilters ?? savedState?.tasteFilters,
          idealSearchNotes: migratedServer.idealSearchNotes ?? savedState?.idealSearchNotes,
          emailAlerts:
            migratedServer.emailAlerts && migratedServer.emailAlerts.length > 0
              ? migratedServer.emailAlerts
              : savedState?.emailAlerts,
          aiTasteMemo: migratedServer.aiTasteMemo ?? savedState?.aiTasteMemo,
        },
        combinedVault
      );

      saveStateSyncMirror(protectedServerState);
      await writeIdb(protectedServerState);
      return {
        state: protectedServerState,
        syncMeta: payload.syncMeta,
      };
    }
  } catch {
    // Fall through to static / local IndexedDB + localStorage mode
  }

  const remoteStatus = await fetchRemoteSyncStatus();

  if (savedState) {
    try {
      const freshSeed = await fetchSeedListings(true);
      const mergedListings = mergeRemoteSeedListings(savedState.listings, freshSeed);
      const hydrated = applyVaultToAppState(
        {
          ...savedState,
          listings: mergedListings,
        },
        vault
      );
      saveStateSyncMirror(hydrated);
      await writeIdb(hydrated);
      return {
        state: hydrated,
        syncMeta: {
          apiConfigured: false,
          cachedDetailsCount: hydrated.listings.length,
          ...remoteStatus,
        },
      };
    } catch {
      const hydratedOffline = applyVaultToAppState(savedState, vault);
      saveStateSyncMirror(hydratedOffline);
      return {
        state: hydratedOffline,
        syncMeta: {
          apiConfigured: false,
          cachedDetailsCount: hydratedOffline.listings.length,
          ...remoteStatus,
        },
      };
    }
  }

  const seedListings = await fetchSeedListings(true);

  const initialRaw: PersistedAppState = {
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

  // Even on a brand-new `bellport-watch:v1` bootstrap, re-apply any surviving
  // UserReactionsVault from CacheStorage / IndexedDB / localStorage!
  const initial = applyVaultToAppState(initialRaw, vault);

  await saveState(initial);
  return {
    state: initial,
    syncMeta: {
      apiConfigured: false,
      cachedDetailsCount: initial.listings.length,
      ...remoteStatus,
    },
  };
}

/**
 * Synchronous 0ms write to localStorage so favorites, downvotes, and ideal search
 * updates are saved immediately even if the user closes/refreshes right away.
 * If the full listing bundle ever hits browser localStorage quota, falls back to a
 * compact listing mirror while preserving 100% of user hearts, dislikes, and notes.
 */
export function saveStateSyncMirror(state: PersistedAppState): PersistedAppState {
  const currentVault = getCachedReactionsVaultSync();
  const stamped: PersistedAppState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    reactionsVault: currentVault,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(stamped));
    }
  } catch {
    try {
      const compact: PersistedAppState = {
        ...stamped,
        listings: stamped.listings.map((l) => ({
          ...l,
          photos: l.photos?.slice(0, 3),
        })),
      };
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(compact));
    } catch {
      // Dedicated VAULT_LS_KEY + IndexedDB + CacheStorage still hold all user reactions
    }
  }
  return stamped;
}

export async function saveState(state: PersistedAppState): Promise<void> {
  const stamped = saveStateSyncMirror(state);
  await Promise.all([
    writeIdb(stamped),
    persistUserReactionsVault(getCachedReactionsVaultSync()),
  ]);
  try {
    await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stamped),
    });
  } catch {
    // Offline or static-only mode; localStorage + IndexedDB + CacheStorage hold latest state
  }
}

export async function refreshFromRemoteSeed(
  currentState: PersistedAppState
): Promise<{ state: PersistedAppState; syncMeta: SyncMetadata }> {
  const [freshSeed, remoteStatus, vault] = await Promise.all([
    fetchSeedListings(true),
    fetchRemoteSyncStatus(),
    loadMergedUserReactionsVault(extractVaultFromAppState(currentState)),
  ]);
  const nextState = applyVaultToAppState(
    {
      ...currentState,
      listings: mergeRemoteSeedListings(currentState.listings, freshSeed),
    },
    vault
  );
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
  const localVault = await loadMergedUserReactionsVault();
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
  const mergedVault = mergeUserReactionsVaults(
    extractVaultFromAppState(data.state),
    localVault
  );
  await persistUserReactionsVault(mergedVault);
  const protectedState = applyVaultToAppState(data.state, mergedVault);
  saveStateSyncMirror(protectedState);
  await writeIdb(protectedState);
  return {
    state: protectedState,
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
  const vault = mergeUserReactionsVaults(
    extractVaultFromAppState(state),
    getCachedReactionsVaultSync()
  );
  const fullBackup = applyVaultToAppState(state, vault);
  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bellport-watch-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportListingsAsCsv(
  listings: Listing[],
  savedParcelIds: Record<string, boolean> = {},
  hiddenParcelIds: Record<string, boolean> = {}
): void {
  const headers = [
    'id',
    'address',
    'area',
    'inVillage',
    'marketStatus',
    'hearted',
    'disliked',
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

  const rows = listings.map((l) => {
    const addrKey = canonicalHomeReactionKey(l.address);
    const isHidden = Boolean(
      hiddenParcelIds[l.id] ?? (addrKey ? hiddenParcelIds[addrKey] : false)
    );
    const isHearted =
      !isHidden &&
      Boolean(
        savedParcelIds[l.id] ?? (addrKey ? savedParcelIds[addrKey] : undefined) ?? l.isFavorite
      );
    return [
      l.id,
      l.address,
      l.area,
      l.inVillage ? 'Yes' : 'No',
      l.marketStatus,
      isHearted ? 'Yes' : 'No',
      isHidden ? 'Yes' : 'No',
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
    ];
  });

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
    const base: PersistedAppState = {
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
    const mergedVault = mergeUserReactionsVaults(
      getCachedReactionsVaultSync(),
      extractVaultFromAppState(base, base.updatedAt)
    );
    void persistUserReactionsVault(mergedVault);
    return applyVaultToAppState(base, mergedVault);
  }

  const migrated = migrateRawSavedState(parsed);
  if (!migrated) {
    throw new Error('Invalid JSON backup: expected a PersistedAppState object or Listing[] array.');
  }

  const importedAt = new Date().toISOString();
  const importedVault = extractVaultFromAppState(
    { ...migrated, updatedAt: migrated.updatedAt || importedAt },
    importedAt
  );
  const mergedVault = mergeUserReactionsVaults(getCachedReactionsVaultSync(), importedVault);
  void persistUserReactionsVault(mergedVault);

  return applyVaultToAppState(
    {
      ...migrated,
      updatedAt: importedAt,
      listings: migrated.listings.map((item) => ({ ...item, isSample: false })),
      preferences: {
        theme: migrated.preferences.theme,
        privacyBlur: migrated.preferences.privacyBlur,
        editMode: false,
      },
    },
    mergedVault
  );
}
