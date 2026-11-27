import { GoogleGenAI, Type } from '@google/genai';
import { detectQuestionQuery, normalizeBellportStreetText, parseNaturalLanguageQuery } from './nlSearch';

export interface GeminiSearchPlan {
  query: string;
  statusIntent: 'for_sale' | 'past_sales' | 'all_homes' | null;
  soldExactYears: number[];
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
  northOfSC: boolean;
  excludeFloodZone: boolean;
  excludePool: boolean;
  excludeOverpriced: boolean;
  excludeUglyArch: boolean;
  poolMode: 'pool_only' | 'pool_or_room' | 'room_only' | null;
  feats: string[];
  streetMentions: string[];
  robbieFit: 'perfect' | 'great_plus' | 'good_plus' | null;
  valuation: 'underpriced' | 'overpriced' | null;
  recommendedParcelIds: string[];
  aiChips: string[];
  aiNote: string;
}

const planCache = new Map<string, GeminiSearchPlan>();

export function shouldRunGeminiSearchPlanner(rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q || q.length < 6) return false;
  // Pure open-world advisory questions are already handled by VillageQaCard + Google Search
  const parsed = parseNaturalLanguageQuery(q);
  if (parsed.isAdvisoryOnly) return false;
  if (detectQuestionQuery(q)) return false;
  // Skip trivial single-number or exact house address lookups like "<$3000000" or "37 Bellport Ln"
  if (/^[<>≤≥$0-9.,mk\s-]+$/i.test(q)) return false;
  if (/^\d+\s+[a-z][a-z\s.]+$/i.test(q) && q.split(/\s+/).length <= 4) return false;
  return q.split(/\s+/).length >= 2;
}

export async function planGeminiPropertySearch(params: {
  query: string;
  geminiApiKey: string;
  activeListingsDigest: string;
}): Promise<GeminiSearchPlan | null> {
  const q = params.query.trim();
  const key = params.geminiApiKey.trim();
  if (!q || !key) return null;

  const cacheKey = `${key.slice(-6)}::${q.toLowerCase()}`;
  const cached = planCache.get(cacheKey);
  if (cached) return cached;

  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
  ];

  const ai = new GoogleGenAI({ apiKey: key });
  let rawJson = '';
  for (const modelId of models) {
    try {
      const resp = await ai.models.generateContent({
        model: modelId,
        contents: `Translate this Bellport Village, NY natural-language home search into exact structured filter criteria.
Active Village listings reference (for optional recommendedParcelIds if specific active homes are an especially strong semantic match):
${params.activeListingsDigest}

User search query: "${q}"`,
        config: {
          systemInstruction: `You are the semantic search interpreter for Bellport Watch (all 1,058 residential homes in Incorporated Bellport Village, NY).
Convert nuanced natural-language property searches into accurate structured filters:
- Only populate constraints implied by the user's query (leave unspecified numbers as 0 and unspecified strings as "").
- Valid feats values ONLY: "pool", "space_pool", "lawn", "waterfront", "shingles", "arch", "second_floor", "basement", "fireplace", "addl_struct".
- "belowSC" = true when user wants south of South Country Rd / Main St / historic lanes / near bay. "northOfSC" = true when user asks for north of South Country Rd / Main St.
- "excludeFloodZone" = true if user says low flood risk, not in flood zone, avoid flood insurance.
- "excludeUglyArch" = true if user says charming, classic, timeless, not a ranch/split-level/tract box.
- Keep aiChips to 2–4 short human-readable tags summarizing your semantic interpretation, and aiNote to 1 concise sentence (≤22 words).`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              statusIntent: {
                type: Type.STRING,
                description: '"" | "for_sale" | "past_sales" | "all_homes"',
              },
              soldExactYears: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              minPrice: { type: Type.NUMBER },
              maxPrice: { type: Type.NUMBER },
              minBeds: { type: Type.NUMBER },
              maxBeds: { type: Type.NUMBER },
              minBaths: { type: Type.NUMBER },
              minSqft: { type: Type.NUMBER },
              minLot: { type: Type.NUMBER },
              maxWalkMin: { type: Type.NUMBER },
              maxWalkStoresMin: { type: Type.NUMBER },
              belowSC: { type: Type.BOOLEAN },
              northOfSC: { type: Type.BOOLEAN },
              excludeFloodZone: { type: Type.BOOLEAN },
              excludePool: { type: Type.BOOLEAN },
              excludeOverpriced: { type: Type.BOOLEAN },
              excludeUglyArch: { type: Type.BOOLEAN },
              poolMode: {
                type: Type.STRING,
                description: '"" | "pool_only" | "pool_or_room" | "room_only"',
              },
              feats: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              streetMentions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              robbieFit: {
                type: Type.STRING,
                description: '"" | "perfect" | "great_plus" | "good_plus"',
              },
              valuation: {
                type: Type.STRING,
                description: '"" | "underpriced" | "overpriced"',
              },
              recommendedParcelIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiChips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              aiNote: { type: Type.STRING },
            },
            required: ['aiChips', 'aiNote'],
          },
        },
      });
      rawJson = (resp.text ?? '').trim();
      if (rawJson) break;
    } catch {
      // Try next active Flash model
    }
  }

  try {
    if (!rawJson) return null;
    const d = JSON.parse(rawJson) as Record<string, unknown>;

    const validFeats = new Set([
      'pool',
      'space_pool',
      'lawn',
      'waterfront',
      'shingles',
      'arch',
      'second_floor',
      'basement',
      'fireplace',
      'addl_struct',
    ]);

    const numOrNull = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

    const statusRaw = typeof d.statusIntent === 'string' ? d.statusIntent : '';
    const poolRaw = typeof d.poolMode === 'string' ? d.poolMode : '';
    const fitRaw = typeof d.robbieFit === 'string' ? d.robbieFit : '';
    const valRaw = typeof d.valuation === 'string' ? d.valuation : '';

    const plan: GeminiSearchPlan = {
      query: q,
      statusIntent:
        statusRaw === 'for_sale' || statusRaw === 'past_sales' || statusRaw === 'all_homes'
          ? statusRaw
          : null,
      soldExactYears: Array.isArray(d.soldExactYears)
        ? d.soldExactYears.filter((y): y is number => typeof y === 'number' && y >= 2020 && y <= 2026)
        : [],
      minPrice: numOrNull(d.minPrice),
      maxPrice: numOrNull(d.maxPrice),
      minBeds: numOrNull(d.minBeds),
      maxBeds: numOrNull(d.maxBeds),
      minBaths: numOrNull(d.minBaths),
      minSqft: numOrNull(d.minSqft),
      minLot: numOrNull(d.minLot),
      maxWalkMin: numOrNull(d.maxWalkMin),
      maxWalkStoresMin: numOrNull(d.maxWalkStoresMin),
      belowSC: Boolean(d.belowSC),
      northOfSC: Boolean(d.northOfSC),
      excludeFloodZone: Boolean(d.excludeFloodZone),
      excludePool: Boolean(d.excludePool),
      excludeOverpriced: Boolean(d.excludeOverpriced),
      excludeUglyArch: Boolean(d.excludeUglyArch),
      poolMode:
        poolRaw === 'pool_only' || poolRaw === 'pool_or_room' || poolRaw === 'room_only'
          ? poolRaw
          : null,
      feats: Array.isArray(d.feats)
        ? d.feats.filter((f): f is string => typeof f === 'string' && validFeats.has(f))
        : [],
      streetMentions: Array.isArray(d.streetMentions)
        ? d.streetMentions
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => normalizeBellportStreetText(s))
        : [],
      robbieFit:
        fitRaw === 'perfect' || fitRaw === 'great_plus' || fitRaw === 'good_plus' ? fitRaw : null,
      valuation: valRaw === 'underpriced' || valRaw === 'overpriced' ? valRaw : null,
      recommendedParcelIds: Array.isArray(d.recommendedParcelIds)
        ? d.recommendedParcelIds.filter((id): id is string => typeof id === 'string')
        : [],
      aiChips: Array.isArray(d.aiChips)
        ? d.aiChips.filter((c): c is string => typeof c === 'string').slice(0, 4)
        : [],
      aiNote: typeof d.aiNote === 'string' ? d.aiNote.trim() : '',
    };

    planCache.set(cacheKey, plan);
    return plan;
  } catch {
    return null;
  }
}
