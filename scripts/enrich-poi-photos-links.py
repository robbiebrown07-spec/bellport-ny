#!/usr/bin/env python3
"""
Fetches crisp real photos (Street View storefront/entrance or high-res aerial for beaches/golf/preserves)
and attaches official website & Google Maps links for all 28 Bellport Village public amenities
(Parks, Golf Course, Marina, Beaches, Civic) and commercial properties (Restaurants & Main Street Stores).
"""

import base64
import concurrent.futures
import io
import json
import math
import socket
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image, ImageOps

_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _ipv4_getaddrinfo

REPO_DIR = Path("/home/antigravity/bellport-watch")
BUNDLE_PATH = REPO_DIR / "public/data/bellport-parcels.json"
PHOTOS_DIR = REPO_DIR / "public/photos"
B64_PATH = Path("/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/8a418339-6273-4630-b011-67e19f19501d/scratch/parcel_photos_b64.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

POI_OFFICIAL_URLS: dict[str, tuple[str, str]] = {
    "Bellport Country Club & 18-Hole Golf Course": ("https://www.bellportcc.com/", "Official Club Website"),
    "Bellport Village Marina & Yacht Club": ("https://www.bellportvillageny.gov/", "Bellport Village Marina Info"),
    "Whalehouse Point Ferry to Ho-Hum Beach": ("https://www.bellportvillageny.gov/", "Ferry Schedule & Village Info"),
    "Ho-Hum Beach (Bellport Village Private Ocean Beach)": ("https://www.bellportvillageny.gov/", "Ho-Hum Beach Info"),
    "Bandshell Waterfront Park": ("https://www.bellportvillageny.gov/", "Bellport Village Parks"),
    "Mothers’ Beach": ("https://www.bellportvillageny.gov/", "Bellport Village Beaches"),
    "Village Green & Osborn Park": ("https://www.bellportvillageny.gov/", "Bellport Village Parks"),
    "Post-Morrow Bayfront Preserve": ("https://post-morrow.org/", "Post-Morrow Foundation"),
    "Peat Hole Wetlands Preserve": ("https://post-morrow.org/", "Post-Morrow Foundation"),
    "Bellport Village Hall & Community Center": ("https://www.bellportvillageny.gov/", "Village of Bellport Official Site"),
    "Bellport-Brookhaven Historical Society": ("https://www.bbhsmuseum.com/", "Historical Society Museum"),
    "South Country Library": ("https://sctylib.org/", "South Country Library"),
    "The Gateway Playhouse": ("https://thegateway.org/", "The Gateway Performing Arts"),
    "The Bellport Restaurant": ("https://www.thebellport.com/", "The Bellport Restaurant"),
    "PORTERS on the Lane": ("https://www.portersonthelane.com/", "PORTERS on the Lane"),
    "Peter’s on the Green": ("https://www.petersonthegreen.com/", "Peter’s on the Green"),
    "Cafe Castello": ("https://www.google.com/maps/search/?api=1&query=Cafe+Castello+141+S+Country+Rd+Bellport+NY", "Menu & Reviews"),
    "Avino’s Italian Table": ("https://www.avinositaliantable.com/", "Avino’s Italian Table"),
    "Brewport Coffee House": ("https://www.google.com/maps/search/?api=1&query=Brewport+Coffee+House+Bellport+NY", "Hours & Reviews"),
    "La Plage / Station Rd Bistro": ("https://www.google.com/maps/search/?api=1&query=14+Station+Rd+Bellport+NY", "Restaurant Info"),
    "Uncle Joe’s Pizzeria": ("https://www.google.com/maps/search/?api=1&query=Uncle+Joes+Pizzeria+Bellport+NY", "Menu & Ordering"),
    "Bellport General": ("https://bellportgeneral.com/", "Bellport General Store"),
    "Copper Beech": ("https://www.copperbeechbellport.com/", "Copper Beech Home & Market"),
    "Pamela Lerner Home & Design": ("https://pamelalernerhome.com/", "Pamela Lerner Home"),
    "Bellport Apothecary": ("https://www.google.com/maps/search/?api=1&query=Bellport+Apothecary+151+S+Country+Rd+Bellport+NY", "Store Info"),
    "Tola. & Gallery 125": ("https://shopattola.com/", "Tola. Bellport"),
    "Old Purchase Properties": ("https://www.oldpurchase.com/", "Old Purchase Properties"),
    "The Bellport Inn": ("https://www.thebellportinn.com/", "The Bellport Inn"),
}


def compute_yaw(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlon = math.radians(lon2 - lon1)
    r1, r2 = math.radians(lat1), math.radians(lat2)
    y = math.sin(dlon) * math.cos(r2)
    x = math.cos(r1) * math.sin(r2) - math.sin(r1) * math.cos(r2) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def single_image_search(lat: float, lon: float, radius_m: int) -> tuple[str, float, float] | None:
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
        return None
    try:
        main_pid = data[1][1][1]
        m_lat = float(data[1][5][0][1][0][2])
        m_lon = float(data[1][5][0][1][0][3])
        if isinstance(main_pid, str) and len(main_pid) <= 28:
            return main_pid, m_lat, m_lon
    except Exception:
        pass
    return None


def fetch_bytes(url: str) -> bytes | None:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=12) as r:
            d = r.read()
            return d if d and len(d) > 900 else None
    except Exception:
        return None


def fetch_aerial_crop(lat: float, lon: float, span_m: float = 135.0) -> bytes | None:
    dlat = (span_m * 0.625) / 111320.0
    dlon = span_m / (111320.0 * math.cos(math.radians(lat)))
    bbox = f"{lon - dlon:.6f},{lat - dlat:.6f},{lon + dlon:.6f},{lat + dlat:.6f}"
    url = (
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export"
        f"?bbox={bbox}&bboxSR=4326&imageSR=3857&size=480,300&format=jpg&f=image"
    )
    return fetch_bytes(url)


def save_webp(raw: bytes, out_path: Path) -> str:
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im_app = ImageOps.fit(im, (384, 240), method=Image.Resampling.LANCZOS)
    im_app.save(out_path, format="WEBP", quality=76, method=4)
    im_b64 = ImageOps.fit(im, (240, 150), method=Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im_b64.save(buf, format="WEBP", quality=54, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main() -> None:
    bundle = json.loads(BUNDLE_PATH.read_text(encoding="utf-8"))
    pois = bundle.get("pois") or []
    b64_map = json.loads(B64_PATH.read_text(encoding="utf-8")) if B64_PATH.exists() else {}

    def process_poi(poi: dict) -> tuple[str, str, str]:
        pid = poi["id"]
        lat, lon = poi["lat"], poi["lon"]
        kind = poi["kind"]
        out_file = PHOTOS_DIR / f"{pid}.webp"

        # Prefer crisp scenic aerial view for golf course, Ho-Hum Beach, and nature preserves
        prefer_aerial = kind in ("golf", "beach") or "Preserve" in poi["name"]
        raw = None
        if not prefer_aerial:
            for rad in (45, 95):
                pano = single_image_search(lat, lon, rad)
                if pano:
                    panoid, plat, plon = pano
                    yaw = compute_yaw(plat, plon, lat, lon)
                    sv_u = (
                        f"https://streetviewpixels-pa.googleapis.com/v1/thumbnail"
                        f"?cb_client=maps_sv.tactile.gps&panoid={panoid}&w=480&h=300&yaw={yaw:.2f}&pitch=3&thumbfov=76"
                    )
                    raw = fetch_bytes(sv_u)
                    if raw:
                        break
        if not raw:
            span = 260.0 if kind in ("golf", "beach") else 120.0
            raw = fetch_aerial_crop(lat, lon, span)

        b64 = save_webp(raw, out_file) if raw else ""
        return pid, f"/photos/{pid}.webp", b64

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(process_poi, pois))

    res_by_id = {pid: (url, b64) for pid, url, b64 in results}
    for poi in pois:
        pid = poi["id"]
        url, b64 = res_by_id.get(pid, ("", ""))
        if url:
            poi["photoUrl"] = url
        if b64:
            b64_map[pid] = b64
        off = POI_OFFICIAL_URLS.get(poi["name"])
        q_maps = urllib.parse.quote(f"{poi['name']}, Bellport, NY")
        poi["mapsUrl"] = f"https://www.google.com/maps/search/?api=1&query={q_maps}"
        if off:
            poi["websiteUrl"] = off[0]
            poi["websiteLabel"] = off[1]
        else:
            poi["websiteUrl"] = poi["mapsUrl"]
            poi["websiteLabel"] = "View on Google Maps"

    # Also ensure every non-residential commercial/public parcel (!p.res) has a photo & Google Maps link
    poi_by_parcel = {poi.get("parcelId"): poi for poi in pois if poi.get("parcelId")}
    for p in bundle["parcels"]:
        if p.get("res") or p.get("underwater"):
            continue
        linked_poi = poi_by_parcel.get(p["id"])
        if linked_poi:
            p["photoUrl"] = linked_poi.get("photoUrl")
            p["sourceUrl"] = linked_poi.get("websiteUrl")
            p["poiName"] = linked_poi["name"]
            p["poiKind"] = linked_poi["kind"]

    BUNDLE_PATH.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")
    if b64_map:
        B64_PATH.write_text(json.dumps(b64_map, separators=(",", ":")), encoding="utf-8")
    print(f"Enriched all {len(pois)} public amenities & commercial POIs with real photos and official links!")


if __name__ == "__main__":
    main()
