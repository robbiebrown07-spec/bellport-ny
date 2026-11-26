#!/usr/bin/env python3
"""
Builds the complete 1,213-parcel GIS & property dataset for Incorporated Bellport Village, NY (SWIS 472203):
1. Official surveyor parcel polygons + ORPTS assessment attributes from NY State GeoHub (free, public).
2. OpenStreetMap swimming pools, tennis courts, parks/golf, and named Village streets (free, public).
3. RealtyAPI zoom=15 micro-cell YearBuilt, Sqft, and RealEstimate layers + active/sold MLS listings.
4. Georeferenced zoom=16 aerial orthoimagery mosaic (public/data/bellport-aerial.webp) for Satellite toggle.
"""

import concurrent.futures
import io
import json
import math
import re
import socket
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

# Force IPv4 to avoid unrouted IPv6 socket delays
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_getaddrinfo

REPO_DIR = Path("/home/antigravity/bellport-watch")
SECRETS_PATH = REPO_DIR / ".data" / "secrets.json"
STORE_PATH = REPO_DIR / ".data" / "store.json"
OUT_PARCELS = REPO_DIR / "public" / "data" / "bellport-parcels.json"
OUT_AERIAL = REPO_DIR / "public" / "data" / "bellport-aerial.webp"

MARINA_LAT = 40.7429
MARINA_LON = -72.9377

PROP_CLASS_LABELS = {
    "210": "Single-Family Residence",
    "215": "1-Family w/ Guest Apt",
    "220": "Two-Family Residence",
    "230": "Three-Family Residence",
    "240": "Rural Residence on Acreage",
    "250": "Residential Estate",
    "260": "Seasonal Cottage",
    "270": "Mobile Home",
    "280": "Multi-Structure Compound",
    "281": "Multiple Residences",
    "283": "Res w/ Commercial Use",
    "311": "Vacant Residential Land",
    "312": "Residential Land w/ Barn/Dock",
    "314": "Vacant Rural Lot",
}


def http_get_json(url: str, headers: dict[str, str] | None = None, timeout: int = 20) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BellportWatchGIS/1.0)",
            "Accept": "application/json",
            **(headers or {}),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def normalize_addr_key(addr: str) -> str:
    s = (addr or "").lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r",?\s*bellport(\s+village)?.*$", "", s)
    s = re.sub(r"\broad\b", "rd", s)
    s = re.sub(r"\blane\b", "ln", s)
    s = re.sub(r"\bstreet\b", "st", s)
    s = re.sub(r"\bavenue\b", "ave", s)
    s = re.sub(r"\bdrive\b", "dr", s)
    s = re.sub(r"\bcourt\b", "ct", s)
    s = re.sub(r"\bplace\b", "pl", s)
    s = re.sub(r"\bpoint\b", "pt", s)
    s = re.sub(r"\bsouth\b", "s", s)
    s = re.sub(r"\bnorth\b", "n", s)
    s = re.sub(r"\beast\b", "e", s)
    s = re.sub(r"\bwest\b", "w", s)
    s = re.sub(r"\bmcclean\b", "mclean", s)
    return re.sub(r"[^a-z0-9]", "", s)


def title_case_addr(raw: str) -> str:
    if not raw:
        return "Unnumbered Parcel"
    parts = raw.strip().title().split()
    fixes = {"Ln": "Ln", "Rd": "Rd", "St": "St", "Ave": "Ave", "Dr": "Dr", "Ct": "Ct", "N": "N", "S": "S", "E": "E", "W": "W", "Ii": "II", "Iii": "III"}
    return " ".join(fixes.get(p, p) for p in parts)


def prop_class_label(code: str) -> str:
    c = (code or "").strip()
    if c in PROP_CLASS_LABELS:
        return PROP_CLASS_LABELS[c]
    if c.startswith("2"):
        return "Residential Property"
    if c.startswith("3"):
        return "Vacant Land"
    if c.startswith("4"):
        return "Village Commercial"
    if c.startswith("5"):
        return "Golf / Marina / Club"
    if c.startswith("6"):
        return "Civic / Community"
    if c.startswith("8") or c.startswith("9"):
        return "Park / Waterfront / Utility"
    return "Village Parcel"


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    if not ring:
        return (-72.939, 40.752)
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return (round(sum(lons) / len(lons), 6), round(sum(lats) / len(lats), 6))


def classify_micro_area(addr: str, lat: float, lon: float) -> str:
    lower = addr.lower()
    if re.search(r"bellport\s+ln|browns\s+ln|academy\s+ln|otis\s+ln|thornhedge|shore\s+rd|rectory|library\s+ln|oak\s+meadow", lower):
        return "Historic Lanes"
    if re.search(r"country\s+club|howells\s+pt|howells\s+point|mooring|fairway|golf|general\s+mclean|kreamer", lower):
        return "Country Club & Golf"
    if re.search(r"circuit|peat\s+hole|bieselin|woodland\s+park|brookside|maple|osborn|new\s+jersey|michigan", lower):
        return "East Lanes & Circuit"
    if lat < 40.7545 and -72.9425 < lon < -72.931:
        return "Historic Lanes"
    if lon <= -72.9425:
        return "Country Club & Golf"
    if lon >= -72.9335:
        return "East Lanes & Circuit"
    return "Village Center"


def walk_minutes_to_marina(lat: float, lon: float) -> int:
    d_lat = (lat - MARINA_LAT) * 69.0
    d_lon = (lon - MARINA_LON) * 52.3
    lane_miles = math.hypot(d_lat, d_lon) * 1.28
    return max(1, round((lane_miles / 3.0) * 60))


def fetch_all_nys_bellport_parcels() -> list[dict]:
    base = "https://nysgeohub.ny.gov/arcgis/rest/services/Parcels/NYS_Tax_Parcels_Public/FeatureServer/1/query"
    features: list[dict] = []
    offset = 0
    while True:
        params = urllib.parse.urlencode(
            {
                "where": "MUNI_NAME='Bellport'",
                "outFields": "OBJECTID,PARCEL_ADDR,PRINT_KEY,SBL,SWIS,PROP_CLASS,LAND_AV,TOTAL_AV,FULL_MARKET_VAL,YR_BLT,FRONT,DEPTH,ACRES,CALC_ACRES,BLDG_STYLE_DESC,SQFT_LIVING,NBR_BEDROOMS,NBR_FULL_BATHS,PRIMARY_OWNER,MAIL_CITY,MAIL_STATE,OWNER_TYPE",
                "outSR": "4326",
                "resultOffset": str(offset),
                "resultRecordCount": "1000",
                "f": "geojson",
            }
        )
        data = http_get_json(f"{base}?{params}", timeout=30)
        batch = data.get("features") or []
        features.extend(batch)
        print(f"Fetched {len(batch)} NYS GeoHub parcels (total {len(features)})...")
        if len(batch) < 1000:
            break
        offset += len(batch)
    return features


def fetch_tiger_bellport_streets() -> list[dict]:
    base = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/8/query"
    params = urllib.parse.urlencode(
        {
            "geometry": "-72.9605,40.7395,-72.9245,40.7675",
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "outSR": "4326",
            "outFields": "NAME,BASENAME",
            "resultRecordCount": "500",
            "f": "geojson",
        }
    )
    data = http_get_json(f"{base}?{params}", timeout=20)
    streets_by_name: dict[str, list[list[list[float]]]] = {}
    for feat in data.get("features") or []:
        props = feat.get("properties") or {}
        raw_name = (props.get("NAME") or "").strip()
        if not raw_name:
            continue
        name = "Main St (S Country Rd)" if raw_name == "Co Rd 36" else raw_name
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if gtype == "LineString" and coords:
            streets_by_name.setdefault(name, []).append([[round(p[0], 5), round(p[1], 5)] for p in coords])
        elif gtype == "MultiLineString":
            for seg in coords:
                if seg:
                    streets_by_name.setdefault(name, []).append([[round(p[0], 5), round(p[1], 5)] for p in seg])

    streets = [{"name": k, "segments": v} for k, v in streets_by_name.items()]
    print(f"TIGERweb extracted: {len(streets)} named Bellport streets.")
    return streets


def fetch_realty_layers_and_sold(api_key: str) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    cache_path = REPO_DIR / ".data" / "gis-layers-cache.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        print("Loaded RealtyAPI mapLayers + Sold archive from .data/gis-layers-cache.json (0 credits)!")
        return cached["yb"], cached["sqft"], cached["est"], cached["sold"]

    headers = {"x-realtyapi-key": api_key, "Connection": "close"}

    def fetch_layer(layer_name: str) -> list[dict]:
        u = "https://realtor.realtyapi.io/mapLayer?" + urllib.parse.urlencode(
            {"layer": layer_name, "location": "Bellport village, NY", "zoom": "15"}
        )
        res = http_get_json(u, headers=headers, timeout=15)
        pts = res.get("data") or []
        print(f"RealtyAPI mapLayer {layer_name}: {len(pts)} cells")
        return pts

    yb_cells = fetch_layer("YearBuilt")
    sqft_cells = fetch_layer("Sqft")
    est_cells = fetch_layer("Estimate")

    poly = "-72.9615 40.7685,-72.9225 40.7685,-72.9225 40.7385,-72.9615 40.7385,-72.9615 40.7685"
    u_sold = "https://realtor.realtyapi.io/search/bypolygon?" + urllib.parse.urlencode(
        {
            "polygon": poly,
            "searchType": "Sold",
            "propertyType": "House,Condo,Townhome,Multi_Family",
            "resultCount": "100",
            "sortOrder": "Most_Recently_Sold",
            "includeTax": "true",
        }
    )
    sold_res = http_get_json(u_sold, headers=headers, timeout=15)
    sold_cards = sold_res.get("searchResults") or []
    print(f"RealtyAPI Sold archive: {len(sold_cards)} closed records")

    cache_path.write_text(
        json.dumps({"yb": yb_cells, "sqft": sqft_cells, "est": est_cells, "sold": sold_cards}),
        encoding="utf-8",
    )
    return yb_cells, sqft_cells, est_cells, sold_cards


def tile_lon_edges(x: int, z: int) -> tuple[float, float]:
    n = 2.0 ** z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    return west, east


def tile_lat_edges(y: int, z: int) -> tuple[float, float]:
    n = 2.0 ** z
    north_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    south_rad = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))
    return math.degrees(south_rad), math.degrees(north_rad)


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2.0 ** z
    xtile = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile


def build_aerial_mosaic(west_req: float, south_req: float, east_req: float, north_req: float) -> tuple[Image.Image, dict]:
    z = 16
    x_min, y_min = lonlat_to_tile(west_req, north_req, z)
    x_max, y_max = lonlat_to_tile(east_req, south_req, z)

    cols = x_max - x_min + 1
    rows = y_max - y_min + 1
    canvas = Image.new("RGB", (cols * 256, rows * 256), (218, 228, 236))

    coords = [(x, y) for y in range(y_min, y_max + 1) for x in range(x_min, x_max + 1)]
    print(f"Downloading {len(coords)} zoom={z} aerial ortho tiles ({cols}x{rows})...")

    def dl_tile(xy: tuple[int, int]) -> tuple[int, int, bytes | None]:
        tx, ty = xy
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{ty}/{tx}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Connection": "close"})
            with urllib.request.urlopen(req, timeout=6) as r:
                return (tx, ty, r.read())
        except Exception:
            return (tx, ty, None)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for tx, ty, raw in pool.map(dl_tile, coords):
            if raw:
                with Image.open(io.BytesIO(raw)) as tile_im:
                    canvas.paste(tile_im.convert("RGB"), ((tx - x_min) * 256, (ty - y_min) * 256))

    west_edge, _ = tile_lon_edges(x_min, z)
    _, east_edge = tile_lon_edges(x_max, z)
    _, north_edge = tile_lat_edges(y_min, z)
    south_edge, _ = tile_lat_edges(y_max, z)

    scale = min(1.0, 1360 / canvas.width)
    resized = canvas.resize((int(canvas.width * scale), int(canvas.height * scale)), Image.Resampling.LANCZOS)
    OUT_AERIAL.parent.mkdir(parents=True, exist_ok=True)
    resized.save(OUT_AERIAL, format="WEBP", quality=75, method=5)
    print(f"Saved aerial mosaic {OUT_AERIAL.name}: {OUT_AERIAL.stat().st_size / 1024:.1f} KB ({resized.width}x{resized.height})")

    bounds = {
        "west": round(west_edge, 6),
        "south": round(south_edge, 6),
        "east": round(east_edge, 6),
        "north": round(north_edge, 6),
        "z": z,
    }
    return canvas, bounds


def detect_aerial_pool_in_ring(
    ring: list[list[float]],
    mosaic: Image.Image,
    bounds: dict,
    is_waterfront: bool,
) -> bool:
    if is_waterfront:
        return False
    w, h = mosaic.size
    west, east = bounds["west"], bounds["east"]
    south, north = bounds["south"], bounds["north"]

    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    x0 = max(0, int((min_lon - west) / (east - west) * w))
    x1 = min(w - 1, int((max_lon - west) / (east - west) * w))
    y0 = max(0, int((north - max_lat) / (north - south) * h))
    y1 = min(h - 1, int((north - min_lat) / (north - south) * h))

    if x1 - x0 < 5 or y1 - y0 < 5:
        return False

    aqua_count = 0
    pix = mosaic.load()
    for py in range(y0 + 2, y1 - 1, 2):
        lat = north - (py / h) * (north - south)
        for px in range(x0 + 2, x1 - 1, 2):
            r, g, b = pix[px, py]
            # Gunite aqua/cerulean pool water or royal-blue summer cover spectral signature
            if b >= 122 and (b - r) >= 28 and (g - r) >= 14 and r <= 155:
                lon = west + (px / w) * (east - west)
                if point_in_ring(lon, lat, ring):
                    aqua_count += 1
                    if aqua_count >= 5:
                        return True
    return False


def extract_cell_metric(cell: dict, candidates: tuple[str, ...]):
    for k in candidates:
        v = cell.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return v
    # Fallback: pick any non-coordinate, non-count numeric attribute
    for k, v in cell.items():
        if k not in ("lat", "lng", "lon", "count", "property_count") and isinstance(v, (int, float)) and v > 0:
            return v
    return None


def nearest_cell_val(lat: float, lon: float, cells: list[dict], candidates: tuple[str, ...], max_deg: float = 0.0028):
    best_d2 = max_deg * max_deg
    best_v = None
    for c in cells:
        clat = c.get("lat")
        clon = c.get("lng")
        v = extract_cell_metric(c, candidates)
        if clat is None or clon is None or v is None:
            continue
        d2 = (clat - lat) ** 2 + ((clon - lon) * 0.76) ** 2
        if d2 < best_d2:
            best_d2 = d2
            best_v = v
    return best_v


def main() -> None:
    secrets = json.loads(SECRETS_PATH.read_text(encoding="utf-8"))
    api_key = secrets["REALTYAPI_KEY"]
    store = json.loads(STORE_PATH.read_text(encoding="utf-8"))

    nys_features = fetch_all_nys_bellport_parcels()
    streets = fetch_tiger_bellport_streets()
    yb_cells, sqft_cells, est_cells, sold_cards = fetch_realty_layers_and_sold(api_key)
    if yb_cells:
        print("YearBuilt sample cell:", yb_cells[0])
    if sqft_cells:
        print("Sqft sample cell:", sqft_cells[0])
    if est_cells:
        print("Estimate sample cell:", est_cells[0])

    # Compute overall Village bbox first so we can download the zoom=17 aerial mosaic once
    temp_lons: list[float] = []
    temp_lats: list[float] = []
    for feat in nys_features:
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        gtype = (feat.get("geometry") or {}).get("type")
        rings = [coords[0]] if gtype == "Polygon" and coords else [p[0] for p in coords if p] if gtype == "MultiPolygon" else []
        for r in rings:
            for pt in r:
                temp_lons.append(pt[0])
                temp_lats.append(pt[1])

    bbox = {
        "west": round(min(temp_lons) - 0.0012, 6),
        "south": round(min(temp_lats) - 0.0012, 6),
        "east": round(max(temp_lons) + 0.0012, 6),
        "north": round(max(temp_lats) + 0.0012, 6),
    }

    mosaic_im, aerial_bounds = build_aerial_mosaic(bbox["west"], bbox["south"], bbox["east"], bbox["north"])

    by_addr_listing: dict[str, dict] = {}
    for l in store.get("listings", []):
        by_addr_listing[normalize_addr_key(l["address"])] = l

    sold_by_addr: dict[str, dict] = {}
    for sc in sold_cards:
        a = sc.get("address") or {}
        line = a.get("line") or ""
        if line:
            sold_by_addr[normalize_addr_key(line)] = sc

    parcels_out: list[dict] = []
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

    for feat in nys_features:
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        gtype = geom.get("type")
        coords = geom.get("coordinates") or []
        if not coords:
            continue

        raw_rings: list[list[list[float]]] = []
        if gtype == "Polygon":
            raw_rings = [coords[0]]
        elif gtype == "MultiPolygon":
            raw_rings = [poly[0] for poly in coords if poly]

        clean_rings: list[list[list[float]]] = []
        for r in raw_rings:
            pts: list[list[float]] = []
            for pt in r:
                p5 = [round(pt[0], 5), round(pt[1], 5)]
                if not pts or pts[-1] != p5:
                    pts.append(p5)
            if len(pts) >= 4:
                clean_rings.append(pts)

        if not clean_rings:
            continue

        main_ring = max(clean_rings, key=len)
        clon, clat = ring_centroid(main_ring)

        raw_addr = (props.get("PARCEL_ADDR") or "").strip()
        addr = title_case_addr(raw_addr)
        addr_key = normalize_addr_key(addr)
        prop_class = str(props.get("PROP_CLASS") or "").strip()
        is_res = prop_class.startswith("2")
        acres = round(float(props.get("CALC_ACRES") or props.get("ACRES") or 0.0), 2)
        full_mkt = round(float(props.get("FULL_MARKET_VAL") or 0))
        total_av = round(float(props.get("TOTAL_AV") or 0))
        front_ft = int(props.get("FRONT") or 0)
        depth_ft = int(props.get("DEPTH") or 0)

        owner_raw = (props.get("PRIMARY_OWNER") or "").strip()
        mail_city = (props.get("MAIL_CITY") or "").strip().title()
        mail_state = (props.get("MAIL_STATE") or "").strip().upper()

        is_absentee = bool(
            is_res
            and mail_city
            and not re.search(r"bellport|brookhaven|patchogue", mail_city, re.I)
        )

        matched_listing = by_addr_listing.get(addr_key) if addr_key else None
        matched_sold_card = sold_by_addr.get(addr_key) if addr_key else None

        cell_yb = nearest_cell_val(clat, clon, yb_cells, ("year_built", "yearBuilt", "yr_blt"))
        cell_sqft = nearest_cell_val(clat, clon, sqft_cells, ("sqft", "living_area", "size"))
        cell_est = nearest_cell_val(clat, clon, est_cells, ("estimate", "price", "value", "avm"))

        year_built = (
            (matched_listing.get("yearBuilt") if matched_listing else None)
            or (matched_sold_card.get("year_built") if matched_sold_card else None)
            or props.get("YR_BLT")
            or (int(round(cell_yb)) if cell_yb else None)
        )
        sqft = (
            (matched_listing.get("sqft") if matched_listing and matched_listing.get("sqft") else None)
            or (matched_sold_card.get("sqft") if matched_sold_card and matched_sold_card.get("sqft") else None)
            or (int(round(props["SQFT_LIVING"])) if props.get("SQFT_LIVING") else None)
            or (int(round(cell_sqft)) if cell_sqft and is_res else None)
        )

        # Calibrate estimated market value cleanly: active price > Realtor AVM blended with parcel size/town value
        if matched_listing:
            est_val = int(matched_listing["price"])
        elif is_res:
            if full_mkt > 100000 and cell_est and cell_est > 100000:
                # Blend parcel-specific Town equalized value (scaled for coastal Village appreciation) with micro-cell Realtor AVM
                est_val = int(round((full_mkt * 1.32 * 0.55 + cell_est * 0.45) / 5000) * 5000)
            elif full_mkt > 100000:
                est_val = int(round((full_mkt * 1.35) / 5000) * 5000)
            elif cell_est:
                est_val = int(round(cell_est / 5000) * 5000)
            else:
                est_val = None
        else:
            est_val = full_mkt if full_mkt > 0 else None

        last_sold_date = None
        last_sold_price = None
        mls_photo_count = 0
        has_mls_pool = False

        if matched_listing:
            mls_photo_count = len(matched_listing.get("photos") or [])
            feats_str = " ".join(matched_listing.get("features") or []).lower()
            has_mls_pool = "pool" in feats_str and "room for pool" not in feats_str
            if matched_listing.get("marketStatus") == "sold":
                last_sold_date = matched_listing.get("listedDate")
                last_sold_price = matched_listing.get("soldPrice") or matched_listing.get("price")

        if matched_sold_card:
            last_sold_date = (matched_sold_card.get("last_sold_date") or last_sold_date or "")[:10] or None
            last_sold_price = matched_sold_card.get("last_sold_price") or last_sold_price
            mls_photo_count = max(mls_photo_count, len(matched_sold_card.get("photos") or []))
            desc_lower = (matched_sold_card.get("description_text") or "").lower()
            if re.search(r"\binground\s+pool\b|\bheated\s+pool\b|\bgunite\s+pool\b|\bswimming\s+pool\b", desc_lower):
                has_mls_pool = True

        min_ring_lat = min(p[1] for p in main_ring)
        is_waterfront = bool(
            min_ring_lat <= 40.7436
            or re.search(r"\bshore\s+rd\b", addr, re.I)
            or (matched_listing and "waterfront" in " ".join(matched_listing.get("features") or []).lower())
        )

        has_aerial_pool = (
            detect_aerial_pool_in_ring(main_ring, mosaic_im, aerial_bounds, is_waterfront)
            if is_res and not has_mls_pool
            else False
        )
        has_pool = bool(has_mls_pool or has_aerial_pool)

        area = classify_micro_area(addr, clat, clon)
        walk_min = walk_minutes_to_marina(clat, clon)
        is_historic_lane = area == "Historic Lanes"

        is_for_sale = bool(matched_listing and matched_listing.get("marketStatus") == "active")
        is_sold_3yr = bool(last_sold_date and last_sold_date >= "2023-11-25")
        is_built_3yr = bool(is_res and year_built and year_built >= 2023)

        if is_for_sale:
            category = "for_sale"
        elif is_built_3yr:
            category = "built_3yr"
        elif is_sold_3yr:
            category = "sold_3yr"
        else:
            category = "other"

        counts[category] += 1
        if has_pool:
            counts["pools"] += 1
        if is_absentee:
            counts["absentee"] += 1
        if is_waterfront and is_res:
            counts["waterfront"] += 1

        raw_beds = (
            (matched_listing.get("beds") if matched_listing else None)
            or (matched_sold_card.get("beds") if matched_sold_card else None)
        )
        confirmed_beds = int(raw_beds) if raw_beds is not None and str(raw_beds).isdigit() else None
        raw_baths = (
            (matched_listing.get("baths") if matched_listing else None)
            or (matched_sold_card.get("baths") if matched_sold_card else None)
        )
        confirmed_baths = float(str(raw_baths).replace("+", "")) if raw_baths not in (None, "") else None

        is_est_4br = bool(
            is_res
            and (
                (confirmed_beds is not None and confirmed_beds >= 4)
                or (confirmed_beds is None and sqft is not None and sqft >= 2350)
            )
        )

        if is_est_4br and not is_sold_3yr and not is_for_sale and est_val and est_val < 3000000:
            counts["est4br_prospects"] += 1

        sbl = str(props.get("PRINT_KEY") or props.get("SBL") or props.get("OBJECTID"))
        pid = f"p-{props.get('OBJECTID')}"

        parcel_record = {
            "id": pid,
            "sbl": sbl,
            "addr": addr,
            "area": area,
            "cat": category,
            "cls": prop_class,
            "clsLabel": prop_class_label(prop_class),
            "res": is_res,
            "lat": round(clat, 5),
            "lon": round(clon, 5),
            "acres": acres,
            "front": front_ft,
            "depth": depth_ft,
            "beds": confirmed_beds,
            "baths": confirmed_baths,
            "est4br": is_est_4br,
            "yr": year_built,
            "sqft": sqft,
            "val": est_val,
            "mktVal": full_mkt,
            "av": total_av,
            "walkMin": walk_min,
            "owner": owner_raw.title() if owner_raw else None,
            "mail": f"{mail_city}, {mail_state}".strip(", ") if (mail_city or mail_state) else None,
            "absentee": is_absentee,
            "pool": has_pool,
            "waterfront": is_waterfront,
            "historic": is_historic_lane,
            "built3yr": is_built_3yr,
            "sold3yr": is_sold_3yr,
            "soldDate": last_sold_date,
            "soldPrice": last_sold_price,
            "listingId": matched_listing["id"] if matched_listing else None,
            "mlsPhotos": mls_photo_count,
            "rings": clean_rings,
        }
        if matched_sold_card and not matched_listing:
            parcel_record["pastRemarks"] = (matched_sold_card.get("description_text") or "")[:500] or None
            parcel_record["sourceUrl"] = matched_sold_card.get("href")

        parcels_out.append(parcel_record)

    bundle = {
        "generatedAt": "2026-11-25T16:15:00Z",
        "municipality": "Incorporated Village of Bellport, NY (SWIS 472203)",
        "totalParcels": len(parcels_out),
        "counts": counts,
        "bbox": bbox,
        "aerialBounds": aerial_bounds,
        "streets": streets,
        "parcels": parcels_out,
    }

    OUT_PARCELS.parent.mkdir(parents=True, exist_ok=True)
    OUT_PARCELS.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_PARCELS.name}: {OUT_PARCELS.stat().st_size / 1024:.1f} KB")
    print("Category & feature summary:", json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
