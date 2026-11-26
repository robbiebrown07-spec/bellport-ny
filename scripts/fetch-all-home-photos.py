#!/usr/bin/env python3
"""
Harvest real photographs for all 1,058 residential homes in Incorporated Bellport Village:
  1. Active & Past Sold MLS listing exterior photos (via RealtyAPI bulk polygon search + existing store).
  2. Google Street View camera pointed directly at each home's main building footprint centroid
     from the front curb of its own street (SingleImageSearch + streetviewpixels thumbnail).
  3. High-res aerial fallback for any secluded bayfront/private-driveway estate >150m from public Street View.

Outputs:
  - public/photos/<parcel_id>.webp (384x240 crisp WebP for React full-stack app)
  - Updates public/data/bellport-parcels.json with photoSource ('mls' | 'streetview' | 'aerial') & photoUrl
  - Generates scratch/parcel_photos_b64.json (compact 256x160 WebP data URIs for standalone Bellport_Watch.html)
"""

import base64
import concurrent.futures
import io
import json
import math
import os
import re
import socket
import time
import urllib.parse
import urllib.request
from PIL import Image, ImageOps

# Force IPv4 to prevent IPv6 socket timeouts
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_getaddrinfo

ROOT = "/home/antigravity/bellport-watch"
SCRATCH = "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/8a418339-6273-4630-b011-67e19f19501d/scratch"
PARCELS_PATH = os.path.join(ROOT, "public/data/bellport-parcels.json")
SEED_LISTINGS_PATH = os.path.join(ROOT, "public/data/seed-listings.json")
STORE_PATH = os.path.join(ROOT, ".data/store.json")
SECRETS_PATH = os.path.join(ROOT, ".data/secrets.json")
SYNC_META_PATH = os.path.join(ROOT, ".data/sync-meta.json")
SOLD_CACHE_PATH = os.path.join(ROOT, ".data/sold-polygon-cache.json")
PHOTOS_DIR = os.path.join(ROOT, "public/photos")
SV_META_CACHE_PATH = os.path.join(ROOT, ".data/sv-meta-cache.json")
B64_OUT_PATH = os.path.join(SCRATCH, "parcel_photos_b64.json")

os.makedirs(PHOTOS_DIR, exist_ok=True)
os.makedirs(SCRATCH, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

BELLPORT_POLYGON = "-72.9615 40.7685,-72.9225 40.7685,-72.9225 40.7385,-72.9615 40.7385,-72.9615 40.7685"


def norm_addr(addr: str) -> str:
    if not addr:
        return ""
    s = addr.lower().strip()
    s = re.sub(r"\(.*?\)", "", s)
    s = s.split(",")[0].strip()
    repls = [
        (r"\bsouth\b", "s"), (r"\bnorth\b", "n"), (r"\beast\b", "e"), (r"\bwest\b", "w"),
        (r"\bso\b", "s"), (r"\bno\b", "n"),
        (r"\blane\b", "ln"), (r"\broad\b", "rd"), (r"\bstreet\b", "st"),
        (r"\bavenue\b", "ave"), (r"\bdrive\b", "dr"), (r"\bcourt\b", "ct"),
        (r"\bplace\b", "pl"), (r"\bpoint\b", "pt"), (r"\bcircle\b", "cir"),
        (r"\bterrace\b", "ter"), (r"\bparkway\b", "pkwy"), (r"\bboulevard\b", "blvd"),
        (r"\bhighway\b", "hwy"),
    ]
    for pat, rep in repls:
        s = re.sub(pat, rep, s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def norm_street_only(addr_or_street: str) -> str:
    s = re.sub(r"^\d+[a-z-]*\s+", "", (addr_or_street or "").strip(), flags=re.I)
    return norm_addr(s)


def upgrade_rdcpix(u: str) -> str:
    if not u or not isinstance(u, str) or not u.startswith("http"):
        return ""
    u = u.replace("http://", "https://")
    if "rdcpix.com" in u:
        u = re.sub(r"-([a-z0-9]+)s\.jpg$", r"-\1od-w1024_h768_x2.webp", u, flags=re.I)
    return u


def extract_card_photos(card: dict) -> list[str]:
    out = []
    seen = set()
    def add(u):
        up = upgrade_rdcpix(u)
        if up and up not in seen:
            seen.add(up)
            out.append(up)

    pp = card.get("primary_photo")
    if isinstance(pp, str):
        add(pp)
    elif isinstance(pp, dict):
        add(pp.get("href") or pp.get("url"))
    add(card.get("photo") or card.get("thumbnail") or card.get("photoUrl"))
    for p in (card.get("photos") or []):
        if isinstance(p, str):
            add(p)
        elif isinstance(p, dict):
            add(p.get("href") or p.get("url") or p.get("src"))
    return out[:10]


def find_result_array(payload) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    hs = data.get("home_search") if isinstance(data.get("home_search"), dict) else (
        payload.get("home_search") if isinstance(payload.get("home_search"), dict) else {}
    )
    for cand in [
        payload.get("searchResults"), data.get("searchResults"),
        hs.get("results"), hs.get("properties"),
        data.get("results"), data.get("properties"), data.get("listings"),
        payload.get("results"), payload.get("properties"), payload.get("listings"),
    ]:
        if isinstance(cand, list):
            return [x for x in cand if isinstance(x, dict)]
    return []


def harvest_mls_photo_catalog() -> list[dict]:
    """Combine active store listings + cached/bulk Sold RealtyAPI polygon results (max 3 credits)."""
    records = []

    # 1. Existing store.json & seed-listings.json
    for path in [STORE_PATH, SEED_LISTINGS_PATH]:
        if os.path.exists(path):
            try:
                raw = json.load(open(path))
                items = raw.get("listings", raw) if isinstance(raw, dict) else raw
                if isinstance(items, list):
                    for it in items:
                        photos = extract_card_photos(it)
                        if photos and it.get("address"):
                            records.append({
                                "address": it.get("address"),
                                "lat": it.get("latitude"),
                                "lon": it.get("longitude"),
                                "photos": photos,
                            })
            except Exception as e:
                print("Warning reading", path, e)

    # 2. Sold polygon cache (or fetch once using 3 credits total)
    sold_cached = []
    if os.path.exists(SOLD_CACHE_PATH):
        try:
            sold_cached = json.load(open(SOLD_CACHE_PATH))
            print(f"Loaded {len(sold_cached)} cached sold MLS photo records.")
        except Exception:
            sold_cached = []

    if not sold_cached and os.path.exists(SECRETS_PATH):
        try:
            sec = json.load(open(SECRETS_PATH))
            api_key = sec.get("REALTYAPI_KEY") or sec.get("realtyApiKey") or sec.get("apiKey") or sec.get("key") or ""
        except Exception:
            api_key = ""

        if api_key:
            seen_ids = set()
            credits_rem = None
            for sort_order in ["Most_Recently_Sold", "Highest_Price", "Lowest_Price"]:
                q = urllib.parse.urlencode({
                    "polygon": BELLPORT_POLYGON,
                    "searchType": "Sold",
                    "propertyType": "House,Condo,Townhome,Multi_Family",
                    "resultCount": "200",
                    "sortOrder": sort_order,
                })
                url = f"https://realtor.realtyapi.io/search/bypolygon?{q}"
                req = urllib.request.Request(url, headers={
                    "x-realtyapi-key": api_key,
                    "Accept": "application/json",
                    "User-Agent": HEADERS["User-Agent"],
                })
                try:
                    with urllib.request.urlopen(req, timeout=20) as resp:
                        rem_hdr = resp.headers.get("x-credits-remaining")
                        if rem_hdr and rem_hdr.isdigit():
                            credits_rem = int(rem_hdr)
                        payload = json.loads(resp.read().decode("utf-8", errors="replace"))
                        arr = find_result_array(payload)
                        print(f"RealtyAPI Sold ({sort_order}): {len(arr)} results (credits left: {credits_rem})")
                        for card in arr:
                            pid = str(card.get("property_id") or card.get("propertyId") or card.get("id") or "")
                            if pid and pid in seen_ids:
                                continue
                            if pid:
                                seen_ids.add(pid)
                            loc = card.get("location") if isinstance(card.get("location"), dict) else {}
                            addr_obj = loc.get("address") if isinstance(loc.get("address"), dict) else (
                                card.get("address") if isinstance(card.get("address"), dict) else {}
                            )
                            line = (
                                addr_obj.get("line")
                                or card.get("street_address")
                                or (card.get("address") if isinstance(card.get("address"), str) else "")
                                or ""
                            )
                            coord = addr_obj.get("coordinate") if isinstance(addr_obj.get("coordinate"), dict) else (
                                loc.get("coordinate") if isinstance(loc.get("coordinate"), dict) else {}
                            )
                            lat = coord.get("lat") or card.get("latitude") or card.get("lat")
                            lon = coord.get("lon") or coord.get("lng") or card.get("longitude") or card.get("lon")
                            photos = extract_card_photos(card)
                            if line and photos:
                                sold_cached.append({
                                    "address": line,
                                    "lat": float(lat) if isinstance(lat, (int, float)) else None,
                                    "lon": float(lon) if isinstance(lon, (int, float)) else None,
                                    "photos": photos,
                                })
                except Exception as e:
                    print(f"Sold polygon query ({sort_order}) error:", e)

            if sold_cached:
                with open(SOLD_CACHE_PATH, "w") as f:
                    json.dump(sold_cached, f, indent=2)
            if credits_rem is not None and os.path.exists(SYNC_META_PATH):
                try:
                    sm = json.load(open(SYNC_META_PATH))
                    sm["creditsRemaining"] = credits_rem
                    json.dump(sm, open(SYNC_META_PATH, "w"), indent=2)
                except Exception:
                    pass

    records.extend(sold_cached)
    return records


def point_in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def match_mls_to_parcels(parcels: list[dict], mls_records: list[dict]) -> dict[str, list[str]]:
    by_norm_addr: dict[str, list[str]] = {}
    for rec in mls_records:
        na = norm_addr(rec["address"])
        # Alias Main St <-> S Country Rd
        aliases = [na]
        if "main st" in na:
            aliases.append(na.replace("main st", "s country rd"))
        if "s country rd" in na:
            aliases.append(na.replace("s country rd", "main st"))
        for al in aliases:
            if al and al not in by_norm_addr:
                by_norm_addr[al] = rec["photos"]

    matched: dict[str, list[str]] = {}
    for p in parcels:
        if not p.get("res"):
            continue
        raw_existing = p.get("mlsPhotoUrls")
        existing = [upgrade_rdcpix(u) for u in raw_existing if upgrade_rdcpix(u)] if isinstance(raw_existing, list) else []
        na = norm_addr(p.get("addr", ""))
        if na in by_norm_addr:
            photos = by_norm_addr[na]
            matched[p["id"]] = existing + [u for u in photos if u not in existing]
            continue
        if existing:
            matched[p["id"]] = existing
            continue
        # Coordinate inside parcel polygon check when house number matches
        p_num = re.match(r"^(\d+)", (p.get("addr") or "").strip())
        p_num_s = p_num.group(1) if p_num else ""
        for rec in mls_records:
            rlat, rlon = rec.get("lat"), rec.get("lon")
            if rlat is None or rlon is None:
                continue
            if abs(rlat - p["lat"]) > 0.0005 or abs(rlon - p["lon"]) > 0.0006:
                continue
            r_num = re.match(r"^(\d+)", (rec.get("address") or "").strip())
            if p_num_s and r_num and p_num_s != r_num.group(1):
                continue
            if any(point_in_ring(rlon, rlat, ring) for ring in (p.get("rings") or [])):
                matched[p["id"]] = rec["photos"]
                break

    return matched


def main_bldg_target(p: dict) -> tuple[float, float]:
    bldgs = p.get("bldgs") or []
    best_ring = None
    best_area = -1.0
    for b in bldgs:
        ring = b[0] if (isinstance(b, list) and b and isinstance(b[0], list) and isinstance(b[0][0], list)) else b
        if not ring or len(ring) < 3:
            continue
        area = 0.0
        for i in range(len(ring)):
            x1, y1 = ring[i][0], ring[i][1]
            x2, y2 = ring[(i + 1) % len(ring)][0], ring[(i + 1) % len(ring)][1]
            area += x1 * y2 - x2 * y1
        area = abs(area)
        if area > best_area:
            best_area = area
            best_ring = ring
    if best_ring:
        lon = sum(pt[0] for pt in best_ring) / len(best_ring)
        lat = sum(pt[1] for pt in best_ring) / len(best_ring)
        return lat, lon
    return p["lat"], p["lon"]


def build_street_index(streets: list[dict]) -> list[tuple[list[str], list[list[float]]]]:
    idx = []
    for st in streets:
        raw_name = st.get("name") or ""
        parts = [raw_name]
        # Extract parenthetical e.g. Main St (S Country Rd)
        for m in re.findall(r"\(([^)]+)\)", raw_name):
            parts.append(m)
        parts.append(re.sub(r"\([^)]+\)", "", raw_name))
        names = list({norm_street_only("0 " + x) for x in parts if norm_street_only("0 " + x)})
        if "main st" in names and "s country rd" not in names:
            names.append("s country rd")
        if "s country rd" in names and "main st" not in names:
            names.append("main st")
        for seg in (st.get("segments") or []):
            if len(seg) >= 2:
                idx.append((names, seg))
    return idx


def front_curb_point(p: dict, tlat: float, tlon: float, street_idx: list) -> tuple[float, float]:
    pst = norm_street_only(p.get("addr", ""))
    best_pt = None
    best_d2 = 1e9
    cos_lat = math.cos(math.radians(tlat))
    if pst:
        for names, seg in street_idx:
            if any(pst == nm or pst in nm or nm in pst for nm in names):
                for i in range(len(seg) - 1):
                    x1, y1 = seg[i][0], seg[i][1]
                    x2, y2 = seg[i + 1][0], seg[i + 1][1]
                    dx, dy = x2 - x1, y2 - y1
                    l2 = dx * dx + dy * dy
                    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((tlon - x1) * dx + (tlat - y1) * dy) / l2))
                    px, py = x1 + t * dx, y1 + t * dy
                    d2 = ((px - tlon) * cos_lat) ** 2 + (py - tlat) ** 2
                    if d2 < best_d2:
                        best_d2 = d2
                        best_pt = (py, px)
    if best_pt and math.sqrt(best_d2) * 111320.0 < 170.0:
        return best_pt
    return tlat, tlon


def dist_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dy = (lat2 - lat1) * 111320.0
    dx = (lon2 - lon1) * 111320.0 * math.cos(math.radians((lat1 + lat2) * 0.5))
    return math.hypot(dx, dy)


def compute_yaw(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlon = math.radians(lon2 - lon1)
    r1, r2 = math.radians(lat1), math.radians(lat2)
    y = math.sin(dlon) * math.cos(r2)
    x = math.cos(r1) * math.sin(r2) - math.sin(r1) * math.cos(r2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def single_image_search(lat: float, lon: float, radius_m: int) -> list[tuple[str, float, float]]:
    """Returns list of candidate (panoid, pano_lat, pano_lon) including immediate road neighbors."""
    rpc_url = "https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch"
    payload = [
        ["apiv3"],
        [[None, None, lat, lon], radius_m],
        [None, ["en", "US"], None, None, None, None, None, None, [2], None, [[[2, True, 2]]]],
        [[1, 2, 3, 4, 8, 6]],
    ]
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            **HEADERS,
            "Content-Type": "application/json+protobuf",
            "Origin": "https://www.google.com",
            "Referer": "https://www.google.com/",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read().decode("utf-8", errors="replace"))
    if not data or not isinstance(data, list) or data[0][0] != 0:
        return []
    out = []
    try:
        main_pid = data[1][1][1]
        m_lat = data[1][5][0][1][0][2]
        m_lon = data[1][5][0][1][0][3]
        if isinstance(main_pid, str) and len(main_pid) <= 28:
            out.append((main_pid, float(m_lat), float(m_lon)))
    except Exception:
        pass
    # Also parse neighbor panos along the road so we can pick the exact perpendicular vantage point
    try:
        neighbors = data[1][5][0][3][0]
        if isinstance(neighbors, list):
            for nb in neighbors:
                npid = nb[0][1]
                nlat = nb[2][0][2]
                nlon = nb[2][0][3]
                if isinstance(npid, str) and len(npid) <= 28:
                    out.append((npid, float(nlat), float(nlon)))
    except Exception:
        pass
    return out


def fetch_http_bytes(url: str, retries: int = 2) -> bytes | None:
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=12) as r:
                data = r.read()
                if data and len(data) > 900:
                    return data
        except Exception:
            if attempt < retries:
                time.sleep(0.25 * (attempt + 1))
    return None


def fetch_aerial_crop(lat: float, lon: float) -> bytes | None:
    # 72m x 45m high-res Esri World Imagery ortho crop centered on the home
    dlat = 22.5 / 111320.0
    dlon = 36.0 / (111320.0 * math.cos(math.radians(lat)))
    bbox = f"{lon - dlon:.6f},{lat - dlat:.6f},{lon + dlon:.6f},{lat + dlat:.6f}"
    url = (
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
        f"?bbox={bbox}&bboxSR=4326&imageSR=3857&size=480,300&format=jpg&f=image"
    )
    return fetch_http_bytes(url)


def save_webp_variants(raw_bytes: bytes, out_webp_path: str) -> str:
    im = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    # Save 384x240 crisp WebP for full-stack React app
    im_app = ImageOps.fit(im, (384, 240), method=Image.Resampling.LANCZOS)
    im_app.save(out_webp_path, format="WEBP", quality=74, method=4)
    # Return compact 256x160 WebP data URI for standalone Bellport_Watch.html
    im_b64 = ImageOps.fit(im, (256, 160), method=Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im_b64.save(buf, format="WEBP", quality=52, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    t0 = time.time()
    pdata = json.load(open(PARCELS_PATH))
    parcels = pdata["parcels"]
    res_parcels = [p for p in parcels if p.get("res")]
    street_idx = build_street_index(pdata.get("streets") or [])
    print(f"Loaded {len(parcels)} total parcels ({len(res_parcels)} residential homes), {len(street_idx)} street segments.")

    mls_records = harvest_mls_photo_catalog()
    mls_matches = match_mls_to_parcels(res_parcels, mls_records)
    print(f"Matched {len(mls_matches)} Bellport Village homes to real active/past MLS listing photos!")

    sv_cache: dict[str, dict] = {}
    if os.path.exists(SV_META_CACHE_PATH):
        try:
            sv_cache = json.load(open(SV_META_CACHE_PATH))
        except Exception:
            sv_cache = {}

    results_meta: dict[str, tuple[str, str, list[str]]] = {}  # pid -> (source, b64_uri, mls_urls)

    def process_home(p: dict):
        pid = p["id"]
        out_webp = os.path.join(PHOTOS_DIR, f"{pid}.webp")
        mls_urls = mls_matches.get(pid, [])

        # 1. Try MLS exterior listing photo first
        for u in mls_urls[:3]:
            raw = fetch_http_bytes(u)
            if raw:
                try:
                    b64 = save_webp_variants(raw, out_webp)
                    return pid, "mls", b64, mls_urls
                except Exception:
                    pass

        # 2. Google Street View pointed from front street curb -> main building centroid
        tlat, tlon = main_bldg_target(p)
        clat, clon = front_curb_point(p, tlat, tlon, street_idx)

        cached = sv_cache.get(pid)
        best_pano = None
        if cached and cached.get("panoid"):
            best_pano = (cached["panoid"], cached["plat"], cached["plon"])
        else:
            cands = []
            for q_lat, q_lon, rad in [(clat, clon, 60), (tlat, tlon, 100), (tlat, tlon, 155)]:
                try:
                    cands = single_image_search(q_lat, q_lon, rad)
                except Exception:
                    cands = []
                if cands:
                    break
            if cands:
                # Pick panorama closest to front curb point (so we stand directly in front of the house)
                best_pano = min(cands, key=lambda c: dist_meters(c[1], c[2], clat, clon))

        if best_pano:
            panoid, plat, plon = best_pano
            d_m = dist_meters(plat, plon, tlat, tlon)
            yaw = compute_yaw(plat, plon, tlat, tlon)
            if d_m < 22:
                fov, pitch = 82, 4
            elif d_m <= 45:
                fov, pitch = 72, 3
            else:
                fov, pitch = 58, 2
            sv_url = (
                f"https://streetviewpixels-pa.googleapis.com/v1/thumbnail"
                f"?cb_client=maps_sv.tactile.gps&panoid={panoid}&w=480&h=300&yaw={yaw:.2f}&pitch={pitch}&thumbfov={fov}"
            )
            raw = fetch_http_bytes(sv_url)
            if raw:
                try:
                    b64 = save_webp_variants(raw, out_webp)
                    return pid, "streetview", b64, mls_urls, {"panoid": panoid, "plat": plat, "plon": plon, "yaw": round(yaw, 1)}
                except Exception:
                    pass

        # 3. High-res aerial ortho fallback for gated bayfront/private-lane estates >155m from Street View
        raw_aer = fetch_aerial_crop(tlat, tlon)
        if raw_aer:
            b64 = save_webp_variants(raw_aer, out_webp)
            return pid, "aerial", b64, mls_urls, None

        raise RuntimeError(f"Could not obtain any photo for {pid} ({p.get('addr')})")

    b64_map: dict[str, str] = {}
    counts = {"mls": 0, "streetview": 0, "aerial": 0}
    done = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=18) as ex:
        futs = {ex.submit(process_home, p): p for p in res_parcels}
        for fut in concurrent.futures.as_completed(futs):
            res = fut.result()
            pid, src, b64, mls_urls = res[0], res[1], res[2], res[3]
            if len(res) > 4 and res[4]:
                sv_cache[pid] = res[4]
            counts[src] += 1
            b64_map[pid] = b64
            results_meta[pid] = (src, f"/photos/{pid}.webp", mls_urls)
            done += 1
            if done % 150 == 0 or done == len(res_parcels):
                print(f"  Progress: {done}/{len(res_parcels)} ({time.time() - t0:.1f}s) -> {counts}")

    # Save SV metadata cache
    with open(SV_META_CACHE_PATH, "w") as f:
        json.dump(sv_cache, f)

    # Update bellport-parcels.json with photoUrl & photoSource
    for p in parcels:
        pid = p["id"]
        if pid in results_meta:
            src, rel_url, mls_urls = results_meta[pid]
            p["photoUrl"] = rel_url
            p["photoSource"] = src
            if mls_urls:
                p["mlsPhotos"] = max(int(p.get("mlsPhotos") or 0), len(mls_urls))
                p["mlsPhotoUrls"] = mls_urls[:8]

    with open(PARCELS_PATH, "w") as f:
        json.dump(pdata, f, separators=(",", ":"))

    with open(B64_OUT_PATH, "w") as f:
        json.dump(b64_map, f, separators=(",", ":"))

    b64_mb = os.path.getsize(B64_OUT_PATH) / (1024 * 1024)
    print(f"COMPLETE in {time.time() - t0:.1f}s! Counts: {counts}, b64 JSON size: {b64_mb:.2f} MB")


if __name__ == "__main__":
    main()
