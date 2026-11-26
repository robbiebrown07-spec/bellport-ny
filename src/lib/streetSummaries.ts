import type { VillageParcel, VillageStreet } from '../types';

export interface StreetBlockSummary {
  streetName: string;
  blockLabel: string;
  sentence: string;
  homeCount: number;
  lon: number;
  lat: number;
}

const CURATED_STREET_SUMMARIES: Array<{
  pattern: RegExp;
  getSentence: (lat: number, lon: number) => { blockLabel: string; sentence: string };
}> = [
  {
    pattern: /^bellport\s+ln$/i,
    getSentence: (lat) =>
      lat < 40.7546
        ? {
            blockLabel: 'Lower Bellport Lane · Marina Approach',
            sentence:
              'Bellport’s crown-jewel historic block, where 19th-century sea captains’ Colonials and weathered shingle estates sit behind tall privet hedges steps from the Village Marina and Ho-Hum ferry.',
          }
        : {
            blockLabel: 'Upper Bellport Lane · Historic District',
            sentence:
              'A National Register-listed stretch of pre-war clapboard Colonials, Greek Revivals, and sycamore-shaded front porches strolling south from Main Street.',
          },
  },
  {
    pattern: /^browns\s+ln$/i,
    getSentence: (lat) =>
      lat < 40.7568
        ? {
            blockLabel: 'Lower Browns Lane · Bayward Block',
            sentence:
              'An intimate, ancient-oak canopy lane prized for turn-of-the-century Shingle Style cottages, carriage houses, and hushed coastal gardens near Bellport Bay.',
          }
        : {
            blockLabel: 'Upper Browns Lane · Village Core',
            sentence:
              'One of Bellport’s most coveted historic blocks, pairing timeless 1890s–1920s shingled homes and deep hedged lawns with a two-minute walk to Main Street cafés.',
          },
  },
  {
    pattern: /^livingston\s+rd$/i,
    getSentence: (lat) =>
      lat < 40.7538
        ? {
            blockLabel: 'Lower Livingston Road',
            sentence:
              'A peaceful, low-traffic historic block south of Main Street where classic shingled Colonials and sunny garden lots catch afternoon breezes off Great South Bay.',
          }
        : {
            blockLabel: 'Upper Livingston Road',
            sentence:
              'A leafy, unpretentious Village lane lined with well-proportioned pre-war Colonials and vintage cottages tucked quietly west of Academy Lane.',
          },
  },
  {
    pattern: /^hulse\s+st$/i,
    getSentence: () => ({
      blockLabel: 'Hulse Street · Historic Cross-Lane',
      sentence:
        'A charming, pocket-sized cross-lane linking Bellport Lane and Browns Lane, sheltered from through-traffic and framed by classic village cottages and mature hedges.',
    }),
  },
  {
    pattern: /^rogers\s+ave$/i,
    getSentence: () => ({
      blockLabel: 'Rogers Avenue · Marina Pocket',
      sentence:
        'A tranquil southern village block of breezy summer cottages and cedar-shingled homes tucked just blocks from the Marina dock and bay shoreline.',
    }),
  },
  {
    pattern: /^bell\s+st$/i,
    getSentence: () => ({
      blockLabel: 'Bell Street · Historic Village Core',
      sentence:
        'A quintessential walkable Bellport block just below Main Street, blending late-19th-century Colonials, gracious wrap-around porches, and generous village yards.',
    }),
  },
  {
    pattern: /^academy\s+ln$/i,
    getSentence: (lat) =>
      lat < 40.754
        ? {
            blockLabel: 'Lower Academy Lane',
            sentence:
              'A serene, sycamore-lined historic block with deep setbacks, vintage shingle residences, and an easy footpath rhythm down toward the bay.',
          }
        : {
            blockLabel: 'Upper Academy Lane',
            sentence:
              'A stately, tree-shaded lane descending south from Main Street with handsome 1900s–1930s Colonials and quiet neighborhood charm.',
          },
  },
  {
    pattern: /^gerard\s+st$/i,
    getSentence: () => ({
      blockLabel: 'Gerard Street',
      sentence:
        'A quiet, tucked-away residential block between Livingston and Oak Meadow featuring relaxed coastal capes, mature trees, and minimal traffic.',
    }),
  },
  {
    pattern: /^(shore\s+rd|front\s+st)$/i,
    getSentence: () => ({
      blockLabel: 'Shore Road · Bellport Bayfront',
      sentence:
        'A premier waterfront promenade overlooking Bellport Bay and the Marina, lined with grand coastal compounds, bulkheaded lawns, and unobstructed Fire Island views.',
    }),
  },
  {
    pattern: /^(thorn\s*hedge\s+rd|point\s+rd|bayberry\s+rd)$/i,
    getSentence: () => ({
      blockLabel: 'Thornhedge & Point Bluff',
      sentence:
        'An exclusive bayfront enclave at the southern tip of the Village where estate-scale shingled homes enjoy sweeping Great South Bay panoramas and salt air.',
    }),
  },
  {
    pattern: /^(otis\s+ln|otis\s+ave)$/i,
    getSentence: () => ({
      blockLabel: 'Otis Lane · Southern Estate Pocket',
      sentence:
        'A secluded, storybook southern lane near the bayfront bluff known for private hedged compounds, lush lawns, and timeless summer-colony architecture.',
    }),
  },
  {
    pattern: /^(pearl\s+st|day\s+ave|tuttle\s+st|tuthill\s+st)$/i,
    getSentence: () => ({
      blockLabel: 'Pearl & Tuthill Pocket',
      sentence:
        'An intimate cluster of historic harbor-side lanes steps from Shore Road and the Marina, prized for cottage charm and immediate bay access.',
    }),
  },
  {
    pattern: /^(s\.?\s*howells|so\s+howells|howells.*s)/i,
    getSentence: (lat) =>
      lat < 40.7495
        ? {
            blockLabel: 'Lower South Howells Point Road · Golf & Bay',
            sentence:
              'A grand estate corridor approaching Bellport Country Club and the Bay, featuring sweeping half-acre-plus lawns, heated pools, and stately Colonials.',
          }
        : {
            blockLabel: 'Upper South Howells Point Road',
            sentence:
              'A handsome tree-lined avenue running south from Main Street toward the golf course with spacious yards and classic center-hall Colonials.',
          },
  },
  {
    pattern: /^(n\.?\s*howells|howells)/i,
    getSentence: () => ({
      blockLabel: 'North Howells Point Road',
      sentence:
        'A well-kept residential corridor north of Main Street offering generous lot depths, mid-century capes and colonials, and relative value inside the Village.',
    }),
  },
  {
    pattern: /^(country\s+club\s+rd|golf\s+course\s+rd)$/i,
    getSentence: () => ({
      blockLabel: 'Country Club Road · Fairway Corridor',
      sentence:
        'A picturesque greenway bordering Bellport Golf Club where breezy colonials and pool homes look out across manicured fairways toward the bay.',
    }),
  },
  {
    pattern: /^brewster\s+ln$/i,
    getSentence: () => ({
      blockLabel: 'Brewster Lane · South of Main St',
      sentence:
        'A coveted southern lane shaded by towering oaks, featuring gracious shingled estates, deep pool-ready lawns, and a peaceful stroll to the Village center.',
    }),
  },
  {
    pattern: /^(n\s+brewster|brewster\s+ln\s+n)/i,
    getSentence: () => ({
      blockLabel: 'North Brewster Lane',
      sentence:
        'A calm, tree-lined Village block north of Main Street with classic mid-century ranches, colonials, and spacious wooded backyards.',
    }),
  },
  {
    pattern: /^(main\s+st|s\s+country\s+rd|south\s+country)/i,
    getSentence: (_lat, lon) =>
      lon > -72.943 && lon < -72.935
        ? {
            blockLabel: 'Main Street · Bellport Village Promenade',
            sentence:
              'The historic heart of Bellport Village, where brick sidewalks, independent shops, and landmark clapboard homes sit beneath a classic small-town canopy.',
          }
        : {
            blockLabel: 'South Country Road · Estate Corridor',
            sentence:
              'A gracious tree-lined stretch of historic Old Purchase Country Road framed by deep estate setbacks, split-rail fences, and pre-war residences.',
          },
  },
  {
    pattern: /^(oak\s+meadow|peathole|cedar\s+bluff|titus|baycrest|leisurely)/i,
    getSentence: () => ({
      blockLabel: 'Oak Meadow & Peat Hole Enclave',
      sentence:
        'A secluded pocket of quiet cul-de-sacs south of Main Street offering wooded privacy, generous lot sizes, and proximity to coastal marshlands.',
    }),
  },
  {
    pattern: /^circuit\s+rd$/i,
    getSentence: () => ({
      blockLabel: 'Circuit Road · East Village Loop',
      sentence:
        'A curving, family-friendly eastern Village street known for sunny 0.3–0.6 acre lots, mid-century colonials and ranches, and room for pools.',
    }),
  },
  {
    pattern: /^bieselin\s+rd$/i,
    getSentence: () => ({
      blockLabel: 'Bieselin Road · West Village',
      sentence:
        'A quiet western Village road near the Country Club enclave featuring wide lots, renovated ranches and colonials, and quick access to golf and Main Street.',
    }),
  },
  {
    pattern: /^(station\s+rd|station\s+ct)$/i,
    getSentence: () => ({
      blockLabel: 'Station Road · Village Gateway',
      sentence:
        'Bellport’s central north-south corridor linking Main Street shops with Village residential blocks and convenient LIRR train access.',
    }),
  },
  {
    pattern: /^(1st|2nd|3rd|4th|2\s+st|3\s+st|4\s+st|second|third|fourth|new\s+jersey)/i,
    getSentence: () => ({
      blockLabel: 'Numbered Streets & New Jersey Ave',
      sentence:
        'A welcoming grid of walkable Village blocks just north of Main Street with early-20th-century foursquares, capes, and deep backyard gardens.',
    }),
  },
  {
    pattern: /^(maplewood|brookside|broadview|mott|wigtel|mooring)/i,
    getSentence: () => ({
      blockLabel: 'Northeast Village Lanes',
      sentence:
        'Leafy, quiet residential blocks in the northeastern Village offering spacious mid-century homes, mature landscaping, and serene cul-de-sac living.',
    }),
  },
  {
    pattern: /^(gen.*mclean|kreamer|george\s+ct)/i,
    getSentence: () => ({
      blockLabel: 'General McLean & Kreamer Corridor',
      sentence:
        'Tucked-away mid-Village residential streets north of Main Street with comfortable family colonials, ranches, and generous side yards.',
    }),
  },
];

export function describeStreetBlock(
  rawStreetName: string,
  lon: number,
  lat: number,
  parcels: VillageParcel[]
): StreetBlockSummary {
  const clean = rawStreetName.replace('Main St (S Country Rd)', 'Main St').trim();

  // Count nearby residential homes on this street or within ~110m of clicked block
  const normKey = clean
    .toLowerCase()
    .replace(/\b(road|rd|lane|ln|street|st|avenue|ave|drive|dr|court|ct|place|pl)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

  const onStreet = parcels.filter((p) => {
    if (!p.res) return false;
    const pKey = p.addr
      .toLowerCase()
      .replace(/^\d+\s*/, '')
      .replace(/\b(road|rd|lane|ln|street|st|avenue|ave|drive|dr|court|ct|place|pl)\b/g, '')
      .replace(/[^a-z0-9]/g, '');
    return normKey.length >= 3 && (pKey.includes(normKey) || normKey.includes(pKey));
  });

  for (const entry of CURATED_STREET_SUMMARIES) {
    if (entry.pattern.test(clean) || entry.pattern.test(rawStreetName)) {
      const { blockLabel, sentence } = entry.getSentence(lat, lon);
      return {
        streetName: clean,
        blockLabel,
        sentence,
        homeCount: onStreet.length,
        lon,
        lat,
      };
    }
  }

  // Fallback synthesized 1-sentence block summary grounded in nearby Village parcels
  const nearby =
    onStreet.length > 0
      ? onStreet
      : parcels.filter(
          (p) => p.res && Math.hypot(p.lat - lat, (p.lon - lon) * 0.76) < 0.0018
        );

  const count = nearby.length;
  const years = nearby.map((p) => p.yr ?? 1955).sort((a, b) => a - b);
  const medYr = years[Math.floor(years.length / 2)] ?? 1958;
  const avgAc =
    count > 0
      ? (nearby.reduce((acc, p) => acc + (p.acres || 0.3), 0) / count).toFixed(2)
      : '0.32';
  const below = lat < 40.7575;

  const eraPhrase =
    medYr < 1935
      ? `historic pre-war homes (median c. ${medYr})`
      : medYr < 1975
        ? `classic mid-century capes and colonials (median c. ${medYr})`
        : `spacious contemporary and traditional residences (median c. ${medYr})`;

  return {
    streetName: clean,
    blockLabel: `${clean} · ${below ? 'South of Main St' : 'Village Residential Block'}`,
    sentence: `A quiet ${below ? 'south-of-Main' : 'Bellport Village'} residential block characterized by ${eraPhrase} set on ~${avgAc}-acre tree-lined lots.`,
    homeCount: onStreet.length || count,
    lon,
    lat,
  };
}

export function findNearestStreetAtPoint(
  lon: number,
  lat: number,
  streets: VillageStreet[],
  maxDegDist = 0.00028
): { street: VillageStreet; lon: number; lat: number } | null {
  let best: { street: VillageStreet; lon: number; lat: number; dist: number } | null = null;
  for (const st of streets) {
    for (const seg of st.segments) {
      for (let i = 0; i < seg.length - 1; i++) {
        const [x1, y1] = seg[i];
        const [x2, y2] = seg[i + 1];
        const dx = (x2 - x1) * 0.76;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy || 1e-12;
        const px = (lon - x1) * 0.76;
        const py = lat - y1;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
        const projLon = x1 + (x2 - x1) * t;
        const projLat = y1 + (y2 - y1) * t;
        const d = Math.hypot((lon - projLon) * 0.76, lat - projLat);
        if (d <= maxDegDist && (!best || d < best.dist)) {
          best = { street: st, lon: projLon, lat: projLat, dist: d };
        }
      }
    }
  }
  return best ? { street: best.street, lon: best.lon, lat: best.lat } : null;
}
