export interface ParsedNaturalQuery {
  raw: string;
  active: boolean;
  isQuestion: boolean;
  isAdvisoryOnly: boolean;
  useSavedParameters: boolean;
  chips: string[];
  statusIntent: 'for_sale' | 'past_sales' | 'all_homes' | null;
  soldYears: number | null;
  soldExactYears: number[];
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  maxBeds: number | null;
  minBaths: number | null;
  minSqft: number | null;
  minLot: number | null;
  maxLot: number | null;
  maxWalkMin: number | null;
  maxWalkStoresMin: number | null;
  belowSC: boolean;
  northOfSC: boolean;
  excludeFloodZone: boolean;
  inFloodZoneOnly: boolean;
  excludePool: boolean;
  excludeOverpriced: boolean;
  excludeUglyArch: boolean;
  beautifulStreetsOnly: boolean;
  streetMentions: string[];
  similarToAddress: string | null;
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

/**
 * Normalizes inconsistent County GIS street spellings across all 1,058 Village parcels
 * (e.g. "So Howells Point Rd", "Howells Pt S Rd", "S. Howells Pt Rd" -> "s howells pt rd").
 */
export function normalizeBellportStreetText(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\(ldl\)/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\bso\b/g, 's')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\bn\s+n\b/g, 'n')
    .replace(/\bs\s+s\b/g, 's')
    .replace(/\bpoint\b/g, 'pt')
    .replace(/\broad\b/g, 'rd')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bhighway\b/g, 'hwy')
    .replace(/\bpeat\s+hole\b/g, 'peathole')
    .replace(/\bwyandott\b/g, 'wyandotte')
    .replace(/\btuttle\b/g, 'tuthill')
    .replace(/\bbrown\s+ln\b/g, 'browns ln')
    .replace(/\bhowells\s+pt\s+s\b/g, 's howells pt')
    .replace(/\bhowells\s+pt\s+n\b/g, 'n howells pt')
    .replace(/\bbrewster\s+s\s+ln\b/g, 's brewster ln')
    .replace(/\bbrewster\s+ln\s+s\b/g, 's brewster ln')
    .replace(/\bbrewster\s+n\s+ln\b/g, 'n brewster ln')
    .replace(/\bbrewster\s+ln\s+n\b/g, 'n brewster ln')
    .replace(/\s+/g, ' ')
    .trim();
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
  { rx: /\bbellport\s*(?:ave|avenue)\b/i, token: 'bellport ave', label: 'Bellport Ave' },
  { rx: /\bbrowns?\s*(?:ln|lane)\b/i, token: 'browns ln', label: 'Browns Lane' },
  { rx: /\blivingston(?:\s*(?:rd|road))?\b/i, token: 'livingston', label: 'Livingston Rd' },
  { rx: /\bhulse(?:\s*(?:st|street))?\b/i, token: 'hulse', label: 'Hulse St' },
  { rx: /\brogers(?:\s*(?:ave|avenue))?\b/i, token: 'rogers', label: 'Rogers Ave' },
  { rx: /\bbell\s*(?:st|street)\b/i, token: 'bell st', label: 'Bell St' },
  { rx: /\bacademy(?:\s*(?:ln|lane))?\b/i, token: 'academy', label: 'Academy Ln' },
  { rx: /\bgerard(?:\s*(?:st|street))?\b/i, token: 'gerard', label: 'Gerard St' },
  { rx: /\bshore\s*(?:rd|road)\b/i, token: 'shore rd', label: 'Shore Rd' },
  { rx: /\bthorn\s*hedge\b/i, token: 'thornhedge', label: 'Thornhedge Rd' },
  { rx: /\botis(?:\s*(?:ln|lane|ave|avenue))?\b/i, token: 'otis', label: 'Otis Ave' },
  { rx: /\bcountry\s*club\b/i, token: 'country club', label: 'Country Club Rd' },
  { rx: /\bs(?:outh|o)?\.?\s*howells(?:\s*(?:pt|point))?(?:\s*(?:rd|road))?\b/i, token: 's howells pt', label: 'S. Howells Pt Rd' },
  { rx: /\bn(?:orth)?\.?\s*howells(?:\s*(?:pt|point))?(?:\s*(?:rd|road))?\b/i, token: 'n howells pt', label: 'N. Howells Pt Rd' },
  { rx: /\bhowells(?:\s*(?:pt|point))?(?:\s*(?:rd|road))?\b/i, token: 'howells pt', label: 'Howells Pt Rd' },
  { rx: /\bs(?:outh|o)?\.?\s*brewster(?:\s*(?:ln|lane))?\b/i, token: 's brewster ln', label: 'S. Brewster Ln' },
  { rx: /\bn(?:orth)?\.?\s*brewster(?:\s*(?:ln|lane))?\b/i, token: 'n brewster ln', label: 'N. Brewster Ln' },
  { rx: /\bbrewster(?:\s*(?:ln|lane))?\b/i, token: 'brewster ln', label: 'Brewster Ln' },
  { rx: /\bcircuit(?:\s*(?:rd|road))?\b/i, token: 'circuit rd', label: 'Circuit Rd' },
  { rx: /\bbieselin(?:\s*(?:rd|road))?\b/i, token: 'bieselin rd', label: 'Bieselin Rd' },
  { rx: /\bpeat\s*hole(?:\s*(?:ln|lane))?\b/i, token: 'peathole ln', label: 'Peat Hole Ln' },
  { rx: /\boak\s*meadow(?:\s*(?:ln|lane))?\b/i, token: 'oak meadow ln', label: 'Oak Meadow Ln' },
  { rx: /\bpearl\s*(?:st|street)\b/i, token: 'pearl st', label: 'Pearl St' },
  { rx: /\bstation\s*(?:rd|road|ct|court)\b/i, token: 'station rd', label: 'Station Rd' },
  { rx: /\bkreamer(?:\s*(?:st|street))?\b/i, token: 'kreamer st', label: 'Kreamer St' },
  { rx: /\b(?:general\s+)?mclean(?:\s*(?:dr|drive))?\b/i, token: 'mclean dr', label: 'General McLean Dr' },
  { rx: /\bfirst\s*(?:st|street)\b/i, token: 'first st', label: 'First St' },
  { rx: /\bsecond\s*(?:st|street)\b/i, token: 'second st', label: 'Second St' },
  { rx: /\bthird\s*(?:st|street)\b/i, token: 'third st', label: 'Third St' },
  { rx: /\bfourth\s*(?:st|street)\b/i, token: 'fourth st', label: 'Fourth St' },
  { rx: /\bfifth\s*(?:st|street)\b/i, token: 'fifth st', label: 'Fifth St' },
  { rx: /\bnew\s+jersey(?:\s*(?:ave|avenue))?\b/i, token: 'new jersey ave', label: 'New Jersey Ave' },
  { rx: /\bcolonial\s*(?:ln|lane|dr|drive)\b/i, token: 'colonial', label: 'Colonial Ln' },
  { rx: /\bwoodland\s*park(?:\s*(?:rd|road))?\b/i, token: 'woodland park', label: 'Woodland Park Rd' },
  { rx: /\bmaplewood(?:\s*(?:dr|drive))?\b/i, token: 'maplewood dr', label: 'Maplewood Dr' },
  { rx: /\bmott(?:\s*(?:dr|drive))?\b/i, token: 'mott dr', label: 'Mott Dr' },
  { rx: /\bgeorge\s*(?:ct|court)\b/i, token: 'george ct', label: 'George Ct' },
  { rx: /\bbroadview(?:\s*(?:ave|avenue))?\b/i, token: 'broadview ave', label: 'Broadview Ave' },
  { rx: /\bbrookside(?:\s*(?:ave|avenue))?\b/i, token: 'brookside ave', label: 'Brookside Ave' },
  { rx: /\bwigtel(?:\s*(?:ln|lane))?\b/i, token: 'wigtel ln', label: 'Wigtel Ln' },
  { rx: /\bmaple\s*(?:st|street)\b/i, token: 'maple st', label: 'Maple St' },
  { rx: /\bwoodruff(?:\s*(?:rd|road))?\b/i, token: 'woodruff rd', label: 'Woodruff Rd' },
  { rx: /\bpoint\s*(?:rd|road)\b/i, token: 'point rd', label: 'Point Rd' },
  { rx: /\bbayview(?:\s*(?:st|street))?\b/i, token: 'bayview st', label: 'Bayview St' },
  { rx: /\bwyandott?e?(?:\s*(?:ln|lane))?\b/i, token: 'wyandotte ln', label: 'Wyandotte Ln' },
  { rx: /\bcedar\s*bluff(?:\s*(?:rd|road))?\b/i, token: 'cedar bluff', label: 'Cedar Bluff Rd' },
  { rx: /\bcedar\s*(?:st|street)\b/i, token: 'cedar st', label: 'Cedar St' },
  { rx: /\bleisurely(?:\s*(?:ln|lane))?\b/i, token: 'leisurely ln', label: 'Leisurely Ln' },
  { rx: /\bbaycrest(?:\s*(?:ave|avenue))?\b/i, token: 'baycrest ave', label: 'Baycrest Ave' },
  { rx: /\b(?:tuthill|tuttle)(?:\s*(?:st|street))?\b/i, token: 'tuthill st', label: 'Tuthill St' },
  { rx: /\bprice\s*(?:st|street)\b/i, token: 'price st', label: 'Price St' },
  { rx: /\bbayberry(?:\s*(?:rd|road))?\b/i, token: 'bayberry rd', label: 'Bayberry Rd' },
  { rx: /\btitus(?:\s*(?:ln|lane))?\b/i, token: 'titus ln', label: 'Titus Ln' },
  { rx: /\blangley(?:\s*(?:ln|lane))?\b/i, token: 'langley ln', label: 'Langley Ln' },
  { rx: /\bcottage\s*(?:pl|place)\b/i, token: 'cottage pl', label: 'Cottage Pl' },
  { rx: /\bsmythe(?:\s*(?:ct|court))?\b/i, token: 'smythe ct', label: 'Smythe Ct' },
  { rx: /\bhead\s+of\s+(?:the\s+)?neck\b/i, token: 'head of neck', label: 'Head of Neck Rd' },
  { rx: /\bosborne?(?:\s*(?:ln|lane))?\b/i, token: 'osborne ln', label: 'Osborne Ln' },
  { rx: /\braynors?(?:\s*(?:ln|lane))?\b/i, token: 'raynors ln', label: 'Raynors Ln' },
  { rx: /\bhigh\s*water(?:\s*(?:rd|road))?\b/i, token: 'high water', label: 'High Water Rd' },
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'all', 'every', 'any', 'some', 'only', 'just', 'both', 'either',
  'house', 'houses', 'home', 'homes', 'property', 'properties', 'listing', 'listings', 'place', 'places', 'residence', 'residences', 'parcel', 'parcels',
  'in', 'on', 'at', 'by', 'near', 'close', 'to', 'from', 'of', 'for', 'with', 'without', 'having', 'has', 'have', 'had', 'within', 'inside', 'outside',
  'and', 'or', 'but', 'not', 'no', 'non', 'that', 'which', 'who', 'are', 'is', 'be', 'was', 'were', 'those', 'these', 'them', 'they', 'it', 'its', 'there', 'where',
  'show', 'find', 'search', 'list', 'give', 'get', 'see', 'looking', 'want', 'me', 'my', 'our', 'us', 'your', 'we', 'can', 'could', 'would', 'should',
  'bellport', 'village', 'incorporated', 'ny', 'new', 'york', 'south', 'shore', 'long', 'island',
  'good', 'great', 'nice', 'lovely', 'pretty', 'really', 'very', 'super', 'most', 'more', 'lots', 'lot', 'ideal', 'dream', 'perfect', 'charming', 'classic', 'timeless', 'sweet', 'cozy', 'sunny', 'quiet',
  'family', 'vacation', 'summer', 'weekend', 'retreat', 'getaway', 'kids', 'children', 'guests',
  'how', 'many', 'much', 'often', 'what', 'whats', 'when', 'why', 'do', 'does', 'did',
  'sell', 'sells', 'sold', 'sale', 'sales', 'selling', 'closed', 'closing', 'closings', 'per', 'year', 'years', 'annual', 'annually', 'each',
  'average', 'avg', 'median', 'typical', 'typically', 'usually', 'total', 'count', 'number', 'percent', 'percentage', 'share', 'rate', 'turnover',
  'meet', 'meets', 'meeting', 'match', 'matches', 'matching', 'fit', 'fits', 'fitting',
  'parameter', 'parameters', 'criteria', 'criterion', 'filter', 'filters', 'target', 'targets', 'profile', 'taste', 'requirements', 'specs',
  'tell', 'compare', 'explain', 'price', 'prices', 'priced', 'cost', 'costs', 'come', 'comes', 'market', 'like', 'similar', 'than', 'feel', 'feels',
]);

export const OPEN_WORLD_TOPIC_RX =
  /\b(?:tax|taxes|arb|architectural\s+review|zoning|permits?|permitting|setbacks?|historic\s+district|septic|cesspool|owts|insurance|fema|commute|lirr|train|jitney|drive\s+time|manhattan|ferry\s+schedule|ho[-\s]?hum\s+rules|country\s+club\s+membership|golf\s+membership|schools?|school\s+district|renovat(?:e|ion|ing)\s+cost|remodel(?:ing)?\s+cost|cost\s+to|build\s+a\s+pool|put\s+in\s+a\s+pool|install\s+a\s+pool|all[-\s]?in\s+budget|mortgage|carrying\s+costs?|closing\s+costs?|mansion\s+tax|appreciation|resale|rent\s+out|short[-\s]?term\s+rental\s+laws|airbnb\s+rules|laws|rules|regulations|restrictions|ordinance|vs\.?|versus|compared\s+to|hamptons|quogue|westhampton|amagansett|remsenburg|north\s+fork|pros\s+and\s+cons|tradeoffs?|worth\s+it|contractors?|architects?)\b/i;

export function detectQuestionQuery(rawInput: string): boolean {
  const raw = rawInput.trim();
  if (!raw) return false;
  if (raw.includes('?')) return true;
  if (
    /^\s*(?:how|what|what's|whats|where|when|why|who|do|does|did|is|are|can|could|would|should|will|tell\s+me|compare|explain|estimate|calculate|analyze|advise|recommend|suggest|help\s+me|if\s+we|if\s+i|suppose|assuming)\b/i.test(
      raw
    )
  ) {
    return true;
  }
  if (
    /\b(?:how\s+many|how\s+much|how\s+often|per\s+year|each\s+year|annually|average\s+price|median\s+price|turnover|meet\s+(?:our|my)|match\s+(?:our|my))\b/i.test(
      raw
    )
  ) {
    return true;
  }
  if (OPEN_WORLD_TOPIC_RX.test(raw)) return true;

  const wordCount = raw.split(/\s+/).length;
  return wordCount >= 10;
}

export function parseNaturalLanguageQuery(rawInput: string): ParsedNaturalQuery {
  const raw = rawInput.trim();
  const s = raw.toLowerCase();
  const isQuestion = detectQuestionQuery(raw);
  const useSavedParameters =
    /\b(?:meet|meets|meeting|match|matches|matching|fit|fits|fitting)\s+(?:our|my|the)\s+(?:search|parameters?|criteria|filters?|targets?|profile|taste|needs|requirements|specs)\b|\b(?:our|my)\s+(?:search\s+parameters?|search\s+criteria|criteria|parameters?|filters?|taste\s+profile|ideal\s+search|targets?)\b/i.test(
      s
    );
  const asksForHomeSubset =
    useSavedParameters ||
    /\b(?:which\s+(?:homes?|houses?|listings?|properties|streets?)|what\s+(?:homes?|houses?|listings?)|how\s+many\s+(?:homes?|houses?)|show\s+me|find\s+(?:me\s+)?(?:homes?|houses?)|homes?\s+(?:that|with|under|below|where|like)|houses?\s+(?:that|with|under|below|where|like))\b/i.test(
      s
    );
  const isAdvisoryOnly = isQuestion && !asksForHomeSubset && OPEN_WORLD_TOPIC_RX.test(s);

  const res: ParsedNaturalQuery = {
    raw,
    active: raw.length > 0,
    isQuestion,
    isAdvisoryOnly,
    useSavedParameters,
    chips: [],
    statusIntent: null,
    soldYears: null,
    soldExactYears: [],
    minPrice: null,
    maxPrice: null,
    minBeds: null,
    maxBeds: null,
    minBaths: null,
    minSqft: null,
    minLot: null,
    maxLot: null,
    maxWalkMin: null,
    maxWalkStoresMin: null,
    belowSC: false,
    northOfSC: false,
    excludeFloodZone: false,
    inFloodZoneOnly: false,
    excludePool: false,
    excludeOverpriced: false,
    excludeUglyArch: false,
    beautifulStreetsOnly: false,
    streetMentions: [],
    similarToAddress: null,
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

  if (useSavedParameters) {
    res.chips.push('Matches Your Search Parameters');
    consume(
      /\b(?:meet|meets|meeting|match|matches|matching|fit|fits|fitting)\s+(?:our|my|the)\s+(?:search\s+parameters?|search|parameters?|criteria|filters?|targets?|profile|taste|needs|requirements|specs)\b|\b(?:our|my)\s+(?:search\s+parameters?|search\s+criteria|criteria|parameters?|filters?|taste\s+profile|ideal\s+search|targets?)\b/gi
    );
  }

  // 0. Similarity Reference ("houses like 37 Bellport Ln", "similar to 19 Third St")
  const simMatch = s.match(
    /\b(?:like|similar\s+to|comparable\s+to)\s+(\d+\s+[a-z][a-z\s.]{2,26}?(?:ln|lane|rd|road|st|street|ave|avenue|dr|drive|ct|court|pl|place))\b/i
  );
  if (simMatch) {
    res.similarToAddress = normalizeBellportStreetText(simMatch[1]);
    res.chips.push(`Similar to ${simMatch[1].trim()}`);
    consume(
      /\b(?:like|similar\s+to|comparable\s+to)\s+\d+\s+[a-z][a-z\s.]{2,26}?(?:ln|lane|rd|road|st|street|ave|avenue|dr|drive|ct|court|pl|place)\b/gi
    );
  }

  // 0b. Negations & Flood Zone / Style Exclusions (parsed BEFORE positive tokens so "no pool" / "not overpriced" never invert!)
  if (
    /\b(?:not\s+in\s+(?:a\s+)?flood\s+zone|no\s+flood(?:\s+zone)?|outside\s+(?:the\s+)?flood\s+zone|non[-\s]?flood|low\s+flood\s+risk|no\s+flood\s+insurance|avoid\s+flood)\b/i.test(
      s
    )
  ) {
    res.excludeFloodZone = true;
    res.chips.push('Excludes Flood Zone AE/VE');
    consume(
      /\b(?:not\s+in\s+(?:a\s+)?flood\s+zone|no\s+flood(?:\s+zone)?|outside\s+(?:the\s+)?flood\s+zone|non[-\s]?flood|low\s+flood\s+risk|no\s+flood\s+insurance|avoid\s+flood)\b/gi
    );
  } else if (/\b(?:in\s+(?:a\s+)?flood\s+zone|flood\s+zone\s*(?:ae|ve)|coastal\s+flood\s+zone)\b/i.test(s)) {
    res.inFloodZoneOnly = true;
    res.chips.push('Flood Zone AE/VE');
    consume(/\b(?:in\s+(?:a\s+)?flood\s+zone|flood\s+zone\s*(?:ae|ve)|coastal\s+flood\s+zone)\b/gi);
  }

  if (/\b(?:no\s+pools?|without\s+(?:a\s+)?pool|doesn'?t\s+have\s+(?:a\s+)?pool)\b/i.test(s)) {
    res.excludePool = true;
    res.chips.push('No Pool');
    consume(/\b(?:no\s+pools?|without\s+(?:a\s+)?pool|doesn'?t\s+have\s+(?:a\s+)?pool)\b/gi);
  }

  if (/\b(?:not\s+overpriced|aren'?t\s+overpriced|isn'?t\s+overpriced|fairly\s+priced|well[-\s]?priced|reasonable\s+price)\b/i.test(s)) {
    res.excludeOverpriced = true;
    res.chips.push('Fairly Priced or Better');
    consume(
      /\b(?:not\s+overpriced|aren'?t\s+overpriced|isn'?t\s+overpriced|fairly\s+priced|well[-\s]?priced|reasonable\s+price)\b/gi
    );
  }

  if (
    /\b(?:not\s+a\s+(?:high\s+)?ranch|no\s+(?:high\s+)?ranches|no\s+(?:high\s+)?ranch|no\s+split[-\s]?levels?|not\s+a\s+split[-\s]?level|no\s+(?:builder|suburban|tract)\s+colonials?|no\s+modern\s+box(?:es)?|no\s+ugly)\b/i.test(
      s
    )
  ) {
    res.excludeUglyArch = true;
    res.chips.push('Classic Architecture Only');
    consume(
      /\b(?:not\s+a\s+(?:high\s+)?ranch|no\s+(?:high\s+)?ranches|no\s+(?:high\s+)?ranch|no\s+split[-\s]?levels?|not\s+a\s+split[-\s]?level|no\s+(?:builder|suburban|tract)\s+colonials?|no\s+modern\s+box(?:es)?|no\s+ugly)\b/gi
    );
  }

  // 1. Market status & exact sale years ("sold in 2025", "2024 sales", "for sale", "off-market")
  const exactYrMatches = [
    ...s.matchAll(
      /\b(?:sold\s+in\s+|closed\s+in\s+|sales?\s+in\s+|from\s+)?(202[0-6])(?:\s+(?:sales?|closings?))?\b/g
    ),
  ];
  if (
    exactYrMatches.length > 0 &&
    /\b(sold|sales?|closed|closings?)\b/.test(s) &&
    !/\bbuilt\s+(?:in\s+|after\s+)?202[0-6]\b/.test(s)
  ) {
    res.statusIntent = 'past_sales';
    res.soldExactYears = Array.from(new Set(exactYrMatches.map((m) => Number(m[1]))));
    res.chips.push(`Sold in ${res.soldExactYears.join(', ')}`);
    consume(/\b(?:sold\s+in\s+|closed\s+in\s+|sales?\s+in\s+)?202[0-6](?:\s+(?:sales?|closings?))?\b/g);
    consume(/\b(sold|past\s+sales?|closed\s+sales?)\b/g);
  } else if (/\b(for\s+sale|on\s+the\s+market|active\s+listings?|currently\s+listed|available\s+now)\b/.test(s)) {
    res.statusIntent = 'for_sale';
    res.chips.push('For Sale');
    consume(/\b(for\s+sale|on\s+the\s+market|active\s+listings?|currently\s+listed|available\s+now)\b/g);
  } else if (/\b(past\s+sales?|recently\s+sold|sold\s+homes?|closed\s+sales?|sold\s+in)\b/.test(s)) {
    res.statusIntent = 'past_sales';
    const ym = s.match(/sold\s+(?:in\s+(?:the\s+)?)?(?:last\s+|past\s+)?(\d+)\s*(?:yr|year)s?/);
    if (ym) {
      res.soldYears = Number(ym[1]);
      res.chips.push(`Sold ≤${res.soldYears}y`);
    } else if (/\bsold\s+last\s+year\b/.test(s)) {
      res.soldExactYears = [2025];
      res.chips.push('Sold in 2025');
    } else if (/\bsold\s+this\s+year\b/.test(s)) {
      res.soldExactYears = [2026];
      res.chips.push('Sold in 2026');
    } else {
      res.chips.push('Past Sales');
    }
    consume(
      /\b(past\s+sales?|recently\s+sold|sold\s+homes?|closed\s+sales?|sold\s+last\s+year|sold\s+this\s+year|sold\s+(?:in\s+(?:the\s+)?)?(?:last\s+|past\s+)?\d*\s*(?:yr|year)?s?)\b/g
    );
  } else if (/\b(all\s+homes|off[-\s]?market|every\s+home|all\s+\w+\s+houses|all\s+houses|not\s+on\s+the\s+market)\b/.test(s)) {
    res.statusIntent = 'all_homes';
    consume(/\b(off[-\s]?market|all\s+homes|every\s+home|not\s+on\s+the\s+market)\b/g);
  }

  // 2. Exterior House Colors
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
    if (cr.rx.test(working)) {
      res.extColors.push(cr.code);
      res.chips.push(cr.label);
      consume(cr.rx);
    }
  }

  // 3. Lawns, Yards, Lot Geometry & Residency
  const addTrait = (tr: string, label: string) => {
    if (!res.requiredTraits.includes(tr)) {
      res.requiredTraits.push(tr);
      res.chips.push(label);
    }
  };

  if (
    /\b((?:large|big|huge|expansive|spacious|sweeping|sprawling|generous|wide|deep|massive|oversized)\s+(?:lawns?|yards?|backyards?|grounds|grass|gardens?)|lots?\s+of\s+(?:lawn|grass|yard\s+space)|plenty\s+of\s+(?:lawn|yard|grass))\b/.test(
      working
    )
  ) {
    addTrait('large_lawn', 'Large Open Lawn');
    res.sortHint = 'lawn_desc';
    consume(
      /\b((?:large|big|huge|expansive|spacious|sweeping|sprawling|generous|wide|deep|massive|oversized)\s+(?:lawns?|yards?|backyards?|grounds|grass|gardens?)|lots?\s+of\s+(?:lawn|grass|yard\s+space)|plenty\s+of\s+(?:lawn|yard|grass))\b/g
    );
  } else if (/\b(estate\s+grounds|park[-\s]?like|compound|sprawling\s+estate)\b/.test(working)) {
    addTrait('estate_grounds', 'Estate Grounds (0.6+ ac)');
    res.sortHint = 'lawn_desc';
    consume(/\b(estate\s+grounds|park[-\s]?like|compound|sprawling\s+estate)\b/g);
  } else if (/\b(lawn|garden|yard|backyard|privet)\b/.test(working)) {
    addTrait('large_lawn', 'Lush Lawn & Yard');
    consume(/\b(lawn|garden|yard|backyard|privet)s?\b/g);
  }

  if (/\b(deep\s+lot|deep\s+property|set\s+back)\b/.test(working)) {
    addTrait('deep_lot', 'Deep Lot (180+ ft)');
    consume(/\b(deep\s+lot|deep\s+property|set\s+back)s?\b/g);
  }
  if (/\b(wide\s+lot|wide\s+frontage)\b/.test(working)) {
    addTrait('wide_lot', 'Wide Frontage');
    consume(/\b(wide\s+lot|wide\s+frontage)s?\b/g);
  }
  if (/\b(mature\s+trees?|trees?|wooded|leafy|shaded|canopy|hedged|secluded|private)\b/.test(working)) {
    addTrait('lush_trees', 'Mature Trees & Privacy');
    consume(/\b(mature\s+trees?|trees?|wooded|leafy|shaded|canopy|hedged|secluded|private)\b/g);
  }
  if (/\b(quiet\s+(?:streets?|lanes?|blocks?|roads?)|tucked\s+away|cul[-\s]?de[-\s]?sac|low\s+traffic|side\s+streets?|dead[-\s]?end)\b/.test(working)) {
    addTrait('quiet_street', 'Quiet Side Street');
    consume(/\b(quiet\s+(?:streets?|lanes?|blocks?|roads?)|tucked\s+away|cul[-\s]?de[-\s]?sac|low\s+traffic|side\s+streets?|dead[-\s]?end)\b/g);
  }
  if (/\b(porch|porches|veranda|screened\s+porch|wrap[-\s]?around\s+porch|sunroom)\b/.test(working)) {
    addTrait('porch', 'Porch / Sunroom');
    consume(/\b(porch|porches|veranda|screened\s+porch|wrap[-\s]?around\s+porch|sunroom)\b/g);
  }
  if (/\b(open\s+floor\s+plan|open\s+layout|open\s+concept|tall\s+ceilings?|high\s+ceilings?|vaulted|airy|sun[-\s]?drenched|light[-\s]?filled|bright)\b/.test(working)) {
    addTrait('open_airy', 'Open / Light-Filled');
    consume(/\b(open\s+floor\s+plan|open\s+layout|open\s+concept|tall\s+ceilings?|high\s+ceilings?|vaulted|airy|sun[-\s]?drenched|light[-\s]?filled|bright)\b/g);
  }
  if (/\b(renovated|remodeled|turnkey|move[-\s]?in\s+ready|updated)\b/.test(working)) {
    addTrait('turnkey', 'Renovated / Turnkey');
    consume(/\b(renovated|remodeled|turnkey|move[-\s]?in\s+ready|updated)\b/g);
  }
  if (/\b(fixer|fixer[-\s]?upper|tlc|needs\s+work|project|as[-\s]?is|value[-\s]?add)\b/.test(working)) {
    addTrait('fixer', 'Fixer / Value-Add');
    consume(/\b(fixer|fixer[-\s]?upper|tlc|needs\s+work|project|as[-\s]?is|value[-\s]?add)\b/g);
  }
  if (/\b(single[-\s]?story|one[-\s]?story|1[-\s]?story|first[-\s]?floor\s+living|primary\s+on\s+first)\b/.test(working)) {
    addTrait('single_story', 'Single-Story');
    consume(/\b(single[-\s]?story|one[-\s]?story|1[-\s]?story|first[-\s]?floor\s+living|primary\s+on\s+first)\b/g);
  }
  if (/\b(second[-\s]?homes?|second[-\s]?home\s+owners?|absentee(?:\s+owners?)?|weekend\s+(?:homes?|owners?)|nyc\s+owners?|manhattan\s+owners?|brooklyn\s+owners?)\b/.test(working)) {
    addTrait('second_home', 'Second-Home / Absentee');
    if (!res.statusIntent) res.statusIntent = 'all_homes';
    consume(/\b(second[-\s]?homes?|second[-\s]?home\s+owners?|absentee(?:\s+owners?)?|weekend\s+(?:homes?|owners?)|nyc\s+owners?|manhattan\s+owners?|brooklyn\s+owners?)\b/g);
  } else if (/\b(full[-\s]?time\s+(?:owners?|residents?|homes?)|local\s+owners?|year[-\s]?round\s+(?:owners?|residents?|homes?)|primary\s+residences?)\b/.test(working)) {
    addTrait('full_time_owner', 'Full-Time Local Owner');
    if (!res.statusIntent) res.statusIntent = 'all_homes';
    consume(/\b(full[-\s]?time\s+(?:owners?|residents?|homes?)|local\s+owners?|year[-\s]?round\s+(?:owners?|residents?|homes?)|primary\s+residences?)\b/g);
  }
  if (/\b(airbnbs?|short[-\s]?term\s+rentals?)\b/.test(working)) {
    res.airbnbOnly = true;
    res.chips.push('Listed on Airbnb');
    consume(/\b(airbnbs?|short[-\s]?term\s+rentals?)\b/g);
  }

  // 4. Price ranges & colloquial bands ("$1.5M-$2.5M", "low 2s", "sub $2M", "<$3000000", "around $2M")
  const explicitRange = working.match(
    /(?:between\s+)?\$?([\d,.]+)\s*(m|million|k|thousand)?\s*(?:and|to|–|—|-)\s*\$?([\d,.]+)\s*(m|million|k|thousand)\b/
  );
  if (explicitRange) {
    const p1 = parseDollarToken(explicitRange[1], explicitRange[2] || explicitRange[4]);
    const p2 = parseDollarToken(explicitRange[3], explicitRange[4] || explicitRange[2]);
    if (p1 && p2) {
      res.minPrice = Math.min(p1, p2);
      res.maxPrice = Math.max(p1, p2);
      res.chips.push(`${fmtChipDollar(res.minPrice)}–${fmtChipDollar(res.maxPrice)}`);
      consume(
        /(?:between\s+)?\$?[\d,.]+\s*(?:m|million|k|thousand)?\s*(?:and|to|–|—|-)\s*\$?[\d,.]+\s*(?:m|million|k|thousand)\b/g
      );
    }
  } else if (/\blow\s+([1-4])s\b/.test(working)) {
    const base = Number(working.match(/\blow\s+([1-4])s\b/)![1]) * 1_000_000;
    res.minPrice = base;
    res.maxPrice = base + 390_000;
    res.chips.push(`${fmtChipDollar(res.minPrice)}–${fmtChipDollar(res.maxPrice)}`);
    consume(/\blow\s+[1-4]s\b/g);
  } else if (/\bmid[-\s]+([1-4])s\b/.test(working)) {
    const base = Number(working.match(/\bmid[-\s]+([1-4])s\b/)![1]) * 1_000_000;
    res.minPrice = base + 350_000;
    res.maxPrice = base + 690_000;
    res.chips.push(`${fmtChipDollar(res.minPrice)}–${fmtChipDollar(res.maxPrice)}`);
    consume(/\bmid[-\s]+[1-4]s\b/g);
  } else if (/\bhigh\s+([1-4])s\b/.test(working)) {
    const base = Number(working.match(/\bhigh\s+([1-4])s\b/)![1]) * 1_000_000;
    res.minPrice = base + 700_000;
    res.maxPrice = base + 999_000;
    res.chips.push(`${fmtChipDollar(res.minPrice)}–${fmtChipDollar(res.maxPrice)}`);
    consume(/\bhigh\s+[1-4]s\b/g);
  } else {
    const underM = working.match(
      /(?:<=?|≤|\b(?:under|below|less\s+than|max|up\s+to|sub[-\s]*|cheaper\s+than|budget(?:\s+of)?)\s*)\s*\$?([\d,]+(?:\.\d+)?)\s*(m|million|k|thousand)?\b/
    );
    if (underM) {
      const rawNum = parseFloat(underM[1].replace(/,/g, ''));
      const hasDollarOrSym = /[$<≤]|sub/i.test(underM[0]);
      if (underM[2] || hasDollarOrSym || rawNum >= 50_000 || rawNum < 25) {
        const p = parseDollarToken(
          underM[1],
          underM[2] || (rawNum < 25 ? 'm' : undefined)
        );
        if (p) {
          res.maxPrice = p;
          res.chips.push(`≤ ${fmtChipDollar(p)}`);
          consume(
            /(?:<=?|≤|\b(?:under|below|less\s+than|max|up\s+to|sub[-\s]*|cheaper\s+than|budget(?:\s+of)?)\s*)\s*\$?[\d,]+(?:\.\d+)?\s*(?:m|million|k|thousand)?\b/g
          );
        }
      }
    }
    const overM = working.match(
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
          res.chips.push(`${fmtChipDollar(p)}+`);
          consume(
            /(?:>=?|≥|\b(?:over|above|more\s+than|min|at\s+least)\s+)\s*\$?[\d,]+(?:\.\d+)?\s*(?:m|million|k|thousand)?\b/g
          );
        }
      }
    }
    const aroundM = working.match(/\b(?:around|about|roughly|near)\s+\$?([\d,.]+)\s*(m|million|k|thousand)\b/);
    if (aroundM && !res.minPrice && !res.maxPrice) {
      const p = parseDollarToken(aroundM[1], aroundM[2]);
      if (p) {
        res.minPrice = Math.round(p * 0.82);
        res.maxPrice = Math.round(p * 1.18);
        res.chips.push(`~${fmtChipDollar(p)}`);
        consume(/\b(?:around|about|roughly|near)\s+\$?[\d,.]+\s*(?:m|million|k|thousand)\b/g);
      }
    }
  }
  if (/\b(affordable|cheapest|entry[-\s]?level|lowest\s+price)\b/.test(working)) {
    res.maxPrice = res.maxPrice ?? 1_150_000;
    res.sortHint = 'price_asc';
    res.chips.push('≤ $1.15M');
    consume(/\b(affordable|cheapest|entry[-\s]?level|lowest\s+price)\b/g);
  }

  // 5. Bedrooms, Family Size & Bathrooms
  const bedRange = working.match(/\b(\d)\s*(?:or|to|-)\s*(\d)\s*(?:bed|beds|bedroom|bedrooms|br)\b/);
  if (bedRange) {
    res.minBeds = Number(bedRange[1]);
    res.maxBeds = Number(bedRange[2]);
    res.chips.push(`${res.minBeds}–${res.maxBeds} Beds`);
    consume(/\b\d\s*(?:or|to|-)\s*\d\s*(?:bed|beds|bedroom|bedrooms|br)\b/g);
  } else {
    const bedMin = working.match(/\b(?:at\s+least\s+)?(\d)\+?\s*(?:bed|beds|bedroom|bedrooms|br)\b/);
    if (bedMin) {
      res.minBeds = Number(bedMin[1]);
      res.chips.push(`${res.minBeds}+ Beds`);
      consume(/\b(?:at\s+least\s+)?\d\+?\s*(?:bed|beds|bedroom|bedrooms|br)\b/g);
    } else if (/\b(?:family\s+of\s+[5-8]|big\s+family|large\s+family|lots\s+of\s+bedrooms)\b/.test(working)) {
      res.minBeds = 4;
      res.chips.push('4+ Beds');
      consume(/\b(?:family\s+of\s+[5-8]|big\s+family|large\s+family|lots\s+of\s+bedrooms)\b/g);
    } else if (/\bfamily\s+of\s+4\b/.test(working)) {
      res.minBeds = 3;
      res.chips.push('3+ Beds');
      consume(/\bfamily\s+of\s+4\b/g);
    }
  }

  const bathMin = working.match(/\b(\d(?:\.\d)?)\+?\s*(?:bath|baths|bathroom|bathrooms|ba)\b/);
  if (bathMin) {
    res.minBaths = Number(bathMin[1]);
    res.chips.push(`${res.minBaths}+ Baths`);
    consume(/\b\d(?:\.\d)?\+?\s*(?:bath|baths|bathroom|bathrooms|ba)\b/g);
  }

  // 6. Square footage & Lot size (including fractional colloquial acreage)
  const sqftM = working.match(
    /\b(?:over\s+|at\s+least\s+|min\s+)?([\d,]{4,5})\+?\s*(?:sq\s*ft|sqft|square\s+feet|ft2)\b/
  );
  if (sqftM) {
    res.minSqft = Number(sqftM[1].replace(/,/g, ''));
    res.chips.push(`${res.minSqft.toLocaleString()}+ ft²`);
    consume(/\b(?:over\s+|at\s+least\s+|min\s+)?[\d,]{4,5}\+?\s*(?:sq\s*ft|sqft|square\s+feet|ft2)\b/g);
  }

  if (/\b(?:three[-\s]?quarters?\s+(?:of\s+an?\s+)?acre|0?\.75\s*ac)\b/.test(working)) {
    res.minLot = 0.72;
    res.chips.push('0.75+ Acres');
    consume(/\b(?:three[-\s]?quarters?\s+(?:of\s+an?\s+)?acre|0?\.75\s*ac)\b/g);
  } else if (/\b(?:half\s+(?:an?\s+)?acre|1\/2\s*acre)\b/.test(working)) {
    res.minLot = 0.48;
    res.chips.push('0.5+ Acres');
    consume(/\b(?:half\s+(?:an?\s+)?acre|1\/2\s*acre)\b/g);
  } else if (/\b(?:third\s+(?:of\s+an?\s+)?acre|1\/3\s*acre)\b/.test(working)) {
    res.minLot = 0.32;
    res.chips.push('0.33+ Acres');
    consume(/\b(?:third\s+(?:of\s+an?\s+)?acre|1\/3\s*acre)\b/g);
  } else if (/\b(?:quarter\s+(?:of\s+an?\s+)?acre|1\/4\s*acre)\b/.test(working)) {
    res.minLot = 0.24;
    res.chips.push('0.25+ Acres');
    consume(/\b(?:quarter\s+(?:of\s+an?\s+)?acre|1\/4\s*acre)\b/g);
  } else if (/\b(?:over\s+an\s+acre|at\s+least\s+an\s+acre|one\s+plus\s+acre)\b/.test(working)) {
    res.minLot = 0.98;
    res.chips.push('1+ Acre');
    consume(/\b(?:over\s+an\s+acre|at\s+least\s+an\s+acre|one\s+plus\s+acre)\b/g);
  } else {
    const lotM = working.match(/\b(\d+(?:\.\d+)?)\+?\s*(?:acre|acres|ac)\b/);
    if (lotM) {
      res.minLot = Number(lotM[1]);
      res.chips.push(`${res.minLot}+ Acres`);
      consume(/\b\d+(?:\.\d+)?\+?\s*(?:acre|acres|ac)\b/g);
    } else if (/\b(large\s+lots?|big\s+lots?|oversized\s+lots?|estate\s+lots?|double\s+lots?)\b/.test(working)) {
      res.minLot = 0.45;
      res.chips.push('Large Lot (0.45+ ac)');
      consume(/\b(large\s+lots?|big\s+lots?|oversized\s+lots?|estate\s+lots?|double\s+lots?)\b/g);
    }
  }

  // 7. North vs South of South Country Rd, Walkability & Beautiful Streets
  if (
    /\b(north\s+of\s+(?:south\s+country|s\.?\s+country|main)|above\s+(?:south\s+country|s\.?\s+country|main)|north\s+of\s+sc)\b/.test(
      working
    )
  ) {
    res.northOfSC = true;
    res.chips.push('North of S. Country Rd');
    consume(
      /\b(north\s+of\s+(?:south\s+country|s\.?\s+country|main)|above\s+(?:south\s+country|s\.?\s+country|main)|north\s+of\s+sc)(?:\s*(?:rd|road|st|street))?\b/g
    );
  } else if (
    /\b(south\s+of\s+(?:south\s+country|s\.?\s+country|main)|below\s+(?:south\s+country|s\.?\s+country|main)|south\s+of\s+sc)\b/.test(
      working
    )
  ) {
    res.belowSC = true;
    res.chips.push('Below S. Country Rd');
    consume(
      /\b(south\s+of\s+(?:south\s+country|s\.?\s+country|main)|below\s+(?:south\s+country|s\.?\s+country|main)|south\s+of\s+sc)(?:\s*(?:rd|road|st|street))?\b/g
    );
  }

  if (
    /\b(walk(?:able|ing)?\s+to\s+(?:the\s+)?(?:marina|bay|dock|ferry|water|beach)|near\s+(?:the\s+)?(?:marina|dock|ferry)|close\s+to\s+(?:the\s+)?(?:marina|dock|ferry|bay))\b/.test(
      working
    )
  ) {
    res.maxWalkMin = 12;
    res.chips.push('≤12m Walk to Marina/Ferry');
    consume(
      /\b(walk(?:able|ing)?\s+to\s+(?:the\s+)?(?:marina|bay|dock|ferry|water|beach)|near\s+(?:the\s+)?(?:marina|dock|ferry)|close\s+to\s+(?:the\s+)?(?:marina|dock|ferry|bay))\b/g
    );
  }

  if (
    /\b(walk(?:able|ing)?\s+to\s+(?:the\s+)?(?:town|shops|stores|coffee|restaurants|main\s+st|village(?:\s+center)?)|near\s+(?:town|shops|stores|main\s+st))\b/.test(
      working
    )
  ) {
    res.maxWalkStoresMin = 9;
    res.chips.push('≤9m Walk to Main St');
    consume(
      /\b(walk(?:able|ing)?\s+to\s+(?:the\s+)?(?:town|shops|stores|coffee|restaurants|main\s+st|village(?:\s+center)?)|near\s+(?:town|shops|stores|main\s+st))\b/g
    );
  }

  if (
    /\b(beautiful\s+streets?|prettiest\s+streets?|best\s+streets?|best\s+lanes?|scenic\s+streets?|tree[-\s]?lined|favorite\s+streets?|historic\s+lanes?)\b/.test(
      working
    )
  ) {
    res.beautifulStreetsOnly = true;
    res.chips.push('Beautiful Historic Streets');
    consume(
      /\b(beautiful\s+streets?|prettiest\s+streets?|best\s+streets?|best\s+lanes?|scenic\s+streets?|tree[-\s]?lined|favorite\s+streets?|historic\s+lanes?)\b/g
    );
  }

  // Match any of the 55+ Bellport Village streets (unless the whole query starts with an exact street house number like "37 Bellport Ln")
  const hasExactHouseNum = /^\d+\s+[a-z]/i.test(raw);
  if (!hasExactHouseNum) {
    for (const sp of KNOWN_STREET_PATTERNS) {
      if (sp.rx.test(working) && !res.streetMentions.includes(sp.token)) {
        res.streetMentions.push(sp.token);
        res.chips.push(sp.label);
        consume(new RegExp(sp.rx.source, 'gi'));
      }
    }
  }

  // 8. Pool logic (skipped if excludePool was set!)
  if (!res.excludePool) {
    if (
      /\b(pool\s+or\s+(?:room|space)(?:\s+for\s+(?:a\s+)?pool)?|either\s+pool|(?:room|space)\s+for\s+(?:a\s+)?pool\s+or\s+pool|add\s+room\s+for\s+pool)\b/.test(
        working
      )
    ) {
      res.poolMode = 'pool_or_room';
      res.chips.push('Pool or Room for Pool');
      consume(
        /\b(pool\s+or\s+(?:room|space)(?:\s+for\s+(?:a\s+)?pool)?|either\s+pool|(?:room|space)\s+for\s+(?:a\s+)?pool\s+or\s+pool|add\s+room\s+for\s+pool)\b/g
      );
    } else if (
      /\b((?:room|space)\s+(?:for|to\s+put\s+in|to\s+add|to\s+build)\s+(?:a\s+)?pool|pool[-\s]?ready|pool\s+site)\b/.test(
        working
      )
    ) {
      if (/\b(with\s+(?:a\s+)?pool|has\s+(?:a\s+)?pool|existing\s+pool)\b/.test(working)) {
        res.poolMode = 'pool_or_room';
        res.chips.push('Pool or Room for Pool');
      } else {
        res.poolMode = 'room_only';
        res.chips.push('Room for Pool');
      }
      consume(
        /\b((?:room|space)\s+(?:for|to\s+put\s+in|to\s+add|to\s+build)\s+(?:a\s+)?pool|pool[-\s]?ready|pool\s+site|with\s+(?:a\s+)?pool|has\s+(?:a\s+)?pool|existing\s+pool)\b/g
      );
    } else if (
      /\b(pools?|heated\s+pool|gunite|inground\s+pool|in-ground\s+pool|swimming\s+pool)\b/.test(
        working
      )
    ) {
      res.poolMode = 'pool_only';
      res.chips.push('Current Pool');
      consume(/\b(heated\s+pool|gunite|inground\s+pool|in-ground\s+pool|swimming\s+pool|pools?)\b/g);
    }
  }

  // 9. Design & Architectural features
  const addFeat = (fk: string, label: string) => {
    if (!res.feats.includes(fk)) {
      res.feats.push(fk);
      res.chips.push(label);
    }
  };
  if (/\b(shingles?|shingled|cedar[-\s]?shake)\b/.test(working)) {
    addFeat('shingles', 'Shingles');
    consume(/\b(shingles?|shingled|cedar[-\s]?shake)\b/g);
  }
  if (
    /\b(most\s+beautiful|prettiest|stunning|gorgeous|landmark|architectural\s+beauty|beautiful\s+houses?|beautiful\s+homes?|beautiful\s+architecture)\b/.test(
      working
    )
  ) {
    res.minBeauty = 8.4;
    res.sortHint = 'beauty_desc';
    res.chips.push('High Arch. Beauty (8.4+/10)');
    consume(
      /\b(most\s+beautiful|prettiest|stunning|gorgeous|landmark|architectural\s+beauty|beautiful\s+houses?|beautiful\s+homes?|beautiful\s+architecture)\b/g
    );
  } else if (/\b(architectural|character|pedigree)\b/.test(working)) {
    addFeat('arch', 'Beautiful Architecture');
    consume(/\b(architectural|character|pedigree)\b/g);
  }
  if (/\b(second\s+floor|two[-\s]?story|2[-\s]?story|upstairs)\b/.test(working)) {
    addFeat('second_floor', 'Second Floor');
    consume(/\b(second\s+floor|two[-\s]?story|2[-\s]?story|upstairs)\b/g);
  }
  if (/\b(basement|cellar)\b/.test(working)) {
    addFeat('basement', 'Basement');
    consume(/\b(basement|cellar)s?\b/g);
  }
  if (/\b(fireplaces?|hearth|wood[-\s]?burning)\b/.test(working)) {
    addFeat('fireplace', 'Fireplace');
    consume(/\b(fireplaces?|hearth|wood[-\s]?burning)\b/g);
  }
  if (/\b(waterfront|bayfront|on\s+the\s+(?:bay|water)|dock|bulkhead|water\s+views?)\b/.test(working)) {
    addFeat('waterfront', 'Waterfront');
    consume(/\b(waterfront|bayfront|on\s+the\s+(?:bay|water)|dock|bulkhead|water\s+views?)\b/g);
  }
  if (
    /\b(guest\s+(?:house|cottage|quarters)|carriage|pool\s+house|detached\s+studio|studio|adu|barn|outbuilding)\b/.test(
      working
    )
  ) {
    addFeat('addl_struct', 'Additional Structure');
    consume(
      /\b(guest\s+(?:house|cottage|quarters)|carriage|pool\s+house|detached\s+studio|studio|adu|barn|outbuilding)s?\b/g
    );
  }

  // 10. Era & Architectural style keywords
  const builtBeforeM = working.match(/\b(?:built\s+before|pre[-\s]?)(\d{4})\b/);
  const builtAfterM = working.match(/\b(?:built\s+after|since\s+|post[-\s]?)(\d{4})\b/);
  if (builtBeforeM) {
    res.maxYearBuilt = Number(builtBeforeM[1]);
    res.chips.push(`Built ≤${res.maxYearBuilt}`);
    consume(/\b(?:built\s+before|pre[-\s]?)\d{4}\b/g);
  } else if (builtAfterM) {
    res.minYearBuilt = Number(builtAfterM[1]);
    res.chips.push(`Built ${res.minYearBuilt}+`);
    consume(/\b(?:built\s+after|since\s+|post[-\s]?)\d{4}\b/g);
  } else if (/\b(19th\s+century|1800s)\b/.test(working)) {
    res.maxYearBuilt = 1900;
    res.chips.push('19th Century (≤1900)');
    consume(/\b(19th\s+century|1800s)\b/g);
  } else if (/\b(historic|pre[-\s]?war|antique|vintage|turn\s+of\s+the\s+century)\b/.test(working)) {
    res.maxYearBuilt = 1940;
    res.chips.push('Historic (Pre-1940)');
    consume(/\b(historic|pre[-\s]?war|antique|vintage|turn\s+of\s+the\s+century)\b/g);
  } else if (/\b(new\s+construction|newly\s+built|modern\s+build|built\s+recently)\b/.test(working)) {
    res.minYearBuilt = 2015;
    res.chips.push('Built 2015+');
    consume(/\b(new\s+construction|newly\s+built|modern\s+build|built\s+recently)\b/g);
  }

  for (const stWord of [
    'greek revival',
    'colonial',
    'cape',
    'victorian',
    'farmhouse',
    'ranch',
    'contemporary',
    'cottage',
    'gambrel',
    'clapboard',
  ]) {
    const rx = new RegExp(`\\b${stWord}s?\\b`, 'i');
    if (rx.test(working)) {
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
  if (/\b(underpriced|undervalued|good\s+deals?|great\s+deals?|bargains?|best\s+value|below\s+comps?)\b/.test(working)) {
    res.valuation = 'underpriced';
    res.chips.push('Underpriced');
    consume(/\b(underpriced|undervalued|good\s+deals?|great\s+deals?|bargains?|best\s+value|below\s+comps?)\b/g);
  } else if (!res.excludeOverpriced && /\b(overpriced)\b/.test(working)) {
    res.valuation = 'overpriced';
    res.chips.push('Overpriced');
    consume(/\b(overpriced)\b/g);
  }

  if (/\b(perfect\s+fit|ideal\s+fit|dream\s+fit)\b/.test(working)) {
    res.robbieFit = 'perfect';
    res.chips.push('★ Perfect Fit');
    consume(/\b(perfect\s+fit|ideal\s+fit|dream\s+fit)\b/g);
  } else if (/\b(great\s+fit|best\s+fit)\b/.test(working)) {
    res.robbieFit = 'great_plus';
    res.chips.push('Great or Perfect Fit');
    consume(/\b(great\s+fit|best\s+fit)\b/g);
  } else if (/\b(good\s+fit|fits?\s+me)\b/.test(working)) {
    res.robbieFit = 'good_plus';
    res.chips.push('Good+ Fit');
    consume(/\b(good\s+fit|fits?\s+me)\b/g);
  }

  if (
    isQuestion &&
    !res.statusIntent &&
    /\b(?:sell|sells|sold|sales|per\s+year|each\s+year|annually|turnover)\b/i.test(s)
  ) {
    res.statusIntent = 'past_sales';
  }

  // 12. Residual tokens:
  // - If isQuestion is true OR we already extracted >= 2 structured filter chips (so extra conversational adjectives don't accidentally wipe out matches),
  //   only keep numeric/address tokens unless ZERO structured filters matched!
  const rawLeftover = working
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1 && (/\d/.test(w) || (w.length >= 3 && !STOP_WORDS.has(w))));

  const leftover = isQuestion
    ? []
    : res.chips.length >= 2
      ? rawLeftover.filter((w) => /\d/.test(w))
      : rawLeftover;

  res.residualTokens = leftover;
  if (leftover.length > 0 && res.chips.length === 0) {
    res.chips.push(`Keyword: “${leftover.join(' ')}”`);
  }

  return res;
}
