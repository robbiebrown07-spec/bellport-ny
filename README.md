# Bellport Watch

Personal second-home listing tracker, multi-category filter explorer, and keyword search built for **Bellport Village, NY (11713)** following Robbie's **Personal Apps — Master Build Blueprint & Engineering DNA**.

## v1 Features
- **Multi-Category Filtering**: Filter across price brackets, bedrooms, bathrooms, interior square footage, lot acreage, Bellport micro-areas (*Historic Lanes*, *Country Club & Golf*, *Village Center*, *East Lanes & Circuit*, *Outside Village*), **Incorporated Village boundary** (Ho-Hum Beach ferry & Marina eligibility), and **FEMA Flood Zone X**.
- **Instant Keyword Search (`/`)**: Synonym-aware full-text search with quoted phrase support (e.g., `"Bellport Lane"`, `pool`, `guest cottage`, `screened porch`, `off-market`) and inline yellow highlight sweeps.
- **Zero-Scrape Data Capture (`+ Add`)**:
  - **Smart Paste**: Copy/paste raw text from any Zillow, Redfin, Compass, or Old Purchase Properties listing (or email alert) to auto-extract structured fields, Village boundary status, and searchable keywords.
  - **Import CSV**: Upload Redfin `"Download All"` CSV exports or Bellport Watch CSV backups.
  - **Manual Form**: Log pocket/whisper listings in seconds.
- **Owner Self-Service & Privacy**:
  - Local-first `IndexedDB` + `localStorage` persistence (`schemaVersion: 1`)
  - 1-click **JSON** and **CSV** export/import in Settings
  - 1-click **Privacy Blur (`$`)** in the bottom-right dock
  - Inline copy editing (`Edit` toggle in the TopBar)

## Setup & Commands

```bash
npm install
cp .env.example .env.local
npm run dev
npm run typecheck
npm run build
```
