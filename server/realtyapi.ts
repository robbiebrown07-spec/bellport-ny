import type { ArchetypeIllustration, FloodZone, Listing, MarketStatus } from '../src/types.ts';
import { BELLPORT_SEARCH_POLYGON, classifyBellportLocation } from './bellport-geo.ts';
import { loadDetailsCache, saveDetailsCache } from './store.ts';

const REALTOR_HOST = 'https://realtor.realtyapi.io';

// 60s circuit breaker per Blueprint Section 5.5
let cooldownUntil = 0;

export interface SyncRunResult {
  listings: Listing[];
  creditsRemaining?: number;
  creditsLimit?: number;
  searchHits: number;
  newDetailsFetched: number;
  usedCacheCount: number;
}

function str(val: unknown): string {
  return typeof val === 'string' ? val.trim() : '';
}

function num(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = Number(val.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(cleaned) ? cleaned : 0;
  }
  return 0;
}

function asObj(val: unknown): Record<string, unknown> {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : {};
}

function asArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function upgradeRdcpixUrl(rawUrl: string): string {
  if (!rawUrl.startsWith('http')) return '';
  const httpsUrl = rawUrl.replace(/^http:\/\//i, 'https://');
  // Upgrade small Realtor thumbnails (...s.jpg) to crisp large webp while keeping high-res ...od.jpg intact
  if (httpsUrl.includes('rdcpix.com')) {
    return httpsUrl.replace(/-[a-z0-9]+s\.jpg$/i, (m) =>
      m.replace(/s\.jpg$/i, 'od-w1024_h768_x2.webp')
    );
  }
  return httpsUrl;
}

function extractPhotos(...sources: Array<Record<string, unknown>>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const pushUrl = (u: unknown) => {
    const s = upgradeRdcpixUrl(str(u));
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };

  for (const src of sources) {
    if (typeof src.primary_photo === 'string') {
      pushUrl(src.primary_photo);
    } else {
      const primary = asObj(src.primary_photo);
      pushUrl(primary.href ?? primary.url ?? src.photo ?? src.thumbnail);
    }

    for (const p of asArr(src.photos)) {
      if (typeof p === 'string') pushUrl(p);
      else {
        const po = asObj(p);
        pushUrl(po.href ?? po.url ?? po.src);
      }
    }
  }

  return out.slice(0, 28);
}

const PROSE_KEYWORDS: Array<[RegExp, string]> = [
  [/gunite\s+pool|saltwater\s+pool|heated\s+pool|\binground\s+pool\b/i, 'heated gunite pool'],
  [/\bpool\b/i, 'pool'],
  [/room\s+for\s+(?:a\s+)?pool|pool\s+site|pool\s+permit/i, 'room for pool'],
  [/screened\s+(?:mahogany\s+|dining\s+)?porch/i, 'screened porch'],
  [/wrap[-\s]?around\s+porch|covered\s+porch/i, 'porch'],
  [/fireplace|wood[-\s]?burning|wood\s+stove/i, 'fireplace'],
  [/guest\s+(?:cottage|house|studio|suite)|carriage\s+(?:house|barn)/i, 'guest cottage'],
  [/waterfront|bayfront|bulkhead|dock|bellport\s+bay/i, 'waterfront'],
  [/outdoor\s+shower/i, 'outdoor shower'],
  [/generator/i, 'generator'],
  [/historic\s+district/i, 'historic district'],
  [/renovated|turnkey|gut\s+renovation|chef'?s\s+kitchen/i, 'renovated'],
  [/central\s+air|cac/i, 'central air'],
];

function extractFeatureTags(
  prose: string,
  rawTags: unknown[],
  inVillage: boolean,
  floodZone: FloodZone
): string[] {
  const set = new Set<string>();

  for (const [rx, label] of PROSE_KEYWORDS) {
    if (rx.test(prose)) {
      if (label === 'pool' && set.has('heated gunite pool')) continue;
      set.add(label);
    }
  }

  const keepTagMap: Record<string, string> = {
    swimming_pool: 'pool',
    fireplace: 'fireplace',
    waterfront: 'waterfront',
    water_view: 'bay views',
    guest_house: 'guest cottage',
    screened_porch: 'screened porch',
    hardwood_floors: 'hardwood floors',
    central_air: 'central air',
    two_or_more_stories: 'two-story',
    single_story: 'single-level',
  };

  for (const t of rawTags) {
    const key = str(t).toLowerCase();
    if (keepTagMap[key]) set.add(keepTagMap[key]);
  }

  if (floodZone === 'X') set.add('Zone X');
  if (!inVillage) set.add('outside village boundary');

  return Array.from(set).slice(0, 12);
}

function inferArchetype(prose: string, style: string, hasPool: boolean): ArchetypeIllustration {
  const combined = `${prose} ${style}`.toLowerCase();
  if (/waterfront|bayfront|bulkhead|shore\s+rd/.test(combined)) return 'bayfront';
  if (/modern\s+barn|contemporary|post\s+modern/.test(combined)) return 'modern-barn';
  if (/victorian|gambrel|queen\s+anne|shingle[-\s]?style/.test(combined)) return 'victorian';
  if (hasPool) return 'shingle-pool';
  if (/cottage|ranch|bungalow|cape/.test(combined)) return 'cottage';
  return 'colonial';
}

function slugFromAddress(address: string, propId: string): string {
  const clean = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const suffix = propId ? propId.slice(-5) : Date.now().toString(36).slice(-4);
  return `bp-${clean || 'home'}-${suffix}`;
}

function findResultArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map(asObj);
  const root = asObj(payload);
  const data = asObj(root.data);
  const homeSearch = asObj(data.home_search ?? root.home_search);

  const candidates = [
    root.searchResults,
    data.searchResults,
    homeSearch.results,
    homeSearch.properties,
    data.results,
    data.properties,
    data.listings,
    root.results,
    root.properties,
    root.listings,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c.map(asObj);
  }
  return [];
}

function unwrapDetailObject(payload: unknown): Record<string, unknown> {
  const root = asObj(payload);
  const data = asObj(root.data);
  if (data.home && typeof data.home === 'object') return asObj(data.home);
  if (root.home && typeof root.home === 'object') return asObj(root.home);
  if (data.property && typeof data.property === 'object') return asObj(data.property);
  if (Object.keys(data).length > 3) return data;
  return root;
}

function inferStyleLabel(prose: string, rawPropType: string, yearBuilt: number): string {
  const lower = prose.toLowerCase();
  if (/center\s+hall\s+colonial|\bcolonial\b/.test(lower)) return 'Center Hall Colonial';
  if (/cedar[-\s]?shingled?\s+cape|\bcape\b/.test(lower)) return 'Cedar-Shingle Cape';
  if (/cedar[-\s]?shingled?\s+cottage|\bcottage\b/.test(lower)) return 'Village Shingle Cottage';
  if (/victorian|queen\s+anne|gambrel/.test(lower)) return 'Historic Shingle / Gambrel';
  if (/high\s+ranch/.test(lower)) return 'Renovated High Ranch';
  if (/\branch\b|single[-\s]level/.test(lower)) return 'Village Ranch';
  if (/modern\s+barn|contemporary|design[-\s]forward/.test(lower)) return 'Contemporary Country Home';
  if (/multi_family|two[-\s]family/i.test(`${rawPropType} ${lower}`)) return 'Two-Family Residence';
  if (yearBuilt < 1935) return 'Historic Village Residence';
  return 'Bellport Residence';
}

export function normalizeRealtyRecord(
  card: Record<string, unknown>,
  detailRaw?: Record<string, unknown>
): Listing | null {
  const detail = detailRaw ? unwrapDetailObject(detailRaw) : {};

  const propType = str(detail.property_type ?? card.property_type).toLowerCase();
  if (propType === 'land' || propType === 'lots_land') {
    return null;
  }

  const propId = str(
    card.property_id ?? card.propertyId ?? detail.property_id ?? detail.propertyId ?? card.id
  );

  // Location & address
  const loc = asObj(detail.location ?? card.location);
  const addrObj = asObj(loc.address ?? detail.address ?? card.address);
  const coord = asObj(addrObj.coordinate ?? loc.coordinate ?? card.coordinate);

  const streetLine = str(
    addrObj.line ??
      addrObj.street ??
      card.street_address ??
      card.address_line ??
      card.formattedAddress
  );
  const city = str(addrObj.city ?? card.city);
  const postalCode = str(addrObj.postal_code ?? addrObj.zip ?? card.postal_code);

  if (!streetLine) return null;

  const lat =
    num(addrObj.latitude ?? coord.lat ?? addrObj.lat ?? card.latitude ?? detail.latitude) ||
    undefined;
  const lon =
    num(
      addrObj.longitude ??
        coord.lon ??
        coord.lng ??
        addrObj.lon ??
        card.longitude ??
        detail.longitude
    ) || undefined;

  const descBlock = asObj(detail.description ?? card.description);
  const cardDescBlock = asObj(card.description);

  const verbatimRemarks = str(
    detail.description_text ??
      card.description_text ??
      descBlock.text ??
      (typeof detail.description === 'string' ? detail.description : '') ??
      detail.remarks ??
      detail.public_remarks ??
      cardDescBlock.text ??
      (typeof card.description === 'string' ? card.description : '')
  );

  // Filter out miscoded MLS cities (e.g. Remsenburg miscoded into 11713)
  if (/remsenburg|westhampton|quogue|riverhead|mastic|shirley|medford/i.test(city)) {
    return null;
  }
  if (/\bon\s+one\s+of\s+remsenburg/i.test(verbatimRemarks)) {
    return null;
  }

  const { area, inVillage, walkToMarinaMin } = classifyBellportLocation(streetLine, lat, lon);

  // Keep Bellport Village, Bellport 11713, and immediate Bellport-border Brookhaven Hamlet homes
  const isBellportArea =
    inVillage ||
    postalCode === '11713' ||
    /bellport/i.test(city) ||
    (/brookhaven/i.test(city) && /bellport/i.test(verbatimRemarks));

  if (!isBellportArea) {
    return null;
  }

  const rawStatus = str(detail.status ?? card.status ?? card.prop_status).toLowerCase();
  let marketStatus: MarketStatus = 'active';
  if (rawStatus.includes('sold') || rawStatus.includes('closed')) {
    marketStatus = 'sold';
  } else if (rawStatus.includes('pending') || rawStatus.includes('contingent')) {
    marketStatus = 'contingent';
  } else if (rawStatus.includes('off')) {
    marketStatus = 'off-market';
  }

  const rawListPrice = num(detail.list_price ?? card.list_price ?? card.price ?? detail.price);
  const rawSoldPrice = num(detail.last_sold_price ?? card.last_sold_price);

  const listPrice =
    marketStatus === 'sold' ? rawSoldPrice || rawListPrice : rawListPrice || rawSoldPrice;
  const soldPrice = marketStatus === 'sold' ? rawSoldPrice || listPrice || undefined : undefined;

  if (listPrice <= 0) return null;

  const priceReducedAmt = num(detail.price_reduced_amount ?? card.price_reduced_amount);
  let originalPrice: number | undefined;
  if (marketStatus === 'sold' && rawListPrice > listPrice) {
    originalPrice = rawListPrice;
  } else if (priceReducedAmt > 0) {
    originalPrice = listPrice + priceReducedAmt;
  }

  const beds =
    num(descBlock.beds ?? cardDescBlock.beds ?? card.beds ?? detail.beds ?? card.bedrooms) || 0;
  if (beds === 0 && /vacant\s+lot|opportunity\s+to\s+build/i.test(verbatimRemarks)) {
    return null;
  }

  const bathsFull = num(descBlock.baths_full ?? cardDescBlock.baths_full);
  const bathsHalf = num(descBlock.baths_half ?? cardDescBlock.baths_half);
  const baths =
    num(
      descBlock.baths_consolidated ??
        descBlock.baths ??
        cardDescBlock.baths_consolidated ??
        cardDescBlock.baths ??
        card.baths ??
        detail.baths ??
        card.bathrooms
    ) ||
    (bathsFull > 0 ? bathsFull + (bathsHalf > 0 ? 0.5 : 0) : 2);

  let sqft =
    num(descBlock.sqft ?? cardDescBlock.sqft ?? card.sqft ?? detail.sqft ?? card.squareFootage) ||
    0;
  if (sqft === 0 && verbatimRemarks) {
    const proseSqft = verbatimRemarks.match(
      /\b([1-8],\d{3}|\d{3,4})\s*(?:sq\.?\s*ft|square[-\s]+feet|square[-\s]+foot)\b(?!\s*(?:property|lot|parcel))/i
    );
    if (proseSqft) {
      sqft = num(proseSqft[1]);
    }
  }

  const lotSqft = num(
    descBlock.lot_sqft ?? cardDescBlock.lot_sqft ?? card.lot_sqft ?? detail.lot_sqft
  );
  const lotAcres =
    lotSqft > 0
      ? Number((lotSqft / 43560).toFixed(2))
      : num(card.lotAcres ?? detail.lotAcres) || 0.35;

  const yearBuilt =
    num(descBlock.year_built ?? cardDescBlock.year_built ?? card.year_built ?? detail.year_built) ||
    1950;

  // Tax assessment (supports includeTax=true on /search/bypolygon as well as detail.tax_history)
  const taxObj = asObj(detail.tax ?? card.tax);
  let annualTaxes = num(taxObj.tax) > 500 ? Math.round(num(taxObj.tax)) : 0;
  if (!annualTaxes) {
    for (const th of asArr(detail.tax_history ?? card.tax_history)) {
      const tAmt = num(asObj(th).tax);
      if (tAmt > 500) {
        annualTaxes = Math.round(tAmt);
        break;
      }
    }
  }
  if (!annualTaxes) {
    annualTaxes = Math.round(listPrice * 0.0095);
  }

  // Flood zone detection
  const localBlock = asObj(detail.local);
  const floodBlock = asObj(localBlock.flood);
  const femaStr = str(floodBlock.fema_zone ?? floodBlock.flood_zone).toUpperCase();
  let floodZone: FloodZone = 'X';
  if (femaStr.includes('VE') || /\bzone\s*ve\b/i.test(verbatimRemarks)) floodZone = 'VE';
  else if (
    femaStr.includes('AE') ||
    /\bzone\s*ae\b/i.test(verbatimRemarks) ||
    /secluded\s+waterfront|direct\s+waterfront|bulkhead/i.test(verbatimRemarks)
  ) {
    floodZone = 'AE';
  }

  const rawStyle = str(
    descBlock.styles ? asArr(descBlock.styles)[0] : (descBlock.sub_type ?? propType)
  );
  const style = inferStyleLabel(verbatimRemarks, rawStyle, yearBuilt);

  const rawTags = [...asArr(detail.tags), ...asArr(card.tags)];
  const features = extractFeatureTags(verbatimRemarks, rawTags, inVillage, floodZone);
  const photos = extractPhotos(detail, card);

  // Source URL
  const rawHref = str(detail.href ?? card.href ?? detail.permalink ?? card.permalink ?? card.url);
  let sourceUrl: string | undefined;
  if (rawHref.startsWith('http')) {
    sourceUrl = rawHref;
  } else if (rawHref) {
    sourceUrl = `https://www.realtor.com/${rawHref.replace(/^\/+/, '').replace(/^(?!realestateandhomes-detail)/, 'realestateandhomes-detail/')}`;
  }

  // Brokerage & MLS (handles both string office in searchResults and nested office.name in details)
  const advertisers = asArr(detail.advertisers ?? card.advertisers);
  const adv0 = asObj(advertisers[0]);
  const officeStr =
    typeof adv0.office === 'string' ? adv0.office : str(asObj(adv0.office).name);
  const branding = asArr(detail.branding ?? card.branding);
  const brokerage =
    officeStr || str(asObj(branding[0]).name ?? card.office_name) || 'Bellport Area Brokerage';

  const sourceBlock = asObj(detail.source ?? card.source);
  const mlsId =
    str(sourceBlock.id ?? card.mls_id ?? detail.mls_id ?? card.listing_id) || undefined;

  const listDateRaw = str(detail.list_date ?? card.list_date ?? card.last_sold_date);
  const listedDate = listDateRaw
    ? listDateRaw.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const soldDateRaw = str(detail.last_sold_date ?? card.last_sold_date).slice(0, 10);
  const reducedDateRaw = str(detail.price_reduced_date ?? card.price_reduced_date).slice(0, 10);

  const daysOnMarket =
    num(detail.days_on_realtor ?? card.days_on_market) ||
    Math.max(
      1,
      Math.min(
        365,
        Math.round((Date.now() - new Date(listedDate).getTime()) / (1000 * 60 * 60 * 24)) || 1
      )
    );

  const firstSentence =
    verbatimRemarks.split(/(?<=[.!?])\s+/)[0]?.slice(0, 135) ||
    `${beds || 3}-bedroom residence on ${lotAcres} acres in ${area}.`;

  // Extract historical price events from Realtor property_history or reduction/sold fields
  const propHistoryRaw = asArr(detail.property_history ?? card.property_history);
  const priceHistory: Array<{
    date: string;
    price: number;
    event: 'Listed' | 'Price Cut' | 'Price Increase' | 'In Contract' | 'Sold' | 'Observed';
  }> = [];

  for (const ev of propHistoryRaw) {
    const eo = asObj(ev);
    const evDate = str(eo.date).slice(0, 10);
    const evPrice = num(eo.price);
    const evName = str(eo.event_name).toLowerCase();
    if (!evDate || evPrice <= 0) continue;

    let mappedEvent: 'Listed' | 'Price Cut' | 'Price Increase' | 'In Contract' | 'Sold' | 'Observed' =
      'Observed';
    if (evName.includes('listed')) mappedEvent = 'Listed';
    else if (evName.includes('price changed') || evName.includes('reduced')) mappedEvent = 'Price Cut';
    else if (evName.includes('pending') || evName.includes('contingent')) mappedEvent = 'In Contract';
    else if (evName.includes('sold')) mappedEvent = 'Sold';

    priceHistory.push({ date: evDate, price: evPrice, event: mappedEvent });
  }
  priceHistory.sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 1; i < priceHistory.length; i += 1) {
    if (priceHistory[i].event === 'Price Cut' && priceHistory[i].price > priceHistory[i - 1].price) {
      priceHistory[i].event = 'Price Increase';
    }
  }

  if (priceHistory.length === 0) {
    if (marketStatus === 'sold') {
      const closeDate = soldDateRaw || listedDate;
      if (rawListPrice > 0 && rawListPrice !== listPrice) {
        const priorDate =
          listedDate < closeDate
            ? listedDate
            : new Date(new Date(closeDate).getTime() - 75 * 86400000).toISOString().slice(0, 10);
        priceHistory.push({ date: priorDate, price: rawListPrice, event: 'Listed' });
        if (rawListPrice > listPrice) {
          const midDate = new Date(
            (new Date(priorDate).getTime() + new Date(closeDate).getTime()) / 2
          )
            .toISOString()
            .slice(0, 10);
          priceHistory.push({
            date: midDate,
            price: Math.round((rawListPrice + listPrice) / 2 / 5000) * 5000,
            event: 'Price Cut',
          });
        }
      }
      priceHistory.push({ date: closeDate, price: listPrice, event: 'Sold' });
    } else if (originalPrice && originalPrice > listPrice) {
      priceHistory.push({ date: listedDate, price: originalPrice, event: 'Listed' });
      priceHistory.push({
        date: reducedDateRaw && reducedDateRaw >= listedDate ? reducedDateRaw : new Date().toISOString().slice(0, 10),
        price: listPrice,
        event: 'Price Cut',
      });
    } else {
      priceHistory.push({
        date: listedDate,
        price: listPrice,
        event: 'Listed',
      });
    }
  }

  const displayAddress =
    city && !/bellport/i.test(city) ? `${streetLine} (${city})` : streetLine;

  return {
    id: slugFromAddress(streetLine, propId),
    externalId: propId || undefined,
    address: displayAddress,
    area,
    inVillage,
    latitude: lat,
    longitude: lon,
    marketStatus,
    userStatus: 'unreviewed',
    price: listPrice,
    originalPrice,
    soldPrice,
    priceHistory,
    beds: beds || 3,
    baths,
    sqft,
    lotAcres,
    yearBuilt,
    annualTaxes,
    floodZone,
    walkToMarinaMin,
    daysOnMarket,
    listedDate: marketStatus === 'sold' && soldDateRaw ? soldDateRaw : listedDate,
    style,
    archetype: inferArchetype(verbatimRemarks, style, features.some((f) => f.includes('pool'))),
    headline: firstSentence,
    description:
      verbatimRemarks ||
      `${beds || 3} bedrooms, ${baths} baths${sqft ? `, ${sqft.toLocaleString()} sq ft` : ''} on ${lotAcres} acres at ${streetLine}.`,
    features,
    brokerage,
    mlsId,
    sourceUrl,
    photoUrl: photos[0],
    photos,
    personalNotes: '',
    isSample: false,
  };
}

async function fetchPolygonSearch(
  apiKey: string,
  searchType: 'For_Sale' | 'Sold',
  resultCount: number,
  sortOrder: string
): Promise<{
  results: Record<string, unknown>[];
  creditsRemaining?: number;
  creditsLimit?: number;
}> {
  const searchUrl = new URL(`${REALTOR_HOST}/search/bypolygon`);
  searchUrl.searchParams.set('polygon', BELLPORT_SEARCH_POLYGON);
  searchUrl.searchParams.set('searchType', searchType);
  searchUrl.searchParams.set('propertyType', 'House,Condo,Townhome,Multi_Family');
  searchUrl.searchParams.set('resultCount', String(resultCount));
  searchUrl.searchParams.set('sortOrder', sortOrder);
  searchUrl.searchParams.set('includeTax', 'true');

  const searchRes = await fetch(searchUrl, {
    headers: {
      'x-realtyapi-key': apiKey,
      Accept: 'application/json',
    },
  });

  if (searchRes.status === 429 || searchRes.status >= 500) {
    cooldownUntil = Date.now() + 60_000;
  }

  if (!searchRes.ok) {
    const errText = await searchRes.text().catch(() => '');
    throw new Error(
      `RealtyAPI ${searchType} search failed (${searchRes.status}): ${errText.slice(0, 180) || searchRes.statusText}`
    );
  }

  const rem = Number(searchRes.headers.get('x-credits-remaining') ?? NaN);
  const lim = Number(searchRes.headers.get('x-credits-limit') ?? NaN);
  const searchJson = (await searchRes.json()) as unknown;

  return {
    results: findResultArray(searchJson),
    creditsRemaining: Number.isFinite(rem) ? rem : undefined,
    creditsLimit: Number.isFinite(lim) ? lim : undefined,
  };
}

export async function syncBellportFromRealtyApi(
  apiKey: string,
  maxNewDetails = 4
): Promise<SyncRunResult> {
  if (Date.now() < cooldownUntil) {
    const secs = Math.ceil((cooldownUntil - Date.now()) / 1000);
    throw new Error(`Upstream API cooldown active — retry in ${secs}s.`);
  }

  // 1 credit: All active For_Sale listings in Bellport polygon (includes photos[], description_text, and tax)
  const activeRun = await fetchPolygonSearch(apiKey, 'For_Sale', 80, 'Newest');
  let creditsRemaining = activeRun.creditsRemaining;
  let creditsLimit = activeRun.creditsLimit;

  // 1 credit: Recent Sold Bellport comps for valuation & longitudinal price benchmarking
  let soldResults: Record<string, unknown>[] = [];
  try {
    const soldRun = await fetchPolygonSearch(apiKey, 'Sold', 12, 'Most_Recently_Sold');
    soldResults = soldRun.results;
    if (soldRun.creditsRemaining !== undefined) creditsRemaining = soldRun.creditsRemaining;
    if (soldRun.creditsLimit !== undefined) creditsLimit = soldRun.creditsLimit;
  } catch {
    // Non-fatal if Sold comps query fails
  }

  const rawResults = [...activeRun.results, ...soldResults];
  const detailsCache = loadDetailsCache();
  let newDetailsFetched = 0;
  let usedCacheCount = 0;
  const normalizedListings: Listing[] = [];

  for (const card of rawResults) {
    const propId = str(card.property_id ?? card.propertyId ?? card.id);
    let detailObj: Record<string, unknown> | undefined = propId
      ? detailsCache[propId]
      : undefined;

    const cardAlreadyComplete =
      Boolean(str(card.description_text)) && asArr(card.photos).length > 0;

    if (detailObj) {
      usedCacheCount += 1;
    } else if (!cardAlreadyComplete && propId && newDetailsFetched < maxNewDetails) {
      try {
        const detailUrl = new URL(`${REALTOR_HOST}/details/byid`);
        detailUrl.searchParams.set('property_id', propId);
        const listingId = str(card.listing_id ?? card.listingId);
        if (listingId) detailUrl.searchParams.set('listing_id', listingId);

        const detailRes = await fetch(detailUrl, {
          headers: {
            'x-realtyapi-key': apiKey,
            Accept: 'application/json',
          },
        });

        const remHeader = Number(detailRes.headers.get('x-credits-remaining') ?? NaN);
        const limHeader = Number(detailRes.headers.get('x-credits-limit') ?? NaN);
        if (Number.isFinite(remHeader)) creditsRemaining = remHeader;
        if (Number.isFinite(limHeader)) creditsLimit = limHeader;

        if (detailRes.ok) {
          detailObj = asObj(await detailRes.json());
          detailsCache[propId] = detailObj;
          newDetailsFetched += 1;
          saveDetailsCache(detailsCache);
        } else if (detailRes.status === 429 || detailRes.status >= 500) {
          cooldownUntil = Date.now() + 60_000;
          break;
        }
      } catch {
        // Gracefully fall back to search card attributes
      }
    }

    const normalized = normalizeRealtyRecord(card, detailObj);
    if (normalized) {
      normalizedListings.push(normalized);
    }
  }

  return {
    listings: normalizedListings,
    creditsRemaining,
    creditsLimit,
    searchHits: rawResults.length,
    newDetailsFetched,
    usedCacheCount,
  };
}

/**
 * Clips a single listing URL:
 * - Uses RealtyAPI /details/byurl when given a realtor.com URL + configured key.
 * - Uses clean HTML JSON-LD / OpenGraph extraction for boutique local broker pages (e.g. oldpurchase.com).
 */
export async function clipListingFromUrl(
  targetUrl: string,
  apiKey: string
): Promise<Partial<Listing>> {
  const trimmed = targetUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Please enter a valid http:// or https:// listing URL.');
  }

  if (/realtor\.com/i.test(trimmed) && apiKey) {
    const u = new URL(`${REALTOR_HOST}/details/byurl`);
    u.searchParams.set('url', trimmed);
    const res = await fetch(u, {
      headers: { 'x-realtyapi-key': apiKey, Accept: 'application/json' },
    });
    if (res.ok) {
      const json = asObj(await res.json());
      const normalized = normalizeRealtyRecord(unwrapDetailObject(json), json);
      if (normalized) return normalized;
    }
  }

  // Public HTML metadata & JSON-LD extraction for boutique broker pages (e.g. oldpurchase.com)
  const res = await fetch(trimmed, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BellportWatchClipper/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!res.ok) {
    throw new Error(
      `Site blocked direct server fetch (${res.status}). Use the 1-Click Browser Bookmarklet or Smart Paste tab instead.`
    );
  }

  const html = await res.text();
  const photos: string[] = [];
  const pushImg = (u?: string) => {
    if (u && /^https?:\/\//i.test(u) && !/logo|icon|avatar|sprite/i.test(u) && !photos.includes(u)) {
      photos.push(u);
    }
  };

  // Extract OpenGraph tags
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    '';
  const ogDesc =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    '';
  const ogImage = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  )?.[1];
  pushImg(ogImage);

  // Extract JSON-LD blocks if present
  let ldText = '';
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]) as Record<string, unknown>;
      if (typeof parsed.description === 'string') ldText += ` ${parsed.description}`;
      if (typeof parsed.image === 'string') pushImg(parsed.image);
      if (Array.isArray(parsed.image)) {
        for (const img of parsed.image) {
          if (typeof img === 'string') pushImg(img);
          else if (img && typeof img === 'object') pushImg(str(asObj(img).url));
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  // High-res gallery images in HTML
  const imgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|webp|png)(?:\?[^"']*)?)["']/gi;
  while ((m = imgRegex.exec(html)) !== null && photos.length < 18) {
    pushImg(m[1]);
  }

  // Plain text strip for regex attribute extraction
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 6000);

  const combinedText = `${ogTitle}\n${ogDesc}\n${ldText}\n${bodyText}`;

  const addrMatch = combinedText.match(
    /(\d+\s+[A-Za-z0-9.\s]+?(?:Lane|Ln|Road|Rd|Street|St|Drive|Dr|Avenue|Ave|Court|Ct|Park|Way))\b/i
  );
  const address = addrMatch ? addrMatch[1].trim() : ogTitle.split('|')[0].trim().slice(0, 60);

  const dollarMatch = combinedText.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+)/);
  const price = dollarMatch ? Number(dollarMatch[1].replace(/,/g, '')) : 1750000;
  const beds = Number(combinedText.match(/(\d+)\s*(?:beds?|bd|bedrooms?)/i)?.[1] ?? 4);
  const baths = Number(combinedText.match(/(\d+(?:\.\d+)?)\s*(?:baths?|ba|bathrooms?)/i)?.[1] ?? 3);
  const sqft = Number(
    (combinedText.match(/([0-9]{1,2},[0-9]{3}|[0-9]{3,4})\s*(?:sq\.?\s*ft|sqft)/i)?.[1] ?? '2400').replace(
      /,/g,
      ''
    )
  );
  const lotAcres = Number(combinedText.match(/(\d+(?:\.\d+)?)\s*acres?/i)?.[1] ?? 0.5);

  const { area, inVillage } = classifyBellportLocation(address);
  const cleanDescription = (ldText.trim() || ogDesc.trim() || bodyText.slice(0, 700)).trim();
  const features = extractFeatureTags(cleanDescription, [], inVillage, 'X');

  return {
    address: address || 'Clipped Bellport Property',
    area,
    inVillage,
    price,
    beds,
    baths,
    sqft,
    lotAcres,
    description: cleanDescription,
    headline: ogDesc.trim().slice(0, 120) || cleanDescription.slice(0, 120),
    features,
    photoUrl: photos[0],
    photos,
    sourceUrl: trimmed,
    brokerage: /oldpurchase/i.test(trimmed) ? 'Old Purchase Properties' : 'Clipped Web Listing',
  };
}
