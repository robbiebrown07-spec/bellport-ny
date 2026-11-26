import type { Listing } from '../types';
import {
  classifyArchitecturalTaste,
  evaluateArchitecturalBeauty,
} from './ownerAndAirbnb';

export type RobbieFitTier = 'perfect' | 'great' | 'good' | null;

export interface RobbieFitCriterion {
  label: string;
  met: boolean;
  detail: string;
}

export interface RobbieFitEvaluation {
  score: number;
  tier: RobbieFitTier;
  badgeLabel: string;
  summary: string;
  matchedHighlights: string[];
  criteria: RobbieFitCriterion[];
}

export function evaluateRobbieFit(listing: Listing): RobbieFitEvaluation {
  const styleText = `${listing.style} ${listing.styleSummary ?? ''} ${listing.headline ?? ''}`.toLowerCase();
  const fullText = `${styleText} ${listing.description} ${listing.features.join(' ')} ${(listing.feats ?? []).join(' ')}`.toLowerCase();
  const feats = new Set([
    ...(listing.feats ?? []),
    ...listing.features.map((f) => f.toLowerCase()),
  ]);

  // 1. Architectural Taste Calibration (Loved vs. OK vs. Ugly hard disqualifier)
  const archTaste = classifyArchitecturalTaste(listing);
  const beauty = evaluateArchitecturalBeauty(listing);
  const isLovedArchitecture = archTaste.bucket === 'loved';
  const isUglyArchitecture = archTaste.bucket === 'ugly';

  // 2. Beautiful, lush yard
  const hasLushYard =
    feats.has('lawn') ||
    listing.lotAcres >= 0.36 ||
    /\b(lush|privet|landscap|specimen|garden|hedged|rolling\s+lawn|sweeping\s+lawn|park[-\s]?like|sycamore|mature\s+trees)\b/i.test(
      fullText
    );

  // 3. Pool or room for a pool ("close to necessary")
  const hasExistingPool =
    feats.has('pool') ||
    feats.has('current pool') ||
    /\b(gunite\s+pool|in-ground\s+pool|inground\s+pool|heated\s+pool|swimming\s+pool|saltwater\s+pool)\b/i.test(
      fullText
    );
  const hasRoomForPool =
    !hasExistingPool &&
    (feats.has('space_pool') ||
      feats.has('room for a pool') ||
      listing.lotAcres >= 0.31 ||
      /\b(room\s+for\s+(?:a\s+)?pool|space\s+for\s+(?:a\s+)?pool|pool\s+site)\b/i.test(fullText));
  const poolReady = hasExistingPool || hasRoomForPool;

  // 4. Interior plusses: tall ceilings, fireplace, open floor plan, decently sized bedrooms, 2nd story or basement
  const hasTallCeilings =
    /\b(tall\s+ceiling|high\s+ceiling|vaulted|cathedral|beamed\s+ceiling|9['’\s-]*ft|10['’\s-]*ft|double[-\s]?height|airy\s+ceiling)\b/i.test(
      fullText
    ) || (listing.yearBuilt <= 1925 && listing.sqft >= 2200);

  const hasFireplace =
    feats.has('fireplace') || /\b(fireplace|hearth|wood[-\s]?burning)\b/i.test(fullText);

  const hasOpenFlow =
    /\b(open\s+floor|open[-\s]?concept|open\s+layout|great\s+room|sun[-\s]?drenched|french\s+doors|indoor[-\s]?outdoor|chef[’']?s\s+kitchen)\b/i.test(
      fullText
    );

  const sqftPerBed = listing.sqft / Math.max(1, listing.beds);
  const hasGoodBedrooms =
    (listing.beds >= 3 && sqftPerBed >= 540) ||
    /\b(spacious\s+bedrooms?|generous\s+bedrooms?|oversized\s+primary|large\s+bedrooms?|en[-\s]?suite)\b/i.test(
      fullText
    );

  const hasSecondStory =
    feats.has('second_floor') ||
    feats.has('second floor') ||
    /\b(two[-\s]?story|2[-\s]?story|second\s+floor|second\s+story|upstairs|colonial|gambrel|victorian|farmhouse|cape)\b/i.test(
      fullText
    );
  const hasBasement =
    feats.has('basement') || /\b(full\s+basement|finished\s+basement|basement)\b/i.test(fullText);

  // 5. Amazing bonus: ADU, pool house, carriage house, detached studio
  const hasOutdoorStructure =
    feats.has('addl_struct') ||
    feats.has('additional structure') ||
    /\b(adu|pool\s+house|carriage\s+(?:house|barn)|guest\s+(?:house|cottage|quarters|suite)|detached\s+(?:studio|barn|cottage)|separate\s+living|outbuilding)\b/i.test(
      fullText
    );

  // Score calculation (0–100)
  let score = 0;
  if (isLovedArchitecture) {
    score += beauty.score10 >= 9.0 ? 32 : 27;
  } else if (archTaste.bucket === 'ok') {
    score += 9; // Neutral/OK exterior gets minimal architectural points
  } else {
    score -= 35; // Hard architectural penalty for High Ranches, Split-Levels & Suburban Tract Colonials
  }

  if (hasLushYard) score += 16;

  if (hasExistingPool) score += 23;
  else if (hasRoomForPool) score += 20;

  if (hasFireplace) score += 6;
  if (hasGoodBedrooms) score += 6;
  if (hasSecondStory && hasBasement) score += 7;
  else if (hasSecondStory || hasBasement) score += 4;
  if (hasTallCeilings) score += 4;
  if (hasOpenFlow) score += 4;
  if (hasOutdoorStructure) score += 14;
  if (listing.belowSC) score += 4;

  score = Math.max(8, Math.min(100, score));

  const interiorMet =
    [hasFireplace, hasGoodBedrooms, hasSecondStory || hasBasement, hasTallCeilings, hasOpenFlow].filter(
      Boolean
    ).length >= 2;

  const criteria: RobbieFitCriterion[] = [
    {
      label: 'Timeless Shingled Cape / Historic Village Architecture',
      met: isLovedArchitecture,
      detail: isLovedArchitecture
        ? `Matches Robbie’s architectural taste (${beauty.display} · ${archTaste.reason})`
        : isUglyArchitecture
          ? `Disqualified (${beauty.display}): ${archTaste.reason}`
          : `OK / Neutral exterior (${beauty.display}): ${archTaste.reason}`,
    },
    {
      label: 'Pool or Room for a Pool (Essential for Great/Perfect Fit)',
      met: poolReady,
      detail: hasExistingPool
        ? 'Has existing in-ground pool'
        : hasRoomForPool
          ? `Room to add a pool (${listing.lotAcres} ac lot)`
          : `Compact ${listing.lotAcres} ac lot with no current pool`,
    },
    {
      label: 'Beautiful, Lush Yard',
      met: hasLushYard,
      detail: hasLushYard
        ? `Landscaped ${listing.lotAcres}-acre Village grounds`
        : `Smaller ${listing.lotAcres}-acre lot`,
    },
    {
      label: 'ADU, Pool House, or Detached Barn / Studio',
      met: hasOutdoorStructure,
      detail: hasOutdoorStructure
        ? 'Includes detached secondary structure / barn / pool house'
        : 'Main residence only',
    },
    {
      label: 'Interior Plusses (Fireplace, Bedrooms, 2nd Story/Basement, Ceilings, Flow)',
      met: interiorMet,
      detail:
        [
          hasFireplace ? 'Fireplace' : null,
          hasGoodBedrooms
            ? `Generous bedrooms (${listing.beds} bd / ${listing.sqft.toLocaleString()} ft²)`
            : null,
          hasSecondStory ? 'Second story' : null,
          hasBasement ? 'Basement' : null,
          hasTallCeilings ? 'Tall ceilings' : null,
          hasOpenFlow ? 'Open flow' : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Standard interior layout',
    },
  ];

  // STRICT RULE:
  // 1. Never recommend Good Fit, Great Fit, or Perfect Fit if Robbie will find the house unattractive or merely "OK".
  // 2. ONLY award ★ Perfect Fit when EVERY SINGLE criterion in `criteria` is met (`allCriteriaMet === true`)!
  const allCriteriaMet = criteria.every((c) => c.met);
  let tier: RobbieFitTier = null;
  let badgeLabel = '';

  if (isLovedArchitecture && !isUglyArchitecture) {
    if (allCriteriaMet && beauty.score10 >= 8.5) {
      tier = 'perfect';
      badgeLabel = '★ Perfect Fit';
    } else if (poolReady && score >= 62) {
      tier = 'great';
      badgeLabel = 'Great Fit';
    } else if (score >= 42) {
      tier = 'good';
      badgeLabel = 'Good Fit';
    }
  }

  const matchedHighlights = criteria.filter((c) => c.met).map((c) => c.label);

  const summary = isUglyArchitecture
    ? `Not a fit (${score}/100) — disqualified by exterior architecture (${archTaste.reason}).`
    : tier === 'perfect'
      ? `Meets every single criterion on Robbie’s wish list: ${archTaste.reason.toLowerCase()}, lush ${listing.lotAcres}-acre grounds, ${hasExistingPool ? 'an existing pool' : 'ample room for a pool'}, a detached outdoor structure, and strong interior character.`
      : tier === 'great'
        ? `Strong architectural & property match (${beauty.display} beauty) with ${hasExistingPool ? 'an in-ground pool' : 'room for a pool'} and ${hasLushYard ? `a lush ${listing.lotAcres}-acre yard` : `${listing.lotAcres} acres`}.`
        : tier === 'good'
          ? `Architecturally right in Robbie’s wheelhouse (${beauty.display}), though missing one or more compound/pool criteria.`
          : `Not tagged as a Fit (${score}/100) — exterior is ${archTaste.bucket === 'ok' ? `neutral/OK (${beauty.display}) without classic shingled character` : 'outside Robbie’s target profile'}.`;

  return {
    score,
    tier,
    badgeLabel,
    summary,
    matchedHighlights,
    criteria,
  };
}
