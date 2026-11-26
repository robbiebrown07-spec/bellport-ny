import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import type { Listing, PersistedAppState } from '../src/types.ts';
import {
  getSyncMetadata,
  loadServerState,
  mergeSyncedListings,
  readGeminiApiKey,
  readRealtyApiKey,
  saveEnvLocalVar,
  saveRealtyApiKeyToEnvLocal,
  saveServerState,
  updateSyncMetadata,
} from './store.ts';
import {
  clipListingFromUrl,
  fetchOffMarketParcelDossier,
  syncBellportFromRealtyApi,
} from './realtyapi.ts';

const APP_VERSION = '0.2.0';
let geminiCooldownUntil = 0;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

async function generateGeminiTasteMemo(favorites: Listing[], apiKey: string): Promise<string> {
  if (Date.now() < geminiCooldownUntil) {
    throw new Error('Gemini cooldown active');
  }
  const ai = new GoogleGenAI({ apiKey });
  const digest = favorites
    .map(
      (f) =>
        `- ${f.address} (${f.area}, built ${f.yearBuilt}, ${f.style}, $${f.price.toLocaleString()}, ${f.sqft} sqft, ${f.lotAcres} ac): ${f.description}`
    )
    .join('\n');

  const prompt = `You are an architectural historian and Bellport Village, NY real estate advisor.
Based on these saved favorite second-home listings in Bellport Village:
${digest}

Write a concise, perceptive 2-paragraph description (under 140 words total) of the buyer's architectural taste—highlighting specific materials, rooflines, eras, indoor-outdoor porches/pools, and Bellport lane sensibilities—followed by one crisp 2-sentence "Broker Note" they can send to a local Bellport agent.`;

  try {
    const resp = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return (resp.text ?? '').trim();
  } catch (err) {
    geminiCooldownUntil = Date.now() + 90_000;
    throw err;
  }
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url ?? '';
  if (!url.startsWith('/api/')) return false;

  const pathname = url.split('?')[0];

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, { ok: true, version: APP_VERSION });
      return true;
    }

    if (req.method === 'GET' && pathname === '/api/bootstrap') {
      const state = loadServerState();
      const syncMeta = getSyncMetadata();
      sendJson(res, 200, { state, syncMeta });
      return true;
    }

    if (req.method === 'PUT' && pathname === '/api/state') {
      const incoming = await readJsonBody<PersistedAppState>(req);
      if (!incoming || !Array.isArray(incoming.listings)) {
        sendJson(res, 400, { error: 'Invalid state payload.' });
        return true;
      }
      const saved = saveServerState(incoming);
      sendJson(res, 200, { state: saved });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/config/key') {
      const body = await readJsonBody<{ apiKey?: string; geminiKey?: string }>(req);
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
        saveRealtyApiKeyToEnvLocal(body.apiKey.trim());
      }
      if (typeof body.geminiKey === 'string' && body.geminiKey.trim()) {
        saveEnvLocalVar('GEMINI_API_KEY', body.geminiKey.trim());
      }
      sendJson(res, 200, { syncMeta: getSyncMetadata() });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/sync') {
      const apiKey = readRealtyApiKey();
      if (!apiKey) {
        sendJson(res, 400, {
          error:
            'No REALTYAPI_KEY configured yet. Paste your free key from realtyapi.io in the Sync modal (or add REALTYAPI_KEY to .env.local).',
        });
        return true;
      }

      const body = await readJsonBody<{ maxNewDetails?: number }>(req);
      const run = await syncBellportFromRealtyApi(apiKey, body.maxNewDetails ?? 22);

      const currentState = loadServerState();
      const { merged, addedCount, updatedCount } = mergeSyncedListings(
        currentState.listings,
        run.listings
      );

      const nextState = saveServerState({
        ...currentState,
        listings: merged,
      });

      const summary = `Synced ${run.listings.length} Bellport area listings (${addedCount} new, ${updatedCount} updated · ${run.newDetailsFetched} detail fetches, ${run.usedCacheCount} from local cache).`;

      const syncMeta = updateSyncMetadata({
        lastSyncAt: new Date().toISOString(),
        creditsRemaining: run.creditsRemaining,
        creditsLimit: run.creditsLimit,
        lastSyncSummary: summary,
      });

      sendJson(res, 200, {
        state: nextState,
        syncMeta,
        summary,
      });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/clip-url') {
      const body = await readJsonBody<{ url?: string }>(req);
      if (!body.url) {
        sendJson(res, 400, { error: 'Missing url parameter.' });
        return true;
      }
      const apiKey = readRealtyApiKey();
      const draft = await clipListingFromUrl(body.url, apiKey);
      sendJson(res, 200, { draft });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/taste-profile') {
      const geminiKey = readGeminiApiKey();
      const state = loadServerState();
      const favorites = state.listings.filter((l) => l.isFavorite);
      if (favorites.length === 0) {
        sendJson(res, 400, { error: 'Save at least one favorite listing first.' });
        return true;
      }
      if (!geminiKey) {
        sendJson(res, 200, {
          usedFallback: true,
          message: 'GEMINI_API_KEY not set — using built-in architectural taste synthesizer.',
        });
        return true;
      }

      try {
        const text = await generateGeminiTasteMemo(favorites, geminiKey);
        const memo = {
          text,
          basedOnIds: favorites.map((f) => f.id),
          source: 'gemini' as const,
          updatedAt: new Date().toISOString(),
        };
        const nextState = saveServerState({ ...state, aiTasteMemo: memo });
        sendJson(res, 200, { state: nextState, memo, usedFallback: false });
      } catch {
        sendJson(res, 200, {
          usedFallback: true,
          message: 'Gemini temporarily unavailable — showing deterministic architectural analysis.',
        });
      }
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/parcel-dossier') {
      const body = await readJsonBody<{ address?: string }>(req);
      if (!body.address || !body.address.trim()) {
        sendJson(res, 400, { error: 'Missing parcel street address.' });
        return true;
      }
      const apiKey = readRealtyApiKey();
      const dossier = await fetchOffMarketParcelDossier(body.address.trim(), apiKey);
      sendJson(res, 200, { dossier, syncMeta: getSyncMetadata() });
      return true;
    }

    if (req.method === 'POST' && pathname === '/api/alerts/draft-email') {
      const body = await readJsonBody<{ to?: string; subject?: string; body?: string }>(req);
      const to = (body.to ?? 'robbiebrown07@gmail.com').trim();
      const subject = (body.subject ?? 'Bellport, NY Listing Alert').trim();
      const text = (body.body ?? '').trim();
      if (!to || !text) {
        sendJson(res, 400, { error: 'Missing recipient or alert body.' });
        return true;
      }
      try {
        const { execFileSync } = await import('node:child_process');
        execFileSync(
          'gmail',
          ['mutate', 'create-draft', '--to', to, '--subject', subject, '--body', text],
          { timeout: 12_000, stdio: 'pipe' }
        );
        sendJson(res, 200, {
          ok: true,
          message: `Created Gmail alert draft addressed to ${to}`,
        });
      } catch {
        sendJson(res, 200, { ok: false });
      }
      return true;
    }

    sendJson(res, 404, { error: `Unknown API route: ${pathname}` });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    sendJson(res, 500, { error: message });
    return true;
  }
}
