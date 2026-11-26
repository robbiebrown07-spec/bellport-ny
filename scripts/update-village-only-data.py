#!/usr/bin/env python3
"""Filter and enrich listings & closed sales strictly to Incorporated Bellport Village (SWIS 472203),
adding bespoke architectural style descriptions grounded in each home's exterior & MLS record."""
import json
from pathlib import Path

ROOT = Path('/home/antigravity/bellport-watch')
STORE_PATH = ROOT / '.data' / 'store.json'
SEED_PATH = ROOT / 'public' / 'data' / 'seed-listings.json'
PARCELS_PATH = ROOT / 'public' / 'data' / 'bellport-parcels.json'
SALES_PATH = ROOT / 'public' / 'data' / 'bellport-sales-history.json'

ARCH_BY_ID = {
    'bp-37-bellport-ln-84861': (
        '1832 Greek Revival Farmhouse',
        '1832 white-clapboard Greek Revival farmhouse with shuttered shed dormers, exposed-beam double-height great room, and screened porch behind a picket fence.',
    ),
    'bp-68-s-howells-point-rd-14219': (
        '2002 Shingle-Style Waterfront',
        'Three-story coastal Shingle-Style estate with twin brick end chimneys, arched French doors, carriage guest suite, and private Howells Creek dock.',
    ),
    'bp-19-third-st-17974': (
        '1949 Cedar-Shake Cape Cod',
        'Classic weathered cedar-shake Cape Cod with crisp white trim, pedimented entry portico, brick walk, and rear pool deck.',
    ),
    'bp-25-country-club-rd-72762': (
        '2023 Transitional Colonial',
        '2023 white-stucco and black-casement transitional Colonial with hipped roof, tall red-brick chimney, two-story foyer, and vaulted primary suite.',
    ),
    'bp-6-n-howells-point-rd-42842': (
        '1955 Hipped-Roof Shingle Ranch',
        'Sprawling single-story cedar-shingle Ranch with symmetrical dormered entry portico, open entertaining layout, and resort pool pavilion.',
    ),
    'bp-67-n-howells-point-rd-34723': (
        '1955 Extended Coastal Ranch',
        'Warm cedar-toned sprawling Ranch with timbered front porch, wide picture windows, 2007 two-car garage wing, and mahogany gazebo deck.',
    ),
    'bp-17-third-st-11537': (
        '1950 Beamed Village Cottage',
        'White-painted mid-century coastal cottage with dark shutters, vaulted exposed-beam living room, built-in window seats, and detached cedar studio.',
    ),
    'bp-26-general-mclean-dr-54993': (
        '1949 Dutch-Dormered Shingle Cape',
        'Natural cedar-shingle Cape cottage with full shed dormer, covered front stoop, brick path, and open fireplace living room.',
    ),
    'bp-79-bieselin-rd-13478': (
        '1969 Clapboard Center-Hall Colonial',
        'Two-story gray-clapboard Colonial with brick-accented entry, shuttered upper facade, rear sunroom, and three-tier entertaining deck.',
    ),
    'bp-41-station-rd-36469': (
        '1922 Gabled Shingle Cottage',
        'Steep-gabled 1922 weathered cedar-shingle corner cottage with full-width covered front porch and white-oak soapstone kitchen.',
    ),
    'bp-69-circuit-rd-26910': (
        '1955 Clapboard Split-Level',
        'Mid-century cream-clapboard split-level with brick end chimney, cantilevered upper bedroom wing, and attached single-bay garage.',
    ),
    'bp-10-kreamer-st-05317': (
        '1965 Cedar-Shake High Ranch',
        'Renovated two-level gray cedar-shake High Ranch with raised central entry stair, open-concept upper living floor, and double garage.',
    ),
    'bp-202-s-country-rd-20864': (
        '1950 Georgian Country Estate',
        'Five-bay ochre-clapboard Georgian estate with gabled roof dormers, paneled double-height foyer, screened porch, and carriage barn on 2 acres.',
    ),
    'bp-37-browns-ln-31908': (
        '1890 Queen Anne Victorian',
        'Stately three-story 1890s Victorian with columned wraparound veranda, central gable dormer, marble hearth, and crowning widow’s walk.',
    ),
    'bp-10-brookside-ave-73063': (
        '1947 Mid-Century Modern Pavilion',
        'Flat-roofed white-stucco Mid-Century Modern pavilion with horizontal clerestory windows and glass-enclosed fireplace sunroom.',
    ),
    'bp-13-oak-meadow-ln-04628': (
        '1987 Shingle Postmodern Colonial',
        'Three-story weathered gray-shingle coastal Colonial with wraparound covered porch, upper dormer deck, and gambrel-inspired massing.',
    ),
    'bp-30-general-mcclean-dr-49613': (
        '1953 Classic Mid-Century Ranch',
        'Single-story cedar-and-clapboard 1950s Ranch with brick fireplace chimney, shuttered picture windows, and oak hardwood floors.',
    ),
    'bp-76-bieselin-rd-35490': (
        '1976 Bi-Level Sunroom Colonial',
        'Renovated two-level coastal residence featuring an open-plan main living floor and lower-level guest suite with cathedral sunroom.',
    ),
    'bp-81-country-club-rd-21171': (
        '1950 Minimalist Village Cottage',
        'Compact single-story white-clapboard 1950 cottage with gabled entry stoop, vaulted wood-beamed ceilings, and detached garage.',
    ),
}

SQFT_FIXES = {
    'bp-19-third-st-17974': 1680,
    'bp-17-third-st-11537': 1620,
    'bp-10-kreamer-st-05317': 1796,
    'bp-10-brookside-ave-73063': 1604,
    'bp-81-country-club-rd-21171': 1080,
}

def main():
    parcels_bundle = json.loads(PARCELS_PATH.read_text())
    linked_parcels = {
        p['listingId']: p
        for p in parcels_bundle['parcels']
        if p.get('listingId')
    }

    store = json.loads(STORE_PATH.read_text())
    village_listings = []
    for item in store['listings']:
        lid = item['id']
        if lid not in linked_parcels:
            continue
        p = linked_parcels[lid]
        item['inVillage'] = True
        item['latitude'] = p['lat']
        item['longitude'] = p['lon']
        item['walkToMarinaMin'] = p.get('walkMin') or item.get('walkToMarinaMin')
        if lid in SQFT_FIXES:
            item['sqft'] = SQFT_FIXES[lid]
            p['sqft'] = SQFT_FIXES[lid]
        if lid in ARCH_BY_ID:
            style_name, style_summary = ARCH_BY_ID[lid]
            item['style'] = style_name
            item['styleSummary'] = style_summary
            item['headline'] = style_summary
        village_listings.append(item)

    store['listings'] = village_listings
    STORE_PATH.write_text(json.dumps(store, indent=2))
    SEED_PATH.write_text(json.dumps(village_listings, indent=2))
    PARCELS_PATH.write_text(json.dumps(parcels_bundle, separators=(',', ':')))

    # Filter sales history strictly to Incorporated Bellport Village
    sales = json.loads(SALES_PATH.read_text())
    village_sales = [
        s for s in sales
        if s.get('inVillage') and s.get('area') != 'Outside Village (11713)'
    ]
    SALES_PATH.write_text(json.dumps(village_sales, indent=2))

    print(f"Updated store.json & seed-listings.json -> {len(village_listings)} Bellport Village listings "
          f"({sum(1 for x in village_listings if x['marketStatus']=='active')} active, "
          f"{sum(1 for x in village_listings if x['marketStatus']=='sold')} sold)")
    print(f"Updated bellport-sales-history.json -> {len(village_sales)} Bellport Village closed sales")

if __name__ == '__main__':
    main()
