#!/usr/bin/env python3
"""
Enriches public/data/bellport-parcels.json with:
1. Fire Island barrier-island shoreline polygons across Bellport Bay & Old Inlet
2. Ho-Hum Beach (Bellport Village's private oceanfront beach & dock on Fire Island)
3. The Whalehouse Point Ferry route connecting Bellport Village Marina to Ho-Hum Beach Dock
4. Wide-bay satellite orthoimagery underlay (public/data/bellport-bay-aerial.webp, z=14) so zooming out
   in Satellite View seamlessly displays Bellport Bay, Fire Island dunes, Old Inlet, and the Atlantic Ocean.
"""

import concurrent.futures
import io
import json
import math
import socket
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_getaddrinfo

REPO_DIR = Path("/home/antigravity/bellport-watch")
BUNDLE_PATH = REPO_DIR / "public/data/bellport-parcels.json"
BAY_AERIAL_PATH = REPO_DIR / "public/data/bellport-bay-aerial.webp"


def nom_search(q: str) -> list[dict]:
    u = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "polygon_geojson": "1", "limit": "6"}
    )
    req = urllib.request.Request(u, headers={"User-Agent": "BellportWatchGIS/1.0"})
    with urllib.request.urlopen(req, timeout=18) as r:
        return json.loads(r.read().decode("utf-8"))


def simplify_ring(ring: list[list[float]], min_dist: float = 0.00035) -> list[list[float]]:
    out: list[list[float]] = []
    for lon, lat in ring:
        if not out or math.hypot(lon - out[-1][0], lat - out[-1][1]) >= min_dist:
            out.append([round(lon, 5), round(lat, 5)])
    if len(out) >= 3 and out[0] != out[-1]:
        out.append(out[0])
    return out


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    xtile = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile


def tile_to_lonlat(xtile: int, ytile: int, z: int) -> tuple[float, float]:
    n = 2**z
    lon = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat = math.degrees(lat_rad)
    return lon, lat


def build_bay_aerial() -> dict:
    z = 14
    west_target, east_target = -72.988, -72.895
    south_target, north_target = 40.702, 40.770
    x0, y0 = lonlat_to_tile(west_target, north_target, z)
    x1, y1 = lonlat_to_tile(east_target, south_target, z)

    cols = x1 - x0 + 1
    rows = y1 - y0 + 1
    canvas = Image.new("RGB", (cols * 256, rows * 256))

    coords = [(tx, ty) for ty in range(y0, y1 + 1) for tx in range(x0, x1 + 1)]

    def fetch_tile(tc: tuple[int, int]) -> tuple[int, int, Image.Image]:
        tx, ty = tc
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{ty}/{tx}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            im = Image.open(io.BytesIO(r.read())).convert("RGB")
        return tx, ty, im

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for tx, ty, im in ex.map(fetch_tile, coords):
            canvas.paste(im, ((tx - x0) * 256, (ty - y0) * 256))

    west, north = tile_to_lonlat(x0, y0, z)
    east, south = tile_to_lonlat(x1 + 1, y1 + 1, z)
    # Resize slightly to keep wide-bay underlay super crisp and compact (~100-140 KB)
    w_out = min(1152, canvas.width)
    h_out = round(canvas.height * (w_out / canvas.width))
    resized = canvas.resize((w_out, h_out), Image.Resampling.LANCZOS)
    resized.save(BAY_AERIAL_PATH, "WEBP", quality=78, method=6)
    print(f"Saved {BAY_AERIAL_PATH} ({w_out}x{h_out}, {BAY_AERIAL_PATH.stat().st_size // 1024} KB)")
    return {
        "west": round(west, 6),
        "south": round(south, 6),
        "east": round(east, 6),
        "north": round(north, 6),
        "z": z,
    }


def main() -> None:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))

    # Fetch Fire Island barrier beach polygons (both West of Old Inlet & East/Smith Point side)
    fi_rings: list[list[list[float]]] = []
    for q in ["Fire Island, Village of Bellport, NY", "Fire Island, Town of Brookhaven, NY", "Otis Pike Fire Island High Dune Wilderness, NY"]:
        for r in nom_search(q):
            gj = r.get("geojson") or {}
            polys = [gj["coordinates"]] if gj.get("type") == "Polygon" else (gj.get("coordinates") or []) if gj.get("type") == "MultiPolygon" else []
            for poly in polys:
                ring = poly[0]
                # Keep rings intersecting our Bellport Bay / Fire Island window (-73.03 .. -72.86, 40.69 .. 40.745)
                in_win = [pt for pt in ring if -73.03 <= pt[0] <= -72.86 and 40.69 <= pt[1] <= 40.745]
                if len(in_win) >= 6:
                    # Clip longitudes gently so huge 30-mile Fire Island polygon stays neat around Bellport Bay
                    clipped = [
                        [max(-73.025, min(-72.865, pt[0])), pt[1]]
                        for pt in ring
                        if -73.04 <= pt[0] <= -72.85 and 40.68 <= pt[1] <= 40.75
                    ]
                    simp = simplify_ring(clipped, 0.00035)
                    if len(simp) >= 6:
                        fi_rings.append(simp)

    # Deduplicate overlapping Fire Island rings by centroid
    dedup_fi: list[list[list[float]]] = []
    for r in fi_rings:
        cx = sum(p[0] for p in r) / len(r)
        cy = sum(p[1] for p in r) / len(r)
        if not any(math.hypot(cx - sum(q[0] for q in d) / len(d), cy - sum(q[1] for q in d) / len(d)) < 0.004 for d in dedup_fi):
            dedup_fi.append(r)

    # Ho-Hum Beach exact Village oceanfront beach zone (40.7124..40.7166, -72.9310..-72.9225 along Fire Island)
    hh_rings: list[list[list[float]]] = []
    for r in nom_search("Ho-Hum Beach, Village of Bellport, NY"):
        if "40.71" in str(r.get("lat", "")):
            gj = r.get("geojson") or {}
            if gj.get("type") == "Polygon":
                hh_rings.append([[round(p[0], 5), round(p[1], 5)] for p in gj["coordinates"][0]])
                break

    # Expand/ensure the full Village-owned Ho-Hum Beach oceanfront & bay dock stretch is clearly visible when zoomed out
    ho_hum_beach_zone = [
        [-72.9308, 40.7155],
        [-72.9222, 40.7173],
        [-72.9212, 40.7140],
        [-72.9298, 40.7121],
        [-72.9308, 40.7155],
    ]
    if hh_rings:
        hh_rings.insert(0, ho_hum_beach_zone)
    else:
        hh_rings = [ho_hum_beach_zone]

    # Whalehouse Point Ferry Route: Bellport Village Marina Dock -> Bellport Bay Channel -> Ho-Hum Beach Dock
    ferry_route = {
        "name": "Whalehouse Point Ferry (Residents & Guests)",
        "durationText": "~20 min across Bellport Bay",
        "northDock": {"name": "Bellport Village Marina", "lon": -72.9377, "lat": 40.7429},
        "southDock": {"name": "Ho-Hum Beach Ferry Dock", "lon": -72.9259, "lat": 40.7161},
        "waypoints": [
            [-72.9377, 40.7429],
            [-72.9368, 40.7392],
            [-72.9344, 40.7330],
            [-72.9312, 40.7262],
            [-72.9281, 40.7204],
            [-72.9259, 40.7161],
        ],
    }

    # Add Ho-Hum Beach as a clickable Village POI too if not already present
    pois = [p for p in bundle.get("pois", []) if p.get("id") != "poi-ho-hum-beach"]
    pois.append(
        {
            "id": "poi-ho-hum-beach",
            "name": "Ho-Hum Beach (Bellport Village Private Ocean Beach)",
            "kind": "beach",
            "lon": -72.9260,
            "lat": 40.7146,
            "addr": "Fire Island · Via Whalehouse Point Ferry from Village Marina",
            "desc": "Incorporated Bellport Village's private oceanfront barrier-island beach on Fire Island, served exclusively by the Village's Whalehouse Point passenger ferry from Bellport Marina (~20 min crossing).",
            "parcelId": None,
        }
    )
    bundle["pois"] = pois
    bundle["fireIslandRings"] = dedup_fi
    bundle["hoHumBeachRings"] = hh_rings
    bundle["ferryRoute"] = ferry_route
    bundle["bayAerialBounds"] = build_bay_aerial()

    BUNDLE_PATH.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    print(f"Updated {BUNDLE_PATH} with {len(dedup_fi)} Fire Island rings, Ho-Hum Beach zone, Whalehouse Point Ferry route, and bayAerialBounds!")


if __name__ == "__main__":
    main()
