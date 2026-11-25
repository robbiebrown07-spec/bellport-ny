import fs from 'node:fs';
import path from 'node:path';
import type { BellportMicroArea } from '../src/types.ts';

interface GeoJsonFeatureCollection {
  features?: Array<{
    geometry?: {
      type?: string;
      coordinates?: number[][][][];
    };
  }>;
}

// Envelope polygon covering Incorporated Bellport Village + immediate 0.25-mi border lanes
// Format required by RealtyAPI /search/bypolygon: "lon lat,lon lat,..."
export const BELLPORT_SEARCH_POLYGON = [
  '-72.9615 40.7685',
  '-72.9225 40.7685',
  '-72.9225 40.7385',
  '-72.9615 40.7385',
  '-72.9615 40.7685',
].join(',');

// Bellport Village Marina dock at the foot of Bellport Lane
const MARINA_LAT = 40.7429;
const MARINA_LON = -72.9377;

let cachedRings: number[][][] | null = null;

function getVillageRings(): number[][][] {
  if (cachedRings) return cachedRings;
  try {
    const filePath = path.resolve(process.cwd(), 'public/data/bellport-boundary.json');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeoJsonFeatureCollection;
    const multi = raw.features?.[0]?.geometry?.coordinates ?? [];
    cachedRings = multi.map((poly) => poly[0]).filter(Boolean);
    return cachedRings;
  } catch {
    cachedRings = [];
    return cachedRings;
  }
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Exact point-in-polygon check against the official US Census TIGERweb
 * Incorporated Village of Bellport boundary (GEOID 3605771).
 */
export function isInsideIncorporatedBellport(lat?: number, lon?: number): boolean | null {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const rings = getVillageRings();
  if (rings.length === 0) return null;
  return rings.some((ring) => pointInRing(lon, lat, ring));
}

export function estimateWalkMinutesToMarina(lat?: number, lon?: number): number | undefined {
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  const dLatMiles = (lat - MARINA_LAT) * 69.0;
  const dLonMiles = (lon - MARINA_LON) * 52.3;
  const straightMiles = Math.hypot(dLatMiles, dLonMiles);
  const laneMiles = straightMiles * 1.28; // Village street grid factor
  const minutes = Math.max(2, Math.round((laneMiles / 3.0) * 60));
  return minutes <= 35 ? minutes : undefined;
}

export function classifyBellportLocation(
  address: string,
  lat?: number,
  lon?: number
): {
  area: BellportMicroArea;
  inVillage: boolean;
  walkToMarinaMin?: number;
} {
  const lower = address.toLowerCase();
  const geoInVillage = isInsideIncorporatedBellport(lat, lon);

  // Street-level micro-area classification
  let area: BellportMicroArea = 'Village Center';
  let streetImpliesVillage = true;

  if (
    /bellport\s+(?:ln|lane)|browns\s+(?:ln|lane)|academy\s+(?:ln|lane)|otis\s+(?:ln|lane)|thorn\s*hedge|shore\s+(?:rd|road)|rectory|library\s+ln/.test(
      lower
    )
  ) {
    area = 'Historic Lanes';
  } else if (
    /country\s+club|howells\s+(?:pt|point)|mooring|fairway|golf/.test(lower)
  ) {
    area = 'Country Club & Golf';
  } else if (
    /circuit|peat\s+hole|bieselin|woodland\s+park|brookside|maple|osborn|new\s+jersey|michigan/.test(
      lower
    )
  ) {
    area = 'East Lanes & Circuit';
  } else if (
    /east\s+patchogue|brookhaven|montauk\s+hwy|sunrise|horseblock|medford|yaphank|beaver\s+dam/.test(
      lower
    )
  ) {
    area = 'Outside Village (11713)';
    streetImpliesVillage = false;
  }

  const inVillage = geoInVillage !== null ? geoInVillage : streetImpliesVillage;
  if (!inVillage) {
    area = 'Outside Village (11713)';
  } else if (
    inVillage &&
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    area === 'Village Center'
  ) {
    // Refine using coordinates within the Village when street name isn't one of the classic lanes
    if (lat < 40.7545 && lon > -72.9425 && lon < -72.931) {
      area = 'Historic Lanes';
    } else if (lon <= -72.9425) {
      area = 'Country Club & Golf';
    } else if (lon >= -72.9335) {
      area = 'East Lanes & Circuit';
    }
  }

  return {
    area,
    inVillage,
    walkToMarinaMin: inVillage ? estimateWalkMinutesToMarina(lat, lon) : undefined,
  };
}
