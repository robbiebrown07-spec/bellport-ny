import type { FilterState, Listing } from '../types';

const SYNONYMS: Record<string, string[]> = {
  ferry: ['ferry', 'ho-hum', 'marina'],
  beach: ['beach', 'ho-hum', 'bayfront', 'waterfront', 'marina'],
  guest: ['guest', 'cottage', 'carriage', 'cabana', 'studio'],
  cottage: ['cottage', 'guest', 'carriage'],
  golf: ['golf', 'country club'],
  porch: ['porch', 'screened', 'sunroom'],
  whisper: ['off-market', 'whisper', 'quietly'],
};

export function parseSearchTokens(query: string): string[] {
  const tokens: string[] = [];
  const trimmed = query.trim();
  if (!trimmed) return tokens;

  const regex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    const token = (match[1] ?? match[2] ?? '').toLowerCase().trim();
    if (token) tokens.push(token);
  }
  return tokens;
}

export function matchesQuery(listing: Listing, query: string): boolean {
  const tokens = parseSearchTokens(query);
  if (tokens.length === 0) return true;

  const haystack = [
    listing.address,
    listing.area,
    listing.style,
    listing.headline,
    listing.description,
    listing.features.join(' '),
    listing.brokerage,
    listing.personalNotes,
    listing.inVillage ? 'incorporated village ho-hum ferry' : 'outside village unincorporated',
    `zone ${listing.floodZone.toLowerCase()}`,
    listing.marketStatus,
  ]
    .join(' ')
    .toLowerCase();

  return tokens.every((tok) => {
    const expansions = SYNONYMS[tok] ?? [tok];
    return expansions.some((candidate) => haystack.includes(candidate));
  });
}

export function filterAndSortListings(listings: Listing[], filters: FilterState): Listing[] {
  const filtered = listings.filter((item) => {
    // Segmented TopBar tab
    if (filters.tab === 'shortlist') {
      if (item.userStatus !== 'shortlist' && item.userStatus !== 'watching') return false;
    } else if (filters.tab === 'comps') {
      if (item.marketStatus !== 'sold' && item.marketStatus !== 'contingent') return false;
    } else {
      // 'all' tab shows active, off-market, contingent, and sold unless marketStatus narrows it
    }

    if (filters.marketStatus !== 'all' && item.marketStatus !== filters.marketStatus) {
      return false;
    }
    if (filters.area !== 'all' && item.area !== filters.area) {
      return false;
    }
    if (filters.villageOnly && !item.inVillage) {
      return false;
    }
    if (filters.zoneXOnly && item.floodZone !== 'X') {
      return false;
    }
    if (filters.minPrice !== null && item.price < filters.minPrice) {
      return false;
    }
    if (filters.maxPrice !== null && item.price > filters.maxPrice) {
      return false;
    }
    if (filters.minBeds !== null && item.beds < filters.minBeds) {
      return false;
    }
    if (filters.minBaths !== null && item.baths < filters.minBaths) {
      return false;
    }
    if (filters.minSqft !== null && item.sqft < filters.minSqft) {
      return false;
    }
    if (filters.minAcres !== null && item.lotAcres < filters.minAcres) {
      return false;
    }
    if (filters.q && !matchesQuery(item, filters.q)) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (filters.sortBy) {
      case 'price-asc':
        return a.price - b.price;
      case 'price-desc':
        return b.price - a.price;
      case 'sqft-desc':
        return b.sqft - a.sqft;
      case 'ppsf-asc': {
        const ppsfA = a.sqft > 0 ? a.price / a.sqft : Number.MAX_SAFE_INTEGER;
        const ppsfB = b.sqft > 0 ? b.price / b.sqft : Number.MAX_SAFE_INTEGER;
        return ppsfA - ppsfB;
      }
      case 'acres-desc':
        return b.lotAcres - a.lotAcres;
      case 'newest':
      default:
        return b.listedDate.localeCompare(a.listedDate);
    }
  });

  return sorted;
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

export function splitHighlightParts(text: string, query: string): HighlightSegment[] {
  const tokens = parseSearchTokens(query).filter((t) => t.length >= 2);
  if (tokens.length === 0 || !text) {
    return [{ text, matched: false }];
  }

  const escaped = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

  const parts = text.split(regex);
  return parts
    .filter((p) => p.length > 0)
    .map((part) => ({
      text: part,
      matched: tokens.some((t) => part.toLowerCase() === t.toLowerCase()),
    }));
}
