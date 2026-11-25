# Bellport Watch

Personal second-home tracker, polygon MLS sync, longitudinal price monitor, street alert engine, architectural taste profiler, and Deal / Airbnb evaluator for **Bellport Village, NY (11713)**—built following Robbie's **Personal Apps — Master Build Blueprint & Engineering DNA**.

## Key Capabilities
- **Automated Polygon Sync (`Sync` modal / `/api/sync`)**:
  - Queries `RealtyAPI.io`'s Realtor polygon endpoint around Bellport Village, deep-fetches **full photo galleries (`photos[]`)** and **verbatim written descriptions** once per new property ID, caches them locally in `.data/` so unchanged properties cost zero repeat credits, and verifies **Incorporated Village residency** via the official US Census TIGERweb boundary (`GEOID 3605771`).
- **Boutique & Off-Market Clipper (`+ Add`)**:
  - Fetch boutique local broker URLs (e.g., `oldpurchase.com`), drag the **1-Click Browser Bookmarklet** (`+ Clip to Bellport Watch`), Smart-Paste raw text, or upload a Redfin CSV.
- **Price Tracking Over Time (`Prices` view & Property Drawer)**:
  - Automatically logs historical and newly observed price reductions (`priceHistory`) on every sync, visualized with D3 step/line trajectories.
- **Favorites & Architectural Taste Profile (`Favorites` view)**:
  - Save favorite homes (`♥`) to synthesize your architectural vernacular (materials, eras, rooflines, outdoor features), generate a ready-to-send **Bellport Broker Brief**, surface taste-matched unsaved homes, and optionally refine via server-side Gemini (`@google/genai` with 3-tier fallback).
- **Hyper-Local Street Alerts (`Alerts` view)**:
  - Watch specific Bellport lanes (*Bellport Lane*, *Browns Lane*, *Otis Lane*, *South Howells Point*, *Circuit Road*, etc.) with price ceilings, bedroom minimums, required keywords, and price-cut flags.
- **Good Deal & Airbnb / Summer Rental Ratings**:
  - Compares each home's `$/sq ft`, lot size, pool/guest-cottage value, and price-cut leverage against micro-area benchmarks, and scores **Airbnb & Summer Rental viability** grounded in **Incorporated Village of Bellport Rental License** rules vs. **Town of Brookhaven's 28–30 night minimum law**.

## Commands

```bash
npm install
cp .env.example .env.local
npm run dev        # Vite HMR + /api/* server middleware on port 5173
npm run typecheck  # Strict TypeScript check across src/ and server/
npm run lint       # oxlint check
npm run build      # Production bundle
npm start          # Standalone Node 22 production server
```
