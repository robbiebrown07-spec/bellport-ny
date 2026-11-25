# Bellport Watch — Project Guidelines & Schema Invariants (`AGENTS.md`)

This project follows Robbie's **Personal Apps — Master Build Blueprint & Engineering DNA** (`personal-app-blueprint`).

## Core Invariants
1. **Stable Identifiers & Schema Versioning**:
   - Never rename existing `Listing.id` slugs once persisted user notes, status dots, or inline edits are keyed to them.
   - Always stamp persisted storage payloads with `schemaVersion: 1` (see `src/types.ts` and `src/lib/storage.ts`).
2. **Design System & Restraint**:
   - All color, typography, spacing, and motion tokens live in `src/styles/tokens.scss` (`:root`, `[data-theme="dark"]`, and `@media (prefers-reduced-motion: reduce)`).
   - Keep headlines `<= 10 words` and left-aligned. Pair D3 charts with a 1-sentence editorial lede and a visually-hidden accessible `<table>`.
   - Keep D3 (`d3-scale`, `d3-array`) strictly for math/scales and React for 100% of SVG/DOM rendering.
3. **Privacy & Data Ownership**:
   - Never commit `.env` files, personal financial figures, or private broker notes to Git.
   - Preserve `<meta name="robots" content="noindex, nofollow, noarchive" />` in `index.html`.
   - Maintain 1-click JSON & CSV export/import in the Settings & Data drawer, plus 1-click Privacy Blur (`$`) in the bottom-right `CornerDock`.
4. **Bellport Village Domain Nuance**:
   - Distinguish **Incorporated Village of Bellport** (`inVillage: true` — resident access to the *Whalehouse Point* ferry to Ho-Hum Beach, Bellport Marina, Mother's Beach, and Bellport Country Club resident rates) from **Greater Bellport / Unincorporated Brookhaven (`11713`)** (`inVillage: false`).
