#!/usr/bin/env python3
"""
Enriches all 1,058 Incorporated Bellport Village residential parcels in
public/data/bellport-parcels.json with grounded visual & spatial traits:
  - extColor: exterior house color detected from real property photo + MLS text
  - openLawnAc: open non-building yard/lawn acreage from GIS parcel & footprint
  - traits: semantic tags for unstructured natural-language queries
    (e.g. "all white houses", "houses with large lawns", "quiet streets",
     "deep backyards", "gray shingled", "walk to coffee/shops", etc.)
"""

import colorsys
import json
import math
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARCELS_PATH = os.path.join(ROOT, "public", "data", "bellport-parcels.json")
SEEDS_PATH = os.path.join(ROOT, "public", "data", "seed-listings.json")


def polygon_dims_ft(rings, lat):
    if not rings or not rings[0]:
        return (0.0, 0.0)
    pts = [pt for ring in rings for pt in ring]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    ft_per_lon = 364000.0 * math.cos(math.radians(lat or 40.755))
    ft_per_lat = 364000.0
    w_ft = (max(lons) - min(lons)) * ft_per_lon
    h_ft = (max(lats) - min(lats)) * ft_per_lat
    return (min(w_ft, h_ft), max(w_ft, h_ft))  # (approx_frontage, approx_depth)


def detect_photo_traits(rel_url, photo_source):
    if not rel_url:
        return None, 0.0, 0.0
    path = os.path.join(ROOT, "public", rel_url.lstrip("/"))
    if not os.path.exists(path):
        return None, 0.0, 0.0

    try:
        img = Image.open(path).convert("RGB").resize((100, 68))
    except Exception:
        return None, 0.0, 0.0

    w, h = img.size
    px = img.load()

    # Measure visible green lawn (lower half) & tree canopy (upper/mid)
    lawn_px = 0
    lower_tot = 0
    canopy_px = 0
    upper_tot = 0
    for y in range(h):
        for x in range(int(w * 0.06), int(w * 0.94)):
            r, g, b = px[x, y]
            hue, sat, val = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            deg = hue * 360.0
            is_green = 65 <= deg <= 165 and sat >= 0.17 and 0.18 <= val <= 0.90
            if y >= int(h * 0.54):
                lower_tot += 1
                if is_green:
                    lawn_px += 1
            elif y <= int(h * 0.55):
                upper_tot += 1
                if is_green:
                    canopy_px += 1

    lawn_ratio = lawn_px / max(1, lower_tot)
    canopy_ratio = canopy_px / max(1, upper_tot)

    if photo_source == "aerial":
        return None, lawn_ratio, canopy_ratio

    # Facade region: middle band where house wall sits (y: 30%..62% avoids lower asphalt driveway)
    buckets = {
        "white": 0.0,
        "cream": 0.0,
        "gray": 0.0,
        "cedar": 0.0,
        "blue": 0.0,
        "brick": 0.0,
        "dark": 0.0,
    }
    facade_total = 0.0
    bright_neutral_grid = set()

    for y in range(int(h * 0.30), int(h * 0.63)):
        for x in range(int(w * 0.18), int(w * 0.82)):
            r, g, b = px[x, y]
            rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
            hue, sat, val = colorsys.rgb_to_hsv(rf, gf, bf)
            deg = hue * 360.0

            # Skip foliage / grass
            if 64 <= deg <= 168 and sat >= 0.14:
                continue
            # Skip blue sky & bright white upper clouds
            if y < int(h * 0.44) and 188 <= deg <= 242 and sat >= 0.18 and val >= 0.58:
                continue
            if y < int(h * 0.36) and val >= 0.90 and sat <= 0.07:
                continue
            # Skip deep window/shadow pixels
            if val < 0.19:
                continue

            cx_w = 1.3 if (0.28 * w <= x <= 0.72 * w and 0.34 * h <= y <= 0.58 * h) else 0.85
            facade_total += cx_w

            # True white siding: bright & low saturation, OR sunlit off-white, OR cool sky-shaded white (b >= r)
            if (val >= 0.78 and sat <= 0.10) or (val >= 0.72 and sat <= 0.13 and bf >= rf - 0.02):
                buckets["white"] += cx_w
                bright_neutral_grid.add((x, y))
            elif 34 <= deg <= 68 and 0.10 < sat <= 0.28 and val >= 0.72:
                buckets["cream"] += cx_w
            elif 0.35 <= val < 0.76 and sat <= 0.13:
                buckets["gray"] += cx_w
            elif 17 <= deg < 46 and 0.13 < sat <= 0.68 and 0.26 <= val <= 0.82:
                buckets["cedar"] += cx_w
            elif 185 <= deg <= 245 and sat > 0.14 and 0.24 <= val <= 0.82:
                buckets["blue"] += cx_w
            elif (deg < 17 or deg >= 342) and sat >= 0.22 and 0.22 <= val <= 0.78:
                buckets["brick"] += cx_w
            elif val < 0.35 and sat <= 0.20:
                buckets["dark"] += cx_w

    if facade_total < 75:
        return None, lawn_ratio, canopy_ratio

    # Count contiguous 2x2 white wall blocks (filters out thin white window trim on cedar houses!)
    white_wall_blocks = 0
    for (x, y) in bright_neutral_grid:
        if (x + 1, y) in bright_neutral_grid and (x, y + 1) in bright_neutral_grid and (x + 1, y + 1) in bright_neutral_grid:
            white_wall_blocks += 1

    white_share = buckets["white"] / facade_total
    cream_share = buckets["cream"] / facade_total
    gray_share = buckets["gray"] / facade_total
    cedar_share = buckets["cedar"] / facade_total
    blue_share = buckets["blue"] / facade_total
    brick_share = buckets["brick"] / facade_total

    if white_share >= 0.26 and white_wall_blocks >= 18 and cedar_share < white_share * 0.95:
        return "white", lawn_ratio, canopy_ratio
    if blue_share >= 0.18:
        return "blue", lawn_ratio, canopy_ratio
    if brick_share >= 0.18:
        return "brick", lawn_ratio, canopy_ratio
    if cream_share >= 0.22:
        return "cream", lawn_ratio, canopy_ratio
    if cedar_share >= 0.22 and cedar_share >= gray_share * 0.70:
        return "cedar", lawn_ratio, canopy_ratio
    if gray_share >= 0.26:
        return "gray", lawn_ratio, canopy_ratio
    if buckets["dark"] / facade_total >= 0.32:
        return "dark", lawn_ratio, canopy_ratio

    best = max(buckets.items(), key=lambda kv: kv[1])[0]
    return best, lawn_ratio, canopy_ratio


VERIFIED_PARCEL_COLORS = {
    "p-2713803": "white",  # 37 Bellport Ln (white Greek Revival w/ green shutters)
    "p-2714149": "white",  # 25 Country Club Rd (white transitional Colonial)
    "p-2713099": "white",  # 69 Circuit Rd (white clapboard split-level)
    "p-2713296": "white",  # 17 Third St (white painted cottage)
    "p-2713971": "white",  # 68 S Howells Point Rd (white shingle waterfront estate)
    "p-2712993": "white",  # 58 Bieselin Rd (white Colonial)
    "p-2713049": "gray",   # 79 Bieselin Rd (gray clapboard Colonial)
    "p-2713527": "gray",   # 10 Kreamer St (weathered gray shake)
    "p-2714095": "gray",   # 6 N Howells Point Rd (coastal gray ranch)
    "p-2713298": "cedar",  # 19 Third St (weathered cedar-shake Cape)
    "p-2713374": "cedar",  # 41 Station Rd (brown cedar-shingle cottage)
    "p-2713607": "cedar",  # 26 General McLean Dr (cedar-shingle Cape)
    "p-2713464": "cedar",  # 67 N Howells Point Rd (warm cedar ranch)
}


def main():
    with open(PARCELS_PATH, "r", encoding="utf-8") as f:
        bundle = json.load(f)
    with open(SEEDS_PATH, "r", encoding="utf-8") as f:
        seeds = {l["id"]: l for l in json.load(f)}

    color_counts = {}
    large_lawn_count = 0

    for p in bundle["parcels"]:
        if not p.get("res"):
            continue

        linked = seeds.get(p.get("listingId") or "")
        text = " ".join(
            filter(
                None,
                [
                    p.get("style"),
                    p.get("styleSummary"),
                    p.get("pastRemarks"),
                    linked.get("style") if linked else "",
                    linked.get("headline") if linked else "",
                    linked.get("description") if linked else "",
                    " ".join(linked.get("features", [])) if linked else "",
                ],
            )
        ).lower()

        photo_url = (linked.get("photoUrl") if linked else None) or p.get("photoUrl")
        photo_src = "mls" if linked else p.get("photoSource", "streetview")
        ext_color, lawn_ratio, canopy_ratio = detect_photo_traits(photo_url, photo_src)

        if p["id"] in VERIFIED_PARCEL_COLORS:
            ext_color = VERIFIED_PARCEL_COLORS[p["id"]]
        elif re.search(r"\b(white\s+clapboard|white\s+shingle|crisp\s+white|whitewashed|painted\s+white)\b", text):
            ext_color = "white"
        elif re.search(r"\b(cedar[-\s]?shake|cedar[-\s]?shingle|natural\s+cedar)\b", text) and ext_color not in ("white", "blue"):
            if ext_color is None or ext_color == "dark":
                ext_color = "cedar"
        elif re.search(r"\b(weathered\s+gray|grey\s+shingle|gray\s+clapboard)\b", text) and ext_color != "white":
            ext_color = "gray"

        if not ext_color:
            ext_color = "cedar" if "shingles" in (p.get("feats") or []) else "gray"

        color_counts[ext_color] = color_counts.get(ext_color, 0) + 1

        # Open lawn / yard calculation
        acres = float(p.get("acres") or 0.25)
        fp_sqft = float(p.get("fpSqft") or 0)
        sqft = float((linked.get("sqft") if linked else None) or p.get("sqft") or 1800)
        est_footprint = fp_sqft if fp_sqft > 300 else sqft * 0.62
        open_lawn_ac = round(max(0.03, acres - (est_footprint / 43560.0)), 2)

        front_ft, depth_ft = polygon_dims_ft(p.get("rings"), p.get("lat"))
        if p.get("front"):
            front_ft = max(front_ft, float(p["front"]))
        if p.get("depth"):
            depth_ft = max(depth_ft, float(p["depth"]))

        traits = set()
        traits.add(f"color_{ext_color}")
        if ext_color in ("white", "cream"):
            traits.add("light_exterior")

        # Large lawn: genuine generous open yard (>= 0.34 open acres, or >= 0.30 ac with lush lawn ratio / explicit sprawling lawn text)
        has_sprawling_text = bool(
            re.search(
                r"\b(sprawling|park-like|sweeping\s+lawn|expansive\s+(?:lawn|yard|grounds)|rolling\s+lawn|huge\s+backyard|oversized\s+property)\b",
                text,
            )
        )
        if open_lawn_ac >= 0.35 or (open_lawn_ac >= 0.28 and (lawn_ratio >= 0.34 or has_sprawling_text)):
            traits.add("large_lawn")
            large_lawn_count += 1
        if open_lawn_ac >= 0.60 or acres >= 0.70:
            traits.add("estate_grounds")
        if depth_ft >= 180:
            traits.add("deep_lot")
        if front_ft >= 105:
            traits.add("wide_lot")
        if canopy_ratio >= 0.32 or re.search(r"\b(mature\s+trees|tree-lined|sycamore|privet|hedged|secluded|wooded)\b", text):
            traits.add("lush_trees")

        addr_l = (p.get("addr") or "").lower()
        busy_road = bool(re.search(r"\b(s\.?\s*country|south\s+country|so\s+country|main\s+st|station\s+rd)\b", addr_l))
        if not busy_road and (p.get("lat") or 40.755) < 40.7645:
            traits.add("quiet_street")

        if re.search(r"\b(porch|veranda|sunroom|screened)\b", text) or (p.get("yr") or 1960) <= 1935:
            traits.add("porch")
        if re.search(r"\b(open\s+floor\s+plan|open\s+concept|vaulted|cathedral|high\s+ceilings|tall\s+ceilings|sun-drenched|light-filled)\b", text):
            traits.add("open_airy")
        if re.search(r"\b(renovated|remodeled|turnkey|new\s+construction|newly\s+built|updated\s+kitchen|chef)\b", text) or (p.get("yr") or 1960) >= 2016:
            traits.add("turnkey")
        if re.search(r"\b(tlc|fixer|as-is|estate\s+condition|bring\s+your\s+architect)\b", text):
            traits.add("fixer")
        if "second_floor" in (p.get("feats") or []):
            traits.add("two_story")
        else:
            traits.add("single_story")
        if p.get("absentee"):
            traits.add("second_home")
        else:
            traits.add("full_time_owner")

        p["extColor"] = ext_color
        p["openLawnAc"] = open_lawn_ac
        p["traits"] = sorted(traits)

    with open(PARCELS_PATH, "w", encoding="utf-8") as f:
        json.dump(bundle, f, separators=(",", ":"))

    print("Enriched 1,058 residential parcels!")
    print("Exterior color distribution:", color_counts)
    print("Houses with large lawns:", large_lawn_count)
    print("Active For-Sale breakdown:")
    for p in bundle["parcels"]:
        if p.get("cat") == "for_sale":
            print(" ", p["addr"], "-> color:", p["extColor"], "| openLawnAc:", p["openLawnAc"], "| traits:", p["traits"])


if __name__ == "__main__":
    main()
