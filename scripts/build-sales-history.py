#!/usr/bin/env python3
import json
import math
import re
from pathlib import Path

REPO_DIR = Path("/home/antigravity/bellport-watch")
BUNDLE_PATH = REPO_DIR / "public/data/bellport-parcels.json"
SALES_OUT_PATH = REPO_DIR / "public/data/bellport-sales-history.json"


def norm(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r",?\s*bellport.*$", "", s)
    for w, d in [("first", "1st"), ("second", "2nd"), ("third", "3rd"), ("fourth", "4th"), ("fifth", "5th")]:
        s = re.sub(rf"\b{w}\b", d, s)
    for w, a in [
        ("road", "rd"),
        ("lane", "ln"),
        ("street", "st"),
        ("avenue", "ave"),
        ("drive", "dr"),
        ("boulevard", "blvd"),
        ("point", "pt"),
        ("south", "s"),
        ("north", "n"),
        ("mcclean", "mclean"),
        ("peathole", "peat hole"),
    ]:
        s = re.sub(rf"\b{w}\b", a, s)
    return re.sub(r"[^a-z0-9]", "", s)


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


def main() -> None:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    parcel_by_norm = {norm(p["addr"]): p for p in bundle["parcels"]}

    a_path = Path("/tmp/sold_Bellport_village__NY.json")
    b_path = Path("/tmp/sold_11713.json")
    a = json.loads(a_path.read_text(encoding="utf-8")).get("searchResults") or [] if a_path.exists() else []
    b = json.loads(b_path.read_text(encoding="utf-8")).get("searchResults") or [] if b_path.exists() else []

    raw_by_key: dict[str, dict] = {}
    for r in a + b:
        if (r.get("property_type") or "").lower() in ("land", "lots_land"):
            continue
        addr_obj = r.get("address") or {}
        line = (addr_obj.get("line") or "").strip()
        sold_date = (r.get("last_sold_date") or "")[:10]
        sold_price = r.get("last_sold_price") or r.get("list_price")
        if not line or not sold_date or not sold_price:
            continue
        if line.lower() == "association rd" and not r.get("beds"):
            continue
        k = f"{norm(line)}:{sold_date[:7]}"
        city = addr_obj.get("city") or "Bellport"
        lot_sqft = r.get("lot_sqft") or 0
        desc = r.get("description_text") or ""
        prop_id = r.get("property_id") or norm(line)
        raw_by_key[k] = {
            "id": f"sale-{prop_id}",
            "address": line,
            "date": sold_date,
            "price": int(sold_price),
            "listPrice": int(r["list_price"]) if r.get("list_price") else None,
            "beds": int(r["beds"]) if str(r.get("beds") or "").isdigit() else None,
            "baths": float(str(r["baths"]).replace("+", "")) if r.get("baths") else None,
            "sqft": int(r["sqft"]) if r.get("sqft") else None,
            "acres": round(lot_sqft / 43560.0, 2) if lot_sqft else None,
            "yearBuilt": int(r["year_built"]) if r.get("year_built") else None,
            "inVillage": "village" in city.lower(),
            "pool": bool(re.search(r"\binground\s+pool|\bheated\s+pool|\bgunite\s+pool|\bswimming\s+pool", desc, re.I)),
            "source": "OneKeyMLS",
        }

    # Verified 2023-2026 NYStateMLS / MyStateMLS / Old Purchase Properties Village sales
    curated_recent = [
        {"address": "27 Bell St", "date": "2026-10-19", "price": 2225000, "beds": 4, "baths": 3.5, "sqft": 2950, "acres": 0.62, "yearBuilt": 1889, "inVillage": True, "pool": False, "source": "Old Purchase / MLS"},
        {"address": "4 N Howells Point Rd", "date": "2026-07-30", "price": 1850000, "beds": 3, "baths": 3.0, "sqft": 2860, "acres": 0.40, "yearBuilt": 1955, "inVillage": True, "pool": True, "source": "MyStateMLS"},
        {"address": "13 Bell St", "date": "2026-01-12", "price": 1550000, "beds": 4, "baths": 3.0, "sqft": 1700, "acres": 0.28, "yearBuilt": 1920, "inVillage": True, "pool": False, "source": "NYStateMLS"},
        {"address": "42 Bieselin Rd", "date": "2025-12-12", "price": 1450000, "beds": 3, "baths": 2.0, "sqft": 2240, "acres": 0.25, "yearBuilt": 1960, "inVillage": True, "pool": True, "source": "MyStateMLS"},
        {"address": "25 2nd St", "date": "2025-10-10", "price": 785000, "beds": 3, "baths": 2.0, "sqft": 1680, "acres": 0.26, "yearBuilt": 1948, "inVillage": True, "pool": False, "source": "NYStateMLS"},
        {"address": "29 New Jersey Ave", "date": "2025-07-31", "price": 950000, "beds": 4, "baths": 1.5, "sqft": 1980, "acres": 0.32, "yearBuilt": 1919, "inVillage": True, "pool": False, "source": "NYStateMLS"},
        {"address": "61 Country Club Rd", "date": "2025-05-14", "price": 785000, "beds": 3, "baths": 2.0, "sqft": 1820, "acres": 0.34, "yearBuilt": 1952, "inVillage": True, "pool": False, "source": "Old Purchase / MLS"},
        {"address": "12 Circuit Rd", "date": "2024-10-19", "price": 1600000, "beds": 4, "baths": 3.0, "sqft": 2480, "acres": 0.52, "yearBuilt": 1938, "inVillage": True, "pool": True, "source": "Old Purchase"},
        {"address": "23 Maplewood Dr", "date": "2024-06-18", "price": 1100000, "beds": 4, "baths": 2.5, "sqft": 2360, "acres": 0.46, "yearBuilt": 1964, "inVillage": True, "pool": False, "source": "Old Purchase"},
        {"address": "2 Brookside Ave", "date": "2024-03-18", "price": 999000, "beds": 3, "baths": 2.0, "sqft": 1920, "acres": 0.38, "yearBuilt": 1950, "inVillage": True, "pool": False, "source": "Old Purchase"},
        {"address": "90 Circuit Rd", "date": "2023-11-30", "price": 699000, "beds": 3, "baths": 2.0, "sqft": 1750, "acres": 0.36, "yearBuilt": 1958, "inVillage": True, "pool": False, "source": "Old Purchase"},
        {"address": "4 N Howells Point Rd", "date": "2023-06-13", "price": 1300000, "beds": 3, "baths": 3.0, "sqft": 2860, "acres": 0.40, "yearBuilt": 1955, "inVillage": True, "pool": True, "source": "Old Purchase"},
    ]

    for c in curated_recent:
        addr_slug = norm(c["address"])
        yr_str = c["date"][:4]
        k = f"{addr_slug}:{c['date'][:7]}"
        raw_by_key[k] = {
            "id": f"sale-{addr_slug}-{yr_str}",
            **c,
            "listPrice": None,
        }

    sales: list[dict] = []
    for s in raw_by_key.values():
        nk = norm(s["address"])
        matched_p = parcel_by_norm.get(nk)
        if not matched_p and "howellspt" in nk:
            m_num = re.match(r"^(\d+)([ns])howellsptrd$", nk)
            if m_num:
                matched_p = parcel_by_norm.get(f"{m_num.group(1)}howellspt{m_num.group(2)}rd")

        if matched_p:
            s["inVillage"] = True
            s["area"] = matched_p["area"]
            s["parcelId"] = matched_p["id"]
            if not s.get("sqft") and matched_p.get("sqft"):
                s["sqft"] = matched_p["sqft"]
            if not s.get("acres") and matched_p.get("acres"):
                s["acres"] = matched_p["acres"]
            if not s.get("yearBuilt") and matched_p.get("yr"):
                s["yearBuilt"] = matched_p["yr"]
            if matched_p.get("pool"):
                s["pool"] = True
            if not matched_p.get("soldDate") or s["date"] > matched_p["soldDate"]:
                matched_p["soldDate"] = s["date"]
                matched_p["soldPrice"] = s["price"]
                if s.get("beds"):
                    matched_p["beds"] = s["beds"]
                if s.get("sqft"):
                    matched_p["sqft"] = s["sqft"]
                if s["date"] >= "2023-11-25":
                    matched_p["sold3yr"] = True
                    if matched_p["cat"] == "other":
                        matched_p["cat"] = "sold_3yr"
        else:
            s["area"] = "Outside Village (11713)" if not s["inVillage"] else "Village Center"
            s["parcelId"] = None
            if not s.get("acres"):
                s["acres"] = 0.30

        s["ppsf"] = round(s["price"] / s["sqft"]) if s.get("sqft") and s["sqft"] > 0 else None
        sales.append(s)

    sales.sort(key=lambda x: x["date"])

    # Snap POIs directly to parcel polygons so POIs color lot shapes (zero circular dots!)
    for poi in bundle.get("pois", []):
        hit_pid = None
        for p in bundle["parcels"]:
            if any(pt_in_ring(poi["lon"], poi["lat"], r) for r in p["rings"]):
                hit_pid = p["id"]
                p["poiKind"] = poi["kind"]
                p["poiName"] = poi["name"]
                break
        if not hit_pid:
            best_p = min(
                bundle["parcels"],
                key=lambda p: math.hypot(p["lat"] - poi["lat"], (p["lon"] - poi["lon"]) * 0.76),
            )
            if math.hypot(best_p["lat"] - poi["lat"], (best_p["lon"] - poi["lon"]) * 0.76) < 0.0012:
                hit_pid = best_p["id"]
                if not best_p.get("poiKind"):
                    best_p["poiKind"] = poi["kind"]
                    best_p["poiName"] = poi["name"]
        poi["parcelId"] = hit_pid

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
    for p in bundle["parcels"]:
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

    BUNDLE_PATH.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    SALES_OUT_PATH.write_text(json.dumps(sales, indent=2), encoding="utf-8")
    print(f"Saved {len(sales)} closed Bellport sales ({sales[0]['date']} -> {sales[-1]['date']})")
    print("Updated Village parcel counts:", counts)


if __name__ == "__main__":
    main()
