import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  ExternalLink,
  History,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import type {
  HistoricalSaleRecord,
  Listing,
  OffMarketDossier,
  SyncMetadata,
  VillageParcel,
  VillageParcelsBundle,
  VillagePoi,
} from '../types';
import { evaluateGoodDeal } from '../lib/intelligence';
import {
  CURRENT_VILLAGE_YEAR,
  DESIGN_FEATURE_LABELS,
  buildUnifiedVillageCatalog,
  fmtShortDollar,
  homeMatchesUnifiedFilters,
  isAnyUnifiedFilterActive,
  toPseudoListing,
  type UnifiedFilters,
} from '../lib/unifiedCatalog';
import { UnifiedFilterBar } from './UnifiedFilterBar';
import { SalesOverTimeModule } from './SalesOverTimeModule';

interface VillageParcelMapViewProps {
  listings: Listing[];
  unifiedFilters: UnifiedFilters;
  onChangeUnifiedFilters: (next: UnifiedFilters) => void;
  privacyBlur: boolean;
  onOpenHomeDrawer: (parcelId: string) => void;
  onSyncMetaUpdate: (meta: SyncMetadata) => void;
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
  unifiedFilters,
  onChangeUnifiedFilters,
  privacyBlur,
  onOpenHomeDrawer,
  onSyncMetaUpdate,
}) => {
  const [bundle, setBundle] = useState<VillageParcelsBundle | null>(null);
  const [sales, setSales] = useState<HistoricalSaleRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<VillagePoi | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<VillageParcel | null>(null);
  const [dossiersByAddr, setDossiersByAddr] = useState<Record<string, OffMarketDossier>>({});
  const [dossierLoading, setDossierLoading] = useState(false);

  // zoom = 1.0 fits 100% of mainland Bellport Village across any screen aspect ratio
  const [view, setView] = useState({
    zoom: 1.0,
    centerLon: -72.9416,
    centerLat: 40.7532,
    bearing: 0,
  });

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
      fetch('/data/bellport-parcels.json').then((r) => r.json() as Promise<VillageParcelsBundle>),
      fetch('/data/bellport-sales-history.json').then(
        (r) => r.json() as Promise<HistoricalSaleRecord[]>
      ),
    ])
      .then(([pData, sData]) => {
        if (!active) return;
        setBundle(pData);
        setSales(sData);
      })
      .catch((err) => console.error('Failed to load Bellport Village map data:', err));
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

  const catalog = useMemo(
    () => (bundle ? buildUnifiedVillageCatalog(bundle.parcels, listings, sales) : []),
    [bundle, listings, sales]
  );

  const homeByParcelId = useMemo(
    () => new Map(catalog.map((h) => [h.parcelId, h])),
    [catalog]
  );

  const filtering = isAnyUnifiedFilterActive(unifiedFilters);

  const matchedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!filtering) return ids;
    for (const h of catalog) {
      if (homeMatchesUnifiedFilters(h, unifiedFilters, false)) {
        ids.add(h.parcelId);
      }
    }
    return ids;
  }, [catalog, filtering, unifiedFilters]);

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

  const selectAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !bundle) return;
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const [lon, lat] = unprojectWith(mx, my, rect.width, rect.height, viewRef.current);

      const hits: VillageParcel[] = [];
      for (const p of bundle.parcels) {
        if (p.underwater) continue;
        if (p.rings.some((r) => pointInRing(lon, lat, r))) hits.push(p);
      }
      if (hits.length === 0) return;
      hits.sort((a, b) => a.acres - b.acres);
      const hit = hits[0];

      const linkedPoi = hit.poiKind
        ? bundle.pois.find((poi) => poi.parcelId === hit.id)
        : undefined;
      if (linkedPoi && !hit.res) {
        setSelectedPoi(linkedPoi);
        setSelectedParcelId(hit.id);
      } else {
        setSelectedPoi(null);
        setSelectedParcelId(hit.id);
      }
    },
    [bundle, unprojectWith]
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
        const nextZoom = Math.max(0.85, Math.min(14, cur.zoom * scale));

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

  // Full-Town Lot-Colored Renderer (For Sale = Light Green, Golf = Light Green, Beach = Light Yellow, Viewport-Clipped Road Names on Zoom)
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

    const traceRing = (ring: number[][]) => {
      ctx.beginPath();
      ring.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };

    ctx.fillStyle = '#dde1e5';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    for (const ring of bundle.boundaryRings ?? []) {
      ring.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = '#fafbfc';
    ctx.fill();
    ctx.restore();

    if (bundle.waterRings && bundle.waterRings.length > 0) {
      ctx.save();
      for (const wr of bundle.waterRings) {
        traceRing(wr);
        ctx.fillStyle = '#c6e2f5';
        ctx.fill();
        ctx.strokeStyle = '#9cc5e0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Fire Island Ho-Hum Beach -> Light Yellow
    if (bundle.boundaryRings && bundle.boundaryRings[1]) {
      ctx.save();
      traceRing(bundle.boundaryRings[1]);
      ctx.fillStyle = '#fbf0b2';
      ctx.fill();
      ctx.strokeStyle = '#dfc865';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
    }

    // Color the exact polygon shape of every lot
    for (const p of bundle.parcels) {
      if (p.underwater) continue;
      const hObj = homeByParcelId.get(p.id);
      const isMatch = matchedIds.has(p.id);
      const dimmed = filtering && p.res && !isMatch;

      let fill = '#e6e8ec';
      let stroke = '#cfd4dc';
      let lw = 0.65;

      if (!p.res) {
        if (p.poiKind === 'golf' || p.cls === '552') {
          fill = '#d7f0d4';
          stroke = '#a3d39f';
          lw = 0.9;
        } else if (p.poiKind === 'beach') {
          fill = '#fbf0b2';
          stroke = '#dfc865';
          lw = 1.0;
        } else if (
          p.poiKind === 'park' ||
          p.cls.startsWith('5') ||
          p.cls.startsWith('9') ||
          p.cls.startsWith('8')
        ) {
          fill = '#dcecd8';
          stroke = '#b2d4ae';
          lw = 0.75;
        } else if (p.cls.startsWith('4') || p.poiKind === 'dining' || p.poiKind === 'shop') {
          fill = '#edeae2';
          stroke = '#d5cfc2';
          lw = 0.7;
        }
      } else if (p.cat === 'for_sale') {
        fill = '#9be3b0';
        stroke = '#1f7a46';
        lw = 1.25;
      }

      if (isMatch && hObj) {
        if (
          unifiedFilters.builtRecent &&
          hObj.yearBuilt >= CURRENT_VILLAGE_YEAR - unifiedFilters.builtYears
        ) {
          fill = '#f7d98c';
          stroke = '#b07412';
          lw = 1.65;
        } else if (
          unifiedFilters.soldRecent &&
          hObj.soldYear !== null &&
          hObj.soldYear >= CURRENT_VILLAGE_YEAR - unifiedFilters.soldYears
        ) {
          fill = '#9cd3e8';
          stroke = '#1e6b8c';
          lw = 1.65;
        } else if (p.cat === 'for_sale') {
          fill = '#9be3b0';
          stroke = '#145a32';
          lw = 1.8;
        } else {
          fill = '#c2dbfd';
          stroke = '#1a73e8';
          lw = 1.55;
        }
      }

      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.28;
      for (const ring of p.rings) {
        traceRing(ring);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
      }

      if (p.bldgs && p.bldgs.length > 0 && view.zoom >= 1.35) {
        ctx.fillStyle =
          p.cat === 'for_sale'
            ? 'rgba(31, 122, 70, 0.35)'
            : isMatch
              ? 'rgba(26, 115, 232, 0.32)'
              : 'rgba(120, 132, 145, 0.28)';
        for (const br of p.bldgs) {
          traceRing(br);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Cased White Roads
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const roadScale = Math.max(0.82, Math.min(2.6, Math.pow(view.zoom, 0.65)));

    for (const st of bundle.streets) {
      const isArt = /Main St|Country Rd/i.test(st.name);
      const isCol = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(st.name);
      ctx.strokeStyle = isArt ? '#dfd3ba' : '#d5d9df';
      ctx.lineWidth = (isArt ? 6.4 : isCol ? 4.6 : 3.0) * roadScale;
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
      ctx.strokeStyle = isArt ? '#fbf4e2' : '#ffffff';
      ctx.lineWidth = (isArt ? 4.8 : isCol ? 3.3 : 2.0) * roadScale;
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

    if (unifiedFilters.belowSC && bundle.southCountryLine && bundle.southCountryLine.length > 1) {
      ctx.save();
      ctx.beginPath();
      bundle.southCountryLine.forEach((pt, idx) => {
        const [px, py] = projectWith(pt[0], pt[1], width, height, view);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // Exterior Greyed-Out Veil Outside Incorporated Bellport Village Border
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
      ctx.fillStyle = 'rgba(214, 218, 224, 0.58)';
      ctx.fill('evenodd');

      for (const ring of bundle.boundaryRings) {
        traceRing(ring);
        ctx.strokeStyle = '#7d8790';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Hovered & Selected Lot Outlines
    for (const [parcel, color, lw] of [
      [hoveredParcel, '#374151', 1.8],
      [selectedParcel, '#1a73e8', 2.8],
    ] as Array<[VillageParcel | null, string, number]>) {
      if (!parcel || parcel.underwater) continue;
      ctx.save();
      ctx.lineJoin = 'round';
      for (const ring of parcel.rings) {
        traceRing(ring);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Viewport-Clipped Densified Road Labels (0 at default zoom=1.0; crisp street names on zoom >= 1.28!)
    const placed: Array<[number, number, number, number]> = [];
    const canPlace = (cx: number, cy: number, bw: number, bh: number): boolean => {
      if (cx < 40 || cx > width - 40 || cy < 20 || cy > height - 20) return false;
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

    const [bayX, bayY] = projectWith(-72.9415, 40.7422, width, height, view);
    if (canPlace(bayX, bayY, 90, 20)) {
      ctx.font = 'italic 11.5px Georgia, serif';
      ctx.fillStyle = '#487699';
      ctx.fillText('Bellport Bay', bayX, bayY);
    }

    if (view.zoom >= 1.28) {
      ctx.font = '500 10.5px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
      const seenNames = new Set<string>();
      const ordered = [...bundle.streets].sort((a, b) => {
        const ap =
          /Main St|Country Rd|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit|Bieselin/i.test(
            a.name
          );
        const bp =
          /Main St|Country Rd|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit|Bieselin/i.test(
            b.name
          );
        return Number(bp) - Number(ap);
      });

      for (const st of ordered) {
        const cleanName = st.name.replace('Main St (S Country Rd)', 'Main St');
        if (seenNames.has(cleanName)) continue;
        const isPri =
          /Main St|Country Rd|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit|Bieselin/i.test(
            st.name
          );
        if (!isPri && view.zoom < 1.65) continue;

        let bestVis: Array<[number, number]> | null = null;
        let bestSpan = 0;

        for (const seg of st.segments) {
          if (seg.length < 2) continue;
          const projPts = seg.map((p) => projectWith(p[0], p[1], width, height, view));
          const dense: Array<[number, number]> = [];
          for (let i = 0; i < projPts.length - 1; i++) {
            const [x1, y1] = projPts[i];
            const [x2, y2] = projPts[i + 1];
            const d = Math.hypot(x2 - x1, y2 - y1);
            const steps = Math.max(1, Math.floor(d / 16));
            for (let s = 0; s < steps; s++) {
              const t = s / steps;
              dense.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
            }
          }
          dense.push(projPts[projPts.length - 1]);

          let curRun: Array<[number, number]> = [];
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
        const [mx, my] = bestVis[midIdx];
        const pA = bestVis[Math.max(0, midIdx - 2)];
        const pB = bestVis[Math.min(bestVis.length - 1, midIdx + 2)];
        const tw = ctx.measureText(cleanName).width;
        if (!canPlace(mx, my, tw + 22, 20)) continue;

        let ang = Math.atan2(pB[1] - pA[1], pB[0] - pA[0]);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;

        seenNames.add(cleanName);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeText(cleanName, 0, 0);
        ctx.fillStyle = '#3f4a52';
        ctx.fillText(cleanName, 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.restore();
  }, [
    bundle,
    filtering,
    homeByParcelId,
    hoveredParcel,
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
    const nextZoom = Math.max(0.85, Math.min(14, view.zoom * factor));
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
      const res = await fetch('/api/property/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
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

  const focusParcelById = (parcelId: string) => {
    if (!bundle) return;
    const found = bundle.parcels.find((p) => p.id === parcelId);
    if (!found) return;
    setSelectedPoi(null);
    setSelectedParcelId(found.id);
    setView((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom, 2.5),
      centerLon: found.lon,
      centerLat: found.lat,
    }));
  };

  const activeDossier = selectedParcel
    ? dossiersByAddr[selectedParcel.addr.toLowerCase()]
    : undefined;

  return (
    <section style={{ padding: '20px 0 40px' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Clean Unified Filter Bar */}
        <UnifiedFilterBar
          filters={unifiedFilters}
          onChange={onChangeUnifiedFilters}
          context="map"
        />

        {/* Minimal Map Key (No Golf & Parks clutter; Built/Sold shown only when active!) */}
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
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 3,
                  background: '#9be3b0',
                  border: '1px solid #1f7a46',
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
                  background: '#e6e8ec',
                  border: '1px solid #cfd4dc',
                }}
              />
              Off-Market
            </span>
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
          {filtering && (
            <strong style={{ color: 'var(--accent)' }}>
              {matchedIds.size} matching {matchedIds.size === 1 ? 'home' : 'homes'}
            </strong>
          )}
        </div>

        {/* Full-Town Map + Side Property Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 340px',
            gap: 18,
            alignItems: 'start',
          }}
          className="parcel-map-layout"
        >
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: '#dde1e5',
              height: 560,
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
              }}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                touchAction: 'none',
                userSelect: 'none',
                cursor: hoveredParcel ? 'pointer' : 'grab',
              }}
            />

            {/* Street Address Jump */}
            <div style={{ position: 'absolute', top: 12, left: 12, width: 225 }}>
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Jump to street address…"
                style={{
                  width: '100%',
                  height: 34,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,0.95)',
                  color: '#18232c',
                  fontSize: 12,
                  boxShadow: 'var(--shadow-1)',
                }}
              />
              {searchMatches.length > 0 && (
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
                </div>
              )}
            </div>

            {/* Minimal Zoom & Spin Controls */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'rgba(255,255,255,0.95)',
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
                onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.85, v.zoom / 1.38) }))}
              >
                <Minus size={15} />
              </button>
              <div style={{ width: '100%', height: 1, background: 'var(--line)' }} />
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  type="button"
                  className="icon-btn"
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
                  style={{ borderColor: 'transparent', width: 26, height: 26 }}
                  onClick={() => setView((v) => ({ ...v, bearing: (v.bearing + 45) % 360 }))}
                >
                  <RotateCw size={13} />
                </button>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Reset Full Town View"
                style={{ borderColor: 'transparent', height: 26, fontSize: 11 }}
                onClick={() =>
                  setView({ zoom: 1.0, centerLon: -72.9416, centerLat: 40.7532, bearing: 0 })
                }
              >
                <Compass size={13} />
              </button>
            </div>

            {hoveredParcel && (
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  bottom: 12,
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.95)',
                  border: '1px solid var(--line)',
                  boxShadow: 'var(--shadow-1)',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                <strong>{hoveredParcel.poiName ?? hoveredParcel.addr}</strong> ·{' '}
                {hoveredParcel.acres} ac
                {hoveredParcel.val && hoveredParcel.res ? (
                  <span className="priv-val"> · {fmtShortDollar(hoveredParcel.val)}</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Selected Home Dossier (Works for ANY of the 1,058 homes including gray off-market homes!) */}
          <aside
            style={{
              borderRadius: 'var(--radius)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 560,
              overflowY: 'auto',
            }}
          >
            {selectedPoi ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow" style={{ marginBottom: 0 }}>
                    Village Landmark
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPoi(null);
                      setSelectedParcelId(null);
                    }}
                    style={{ background: 'none', border: 'none' }}
                  >
                    <X size={14} />
                  </button>
                </div>
                <h2 style={{ fontSize: 20 }}>{selectedPoi.name}</h2>
                <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>{selectedPoi.addr}</p>
                <p style={{ fontSize: 13, lineHeight: 1.5 }}>{selectedPoi.desc}</p>
              </>
            ) : !selectedHome ? (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Parcel Explorer · 1,058 Homes
                </span>
                <h2 style={{ fontSize: 19, color: 'var(--ink)' }}>Click any home on the map</h2>
                <p style={{ lineHeight: 1.55 }}>
                  Tap any light-green listing or any gray off-market home across Bellport Village to
                  see its photograph, lot size, architectural profile, estimated value, and sale history.
                </p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span className="eyebrow" style={{ marginBottom: 6 }}>
                      Selected Property
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`badge ${selectedHome.isForSale ? 'badge--village' : ''}`}>
                        {selectedHome.isForSale
                          ? 'For Sale'
                          : selectedHome.hasPastSale
                            ? `Sold ${selectedHome.soldYear}`
                            : 'Off-Market Home'}
                      </span>
                      <span className="badge">{selectedHome.area}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedParcelId(null)}
                    style={{ background: 'none', border: 'none' }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div>
                  <h2 style={{ fontSize: 20, marginBottom: 2 }}>{selectedHome.address}</h2>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{selectedHome.style}</p>
                  {selectedHome.isForSale && (() => {
                    const val = evaluateGoodDeal(toPseudoListing(selectedHome), listings);
                    return (
                      <div style={{ marginTop: 6 }}>
                        <span
                          className={`badge priv-val ${
                            val.status === 'underpriced'
                              ? 'badge--village'
                              : val.status === 'overpriced'
                                ? 'badge--outside'
                                : ''
                          }`}
                        >
                          {val.badgeLabel}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {selectedHome.photoUrl && (
                  <div
                    style={{
                      position: 'relative',
                      borderRadius: 12,
                      overflow: 'hidden',
                      aspectRatio: '16 / 10',
                      cursor: 'pointer',
                      border: '1px solid var(--line)',
                    }}
                    onClick={() => onOpenHomeDrawer(selectedHome.parcelId)}
                  >
                    <img
                      src={selectedHome.photoUrl}
                      alt={selectedHome.address}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 500,
                        background: 'rgba(32, 33, 36, 0.72)',
                        color: '#ffffff',
                      }}
                    >
                      {selectedHome.photoSource === 'mls'
                        ? 'MLS Photo'
                        : selectedHome.photoSource === 'aerial'
                          ? 'Aerial View'
                          : 'Google Street View'}
                    </span>
                  </div>
                )}

                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  {selectedHome.styleSummary}
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                      {selectedHome.isForSale ? 'Asking Price' : 'Est. Market Value'}
                    </span>
                    <strong className="priv-val" style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      ${selectedHome.price.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Lot Size</span>
                    <strong style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      {selectedHome.lotAcres} ac
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Size</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedHome.beds} bd · {selectedHome.baths} ba ·{' '}
                      {selectedHome.sqft.toLocaleString()} ft²
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Year Built</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{selectedHome.yearBuilt}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {selectedHome.feats.slice(0, 6).map((fk) => (
                    <span key={fk} className="tag-pill">
                      {DESIGN_FEATURE_LABELS[fk] ?? fk}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    className="icon-btn icon-btn--primary"
                    style={{ justifyContent: 'center' }}
                    onClick={() => onOpenHomeDrawer(selectedHome.parcelId)}
                  >
                    <span>Full Property Details →</span>
                  </button>

                  {!selectedHome.listingRef && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ justifyContent: 'center' }}
                      disabled={dossierLoading}
                      onClick={() => void handleFetchDossier(selectedHome.address)}
                    >
                      <History size={14} />
                      <span>
                        {dossierLoading
                          ? 'Loading…'
                          : activeDossier
                            ? 'Past History Loaded'
                            : 'Load Past Deed & Tax History'}
                      </span>
                    </button>
                  )}

                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedHome.lat},${selectedHome.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="icon-btn"
                    style={{ justifyContent: 'center', textDecoration: 'none' }}
                  >
                    <MapPin size={14} />
                    <span>Street View</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </>
            )}
          </aside>
        </div>

        {/* Home Prices Over Time Module */}
        <SalesOverTimeModule
          privacyBlur={privacyBlur}
          onSelectParcel={(pid) => focusParcelById(pid)}
        />
      </div>
    </section>
  );
};
