import { SCHEMA_VERSION, type Listing, type PersistedAppState } from '../types';

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
    // Fallback handled by localStorage mirror below
  }
}

export async function fetchSeedListings(): Promise<Listing[]> {
  const res = await fetch('/data/seed-listings.json', { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch seed listings (${res.status})`);
  }
  return (await res.json()) as Listing[];
}

export async function loadInitialState(): Promise<PersistedAppState> {
  const fromIdb = await readIdb();
  if (fromIdb && fromIdb.schemaVersion === SCHEMA_VERSION && Array.isArray(fromIdb.listings)) {
    return fromIdb;
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAppState;
      if (parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.listings)) {
        return parsed;
      }
    }
  } catch {
    // Ignore corrupt localStorage
  }

  const seedListings = await fetchSeedListings();
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const initial: PersistedAppState = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    listings: seedListings,
    copyOverrides: {},
    scratchpad:
      'Bellport Village notes:\n• Confirm Incorporated Village boundary for Ho-Hum ferry & Marina pass.\n• Ask Old Purchase Properties about quiet spring off-market gambrels south of Main St.',
    preferences: {
      theme: prefersDark ? 'dark' : 'light',
      privacyBlur: false,
      editMode: false,
    },
  };

  await saveState(initial);
  return initial;
}

export async function saveState(state: PersistedAppState): Promise<void> {
  const stamped: PersistedAppState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(stamped));
  } catch {
    // Quota or private mode
  }
  await writeIdb(stamped);
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
