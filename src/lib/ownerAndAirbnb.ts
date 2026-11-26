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

export type ArchitecturalTasteBucket = 'loved' | 'ok' | 'ugly';

export function classifyArchitecturalTaste(listing: Listing): {
  bucket: ArchitecturalTasteBucket;
  reason: string;
} {
  const styleText = `${listing.style} ${listing.styleSummary ?? ''} ${listing.headline ?? ''}`.toLowerCase();
  const fullText = `${styleText} ${listing.description} ${listing.features.join(' ')} ${(listing.feats ?? []).join(' ')}`.toLowerCase();
  const yr = listing.yearBuilt || 1960;

  // 1. HARD DISLIKE ("Ugly"): High Ranches, Raised Ranches, Bi-Levels, Split-Levels, Splanches
  if (
    /\b(high[-\s]?ranch|hi[-\s]?ranch|raised\s+ranch|bi[-\s]?level|bilevel|splanch)\b/i.test(
      fullText
    )
  ) {
    return {
      bucket: 'ugly',
      reason: 'Post-war High Ranch / Bi-Level box with garage-under facade and raised exterior stoop',
    };
  }

  if (/\b(split[-\s]?level|tri[-\s]?level)\b/i.test(fullText)) {
    return {
      bucket: 'ugly',
      reason: 'Post-war suburban Split-Level massing',
    };
  }

  // 2. HARD DISLIKE ("Ugly"): 1954–1992 Post-War Suburban Builder / Garrison / Center-Hall Tract Colonials
  const isPostWarSuburbanColonial =
    yr >= 1954 &&
    yr <= 1992 &&
    /\b(center[-\s]?hall\s+colonial|two[-\s]?story\s+clapboard\s+colonial|two[-\s]?story\s+cedar[-\s]?shingle\s+colonial|garrison|vinyl\s+colonial|builder\s+colonial)\b/i.test(
      styleText
    ) &&
    !/\b(shingle[-\s]?style\s+waterfront|custom\s+coastal|georgian\s+country\s+estate|carriage\s+house)\b/i.test(
      fullText
    );

  if (isPostWarSuburbanColonial) {
    return {
      bucket: 'ugly',
      reason: `${yr} suburban builder / Garrison Colonial massing with prominent front-loading garage proportions`,
    };
  }

  // 3. REALLY LIKE ("Loved"):
  //   a) Authentic Pre-War (<= 1945) Village Vernacular: Greek Revival, Gambrel, Shingle Cottage, Victorian, Farmhouse, Pre-War Colonial
  //   b) Classic 1940–1953 Steep-Roofed Cedar-Shake Cape Cods & Beamed/Dormered Village Cottages (e.g. 19 Third St, 17 Third St, 26 General McLean)
  //   c) Bespoke Custom Shingle-Style / Historic-Inspired Compounds (e.g. 68 S Howells Point Rd)
  const isPreWarPedigree =
    yr > 0 &&
    yr <= 1945 &&
    !/\b(high[-\s]?ranch|split[-\s]?level|bi[-\s]?level)\b/i.test(fullText);

  const isClassicMidCenturyCapeOrCottage =
    yr >= 1940 &&
    yr <= 1953 &&
    /\b(cape\s*cod|\bcape\b|gabled\s+shingle|beamed\s+village\s+cottage|dutch[-\s]?dormered|cedar[-\s]?shake\s+cape|shingle\s+cottage)\b/i.test(
      styleText
    );

  const isCustomShingleOrHistoricVernacular =
    /\b(shingle[-\s]?style|dutch\s+gambrel|gambrel|greek\s+revival|queen\s+anne|victorian|sea\s+captain|georgian\s+country\s+estate|historic\s+victorian\s*\/\s*farmhouse|pre[-\s]?war\s+(?:colonial|cottage))\b/i.test(
      styleText
    );

  if (isPreWarPedigree || isClassicMidCenturyCapeOrCottage || isCustomShingleOrHistoricVernacular) {
    return {
      bucket: 'loved',
      reason:
        yr <= 1945
          ? `Authentic c. ${yr} historic Bellport Village proportions & vernacular detailing`
          : isClassicMidCenturyCapeOrCottage
            ? `Classic ${yr} steep-roofed cedar-shingle Cape / Village cottage character`
            : 'Timeless New England Shingle-Style / historic coastal architecture',
    };
  }

  // 4. MIDDLE ("OK — not ugly, not great / not quite Robbie's style"):
  //    1950s–1970s Ranches, newer 2000–2026 Transitional / Modern builds, and modest post-war cottages
  if (/\b(transitional|contemporary|modern\s+pavilion|postmodern)\b/i.test(styleText) || yr >= 2005) {
    return {
      bucket: 'ok',
      reason: `Clean ${yr} transitional/modern exterior — pleasant, though less classic than weathered cedar-shingle or pre-war Village architecture`,
    };
  }

  if (/\b(ranch)\b/i.test(styleText)) {
    return {
      bucket: 'ok',
      reason: `Low-slung ${yr} coastal ranch — pleasant and unpretentious, though horizontal ranch massing rather than classic New England gable/Cape`,
    };
  }

  return {
    bucket: 'ok',
    reason: `Modest ${yr} Bellport residential exterior — clean, though not classic historic or Shingle-Style pedigree`,
  };
}

export function evaluateArchitecturalBeauty(listing: Listing): ArchitecturalBeautyRating {
  const styleText = `${listing.style} ${listing.styleSummary ?? ''} ${listing.headline ?? ''}`.toLowerCase();
  const fullText = `${styleText} ${listing.description} ${listing.features.join(' ')} ${(listing.feats ?? []).join(' ')}`.toLowerCase();
  const addrL = listing.address.toLowerCase();
  const taste = classifyArchitecturalTaste(listing);

  let hash = 0;
  for (let i = 0; i < listing.address.length; i++) {
    hash = (hash * 31 + listing.address.charCodeAt(i)) % 5;
  }
  const jitter = (hash - 2) * 0.08;

  let pts = 6.8;
  const traits: string[] = [];

  if (taste.bucket === 'ugly') {
    if (/\b(high[-\s]?ranch|hi[-\s]?ranch|raised\s+ranch|bi[-\s]?level)\b/i.test(fullText)) {
      pts = 3.6;
      traits.push('1960s/70s High Ranch / bi-level garage-under box');
    } else if (/\b(split[-\s]?level|tri[-\s]?level)\b/i.test(fullText)) {
      pts = 4.7;
      traits.push('post-war suburban Split-Level massing');
    } else {
      pts = 4.2;
      traits.push('post-war suburban builder / Garrison Colonial with garage-forward facade');
    }
    pts += jitter;
    const score10 = Math.max(3.2, Math.min(5.2, Math.round(pts * 10) / 10));
    return {
      score10,
      display: `${score10.toFixed(1)}/10`,
      tierLabel: 'Suburban Tract / Garage-Forward',
      rationale: `Suburban Tract Form (${score10.toFixed(1)}/10) — ${taste.reason}.`,
    };
  }

  if (taste.bucket === 'ok') {
    pts = 6.7;
    if (/\b(transitional)\b/i.test(styleText) || listing.yearBuilt >= 2015) {
      pts = 7.1;
      traits.push('crisp newer transitional construction');
    } else if (/\b(extended\s+coastal\s+ranch|sprawling\s+coastal\s+ranch)\b/i.test(styleText)) {
      pts = 6.9;
      traits.push('pleasant low-slung ranch profile');
    } else if (/\b(hipped[-\s]?roof.*ranch)\b/i.test(styleText)) {
      pts = 6.5;
      traits.push('utilitarian mid-century hipped-roof ranch');
    }
    if (/\b(shingle|cedar)\b/i.test(fullText)) pts += 0.2;
    if (/\b(porch|bluestone|privet|specimen)\b/i.test(fullText)) pts += 0.15;
    if (/\b(needs\s+some\s+tlc|dated|as[-\s]?is)\b/i.test(fullText)) pts -= 0.45;
    pts += jitter;

    const score10 = Math.max(6.0, Math.min(7.6, Math.round(pts * 10) / 10));
    return {
      score10,
      display: `${score10.toFixed(1)}/10`,
      tierLabel: 'Pleasant / Neutral Exterior',
      rationale: `${taste.reason}.`,
    };
  }

  // taste.bucket === 'loved'
  pts = 8.3;
  if (/\b(greek\s+revival|shingle[-\s]?style|dutch\s+gambrel|gambrel|queen\s+anne|victorian|sea\s+captain)\b/i.test(fullText)) {
    pts += 0.85;
    traits.push('iconic historic Shingle / Greek Revival / Gambrel pedigree');
  } else if (/\b(gabled\s+shingle\s+cottage|cedar[-\s]?shake\s+cape|dutch[-\s]?dormered)\b/i.test(styleText)) {
    pts += 0.45;
    traits.push('authentic weathered cedar-shingle gable & sash-window proportions');
  } else {
    traits.push('classic coastal cottage / pre-war Village massing');
  }

  if (listing.yearBuilt > 0 && listing.yearBuilt <= 1905) {
    pts += 0.45;
    traits.push(`19th-century c. ${listing.yearBuilt} craftsmanship`);
  } else if (listing.yearBuilt > 1905 && listing.yearBuilt <= 1939) {
    pts += 0.3;
    traits.push(`pre-war c. ${listing.yearBuilt} detailing`);
  }

  if (/\b(wrap[-\s]?around\s+porch|screened\s+porch|covered\s+porch|portico|picket\s+fence|shutters)\b/i.test(fullText)) {
    pts += 0.25;
    traits.push('welcoming porch, shutters & garden framing');
  }
  if (/\b(carriage\s+(?:house|barn)|guest\s+cottage|pool\s+house|detached\s+barn)\b/i.test(fullText)) {
    pts += 0.2;
    traits.push('detached barn/pool structure');
  }
  if (/\b(bellport\s+ln|browns\s+ln|shore\s+rd|otis|academy|bell\s+st|hulse|livingston)\b/.test(addrL)) {
    pts += 0.15;
  }
  if (/\b(needs\s+some\s+tlc|dated|as[-\s]?is)\b/.test(fullText)) {
    pts -= 0.4;
  }

  pts += jitter;
  const score10 = Math.max(8.1, Math.min(9.7, Math.round(pts * 10) / 10));
  const tierLabel =
    score10 >= 9.0 ? 'Landmark Village Architecture' : 'Distinguished Coastal Character';

  return {
    score10,
    display: `${score10.toFixed(1)}/10`,
    tierLabel,
    rationale: `${tierLabel} — ${traits.slice(0, 3).join(', ')}.`,
  };
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
