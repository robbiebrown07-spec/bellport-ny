import type {
  ArchetypeIllustration,
  BellportMicroArea,
  FloodZone,
  Listing,
  MarketStatus,
} from '../types';

export function slugifyAddress(address: string): string {
  const clean = address
    .toLowerCase()
    .replace(/bellport(\s+village)?|ny|11713/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return `bp-${clean || Date.now().toString(36)}`;
}

export function inferBellportArea(address: string): {
  area: BellportMicroArea;
  inVillage: boolean;
} {
  const lower = address.toLowerCase();
  if (
    /bellport\s+ln|bellport\s+lane|browns\s+ln|browns\s+lane|academy\s+ln|otis\s+ln|thorn\s*hedge|shore\s+rd|shore\s+road/.test(
      lower
    )
  ) {
    return { area: 'Historic Lanes', inVillage: true };
  }
  if (/country\s+club|howells\s+pt|howells\s+point|mooring|golf/.test(lower)) {
    return { area: 'Country Club & Golf', inVillage: true };
  }
  if (/circuit\s+rd|circuit\s+road|peat\s+hole|bieselin|woodland\s+park|brookside/.test(lower)) {
    return { area: 'East Lanes & Circuit', inVillage: true };
  }
  if (/bell\s+st|south\s+country|s\s+country|general\s+mclean|station\s+rd/.test(lower)) {
    return { area: 'Village Center', inVillage: true };
  }
  if (/east\s+patchogue|brookhaven|montauk\s+hwy|beaver\s+dam|north\s+bellport/.test(lower)) {
    return { area: 'Outside Village (11713)', inVillage: false };
  }
  return { area: 'Village Center', inVillage: true };
}

function inferArchetype(text: string): ArchetypeIllustration {
  const lower = text.toLowerCase();
  if (/waterfront|bayfront|bulkhead|shore\s+rd/.test(lower)) return 'bayfront';
  if (/modern\s+barn|contemporary|architect/.test(lower)) return 'modern-barn';
  if (/gambrel|victorian|queen\s+anne/.test(lower)) return 'victorian';
  if (/pool/.test(lower)) return 'shingle-pool';
  if (/cottage|ranch|bungalow/.test(lower)) return 'cottage';
  return 'colonial';
}

const KEYWORD_EXTRACTORS: Array<[RegExp, string]> = [
  [/gunite\s+pool|heated\s+pool|\bpool\b/i, 'pool'],
  [/room\s+for\s+(?:a\s+)?pool/i, 'room for pool'],
  [/screened\s+porch/i, 'screened porch'],
  [/wrap[-\s]?around\s+porch|front\s+porch/i, 'porch'],
  [/fireplace|wood\s+stove/i, 'fireplace'],
  [/guest\s+(?:cottage|house)|carriage\s+(?:house|barn)/i, 'guest cottage'],
  [/waterfront|bay\s+views?|bulkhead/i, 'waterfront'],
  [/outdoor\s+shower/i, 'outdoor shower'],
  [/generator/i, 'generator'],
  [/renovated|turnkey/i, 'renovated'],
  [/off[-\s]?market|whisper/i, 'off-market'],
];

/**
 * Parses raw text copied from Zillow, Redfin, Compass, Old Purchase Properties,
 * or a saved-search email alert into a pre-filled Listing draft without scraping.
 */
export function parseListingSnippet(raw: string): Partial<Listing> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Extract address (look for street suffix or NY 11713)
  let address = '';
  for (const line of lines) {
    const addrMatch = line.match(
      /(\d+\s+[A-Za-z0-9.\s]+?(?:Lane|Ln|Road|Rd|Street|St|Drive|Dr|Avenue|Ave|Court|Ct|Park|Way))\b/i
    );
    if (addrMatch) {
      address = addrMatch[1].trim();
      break;
    }
  }
  if (!address && lines[0]) {
    address = lines[0].slice(0, 64);
  }

  // Price ($1,395,000 or $2.49M)
  let price = 0;
  const fullDollar = raw.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})+)/);
  const millionMatch = raw.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*M\b/i);
  if (fullDollar) {
    price = Number(fullDollar[1].replace(/,/g, ''));
  } else if (millionMatch) {
    price = Math.round(Number(millionMatch[1]) * 1_000_000);
  }

  const bedsMatch = raw.match(/(\d+)\s*(?:beds?|bd|bedrooms?|br)\b/i);
  const bathsMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:baths?|ba|bathrooms?)\b/i);
  const sqftMatch = raw.match(/([0-9]{1,2},[0-9]{3}|[0-9]{3,4})\s*(?:sq\.?\s*ft\.?|sqft|ft²)/i);
  const acresMatch = raw.match(/(\d+(?:\.\d+)?)\s*acres?\b/i);
  const lotSqftMatch = raw.match(/([0-9]{1,3},[0-9]{3})\s*(?:sq\.?\s*ft\.?\s*lot|lot\s*sq)/i);
  const yearMatch = raw.match(/(?:built\s*(?:in)?\s*|circa\s*|c\.\s*)(1[789]\d{2}|20[0-2]\d)\b/i);
  const taxMatch = raw.match(/(?:tax(?:es)?[^$\d]{0,20})\$\s*([0-9]{1,2},[0-9]{3})/i);
  const mlsMatch = raw.match(/MLS[®#\s:-]*([A-Z0-9-]{5,14})/i);
  const urlMatch = raw.match(/https?:\/\/[^\s)]+/i);

  let lotAcres = acresMatch ? Number(acresMatch[1]) : 0.45;
  if (!acresMatch && lotSqftMatch) {
    lotAcres = Number((Number(lotSqftMatch[1].replace(/,/g, '')) / 43560).toFixed(2));
  }

  let floodZone: FloodZone = 'X';
  if (/zone\s*ve\b/i.test(raw)) floodZone = 'VE';
  else if (/zone\s*ae\b/i.test(raw)) floodZone = 'AE';

  const { area, inVillage } = inferBellportArea(address || raw);
  const features: string[] = [];
  for (const [rx, label] of KEYWORD_EXTRACTORS) {
    if (rx.test(raw)) features.push(label);
  }
  if (floodZone !== 'X') {
    features.push(`Flood Zone ${floodZone}`);
  }

  return {
    address: address || 'New Bellport Listing',
    area,
    inVillage,
    price: price || 1500000,
    beds: bedsMatch ? Number(bedsMatch[1]) : 3,
    baths: bathsMatch ? Number(bathsMatch[1]) : 2.5,
    sqft: sqftMatch ? Number(sqftMatch[1].replace(/,/g, '')) : 2200,
    lotAcres,
    yearBuilt: yearMatch ? Number(yearMatch[1]) : 1930,
    annualTaxes: taxMatch ? Number(taxMatch[1].replace(/,/g, '')) : 15500,
    floodZone,
    mlsId: mlsMatch ? mlsMatch[1] : undefined,
    sourceUrl: urlMatch ? urlMatch[0] : undefined,
    archetype: inferArchetype(raw),
    features,
    description: raw.trim().slice(0, 900),
    headline:
      lines.find((l) => l.length > 28 && !l.startsWith('http'))?.slice(0, 110) ??
      'Imported listing in Bellport Village.',
  };
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Parses a Redfin "Download All" search export CSV or Bellport Watch CSV export.
 */
export function parseCsvListings(csvText: string): Listing[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one listing row.');
  }

  const headers = splitCsvRow(lines[0]).map((h) => h.toLowerCase());
  const col = (patterns: string[]): number =>
    headers.findIndex((h) => patterns.some((p) => h === p || h.includes(p)));

  const idxAddress = col(['address']);
  const idxPrice = col(['price']);
  const idxBeds = col(['beds', 'bedrooms']);
  const idxBaths = col(['baths', 'bathrooms']);
  const idxSqft = col(['square feet', 'sqft']);
  const idxLot = col(['lot size', 'lotacres', 'acres']);
  const idxYear = col(['year built', 'yearbuilt']);
  const idxDom = col(['days on market', 'daysonmarket']);
  const idxStatus = col(['status', 'marketstatus']);
  const idxMls = col(['mls#', 'mlsid']);
  const idxUrl = col(['url', 'sourceurl']);
  const idxBroker = col(['brokerage', 'listing agent']);
  const idxNotes = col(['personalnotes', 'notes']);
  const idxTaxes = col(['annualtaxes', 'taxes']);

  if (idxAddress === -1 || idxPrice === -1) {
    throw new Error('CSV must contain at least ADDRESS and PRICE columns (Redfin or standard CSV).');
  }

  const results: Listing[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (let r = 1; r < lines.length; r += 1) {
    const row = splitCsvRow(lines[r]);
    const address = row[idxAddress] ?? '';
    if (!address) continue;

    const rawPrice = Number((row[idxPrice] ?? '0').replace(/[^0-9.]/g, '')) || 0;
    if (rawPrice <= 0) continue;

    const beds = idxBeds >= 0 ? Number(row[idxBeds]) || 3 : 3;
    const baths = idxBaths >= 0 ? Number(row[idxBaths]) || 2 : 2;
    const sqft =
      idxSqft >= 0 ? Number((row[idxSqft] ?? '').replace(/[^0-9.]/g, '')) || 2000 : 2000;

    let lotAcres = 0.4;
    if (idxLot >= 0 && row[idxLot]) {
      const rawLot = Number(row[idxLot].replace(/[^0-9.]/g, ''));
      // Redfin exports LOT SIZE in square feet (e.g. 21780), while custom CSV uses acres (e.g. 0.50)
      if (rawLot > 50) {
        lotAcres = Number((rawLot / 43560).toFixed(2));
      } else if (rawLot > 0) {
        lotAcres = rawLot;
      }
    }

    const yearBuilt = idxYear >= 0 ? Number(row[idxYear]) || 1950 : 1950;
    const daysOnMarket = idxDom >= 0 ? Number(row[idxDom]) || 1 : 1;
    const rawStatus = (idxStatus >= 0 ? row[idxStatus] : 'active').toLowerCase();
    let marketStatus: MarketStatus = 'active';
    if (rawStatus.includes('sold') || rawStatus.includes('closed')) marketStatus = 'sold';
    else if (rawStatus.includes('pending') || rawStatus.includes('contingent') || rawStatus.includes('contract')) {
      marketStatus = 'contingent';
    } else if (rawStatus.includes('off')) {
      marketStatus = 'off-market';
    }

    const { area, inVillage } = inferBellportArea(address);

    results.push({
      id: slugifyAddress(address),
      address,
      area,
      inVillage,
      marketStatus,
      userStatus: 'unreviewed',
      price: rawPrice,
      beds,
      baths,
      sqft,
      lotAcres,
      yearBuilt,
      annualTaxes:
        idxTaxes >= 0 && row[idxTaxes]
          ? Number(row[idxTaxes].replace(/[^0-9.]/g, '')) || 15000
          : 15000,
      floodZone: 'X',
      daysOnMarket,
      listedDate: today,
      style: yearBuilt < 1935 ? 'Historic Village Residence' : 'Traditional Residence',
      archetype: inferArchetype(address),
      headline: `${beds}-bedroom residence on ${address} (${lotAcres} acres).`,
      description: `Imported via CSV on ${today}. ${beds} beds, ${baths} baths, ${sqft.toLocaleString()} sq ft on ${lotAcres} acres in ${area}.`,
      features: inVillage ? ['CSV import'] : ['outside village boundary', 'CSV import'],
      brokerage: idxBroker >= 0 && row[idxBroker] ? row[idxBroker] : 'Imported Listing',
      mlsId: idxMls >= 0 && row[idxMls] ? row[idxMls] : undefined,
      sourceUrl: idxUrl >= 0 && row[idxUrl] ? row[idxUrl] : undefined,
      personalNotes: idxNotes >= 0 && row[idxNotes] ? row[idxNotes] : '',
      isSample: false,
    });
  }

  return results;
}
