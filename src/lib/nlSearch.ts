export interface ParsedNaturalQuery {
  raw: string;
  active: boolean;
  chips: string[];
  statusIntent: 'for_sale' | 'past_sales' | 'all_homes' | null;
  soldYears: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  minBaths: number | null;
  minSqft: number | null;
  minLot: number | null;
  maxWalkMin: number | null;
  maxWalkStoresMin: number | null;
  belowSC: boolean;
  beautifulStreetsOnly: boolean;
  streetMentions: string[];
  poolMode: 'pool_only' | 'pool_or_room' | 'room_only' | null;
  feats: string[];
  extColors: string[];
  requiredTraits: string[];
  airbnbOnly: boolean;
  minBeauty: number | null;
  sortHint: 'lawn_desc' | 'beauty_desc' | 'price_asc' | null;
  maxYearBuilt: number | null;
  minYearBuilt: number | null;
  valuation: 'underpriced' | 'overpriced' | null;
  robbieFit: 'perfect' | 'great_plus' | 'good_plus' | null;
  styleTokens: string[];
  residualTokens: string[];
}

function parseDollarToken(numStr: string, unitStr?: string): number | null {
  const n = parseFloat(numStr.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const u = (unitStr ?? '').toLowerCase();
  if (u.startsWith('m')) return Math.round(n * 1_000_000);
  if (u.startsWith('k')) return Math.round(n * 1_000);
  if (n < 30) return Math.round(n * 1_000_000);
  if (n < 10_000) return Math.round(n * 1_000);
  return Math.round(n);
}

function fmtChipDollar(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(2).replace(/0$/, '')}M`;
  }
  return `$${Math.round(n / 1000)}k`;
}

const KNOWN_STREET_PATTERNS: Array<{ rx: RegExp; token: string; label: string }> = [
  { rx: /\bbellport\s*(?:ln|lane)\b/i, token: 'bellport ln', label: 'Bellport Lane' },
  { rx: /\bbrowns?\s*(?:ln|lane)\b/i, token: 'browns ln', label: 'Browns Lane' },
  { rx: /\blivingston(?:\s*(?:rd|road))?\b/i, token: 'livingston', label: 'Livingston Rd' },
  { rx: /\bhulse(?:\s*(?:st|street))?\b/i, token: 'hulse', label: 'Hulse St' },
  { rx: /\brogers(?:\s*(?:ave|avenue))?\b/i, token: 'rogers', label: 'Rogers Ave' },
  { rx: /\bbell\s*(?:st|street)\b/i, token: 'bell st', label: 'Bell St' },
  { rx: /\bacademy(?:\s*(?:ln|lane))?\b/i, token: 'academy', label: 'Academy Ln' },
  { rx: /\bgerard(?:\s*(?:st|street))?\b/i, token: 'gerard', label: 'Gerard St' },
  { rx: /\bshore\s*(?:rd|road)\b/i, token: 'shore rd', label: 'Shore Rd' },
  { rx: /\bthorn\s*hedge\b/i, token: 'thornhedge', label: 'Thornhedge Rd' },
  { rx: /\botis\s*(?:ln|lane|ave)\b/i, token: 'otis', label: 'Otis Ln' },
  { rx: /\bcountry\s*club\b/i, token: 'country club', label: 'Country Club Rd' },
  { rx: /\bs(?:outh)?\.?\s*howells\b/i, token: 'howells pt s', label: 'S. Howells Pt Rd' },
  { rx: /\bn(?:orth)?\.?\s*howells\b/i, token: 'howells pt n', label: 'N. Howells Pt Rd' },
  { rx: /\bhowells\b/i, token: 'howells', label: 'Howells Pt Rd' },
  { rx: /\bbrewster\b/i, token: 'brewster', label: 'Brewster Ln' },
  { rx: /\bcircuit\b/i, token: 'circuit', label: 'Circuit Rd' },
  { rx: /\bbieselin\b/i, token: 'bieselin', label: 'Bieselin Rd' },
  { rx: /\bpeat\s*hole\b/i, token: 'peathole', label: 'Peat Hole Ln' },
  { rx: /\boak\s*meadow\b/i, token: 'oak meadow', label: 'Oak Meadow Ln' },
  { rx: /\bpearl\s*(?:st|street)\b/i, token: 'pearl st', label: 'Pearl St' },
  { rx: /\bstation\s*(?:rd|road|ct)\b/i, token: 'station', label: 'Station Rd' },
  { rx: /\bkreamer\b/i, token: 'kreamer', label: 'Kreamer St' },
  { rx: /\bmclean\b/i, token: 'mclean', label: 'General McLean Dr' },
  { rx: /\bthird\s*(?:st|street)\b/i, token: 'third st', label: 'Third St' },
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'all', 'every', 'any', 'some', 'only', 'just', 'both', 'either',
  'house', 'houses', 'home', 'homes', 'property', 'properties', 'listing', 'listings', 'place', 'places', 'residence', 'residences',
  'in', 'on', 'at', 'by', 'near', 'close', 'to', 'from', 'of', 'for', 'with', 'without', 'having', 'has', 'have', 'had',
  'and', 'or', 'that', 'which', 'who', 'are', 'is', 'be', 'was', 'were',
  'show', 'find', 'search', 'list', 'give', 'get', 'see', 'looking', 'want', 'me', 'my', 'our', 'us',
  'bellport', 'village', 'incorporated', 'ny', 'new', 'york',
  'good', 'great', 'nice', 'lovely', 'pretty', 'really', 'very', 'super', 'most', 'more', 'lots', 'lot',
  'family', 'vacation', 'summer', 'weekend',
]);

export function parseNaturalLanguageQuery(rawInput: string): ParsedNaturalQuery {
  const raw = rawInput.trim();
  const s = raw.toLowerCase();
  const res: ParsedNaturalQuery = {
    raw,
    active: raw.length > 0,
    chips: [],
    statusIntent: null,
    soldYears: null,
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    maxBeds: null,
    minBaths: null,
    minSqft: null,
    minLot: null,
    maxWalkMin: null,
    maxWalkStoresMin: null,
    belowSC: false,
    beautifulStreetsOnly: false,
    streetMentions: [],
    poolMode: null,
    feats: [],
    extColors: [],
    requiredTraits: [],
    airbnbOnly: false,
    minBeauty: null,
    sortHint: null,
    maxYearBuilt: null,
    minYearBuilt: null,
    valuation: null,
    robbieFit: null,
    styleTokens: [],
    residualTokens: [],
  };

  if (!raw) return res;

  let working = s;
  const consume = (rx: RegExp) => {
    working = working.replace(rx, ' ');
  };

  // 1. Market status intent ("all white houses" without "for sale" searches across all 1,058 Village homes!)
  if (/\b(for\s+sale|on\s+the\s+market|active\s+listings?|currently\s+listed|available\s+now)\b/.test(s)) {
    res.statusIntent = 'for_sale';
    res.chips.push('For Sale');
    consume(/\b(for\s+sale|on\s+the\s+market|active\s+listings?|currently\s+listed|available\s+now)\b/g);
  } else if (/\b(past\s+sales?|recently\s+sold|sold\s+homes?|closed\s+sales?|sold\s+in)\b/.test(s)) {
    res.statusIntent = 'past_sales';
    const ym = s.match(/sold\s+(?:in\s+(?:the\s+)?)?(?:last\s+)?(\d+)\s*(?:yr|year)s?/);
    if (ym) {
      res.soldYears = Number(ym[1]);
      res.chips.push(`Sold ≤${res.soldYears}y`);
    } else {
      res.chips.push('Past Sales');
    }
    consume(/\b(past\s+sales?|recently\s+sold|sold\s+homes?|closed\s+sales?|sold\s+(?:in\s+(?:the\s+)?)?(?:last\s+)?\d*\s*(?:yr|year)?s?)\b/g);
  } else if (/\b(all\s+homes|off[-\s]?market|every\s+home|all\s+\w+\s+houses|all\s+houses)\b/.test(s)) {
    res.statusIntent = 'all_homes';
    consume(/\b(off[-\s]?market)\b/g);
  }

  // 2. Exterior House Colors (Unstructured photo-derived + text traits!)
  const colorRules: Array<{ rx: RegExp; code: string; label: string }> = [
    { rx: /\b(white|whitewashed|ivory|off[-\s]?white)\b/g, code: 'white', label: 'White Exterior' },
    { rx: /\b(gray|grey|weathered\s+gray|weathered\s+grey|silver)\b/g, code: 'gray', label: 'Gray Exterior' },
    { rx: /\b(cedar|natural\s+wood|brown|tan|wood\s+shingle)\b/g, code: 'cedar', label: 'Cedar / Wood Exterior' },
    { rx: /\b(blue|navy|slate\s+blue|coastal\s+blue)\b/g, code: 'blue', label: 'Blue Exterior' },
    { rx: /\b(yellow|cream|butter)\b/g, code: 'cream', label: 'Cream / Yellow Exterior' },
    { rx: /\b(red|brick|terracotta|burgundy)\b/g, code: 'brick', label: 'Brick / Red Exterior' },
    { rx: /\b(black|dark|charcoal|ebony)\b/g, code: 'dark', label: 'Dark / Charcoal Exterior' },
  ];
  for (const cr of colorRules) {
    if (cr.rx.test(s)) {
      res.extColors.push(cr.code);
      res.chips.push(cr.label);
      consume(cr.rx);
    }
  }

  // 3. Lawns, Yards & Lot Geometry (Unstructured GIS footprint + photo turf traits!)
  const addTrait = (tr: string, label: string) => {
    if (!res.requiredTraits.includes(tr)) {
      res.requiredTraits.push(tr);
      res.chips.push(label);
    }
  };

  if (
    /\b((?:large|big|huge|expansive|spacious|sweeping|sprawling|generous|wide|deep|massive|oversized)\s+(?:lawns?|yards?|backyards?|grounds|grass|gardens?)|lots?\s+of\s+(?:lawn|grass|yard\s+space)|plenty\s+of\s+(?:lawn|yard|grass))\b/.test(
      s
    )
  ) {
    addTrait('large_lawn', 'Large Open Lawn');
    res.sortHint = 'lawn_desc';
    consume(
      /\b((?:large|big|huge|expansive|spacious|sweeping|sprawling|generous|wide|deep|massive|oversized)\s+(?:lawns?|yards?|backyards?|grounds|grass|gardens?)|lots?\s+of\s+(?:lawn|grass|yard\s+space)|plenty\s+of\s+(?:lawn|yard|grass))\b/g
    );
  } else if (/\b(estate\s+grounds|park[-\s]?like|compound|sprawling\s+estate)\b/.test(s)) {
    addTrait('estate_grounds', 'Estate Grounds (0.6+ ac)');
    res.sortHint = 'lawn_desc';
    consume(/\b(estate\s+grounds|park[-\s]?like|compound|sprawling\s+estate)\b/g);
  } else if (/\b(lawn|garden|yard|backyard|privet)\b/.test(s)) {
    addTrait('large_lawn', 'Lush Lawn & Yard');
    consume(/\b(lawn|garden|yard|backyard|privet)s?\b/g);
  }

  if (/\b(deep\s+lot|deep\s+property|set\s+back)\b/.test(s)) {
    addTrait('deep_lot', 'Deep Lot (180+ ft)');
    consume(/\b(deep\s+lot|deep\s+property|set\s+back)s?\b/g);
  }
  if (/\b(wide\s+lot|wide\s+frontage)\b/.test(s)) {
    addTrait('wide_lot', 'Wide Frontage');
    consume(/\b(wide\s+lot|wide\s+frontage)s?\b/g);
  }
  if (/\b(mature\s+trees?|trees?|wooded|leafy|shaded|canopy|hedged|secluded|private)\b/.test(s)) {
    addTrait('lush_trees', 'Mature Trees & Privacy');
    consume(/\b(mature\s+trees?|trees?|wooded|leafy|shaded|canopy|hedged|secluded|private)\b/g);
  }
  if (/\b(quiet\s+(?:streets?|lanes?|blocks?|roads?)|tucked\s+away|cul[-\s]?de[-\s]?sac|low\s+traffic|side\s+streets?)\b/.test(s)) {
    addTrait('quiet_street', 'Quiet Side Street');
    consume(/\b(quiet\s+(?:streets?|lanes?|blocks?|roads?)|tucked\s+away|cul[-\s]?de[-\s]?sac|low\s+traffic|side\s+streets?)\b/g);
  }
  if (/\b(porch|porches|veranda|screened\s+porch|wrap[-\s]?around\s+porch|sunroom)\b/.test(s)) {
    addTrait('porch', 'Porch / Sunroom');
    consume(/\b(porch|porches|veranda|screened\s+porch|wrap[-\s]?around\s+porch|sunroom)\b/g);
  }
  if (/\b(open\s+floor\s+plan|open\s+layout|open\s+concept|tall\s+ceilings?|high\s+ceilings?|vaulted|airy|sun[-\s]?drenched|light[-\s]?filled|bright)\b/.test(s)) {
    addTrait('open_airy', 'Open / Light-Filled');
    consume(/\b(open\s+floor\s+plan|open\s+layout|open\s+concept|tall\s+ceilings?|high\s+ceilings?|vaulted|airy|sun[-\s]?drenched|light[-\s]?filled|bright)\b/g);
  }
  if (/\b(renovated|remodeled|turnkey|move[-\s]?in\s+ready|updated)\b/.test(s)) {
    addTrait('turnkey', 'Renovated / Turnkey');
    consume(/\b(renovated|remodeled|turnkey|move[-\s]?in\s+ready|updated)\b/g);
  }
  if (/\b(fixer|tlc|needs\s+work|project|as[-\s]?is|value[-\s]?add)\b/.test(s)) {
    addTrait('fixer', 'Fixer / Value-Add');
    consume(/\b(fixer|tlc|needs\s+work|project|as[-\s]?is|value[-\s]?add)\b/g);
  }
  if (/\b(single[-\s]?story|one[-\s]?story|1[-\s]?story|first[-\s]?floor\s+living)\b/.test(s)) {
    addTrait('single_story', 'Single-Story');
    consume(/\b(single[-\s]?story|one[-\s]?story|1[-\s]?story|first[-\s]?floor\s+living)\b/g);
  }
  if (/\b(second[-\s]?home\s+owners?|absentee|weekend\s+owners?)\b/.test(s)) {
    addTrait('second_home', 'Second-Home Owner');
    consume(/\b(second[-\s]?home\s+owners?|absentee|weekend\s+owners?)\b/g);
  } else if (/\b(full[-\s]?time\s+owners?|local\s+owners?|year[-\s]?round\s+owners?)\b/.test(s)) {
    addTrait('full_time_owner', 'Full-Time Local Owner');
    consume(/\b(full[-\s]?time\s+owners?|local\s+owners?|year[-\s]?round\s+owners?)\b/g);
  }
  if (/\b(airbnbs?|short[-\s]?term\s+rentals?)\b/.test(s)) {
    res.airbnbOnly = true;
    res.chips.push('Listed on Airbnb');
    consume(/\b(airbnbs?|short[-\s]?term\s+rentals?)\b/g);
  }

  // 4. Price ranges
  const betweenPrice = s.match(
    /between\s+\$?([\d,.]+)\s*(m|million|k|thousand)?\s+(?:and|to|-)\s+\$?([\d,.]+)\s*(m|million|k|thousand)?/
  );
  if (betweenPrice) {
    const p1 = parseDollarToken(betweenPrice[1], betweenPrice[2] || betweenPrice[4]);
    const p2 = parseDollarToken(betweenPrice[3], betweenPrice[4] || betweenPrice[2]);
    if (p1 && p2) {
      res.minPrice = Math.min(p1, p2);
      res.maxPrice = Math.max(p1, p2);
      res.chips.push(`${fmtChipDollar(res.minPrice)}–${fmtChipDollar(res.maxPrice)}`);
      consume(
        /between\s+\$?[\d,.]+\s*(?:m|million|k|thousand)?\s+(?:and|to|-)\s+\$?[\d,.]+\s*(?:m|million|k|thousand)?/g
      );
    }
  } else {
    const underM = s.match(
      /(?:<=?|≤|\b(?:under|below|less\s+than|max|up\s+to|budget(?:\s+of)?)\s+)\s*\$?([\d,]+(?:\.\d+)?)\s*(m|million|k|thousand)?\b/
    );
    if (underM) {
      const rawNum = parseFloat(underM[1].replace(/,/g, ''));
      const hasDollarOrSym = /[$<≤]/.test(underM[0]);
      if (underM[2] || hasDollarOrSym || rawNum >= 50_000 || rawNum < 25) {
        const p = parseDollarToken(
          underM[1],
          underM[2] || (rawNum < 25 ? 'm' : undefined)
        );
        if (p) {
          res.maxPrice = p;
          res.chips.push(`Under ${fmtChipDollar(p)}`);
          consume(
            /(?:<=?|≤|\b(?:under|below|less\s+than|max|up\s+to|budget(?:\s+of)?)\s+)\s*\$?[\d,]+(?:\.\d+)?\s*(?:m|million|k|thousand)?\b/g
          );
        }
      }
    }
    const overM = s.match(
      /(?:>=?|≥|\b(?:over|above|more\s+than|min|at\s+least)\s+)\s*(\$)?([\d,]+(?:\.\d+)?)\s*(m|million|k|thousand)?\b/
    );
    if (overM) {
      const rawNum = parseFloat(overM[2].replace(/,/g, ''));
      const hasExplicitDollar = Boolean(overM[1] || overM[3] || rawNum >= 100_000);
      if (hasExplicitDollar) {
        const p = parseDollarToken(
          overM[2],
          overM[3] || (overM[1] && rawNum < 25 ? 'm' : undefined)
        );
        if (p && p >= 100_000) {
          res.minPrice = p;
          res.chips.push(`Over ${fmtChipDollar(p)}`);
          consume(
            /(?:>=?|≥|\b(?:over|above|more\s+than|min|at\s+least)\s+)\s*\$?[\d,]+(?:\.\d+)?\s*(?:m|million|k|thousand)?\b/g
          );
        }
      }
    }
    const aroundM = s.match(/\baround\s+\$?([\d,.]+)\s*(m|million|k|thousand)\b/);
    if (aroundM && !res.minPrice && !res.maxPrice) {
      const p = parseDollarToken(aroundM[1], aroundM[2]);
      if (p) {
        res.minPrice = Math.round(p * 0.8);
        res.maxPrice = Math.round(p * 1.2);
        res.chips.push(`~${fmtChipDollar(p)}`);
        consume(/\baround\s+\$?[\d,.]+\s*(?:m|million|k|thousand)\b/g);
      }
    }
  }
  if (/\b(affordable|cheapest|entry[-\s]?level|lowest\s+price)\b/.test(s)) {
    res.maxPrice = res.maxPrice ?? 1_150_000;
    res.sortHint = 'price_asc';
    res.chips.push('Under $1.15M');
    consume(/\b(affordable|cheapest|entry[-\s]?level|lowest\s+price)\b/g);
  }

  // 5. Bedrooms & Bathrooms
  const bedRange = s.match(/\b(\d)\s*(?:or|to|-)\s*(\d)\s*(?:bed|beds|bedroom|bedrooms|br)\b/);
  if (bedRange) {
    res.minBeds = Number(bedRange[1]);
    res.maxBeds = Number(bedRange[2]);
    res.chips.push(`${res.minBeds}–${res.maxBeds} Beds`);
    consume(/\b\d\s*(?:or|to|-)\s*\d\s*(?:bed|beds|bedroom|bedrooms|br)\b/g);
  } else {
    const bedMin = s.match(/\b(?:at\s+least\s+)?(\d)\+?\s*(?:bed|beds|bedroom|bedrooms|br)\b/);
    if (bedMin) {
      res.minBeds = Number(bedMin[1]);
      res.chips.push(`${res.minBeds}+ Beds`);
      consume(/\b(?:at\s+least\s+)?\d\+?\s*(?:bed|beds|bedroom|bedrooms|br)\b/g);
    }
  }

  const bathMin = s.match(/\b(\d(?:\.\d)?)\+?\s*(?:bath|baths|bathroom|bathrooms|ba)\b/);
  if (bathMin) {
    res.minBaths = Number(bathMin[1]);
    res.chips.push(`${res.minBaths}+ Baths`);
    consume(/\b\d(?:\.\d)?\+?\s*(?:bath|baths|bathroom|bathrooms|ba)\b/g);
  }

  // 6. Square footage & Lot size
  const sqftM = s.match(
    /\b(?:over\s+|at\s+least\s+|min\s+)?([\d,]{4,5})\+?\s*(?:sq\s*ft|sqft|square\s+feet|ft2)\b/
  );
  if (sqftM) {
    res.minSqft = Number(sqftM[1].replace(/,/g, ''));
    res.chips.push(`${res.minSqft.toLocaleString()}+ ft²`);
    consume(/\b(?:over\s+|at\s+least\s+|min\s+)?[\d,]{4,5}\+?\s*(?:sq\s*ft|sqft|square\s+feet|ft2)\b/g);
  }

  if (/\bhalf\s+(?:an\s+)?acre\b/.test(s)) {
    res.minLot = 0.5;
    res.chips.push('0.5+ Acres');
    consume(/\bhalf\s+(?:an\s+)?acre\b/g);
  } else {
    const lotM = s.match(/\b(\d+(?:\.\d+)?)\+?\s*(?:acre|acres|ac)\b/);
    if (lotM) {
      res.minLot = Number(lotM[1]);
      res.chips.push(`${res.minLot}+ Acres`);
      consume(/\b\d+(?:\.\d+)?\+?\s*(?:acre|acres|ac)\b/g);
    } else if (/\b(large\s+lots?|big\s+lots?|oversized\s+lots?|estate\s+lots?)\b/.test(s)) {
      res.minLot = 0.45;
      res.chips.push('Large Lot (0.45+ ac)');
      consume(/\b(large\s+lots?|big\s+lots?|oversized\s+lots?|estate\s+lots?)\b/g);
    }
  }

  // 7. Location, Walkability, Beautiful Streets
  if (
    /\b(south\s+of\s+(?:south\s+country|s\.?\s+country|main)|below\s+(?:south\s+country|s\.?\s+country|main)|south\s+of\s+sc)\b/.test(
      s
    )
  ) {
    res.belowSC = true;
    res.chips.push('Below S. Country Rd');
    consume(
      /\b(south\s+of\s+(?:south\s+country|s\.?\s+country|main)|below\s+(?:south\s+country|s\.?\s+country|main)|south\s+of\s+sc)(?:\s*(?:rd|road|st|street))?\b/g
    );
  }

  if (
    /\b(walk(?:able)?\s+to\s+(?:the\s+)?(?:marina|bay|dock|ferry|water|beach)|near\s+(?:the\s+)?(?:marina|dock|ferry))\b/.test(
      s
    )
  ) {
    res.maxWalkMin = 12;
    res.chips.push('≤12m Walk to Marina');
    consume(
      /\b(walk(?:able)?\s+to\s+(?:the\s+)?(?:marina|bay|dock|ferry|water|beach)|near\s+(?:the\s+)?(?:marina|dock|ferry))\b/g
    );
  }

  if (
    /\b(walk(?:able)?\s+to\s+(?:the\s+)?(?:town|shops|stores|coffee|restaurants|main\s+st|village\s+center)|near\s+(?:town|shops|stores|main\s+st))\b/.test(
      s
    )
  ) {
    res.maxWalkStoresMin = 9;
    res.chips.push('≤9m Walk to Shops');
    consume(
      /\b(walk(?:able)?\s+to\s+(?:the\s+)?(?:town|shops|stores|coffee|restaurants|main\s+st|village\s+center)|near\s+(?:town|shops|stores|main\s+st))\b/g
    );
  }

  if (
    /\b(beautiful\s+streets?|prettiest\s+streets?|best\s+streets?|best\s+lanes?|scenic\s+streets?|tree[-\s]?lined|favorite\s+streets?)\b/.test(
      s
    )
  ) {
    res.beautifulStreetsOnly = true;
    res.chips.push('Most Beautiful Streets');
    consume(
      /\b(beautiful\s+streets?|prettiest\s+streets?|best\s+streets?|best\s+lanes?|scenic\s+streets?|tree[-\s]?lined|favorite\s+streets?)\b/g
    );
  }

  // Only match street pattern if not preceded by an exact street house number like "37 Bellport Ln"
  const hasExactHouseNum = /^\d+\s+[a-z]/i.test(raw);
  if (!hasExactHouseNum) {
    for (const sp of KNOWN_STREET_PATTERNS) {
      if (sp.rx.test(s) && !res.streetMentions.includes(sp.token)) {
        res.streetMentions.push(sp.token);
        res.chips.push(sp.label);
        consume(new RegExp(sp.rx.source, 'gi'));
      }
    }
  }

  // 8. Pool logic
  if (
    /\b(pool\s+or\s+(?:room|space)(?:\s+for\s+(?:a\s+)?pool)?|either\s+pool|(?:room|space)\s+for\s+(?:a\s+)?pool\s+or\s+pool|add\s+room\s+for\s+pool)\b/.test(
      s
    )
  ) {
    res.poolMode = 'pool_or_room';
    res.chips.push('Pool or Room for Pool');
    consume(
      /\b(pool\s+or\s+(?:room|space)(?:\s+for\s+(?:a\s+)?pool)?|either\s+pool|(?:room|space)\s+for\s+(?:a\s+)?pool\s+or\s+pool|add\s+room\s+for\s+pool)\b/g
    );
  } else if (/\b(room\s+for\s+(?:a\s+)?pool|space\s+for\s+(?:a\s+)?pool|pool\s+site)\b/.test(s)) {
    if (/\b(with\s+(?:a\s+)?pool|has\s+(?:a\s+)?pool|existing\s+pool)\b/.test(s)) {
      res.poolMode = 'pool_or_room';
      res.chips.push('Pool or Room for Pool');
    } else {
      res.poolMode = 'room_only';
      res.chips.push('Room for Pool');
    }
    consume(/\b(room\s+for\s+(?:a\s+)?pool|space\s+for\s+(?:a\s+)?pool|pool\s+site|with\s+(?:a\s+)?pool|has\s+(?:a\s+)?pool|existing\s+pool)\b/g);
  } else if (
    /\b(pool|heated\s+pool|gunite|inground\s+pool|in-ground\s+pool|swimming\s+pool)\b/.test(s) &&
    !/\bno\s+pool\b/.test(s)
  ) {
    res.poolMode = 'pool_only';
    res.chips.push('Current Pool');
    consume(/\b(heated\s+pool|gunite|inground\s+pool|in-ground\s+pool|swimming\s+pool|pool)\b/g);
  }

  // 9. Design & Architectural features
  const addFeat = (fk: string, label: string) => {
    if (!res.feats.includes(fk)) {
      res.feats.push(fk);
      res.chips.push(label);
    }
  };
  if (/\b(shingles?|shingled|cedar[-\s]?shake)\b/.test(s)) {
    addFeat('shingles', 'Shingles');
    consume(/\b(shingles?|shingled|cedar[-\s]?shake)\b/g);
  }
  if (/\b(most\s+beautiful|prettiest|stunning|gorgeous|landmark|architectural\s+beauty|beautiful\s+houses?|beautiful\s+homes?|beautiful\s+architecture)\b/.test(s)) {
    res.minBeauty = 8.4;
    res.sortHint = 'beauty_desc';
    res.chips.push('High Arch. Beauty (8.4+/10)');
    consume(/\b(most\s+beautiful|prettiest|stunning|gorgeous|landmark|architectural\s+beauty|beautiful\s+houses?|beautiful\s+homes?|beautiful\s+architecture)\b/g);
  } else if (/\b(architectural|character|charming|pedigree)\b/.test(s)) {
    addFeat('arch', 'Beautiful Architecture');
    consume(/\b(architectural|character|charming|pedigree)\b/g);
  }
  if (/\b(second\s+floor|two[-\s]?story|2[-\s]?story|upstairs)\b/.test(s)) {
    addFeat('second_floor', 'Second Floor');
    consume(/\b(second\s+floor|two[-\s]?story|2[-\s]?story|upstairs)\b/g);
  }
  if (/\b(basement|cellar)\b/.test(s)) {
    addFeat('basement', 'Basement');
    consume(/\b(basement|cellar)s?\b/g);
  }
  if (/\b(fireplaces?|hearth|wood[-\s]?burning)\b/.test(s)) {
    addFeat('fireplace', 'Fireplace');
    consume(/\b(fireplaces?|hearth|wood[-\s]?burning)\b/g);
  }
  if (/\b(waterfront|bayfront|on\s+the\s+(?:bay|water)|dock|bulkhead|water\s+views?)\b/.test(s)) {
    addFeat('waterfront', 'Waterfront');
    consume(/\b(waterfront|bayfront|on\s+the\s+(?:bay|water)|dock|bulkhead|water\s+views?)\b/g);
  }
  if (
    /\b(guest\s+(?:house|cottage|quarters)|carriage|pool\s+house|detached\s+studio|studio|adu|barn|outbuilding)\b/.test(
      s
    )
  ) {
    addFeat('addl_struct', 'Additional Structure');
    consume(
      /\b(guest\s+(?:house|cottage|quarters)|carriage|pool\s+house|detached\s+studio|studio|adu|barn|outbuilding)s?\b/g
    );
  }

  // 10. Era & Architectural style keywords
  if (/\b(historic|pre[-\s]?war|antique|vintage|19th\s+century|1800s|turn\s+of\s+the\s+century)\b/.test(s)) {
    res.maxYearBuilt = 1940;
    res.chips.push('Historic (Pre-1940)');
    consume(/\b(historic|pre[-\s]?war|antique|vintage|19th\s+century|1800s|turn\s+of\s+the\s+century)\b/g);
  } else if (/\b(new\s+construction|newly\s+built|modern\s+build|built\s+recently)\b/.test(s)) {
    res.minYearBuilt = 2015;
    res.chips.push('Built 2015+');
    consume(/\b(new\s+construction|newly\s+built|modern\s+build|built\s+recently)\b/g);
  }

  for (const stWord of [
    'colonial',
    'cape',
    'victorian',
    'farmhouse',
    'ranch',
    'contemporary',
    'cottage',
    'gambrel',
    'clapboard',
    'greek revival',
  ]) {
    const rx = new RegExp(`\\b${stWord}s?\\b`, 'i');
    if (rx.test(s)) {
      res.styleTokens.push(stWord);
      res.chips.push(
        stWord
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      );
      consume(new RegExp(`\\b${stWord}s?\\b`, 'gi'));
    }
  }

  // 11. Deal / Valuation & Robbie Fit
  if (/\b(underpriced|undervalued|good\s+deals?|great\s+deals?|bargains?|best\s+value)\b/.test(s)) {
    res.valuation = 'underpriced';
    res.chips.push('Underpriced');
    consume(/\b(underpriced|undervalued|good\s+deals?|great\s+deals?|bargains?|best\s+value)\b/g);
  } else if (/\b(overpriced)\b/.test(s)) {
    res.valuation = 'overpriced';
    res.chips.push('Overpriced');
    consume(/\b(overpriced)\b/g);
  }

  if (/\b(perfect\s+fit|ideal\s+fit|dream\s+fit)\b/.test(s)) {
    res.robbieFit = 'perfect';
    res.chips.push('★ Perfect Fit');
    consume(/\b(perfect\s+fit|ideal\s+fit|dream\s+fit)\b/g);
  } else if (/\b(great\s+fit|best\s+fit)\b/.test(s)) {
    res.robbieFit = 'great_plus';
    res.chips.push('Great or Perfect Fit');
    consume(/\b(great\s+fit|best\s+fit)\b/g);
  } else if (/\b(good\s+fit|fits?\s+me)\b/.test(s)) {
    res.robbieFit = 'good_plus';
    res.chips.push('Good+ Fit');
    consume(/\b(good\s+fit|fits?\s+me)\b/g);
  }

  // 12. Residual non-stopword tokens (e.g. exact street number "37 bellport", owner surname, or niche keyword)
  const leftover = working
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1 && (/\d/.test(w) || (w.length >= 3 && !STOP_WORDS.has(w))));

  res.residualTokens = leftover;
  if (leftover.length > 0 && res.chips.length === 0) {
    res.chips.push(`Keyword: “${leftover.join(' ')}”`);
  }

  return res;
}
