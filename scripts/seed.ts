/**
 * Offline helper script for validating or regenerating public/data/seed-listings.json.
 * Usage: npx tsx scripts/seed.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Listing } from '../src/types';

const seedPath = path.resolve(process.cwd(), 'public/data/seed-listings.json');
const raw = fs.readFileSync(seedPath, 'utf-8');
const listings = JSON.parse(raw) as Listing[];

const seenIds = new Set<string>();
for (const item of listings) {
  if (seenIds.has(item.id)) {
    throw new Error(`Duplicate Listing.id found: ${item.id}`);
  }
  seenIds.add(item.id);
}

console.log(
  `Verified ${listings.length} Bellport Village seed listings (${listings.filter((l) => l.inVillage).length} inside Incorporated Village).`
);
