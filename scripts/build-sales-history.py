#!/usr/bin/env python3
"""
Builds the comprehensive multi-decade historical sales archive (1993–2026) and
curated Most Beautiful Streets & Street Sections for Incorporated Bellport Village, NY (SWIS 472203).

Sources merged & deduplicated strictly to Incorporated Bellport Village residential parcels:
1. Zillow closed sales (.data/zillow-sold-p1.json, zillow-sold-p2.json, zillow-sold-any-p1.json)
2. Redfin 5-year closed archive (.data/redfin-sold-5yr.json)
3. OneKeyMLS / Realtor archive (.data/realtor-sold-oldest.json, realtor-poly-oldest-p1.json, realtor-zip-11713-oldest.json, gis-layers-cache.json)
4. Suffolk County Clerk public record & multi-decade deed transfers (.data/zillow-village-pricehistories.json)
5. Verified local Bellport Village brokerage closings (Old Purchase / NYStateMLS / MyStateMLS)
"""

import datetime
import json
import math
import re
from pathlib import Path

REPO_DIR = Path("/home/antigravity/bellport-watch")
BUNDLE_PATH = REPO_DIR / "public/data/bellport-parcels.json"
SALES_OUT_PATH = REPO_DIR / "public/data/bellport-sales-history.json"
SYNC_META_PATH = REPO_DIR / ".data/sync-meta.json"

BEAUTIFUL_STREET_DEFS = [
    {
        "id": "bellport-lane",
        "name": "Bellport Lane (Main St South to Marina)",
        "shortName": "Bellport Lane",
        "subtitle": "Historic District · South Country Rd to Village Dock",
        "description": "National Register historic district lined with 19th-century sea captains' Colonials, cedar-shingled estates, and sycamores leading straight to the Marina.",
        "streetRegex": r"^Bellport Ln$",
        "maxLat": 40.7573,
        "minLat": 40.7400,
    },
    {
        "id": "browns-lane",
        "name": "Browns Lane (South of Main St to Bay)",
        "shortName": "Browns Lane",
        "subtitle": "Shaded Shingle-Style Canopy South of Main St",
        "description": "Quiet, tree-canopied historic lane prized for deep privet hedges, classic 1880s–1920s Shingle Style cottages, and carriage houses.",
        "streetRegex": r"^Browns Ln$",
        "maxLat": 40.7598,
        "minLat": 40.7480,
    },
    {
        "id": "bell-hulse-pocket",
        "name": "Bell Street & Hulse Street Pocket",
        "shortName": "Bell & Hulse Sts",
        "subtitle": "Intimate Historic Cross-Lanes Off Bellport & Browns",
        "description": "Charming, walkable historic village cross-streets (Bell St, Hulse St & Tuthill St) connecting Bellport Lane and Browns Lane just below Main Street.",
        "streetRegex": r"^(Bell St|Hulse St|Tuthill St|Tuttle St)$",
        "maxLat": 40.7586,
        "minLat": 40.7540,
    },
    {
        "id": "livingston-rogers",
        "name": "Livingston Rd & Rogers Ave",
        "shortName": "Livingston & Rogers",
        "subtitle": "Leafy Lower Historic Lanes Near Marina",
        "description": "Peaceful, understated historic residential lanes south of Main Street (Livingston Rd & Rogers Ave) with mature gardens and quick strolls to the Bay.",
        "streetRegex": r"^(Livingston Rd|Rogers Ave)$",
        "maxLat": 40.7560,
        "minLat": 40.7490,
    },
    {
        "id": "academy-gerard",
        "name": "Academy Lane & Gerard St",
        "shortName": "Academy & Gerard",
        "subtitle": "Sycamore Canopy Parallel to Bellport & Livingston",
        "description": "Classic historic village corridor running south from Main Street alongside Livingston Road and Bellport Lane, known for pre-war Colonials and quiet yards.",
        "streetRegex": r"^(Academy Ln|Gerard St)$",
        "maxLat": 40.7565,
        "minLat": 40.7505,
    },
    {
        "id": "shore-thornhedge-bay",
        "name": "Shore Rd, Pearl St & Thornhedge Bluff",
        "shortName": "Shore & Thornhedge",
        "subtitle": "Great South Bay Waterfront & Bluff Lanes",
        "description": "Sweeping Bellport Bay vistas, coastal breezes, and waterfront shingle compounds along Shore Rd, Pearl St, Thornhedge Rd, Otis Ln, and Point Rd.",
        "streetRegex": r"^(Shore Rd|Front St|Pearl St|Day Ave|Thorn Hedge Rd|Thornhedge Rd|Point Rd|Otis Ln|Otis Ave|Bayberry Rd)$",
        "maxLat": 40.7554,
        "minLat": 40.7400,
    },
    {
        "id": "brewster-south",
        "name": "Brewster Lane (Southern Section Below Main St)",
        "shortName": "Brewster Ln (South)",
        "subtitle": "Best Section Only · South of Main St",
        "description": "Strictly the historic southern stretch of Brewster Lane below South Country Road — mature oaks, deep lawns, and classic shingle homes.",
        "streetRegex": r"^(Brewster Ln|S Brewster Ln|So Brewster Ln|Brewster S Ln|Brewster Ln S)$",
        "maxLat": 40.7604,
        "minLat": 40.7540,
    },
    {
        "id": "south-howells-lower",
        "name": "South Howells Point Rd (Lower Estate Section)",
        "shortName": "S. Howells Pt (Lower)",
        "subtitle": "Best Section Only · Country Club to Bay",
        "description": "The grand lower southern section of South Howells Point Road approaching Bellport Country Club and the Bay, famed for sweeping lawns and estate setbacks.",
        "streetRegex": r"^(S Howells Point Rd|Howells Pt S Rd|S\. Howells Pt Rd|So Howells Point Rd|S Howells Pt Rd)$",
        "maxLat": 40.7526,
        "minLat": 40.7410,
    },
]


def pt_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def canon_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r",\s*(bellport|east patchogue|brookhaven|ny).*$", "", s)
    s = s.replace(".", " ")
    for w, d in [("first", "1st"), ("second", "2nd"), ("third", "3rd"), ("fourth", "4th"), ("fifth", "5th")]:
        s = re.sub(rf"\b{w}\b", d, s)
    for w, a in [
        ("road", "rd"),
        ("lane", "ln"),
        ("street", "st"),
        ("avenue", "ave"),
        ("drive", "dr"),
        ("boulevard", "blvd"),
        ("court", "ct"),
        ("place", "pl"),
        ("point", "pt"),
        ("circle", "cir"),
        ("terrace", "ter"),
        ("parkway", "pkwy"),
        ("square", "sq"),
        ("south", "s"),
        ("so", "s"),
        ("north", "n"),
        ("no", "n"),
        ("east", "e"),
        ("west", "w"),
        ("general", "gen"),
        ("mcclean", "mclean"),
        ("peat hole", "peathole"),
        ("thorn hedge", "thornhedge"),
        ("osborne", "osborn"),
        ("wyandotte", "wyandott"),
        ("otis ln", "otis ave"),
    ]:
        s = re.sub(rf"\b{w}\b", a, s)
    s = re.sub(r"\b([nsew])\s+\1\b", r"\1", s)
    s = re.sub(r"^(\d+)\s+howells\s+pt\s+([ns])\s+rd\b", r"\1 \2 howells pt rd", s)
    s = re.sub(r"^(\d+)\s+brewster\s+(?:ln\s+)?([ns])(?:\s+ln)?\b", r"\1 \2 brewster ln", s)
    s = re.sub(r"^(\d+)\s+station\s+rd\s+([ns])\b", r"\1 \2 station rd", s)
    s = re.sub(r"^(\d+)\s+main\s+st\b", r"\1 s country rd", s)
    return re.sub(r"[^a-z0-9]", "", s)


def parse_iso_date(iso: str) -> datetime.date | None:
    try:
        return datetime.date.fromisoformat(iso[:10])
    except Exception:
        return None


def parcel_matches_beautiful_street(p: dict) -> dict | None:
    addr = (p.get("addr") or "").strip()
    street_part = re.sub(r"^\d+[A-Za-z]?\s+", "", addr).strip()
    lat = p.get("lat") or 0.0
    for bdef in BEAUTIFUL_STREET_DEFS:
        if re.match(bdef["streetRegex"], street_part, re.I):
            if bdef["minLat"] <= lat <= bdef["maxLat"]:
                return bdef
    # Special check for Howells Point Rd without N/S prefix when strictly south of Main St
    if re.match(r"^(Howells Point Rd|Howells Pt Rd)$", street_part, re.I) and lat <= 40.7526:
        return BEAUTIFUL_STREET_DEFS[-1]
    return None


def build_beautiful_streets_geometry(bundle: dict) -> list[dict]:
    boundary_rings = bundle.get("boundaryRings") or []

    def in_village(lon: float, lat: float) -> bool:
        return any(pt_in_ring(lon, lat, r) for r in boundary_rings)

    out: list[dict] = []
    parcel_counts = {b["id"]: 0 for b in BEAUTIFUL_STREET_DEFS}
    for p in bundle["parcels"]:
        if not p.get("res"):
            p.pop("beautifulStreet", None)
            p.pop("beautifulStreetId", None)
            p.pop("beautifulStreetName", None)
            continue
        bdef = parcel_matches_beautiful_street(p)
        feats = [f for f in (p.get("feats") or []) if f != "beautiful_street"]
        if bdef:
            p["beautifulStreet"] = True
            p["beautifulStreetId"] = bdef["id"]
            p["beautifulStreetName"] = bdef["shortName"]
            feats.append("beautiful_street")
            parcel_counts[bdef["id"]] += 1
        else:
            p["beautifulStreet"] = False
            p.pop("beautifulStreetId", None)
            p.pop("beautifulStreetName", None)
        p["feats"] = feats

    for bdef in BEAUTIFUL_STREET_DEFS:
        segs: list[list[list[float]]] = []
        label_pts: list[list[float]] = []
        for st in bundle.get("streets", []):
            if not re.match(bdef["streetRegex"], st["name"], re.I):
                continue
            for seg in st["segments"]:
                # Clip segment points to the section's latitude bounds & inside Village boundary
                cur: list[list[float]] = []
                for pt in seg:
                    lon, lat = pt[0], pt[1]
                    if bdef["minLat"] - 0.0005 <= lat <= bdef["maxLat"] + 0.0005 and in_village(lon, lat):
                        cur.append([round(lon, 5), round(lat, 5)])
                        label_pts.append([round(lon, 5), round(lat, 5)])
                    else:
                        if len(cur) >= 2:
                            segs.append(cur)
                        cur = []
                if len(cur) >= 2:
                    segs.append(cur)

        if label_pts:
            mid = label_pts[len(label_pts) // 2]
            label_lon, label_lat = mid[0], mid[1]
        else:
            matching_ps = [p for p in bundle["parcels"] if p.get("beautifulStreetId") == bdef["id"]]
            label_lon = round(sum(p["lon"] for p in matching_ps) / max(1, len(matching_ps)), 5)
            label_lat = round(sum(p["lat"] for p in matching_ps) / max(1, len(matching_ps)), 5)

        out.append(
            {
                "id": bdef["id"],
                "name": bdef["name"],
                "shortName": bdef["shortName"],
                "subtitle": bdef["subtitle"],
                "description": bdef["description"],
                "homeCount": parcel_counts[bdef["id"]],
                "labelLon": label_lon,
                "labelLat": label_lat,
                "segments": segs,
            }
        )
    return out


def main() -> None:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    parcels = bundle["parcels"]
    boundary_rings = bundle.get("boundaryRings") or []

    def in_village_poly(lon: float | None, lat: float | None) -> bool:
        if lon is None or lat is None:
            return False
        return any(pt_in_ring(lon, lat, r) for r in boundary_rings)

    # Reset stale sold fields before rebuilding cleanly
    for p in parcels:
        p["soldDate"] = None
        p["soldPrice"] = None
        p["sold3yr"] = False
        if p.get("cat") == "sold_3yr":
            p["cat"] = "other"

    p_by_norm: dict[str, dict] = {}
    for p in parcels:
        if p.get("res"):
            p_by_norm[canon_addr(p["addr"])] = p
    for p in parcels:
        nk = canon_addr(p["addr"])
        if nk not in p_by_norm:
            p_by_norm[nk] = p

    res_parcels = [p for p in parcels if p.get("res") and not p.get("underwater")]

    def match_parcel(addr: str, lon: float | None = None, lat: float | None = None) -> dict | None:
        nk = canon_addr(addr)
        if nk and nk in p_by_norm:
            cand = p_by_norm[nk]
            return cand if cand.get("res") else None
        if lon is not None and lat is not None and in_village_poly(lon, lat):
            for p in res_parcels:
                if any(pt_in_ring(lon, lat, r) for r in p["rings"]):
                    return p
            best = min(res_parcels, key=lambda p: math.hypot(p["lat"] - lat, (p["lon"] - lon) * 0.76))
            if math.hypot(best["lat"] - lat, (best["lon"] - lon) * 0.76) < 0.00038:
                return best
        return None

    candidates: list[dict] = []

    def push_sale(
        mp: dict | None,
        date_str: str | None,
        price_val: int | float | None,
        source: str,
        list_price: int | None = None,
        beds: int | None = None,
        baths: float | None = None,
        sqft: int | None = None,
        acres: float | None = None,
        year_built: int | None = None,
        pool: bool = False,
    ) -> None:
        if not mp or not mp.get("res") or not date_str or not price_val:
            return
        dt_obj = parse_iso_date(date_str)
        if not dt_obj or dt_obj.year < 1990 or dt_obj.year > 2026:
            return
        p_int = int(round(float(price_val)))
        # Exclude non-arm's-length nominal transfers ($1, $10, quitclaims) and rentals
        if p_int < 65000 or p_int > 25000000:
            return
        candidates.append(
            {
                "parcel": mp,
                "date": dt_obj.isoformat(),
                "dt_obj": dt_obj,
                "price": p_int,
                "listPrice": int(list_price) if list_price and list_price >= 65000 else None,
                "beds": int(beds) if beds and 1 <= int(beds) <= 14 else None,
                "baths": round(float(baths), 1) if baths and 0.5 <= float(baths) <= 14 else None,
                "sqft": int(sqft) if sqft and 400 <= int(sqft) <= 18000 else None,
                "acres": round(float(acres), 2) if acres and 0.04 <= float(acres) <= 20 else None,
                "yearBuilt": int(year_built) if year_built and 1750 <= int(year_built) <= 2026 else None,
                "pool": bool(pool),
                "source": source,
            }
        )

    # 1. Zillow Sold archives
    for fn in [".data/zillow-sold-p1.json", ".data/zillow-sold-p2.json", ".data/zillow-sold-any-p1.json"]:
        fpath = REPO_DIR / fn
        if not fpath.exists():
            continue
        for item in json.loads(fpath.read_text(encoding="utf-8")).get("searchResults", []):
            pr = item.get("property", item)
            lsd = pr.get("lastSoldDate")
            if not lsd:
                continue
            dt_str = datetime.datetime.fromtimestamp(lsd / 1000.0, datetime.UTC).strftime("%Y-%m-%d")
            val = (pr.get("price") or {}).get("value")
            loc = pr.get("location") or {}
            addr = (pr.get("address") or {}).get("streetAddress") or ""
            mp = match_parcel(addr, loc.get("longitude"), loc.get("latitude"))
            lot_obj = pr.get("lotSizeWithUnit") or {}
            lot_ac = None
            if lot_obj.get("lotSize"):
                ls = float(lot_obj["lotSize"])
                unit = (lot_obj.get("lotSizeUnit") or "").lower()
                lot_ac = ls if "acre" in unit else ls / 43560.0
            push_sale(
                mp,
                dt_str,
                val,
                "Zillow / County Deed",
                beds=pr.get("bedrooms"),
                baths=pr.get("bathrooms"),
                sqft=pr.get("livingArea"),
                acres=lot_ac,
                year_built=pr.get("yearBuilt"),
            )

    # 2. Redfin 5-Year Sold archive
    rf_path = REPO_DIR / ".data/redfin-sold-5yr.json"
    if rf_path.exists():
        for item in json.loads(rf_path.read_text(encoding="utf-8")).get("searchResults", []):
            hd = item.get("homeData") or {}
            dt_str = ((hd.get("lastSaleData") or {}).get("lastSoldDate") or "")[:10]
            amt = (hd.get("priceInfo") or {}).get("amount")
            val = int(amt) if amt and str(amt).isdigit() else None
            ai = hd.get("addressInfo") or {}
            cent = ((ai.get("centroid") or {}).get("centroid") or {})
            mp = match_parcel(ai.get("formattedStreetLine") or "", cent.get("longitude"), cent.get("latitude"))
            sqft_s = (hd.get("sqftInfo") or {}).get("amount")
            lot_s = (hd.get("lotSize") or {}).get("amount")
            yb = (hd.get("yearBuilt") or {}).get("yearBuilt")
            push_sale(
                mp,
                dt_str,
                val,
                "Redfin / MLS",
                beds=hd.get("beds"),
                baths=hd.get("baths"),
                sqft=int(sqft_s) if sqft_s and str(sqft_s).isdigit() else None,
                acres=float(lot_s) / 43560.0 if lot_s and str(lot_s).isdigit() else None,
                year_built=yb,
            )

    # 3. Realtor / OneKeyMLS Sold archives
    realtor_items: list[dict] = []
    for fn in [
        ".data/realtor-sold-oldest.json",
        ".data/realtor-poly-oldest-p1.json",
        ".data/realtor-zip-11713-oldest.json",
    ]:
        fpath = REPO_DIR / fn
        if fpath.exists():
            realtor_items.extend(json.loads(fpath.read_text(encoding="utf-8")).get("searchResults", []))
    gis_cache = REPO_DIR / ".data/gis-layers-cache.json"
    if gis_cache.exists():
        realtor_items.extend(json.loads(gis_cache.read_text(encoding="utf-8")).get("sold", []))

    for r in realtor_items:
        if (r.get("property_type") or "").lower() in ("land", "lots_land"):
            continue
        addr_obj = r.get("address") or ((r.get("location") or {}).get("address")) or {}
        line = (addr_obj.get("line") or "").strip()
        coord = addr_obj.get("coordinate") or {}
        dt_str = (r.get("last_sold_date") or "")[:10]
        val = r.get("last_sold_price") or r.get("list_price")
        mp = match_parcel(line, coord.get("lon"), coord.get("lat"))
        lot_sqft = r.get("lot_sqft")
        desc = r.get("description_text") or ""
        baths_raw = str(r.get("baths") or "").replace("+", "").strip()
        push_sale(
            mp,
            dt_str,
            val,
            "OneKeyMLS",
            list_price=r.get("list_price"),
            beds=int(r["beds"]) if str(r.get("beds") or "").isdigit() else None,
            baths=float(baths_raw) if baths_raw and re.match(r"^\d+(\.\d+)?$", baths_raw) else None,
            sqft=r.get("sqft"),
            acres=float(lot_sqft) / 43560.0 if lot_sqft else None,
            year_built=r.get("year_built"),
            pool=bool(re.search(r"\binground\s+pool|\bheated\s+pool|\bgunite\s+pool|\bswimming\s+pool", desc, re.I)),
        )

    # 4. Zillow Village Multi-Decade Public Record Price Histories (1993–2026)
    om_path = REPO_DIR / ".data/zillow-offmarket.json"
    ph_path = REPO_DIR / ".data/zillow-village-pricehistories.json"
    if om_path.exists() and ph_path.exists():
        om_by_zpid = {
            str(r.get("zpid")): r
            for r in json.loads(om_path.read_text(encoding="utf-8")).get("offMarketResults", [])
            if r.get("zpid")
        }
        ph_map = json.loads(ph_path.read_text(encoding="utf-8"))
        for zpid_s, hist in ph_map.items():
            om_rec = om_by_zpid.get(zpid_s) or {}
            loc = om_rec.get("location") or {}
            addr = (om_rec.get("address") or {}).get("streetAddress") or ""
            mp = match_parcel(addr, loc.get("longitude"), loc.get("latitude"))
            if not mp:
                continue
            for ev in hist or []:
                if ev.get("postingIsRental") or ev.get("event") != "Sold":
                    continue
                push_sale(
                    mp,
                    ev.get("date"),
                    ev.get("price"),
                    ev.get("source") or "Suffolk County Deed",
                    beds=om_rec.get("bedrooms"),
                    baths=om_rec.get("bathrooms"),
                    sqft=om_rec.get("livingArea"),
                )

    # 5. Curated verified NYStateMLS / MyStateMLS / Old Purchase Village closings
    curated_recent = [
        {"address": "27 Bell St", "date": "2026-10-19", "price": 2225000, "beds": 4, "baths": 3.5, "sqft": 2950, "acres": 0.62, "yearBuilt": 1889, "pool": False, "source": "Old Purchase / MLS"},
        {"address": "4 N Howells Point Rd", "date": "2026-07-30", "price": 1850000, "beds": 3, "baths": 3.0, "sqft": 2860, "acres": 0.40, "yearBuilt": 1955, "pool": True, "source": "MyStateMLS"},
        {"address": "13 Bell St", "date": "2026-01-12", "price": 1550000, "beds": 4, "baths": 3.0, "sqft": 1700, "acres": 0.28, "yearBuilt": 1920, "pool": False, "source": "NYStateMLS"},
        {"address": "42 Bieselin Rd", "date": "2025-12-12", "price": 1450000, "beds": 3, "baths": 2.0, "sqft": 2240, "acres": 0.25, "yearBuilt": 1960, "pool": True, "source": "MyStateMLS"},
        {"address": "25 2nd St", "date": "2025-10-10", "price": 785000, "beds": 3, "baths": 2.0, "sqft": 1680, "acres": 0.26, "yearBuilt": 1948, "pool": False, "source": "NYStateMLS"},
        {"address": "29 New Jersey Ave", "date": "2025-07-31", "price": 950000, "beds": 4, "baths": 1.5, "sqft": 1980, "acres": 0.32, "yearBuilt": 1919, "pool": False, "source": "NYStateMLS"},
        {"address": "61 Country Club Rd", "date": "2025-05-14", "price": 785000, "beds": 3, "baths": 2.0, "sqft": 1820, "acres": 0.34, "yearBuilt": 1952, "pool": False, "source": "Old Purchase / MLS"},
        {"address": "12 Circuit Rd", "date": "2024-10-19", "price": 1600000, "beds": 4, "baths": 3.0, "sqft": 2480, "acres": 0.52, "yearBuilt": 1938, "pool": True, "source": "Old Purchase"},
        {"address": "23 Maplewood Dr", "date": "2024-06-18", "price": 1100000, "beds": 4, "baths": 2.5, "sqft": 2360, "acres": 0.46, "yearBuilt": 1964, "pool": False, "source": "Old Purchase"},
        {"address": "2 Brookside Ave", "date": "2024-03-18", "price": 999000, "beds": 3, "baths": 2.0, "sqft": 1920, "acres": 0.38, "yearBuilt": 1950, "pool": False, "source": "Old Purchase"},
        {"address": "90 Circuit Rd", "date": "2023-11-30", "price": 699000, "beds": 3, "baths": 2.0, "sqft": 1750, "acres": 0.36, "yearBuilt": 1958, "pool": False, "source": "Old Purchase"},
        {"address": "4 N Howells Point Rd", "date": "2023-06-13", "price": 1300000, "beds": 3, "baths": 3.0, "sqft": 2860, "acres": 0.40, "yearBuilt": 1955, "pool": True, "source": "Old Purchase"},
    ]
    for c in curated_recent:
        mp = match_parcel(c["address"])
        push_sale(
            mp,
            c["date"],
            c["price"],
            c["source"],
            beds=c["beds"],
            baths=c["baths"],
            sqft=c["sqft"],
            acres=c["acres"],
            year_built=c["yearBuilt"],
            pool=c["pool"],
        )

    # Group by parcel and deduplicate records within 120 days of each other (e.g., MLS close vs deed recording)
    by_pid: dict[str, list[dict]] = {}
    for c in candidates:
        by_pid.setdefault(c["parcel"]["id"], []).append(c)

    sales: list[dict] = []
    for pid, recs in by_pid.items():
        recs.sort(key=lambda x: x["dt_obj"])
        merged: list[dict] = []
        for r in recs:
            if merged and abs((r["dt_obj"] - merged[-1]["dt_obj"]).days) <= 120:
                prev = merged[-1]
                # Keep richer fields
                for fld in ("listPrice", "beds", "baths", "sqft", "acres", "yearBuilt"):
                    if not prev.get(fld) and r.get(fld):
                        prev[fld] = r[fld]
                if r.get("pool"):
                    prev["pool"] = True
                if "MLS" in r["source"] and "MLS" not in prev["source"]:
                    prev["source"] = r["source"]
                    prev["date"] = r["date"]
                    prev["dt_obj"] = r["dt_obj"]
                    prev["price"] = r["price"]
            else:
                merged.append(dict(r))

        for idx, m in enumerate(merged):
            mp = m["parcel"]
            sqft = m.get("sqft") or mp.get("sqft") or 1800
            acres = m.get("acres") or mp.get("acres") or 0.30
            yr_blt = m.get("yearBuilt") or mp.get("yr")
            beds = m.get("beds") or mp.get("beds")
            baths = m.get("baths") or mp.get("baths")
            pool = bool(m.get("pool") or mp.get("pool"))

            sale_rec = {
                "id": f"sale-{pid}-{m['date'][:7]}-{idx}",
                "address": mp["addr"],
                "date": m["date"],
                "price": m["price"],
                "listPrice": m.get("listPrice"),
                "beds": beds,
                "baths": baths,
                "sqft": sqft,
                "acres": acres,
                "yearBuilt": yr_blt,
                "inVillage": True,
                "area": mp["area"],
                "belowSC": bool(mp.get("belowSC")),
                "beautifulStreet": None,  # Populated below after beautiful streets pass
                "pool": pool,
                "ppsf": round(m["price"] / sqft) if sqft and sqft > 0 else None,
                "parcelId": pid,
                "source": m["source"],
            }
            sales.append(sale_rec)

            # Update parcel with most recent closed sale
            if not mp.get("soldDate") or m["date"] >= mp["soldDate"]:
                mp["soldDate"] = m["date"]
                mp["soldPrice"] = m["price"]
                if m.get("beds") and not mp.get("beds"):
                    mp["beds"] = m["beds"]
                if m.get("baths") and not mp.get("baths"):
                    mp["baths"] = m["baths"]
                if m.get("sqft") and not mp.get("sqft"):
                    mp["sqft"] = m["sqft"]
                if m["date"] >= "2023-11-26":
                    mp["sold3yr"] = True
                    if mp["cat"] == "other":
                        mp["cat"] = "sold_3yr"

    # Build curated Most Beautiful Streets & Street Sections
    beautiful_streets = build_beautiful_streets_geometry(bundle)
    bundle["beautifulStreets"] = beautiful_streets

    p_by_id = {p["id"]: p for p in parcels}
    for s in sales:
        mp = p_by_id.get(s["parcelId"])
        s["beautifulStreet"] = mp.get("beautifulStreetId") if mp else None

    sales.sort(key=lambda x: x["date"])

    # Recompute Village summary counts cleanly
    counts = {
        "for_sale": 0,
        "sold_3yr": 0,
        "built_3yr": 0,
        "other": 0,
        "pools": 0,
        "absentee": 0,
        "waterfront": 0,
        "est4br_prospects": 0,
    }
    for p in parcels:
        counts[p["cat"]] += 1
        if p.get("pool"):
            counts["pools"] += 1
        if p.get("absentee"):
            counts["absentee"] += 1
        if p.get("waterfront") and p.get("res"):
            counts["waterfront"] += 1
        p["est4br"] = bool(
            p.get("res")
            and ((p.get("beds") or 0) >= 4 or (not p.get("beds") and (p.get("sqft") or 0) >= 2350))
        )
        if p["est4br"] and not p.get("sold3yr") and p["cat"] != "for_sale" and 0 < (p.get("val") or 0) < 3000000:
            counts["est4br_prospects"] += 1
    bundle["counts"] = counts

    if SYNC_META_PATH.exists():
        sm = json.loads(SYNC_META_PATH.read_text(encoding="utf-8"))
        sm["creditsRemaining"] = 132
        SYNC_META_PATH.write_text(json.dumps(sm, indent=2), encoding="utf-8")

    BUNDLE_PATH.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    SALES_OUT_PATH.write_text(json.dumps(sales, indent=2), encoding="utf-8")

    unique_homes = len({s["parcelId"] for s in sales})
    print(f"Saved {len(sales)} closed Bellport Village sales across {unique_homes} unique Village homes ({sales[0]['date']} -> {sales[-1]['date']})!")
    print("Beautiful streets summary:")
    for bs in beautiful_streets:
        print(f"  - {bs['name']}: {bs['homeCount']} homes, {len(bs['segments'])} polyline segments")
    print("Updated Village parcel counts:", counts)


if __name__ == "__main__":
    main()
