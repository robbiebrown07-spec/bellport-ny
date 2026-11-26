import fs from 'node:fs';
import path from 'node:path';
import type { Listing, VillageParcelsBundle } from '../src/types.ts';
import { clipListingFromUrl, syncBellportFromRealtyApi } from '../server/realtyapi.ts';
import { mergeSyncedListings, readRealtyApiKey } from '../server/store.ts';

const ROOT = process.cwd();
const SEED_PATH = path.join(ROOT, 'public/data/seed-listings.json');
const PARCELS_PATH = path.join(ROOT, 'public/data/bellport-parcels.json');
const STATUS_PATH = path.join(ROOT, 'public/data/sync-status.json');

function canonAddr(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/,\s*(bellport|east patchogue|brookhaven|patchogue|ny|us).*$/i, '')
    .replace(/\./g, ' ')
    .replace(/\bfirst\b/g, '1st')
    .replace(/\bsecond\b/g, '2nd')
    .replace(/\bthird\b/g, '3rd')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bpoint\b/g, 'pt')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bgeneral\b/g, 'gen')
    .replace(/\bmcclean\b/g, 'mclean')
    .replace(/\bpeat hole\b/g, 'peathole')
    .replace(/\bthorn hedge\b/g, 'thornhedge')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function harvestOldPurchaseExclusives(
  parcelByAddr: Map<string, { id: string; addr: string }>
): Promise<Listing[]> {
  try {
    const res = await fetch('https://oldpurchase.com/exclusive-listings', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BellportWatchDailySync/1.0)',
        Accept: 'text/html',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const urls = Array.from(
      new Set(
        Array.from(html.matchAll(/https?:\/\/(?:www\.)?oldpurchase\.com\/properties\/[a-z0-9-]+/gi)).map(
          (m) => m[0].replace(/^http:/i, 'https:')
        )
      )
    ).slice(0, 20);

    const out: Listing[] = [];
    for (const u of urls) {
      try {
        const clipped = await clipListingFromUrl(u, '');
        if (!clipped.address || !clipped.price) continue;
        const matchParcel = parcelByAddr.get(canonAddr(clipped.address));
        if (!matchParcel) continue;
        out.push({
          id: `opp-${canonAddr(clipped.address).replace(/\s+/g, '-')}`,
          address: matchParcel.addr,
          area: clipped.area ?? 'Historic Lanes',
          inVillage: true,
          marketStatus: 'active',
          userStatus: 'unreviewed',
          isFavorite: false,
          price: clipped.price,
          beds: clipped.beds ?? 4,
          baths: clipped.baths ?? 3,
          sqft: clipped.sqft ?? 2400,
          lotAcres: clipped.lotAcres ?? 0.45,
          yearBuilt: 1925,
          annualTaxes: Math.round(clipped.price * 0.009),
          floodZone: 'X',
          daysOnMarket: 1,
          listedDate: new Date().toISOString().slice(0, 10),
          style: 'Bellport Village Residence',
          archetype: 'colonial',
          headline: clipped.headline ?? '',
          description: clipped.description ?? '',
          features: clipped.features ?? [],
          brokerage: 'Old Purchase Properties',
          sourceUrl: u,
          photoUrl: clipped.photoUrl,
          photos: clipped.photos,
          personalNotes: '',
          isSample: false,
        });
      } catch {
        // Ignore individual brokerage page parse errors
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const existingListings = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8')) as Listing[];
  const parcelsBundle = JSON.parse(fs.readFileSync(PARCELS_PATH, 'utf-8')) as VillageParcelsBundle;

  const parcelByAddr = new Map<string, { id: string; addr: string }>();
  for (const p of parcelsBundle.parcels) {
    if (!p.res) continue;
    parcelByAddr.set(canonAddr(p.addr), { id: p.id, addr: p.addr });
  }

  const incoming: Listing[] = [];
  const sourcesChecked: string[] = [];

  const apiKey = readRealtyApiKey();
  if (apiKey) {
    try {
      const mlsRun = await syncBellportFromRealtyApi(apiKey, 6);
      const villageOnly = mlsRun.listings.filter((l) => parcelByAddr.has(canonAddr(l.address)));
      incoming.push(...villageOnly);
      sourcesChecked.push(`OneKey MLS (${villageOnly.length} Village records)`);
    } catch (err) {
      console.warn('RealtyAPI sync skipped or failed:', err instanceof Error ? err.message : err);
    }
  }

  const oppExclusives = await harvestOldPurchaseExclusives(parcelByAddr);
  if (oppExclusives.length > 0) {
    incoming.push(...oppExclusives);
    sourcesChecked.push(`Old Purchase Properties (${oppExclusives.length} Village exclusives)`);
  } else {
    sourcesChecked.push('Old Purchase Properties feed');
  }

  const { merged, addedCount, updatedCount } = mergeSyncedListings(existingListings, incoming);
  fs.writeFileSync(SEED_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  // Keep parcel active listing links synchronized
  const activeByAddr = new Map<string, Listing>();
  for (const l of merged) {
    if (l.marketStatus === 'active') {
      activeByAddr.set(canonAddr(l.address), l);
    }
  }
  let activeParcelCount = 0;
  for (const p of parcelsBundle.parcels) {
    if (!p.res) continue;
    const activeMatch = activeByAddr.get(canonAddr(p.addr));
    if (activeMatch) {
      p.listingId = activeMatch.id;
      p.cat = 'for_sale';
      activeParcelCount += 1;
    }
  }
  parcelsBundle.counts.for_sale = activeParcelCount;
  fs.writeFileSync(PARCELS_PATH, JSON.stringify(parcelsBundle) + '\n', 'utf-8');

  const nowIso = new Date().toISOString();
  const summary =
    incoming.length > 0
      ? `Checked ${sourcesChecked.join(' + ')} · ${activeParcelCount} active Village homes (${addedCount} new, ${updatedCount} refreshed).`
      : `Checked ${sourcesChecked.join(' + ')} · ${activeParcelCount} active Village homes.`;

  fs.writeFileSync(
    STATUS_PATH,
    JSON.stringify(
      {
        lastSyncAt: nowIso,
        lastSyncSummary: summary,
        schedule: 'Daily at 7:00 AM ET',
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  console.log(`[daily-refresh] ${summary}`);
}

main().catch((err) => {
  console.error('[daily-refresh] Fatal error:', err);
  process.exit(1);
});
