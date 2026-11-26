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
  Search,
} from 'lucide-react';
import type {
  Listing,
  OffMarketDossier,
  ParcelStatusCategory,
  SyncMetadata,
  VillageParcel,
  VillageParcelsBundle,
  VillagePoi,
  VillagePoiKind,
} from '../types';
import { evaluateGoodDeal } from '../lib/intelligence';
import { MeceFilterDropdown, type MeceBucketOption } from './MeceFilterDropdown';
import { SalesOverTimeModule } from './SalesOverTimeModule';

interface VillageParcelMapViewProps {
  listings: Listing[];
  privacyBlur: boolean;
  onOpenListingDrawer: (listingId: string) => void;
  onSyncMetaUpdate: (meta: SyncMetadata) => void;
}

const STATUS_OPTIONS: MeceBucketOption[] = [
  { value: 'for_sale', label: 'For Sale', swatch: '#ea4335' },
  { value: 'built_3yr', label: 'Built ≤3 Yrs', swatch: '#fbbc04' },
  { value: 'sold_3yr', label: 'Sold ≤3 Yrs', swatch: '#34a853' },
  { value: 'other', label: 'Off-Market (>3 Yrs)', swatch: '#cbd5e1' },
];

const PRICE_OPTIONS: MeceBucketOption[] = [
  { value: 'p1', label: 'Under $1M' },
  { value: 'p2', label: '$1M – $2M' },
  { value: 'p3', label: '$2M – $3M' },
  { value: 'p4', label: '$3M+' },
];

const SIZE_OPTIONS: MeceBucketOption[] = [
  { value: 's1', label: '< 1,800 ft² (1–2 BR)' },
  { value: 's2', label: '1,800 – 2,349 ft² (3 BR)' },
  { value: 's3', label: '2,350 – 3,499 ft² (4 BR)' },
  { value: 's4', label: '3,500+ ft² (5+ BR)' },
];

const LOT_OPTIONS: MeceBucketOption[] = [
  { value: 'l1', label: '< 0.35 ac' },
  { value: 'l2', label: '0.35 – 0.49 ac' },
  { value: 'l3', label: '0.50 – 0.99 ac' },
  { value: 'l4', label: '1.00+ ac' },
];

const AREA_OPTIONS: MeceBucketOption[] = [
  { value: 'Historic Lanes', label: 'Historic Lanes' },
  { value: 'Country Club & Golf', label: 'Country Club & Golf' },
  { value: 'Village Center', label: 'Village Center' },
  { value: 'East Lanes & Circuit', label: 'East Lanes & Circuit' },
];

const FEATURE_OPTIONS: MeceBucketOption[] = [
  { value: 'pool_yes', label: 'Has Pool' },
  { value: 'pool_no', label: 'No Pool' },
  { value: 'wf_yes', label: 'Waterfront' },
  { value: 'wf_no', label: 'Inland' },
  { value: 'own_2nd', label: '2nd-Home / Out-of-Town' },
  { value: 'own_local', label: 'Local Owner' },
];

const LOT_COLORS: Record<
  ParcelStatusCategory,
  { label: string; fill: string; stroke: string; badge: string }
> = {
  for_sale: { label: 'For Sale', fill: '#f28b82', stroke: '#c5221f', badge: '#ea4335' },
  built_3yr: { label: 'Built ≤3 Yrs', fill: '#fde293', stroke: '#b06000', badge: '#f9ab00' },
  sold_3yr: { label: 'Sold ≤3 Yrs', fill: '#81c995', stroke: '#137333', badge: '#34a853' },
  other: { label: 'Off-Market', fill: '#ebedf2', stroke: '#d2d7e0', badge: '#80868b' },
};

const POI_LOT_COLOR: Record<VillagePoiKind, { fill: string; stroke: string; text: string }> = {
  golf: { fill: '#c6e9cf', stroke: '#81c995', text: '#188038' },
  park: { fill: '#ceead6', stroke: '#81c995', text: '#188038' },
  beach: { fill: '#fde68a', stroke: '#f59e0b', text: '#b45309' },
  public: { fill: '#e0e7ff', stroke: '#a5b4fc', text: '#4338ca' },
  dining: { fill: '#ffedd5', stroke: '#fdba74', text: '#c2410c' },
  shop: { fill: '#ede9fe', stroke: '#c4b5fd', text: '#6d28d9' },
};

function parcelPriceBucket(val?: number | null): string {
  const v = val ?? 0;
  if (v < 1_000_000) return 'p1';
  if (v < 2_000_000) return 'p2';
  if (v < 3_000_000) return 'p3';
  return 'p4';
}

function parcelSizeBucket(p: VillageParcel): string {
  const sf = p.sqft ?? (p.beds ? p.beds * 620 : 1950);
  if (sf < 1800) return 's1';
  if (sf < 2350) return 's2';
  if (sf < 3500) return 's3';
  return 's4';
}

function parcelLotBucket(acres: number): string {
  if (acres < 0.35) return 'l1';
  if (acres < 0.5) return 'l2';
  if (acres < 1.0) return 'l3';
  return 'l4';
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
  privacyBlur,
  onOpenListingDrawer,
  onSyncMetaUpdate,
}) => {
  const [bundle, setBundle] = useState<VillageParcelsBundle | null>(null);

  // Clean MECE Dropdown States
  const [statusSet, setStatusSet] = useState<Set<string>>(() => new Set());
  const [priceSet, setPriceSet] = useState<Set<string>>(() => new Set());
  const [sizeSet, setSizeSet] = useState<Set<string>>(() => new Set());
  const [lotSet, setLotSet] = useState<Set<string>>(() => new Set());
  const [areaSet, setAreaSet] = useState<Set<string>>(() => new Set());
  const [featureSet, setFeatureSet] = useState<Set<string>>(() => new Set());

  const [searchText, setSearchText] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<VillagePoi | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<VillageParcel | null>(null);
  const [dossiersByAddr, setDossiersByAddr] = useState<Record<string, OffMarketDossier>>({});
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const [view, setView] = useState({
    zoom: 1.26,
    centerLon: -72.9408,
    centerLat: 40.7528,
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
    startLon: -72.9408,
    startLat: 40.7528,
    startBearing: 0,
  });

  useEffect(() => {
    let active = true;
    fetch('/data/bellport-parcels.json')
      .then((r) => r.json() as Promise<VillageParcelsBundle>)
      .then((data) => {
        if (!active) return;
        setBundle(data);
        const firstSale = data.parcels.find((p) => p.cat === 'for_sale');
        if (firstSale) setSelectedParcelId(firstSale.id);
      })
      .catch((err) => console.error('Failed to load Bellport parcels:', err));
    return () => {
      active = false;
    };
  }, []);

  const hasAnyFilter =
    statusSet.size > 0 ||
    priceSet.size > 0 ||
    sizeSet.size > 0 ||
    lotSet.size > 0 ||
    areaSet.size > 0 ||
    featureSet.size > 0;

  const resetAllFilters = () => {
    setStatusSet(new Set());
    setPriceSet(new Set());
    setSizeSet(new Set());
    setLotSet(new Set());
    setAreaSet(new Set());
    setFeatureSet(new Set());
  };

  const matchedIds = useMemo(() => {
    const out = new Set<string>();
    if (!bundle || !hasAnyFilter) return out;

    for (const p of bundle.parcels) {
      if (!p.res && statusSet.size === 0 && priceSet.size > 0) continue;
      if (statusSet.size > 0 && !statusSet.has(p.cat)) continue;
      if (priceSet.size > 0 && (!p.val || !priceSet.has(parcelPriceBucket(p.val)))) continue;
      if (sizeSet.size > 0 && (!p.res || !sizeSet.has(parcelSizeBucket(p)))) continue;
      if (lotSet.size > 0 && !lotSet.has(parcelLotBucket(p.acres))) continue;
      if (areaSet.size > 0 && !areaSet.has(p.area)) continue;

      if (featureSet.size > 0) {
        const wantPool = featureSet.has('pool_yes');
        const wantNoPool = featureSet.has('pool_no');
        if (wantPool !== wantNoPool && (wantPool ? !p.pool : p.pool)) continue;

        const wantWf = featureSet.has('wf_yes');
        const wantNoWf = featureSet.has('wf_no');
        if (wantWf !== wantNoWf && (wantWf ? !p.waterfront : p.waterfront)) continue;

        const want2nd = featureSet.has('own_2nd');
        const wantLocal = featureSet.has('own_local');
        if (want2nd !== wantLocal && (want2nd ? !p.absentee : p.absentee)) continue;
      }

      out.add(p.id);
    }
    return out;
  }, [bundle, hasAnyFilter, statusSet, priceSet, sizeSet, lotSet, areaSet, featureSet]);

  const listingById = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of listings) m.set(l.id, l);
    return m;
  }, [listings]);

  const searchMatches = useMemo(() => {
    if (!bundle || !searchText.trim()) return [];
    const q = searchText.trim().toLowerCase();
    return bundle.parcels.filter((p) => p.addr.toLowerCase().includes(q)).slice(0, 7);
  }, [bundle, searchText]);

  const selectedParcel = useMemo(() => {
    if (!bundle || !selectedParcelId) return null;
    return bundle.parcels.find((p) => p.id === selectedParcelId) ?? null;
  }, [bundle, selectedParcelId]);

  const matchedListing = selectedParcel?.listingId
    ? (listingById.get(selectedParcel.listingId) ?? null)
    : null;

  const projectWith = useCallback(
    (
      lon: number,
      lat: number,
      width: number,
      height: number,
      v: typeof view
    ): [number, number] => {
      const pxLon = (width / 0.036) * v.zoom;
      const pxLat = pxLon / 0.7575;
      const dx = (lon - v.centerLon) * pxLon;
      const dy = -(lat - v.centerLat) * pxLat;
      const rad = (v.bearing * Math.PI) / 180;
      const cosB = Math.cos(rad);
      const sinB = Math.sin(rad);
      return [width / 2 + dx * cosB - dy * sinB, height / 2 + dx * sinB + dy * cosB];
    },
    []
  );

  const unprojectWith = useCallback(
    (
      sx: number,
      sy: number,
      width: number,
      height: number,
      v: typeof view
    ): [number, number] => {
      const pxLon = (width / 0.036) * v.zoom;
      const pxLat = pxLon / 0.7575;
      const rx = sx - width / 2;
      const ry = sy - height / 2;
      const rad = (-v.bearing * Math.PI) / 180;
      const cosB = Math.cos(rad);
      const sinB = Math.sin(rad);
      const dx = rx * cosB - ry * sinB;
      const dy = rx * sinB + ry * cosB;
      return [v.centerLon + dx / pxLon, v.centerLat - dy / pxLat];
    },
    []
  );

  const selectAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !bundle) return;
      const rect = canvas.getBoundingClientRect();
      const [lon, lat] = unprojectWith(
        clientX - rect.left,
        clientY - rect.top,
        rect.width,
        rect.height,
        viewRef.current
      );
      for (const p of bundle.parcels) {
        if (p.rings.some((r) => pointInRing(lon, lat, r))) {
          const linkedPoi = (bundle.pois ?? []).find((poi) => poi.parcelId === p.id) ?? null;
          if (linkedPoi && !p.res) {
            setSelectedPoi(linkedPoi);
            setSelectedParcelId(p.id);
          } else {
            setSelectedPoi(null);
            setSelectedParcelId(p.id);
          }
          setDossierError(null);
          return;
        }
      }
    },
    [bundle, unprojectWith]
  );

  // Native Mobile Two-Finger Pinch-to-Zoom + 1-Finger Pan & Tap (touch-action: none)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let touchState: {
      count: number;
      moved: boolean;
      startX: number;
      startY: number;
      lastMidX: number;
      lastMidY: number;
      lastDist: number;
      lastAngle: number;
    } = {
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

        const pxLon = (rect.width / 0.036) * cur.zoom;
        const pxLat = pxLon / 0.7575;
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
        const nextZoom = Math.max(0.9, Math.min(12, cur.zoom * scale));

        let dAngleDeg = ((angle - touchState.lastAngle) * 180) / Math.PI;
        if (dAngleDeg > 180) dAngleDeg -= 360;
        if (dAngleDeg < -180) dAngleDeg += 360;
        const nextBearing =
          Math.abs(dAngleDeg) > 0.8 ? (cur.bearing + dAngleDeg + 360) % 360 : cur.bearing;

        // Keep world coordinate under previous pinch midpoint anchored at new pinch midpoint
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
        const pxLon = (rect.width / 0.036) * nextZoom;
        const pxLat = pxLon / 0.7575;
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
  }, [selectAtClientPoint, unprojectWith]);

  // Lot-Colored Clean Google-Maps Vector Renderer (ZERO Dots!)
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

    // 1. Outside-Village Muted Gray Land + Inside-Village Clean Alabaster + Exact Bay Water
    ctx.fillStyle = '#e3e6eb';
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
    ctx.fillStyle = '#f8f9fa';
    ctx.fill();
    ctx.restore();

    if (bundle.waterRings && bundle.waterRings.length > 0) {
      ctx.save();
      for (const wr of bundle.waterRings) {
        traceRing(wr);
        ctx.fillStyle = '#aadaff';
        ctx.fill();
        ctx.strokeStyle = '#8cc3f0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Color the Exact Polygon Shape of EVERY Lot (Zero Dots!)
    for (const p of bundle.parcels) {
      const isMatch = matchedIds.has(p.id);
      const dimmed = hasAnyFilter && !isMatch;

      let fill = LOT_COLORS[p.cat].fill;
      let stroke = LOT_COLORS[p.cat].stroke;
      let lw = p.cat === 'other' ? 0.65 : 1.15;

      if (p.cat === 'other') {
        if (p.poiKind) {
          fill = POI_LOT_COLOR[p.poiKind].fill;
          stroke = POI_LOT_COLOR[p.poiKind].stroke;
        } else if (p.cls === '552') {
          fill = '#c6e9cf';
          stroke = '#81c995';
        } else if (p.cls.startsWith('5') || p.cls.startsWith('9') || p.cls.startsWith('8')) {
          fill = '#ceead6';
          stroke = '#9ad4a8';
        } else if (p.cls.startsWith('4')) {
          fill = '#f1eff8';
          stroke = '#d0c9e8';
        }
      }

      if (isMatch) {
        fill = p.cat === 'other' ? '#bfd6fb' : fill;
        stroke = '#1a73e8';
        lw = 1.8;
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

      // Subtle 2D rooftop footprint nested inside the colored lot
      if (p.bldgs && p.bldgs.length > 0 && view.zoom >= 1.35) {
        ctx.fillStyle =
          p.cat === 'for_sale'
            ? '#ea4335'
            : p.cat === 'built_3yr'
              ? '#fbbc04'
              : p.cat === 'sold_3yr'
                ? '#34a853'
                : isMatch
                  ? '#93baf8'
                  : 'rgba(148, 163, 184, 0.35)';
        for (const br of p.bldgs) {
          traceRing(br);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 3. Google-Maps Cased White Roads
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const roadScale = Math.max(0.85, Math.min(2.6, Math.pow(view.zoom, 0.65)));

    for (const st of bundle.streets) {
      const isArt = /Main St|South Country/i.test(st.name);
      const isCol = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(st.name);
      ctx.strokeStyle = isArt ? '#e5c585' : '#dadce0';
      ctx.lineWidth = (isArt ? 6.8 : isCol ? 4.8 : 3.2) * roadScale;
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
      const isArt = /Main St|South Country/i.test(st.name);
      const isCol = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(st.name);
      ctx.strokeStyle = isArt ? '#fef3c7' : '#ffffff';
      ctx.lineWidth = (isArt ? 5.2 : isCol ? 3.5 : 2.1) * roadScale;
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

    // 4. Exterior Greyed-Out Veil Outside Incorporated Bellport Village Border
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
      ctx.fillStyle = 'rgba(214, 219, 227, 0.56)';
      ctx.fill('evenodd');

      for (const ring of bundle.boundaryRings) {
        traceRing(ring);
        ctx.strokeStyle = '#80868b';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 5. Hovered & Selected Lot Boundary Outlines
    for (const [parcel, color, lw] of [
      [hoveredParcel, '#3c4043', 1.8],
      [selectedParcel, '#1a73e8', 2.6],
    ] as Array<[VillageParcel | null, string, number]>) {
      if (!parcel) continue;
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

    // 6. Clean Inline Street & Place Labels (Collision-Free, Zero Dots!)
    const placed: Array<[number, number, number, number]> = [];
    const canPlace = (cx: number, cy: number, bw: number, bh: number): boolean => {
      if (cx < 36 || cx > width - 36 || cy < 18 || cy > height - 18) return false;
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
    ctx.font = '500 10.5px "Google Sans Text", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (view.zoom >= 1.75) {
      for (const st of bundle.streets) {
        const isPrimary =
          /Main St|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit/i.test(
            st.name
          );
        if (!isPrimary && view.zoom < 2.35) continue;
        const longest = st.segments.reduce(
          (best, cur) => (cur.length > best.length ? cur : best),
          st.segments[0] ?? []
        );
        if (longest.length < 2) continue;
        const mid = Math.floor(longest.length / 2);
        const pA = longest[Math.max(0, mid - 1)];
        const pB = longest[Math.min(longest.length - 1, mid + 1)];
        const [ax, ay] = projectWith(pA[0], pA[1], width, height, view);
        const [bx, by] = projectWith(pB[0], pB[1], width, height, view);
        const segPx = Math.hypot(bx - ax, by - ay);
        const tw = ctx.measureText(st.name).width;
        if (segPx < tw * 0.7 && view.zoom < 2.8) continue;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        if (!canPlace(mx, my, tw + 26, 22)) continue;

        let ang = Math.atan2(by - ay, bx - ax);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;

        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(st.name, 0, 0);
        ctx.fillStyle = '#5f6368';
        ctx.fillText(st.name, 0, 0);
        ctx.restore();
      }
    }

    // Pure text labels over colored Park/Golf/Beach/Shop lots (Zero Dots, zoom-progressive!)
    const [bayX, bayY] = projectWith(-72.9415, 40.7425, width, height, view);
    if (canPlace(bayX, bayY, 90, 20)) {
      ctx.font = 'italic 500 11.5px Georgia, serif';
      ctx.fillStyle = '#3b78a8';
      ctx.fillText('Bellport Bay', bayX, bayY);
    }

    if (view.zoom >= 1.75) {
      for (const poi of bundle.pois ?? []) {
        const isLandmark =
          poi.id === 'poi-golf' ||
          poi.id === 'poi-ferry' ||
          poi.id === 'poi-mothers-beach' ||
          poi.id === 'poi-osborn-park' ||
          poi.id === 'poi-gateway';
        if (!isLandmark && view.zoom < 2.35) continue;
        const [px, py] = projectWith(poi.lon, poi.lat, width, height, view);
        const shortName = poi.name
          .replace(' & 18-Hole Golf Course', '')
          .replace('Whalehouse Point ', '');
        ctx.font = '500 10.5px "Google Sans Text", Roboto, system-ui, sans-serif';
        const tw = ctx.measureText(shortName).width;
        if (!canPlace(px, py, tw + 14, 16)) continue;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(shortName, px, py);
        ctx.fillStyle = POI_LOT_COLOR[poi.kind].text;
        ctx.fillText(shortName, px, py);
      }
    }
    ctx.restore();

    ctx.restore();
  }, [bundle, hasAnyFilter, matchedIds, hoveredParcel, selectedParcel, projectWith, view]);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [lonBefore, latBefore] = unprojectWith(mx, my, rect.width, rect.height, view);

    const factor = e.deltaY < 0 ? 1.22 : 1 / 1.22;
    const nextZoom = Math.max(0.9, Math.min(12, view.zoom * factor));

    const pxLon = (rect.width / 0.036) * nextZoom;
    const pxLat = pxLon / 0.7575;
    const rx = mx - rect.width / 2;
    const ry = my - rect.height / 2;
    const rad = (-view.bearing * Math.PI) / 180;
    const dx = rx * Math.cos(rad) - ry * Math.sin(rad);
    const dy = rx * Math.sin(rad) + ry * Math.cos(rad);

    setView((prev) => ({
      ...prev,
      zoom: nextZoom,
      centerLon: lonBefore - dx / pxLon,
      centerLat: latBefore + dy / pxLat,
    }));
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

    if (dragRef.current.mode !== 'none') {
      const dxScreen = e.clientX - dragRef.current.startX;
      const dyScreen = e.clientY - dragRef.current.startY;
      if (Math.hypot(dxScreen, dyScreen) > 3) dragRef.current.moved = true;

      if (dragRef.current.mode === 'rotate') {
        const nextBearing = (dragRef.current.startBearing + dxScreen * 0.55 + 360) % 360;
        setView((prev) => ({ ...prev, bearing: Math.round(nextBearing) }));
        return;
      }

      const pxLon = (rect.width / 0.036) * view.zoom;
      const pxLat = pxLon / 0.7575;
      const rad = (-view.bearing * Math.PI) / 180;
      const dxUnrot = dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad);
      const dyUnrot = dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad);

      setView((prev) => ({
        ...prev,
        centerLon: dragRef.current.startLon - dxUnrot / pxLon,
        centerLat: dragRef.current.startLat + dyUnrot / pxLat,
      }));
      return;
    }

    const [lon, lat] = unprojectWith(
      e.clientX - rect.left,
      e.clientY - rect.top,
      rect.width,
      rect.height,
      view
    );
    const hit = bundle.parcels.find((p) => p.rings.some((r) => pointInRing(lon, lat, r))) ?? null;
    setHoveredParcel(hit);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.mode = 'none';
    if (!wasMoved && e.button === 0) {
      selectAtClientPoint(e.clientX, e.clientY);
    }
  };

  const focusParcelById = (pid: string) => {
    if (!bundle) return;
    const found = bundle.parcels.find((p) => p.id === pid);
    if (!found) return;
    setSelectedPoi(null);
    setSelectedParcelId(found.id);
    setSearchText('');
    setView((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom, 3.4),
      centerLon: found.lon,
      centerLat: found.lat,
    }));
  };

  const handleFetchDossier = async (addr: string) => {
    setDossierLoading(true);
    setDossierError(null);
    try {
      const res = await fetch('/api/parcel-dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const data = (await res.json()) as {
        dossier?: OffMarketDossier;
        syncMeta?: SyncMetadata;
        error?: string;
      };
      if (!res.ok || !data.dossier) {
        throw new Error(data.error || 'Lookup unavailable.');
      }
      setDossiersByAddr((prev) => ({ ...prev, [addr]: data.dossier! }));
      if (data.syncMeta) onSyncMetaUpdate(data.syncMeta);
    } catch (err) {
      setDossierError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setDossierLoading(false);
    }
  };

  const activeDossier = selectedParcel ? dossiersByAddr[selectedParcel.addr] : undefined;

  if (!bundle) {
    return (
      <section className="results-band">
        <div className="container">
          <p style={{ color: 'var(--ink-2)' }}>Loading Bellport NY…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="results-band" aria-label="Bellport NY Beach House Map">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Lean Headline & Subheadline */}
        <div>
          <h1 style={{ fontSize: 'var(--fs-h2)', margin: 0 }}>Bellport NY</h1>
          <p style={{ color: 'var(--ink-2)', margin: '2px 0 0', fontSize: 16 }}>
            Search for a beach house
          </p>
        </div>

        {/* Clean Single-Row MECE Dropdown Menu Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <MeceFilterDropdown
              label="Status"
              options={STATUS_OPTIONS}
              selected={statusSet}
              onChange={setStatusSet}
            />
            <MeceFilterDropdown
              label="Price"
              options={PRICE_OPTIONS}
              selected={priceSet}
              onChange={setPriceSet}
            />
            <MeceFilterDropdown
              label="Size"
              options={SIZE_OPTIONS}
              selected={sizeSet}
              onChange={setSizeSet}
            />
            <MeceFilterDropdown
              label="Lot"
              options={LOT_OPTIONS}
              selected={lotSet}
              onChange={setLotSet}
            />
            <MeceFilterDropdown
              label="Area"
              options={AREA_OPTIONS}
              selected={areaSet}
              onChange={setAreaSet}
            />
            <MeceFilterDropdown
              label="Features"
              options={FEATURE_OPTIONS}
              selected={featureSet}
              onChange={setFeatureSet}
            />

            {hasAnyFilter && (
              <button
                type="button"
                className="icon-btn"
                onClick={resetAllFilters}
                style={{ height: 36 }}
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* Compact Lot Legend / Match Count */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
            {hasAnyFilter ? (
              <strong style={{ color: 'var(--accent)' }}>{matchedIds.size} matching lots</strong>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 2, background: '#f28b82' }}
                  />
                  For Sale ({bundle.counts.for_sale})
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 2, background: '#fde293' }}
                  />
                  Built ≤3y ({bundle.counts.built_3yr})
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 2, background: '#81c995' }}
                  />
                  Sold ≤3y ({bundle.counts.sold_3yr})
                </span>
              </>
            )}
          </div>
        </div>

        {/* Map + Lean Property Card */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 340px',
            gap: 16,
            alignItems: 'start',
          }}
          className="village-map-grid"
        >
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: '#e3e6eb',
              height: 580,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                cursor: 'grab',
                touchAction: 'none',
              }}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                dragRef.current.mode = 'none';
                setHoveredParcel(null);
              }}
            />

            {/* Address Search */}
            <div style={{ position: 'absolute', top: 12, left: 12, width: 230, zIndex: 5 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 12, top: 11, color: '#5f6368' }}
                />
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search address…"
                  style={{
                    width: '100%',
                    height: 36,
                    paddingLeft: 34,
                    paddingRight: 10,
                    borderRadius: 999,
                    border: '1px solid #dadce0',
                    background: '#ffffff',
                    color: '#202124',
                    fontSize: 12,
                    boxShadow: '0 2px 6px rgba(60,64,67,0.14)',
                  }}
                />
              </div>
              {searchMatches.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    borderRadius: 14,
                    background: '#ffffff',
                    border: '1px solid #dadce0',
                    boxShadow: '0 4px 14px rgba(60,64,67,0.18)',
                    overflow: 'hidden',
                  }}
                >
                  {searchMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => focusParcelById(m.id)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        borderBottom: '1px solid #f1f3f4',
                        background: 'transparent',
                        color: '#202124',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{m.addr}</strong>
                      <span style={{ color: '#5f6368' }}>{m.acres} ac</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Minimal Zoom & Spin Pod */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: '#ffffff',
                padding: 6,
                borderRadius: 16,
                border: '1px solid #dadce0',
                boxShadow: '0 2px 6px rgba(60,64,67,0.14)',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="icon-btn"
                aria-label="Zoom in"
                style={{ color: '#202124', borderColor: 'transparent', width: 32, height: 32 }}
                onClick={() => setView((v) => ({ ...v, zoom: Math.min(12, v.zoom * 1.35) }))}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Zoom out"
                style={{ color: '#202124', borderColor: 'transparent', width: 32, height: 32 }}
                onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.9, v.zoom / 1.35) }))}
              >
                <Minus size={15} />
              </button>
              <div style={{ width: '100%', height: 1, background: '#f1f3f4' }} />
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="Rotate left"
                  style={{ color: '#202124', borderColor: 'transparent', width: 28, height: 28 }}
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
                  style={{ color: '#202124', borderColor: 'transparent', width: 28, height: 28 }}
                  onClick={() => setView((v) => ({ ...v, bearing: (v.bearing + 45) % 360 }))}
                >
                  <RotateCw size={13} />
                </button>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Reset North"
                style={{
                  color: '#202124',
                  borderColor: 'transparent',
                  height: 26,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
                onClick={() =>
                  setView({ zoom: 1.26, centerLon: -72.9408, centerLat: 40.7528, bearing: 0 })
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
                  background: '#ffffff',
                  color: '#202124',
                  border: '1px solid #dadce0',
                  boxShadow: '0 2px 6px rgba(60,64,67,0.14)',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                <strong>{hoveredParcel.poiName ?? hoveredParcel.addr}</strong> ·{' '}
                {hoveredParcel.acres} ac
                {hoveredParcel.val && hoveredParcel.res ? (
                  <span className="priv-val">
                    {' '}
                    · ${(hoveredParcel.val / 1_000_000).toFixed(2)}M
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* Lean Side Property Card */}
          <aside
            style={{
              borderRadius: 'var(--radius)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 580,
              overflowY: 'auto',
            }}
          >
            {selectedPoi ? (
              <>
                <h2 style={{ fontSize: 20, margin: 0 }}>{selectedPoi.name}</h2>
                <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>
                  {selectedPoi.addr}
                </p>
                <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{selectedPoi.desc}</p>
                <a
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedPoi.lat},${selectedPoi.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  style={{ justifyContent: 'center', textDecoration: 'none' }}
                >
                  <MapPin size={14} />
                  <span>Street View</span>
                  <ExternalLink size={12} />
                </a>
              </>
            ) : !selectedParcel ? (
              <p style={{ color: 'var(--ink-2)', fontSize: 13 }}>Tap any lot on the map.</p>
            ) : (
              <>
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span
                      className="badge"
                      style={{
                        background: LOT_COLORS[selectedParcel.cat].badge,
                        color: selectedParcel.cat === 'built_3yr' ? '#202124' : '#ffffff',
                        border: 'none',
                      }}
                    >
                      {LOT_COLORS[selectedParcel.cat].label}
                    </span>
                    {matchedListing && (() => {
                      const val = evaluateGoodDeal(matchedListing, listings);
                      return (
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
                      );
                    })()}
                  </div>
                  <h2 style={{ fontSize: 20, margin: '2px 0' }}>{selectedParcel.addr}</h2>
                  <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>
                    {selectedParcel.area}
                    {matchedListing ? ` · ${matchedListing.style}` : ''}
                  </p>
                  {matchedListing && (matchedListing.styleSummary || matchedListing.headline) && (
                    <p style={{ fontSize: 12.5, lineHeight: 1.45, margin: '6px 0 0', color: 'var(--ink)' }}>
                      {matchedListing.styleSummary ?? matchedListing.headline}
                    </p>
                  )}
                </div>

                {matchedListing?.photoUrl && (
                  <div
                    style={{
                      borderRadius: 12,
                      overflow: 'hidden',
                      aspectRatio: '16 / 10',
                      cursor: 'pointer',
                      border: '1px solid var(--line)',
                    }}
                    onClick={() => onOpenListingDrawer(matchedListing.id)}
                  >
                    <img
                      src={matchedListing.photoUrl}
                      alt={selectedParcel.addr}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    padding: 12,
                    borderRadius: 12,
                    background: 'var(--bg-band)',
                    border: '1px solid var(--line)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                      {selectedParcel.cat === 'for_sale' ? 'Price' : 'Est. Value'}
                    </span>
                    <strong className="priv-val" style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.val ? `$${selectedParcel.val.toLocaleString()}` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Lot</span>
                    <strong style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.acres} ac
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Size</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.beds ? `${selectedParcel.beds} bd · ` : ''}
                      {selectedParcel.sqft ? `${selectedParcel.sqft.toLocaleString()} ft²` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Year</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.yr ?? '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Marina Walk</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.walkMin} min
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Last Sale</span>
                    <strong className="priv-val" style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.soldPrice
                        ? `$${Math.round(selectedParcel.soldPrice / 1000)}k (${selectedParcel.soldDate?.slice(0, 4)})`
                        : selectedParcel.soldDate ?? '—'}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedParcel.pool && <span className="tag-pill">Pool</span>}
                  {selectedParcel.waterfront && <span className="tag-pill">Waterfront</span>}
                  {selectedParcel.absentee && <span className="tag-pill">2nd-Home Owner</span>}
                  {selectedParcel.mail && (
                    <span className="tag-pill">Tax Mail: {selectedParcel.mail}</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matchedListing && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => onOpenListingDrawer(matchedListing.id)}
                    >
                      <span>View Photos &amp; Details</span>
                    </button>
                  )}

                  {!matchedListing && selectedParcel.res && (
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ justifyContent: 'center' }}
                      disabled={dossierLoading}
                      onClick={() => void handleFetchDossier(selectedParcel.addr)}
                    >
                      <History size={14} />
                      <span>
                        {dossierLoading
                          ? 'Loading…'
                          : activeDossier
                            ? 'Past History Loaded'
                            : 'Load Past Sales & Taxes'}
                      </span>
                    </button>
                  )}

                  <a
                    href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedParcel.lat},${selectedParcel.lon}`}
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

                {dossierError && (
                  <p style={{ fontSize: 12, color: 'var(--g-red-600)', margin: 0 }}>
                    {dossierError}
                  </p>
                )}

                {activeDossier && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      background: 'var(--bg-band)',
                      border: '1px solid var(--line)',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    {activeDossier.propertyHistory.slice(0, 5).map((ev, i) => (
                      <div
                        key={`${ev.date}-${i}`}
                        className="priv-val"
                        style={{ display: 'flex', justifyContent: 'space-between' }}
                      >
                        <span>
                          {ev.date} · {ev.event}
                        </span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>
                          {ev.price ? `$${ev.price.toLocaleString()}` : '—'}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
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
