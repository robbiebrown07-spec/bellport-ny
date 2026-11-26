import type { Listing } from '../types';
import { evaluateAirbnbViability } from './intelligence';

export interface ArchitecturalBeautyRating {
  score10: number; // e.g. 9.2
  display: string; // e.g. "9.2/10"
  tierLabel: string;
  rationale: string;
}

export interface VerifiedAirbnbRecord {
  url: string;
  title: string;
  host: string;
  rating: string;
  peakNightly: number;
  shoulderNightly: number;
  estAnnualRevenue: number;
  notes: string;
}

export interface OwnerAndAirbnbProfile {
  hasOwnerRecord: boolean;
  ownerDisplay: string;
  ownershipStructure: 'Individual / Couple' | 'Family Trust' | 'LLC / Entity';
  residencyStatus: 'second_home' | 'full_time_local' | 'unknown';
  residencyBadge: string;
  residencySummary: string;
  isListedOnAirbnb: boolean;
  airbnbRecord: VerifiedAirbnbRecord | null;
  estPeakNightly: number;
  estShoulderNightly: number;
  estAugustGross: number;
  estAnnualAirbnbRevenue: number;
  taxOffsetPct: number;
}

const VERIFIED_VILLAGE_AIRBNBS: Record<string, VerifiedAirbnbRecord> = {
  'p-2713436': {
    url: 'https://www.airbnb.com/rooms/33609928',
    title: 'Gorgeous Renovated Bellport Village Home w/ Saltwater Pool & Gym',
    host: 'Romain',
    rating: '4.95 ★',
    peakNightly: 1150,
    shoulderNightly: 725,
    estAnnualRevenue: 78_000,
    notes: 'Renovated 1920s Dutch Colonial on 0.34 ac with private saltwater pool, large deck & finished basement gym.',
  },
  'p-2713749': {
    url: 'https://www.airbnb.com/rooms/26337143',
    title: 'Bellport Village Temperance Hall: The Ho-Hum & Old Inlet Suites',
    host: 'Alison & Joanne',
    rating: '4.90 ★ (188+ reviews)',
    peakNightly: 465,
    shoulderNightly: 310,
    estAnnualRevenue: 92_000,
    notes: 'Historic c. 1865 Main Street residence operating 3–4 private guest suites with shared heated summer pool.',
  },
  'p-2713631': {
    url: 'https://www.airbnb.com/rooms/891368836142962977',
    title: 'Bellport Retreat · Heated Saltwater Pool & Outdoor Kitchen',
    host: 'Gordon & Charlie',
    rating: 'Top 10% Guest Favorite',
    peakNightly: 1050,
    shoulderNightly: 680,
    estAnnualRevenue: 68_000,
    notes: '4-bedroom Village retreat with heated saltwater pool, outdoor kitchen, and 10-minute walk to Marina.',
  },
  'p-2713339': {
    url: 'https://www.airbnb.com/rooms/1353100115274745293',
    title: 'Bellport Village Charmer · Remodeled c. 1900 Home w/ Heated Pool',
    host: 'David',
    rating: '5.0 ★',
    peakNightly: 1195,
    shoulderNightly: 760,
    estAnnualRevenue: 82_000,
    notes: 'Remodeled c. 1900 Village residence with sleeping porch, wood-burning fireplace, outdoor kitchen & heated pool.',
  },
};

export function evaluateArchitecturalBeauty(listing: Listing): ArchitecturalBeautyRating {
  const styleText = `${listing.style} ${listing.styleSummary ?? ''} ${listing.headline ?? ''}`.toLowerCase();
  const fullText = `${styleText} ${listing.description} ${listing.features.join(' ')} ${(listing.feats ?? []).join(' ')}`.toLowerCase();
  const addrL = listing.address.toLowerCase();

  let pts = 6.6;
  const traits: string[] = [];

  // Vernacular & Architectural Pedigree
  if (/\b(shingle[-\s]?style|dutch\s+gambrel|gambrel|greek\s+revival|sea\s+captain|queen\s+anne|victorian)\b/.test(fullText)) {
    pts += 1.8;
    traits.push('authentic coastal Shingle / Gambrel pedigree');
  } else if (/\b(cape\s*cod|\bcape\b|cedar[-\s]?shingled?|clapboard\s+colonial|historic.*colonial|farmhouse|modern\s+barn)\b/.test(fullText)) {
    pts += 1.35;
    traits.push('classic New England shingle / Colonial proportions');
  } else if (/\b(colonial|cottage|traditional)\b/.test(styleText)) {
    pts += 0.85;
    traits.push('balanced traditional Village massing');
  } else if (/\b(ranch|contemporary)\b/.test(styleText)) {
    pts += 0.3;
    traits.push('clean low-slung residential profile');
  } else if (/\b(split[-\s]?level|hi[-\s]?ranch|vinyl\s+box)\b/.test(fullText)) {
    pts -= 0.7;
  }

  // Historic era authenticity
  if (listing.yearBuilt > 0 && listing.yearBuilt <= 1915) {
    pts += 0.75;
    traits.push(`turn-of-the-century c. ${listing.yearBuilt} craftsmanship`);
  } else if (listing.yearBuilt > 1915 && listing.yearBuilt <= 1939) {
    pts += 0.5;
    traits.push(`pre-war c. ${listing.yearBuilt} detailing`);
  } else if (listing.yearBuilt >= 2018) {
    pts += 0.35;
    traits.push('crisp contemporary millwork');
  }

  // Materiality, porches, hearths, outbuildings & landscape framing
  if (/\b(cedar\s+shingle|weathered\s+shingle|shingles)\b/.test(fullText)) {
    pts += 0.35;
  }
  if (/\b(wrap[-\s]?around\s+porch|screened\s+porch|sleeping\s+porch|covered\s+veranda|french\s+doors)\b/.test(fullText)) {
    pts += 0.3;
    traits.push('inviting porch / indoor-outdoor architecture');
  }
  if (/\b(carriage\s+(?:house|barn)|guest\s+cottage|pool\s+house|detached\s+studio)\b/.test(fullText)) {
    pts += 0.25;
    traits.push('secondary carriage/pool structure');
  }
  if (listing.lotAcres >= 0.5 || /\b(privet|sycamore|specimen|english\s+garden|estate\s+grounds)\b/.test(fullText)) {
    pts += 0.25;
    traits.push('lush landscape setting');
  }
  if (/\b(bellport\s+ln|browns\s+ln|shore\s+rd|otis|academy|bell\s+st|hulse|livingston)\b/.test(addrL)) {
    pts += 0.2;
  }
  if (/\b(needs\s+some\s+tlc|dated|as[-\s]?is)\b/.test(fullText)) {
    pts -= 0.45;
  }

  // Deterministic subtle tie-break by address hash so scores feel organic (e.g. 7.4, 8.7, 9.4)
  let hash = 0;
  for (let i = 0; i < listing.address.length; i++) {
    hash = (hash * 31 + listing.address.charCodeAt(i)) % 5;
  }
  pts += (hash - 2) * 0.08;

  const score10 = Math.max(5.2, Math.min(9.8, Math.round(pts * 10) / 10));
  const display = `${score10.toFixed(1)}/10`;

  const tierLabel =
    score10 >= 9.0
      ? 'Landmark Village Architecture'
      : score10 >= 8.2
        ? 'Distinguished Coastal Character'
        : score10 >= 7.4
          ? 'Handsome Village Vernacular'
          : 'Clean Residential Form';

  const rationale =
    traits.length > 0
      ? `${tierLabel} — highlighted by ${traits.slice(0, 3).join(', ')}.`
      : `${tierLabel} on a ${listing.lotAcres}-acre Bellport Village lot.`;

  return { score10, display, tierLabel, rationale };
}

function cleanOwnerName(raw?: string | null): string {
  if (!raw) return 'Public Roll Owner';
  return raw
    .replace(/\s+/g, ' ')
    .replace(/&([A-Za-z])/g, '& $1')
    .trim();
}

export function getOwnerAndAirbnbProfile(params: {
  parcelId?: string | null;
  owner?: string | null;
  mail?: string | null;
  absentee?: boolean;
  listing: Listing;
}): OwnerAndAirbnbProfile {
  const { parcelId, owner, mail, absentee, listing } = params;
  const airbnbEval = evaluateAirbnbViability(listing);
  const ownerClean = cleanOwnerName(owner);
  const hasOwnerRecord = Boolean(owner && owner.trim());

  let ownershipStructure: OwnerAndAirbnbProfile['ownershipStructure'] = 'Individual / Couple';
  if (/\b(llc|inc|corp|lp|holdings|properties|associates)\b/i.test(ownerClean)) {
    ownershipStructure = 'LLC / Entity';
  } else if (/\b(trust|trustee|irrevocable|revocable|qprt)\b/i.test(ownerClean)) {
    ownershipStructure = 'Family Trust';
  }

  const mailClean = (mail ?? '').trim();
  const isLocalMail =
    !absentee && (!mailClean || /bellport/i.test(mailClean));

  const residencyStatus: OwnerAndAirbnbProfile['residencyStatus'] = !hasOwnerRecord && !mailClean
    ? 'unknown'
    : isLocalMail
      ? 'full_time_local'
      : 'second_home';

  const residencyBadge =
    residencyStatus === 'second_home'
      ? `Second-Home / Absentee Owner${mailClean ? ` (${mailClean})` : ''}`
      : residencyStatus === 'full_time_local'
        ? 'Primary / Full-Time Bellport Tax Address'
        : 'Bellport Village Resident Roll';

  const residencySummary =
    residencyStatus === 'second_home'
      ? `Public assessment roll mails property tax bills to ${mailClean || 'an out-of-town primary residence'}, indicating this house is held as a second home or seasonal retreat${ownershipStructure !== 'Individual / Couple' ? ` via a ${ownershipStructure}` : ''}.`
      : residencyStatus === 'full_time_local'
        ? `Property tax bills are mailed directly to Bellport, NY, indicating a full-time local resident (or primary Bellport domicile)${ownershipStructure !== 'Individual / Couple' ? ` held in a ${ownershipStructure}` : ''}.`
        : 'Ownership recorded on the Incorporated Village of Bellport assessment roll.';

  // Match verified Airbnb listing by parcel ID or address
  let airbnbRecord: VerifiedAirbnbRecord | null =
    parcelId && VERIFIED_VILLAGE_AIRBNBS[parcelId]
      ? VERIFIED_VILLAGE_AIRBNBS[parcelId]
      : null;

  if (!airbnbRecord) {
    const addrNorm = listing.address.toLowerCase();
    if (/^70\s+station/.test(addrNorm)) airbnbRecord = VERIFIED_VILLAGE_AIRBNBS['p-2713436'];
    else if (/^164\s+s(?:outh|\.)?\s+country/.test(addrNorm)) airbnbRecord = VERIFIED_VILLAGE_AIRBNBS['p-2713749'];
    else if (/^11\s+gen.*mclean/.test(addrNorm)) airbnbRecord = VERIFIED_VILLAGE_AIRBNBS['p-2713631'];
    else if (/^182\s+s(?:outh|\.)?\s+country/.test(addrNorm)) airbnbRecord = VERIFIED_VILLAGE_AIRBNBS['p-2713339'];
  }

  const estPeakNightly = airbnbRecord?.peakNightly ?? airbnbEval.estNightlyPeak;
  const estShoulderNightly = airbnbRecord?.shoulderNightly ?? Math.round((estPeakNightly * 0.64) / 25) * 25;
  const estAugustGross = Math.round((estPeakNightly * 24) / 1000) * 1000;
  // Typical Bellport Village short-term/seasonal host (~52 peak summer nights + ~26 shoulder weekend nights)
  const estAnnualAirbnbRevenue =
    airbnbRecord?.estAnnualRevenue ??
    Math.round((estPeakNightly * 52 + estShoulderNightly * 26) / 1000) * 1000;
  const taxOffsetPct =
    listing.annualTaxes > 0
      ? Math.round((estAnnualAirbnbRevenue / listing.annualTaxes) * 100)
      : 100;

  return {
    hasOwnerRecord,
    ownerDisplay: ownerClean,
    ownershipStructure,
    residencyStatus,
    residencyBadge,
    residencySummary,
    isListedOnAirbnb: Boolean(airbnbRecord),
    airbnbRecord,
    estPeakNightly,
    estShoulderNightly,
    estAugustGross,
    estAnnualAirbnbRevenue,
    taxOffsetPct,
  };
}
