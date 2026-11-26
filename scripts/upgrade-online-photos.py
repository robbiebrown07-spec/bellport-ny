#!/usr/bin/env python3
"""
Upgrades Bellport Village residential property photos from Google Street View
to real online MLS / brokerage / seasonal-rental exterior photography wherever
available online, keeping Google Street View strictly as a last-resort fallback.

Sources merged:
  1. Old Purchase Properties (oldpurchase.com — all 256 Bellport brokerage pages)
  2. Existing .data/*.json caches (Redfin 5yr sold, Zillow sold, Realtor sold, store)
  3. Zillow Bellport For-Rent archive + top Bellport Village agents' sold archives
  4. Existing http(s) URLs in p['mlsPhotoUrls'] that had not yet replaced Street View WebPs
"""

import concurrent.futures
import html as html_lib
import io
import json
import math
import os
import re
import socket
import urllib.parse
import urllib.request
from PIL import Image

_orig = socket.getaddrinfo
socket.getaddrinfo = lambda h, p, f=0, t=0, pr=0, fl=0: _orig(h, p, socket.AF_INET, t, pr, fl)

ROOT = "/home/antigravity/bellport-watch"
PARCELS_PATH = os.path.join(ROOT, "public/data/bellport-parcels.json")
SEEDS_PATH = os.path.join(ROOT, "public/data/seed-listings.json")
PHOTOS_DIR = os.path.join(ROOT, "public/photos")
SECRETS_PATH = os.path.join(ROOT, ".data/secrets.json")
SYNC_META_PATH = os.path.join(ROOT, ".data/sync-meta.json")
OPP_CACHE_PATH = os.path.join(ROOT, ".data/oldpurchase-cache.json")
EXTRA_ZILLOW_CACHE = os.path.join(ROOT, ".data/zillow-extra-photos.json")

UA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}


def canon_addr(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r",\s*(bellport|east patchogue|brookhaven|patchogue|ny|us).*$", "", s)
    s = s.replace(".", " ")
    for w, d in [("first", "1st"), ("second", "2nd"), ("third", "3rd"), ("fourth", "4th"), ("fifth", "5th")]:
        s = re.sub(rf"\b{w}\b", d, s)
    for w, a in [
        ("road", "rd"), ("lane", "ln"), ("street", "st"), ("avenue", "ave"),
        ("drive", "dr"), ("boulevard", "blvd"), ("court", "ct"), ("place", "pl"),
        ("point", "pt"), ("circle", "cir"), ("terrace", "ter"), ("parkway", "pkwy"),
        ("south", "s"), ("so", "s"), ("north", "n"), ("no", "n"),
        ("east", "e"), ("west", "w"), ("general", "gen"), ("mcclean", "mclean"),
        ("peat hole", "peathole"), ("thorn hedge", "thornhedge"),
        ("osborne", "osborn"), ("otis ln", "otis ave"),
    ]:
        s = re.sub(rf"\b{w}\b", a, s)
    s = re.sub(r"\b([nsew])\s+\1\b", r"\1", s)
    s = re.sub(r"^(\d+)\s+howells\s+pt\s+([ns])\s+rd\b", r"\1 \2 howells pt rd", s)
    s = re.sub(r"^(\d+)\s+([ns])\s+howells\b(?!\s*pt)", r"\1 \2 howells pt rd", s)
    s = re.sub(r"^(\d+)\s+brewster\s+(?:ln\s+)?([ns])(?:\s+ln)?\b", r"\1 \2 brewster ln", s)
    s = re.sub(r"^(\d+)\s+station\s+rd\s+([ns])\b", r"\1 \2 station rd", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def harvest_old_purchase() -> list[dict]:
    if os.path.exists(OPP_CACHE_PATH):
        return json.load(open(OPP_CACHE_PATH))

    records = []
    try:
        req = urllib.request.Request("https://oldpurchase.com/sitemap-properties-dpages--0.xml", headers=UA_HEADERS)
        xml = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", errors="ignore")
        urls = re.findall(r"<loc>(https://oldpurchase\.com/properties/[^<]+)</loc>", xml)
    except Exception as e:
        print("OPP sitemap err:", e)
        return []

    def fetch_page(u: str):
        try:
            req = urllib.request.Request(u, headers=UA_HEADERS)
            raw = urllib.request.urlopen(req, timeout=8).read().decode("utf-8", errors="ignore")
            # Extract JSON-LD streetAddress (skip office address "126 South Country Road")
            addrs = [
                a.strip()
                for a in re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', raw)
                if "126 south country" not in a.lower()
            ]
            title_m = re.search(r"<title>([^<]+)</title>", raw)
            title_str = html_lib.unescape(title_m.group(1)).split("|")[0].strip() if title_m else ""
            addr = addrs[0] if addrs else (title_str if re.match(r"^\d+\s+[A-Za-z]", title_str) else "")
            if not addr:
                return None

            # Extract Cloudfront high-res gallery images
            cf_imgs = []
            seen = set()
            for m in re.findall(r"https://dlajgvw9htjpb\.cloudfront\.net/cms/[^\s\"'&?)>]+?\.(?:jpg|jpeg|webp|png)", raw, flags=re.I):
                if m not in seen and "logo" not in m.lower():
                    seen.add(m)
                    cf_imgs.append(m)
            if not cf_imgs:
                for m in re.findall(r'property="og:image"\s+content="([^"]+)"', raw):
                    if m.startswith("http") and m not in seen:
                        seen.add(m)
                        cf_imgs.append(m)
            if not cf_imgs:
                return None

            desc_m = re.search(r'property="og:description"\s+content="([^"]+)"', raw)
            desc = html_lib.unescape(desc_m.group(1)).strip() if desc_m else ""
            return {"address": addr, "photos": cf_imgs[:30], "desc": desc, "sourceUrl": u}
        except Exception:
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=14) as ex:
        for res in ex.map(fetch_page, urls):
            if res:
                records.append(res)

    json.dump(records, open(OPP_CACHE_PATH, "w"))
    print(f"Harvested Old Purchase Properties: {len(records)} property galleries from {len(urls)} URLs")
    return records


def harvest_extra_zillow() -> list[dict]:
    if os.path.exists(EXTRA_ZILLOW_CACHE):
        return json.load(open(EXTRA_ZILLOW_CACHE))
    if not os.path.exists(SECRETS_PATH):
        return []

    api_key = json.load(open(SECRETS_PATH)).get("REALTYAPI_KEY")
    if not api_key:
        return []

    hdrs = {"x-realtyapi-key": api_key, "Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    out = []
    credits_left = None

    # 1. Zillow ForRent in Bellport bounds (1 credit — captures summer rental homes with pro photos!)
    try:
        q = urllib.parse.urlencode({
            "westLongitude": "-72.9615",
            "eastLongitude": "-72.9225",
            "southLatitude": "40.7385",
            "northLatitude": "40.7685",
            "listingStatus": "For_Rent",
            "page": "1",
        })
        with urllib.request.urlopen(urllib.request.Request(f"https://zillow.realtyapi.io/search/bymapbounds?{q}", headers=hdrs), timeout=15) as r:
            credits_left = r.headers.get("x-credits-remaining")
            d = json.loads(r.read().decode("utf-8", errors="replace"))
            for it in d.get("searchResults", []):
                out.append(it)
    except Exception as e:
        print("Zillow For_Rent err:", e)

    # 2. Top Bellport agents' sold archives (up to 6 agents = 6 credits -> hundreds of historical sold photos!)
    zuids = []
    for fn in [".data/zillow-agents-bellport.json", ".data/zillow-agents-bellport-p2.json"]:
        p = os.path.join(ROOT, fn)
        if os.path.exists(p):
            for ag in json.load(open(p)).get("agents", []):
                z = ag.get("encodedZuid")
                if z and z not in zuids:
                    zuids.append(z)

    for zuid in zuids[:7]:
        try:
            q = urllib.parse.urlencode({"zuid": zuid, "page": "1"})
            with urllib.request.urlopen(urllib.request.Request(f"https://zillow.realtyapi.io/agent/sold_properties?{q}", headers=hdrs), timeout=15) as r:
                credits_left = r.headers.get("x-credits-remaining")
                d = json.loads(r.read().decode("utf-8", errors="replace"))
                for k, v in d.items():
                    if isinstance(v, list):
                        out.extend(v)
        except Exception:
            pass

    if credits_left is not None and os.path.exists(SYNC_META_PATH):
        meta = json.load(open(SYNC_META_PATH))
        meta["creditsRemaining"] = int(credits_left)
        json.dump(meta, open(SYNC_META_PATH, "w"), indent=2)
        print("Updated RealtyAPI creditsRemaining:", credits_left)

    json.dump(out, open(EXTRA_ZILLOW_CACHE, "w"))
    print("Harvested extra Zillow rental + agent-sold items:", len(out))
    return out


def extract_any_item_photos_and_loc(it: dict):
    if not isinstance(it, dict):
        return None
    # Address
    addr = ""
    raw_a = it.get("address")
    if isinstance(raw_a, str):
        addr = raw_a
    elif isinstance(raw_a, dict):
        addr = raw_a.get("streetAddress") or raw_a.get("line") or ""
    if not addr:
        loc = it.get("location")
        if isinstance(loc, dict) and isinstance(loc.get("address"), dict):
            addr = loc["address"].get("line") or loc["address"].get("streetAddress") or ""
    if not addr:
        addr = it.get("streetLine", {}).get("value", "") if isinstance(it.get("streetLine"), dict) else (it.get("streetLine") or "")

    # Lat/Lon
    lat, lon = it.get("latitude"), it.get("longitude")
    if lat is None and isinstance(it.get("location"), dict):
        lat = it["location"].get("latitude") or (it["location"].get("coordinate", {}) or {}).get("lat")
        lon = it["location"].get("longitude") or (it["location"].get("coordinate", {}) or {}).get("lon")
    if lat is None and isinstance(it.get("latLong"), dict):
        lat = it["latLong"].get("value", {}).get("latitude") if isinstance(it["latLong"].get("value"), dict) else it["latLong"].get("latitude")
        lon = it["latLong"].get("value", {}).get("longitude") if isinstance(it["latLong"].get("value"), dict) else it["latLong"].get("longitude")

    # Photos
    photos = []
    seen = set()

    def add_u(u):
        if not u or not isinstance(u, str) or not u.startswith("http"):
            return
        u = u.replace("http://", "https://")
        if "maps.googleapis.com/maps/api/streetview" in u or "streetviewpixels" in u:
            return
        if "rdcpix.com" in u:
            u = re.sub(r"-([a-z0-9]+)s\.jpg$", r"-\1od.jpg", u, flags=re.I)
        if u not in seen:
            seen.add(u)
            photos.append(u)

    # Walk common photo structures
    add_u(it.get("imgSrc") or it.get("imageUrl") or it.get("hiResImageLink") or it.get("desktopWebHdpImageLink"))
    if isinstance(it.get("media"), dict):
        pl = it["media"].get("propertyPhotoLinks") or {}
        add_u(pl.get("highResolutionLink") or pl.get("mediumSizeLink"))
        for p in (it["media"].get("allPropertyPhotos", {}) or {}).get("highResolution", []) or []:
            add_u(p)
    for k in ["photos", "carouselPhotos", "carouselPhotosComposable", "photoUrls"]:
        val = it.get(k)
        if isinstance(val, list):
            for p in val:
                if isinstance(p, str):
                    add_u(p)
                elif isinstance(p, dict):
                    add_u(p.get("url") or p.get("href") or p.get("src") or p.get("photoUrl"))
        elif isinstance(val, dict) and isinstance(val.get("photoData"), list):
            base = val.get("baseUrl", "")
            for pd in val["photoData"]:
                pk = pd.get("photoKey")
                if pk and "{photoKey}" in base:
                    add_u(base.replace("{photoKey}", pk))
    if isinstance(it.get("primary_photo"), dict):
        add_u(it["primary_photo"].get("href"))

    if not photos:
        return None
    return {"addr": addr, "lat": float(lat) if lat else None, "lon": float(lon) if lon else None, "photos": photos[:40]}


def main():
    bundle = json.load(open(PARCELS_PATH))
    seeds = {l["id"]: l for l in json.load(open(SEEDS_PATH))}
    res_parcels = [p for p in bundle["parcels"] if p.get("res")]

    by_canon = {}
    for p in res_parcels:
        c = canon_addr(p["addr"])
        if c:
            by_canon.setdefault(c, []).append(p)

    # Pool of online photos keyed by parcel ID
    online_by_pid: dict[str, list[str]] = {}
    opp_desc_by_pid: dict[str, str] = {}
    opp_url_by_pid: dict[str, str] = {}

    def register(addr: str, lat, lon, photos: list[str], desc: str = "", src_url: str = ""):
        matched_p = None
        c = canon_addr(addr)
        if c and c in by_canon:
            matched_p = by_canon[c][0]
        elif lat and lon:
            best_d = 999.0
            for p in res_parcels:
                # Distance in meters
                dm = math.hypot((lat - p["lat"]) * 111139.0, (lon - p["lon"]) * 84300.0)
                if dm < 22.0 and dm < best_d:
                    # Also check house number matches if addr has one
                    m_num = re.match(r"^(\d+)", (addr or "").strip())
                    p_num = re.match(r"^(\d+)", (p["addr"] or "").strip())
                    if not m_num or not p_num or m_num.group(1) == p_num.group(1):
                        best_d = dm
                        matched_p = p
        if not matched_p:
            return
        pid = matched_p["id"]
        cur = online_by_pid.setdefault(pid, [])
        for u in photos:
            if u not in cur:
                cur.append(u)
        if desc and pid not in opp_desc_by_pid:
            opp_desc_by_pid[pid] = desc
        if src_url and pid not in opp_url_by_pid:
            opp_url_by_pid[pid] = src_url

    # 1. Existing http(s) URLs already on parcels!
    for p in res_parcels:
        http_urls = [u for u in (p.get("mlsPhotoUrls") or []) if u.startswith("http")]
        if http_urls:
            online_by_pid.setdefault(p["id"], []).extend(http_urls)

    # 2. Old Purchase Properties (Bellport Village luxury brokerage!)
    for rec in harvest_old_purchase():
        register(rec["address"], None, None, rec["photos"], rec.get("desc", ""), rec.get("sourceUrl", ""))

    # 3. All .data/*.json caches + extra Zillow rental/agent-sold archives!
    extra_items = harvest_extra_zillow()
    cache_files = [
        ".data/redfin-sold-5yr.json",
        ".data/zillow-sold-p1.json",
        ".data/zillow-sold-p2.json",
        ".data/zillow-sold-any-p1.json",
        ".data/realtor-sold-oldest.json",
        ".data/realtor-poly-oldest-p1.json",
        ".data/realtor-zip-11713-oldest.json",
        ".data/sold-polygon-cache.json",
        ".data/agent-sold-david-rice-p1.json",
        ".data/store.json",
    ]
    all_raw_items = list(extra_items)
    for cf in cache_files:
        fp = os.path.join(ROOT, cf)
        if not os.path.exists(fp):
            continue
        d = json.load(open(fp))
        if isinstance(d, list):
            all_raw_items.extend(d)
        elif isinstance(d, dict):
            for k in ["searchResults", "listings", "properties", "results"]:
                if isinstance(d.get(k), list):
                    all_raw_items.extend(d[k])
            if isinstance(d.get("data"), dict) and isinstance(d["data"].get("home_search"), dict):
                all_raw_items.extend(d["data"]["home_search"].get("results", []))

    for it in all_raw_items:
        ex = extract_any_item_photos_and_loc(it)
        if ex:
            register(ex["addr"], ex["lat"], ex["lon"], ex["photos"])

    print(f"Total Bellport Village homes matched with online non-Street-View photos: {len(online_by_pid)} / {len(res_parcels)}")

    # Download & replace Street View WebPs for every parcel in online_by_pid that wasn't already upgraded!
    to_download = []
    for p in res_parcels:
        pid = p["id"]
        urls = online_by_pid.get(pid)
        if not urls:
            continue
        # Keep active seed listings' curated cover intact, just append any extra gallery URLs
        if p.get("listingId") and p["listingId"] in seeds:
            p["photoSource"] = "mls"
            p["mlsPhotoUrls"] = [p["photoUrl"]] + [u for u in urls if u != p["photoUrl"]][:39]
            continue
        to_download.append((p, urls))

    def download_cover(args):
        p, urls = args
        pid = p["id"]
        dst_webp = os.path.join(PHOTOS_DIR, f"{pid}.webp")
        for u in urls[:4]:
            try:
                req = urllib.request.Request(u, headers=UA_HEADERS)
                with urllib.request.urlopen(req, timeout=8) as r:
                    raw = r.read()
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                if im.width < 220 or im.height < 140:
                    continue
                im.thumbnail((720, 480), Image.Resampling.LANCZOS)
                im.save(dst_webp, "WEBP", quality=84)
                return (pid, u, True)
            except Exception:
                continue
        return (pid, None, False)

    upgraded = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
        for pid, hero_u, ok in ex.map(download_cover, to_download):
            if ok:
                upgraded += 1

    # Update parcel metadata
    mls_total = 0
    sv_total = 0
    for p in res_parcels:
        pid = p["id"]
        urls = online_by_pid.get(pid)
        if urls:
            p["photoSource"] = "mls"
            p["photoUrl"] = f"/photos/{pid}.webp"
            p["mlsPhotoUrls"] = [f"/photos/{pid}.webp"] + [u for u in urls if not u.startswith("/photos/")][:39]
            if pid in opp_desc_by_pid and not p.get("pastRemarks"):
                p["pastRemarks"] = opp_desc_by_pid[pid]
            if pid in opp_url_by_pid and not p.get("sourceUrl"):
                p["sourceUrl"] = opp_url_by_pid[pid]
            mls_total += 1
        else:
            if p.get("photoSource") != "aerial":
                sv_total += 1

    with open(PARCELS_PATH, "w", encoding="utf-8") as f:
        json.dump(bundle, f, separators=(",", ":"))

    print(f"Downloaded & replaced {upgraded} off-market cover WebPs with real online MLS/broker photos!")
    print(f"Final Village photo breakdown: {mls_total} real MLS/Brokerage photos | {sv_total} Street View fallback | {len(res_parcels) - mls_total - sv_total} Aerial fallback")


if __name__ == "__main__":
    main()
