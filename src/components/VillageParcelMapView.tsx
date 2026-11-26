import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Compass,
  ExternalLink,
  Globe,
  Heart,
  History,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  ThumbsDown,
  X,
} from 'lucide-react';
import type {
  BeautifulStreetSection,
  HistoricalSaleRecord,
  Listing,
  OffMarketDossier,
  SyncMetadata,
  VillageParcel,
  VillageParcelsBundle,
  VillagePoi,
} from '../types';
import { evaluateGoodDeal } from '../lib/intelligence';
import { evaluateRobbieFit } from '../lib/robbieFit';
import {
  evaluateArchitecturalBeauty,
  getOwnerAndAirbnbProfile,
} from '../lib/ownerAndAirbnb';
import { parseNaturalLanguageQuery } from '../lib/nlSearch';
import {
  describeStreetBlock,
  findNearestStreetAtPoint,
  type StreetBlockSummary,
} from '../lib/streetSummaries';
import {
  CURRENT_VILLAGE_YEAR,
  buildUnifiedVillageCatalog,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  isAnyUnifiedFilterActive,
  resolveAssetUrl,
  toPseudoListing,
  type UnifiedFilters,
  type UnifiedHome,
} from '../lib/unifiedCatalog';
import { UnifiedFilterBar } from './UnifiedFilterBar';
import { SalesOverTimeModule } from './SalesOverTimeModule';
import { PhotoGallery } from './PhotoGallery';
import { PropertyIllustration } from './PropertyIllustration';
import { ValuationBadge } from './ValuationBadge';
import { RobbieFitBadge } from './RobbieFitBadge';
import { SkimmablePropertyNotes } from './SkimmablePropertyNotes';
import { ScrollReveal } from './ScrollReveal';

interface VillageParcelMapViewProps {
  listings: Listing[];
  savedParcelIds: Record<string, boolean>;
  hiddenParcelIds: Record<string, boolean>;
  onToggleFavorite: (parcelId: string, listingId: string | null) => void;
  onToggleHidden: (parcelId: string, listingId: string | null) => void;
  unifiedFilters: UnifiedFilters;
  onChangeUnifiedFilters: (next: UnifiedFilters) => void;
  privacyBlur: boolean;
  onOpenHomeDrawer: (parcelId: string) => void;
  onSyncMetaUpdate: (meta: SyncMetadata) => void;
}

interface PlacedStreetLabelHitbox {
  name: string;
  rawName: string;
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  ang: number;
  lon: number;
  lat: number;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export const VillageParcelMapView: React.FC<VillageParcelMapViewProps> = ({
  listings,
  savedParcelIds,
  hiddenParcelIds,
  onToggleFavorite,
  onToggleHidden,
  unifiedFilters,
  onChangeUnifiedFilters,
  privacyBlur,
  onOpenHomeDrawer,
  onSyncMetaUpdate,
}) => {
  const [bundle, setBundle] = useState<VillageParcelsBundle | null>(null);
  const [sales, setSales] = useState<HistoricalSaleRecord[]>([]);
  const [mapMode, setMapMode] = useState<'map' | 'satellite'>('map');
  const [aerialReady, setAerialReady] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<VillagePoi | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<VillageParcel | null>(null);
  const [hoveredStreetName, setHoveredStreetName] = useState<string | null>(null);
  const [streetSummary, setStreetSummary] = useState<StreetBlockSummary | null>(null);
  const [hoveredCardParcelId, setHoveredCardParcelId] = useState<string | null>(null);
  const [dossiersByAddr, setDossiersByAddr] = useState<Record<string, OffMarketDossier>>({});
  const [dossierLoading, setDossierLoading] = useState(false);

  // zoom = 1.08 frames mainland Bellport Village cleanly; zoom = 0.54 reveals Private Beach (Ho-Hum) + Ferry!
  const [view, setView] = useState({
    zoom: 1.08,
    centerLon: -72.9412,
    centerLat: 40.7536,
    bearing: 0,
  });

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const placedStreetLabelsRef = useRef<PlacedStreetLabelHitbox[]>([]);
  const villageAerialImgRef = useRef<HTMLImageElement | null>(null);
  const bayAerialImgRef = useRef<HTMLImageElement | null>(null);

  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'rotate';
    moved: boolean;
    startX: number;
    startY: number;
    startLon: number;
    startLat: number;
    startBearing: number;
  }>({
    mode: 'none',
    moved: false,
    startX: 0,
    startY: 0,
    startLon: -72.9416,
    startLat: 40.7532,
    startBearing: 0,
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(resolveAssetUrl('/data/bellport-parcels.json') ?? '/data/bellport-parcels.json').then(
        (r) => r.json() as Promise<VillageParcelsBundle>
      ),
      fetch(
        resolveAssetUrl('/data/bellport-sales-history.json') ?? '/data/bellport-sales-history.json'
      ).then((r) => r.json() as Promise<HistoricalSaleRecord[]>),
    ])
      .then(([pData, sData]) => {
        if (!active) return;
        setBundle(pData);
        setSales(sData);
      })
      .catch((err) => console.error('Failed to load Bellport Village map data:', err));

    // Preload georeferenced satellite orthoimagery (Village z=17 + Wide Bay/Fire Island z=14)
    const vImg = new Image();
    vImg.onload = () => {
      villageAerialImgRef.current = vImg;
      if (active) setAerialReady((c) => c + 1);
    };
    vImg.src = resolveAssetUrl('/data/bellport-aerial.webp') ?? '/data/bellport-aerial.webp';

    const bImg = new Image();
    bImg.onload = () => {
      bayAerialImgRef.current = bImg;
      if (active) setAerialReady((c) => c + 1);
    };
    bImg.src =
      resolveAssetUrl('/data/bellport-bay-aerial.webp') ?? '/data/bellport-bay-aerial.webp';

    return () => {
      active = false;
    };
  }, []);

  const getScales = useCallback((w: number, h: number, zoom: number): [number, number] => {
    const baseLon = Math.min(w / 0.0325, (h * 0.7575) / 0.0278) * zoom;
    return [baseLon, baseLon / 0.7575];
  }, []);

  const projectWith = useCallback(
    (
      lon: number,
      lat: number,
      width: number,
      height: number,
      v: { zoom: number; centerLon: number; centerLat: number; bearing: number }
    ): [number, number] => {
      const [pxLon, pxLat] = getScales(width, height, v.zoom);
      const dx = (lon - v.centerLon) * pxLon;
      const dy = -(lat - v.centerLat) * pxLat;
      const rad = (v.bearing * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return [width / 2 + (dx * cos - dy * sin), height / 2 + (dx * sin + dy * cos)];
    },
    [getScales]
  );

  const unprojectWith = useCallback(
    (
      sx: number,
      sy: number,
      width: number,
      height: number,
      v: { zoom: number; centerLon: number; centerLat: number; bearing: number }
    ): [number, number] => {
      const [pxLon, pxLat] = getScales(width, height, v.zoom);
      const rx = sx - width / 2;
      const ry = sy - height / 2;
      const rad = (-v.bearing * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = rx * cos - ry * sin;
      const dy = rx * sin + ry * cos;
      return [v.centerLon + dx / pxLon, v.centerLat - dy / pxLat];
    },
    [getScales]
  );

  const [belowGridLimit, setBelowGridLimit] = useState(12);

  const catalog = useMemo(
    () =>
      bundle
        ? buildUnifiedVillageCatalog(
            bundle.parcels,
            listings,
            sales,
            savedParcelIds,
            hiddenParcelIds
          )
        : [],
    [bundle, hiddenParcelIds, listings, sales, savedParcelIds]
  );

  const homeByParcelId = useMemo(
    () => new Map(catalog.map((h) => [h.parcelId, h])),
    [catalog]
  );

  const filtering = isAnyUnifiedFilterActive(unifiedFilters);
  const parsedNl = useMemo(
    () => parseNaturalLanguageQuery(unifiedFilters.nlQuery),
    [unifiedFilters.nlQuery]
  );

  const matchedHomes = useMemo<UnifiedHome[]>(() => {
    const list = filtering
      ? catalog.filter((h) => homeMatchesUnifiedFilters(h, unifiedFilters, false))
      : catalog.filter((h) => h.isForSale && !h.isHidden);

    list.sort((a, b) => {
      if (a.isForSale !== b.isForSale) return a.isForSale ? -1 : 1;
      if (parsedNl.sortHint === 'lawn_desc') return b.openLawnAc - a.openLawnAc;
      if (parsedNl.sortHint === 'beauty_desc') {
        const ba = evaluateArchitecturalBeauty(toPseudoListing(a)).score10;
        const bb = evaluateArchitecturalBeauty(toPseudoListing(b)).score10;
        return bb - ba;
      }
      if (parsedNl.sortHint === 'price_asc') return a.price - b.price;
      const pa = toPseudoListing(a);
      const pb = toPseudoListing(b);
      const scoreA =
        evaluateRobbieFit(pa).score + evaluateArchitecturalBeauty(pa).score10 * 5 +
        (a.photoSource === 'mls' ? 6 : 0);
      const scoreB =
        evaluateRobbieFit(pb).score + evaluateArchitecturalBeauty(pb).score10 * 5 +
        (b.photoSource === 'mls' ? 6 : 0);
      if (Math.abs(scoreB - scoreA) > 1.5) return scoreB - scoreA;
      if (a.hasPastSale !== b.hasPastSale) return a.hasPastSale ? -1 : 1;
      return b.price - a.price;
    });
    return list;
  }, [catalog, filtering, parsedNl.sortHint, unifiedFilters]);

  const applyFilters = useCallback(
    (next: UnifiedFilters) => {
      setBelowGridLimit(12);
      setSelectedParcelId(null);
      setSelectedPoi(null);
      onChangeUnifiedFilters(next);
    },
    [onChangeUnifiedFilters]
  );

  const matchedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!filtering) return ids;
    for (const h of matchedHomes) {
      ids.add(h.parcelId);
    }
    return ids;
  }, [filtering, matchedHomes]);

  const activeBeautifulSections = useMemo<BeautifulStreetSection[]>(() => {
    if (!bundle?.beautifulStreets) return [];
    if (unifiedFilters.beautifulStreets.length > 0) {
      return bundle.beautifulStreets.filter((s) =>
        unifiedFilters.beautifulStreets.includes(s.id)
      );
    }
    if (unifiedFilters.beautifulStreetsOnly || parsedNl.beautifulStreetsOnly) {
      return bundle.beautifulStreets;
    }
    return [];
  }, [
    bundle,
    parsedNl.beautifulStreetsOnly,
    unifiedFilters.beautifulStreets,
    unifiedFilters.beautifulStreetsOnly,
  ]);

  const highlightedCardParcelId =
    hoveredCardParcelId ?? (filtering ? (matchedHomes[0]?.parcelId ?? null) : null);

  const highlightedCardParcel = useMemo(
    () =>
      highlightedCardParcelId
        ? (bundle?.parcels.find((p) => p.id === highlightedCardParcelId) ?? null)
        : null,
    [bundle, highlightedCardParcelId]
  );

  const searchMatches = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!bundle || !q) return [];
    return bundle.parcels
      .filter((p) => !p.underwater && p.addr.toLowerCase().includes(q))
      .slice(0, 6);
  }, [bundle, searchText]);

  const selectedParcel = useMemo(
    () => bundle?.parcels.find((p) => p.id === selectedParcelId) ?? null,
    [bundle, selectedParcelId]
  );

  const selectedHome = useMemo(
    () => (selectedParcelId ? (homeByParcelId.get(selectedParcelId) ?? null) : null),
    [homeByParcelId, selectedParcelId]
  );

  const hitTestStreetLabel = useCallback(
    (mx: number, my: number): PlacedStreetLabelHitbox | null => {
      for (const lbl of placedStreetLabelsRef.current) {
        const dx = mx - lbl.cx;
        const dy = my - lbl.cy;
        const cos = Math.cos(-lbl.ang);
        const sin = Math.sin(-lbl.ang);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        if (Math.abs(lx) <= lbl.bw / 2 + 6 && Math.abs(ly) <= lbl.bh / 2 + 5) {
          return lbl;
        }
      }
      return null;
    },
    []
  );

  const selectAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !bundle) return;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      // 1. Check if user clicked on a rendered Street Name label!
      const hitLabel = hitTestStreetLabel(mx, my);
      if (hitLabel) {
        setStreetSummary(
          describeStreetBlock(hitLabel.rawName, hitLabel.lon, hitLabel.lat, bundle.parcels)
        );
        return;
      }

      const [lon, lat] = unprojectWith(mx, my, rect.width, rect.height, viewRef.current);

      // 2. Check Private Beach (Ho-Hum) click when zoomed out to Fire Island
      if (
        bundle.hoHumBeachRings &&
        bundle.hoHumBeachRings.some((r) => pointInRing(lon, lat, r))
      ) {
        const hhPoi = bundle.pois.find((poi) => poi.id === 'poi-ho-hum-beach');
        if (hhPoi) {
          setSelectedPoi(hhPoi);
          setSelectedParcelId(null);
          return;
        }
      }

      // 3. Check Village Parcel polygon hit
      const hits: VillageParcel[] = [];
      for (const p of bundle.parcels) {
        if (p.underwater) continue;
        if (p.rings.some((r) => pointInRing(lon, lat, r))) hits.push(p);
      }

      if (hits.length > 0) {
        setStreetSummary(null);
        hits.sort((a, b) => a.acres - b.acres);
        const hit = hits[0];
        const linkedPoi =
          bundle.pois.find((poi) => poi.parcelId === hit.id) ??
          (!hit.res
            ? bundle.pois.find(
                (poi) => Math.hypot(poi.lon - hit.lon, poi.lat - hit.lat) < 0.00045
              )
            : undefined);
        if (linkedPoi && !hit.res) {
          setSelectedPoi(linkedPoi);
          setSelectedParcelId(hit.id);
        } else {
          setSelectedPoi(null);
          setSelectedParcelId(hit.id);
        }
        return;
      }

      // 4. If user clicked directly on a Village street carriageway between parcels, show that block's 1-sentence summary!
      const nearSt = findNearestStreetAtPoint(lon, lat, bundle.streets, 0.00026);
      if (nearSt) {
        setStreetSummary(
          describeStreetBlock(nearSt.street.name, nearSt.lon, nearSt.lat, bundle.parcels)
        );
      }
    },
    [bundle, hitTestStreetLabel, unprojectWith]
  );

  // Native non-passive touch handler for smooth 2-finger pinch-to-zoom + pan/twist + 1-finger tap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchState = {
      count: 0,
      moved: false,
      startX: 0,
      startY: 0,
      lastMidX: 0,
      lastMidY: 0,
      lastDist: 0,
      lastAngle: 0,
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchState = {
          count: 1,
          moved: false,
          startX: t.clientX,
          startY: t.clientY,
          lastMidX: t.clientX,
          lastMidY: t.clientY,
          lastDist: 0,
          lastAngle: 0,
        };
      } else if (e.touches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.max(10, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);
        touchState = {
          count: 2,
          moved: true,
          startX: midX,
          startY: midY,
          lastMidX: midX,
          lastMidY: midY,
          lastDist: dist,
          lastAngle: angle,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cur = viewRef.current;

      if (e.touches.length === 1 && touchState.count === 1) {
        const t = e.touches[0];
        const dx = t.clientX - touchState.lastMidX;
        const dy = t.clientY - touchState.lastMidY;
        if (Math.hypot(t.clientX - touchState.startX, t.clientY - touchState.startY) > 7) {
          touchState.moved = true;
        }
        touchState.lastMidX = t.clientX;
        touchState.lastMidY = t.clientY;

        const [pxLon, pxLat] = getScales(rect.width, rect.height, cur.zoom);
        const rad = (-cur.bearing * Math.PI) / 180;
        const dxU = dx * Math.cos(rad) - dy * Math.sin(rad);
        const dyU = dx * Math.sin(rad) + dy * Math.cos(rad);

        setView((prev) => ({
          ...prev,
          centerLon: prev.centerLon - dxU / pxLon,
          centerLat: prev.centerLat + dyU / pxLat,
        }));
      } else if (e.touches.length >= 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.max(10, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
        const midX = (t0.clientX + t1.clientX) / 2;
        const midY = (t0.clientY + t1.clientY) / 2;
        const angle = Math.atan2(t1.clientY - t0.clientY, t1.clientX - t0.clientX);

        if (touchState.count < 2 || touchState.lastDist <= 0) {
          touchState.count = 2;
          touchState.lastDist = dist;
          touchState.lastMidX = midX;
          touchState.lastMidY = midY;
          touchState.lastAngle = angle;
          return;
        }

        const scale = dist / touchState.lastDist;
        const nextZoom = Math.max(0.42, Math.min(14, cur.zoom * scale));

        let dAngleDeg = ((angle - touchState.lastAngle) * 180) / Math.PI;
        if (dAngleDeg > 180) dAngleDeg -= 360;
        if (dAngleDeg < -180) dAngleDeg += 360;
        const nextBearing =
          Math.abs(dAngleDeg) > 1.2 ? (cur.bearing + dAngleDeg + 360) % 360 : cur.bearing;

        const prevLocalX = touchState.lastMidX - rect.left;
        const prevLocalY = touchState.lastMidY - rect.top;
        const [anchorLon, anchorLat] = unprojectWith(
          prevLocalX,
          prevLocalY,
          rect.width,
          rect.height,
          cur
        );

        const newLocalX = midX - rect.left;
        const newLocalY = midY - rect.top;
        const [pxLon, pxLat] = getScales(rect.width, rect.height, nextZoom);
        const rx = newLocalX - rect.width / 2;
        const ry = newLocalY - rect.height / 2;
        const rad = (-nextBearing * Math.PI) / 180;
        const dx = rx * Math.cos(rad) - ry * Math.sin(rad);
        const dy = rx * Math.sin(rad) + ry * Math.cos(rad);

        touchState.lastDist = dist;
        touchState.lastMidX = midX;
        touchState.lastMidY = midY;
        touchState.lastAngle = angle;

        setView({
          zoom: nextZoom,
          bearing: Math.round(nextBearing),
          centerLon: anchorLon - dx / pxLon,
          centerLat: anchorLat + dy / pxLat,
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (touchState.count === 1 && !touchState.moved) {
          selectAtClientPoint(touchState.startX, touchState.startY);
        }
        touchState.count = 0;
      } else if (e.touches.length === 1) {
        touchState.count = 1;
        touchState.moved = true;
        touchState.lastMidX = e.touches[0].clientX;
        touchState.lastMidY = e.touches[0].clientY;
      }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [getScales, selectAtClientPoint, unprojectWith]);

  // Main Canvas Renderer (Map & Satellite modes, Fire Island + Ho-Hum Beach Bay-to-Ocean Border + Ferry, Beautiful Streets, Red Card Highlight, Clickable Street Names)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width));
    const height = Math.max(440, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const isSat = mapMode === 'satellite';
    const [pxLon, pxLat] = getScales(width, height, view.zoom);
    const rotRad = (view.bearing * Math.PI) / 180;

    const traceRing = (ring: number[][]) => {
      ctx.beginPath();
      ring.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };

    const drawGeorefImage = (
      img: HTMLImageElement | null,
      bounds?: { west: number; south: number; east: number; north: number }
    ) => {
      if (!img || !bounds) return;
      const midLon = (bounds.west + bounds.east) / 2;
      const midLat = (bounds.south + bounds.north) / 2;
      const [cx, cy] = projectWith(midLon, midLat, width, height, view);
      const drawW = (bounds.east - bounds.west) * pxLon;
      const drawH = (bounds.north - bounds.south) * pxLat;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };

    if (isSat) {
      // Deep Atlantic/Bay base + wide-bay aerial + high-res Village aerial
      ctx.fillStyle = '#142a3b';
      ctx.fillRect(0, 0, width, height);
      drawGeorefImage(bayAerialImgRef.current, bundle.bayAerialBounds);
      drawGeorefImage(villageAerialImgRef.current, bundle.aerialBounds);

      // Subtle exterior spotlight veil in Satellite mode so Bellport Village & Ho-Hum Beach stand out
      if (bundle.boundaryRings && bundle.boundaryRings.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-20, -20, width + 40, height + 40);
        for (const ring of bundle.boundaryRings) {
          ring.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
        ctx.fill('evenodd');
        ctx.restore();
      }
    } else {
      // Default Map Mode: Pure white/whisper-faint outside canvas so 100% of visual focus stays on Bellport Village!
      ctx.fillStyle = '#fcfcfd';
      ctx.fillRect(0, 0, width, height);

      // Soft Bellport Bay & Atlantic Ocean south of mainland shoreline
      const bayPoly = [
        [-73.06, 40.7445],
        [-72.85, 40.7445],
        [-72.85, 40.66],
        [-73.06, 40.66],
      ];
      ctx.save();
      traceRing(bayPoly);
      ctx.fillStyle = '#dcebf7';
      ctx.fill();
      ctx.restore();

      if (bundle.waterRings && bundle.waterRings.length > 0) {
        ctx.save();
        for (const wr of bundle.waterRings) {
          traceRing(wr);
          ctx.fillStyle = '#dcebf7';
          ctx.fill();
          ctx.strokeStyle = '#c2d9ec';
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Fire Island Barrier Island Shoreline (faint warm dune outside Ho-Hum Beach)
      if (bundle.fireIslandRings && bundle.fireIslandRings.length > 0) {
        ctx.save();
        for (const fr of bundle.fireIslandRings) {
          traceRing(fr);
          ctx.fillStyle = '#f3efe4';
          ctx.fill();
          ctx.strokeStyle = '#dfd7c5';
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Faint context roads outside Bellport Village (before the white exterior veil!)
      const bgRoadScale = Math.max(0.75, Math.min(2.6, Math.pow(view.zoom, 0.65)));
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const st of bundle.streets) {
        const isArt = /Main St|Country Rd/i.test(st.name);
        ctx.strokeStyle = isArt ? '#e2e6ec' : '#eaedf2';
        ctx.lineWidth = (isArt ? 4.5 : 2.2) * bgRoadScale;
        for (const seg of st.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
      }
      ctx.restore();

      // Whisper-White Exterior Veil over everything outside Incorporated Bellport Village & Ho-Hum Beach
      // (keeps Bay water gentle while turning surrounding unincorporated mainland nearly pure white!)
      if (bundle.boundaryRings && bundle.boundaryRings.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-20, -20, width + 40, height + 40);
        for (const ring of bundle.boundaryRings) {
          ring.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fill('evenodd');
        ctx.restore();
      }

      // Mainland Bellport Village warm architectural parchment ground + subtle drop shadow
      if (bundle.boundaryRings?.[0]) {
        ctx.save();
        traceRing(bundle.boundaryRings[0]);
        ctx.shadowColor = 'rgba(15, 37, 55, 0.08)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#f6f4ef';
        ctx.fill();
        ctx.restore();
      }
    }

    // Ho-Hum Beach: Incorporated Bellport Village tract cutting ALL THE WAY across Fire Island from Bellport Bay to the Atlantic Ocean!
    const hhRings =
      bundle.hoHumBeachRings ?? (bundle.boundaryRings?.[1] ? [bundle.boundaryRings[1]] : []);
    if (hhRings.length > 0) {
      ctx.save();
      for (const hr of hhRings) {
        traceRing(hr);
        ctx.fillStyle = isSat ? 'rgba(251, 240, 178, 0.56)' : '#fbf0b2';
        ctx.fill();
        ctx.strokeStyle = isSat ? '#fde047' : '#c2410c';
        ctx.lineWidth = 2.3;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Color every parcel lot inside Incorporated Bellport Village
    for (const p of bundle.parcels) {
      if (p.underwater) continue;
      const hObj = homeByParcelId.get(p.id);
      const isMatch = matchedIds.has(p.id);
      const dimmed = filtering && p.res && !isMatch;

      let fill = isSat ? 'rgba(255,255,255,0.03)' : '#ebe7de';
      let stroke = isSat ? 'rgba(255,255,255,0.28)' : '#d5cfc3';
      let lw = isSat ? 0.55 : 0.65;

      if (!p.res) {
        if (p.poiKind === 'golf' || p.cls === '552') {
          fill = isSat ? 'rgba(155, 227, 176, 0.18)' : '#d9eed5';
          stroke = isSat ? 'rgba(163, 211, 159, 0.55)' : '#a5cfa0';
          lw = 0.9;
        } else if (p.poiKind === 'beach') {
          fill = isSat ? 'rgba(251, 240, 178, 0.45)' : '#fbf0b2';
          stroke = '#dfc865';
          lw = 1.0;
        } else if (
          p.poiKind === 'park' ||
          p.cls.startsWith('5') ||
          p.cls.startsWith('9') ||
          p.cls.startsWith('8')
        ) {
          fill = isSat ? 'rgba(220, 236, 216, 0.15)' : '#deeed9';
          stroke = isSat ? 'rgba(178, 212, 174, 0.4)' : '#b4d3b0';
          lw = 0.75;
        } else if (p.cls.startsWith('4') || p.poiKind === 'dining' || p.poiKind === 'shop') {
          fill = isSat ? 'rgba(237, 234, 226, 0.16)' : '#e6e1d5';
          stroke = isSat ? 'rgba(255,255,255,0.3)' : '#cec6b6';
          lw = 0.7;
        }
      } else if (p.cat === 'for_sale') {
        fill = isSat ? 'rgba(105, 235, 148, 0.58)' : '#7be098';
        stroke = isSat ? '#6ee798' : '#145a32';
        lw = 1.55;
      }

      if (isMatch && hObj) {
        if (
          unifiedFilters.builtRecent &&
          hObj.yearBuilt >= CURRENT_VILLAGE_YEAR - unifiedFilters.builtYears
        ) {
          fill = isSat ? 'rgba(247, 217, 140, 0.62)' : '#f7d98c';
          stroke = '#fbbc04';
          lw = 1.65;
        } else if (
          unifiedFilters.soldRecent &&
          hObj.soldYear !== null &&
          hObj.soldYear >= CURRENT_VILLAGE_YEAR - unifiedFilters.soldYears
        ) {
          fill = isSat ? 'rgba(156, 211, 232, 0.62)' : '#9cd3e8';
          stroke = isSat ? '#7dd3fc' : '#1e6b8c';
          lw = 1.65;
        } else if (p.cat === 'for_sale') {
          fill = isSat ? 'rgba(105, 235, 148, 0.68)' : '#7be098';
          stroke = isSat ? '#86efac' : '#145a32';
          lw = 1.85;
        } else {
          fill = isSat ? 'rgba(138, 180, 248, 0.52)' : '#c2dbfd';
          stroke = isSat ? '#8ab4f8' : '#1a73e8';
          lw = 1.55;
        }
      }

      ctx.save();
      if (dimmed) ctx.globalAlpha = isSat ? 0.35 : 0.28;
      for (const ring of p.rings) {
        traceRing(ring);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }

      if (!isSat && p.bldgs && p.bldgs.length > 0 && view.zoom >= 0.95) {
        ctx.fillStyle =
          p.cat === 'for_sale'
            ? 'rgba(20, 90, 50, 0.32)'
            : isMatch
              ? 'rgba(26, 115, 232, 0.3)'
              : 'rgba(100, 110, 122, 0.18)';
        for (const br of p.bldgs) {
          traceRing(br);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Crisp Village Roads Clipped Strictly Inside Mainland Bellport Village!
    const roadScale = Math.max(0.75, Math.min(2.6, Math.pow(view.zoom, 0.65)));
    if (!isSat) {
      ctx.save();
      if (bundle.boundaryRings?.[0]) {
        traceRing(bundle.boundaryRings[0]);
        ctx.clip();
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const st of bundle.streets) {
        const isArt = /Main St|Country Rd/i.test(st.name);
        const isCol = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(st.name);
        ctx.strokeStyle = isArt ? '#d8ccb2' : '#d2cec4';
        ctx.lineWidth = (isArt ? 6.2 : isCol ? 4.5 : 2.9) * roadScale;
        for (const seg of st.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
      }

      for (const st of bundle.streets) {
        const isArt = /Main St|Country Rd/i.test(st.name);
        const isCol = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(st.name);
        ctx.strokeStyle = isArt ? '#fdf8ec' : '#ffffff';
        ctx.lineWidth = (isArt ? 4.6 : isCol ? 3.2 : 2.0) * roadScale;
        for (const seg of st.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Highlighted Most Beautiful Streets & Street Sections Ribbon
    if (activeBeautifulSections.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const sec of activeBeautifulSections) {
        for (const seg of sec.segments) {
          if (seg.length < 2) continue;
          ctx.beginPath();
          seg.forEach((pt, idx) => {
            const [px, py] = projectWith(pt[0], pt[1], width, height, view);
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.strokeStyle = isSat ? 'rgba(251, 188, 4, 0.55)' : 'rgba(251, 188, 4, 0.52)';
          ctx.lineWidth = 9.5 * roadScale;
          ctx.stroke();

          ctx.strokeStyle = isSat ? '#fde047' : '#1a73e8';
          ctx.lineWidth = 3.2 * roadScale;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (unifiedFilters.belowSC && bundle.southCountryLine && bundle.southCountryLine.length > 1) {
      ctx.save();
      ctx.beginPath();
      bundle.southCountryLine.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = isSat ? '#fde047' : '#1a73e8';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // Whalehouse Point Ferry Route (Bellport Village Marina <-> Private Ho-Hum Beach on Fire Island)
    if (bundle.ferryRoute && bundle.ferryRoute.waypoints.length >= 2) {
      const wps = bundle.ferryRoute.waypoints;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Soft white wake halo
      ctx.beginPath();
      wps.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = isSat ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4.4;
      ctx.stroke();

      // Maritime Navy nautical dashed ferry line
      ctx.beginPath();
      wps.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = isSat ? '#93c5fd' : '#1a5fb4';
      ctx.lineWidth = 2.1;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // North & South Ferry Dock terminals
      for (const dock of [bundle.ferryRoute.northDock, bundle.ferryRoute.southDock]) {
        const [dx, dy] = projectWith(dock.lon, dock.lat, width, height, view);
        ctx.beginPath();
        ctx.arc(dx, dy, 4.3, 0, Math.PI * 2);
        ctx.fillStyle = '#0f2537';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }

    // Exterior Border of Mainland Incorporated Bellport Village (Maritime Navy) + Crisp Bay-to-Ocean Border on Ho-Hum Beach
    if (bundle.boundaryRings && bundle.boundaryRings.length > 0) {
      ctx.save();
      bundle.boundaryRings.forEach((ring, rIdx) => {
        traceRing(ring);
        if (rIdx === 1) {
          // Ho-Hum Beach Village Border cutting across Fire Island from Bellport Bay to Atlantic Ocean
          ctx.strokeStyle = isSat ? '#fde047' : '#c2410c';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = isSat ? 'rgba(255,255,255,0.75)' : 'rgba(15, 37, 55, 0.58)';
          ctx.lineWidth = 1.75;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      ctx.restore();
    }

    // Hovered, Card-Highlighted (RED BORDER #ea4335!), and Selected Lot Outlines
    if (hoveredParcel && !hoveredParcel.underwater) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const ring of hoveredParcel.rings) {
        traceRing(ring);
        ctx.strokeStyle = isSat ? '#ffffff' : '#374151';
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (highlightedCardParcel && !highlightedCardParcel.underwater) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const ring of highlightedCardParcel.rings) {
        traceRing(ring);
        ctx.strokeStyle = 'rgba(234, 67, 53, 0.32)';
        ctx.lineWidth = 8.5;
        ctx.stroke();
        ctx.strokeStyle = '#ea4335';
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (selectedParcel && !selectedParcel.underwater) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const ring of selectedParcel.rings) {
        traceRing(ring);
        ctx.strokeStyle = 'rgba(234, 67, 53, 0.34)';
        ctx.lineWidth = 9.0;
        ctx.stroke();
        ctx.strokeStyle = '#ea4335';
        ctx.lineWidth = 3.4;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Labels: Bay, Ferry Route, Ho-Hum Beach, Fire Island, Atlantic Ocean & Clickable Road Names
    const placed: Array<[number, number, number, number]> = [];
    const streetHitboxes: PlacedStreetLabelHitbox[] = [];

    const canPlace = (cx: number, cy: number, bw: number, bh: number): boolean => {
      if (cx < 32 || cx > width - 32 || cy < 18 || cy > height - 18) return false;
      const b: [number, number, number, number] = [
        cx - bw / 2,
        cy - bh / 2,
        cx + bw / 2,
        cy + bh / 2,
      ];
      if (placed.some((x) => !(b[2] < x[0] || b[0] > x[2] || b[3] < x[1] || b[1] > x[3]))) {
        return false;
      }
      placed.push(b);
      return true;
    };

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Ho-Hum Beach Bay-to-Ocean Tract Label
    if (bundle.ferryRoute) {
      const [hhX, hhY] = projectWith(-72.9278, 40.7138, width, height, view);
      if (canPlace(hhX, hhY, 170, 26)) {
        ctx.save();
        ctx.font = '700 11.5px "Plus Jakarta Sans", -apple-system, sans-serif';
        ctx.lineWidth = 3.8;
        ctx.strokeStyle = 'rgba(255,255,255,0.96)';
        ctx.strokeText('Ho-Hum Beach (Bay → Ocean)', hhX, hhY);
        ctx.fillStyle = '#9a3412';
        ctx.fillText('Ho-Hum Beach (Bay → Ocean)', hhX, hhY);
        ctx.restore();
      }

      // Ferry Route Midpoint Label
      const [fyX, fyY] = projectWith(-72.9318, 40.7295, width, height, view);
      if (canPlace(fyX, fyY, 150, 22)) {
        ctx.save();
        ctx.font = '500 10.5px "Plus Jakarta Sans", -apple-system, sans-serif';
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.94)';
        ctx.strokeText('Whalehouse Pt Ferry', fyX, fyY);
        ctx.fillStyle = '#1a73e8';
        ctx.fillText('Whalehouse Pt Ferry', fyX, fyY);
        ctx.restore();
      }
    }

    // Fire Island & Ocean Labels when zoomed out
    const [fiX, fiY] = projectWith(-72.952, 40.7085, width, height, view);
    if (canPlace(fiX, fiY, 100, 20)) {
      ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = isSat ? 'rgba(20,30,40,0.8)' : 'rgba(255,255,255,0.9)';
      ctx.strokeText('Fire Island', fiX, fiY);
      ctx.fillStyle = isSat ? '#f8fafc' : '#5f533e';
      ctx.fillText('Fire Island', fiX, fiY);
    }

    const [ocX, ocY] = projectWith(-72.932, 40.701, width, height, view);
    if (canPlace(ocX, ocY, 115, 20)) {
      ctx.font = 'italic 500 11px "Plus Jakarta Sans", -apple-system, sans-serif';
      ctx.fillStyle = isSat ? 'rgba(224,242,254,0.9)' : '#3b6b8f';
      ctx.fillText('Atlantic Ocean', ocX, ocY);
    }

    const [bayX, bayY] = projectWith(-72.9435, 40.7375, width, height, view);
    if (canPlace(bayX, bayY, 95, 20)) {
      ctx.font = 'italic 500 11px "Plus Jakarta Sans", -apple-system, sans-serif';
      ctx.fillStyle = isSat ? 'rgba(224,242,254,0.92)' : '#487699';
      ctx.fillText('Bellport Bay', bayX, bayY);
    }

    // Beautiful Street Section Callout Labels when Beautiful Streets filter is active even at zoom=1.0
    if (activeBeautifulSections.length > 0 && view.zoom < 1.28) {
      ctx.font = '600 10.5px "Plus Jakarta Sans", -apple-system, sans-serif';
      for (const sec of activeBeautifulSections) {
        const [sx, sy] = projectWith(sec.labelLon, sec.labelLat, width, height, view);
        const tw = ctx.measureText(sec.shortName).width;
        if (!canPlace(sx, sy, tw + 18, 19)) continue;
        ctx.save();
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.96)';
        ctx.strokeText(sec.shortName, sx, sy);
        ctx.fillStyle = '#1a73e8';
        ctx.fillText(sec.shortName, sx, sy);
        ctx.restore();
        streetHitboxes.push({
          name: sec.shortName,
          rawName: sec.shortName.split('&')[0].trim(),
          cx: sx,
          cy: sy,
          bw: tw + 14,
          bh: 18,
          ang: 0,
          lon: sec.labelLon,
          lat: sec.labelLat,
        });
      }
    }

    // Viewport-Clipped Clickable Road Names (iconic Village streets visible right at default zoom >= 0.98!)
    if (view.zoom >= 0.98) {
      ctx.font = '500 10.5px "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif';
      const seenNames = new Set<string>();
      const ordered = [...bundle.streets].sort((a, b) => {
        const ap =
          /Main St|Country Rd|Station Rd|Bellport Ln|Browns Ln|Livingston|Bell St|Hulse|Rogers|Academy|Country Club|Howells|Shore Rd|Circuit|Bieselin/i.test(
            a.name
          );
        const bp =
          /Main St|Country Rd|Station Rd|Bellport Ln|Browns Ln|Livingston|Bell St|Hulse|Rogers|Academy|Country Club|Howells|Shore Rd|Circuit|Bieselin/i.test(
            b.name
          );
        return Number(bp) - Number(ap);
      });

      for (const st of ordered) {
        const cleanName = st.name.replace('Main St (S Country Rd)', 'Main St');
        if (seenNames.has(cleanName)) continue;
        const isIconic =
          /Main St|Station Rd|Bellport Ln|Browns Ln|Country Club|Howells|Shore Rd|Bieselin/i.test(
            st.name
          );
        const isPri =
          isIconic ||
          /Livingston|Bell St|Hulse|Rogers|Academy|Circuit/i.test(st.name);
        if (!isIconic && view.zoom < 1.28) continue;
        if (!isPri && view.zoom < 1.65) continue;

        let bestVis: Array<[number, number, number, number]> | null = null;
        let bestSpan = 0;

        for (const seg of st.segments) {
          if (seg.length < 2) continue;
          const projPts = seg.map(
            (p) =>
              [...projectWith(p[0], p[1], width, height, view), p[0], p[1]] as [
                number,
                number,
                number,
                number,
              ]
          );
          const dense: Array<[number, number, number, number]> = [];
          for (let i = 0; i < projPts.length - 1; i++) {
            const [x1, y1, lon1, lat1] = projPts[i];
            const [x2, y2, lon2, lat2] = projPts[i + 1];
            const d = Math.hypot(x2 - x1, y2 - y1);
            const steps = Math.max(1, Math.floor(d / 16));
            for (let s = 0; s < steps; s++) {
              const t = s / steps;
              dense.push([
                x1 + (x2 - x1) * t,
                y1 + (y2 - y1) * t,
                lon1 + (lon2 - lon1) * t,
                lat1 + (lat2 - lat1) * t,
              ]);
            }
          }
          dense.push(projPts[projPts.length - 1]);

          let curRun: Array<[number, number, number, number]> = [];
          for (const pt of dense) {
            if (pt[0] >= 44 && pt[0] <= width - 44 && pt[1] >= 24 && pt[1] <= height - 24) {
              curRun.push(pt);
            } else {
              if (curRun.length >= 2) {
                const sp = Math.hypot(
                  curRun[curRun.length - 1][0] - curRun[0][0],
                  curRun[curRun.length - 1][1] - curRun[0][1]
                );
                if (sp > bestSpan) {
                  bestSpan = sp;
                  bestVis = curRun;
                }
              }
              curRun = [];
            }
          }
          if (curRun.length >= 2) {
            const sp = Math.hypot(
              curRun[curRun.length - 1][0] - curRun[0][0],
              curRun[curRun.length - 1][1] - curRun[0][1]
            );
            if (sp > bestSpan) {
              bestSpan = sp;
              bestVis = curRun;
            }
          }
        }

        if (!bestVis || bestSpan < 34) continue;
        const midIdx = Math.floor(bestVis.length / 2);
        const [mx, my, mLon, mLat] = bestVis[midIdx];
        const pA = bestVis[Math.max(0, midIdx - 2)];
        const pB = bestVis[Math.min(bestVis.length - 1, midIdx + 2)];
        const tw = ctx.measureText(cleanName).width;
        if (!canPlace(mx, my, tw + 22, 20)) continue;

        let ang = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;

        seenNames.add(cleanName);
        const isHovSt = hoveredStreetName === cleanName;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.lineWidth = isHovSt ? 4.2 : 3.4;
        ctx.strokeStyle = isSat ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255,255,255,0.96)';
        ctx.strokeText(cleanName, 0, 0);
        ctx.fillStyle = isHovSt ? '#1a73e8' : isSat ? '#f8fafc' : '#334155';
        ctx.fillText(cleanName, 0, 0);
        ctx.restore();

        streetHitboxes.push({
          name: cleanName,
          rawName: st.name,
          cx: mx,
          cy: my,
          bw: tw + 12,
          bh: 16,
          ang,
          lon: mLon,
          lat: mLat,
        });
      }
    }

    placedStreetLabelsRef.current = streetHitboxes;
    ctx.restore();
    ctx.restore();
  }, [
    activeBeautifulSections,
    aerialReady,
    bundle,
    filtering,
    getScales,
    highlightedCardParcel,
    homeByParcelId,
    hoveredParcel,
    hoveredStreetName,
    mapMode,
    matchedIds,
    projectWith,
    selectedParcel,
    unifiedFilters.belowSC,
    unifiedFilters.builtRecent,
    unifiedFilters.builtYears,
    unifiedFilters.soldRecent,
    unifiedFilters.soldYears,
    view,
  ]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [lonBefore, latBefore] = unprojectWith(mx, my, rect.width, rect.height, view);
    const factor = e.deltaY < 0 ? 1.24 : 1 / 1.24;
    const nextZoom = Math.max(0.42, Math.min(14, view.zoom * factor));
    const [pxLon, pxLat] = getScales(rect.width, rect.height, nextZoom);
    const rx = mx - rect.width / 2;
    const ry = my - rect.height / 2;
    const rad = (-view.bearing * Math.PI) / 180;
    const dx = rx * Math.cos(rad) - ry * Math.sin(rad);
    const dy = rx * Math.sin(rad) + ry * Math.cos(rad);
    setView({
      ...view,
      zoom: nextZoom,
      centerLon: lonBefore - dx / pxLon,
      centerLat: latBefore + dy / pxLat,
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const isRotate = e.button === 2 || e.shiftKey || e.altKey;
    dragRef.current = {
      mode: isRotate ? 'rotate' : 'pan',
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      startLon: view.centerLon,
      startLat: view.centerLat,
      startBearing: view.bearing,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle) return;
    const rect = canvas.getBoundingClientRect();
    const d = dragRef.current;

    if (d.mode !== 'none') {
      const dxScreen = e.clientX - d.startX;
      const dyScreen = e.clientY - d.startY;
      if (Math.hypot(dxScreen, dyScreen) > 3) d.moved = true;

      if (d.mode === 'rotate') {
        setView((prev) => ({
          ...prev,
          bearing: Math.round((d.startBearing + dxScreen * 0.55 + 360) % 360),
        }));
        return;
      }

      const [pxLon, pxLat] = getScales(rect.width, rect.height, view.zoom);
      const rad = (-view.bearing * Math.PI) / 180;
      const dxU = dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad);
      const dyU = dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad);
      setView((prev) => ({
        ...prev,
        centerLon: d.startLon - dxU / pxLon,
        centerLat: d.startLat + dyU / pxLat,
      }));
      return;
    }

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const lblHit = hitTestStreetLabel(mx, my);
    if (lblHit) {
      setHoveredStreetName(lblHit.name);
      setHoveredParcel(null);
      return;
    }
    setHoveredStreetName(null);

    const [lon, lat] = unprojectWith(mx, my, rect.width, rect.height, view);
    let hit: VillageParcel | null = null;
    let minAc = Infinity;
    for (const p of bundle.parcels) {
      if (p.underwater) continue;
      if (p.acres < minAc && p.rings.some((r) => pointInRing(lon, lat, r))) {
        hit = p;
        minAc = p.acres;
      }
    }
    setHoveredParcel(hit);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.mode = 'none';
    if (!wasMoved && e.button === 0) {
      selectAtClientPoint(e.clientX, e.clientY);
    }
  };

  const handleFetchDossier = async (addr: string) => {
    setDossierLoading(true);
    try {
      const res = await fetch('/api/parcel-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = (await res.json()) as {
        dossier?: OffMarketDossier;
        syncMeta?: SyncMetadata;
      };
      if (res.ok && data.dossier) {
        setDossiersByAddr((prev) => ({ ...prev, [addr.toLowerCase()]: data.dossier! }));
        if (data.syncMeta) onSyncMetaUpdate(data.syncMeta);
      }
    } finally {
      setDossierLoading(false);
    }
  };

  const focusParcelById = (parcelId: string, zoomIn = true) => {
    if (!bundle) return;
    const found = bundle.parcels.find((p) => p.id === parcelId);
    if (!found) return;
    setSelectedPoi(null);
    setSelectedParcelId(found.id);
    if (zoomIn) {
      setView((prev) => ({
        ...prev,
        zoom: Math.max(prev.zoom, 2.3),
        centerLon: found.lon,
        centerLat: found.lat,
      }));
    }
  };

  const isBeachFerryView = view.zoom <= 0.68 && view.centerLat < 40.743;

  const resetVillageOnlyView = () => {
    setView({
      zoom: 1.08,
      centerLon: -72.9412,
      centerLat: 40.7536,
      bearing: 0,
    });
  };

  const togglePrivateBeachAndFerry = () => {
    if (isBeachFerryView) {
      resetVillageOnlyView();
    } else {
      setView({
        zoom: 0.54,
        centerLon: -72.9365,
        centerLat: 40.7355,
        bearing: 0,
      });
    }
  };

  const activeDossier = selectedParcel
    ? dossiersByAddr[selectedParcel.addr.toLowerCase()]
    : undefined;

  return (
    <section style={{ padding: '18px 0 40px' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Natural Language Search + Unified Filter Bar */}
        <UnifiedFilterBar
          filters={unifiedFilters}
          onChange={applyFilters}
          context="map"
        />

        {/* Map Key + Active Highlights */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 12,
            color: 'var(--ink-2)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: '#7be098',
                  border: '1px solid #145a32',
                }}
              />
              For Sale
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: '#ebe7de',
                  border: '1px solid #d5cfc3',
                }}
              />
              Off-Market
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: '#fbf0b2',
                  border: '1.5px solid #c2410c',
                }}
              />
              Private Beach (Ho-Hum)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: '#ffffff',
                  border: '2px solid #ea4335',
                }}
              />
              Highlighted Parcel
            </span>
            {activeBeautifulSections.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 16,
                    height: 4,
                    borderRadius: 99,
                    background: '#1a73e8',
                    boxShadow: '0 0 0 2px rgba(251,188,4,0.65)',
                  }}
                />
                Beautiful Streets ({activeBeautifulSections.length})
              </span>
            )}
            {unifiedFilters.soldRecent && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: '#9cd3e8',
                    border: '1px solid #1e6b8c',
                  }}
                />
                Sold ≤{unifiedFilters.soldYears}y
              </span>
            )}
            {unifiedFilters.builtRecent && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    background: '#f7d98c',
                    border: '1px solid #b07412',
                  }}
                />
                Built ≤{unifiedFilters.builtYears}y
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
              Click any lot, landmark, or street name for details
            </span>
            {filtering && (
              <strong style={{ color: 'var(--accent)' }}>
                {matchedHomes.length} matching {matchedHomes.length === 1 ? 'home' : 'homes'}
              </strong>
            )}
          </div>
        </div>

        {/* Full-Width Interactive Bellport Village Parcel & Satellite Map */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            border: '1px solid var(--line)',
            background: mapMode === 'satellite' ? '#142a3b' : '#fcfcfd',
            height: 610,
          }}
        >
          <canvas
            ref={canvasRef}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              dragRef.current.mode = 'none';
              setHoveredParcel(null);
              setHoveredStreetName(null);
            }}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              touchAction: 'none',
              userSelect: 'none',
              cursor: hoveredStreetName || hoveredParcel ? 'pointer' : 'grab',
            }}
          />

          {/* Top-Left Address Jump */}
          <div style={{ position: 'absolute', top: 12, left: 12, right: 64, maxWidth: 245 }}>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchText.trim()) {
                  if (searchMatches.length === 1) {
                    focusParcelById(searchMatches[0].id);
                    setSearchText('');
                  } else {
                    applyFilters({ ...unifiedFilters, nlQuery: searchText.trim() });
                    setSearchText('');
                  }
                }
              }}
              placeholder="Jump to address…"
              style={{
                width: '100%',
                height: 34,
                padding: '0 12px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'rgba(255,255,255,0.96)',
                color: '#18232c',
                fontSize: 12,
                boxShadow: 'var(--shadow-1)',
              }}
            />
            {searchText.trim().length > 1 && (
              <div
                style={{
                  marginTop: 6,
                  borderRadius: 14,
                  background: '#ffffff',
                  border: '1px solid var(--line)',
                  boxShadow: 'var(--shadow-2)',
                  overflow: 'hidden',
                }}
              >
                {searchMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      focusParcelById(m.id);
                      setSearchText('');
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--line)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <strong>{m.addr}</strong>
                    <span style={{ color: 'var(--ink-2)' }}>{m.acres} ac</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    applyFilters({ ...unifiedFilters, nlQuery: searchText.trim() });
                    setSearchText('');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  <Sparkles size={12} />
                  <span>Search “{searchText.trim()}” with Gemini</span>
                </button>
              </div>
            )}
          </div>

          {/* Floating Selected Property or POI Card over the Full-Width Map */}
          {(selectedPoi || selectedHome) && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 58,
                width: 'min(368px, calc(100% - 76px))',
                maxHeight: 'calc(100% - 68px)',
                overflowY: 'auto',
                borderRadius: 16,
                background: '#ffffff',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow-2)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
                zIndex: 4,
              }}
            >
              {selectedPoi ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="eyebrow" style={{ marginBottom: 0 }}>
                      {selectedPoi.kind === 'park' || selectedPoi.kind === 'beach'
                        ? 'Public Waterfront & Beach'
                        : selectedPoi.kind === 'golf'
                          ? 'Golf & Tennis'
                          : selectedPoi.kind === 'dining'
                            ? 'Main Street Dining'
                            : selectedPoi.kind === 'shop'
                              ? 'Village Shop & Market'
                              : 'Civic & Cultural Landmark'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPoi(null);
                        setSelectedParcelId(null);
                      }}
                      aria-label="Close landmark card"
                      style={{ background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {selectedPoi.photoUrl && (
                    <div
                      style={{
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid var(--line)',
                        aspectRatio: '16 / 10',
                        background: 'var(--surface-subtle)',
                      }}
                    >
                      <img
                        src={resolveAssetUrl(selectedPoi.photoUrl)}
                        alt={selectedPoi.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  )}

                  <div>
                    <h2 style={{ fontSize: 19, marginBottom: 3 }}>{selectedPoi.name}</h2>
                    <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>{selectedPoi.addr}</p>
                  </div>

                  <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', margin: 0 }}>
                    {selectedPoi.desc}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedPoi.websiteUrl && (
                      <a
                        href={selectedPoi.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn icon-btn--primary"
                        style={{ textDecoration: 'none', flex: 1, justifyContent: 'center' }}
                      >
                        <Globe size={14} />
                        <span>{selectedPoi.websiteLabel ?? 'Official Site'}</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <a
                      href={
                        selectedPoi.mapsUrl ??
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedPoi.name} Bellport NY`)}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="icon-btn"
                      style={{ textDecoration: 'none', flex: 1, justifyContent: 'center' }}
                    >
                      <MapPin size={14} />
                      <span>Google Maps</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </>
              ) : selectedHome ? (
                (() => {
                  const pseudo = toPseudoListing(selectedHome);
                  const val = evaluateGoodDeal(pseudo, listings);
                  const fit = evaluateRobbieFit(pseudo);
                  const beauty = evaluateArchitecturalBeauty(pseudo);
                  const ownerInfo = getOwnerAndAirbnbProfile({
                    parcelId: selectedHome.parcelId,
                    owner: selectedHome.owner,
                    mail: selectedHome.mail,
                    absentee: selectedHome.parcelRef.absentee,
                    listing: pseudo,
                  });

                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                          <RobbieFitBadge listing={pseudo} fit={fit} compact />
                          <span className={`badge ${selectedHome.isForSale ? 'badge--village' : ''}`}>
                            {selectedHome.isForSale
                              ? 'For Sale'
                              : selectedHome.hasPastSale
                                ? `Sold ${selectedHome.soldYear}`
                                : 'Off-Market'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <button
                            type="button"
                            onClick={() =>
                              onToggleFavorite(selectedHome.parcelId, selectedHome.listingId)
                            }
                            className={`icon-btn ${selectedHome.isFavorite ? 'is-active' : ''}`}
                            style={{ height: 28, padding: '0 9px', fontSize: 11.5 }}
                          >
                            <Heart
                              size={13}
                              fill={selectedHome.isFavorite ? 'var(--g-red)' : 'none'}
                              color={selectedHome.isFavorite ? 'var(--g-red)' : 'currentColor'}
                            />
                            <span>{selectedHome.isFavorite ? 'Saved' : 'Save'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onToggleHidden(selectedHome.parcelId, selectedHome.listingId)
                            }
                            className="icon-btn"
                            title={
                              selectedHome.isHidden
                                ? 'Restore this house to results'
                                : 'Remove this house from results'
                            }
                            aria-label={
                              selectedHome.isHidden
                                ? `Restore ${selectedHome.address}`
                                : `Hide ${selectedHome.address} from results`
                            }
                            style={{
                              height: 28,
                              padding: '0 8px',
                              fontSize: 11.5,
                              ...(selectedHome.isHidden
                                ? {
                                    background: '#fce8e6',
                                    color: '#c5221f',
                                    borderColor: 'rgba(197,34,31,0.3)',
                                  }
                                : {}),
                            }}
                          >
                            <ThumbsDown
                              size={13}
                              fill={selectedHome.isHidden ? '#c5221f' : 'none'}
                              color={selectedHome.isHidden ? '#c5221f' : 'currentColor'}
                            />
                            {selectedHome.isHidden && <span>Hidden</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedParcelId(null)}
                            aria-label="Close property card"
                            style={{ background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>

                      <div>
                        <h2 style={{ fontSize: 19, marginBottom: 2 }}>{selectedHome.address}</h2>
                        <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: 0 }}>{selectedHome.style}</p>
                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <ValuationBadge listing={pseudo} deal={val} compact />
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '2px 9px',
                              borderRadius: 999,
                              background: 'var(--surface-subtle)',
                              border: '1px solid var(--line)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            Beauty {beauty.display}
                          </span>
                        </div>
                      </div>

                      <PhotoGallery
                        photos={selectedHome.photos}
                        photoUrl={selectedHome.photoUrl}
                        archetype={selectedHome.archetype}
                        address={selectedHome.address}
                        styleName={selectedHome.style}
                      />

                      <SkimmablePropertyNotes
                        text={selectedHome.description || selectedHome.styleSummary}
                        listing={pseudo}
                        compact
                      />

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          padding: 10,
                          borderRadius: 12,
                          background: 'var(--surface-subtle)',
                          border: '1px solid var(--line)',
                          fontSize: 11.5,
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                            {selectedHome.isForSale
                              ? 'Asking Price'
                              : selectedHome.hasPastSale
                                ? `Sold (${selectedHome.soldYear})`
                                : 'Est. Market Value'}
                          </span>
                          <strong className="priv-val" style={{ fontSize: 14.5, fontFamily: 'var(--font-mono)' }}>
                            ${selectedHome.price.toLocaleString()}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ink-2)', display: 'block' }}>Size & Lot</span>
                          <strong style={{ fontFamily: 'var(--font-mono)' }}>
                            {selectedHome.beds}bd/{selectedHome.baths}ba · {selectedHome.sqft.toLocaleString()} ft² · {selectedHome.lotAcres} ac
                          </strong>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: ownerInfo.isListedOnAirbnb ? '#e6f4ea' : 'var(--surface-subtle)',
                          border: '1px solid var(--line)',
                          fontSize: 11.5,
                        }}
                      >
                        <strong>
                          {ownerInfo.residencyStatus === 'second_home'
                            ? 'Second-Home Owner'
                            : 'Full-Time Local Address'}
                        </strong>
                        {' · '}
                        <span style={{ color: 'var(--ink-2)' }}>{ownerInfo.ownerDisplay}</span>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="icon-btn icon-btn--primary"
                          style={{ justifyContent: 'center', flex: 1 }}
                          onClick={() => onOpenHomeDrawer(selectedHome.parcelId)}
                        >
                          <span>Full Property Details →</span>
                        </button>
                        {!selectedHome.listingRef && (
                          <button
                            type="button"
                            className="icon-btn"
                            title="Load Past Deed & Tax History"
                            disabled={dossierLoading}
                            onClick={() => void handleFetchDossier(selectedHome.address)}
                          >
                            <History size={14} />
                            <span>{dossierLoading ? '…' : activeDossier ? 'Loaded' : 'Deed'}</span>
                          </button>
                        )}
                      </div>
                    </>
                  );
                })()
              ) : null}
            </div>
          )}

          {/* Top-Right Zoom, Rotate, Village Reset & Private Beach Toggle Controls */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              background: '#ffffff',
              padding: 5,
              borderRadius: 16,
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow-1)',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom in"
              style={{ borderColor: 'transparent', width: 30, height: 30 }}
              onClick={() => setView((v) => ({ ...v, zoom: Math.min(14, v.zoom * 1.38) }))}
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom out"
              style={{ borderColor: 'transparent', width: 30, height: 30 }}
              onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.42, v.zoom / 1.38) }))}
            >
              <Minus size={15} />
            </button>
            <div style={{ width: '100%', height: 1, background: 'var(--line)' }} />
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                type="button"
                className="icon-btn"
                title="Rotate left"
                style={{ borderColor: 'transparent', width: 26, height: 26 }}
                onClick={() =>
                  setView((v) => ({ ...v, bearing: (v.bearing - 45 + 360) % 360 }))
                }
              >
                <RotateCcw size={13} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Rotate right"
                style={{ borderColor: 'transparent', width: 26, height: 26 }}
                onClick={() => setView((v) => ({ ...v, bearing: (v.bearing + 45) % 360 }))}
              >
                <RotateCw size={13} />
              </button>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="Reset Bellport Village View"
              style={{ borderColor: 'transparent', width: 30, height: 28 }}
              onClick={resetVillageOnlyView}
            >
              <Compass size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={isBeachFerryView}
              title={
                isBeachFerryView
                  ? 'Return to Bellport Village view'
                  : 'Zoom out to Private Beach and Ferry'
              }
              style={{
                borderColor: 'transparent',
                width: 30,
                height: 28,
                background: isBeachFerryView ? '#0f2537' : 'transparent',
                color: isBeachFerryView ? '#ffffff' : 'var(--accent)',
              }}
              onClick={togglePrivateBeachAndFerry}
            >
              <Anchor size={14} />
            </button>
          </div>

          {/* Bottom-Right Toggleable Private Beach and Ferry Pill + Map | Satellite Segmented Toggle */}
          <div
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              aria-pressed={isBeachFerryView}
              onClick={togglePrivateBeachAndFerry}
              title={
                isBeachFerryView
                  ? 'Click again to return to Bellport Village only'
                  : 'Show Private Beach (Ho-Hum) and Ferry route'
              }
              style={{
                height: 32,
                padding: '0 13px',
                borderRadius: 999,
                border: isBeachFerryView ? '1px solid #0f2537' : '1px solid var(--line)',
                background: isBeachFerryView ? '#0f2537' : '#ffffff',
                boxShadow: 'var(--shadow-1)',
                fontSize: 11.5,
                fontWeight: 600,
                color: isBeachFerryView ? '#ffffff' : 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
              }}
            >
              <Anchor size={12} color={isBeachFerryView ? '#e2c07d' : 'var(--accent)'} />
              <span>Private Beach and Ferry</span>
              {isBeachFerryView && (
                <X size={12} style={{ marginLeft: 2, opacity: 0.85 }} />
              )}
            </button>

            <div
              style={{
                display: 'inline-flex',
                padding: 3,
                borderRadius: 999,
                background: '#ffffff',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow-1)',
              }}
            >
              {(['map', 'satellite'] as const).map((mMode) => {
                const active = mapMode === mMode;
                return (
                  <button
                    key={mMode}
                    type="button"
                    onClick={() => setMapMode(mMode)}
                    style={{
                      padding: '4px 11px',
                      borderRadius: 999,
                      border: 'none',
                      background: active ? '#0f2537' : 'transparent',
                      color: active ? '#ffffff' : 'var(--ink)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      textTransform: 'capitalize',
                    }}
                  >
                    {mMode === 'map' ? 'Map' : 'Satellite'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clickable Street Name -> Concise One-Sentence Block Summary Card */}
          {streetSummary && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 52,
                maxWidth: 460,
                padding: '12px 14px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.97)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Block Summary · {streetSummary.blockLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setStreetSummary(null)}
                  aria-label="Close street summary"
                  style={{ background: 'none', border: 'none', color: 'var(--ink-2)' }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink)', margin: 0 }}>
                {streetSummary.sentence}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                  {streetSummary.homeCount} Village homes on this street
                </span>
                <button
                  type="button"
                  onClick={() => {
                    applyFilters({
                      ...unifiedFilters,
                      allHomes: true,
                      nlQuery: streetSummary.streetName,
                      q: '',
                    });
                    setStreetSummary(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  Filter homes on {streetSummary.streetName} →
                </button>
              </div>
            </div>
          )}

          {/* Hover or Active Red-Highlighted Card Callout */}
          {(hoveredParcel || highlightedCardParcel) && !streetSummary && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                bottom: 12,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.96)',
                border:
                  !hoveredParcel && highlightedCardParcel
                    ? '1.5px solid #ea4335'
                    : '1px solid var(--line)',
                boxShadow: 'var(--shadow-1)',
                fontSize: 12,
                pointerEvents: 'none',
                maxWidth: '56%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {(() => {
                const p = hoveredParcel ?? highlightedCardParcel!;
                return (
                  <>
                    <strong>{p.poiName ?? p.addr}</strong> · {p.acres} ac
                    {p.val && p.res ? (
                      <span className="priv-val"> · {fmtShortDollar(p.val)}</span>
                    ) : null}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* NYT Feature-Article Dynamic Scroll-Reveal Section Below the Map */}
        {matchedHomes.length > 0 && (
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <ScrollReveal direction="up">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 16,
                  alignItems: 'end',
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line)',
                }}
              >
                <div>
                  <span className="eyebrow" style={{ marginBottom: 4 }}>
                    {filtering ? 'Matching Village Properties' : 'Curated Village Market'}
                  </span>
                  <h3 style={{ fontSize: 22, margin: 0 }}>
                    {filtering && unifiedFilters.nlQuery.trim()
                      ? `${matchedHomes.length} ${matchedHomes.length === 1 ? 'home matches' : 'homes match'} “${unifiedFilters.nlQuery.trim()}”`
                      : filtering
                        ? `${matchedHomes.length} matching Bellport Village ${matchedHomes.length === 1 ? 'home' : 'homes'}`
                        : `${matchedHomes.length} Bellport Village homes currently for sale`}
                  </h3>
                </div>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--ink-2)',
                    margin: 0,
                    justifySelf: 'end',
                  }}
                >
                  Ranked by architectural pedigree and fit first. Hover any property card below to
                  light up its lot in red on the map above, or click for full photos, deed history,
                  and comp math.
                </p>
              </div>
            </ScrollReveal>

            <div className="listing-grid">
              {matchedHomes.slice(0, belowGridLimit).map((h, idx) => {
                const isLit = highlightedCardParcelId === h.parcelId;
                const pseudo = toPseudoListing(h);
                const ppsf = h.sqft > 0 ? Math.round(h.price / h.sqft) : 0;
                const deal = evaluateGoodDeal(pseudo, listings);
                const fit = evaluateRobbieFit(pseudo);
                const beauty = evaluateArchitecturalBeauty(pseudo);
                const dir = idx % 3 === 0 ? 'left' : idx % 3 === 2 ? 'right' : 'up';

                return (
                  <ScrollReveal
                    key={`below-${h.parcelId}`}
                    direction={dir}
                    delayMs={(idx % 3) * 70}
                  >
                    <article
                      className="listing-card"
                      onMouseEnter={() => setHoveredCardParcelId(h.parcelId)}
                      onMouseLeave={() =>
                        setHoveredCardParcelId((cur) => (cur === h.parcelId ? null : cur))
                      }
                      style={{
                        height: '100%',
                        ...(isLit
                          ? {
                              borderColor: '#ea4335',
                              boxShadow: '0 4px 16px rgba(234, 67, 53, 0.14)',
                            }
                          : {}),
                      }}
                    >
                      <div
                        className="listing-card__media"
                        onClick={() => onOpenHomeDrawer(h.parcelId)}
                      >
                        <PropertyIllustration
                          archetype={h.archetype}
                          address={h.address}
                          styleName={h.style}
                          photoUrl={h.photoUrl}
                        />
                        <div className="listing-card__badges">
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <RobbieFitBadge listing={pseudo} fit={fit} compact />
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(255,255,255,0.94)',
                                color: 'var(--ink)',
                              }}
                            >
                              {h.area}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: 5, pointerEvents: 'auto' }}>
                            <button
                              type="button"
                              className="status-dot-btn"
                              title="Remove from results"
                              aria-label={`Remove ${h.address} from results`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleHidden(h.parcelId, h.listingId);
                              }}
                              style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                            >
                              <ThumbsDown size={14} color="var(--ink-2)" />
                            </button>
                            <button
                              type="button"
                              className="status-dot-btn"
                              title="Save favorite"
                              aria-label={`Save ${h.address}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(h.parcelId, h.listingId);
                              }}
                              style={{ padding: '5px 8px', pointerEvents: 'auto' }}
                            >
                              <Heart
                                size={14}
                                fill={h.isFavorite ? 'var(--g-red)' : 'none'}
                                color={h.isFavorite ? 'var(--g-red)' : 'currentColor'}
                              />
                            </button>
                          </div>
                        </div>

                        <span
                          className="badge"
                          style={{
                            position: 'absolute',
                            left: 12,
                            bottom: 10,
                            fontSize: 11,
                            background: h.isForSale
                              ? '#9be3b0'
                              : h.hasPastSale
                                ? 'rgba(32,33,36,0.82)'
                                : 'rgba(255,255,255,0.92)',
                            color: h.isForSale
                              ? '#124d2c'
                              : h.hasPastSale
                                ? '#ffffff'
                                : 'var(--ink-2)',
                            border: 'none',
                          }}
                        >
                          {h.isForSale
                            ? 'For Sale'
                            : h.hasPastSale
                              ? `Sold ${h.soldYear ?? ''}`
                              : 'Off-Market · Est. Value'}
                        </span>

                        {h.photoSource && h.photoSource !== 'mls' && (
                          <span
                            style={{
                              position: 'absolute',
                              right: 10,
                              bottom: 10,
                              padding: '2px 7px',
                              borderRadius: 999,
                              fontSize: 10,
                              fontWeight: 500,
                              background: 'rgba(32,33,36,0.68)',
                              color: '#ffffff',
                            }}
                          >
                            {h.photoSource === 'aerial' ? 'Aerial View' : 'Street View'}
                          </span>
                        )}
                      </div>

                      <div className="listing-card__body">
                        <div>
                          <div className="listing-card__top">
                            <span className="listing-card__price priv-val">
                              {h.isForSale || h.hasPastSale ? '' : 'Est. '}$
                              {h.price.toLocaleString()}
                            </span>
                            <ValuationBadge listing={pseudo} deal={deal} compact />
                          </div>

                          <h3
                            className="listing-card__address"
                            onClick={() => onOpenHomeDrawer(h.parcelId)}
                          >
                            {h.address}
                          </h3>
                          <div className="listing-card__sub">
                            <strong>{h.style}</strong>
                            {parsedNl.sortHint === 'lawn_desc' && (
                              <span> · {h.openLawnAc} ac open lawn</span>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--ink-2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span>Stores: {h.distStoresMi} mi ({h.walkStoresMin}m)</span>
                          <span>Marina: {h.distMarinaMi} mi ({h.walkMarinaMin}m)</span>
                        </div>

                        <div
                          className="listing-card__specs"
                          style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                        >
                          <div>
                            <strong>
                              {h.beds}/{h.baths}
                            </strong>
                            <span>Bd/Ba</span>
                          </div>
                          <div>
                            <strong>{h.sqft.toLocaleString()}</strong>
                            <span>Sq Ft</span>
                          </div>
                          <div>
                            <strong className="priv-val">{ppsf > 0 ? `$${ppsf}` : '—'}</strong>
                            <span>$/Ft²</span>
                          </div>
                          <div>
                            <strong>{h.lotAcres}</strong>
                            <span>Acres</span>
                          </div>
                          <div>
                            <strong style={{ color: 'var(--accent)' }}>{beauty.display}</strong>
                            <span>Beauty</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  </ScrollReveal>
                );
              })}
            </div>

            {matchedHomes.length > belowGridLimit && (
              <div style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setBelowGridLimit((n) => n + 24)}
                >
                  <span>
                    Show more matching cards ({belowGridLimit} of{' '}
                    {matchedHomes.length.toLocaleString()})
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Home Prices Over Time Module (1993–2026 + U.S. National Average Comparison) */}
        <ScrollReveal direction="up" delayMs={60}>
          <SalesOverTimeModule
            privacyBlur={privacyBlur}
            onSelectParcel={(pid) => focusParcelById(pid)}
            onOpenHome={(pid) => onOpenHomeDrawer(pid)}
          />
        </ScrollReveal>
      </div>
    </section>
  );
};
