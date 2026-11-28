import type {
  Listing,
  PersistedAppState,
  UserReactionsVault,
  UserTrackStatus,
} from '../types';
import { normalizeBellportStreetText } from './nlSearch';

export const VAULT_LS_KEY = 'bellport-watch:user-reactions:v1';
export const VAULT_IDB_KEY = 'user-reactions-vault-v1';
export const VAULT_CACHE_NAME = 'bellport-watch-user-vault-v1';
export const VAULT_CACHE_URL = '/bellport-watch-local/user-reactions-vault.json';

const DB_NAME = 'bellport-watch-db';
const STORE_NAME = 'app-state';
const LEGACY_BASELINE_TS = '2000-01-01T00:00:00.000Z';

let inMemoryVault: UserReactionsVault | null = null;
let persistentStorageRequested = false;

/**
 * Produces a stable, canonical street-address key (e.g. `addr:16showellsptrd`)
 * so user hearts, dislikes, notes, and statuses survive even if an app/data
 * update re-indexes `parcelId` or `listing.id` values.
 */
export function canonicalHomeReactionKey(address: string | null | undefined): string | null {
  if (!address) return null;
  const stripped = address
    .replace(/,?\s*bellport(?:\s+village)?(?:\s*,?\s*ny)?(?:\s+\d{5}(?:-\d{4})?)?.*$/i, '')
    .trim();
  if (!stripped) return null;
  const normalized = normalizeBellportStreetText(stripped).replace(/[^a-z0-9]/g, '');
  return normalized ? `addr:${normalized}` : null;
}

/**
 * Collects all stable lookup keys (`parcelId`, `listingId`, and normalized `addr:...` keys)
 * for a single property so every reaction is anchored by both IDs and physical address.
 */
export function collectHomeReactionKeys(opts: {
  parcelId?: string | null;
  listingId?: string | null;
  addresses?: Array<string | null | undefined>;
}): string[] {
  const out = new Set<string>();
  if (opts.parcelId && opts.parcelId.trim()) out.add(opts.parcelId.trim());
  if (opts.listingId && opts.listingId.trim()) out.add(opts.listingId.trim());
  for (const addr of opts.addresses ?? []) {
    const k = canonicalHomeReactionKey(addr);
    if (k) out.add(k);
  }
  return Array.from(out);
}

export function createEmptyReactionsVault(): UserReactionsVault {
  return {
    vaultVersion: 1,
    updatedAt: LEGACY_BASELINE_TS,
    saved: {},
    hidden: {},
    notes: {},
    statuses: {},
    timestamps: {},
  };
}

function isValidVault(raw: unknown): raw is UserReactionsVault {
  if (!raw || typeof raw !== 'object') return false;
  const v = raw as Partial<UserReactionsVault>;
  return (
    typeof v.saved === 'object' &&
    v.saved !== null &&
    typeof v.hidden === 'object' &&
    v.hidden !== null
  );
}

function sanitizeVault(raw: Partial<UserReactionsVault>): UserReactionsVault {
  return {
    vaultVersion: 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : LEGACY_BASELINE_TS,
    saved: raw.saved && typeof raw.saved === 'object' ? { ...raw.saved } : {},
    hidden: raw.hidden && typeof raw.hidden === 'object' ? { ...raw.hidden } : {},
    notes: raw.notes && typeof raw.notes === 'object' ? { ...raw.notes } : {},
    statuses: raw.statuses && typeof raw.statuses === 'object' ? { ...raw.statuses } : {},
    timestamps: raw.timestamps && typeof raw.timestamps === 'object' ? { ...raw.timestamps } : {},
  };
}

/**
 * Merges any number of UserReactionsVault snapshots on a per-field, per-key basis
 * using ISO timestamps so the most recent user action on every house always wins
 * (preserving both hearts/dislikes AND intentional un-hearts/restores).
 */
export function mergeUserReactionsVaults(
  ...vaults: Array<UserReactionsVault | null | undefined>
): UserReactionsVault {
  const merged = createEmptyReactionsVault();

  for (const candidate of vaults) {
    if (!candidate || !isValidVault(candidate)) continue;
    const v = sanitizeVault(candidate);
    const defaultTs = v.updatedAt || LEGACY_BASELINE_TS;

    if (v.updatedAt > merged.updatedAt) {
      merged.updatedAt = v.updatedAt;
    }

    for (const [k, val] of Object.entries(v.saved)) {
      if (typeof val !== 'boolean') continue;
      const tsKey = `saved:${k}`;
      const incTs = v.timestamps[tsKey] ?? defaultTs;
      const curTs = merged.timestamps[tsKey];
      if (curTs === undefined || incTs >= curTs) {
        merged.saved[k] = val;
        merged.timestamps[tsKey] = incTs;
      }
    }

    for (const [k, val] of Object.entries(v.hidden)) {
      if (typeof val !== 'boolean') continue;
      const tsKey = `hidden:${k}`;
      const incTs = v.timestamps[tsKey] ?? defaultTs;
      const curTs = merged.timestamps[tsKey];
      if (curTs === undefined || incTs >= curTs) {
        merged.hidden[k] = val;
        merged.timestamps[tsKey] = incTs;
      }
    }

    for (const [k, val] of Object.entries(v.notes)) {
      if (typeof val !== 'string') continue;
      const tsKey = `notes:${k}`;
      const incTs = v.timestamps[tsKey] ?? defaultTs;
      const curTs = merged.timestamps[tsKey];
      if (curTs === undefined || incTs >= curTs) {
        merged.notes[k] = val;
        merged.timestamps[tsKey] = incTs;
      }
    }

    for (const [k, val] of Object.entries(v.statuses)) {
      if (typeof val !== 'string') continue;
      const tsKey = `statuses:${k}`;
      const incTs = v.timestamps[tsKey] ?? defaultTs;
      const curTs = merged.timestamps[tsKey];
      if (curTs === undefined || incTs >= curTs) {
        merged.statuses[k] = val as UserTrackStatus;
        merged.timestamps[tsKey] = incTs;
      }
    }
  }

  return merged;
}

/**
 * Extracts user hearts, dislikes, notes, and statuses from a PersistedAppState
 * (including legacy states saved prior to the dedicated vault or JSON backups).
 */
export function extractVaultFromAppState(
  state: Partial<PersistedAppState> | null | undefined,
  fallbackTimestamp = LEGACY_BASELINE_TS
): UserReactionsVault {
  if (!state || typeof state !== 'object') {
    return createEmptyReactionsVault();
  }

  const ts =
    typeof state.updatedAt === 'string' && state.updatedAt ? state.updatedAt : fallbackTimestamp;
  const extracted = createEmptyReactionsVault();
  extracted.updatedAt = ts;

  for (const [k, val] of Object.entries(state.savedParcelIds ?? {})) {
    if (typeof val === 'boolean') {
      extracted.saved[k] = val;
      extracted.timestamps[`saved:${k}`] = ts;
    }
  }

  for (const [k, val] of Object.entries(state.hiddenParcelIds ?? {})) {
    if (typeof val === 'boolean') {
      extracted.hidden[k] = val;
      extracted.timestamps[`hidden:${k}`] = ts;
    }
  }

  for (const [k, val] of Object.entries(state.parcelNotes ?? {})) {
    if (typeof val === 'string' && val.trim()) {
      extracted.notes[k] = val;
      extracted.timestamps[`notes:${k}`] = ts;
    }
  }

  for (const [k, val] of Object.entries(state.parcelStatuses ?? {})) {
    if (typeof val === 'string' && val !== 'unreviewed') {
      extracted.statuses[k] = val;
      extracted.timestamps[`statuses:${k}`] = ts;
    }
  }

  if (Array.isArray(state.listings)) {
    for (const item of state.listings) {
      if (!item || typeof item !== 'object') continue;
      const keys = collectHomeReactionKeys({
        listingId: item.id,
        addresses: [item.address],
      });

      // Only promote `item.isFavorite === true` from listing objects so un-touched
      // seed listings (`isFavorite: false` or `undefined`) never overwrite saved hearts!
      if (item.isFavorite === true) {
        for (const k of keys) {
          if (extracted.saved[k] === undefined) {
            extracted.saved[k] = true;
            extracted.timestamps[`saved:${k}`] = ts;
          }
        }
      }

      if (typeof item.personalNotes === 'string' && item.personalNotes.trim()) {
        for (const k of keys) {
          if (extracted.notes[k] === undefined) {
            extracted.notes[k] = item.personalNotes;
            extracted.timestamps[`notes:${k}`] = ts;
          }
        }
      }

      if (item.userStatus && item.userStatus !== 'unreviewed') {
        for (const k of keys) {
          if (extracted.statuses[k] === undefined) {
            extracted.statuses[k] = item.userStatus;
            extracted.timestamps[`statuses:${k}`] = ts;
          }
        }
      }
    }
  }

  if (state.reactionsVault && isValidVault(state.reactionsVault)) {
    return mergeUserReactionsVaults(extracted, state.reactionsVault);
  }

  return extracted;
}

function lookupByKeys<T>(rec: Record<string, T>, keys: Array<string | null | undefined>): T | undefined {
  for (const k of keys) {
    if (k && rec[k] !== undefined) {
      return rec[k];
    }
  }
  return undefined;
}

/**
 * Re-applies the authoritative UserReactionsVault onto any PersistedAppState
 * (after app updates, seed-listings refreshes, `/api/bootstrap`, `/api/sync`, or JSON import)
 * so hearts, dislikes, notes, and statuses are 100% preserved even if IDs changed.
 */
export function applyVaultToAppState(
  state: PersistedAppState,
  vault: UserReactionsVault
): PersistedAppState {
  const nextSaved: Record<string, boolean> = {
    ...(state.savedParcelIds ?? {}),
    ...vault.saved,
  };
  const nextHidden: Record<string, boolean> = {
    ...(state.hiddenParcelIds ?? {}),
    ...vault.hidden,
  };
  const nextNotes: Record<string, string> = {
    ...(state.parcelNotes ?? {}),
    ...vault.notes,
  };
  const nextStatuses: Record<string, UserTrackStatus> = {
    ...(state.parcelStatuses ?? {}),
    ...vault.statuses,
  };

  const nextListings: Listing[] = state.listings.map((item) => {
    const addrKey = canonicalHomeReactionKey(item.address);
    const lookupKeys = [item.id, addrKey];

    const vHidden = lookupByKeys(nextHidden, lookupKeys);
    const vSaved = lookupByKeys(nextSaved, lookupKeys);
    const vNote = lookupByKeys(nextNotes, lookupKeys);
    const vStatus = lookupByKeys(nextStatuses, lookupKeys);

    const isHidden = Boolean(vHidden);
    const isFavorite = !isHidden && (vSaved !== undefined ? Boolean(vSaved) : Boolean(item.isFavorite));

    if (vSaved !== undefined || item.isFavorite) {
      nextSaved[item.id] = isFavorite;
      if (addrKey) nextSaved[addrKey] = isFavorite;
    }
    if (vHidden !== undefined) {
      nextHidden[item.id] = isHidden;
      if (addrKey) nextHidden[addrKey] = isHidden;
    }

    return {
      ...item,
      isFavorite,
      personalNotes: vNote !== undefined && vNote !== '' ? vNote : item.personalNotes,
      userStatus: vStatus ?? item.userStatus,
    };
  });

  return {
    ...state,
    listings: nextListings,
    savedParcelIds: nextSaved,
    hiddenParcelIds: nextHidden,
    parcelNotes: nextNotes,
    parcelStatuses: nextStatuses,
    reactionsVault: vault,
  };
}

function openVaultDb(): Promise<IDBDatabase> {
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

function readVaultLocalStorage(): UserReactionsVault | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(VAULT_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidVault(parsed) ? sanitizeVault(parsed) : null;
  } catch {
    return null;
  }
}

function writeVaultLocalStorageSync(vault: UserReactionsVault): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VAULT_LS_KEY, JSON.stringify(vault));
  } catch {
    // Quota or private-browsing error; IndexedDB + CacheStorage mirrors still protect reactions
  }
}

async function readVaultIdb(): Promise<UserReactionsVault | null> {
  try {
    const db = await openVaultDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(VAULT_IDB_KEY);
      req.onsuccess = () => {
        const res = req.result as unknown;
        resolve(isValidVault(res) ? sanitizeVault(res) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeVaultIdb(vault: UserReactionsVault): Promise<void> {
  try {
    const db = await openVaultDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(vault, VAULT_IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Handled by localStorage + CacheStorage mirrors
  }
}

async function readVaultCacheStorage(): Promise<UserReactionsVault | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(VAULT_CACHE_NAME);
    const res = await cache.match(VAULT_CACHE_URL);
    if (!res) return null;
    const parsed = (await res.json()) as unknown;
    return isValidVault(parsed) ? sanitizeVault(parsed) : null;
  } catch {
    return null;
  }
}

async function writeVaultCacheStorage(vault: UserReactionsVault): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(VAULT_CACHE_NAME);
    const response = new Response(JSON.stringify(vault), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
    await cache.put(VAULT_CACHE_URL, response);
  } catch {
    // Handled by localStorage + IndexedDB mirrors
  }
}

/**
 * Asks Safari / iOS WebKit / Chromium to mark this origin's local storage, IndexedDB,
 * and CacheStorage as non-evictable persistent storage.
 */
export async function requestPersistentBrowserStorage(): Promise<boolean> {
  if (persistentStorageRequested) return true;
  persistentStorageRequested = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported environments
  }
  return false;
}

export function getCachedReactionsVaultSync(): UserReactionsVault {
  if (inMemoryVault) return inMemoryVault;
  const fromLs = readVaultLocalStorage();
  inMemoryVault = fromLs ?? createEmptyReactionsVault();
  return inMemoryVault;
}

/**
 * Reads from all 3 independent browser stores (`localStorage`, `IndexedDB`, and `CacheStorage`),
 * merges them with per-key timestamps so zero hearts or dislikes can ever be lost,
 * and heals all 3 mirrors with the unified result.
 */
export async function loadMergedUserReactionsVault(
  ...extraVaults: Array<UserReactionsVault | null | undefined>
): Promise<UserReactionsVault> {
  void requestPersistentBrowserStorage();
  const fromLs = readVaultLocalStorage();
  const [fromIdb, fromCache] = await Promise.all([readVaultIdb(), readVaultCacheStorage()]);
  const merged = mergeUserReactionsVaults(inMemoryVault, fromLs, fromIdb, fromCache, ...extraVaults);
  inMemoryVault = merged;
  writeVaultLocalStorageSync(merged);
  await Promise.all([writeVaultIdb(merged), writeVaultCacheStorage(merged)]);
  return merged;
}

export async function persistUserReactionsVault(vault: UserReactionsVault): Promise<void> {
  const merged = mergeUserReactionsVaults(inMemoryVault, readVaultLocalStorage(), vault);
  inMemoryVault = merged;
  writeVaultLocalStorageSync(merged);
  await Promise.all([writeVaultIdb(merged), writeVaultCacheStorage(merged)]);
}

/**
 * Synchronously records a heart, dislike, note, or status change at 0ms into `localStorage`
 * (and immediately flushes async copies to `IndexedDB` and `CacheStorage`) under every
 * identifier for the property (`parcelId`, `listingId`, and canonical street address).
 */
export function recordUserReaction(patch: {
  keys: string[];
  isFavorite?: boolean;
  isHidden?: boolean;
  personalNotes?: string;
  userStatus?: UserTrackStatus;
}): UserReactionsVault {
  const cleanKeys = Array.from(new Set(patch.keys.filter((k) => Boolean(k && k.trim()))));
  const current = mergeUserReactionsVaults(inMemoryVault, readVaultLocalStorage());
  if (cleanKeys.length === 0) {
    return current;
  }

  const now = new Date().toISOString();
  const next: UserReactionsVault = {
    vaultVersion: 1,
    updatedAt: now,
    saved: { ...current.saved },
    hidden: { ...current.hidden },
    notes: { ...current.notes },
    statuses: { ...current.statuses },
    timestamps: { ...current.timestamps },
  };

  for (const k of cleanKeys) {
    if (patch.isFavorite !== undefined) {
      next.saved[k] = patch.isFavorite;
      next.timestamps[`saved:${k}`] = now;
    }
    if (patch.isHidden !== undefined) {
      next.hidden[k] = patch.isHidden;
      next.timestamps[`hidden:${k}`] = now;
    }
    if (patch.personalNotes !== undefined) {
      next.notes[k] = patch.personalNotes;
      next.timestamps[`notes:${k}`] = now;
    }
    if (patch.userStatus !== undefined) {
      next.statuses[k] = patch.userStatus;
      next.timestamps[`statuses:${k}`] = now;
    }
  }

  inMemoryVault = next;
  writeVaultLocalStorageSync(next);
  void writeVaultIdb(next);
  void writeVaultCacheStorage(next);
  return next;
}

/**
 * Backfills canonical `addr:...` keys into the persistent vault for any parcel IDs
 * saved before address-key anchoring existed, without triggering extra React renders.
 */
export function backfillParcelAddressReactions(
  parcels: Array<{ id: string; addr: string }>,
  state: PersistedAppState
): void {
  const current = mergeUserReactionsVaults(
    inMemoryVault,
    readVaultLocalStorage(),
    extractVaultFromAppState(state)
  );

  let changed = false;
  for (const p of parcels) {
    const addrKey = canonicalHomeReactionKey(p.addr);
    if (!addrKey) continue;

    if (current.saved[p.id] !== undefined && current.saved[addrKey] === undefined) {
      const ts = current.timestamps[`saved:${p.id}`] ?? current.updatedAt;
      current.saved[addrKey] = current.saved[p.id];
      current.timestamps[`saved:${addrKey}`] = ts;
      changed = true;
    }

    if (current.hidden[p.id] !== undefined && current.hidden[addrKey] === undefined) {
      const ts = current.timestamps[`hidden:${p.id}`] ?? current.updatedAt;
      current.hidden[addrKey] = current.hidden[p.id];
      current.timestamps[`hidden:${addrKey}`] = ts;
      changed = true;
    }

    if (current.notes[p.id] !== undefined && current.notes[addrKey] === undefined) {
      const ts = current.timestamps[`notes:${p.id}`] ?? current.updatedAt;
      current.notes[addrKey] = current.notes[p.id];
      current.timestamps[`notes:${addrKey}`] = ts;
      changed = true;
    }

    if (current.statuses[p.id] !== undefined && current.statuses[addrKey] === undefined) {
      const ts = current.timestamps[`statuses:${p.id}`] ?? current.updatedAt;
      current.statuses[addrKey] = current.statuses[p.id];
      current.timestamps[`statuses:${addrKey}`] = ts;
      changed = true;
    }
  }

  inMemoryVault = current;
  if (changed) {
    writeVaultLocalStorageSync(current);
    void writeVaultIdb(current);
    void writeVaultCacheStorage(current);
  }
}
