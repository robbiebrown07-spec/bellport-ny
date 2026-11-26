import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  ExternalLink,
  History,
  Layers,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Sparkles,
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

interface VillageParcelMapViewProps {
  listings: Listing[];
  privacyBlur: boolean;
  onOpenListingDrawer: (listingId: string) => void;
  onSyncMetaUpdate: (meta: SyncMetadata) => void;
}

type FeatureKey =
  | 'est4br'
  | 'under3m'
  | 'under15m'
  | 'notSoldRecent'
  | 'offMarketOnly'
  | 'pool'
  | 'halfAcre'
  | 'oneAcre'
  | 'waterfront'
  | 'historic'
  | 'ferryWalk'
  | 'absentee';

type OutlineTarget = 'home' | 'lot';

const FEATURE_CHIPS: Array<{ key: FeatureKey; label: string }> = [
  { key: 'est4br', label: '4+ BR (or 2,350+ ft²)' },
  { key: 'under3m', label: '< $3M Est.' },
  { key: 'under15m', label: '< $1.5M Est.' },
  { key: 'notSoldRecent', label: 'Not Sold ≤3 Yrs' },
  { key: 'offMarketOnly', label: 'Off-Market Only' },
  { key: 'pool', label: 'Pool' },
  { key: 'halfAcre', label: '0.5+ Acre' },
  { key: 'oneAcre', label: '1.0+ Acre' },
  { key: 'waterfront', label: 'Waterfront' },
  { key: 'historic', label: 'Historic Lanes' },
  { key: 'ferryWalk', label: '< 8m to Ferry' },
  { key: 'absentee', label: 'NYC / 2nd Home' },
];

const CATEGORY_META: Record<
  ParcelStatusCategory,
  {
    label: string;
    dot: string;
    lotFill: string;
    bldgFill: string;
    bldgStroke: string;
  }
> = {
  for_sale: {
    label: 'For Sale',
    dot: '#ea4335',
    lotFill: 'rgba(234, 67, 53, 0.13)',
    bldgFill: '#ea4335',
    bldgStroke: '#b31412',
  },
  built_3yr: {
    label: 'Built ≤3 Yrs',
    dot: '#f9ab00',
    lotFill: 'rgba(251, 188, 4, 0.18)',
    bldgFill: '#fbbc04',
    bldgStroke: '#b06000',
  },
  sold_3yr: {
    label: 'Sold ≤3 Yrs',
    dot: '#34a853',
    lotFill: 'rgba(52, 168, 83, 0.14)',
    bldgFill: '#34a853',
    bldgStroke: '#137333',
  },
  other: {
    label: 'Other Homes',
    dot: '#9aa0a6',
    lotFill: 'transparent',
    bldgFill: '#e4e7ec',
    bldgStroke: '#c8cdd5',
  },
};

const POI_STYLE: Record<VillagePoiKind, { color: string; categoryLabel: string }> = {
  golf: { color: '#188038', categoryLabel: 'Golf Course' },
  beach: { color: '#1967d2', categoryLabel: 'Beach & Ferry' },
  park: { color: '#188038', categoryLabel: 'Park & Preserve' },
  public: { color: '#5f6368', categoryLabel: 'Civic & Cultural' },
  dining: { color: '#e37400', categoryLabel: 'Restaurant / Cafe' },
  shop: { color: '#1a73e8', categoryLabel: 'Village Store' },
};

function matchesFeatureSet(p: VillageParcel, active: Set<FeatureKey>): boolean {
  if (active.size === 0) return false;
  for (const k of active) {
    if (k === 'est4br' && !p.est4br) return false;
    if (k === 'under3m' && (!p.res || !p.val || p.val >= 3_000_000)) return false;
    if (k === 'under15m' && (!p.res || !p.val || p.val >= 1_500_000)) return false;
    if (k === 'notSoldRecent' && p.sold3yr) return false;
    if (k === 'offMarketOnly' && p.cat === 'for_sale') return false;
    if (k === 'pool' && !p.pool) return false;
    if (k === 'halfAcre' && p.acres < 0.5) return false;
    if (k === 'oneAcre' && p.acres < 1.0) return false;
    if (k === 'waterfront' && !p.waterfront) return false;
    if (k === 'historic' && !p.historic) return false;
    if (k === 'ferryWalk' && p.walkMin > 8) return false;
    if (k === 'absentee' && !p.absentee) return false;
  }
  return true;
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
  const [aerialImg, setAerialImg] = useState<HTMLImageElement | null>(null);
  // Default to clean Google Maps vector style!
  const [basemap, setBasemap] = useState<'clean' | 'aerial'>('clean');
  const [catFilter, setCatFilter] = useState<ParcelStatusCategory | 'all'>('all');
  // Start calm with zero feature outlines active until user clicks a chip or preset
  const [activeFeatures, setActiveFeatures] = useState<Set<FeatureKey>>(() => new Set());
  const [outlineTarget, setOutlineTarget] = useState<OutlineTarget>('home');
  const [showPoiDots, setShowPoiDots] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<VillagePoi | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<VillageParcel | null>(null);
  const [hoveredPoi, setHoveredPoi] = useState<VillagePoi | null>(null);
  const [dossiersByAddr, setDossiersByAddr] = useState<Record<string, OffMarketDossier>>({});
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  const [view, setView] = useState({
    zoom: 1.25,
    centerLon: -72.9408,
    centerLat: 40.7528,
    bearing: 0,
  });

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

    const img = new Image();
    img.onload = () => {
      if (active) setAerialImg(img);
    };
    img.src = '/data/bellport-aerial.webp';

    return () => {
      active = false;
    };
  }, []);

  const listingById = useMemo(() => {
    const m = new Map<string, Listing>();
    for (const l of listings) m.set(l.id, l);
    return m;
  }, [listings]);

  const matchedIds = useMemo(() => {
    const out = new Set<string>();
    if (!bundle || activeFeatures.size === 0) return out;
    for (const p of bundle.parcels) {
      if (catFilter !== 'all' && p.cat !== catFilter) continue;
      if (matchesFeatureSet(p, activeFeatures)) out.add(p.id);
    }
    return out;
  }, [bundle, activeFeatures, catFilter]);

  const searchMatches = useMemo(() => {
    if (!bundle || !searchText.trim()) return [];
    const q = searchText.trim().toLowerCase();
    return bundle.parcels
      .filter(
        (p) =>
          p.addr.toLowerCase().includes(q) ||
          (p.mail && p.mail.toLowerCase().includes(q)) ||
          (p.owner && !privacyBlur && p.owner.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [bundle, searchText, privacyBlur]);

  const selectedParcel = useMemo(() => {
    if (!bundle || !selectedParcelId) return null;
    return bundle.parcels.find((p) => p.id === selectedParcelId) ?? null;
  }, [bundle, selectedParcelId]);

  const matchedListing = selectedParcel?.listingId
    ? (listingById.get(selectedParcel.listingId) ?? null)
    : null;

  const project = useCallback(
    (lon: number, lat: number, width: number, height: number): [number, number] => {
      const cosLat = 0.7575;
      const pxPerDegLon = (width / 0.036) * view.zoom;
      const pxPerDegLat = pxPerDegLon / cosLat;
      const dx = (lon - view.centerLon) * pxPerDegLon;
      const dy = -(lat - view.centerLat) * pxPerDegLat;
      const rad = (view.bearing * Math.PI) / 180;
      const cosB = Math.cos(rad);
      const sinB = Math.sin(rad);
      return [width / 2 + dx * cosB - dy * sinB, height / 2 + dx * sinB + dy * cosB];
    },
    [view]
  );

  const unproject = useCallback(
    (sx: number, sy: number, width: number, height: number): [number, number] => {
      const cosLat = 0.7575;
      const pxPerDegLon = (width / 0.036) * view.zoom;
      const pxPerDegLat = pxPerDegLon / cosLat;
      const rx = sx - width / 2;
      const ry = sy - height / 2;
      const rad = (-view.bearing * Math.PI) / 180;
      const cosB = Math.cos(rad);
      const sinB = Math.sin(rad);
      const dx = rx * cosB - ry * sinB;
      const dy = rx * sinB + ry * cosB;
      return [view.centerLon + dx / pxPerDegLon, view.centerLat - dy / pxPerDegLat];
    },
    [view]
  );

  // Clean Google-Maps-Style Vector Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(460, Math.floor(rect.height));

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const isAerial = basemap === 'aerial' && Boolean(aerialImg);
    const cosLat = 0.7575;
    const pxPerDegLon = (width / 0.036) * view.zoom;
    const pxPerDegLat = pxPerDegLon / cosLat;
    const rad = (view.bearing * Math.PI) / 180;

    const traceRing = (ring: number[][]) => {
      ctx.beginPath();
      ring.forEach((pt, idx) => {
        const [px, py] = project(pt[0], pt[1], width, height);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };

    // 1. Base Canvas (Clean Google Maps Land or Optional Aerial)
    if (isAerial && aerialImg) {
      ctx.fillStyle = '#49505b';
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rad);
      const ab = bundle.aerialBounds;
      ctx.drawImage(
        aerialImg,
        (ab.west - view.centerLon) * pxPerDegLon,
        -(ab.north - view.centerLat) * pxPerDegLat,
        (ab.east - ab.west) * pxPerDegLon,
        (ab.north - ab.south) * pxPerDegLat
      );
      ctx.restore();
    } else {
      // Outside-Village Muted Gray Land
      ctx.fillStyle = '#e3e6eb';
      ctx.fillRect(0, 0, width, height);

      // Inside-Village Clean Google Maps Alabaster Land
      ctx.save();
      ctx.beginPath();
      for (const ring of bundle.boundaryRings ?? []) {
        ring.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
      ctx.fillStyle = '#f8f9fa';
      ctx.fill();
      ctx.restore();

      // Exact Great South Bay / Bellport Bay & Creek Water Polygons (#aadaff)
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
    }

    // 2. Parks, Golf Course & Subtle Property Lot Fills
    for (const p of bundle.parcels) {
      const dimmed = catFilter !== 'all' && p.cat !== catFilter;
      let lotFill = CATEGORY_META[p.cat].lotFill;

      if (p.cat === 'other') {
        if (p.cls === '552') {
          lotFill = isAerial ? 'rgba(52, 168, 83, 0.2)' : '#c8ebd0';
        } else if (p.cls.startsWith('5') || p.cls.startsWith('9') || p.cls.startsWith('8')) {
          lotFill = isAerial ? 'rgba(52, 168, 83, 0.18)' : '#d4f0db';
        } else if (p.cls.startsWith('4')) {
          lotFill = isAerial ? 'rgba(255,255,255,0.08)' : '#f1f3f5';
        }
      }

      if (matchedIds.has(p.id) && outlineTarget === 'lot') {
        lotFill = isAerial ? 'rgba(26, 115, 232, 0.24)' : 'rgba(26, 115, 232, 0.10)';
      }

      // Only draw subtle property lot lines when zoomed in (prevents spiderweb clutter!)
      const showSubtleLotLines = view.zoom >= 1.55 || p.cat !== 'other';
      if (lotFill === 'transparent' && !showSubtleLotLines) continue;

      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.22;
      for (const ring of p.rings) {
        traceRing(ring);
        if (lotFill !== 'transparent') {
          ctx.fillStyle = lotFill;
          ctx.fill();
        }
        if (showSubtleLotLines) {
          ctx.strokeStyle = isAerial
            ? 'rgba(255,255,255,0.28)'
            : view.zoom >= 2.3
              ? '#dadce0'
              : 'rgba(210, 214, 220, 0.55)';
          ctx.lineWidth = view.zoom >= 2.3 ? 0.85 : 0.55;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 3. Google-Maps-Style Cased Roads (Casing Pass -> Clean White Fill Pass)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const roadScale = Math.max(0.85, Math.min(2.6, Math.pow(view.zoom, 0.65)));

    // Pass A: Road Casing
    for (const st of bundle.streets) {
      const isArterial = /Main St|South Country/i.test(st.name);
      const isCollector = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(
        st.name
      );
      ctx.strokeStyle = isAerial
        ? 'rgba(15, 23, 42, 0.35)'
        : isArterial
          ? '#e5c585'
          : '#dadce0';
      ctx.lineWidth = (isArterial ? 7.2 : isCollector ? 5.2 : 3.6) * roadScale;
      for (const seg of st.segments) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        seg.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    }

    // Pass B: Crisp Road Fill
    for (const st of bundle.streets) {
      const isArterial = /Main St|South Country/i.test(st.name);
      const isCollector = /Station Rd|Country Club|Bellport Ln|Howells|Circuit|Bieselin/i.test(
        st.name
      );
      ctx.strokeStyle = isAerial
        ? 'rgba(255, 255, 255, 0.42)'
        : isArterial
          ? '#fef3c7'
          : '#ffffff';
      ctx.lineWidth = (isArterial ? 5.4 : isCollector ? 3.8 : 2.3) * roadScale;
      for (const seg of st.segments) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        seg.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
    }
    ctx.restore();

    // 4. Faded Outside-Village Buildings + Crisp Inside-Village 2D Home Shapes From Above
    if (!isAerial && bundle.outsideBldgs && view.zoom >= 1.35) {
      ctx.save();
      ctx.fillStyle = '#d5d9df';
      for (const bRing of bundle.outsideBldgs) {
        traceRing(bRing);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const p of bundle.parcels) {
      if (!p.bldgs || p.bldgs.length === 0) continue;
      const dimmed = catFilter !== 'all' && p.cat !== catFilter;
      const meta = CATEGORY_META[p.cat];
      const isMatchedHome = matchedIds.has(p.id) && outlineTarget === 'home';

      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.2;
      ctx.fillStyle = isMatchedHome
        ? p.cat === 'other'
          ? '#d2e3fc'
          : meta.bldgFill
        : isAerial && p.cat === 'other'
          ? 'rgba(255,255,255,0.22)'
          : meta.bldgFill;
      ctx.strokeStyle = isAerial && p.cat === 'other' ? 'rgba(255,255,255,0.45)' : meta.bldgStroke;
      ctx.lineWidth = p.cat === 'other' ? 0.65 : 1.1;

      for (const bRing of p.bldgs) {
        traceRing(bRing);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Exterior Greyed-Out Veil Outside Incorporated Bellport Village Border (ensures roads/edges outside stay muted!)
    if (bundle.boundaryRings && bundle.boundaryRings.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-20, -20, width + 40, height + 40);
      for (const ring of bundle.boundaryRings) {
        ring.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      }
      ctx.fillStyle = isAerial ? 'rgba(58, 64, 74, 0.56)' : 'rgba(216, 221, 228, 0.52)';
      ctx.fill('evenodd');

      // Clean Village municipal border line
      for (const ring of bundle.boundaryRings) {
        traceRing(ring);
        ctx.strokeStyle = isAerial ? '#ffffff' : '#80868b';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 6. Feature-Matched Outlines (NO CIRCLES — Crisp Line Around Home Shape or Property Lot!)
    if (matchedIds.size > 0) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const p of bundle.parcels) {
        if (!matchedIds.has(p.id)) continue;
        const targetRings =
          outlineTarget === 'home' && p.bldgs && p.bldgs.length > 0 ? [p.bldgs[0]] : p.rings;

        for (const r of targetRings) {
          traceRing(r);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3.6;
          ctx.stroke();
          ctx.strokeStyle = '#1a73e8';
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 7. Hovered & Selected Property Outlines (Exact Lot + Home Contour, Zero Circles)
    for (const [parcel, color, lw] of [
      [hoveredParcel, '#3c4043', 1.6],
      [selectedParcel, '#1a73e8', 2.4],
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
      if (parcel.bldgs && parcel.bldgs[0]) {
        traceRing(parcel.bldgs[0]);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 8. Clean Google-Maps Inline Angled Road Labels (No Dark Pill Boxes!)
    const placedBoxes: Array<[number, number, number, number]> = [];
    const canPlace = (cx: number, cy: number, w: number, h: number): boolean => {
      if (cx < 36 || cx > width - 36 || cy < 20 || cy > height - 20) return false;
      const b: [number, number, number, number] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
      if (
        placedBoxes.some(
          (x) => !(b[2] < x[0] || b[0] > x[2] || b[3] < x[1] || b[1] > x[3])
        )
      ) {
        return false;
      }
      placedBoxes.push(b);
      return true;
    };

    ctx.save();
    ctx.font = '500 10.5px "Google Sans Text", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const priorityStreets = [...bundle.streets].sort((a, b) => {
      const aMaj = /Main St|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit/i.test(
        a.name
      );
      const bMaj = /Main St|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit/i.test(
        b.name
      );
      return Number(bMaj) - Number(aMaj);
    });

    for (const st of priorityStreets) {
      const isPrimary =
        /Main St|Station Rd|Bellport Ln|Country Club|Howells|Shore Rd|Browns Ln|Circuit/i.test(
          st.name
        );
      if (!isPrimary && view.zoom < 1.95) continue;

      const longest = st.segments.reduce(
        (best, cur) => (cur.length > best.length ? cur : best),
        st.segments[0] ?? []
      );
      if (longest.length < 2) continue;
      const midIdx = Math.floor(longest.length / 2);
      const pA = longest[Math.max(0, midIdx - 1)];
      const pB = longest[Math.min(longest.length - 1, midIdx + 1)];
      const [ax, ay] = project(pA[0], pA[1], width, height);
      const [bx, by] = project(pB[0], pB[1], width, height);
      const segPx = Math.hypot(bx - ax, by - ay);
      const textW = ctx.measureText(st.name).width;
      if (segPx < textW * 0.7 && view.zoom < 2.8) continue;

      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      if (!canPlace(mx, my, textW + 26, 22)) continue;

      let angle = Math.atan2(by - ay, bx - ax);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;

      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = isAerial ? 'rgba(15, 23, 42, 0.85)' : '#ffffff';
      ctx.strokeText(st.name, 0, 0);
      ctx.fillStyle = isAerial ? '#f1f5f9' : '#5f6368';
      ctx.fillText(st.name, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // 9. Calm Google-Maps-Style POI Dots & Progressive Labels
    if (showPoiDots && bundle.pois) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Water label for Bellport Bay
      const [bayX, bayY] = project(-72.9415, 40.7425, width, height);
      if (canPlace(bayX, bayY, 90, 20)) {
        ctx.font = 'italic 500 11.5px "Google Sans Text", Georgia, serif';
        ctx.fillStyle = isAerial ? '#bae6fd' : '#3b78a8';
        ctx.fillText('Bellport Bay', bayX, bayY);
      }

      for (const poi of bundle.pois) {
        const isMainLandmark =
          poi.id === 'poi-golf' ||
          poi.id === 'poi-ferry' ||
          poi.id === 'poi-mothers-beach' ||
          poi.id === 'poi-osborn-park' ||
          poi.id === 'poi-gateway';

        // Hide crowded Main St shop/restaurant dots until zoomed in slightly (>= 1.45x), except hovered/selected
        const isActivePoi = selectedPoi?.id === poi.id || hoveredPoi?.id === poi.id;
        if (!isMainLandmark && !isActivePoi && view.zoom < 1.45) continue;

        const [px, py] = project(poi.lon, poi.lat, width, height);
        if (px < 10 || px > width - 10 || py < 10 || py > height - 10) continue;
        const st = POI_STYLE[poi.kind];
        const r = isActivePoi ? 6.5 : isMainLandmark ? 5 : 4;

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = st.color;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        const wantLabel =
          isActivePoi || isMainLandmark || (view.zoom >= 2.35 && canPlace(px, py + 13, 110, 16));
        if (wantLabel && (isActivePoi || canPlace(px, py + 13, 120, 18))) {
          const shortName = poi.name.replace(' & 18-Hole Golf Course', '').replace('Whalehouse Point ', '');
          ctx.font = '500 10.5px "Google Sans Text", Roboto, system-ui, sans-serif';
          ctx.lineWidth = 3;
          ctx.strokeStyle = isAerial ? 'rgba(15, 23, 42, 0.85)' : '#ffffff';
          ctx.strokeText(shortName, px, py + r + 8);
          ctx.fillStyle = isAerial ? '#ffffff' : st.color;
          ctx.fillText(shortName, px, py + r + 8);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [
    bundle,
    aerialImg,
    basemap,
    catFilter,
    matchedIds,
    outlineTarget,
    showPoiDots,
    selectedParcel,
    selectedPoi,
    hoveredParcel,
    hoveredPoi,
    project,
    view,
  ]);

  const findPoiAtScreenPoint = (clientX: number, clientY: number): VillagePoi | null => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle || !showPoiDots) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const poi of bundle.pois ?? []) {
      const [px, py] = project(poi.lon, poi.lat, rect.width, rect.height);
      if (Math.hypot(px - x, py - y) <= 10) return poi;
    }
    return null;
  };

  const findParcelAtPoint = (clientX: number, clientY: number): VillageParcel | null => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle) return null;
    const rect = canvas.getBoundingClientRect();
    const [lon, lat] = unproject(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height
    );
    for (const p of bundle.parcels) {
      for (const ring of p.rings) {
        if (pointInRing(lon, lat, ring)) return p;
      }
    }
    return null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const [lonBefore, latBefore] = unproject(mx, my, rect.width, rect.height);

    const factor = e.deltaY < 0 ? 1.22 : 1 / 1.22;
    const nextZoom = Math.max(0.9, Math.min(10, view.zoom * factor));

    const pxPerDegLon = (rect.width / 0.036) * nextZoom;
    const pxPerDegLat = pxPerDegLon / 0.7575;
    const rx = mx - rect.width / 2;
    const ry = my - rect.height / 2;
    const rad = (-view.bearing * Math.PI) / 180;
    const dx = rx * Math.cos(rad) - ry * Math.sin(rad);
    const dy = rx * Math.sin(rad) + ry * Math.cos(rad);

    setView((prev) => ({
      ...prev,
      zoom: nextZoom,
      centerLon: lonBefore - dx / pxPerDegLon,
      centerLat: latBefore + dy / pxPerDegLat,
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
    if (!canvas) return;
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

      const pxPerDegLon = (rect.width / 0.036) * view.zoom;
      const pxPerDegLat = pxPerDegLon / 0.7575;
      const rad = (-view.bearing * Math.PI) / 180;
      const dxUnrot = dxScreen * Math.cos(rad) - dyScreen * Math.sin(rad);
      const dyUnrot = dxScreen * Math.sin(rad) + dyScreen * Math.cos(rad);

      setView((prev) => ({
        ...prev,
        centerLon: dragRef.current.startLon - dxUnrot / pxPerDegLon,
        centerLat: dragRef.current.startLat + dyUnrot / pxPerDegLat,
      }));
      return;
    }

    const poiHit = findPoiAtScreenPoint(e.clientX, e.clientY);
    setHoveredPoi(poiHit);
    if (poiHit) {
      setHoveredParcel(null);
      return;
    }
    setHoveredParcel(findParcelAtPoint(e.clientX, e.clientY));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.mode = 'none';
    if (!wasMoved && e.button === 0) {
      const poiHit = findPoiAtScreenPoint(e.clientX, e.clientY);
      if (poiHit) {
        setSelectedPoi(poiHit);
        return;
      }
      const hit = findParcelAtPoint(e.clientX, e.clientY);
      if (hit) {
        setSelectedPoi(null);
        setSelectedParcelId(hit.id);
        setDossierError(null);
      }
    }
  };

  const toggleFeatureChip = (k: FeatureKey) => {
    setActiveFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const applyPreset = (keys: FeatureKey[]) => {
    setCatFilter('all');
    setActiveFeatures(new Set(keys));
  };

  const focusParcel = (p: VillageParcel) => {
    setSelectedPoi(null);
    setSelectedParcelId(p.id);
    setSearchText('');
    setView((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom, 3.4),
      centerLon: p.lon,
      centerLat: p.lat,
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
        throw new Error(data.error || 'Could not retrieve off-market dossier.');
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
          <p style={{ color: 'var(--ink-2)' }}>Loading clean Bellport Village map…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="results-band" aria-label="Bellport Village Property Map">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Clean Editorial Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span className="eyebrow">Bellport Village Map · 1,213 Properties</span>
            <h1 style={{ fontSize: 'var(--fs-h2)', margin: '4px 0 4px' }}>
              Every home in Bellport Village, mapped cleanly.
            </h1>
            <p style={{ color: 'var(--ink-2)', maxWidth: '64ch', margin: 0, fontSize: 14 }}>
              Zoom in to see individual house footprints, lot lines, and Main Street spots, or{' '}
              <strong>Shift+Drag</strong> to spin 360°. Select any feature below to trace matching
              homes or lots.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pill-toggle ${activeFeatures.has('est4br') && activeFeatures.has('under3m') ? 'is-active' : ''}`}
              onClick={() =>
                applyPreset(['est4br', 'under3m', 'notSoldRecent', 'offMarketOnly'])
              }
            >
              <Sparkles size={14} />
              <span>4+ BR · &lt;$3M · Not Sold Recently</span>
            </button>
            <button
              type="button"
              className="pill-toggle"
              onClick={() => applyPreset(['historic', 'pool', 'under3m'])}
            >
              <span>Historic Lanes + Pool</span>
            </button>
            {activeFeatures.size > 0 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setActiveFeatures(new Set())}
              >
                <RotateCcw size={13} />
                <span>Clear Highlights</span>
              </button>
            )}
          </div>
        </div>

        {/* Calm Two-Row Toolbar: Status Legend + Feature Outline Selector */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={`pill-toggle ${catFilter === 'all' ? 'is-active' : ''}`}
                style={{ height: 30, fontSize: 12 }}
                onClick={() => setCatFilter('all')}
              >
                All ({bundle.totalParcels.toLocaleString()})
              </button>
              {(['for_sale', 'built_3yr', 'sold_3yr', 'other'] as ParcelStatusCategory[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`pill-toggle ${catFilter === cat ? 'is-active' : ''}`}
                    style={{ height: 30, fontSize: 12 }}
                    onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: CATEGORY_META[cat].dot,
                        display: 'inline-block',
                      }}
                    />
                    <span>
                      {CATEGORY_META[cat].label} ({bundle.counts[cat].toLocaleString()})
                    </span>
                  </button>
                )
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              {matchedIds.size > 0 && (
                <strong style={{ color: 'var(--accent)' }}>
                  {matchedIds.size} {matchedIds.size === 1 ? 'property' : 'properties'} outlined
                </strong>
              )}
              <div className="segmented-tabs" role="group" aria-label="Outline geometry">
                <button
                  type="button"
                  className={`segmented-tabs__tab ${outlineTarget === 'home' ? 'is-active' : ''}`}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setOutlineTarget('home')}
                >
                  Outline: Home Shape
                </button>
                <button
                  type="button"
                  className={`segmented-tabs__tab ${outlineTarget === 'lot' ? 'is-active' : ''}`}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                  onClick={() => setOutlineTarget('lot')}
                >
                  Outline: Lot Line
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              paddingTop: 8,
              borderTop: '1px solid var(--line)',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--ink-2)', marginRight: 2 }}>
              Outline homes with:
            </span>
            {FEATURE_CHIPS.map((fc) => (
              <button
                key={fc.key}
                type="button"
                className={`pill-toggle ${activeFeatures.has(fc.key) ? 'is-active' : ''}`}
                style={{ height: 28, fontSize: 12, padding: '0 10px' }}
                onClick={() => toggleFeatureChip(fc.key)}
              >
                {fc.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clean Google-Maps Canvas + Property Dossier */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 365px',
            gap: 18,
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
              height: 620,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                dragRef.current.mode = 'none';
                setHoveredParcel(null);
                setHoveredPoi(null);
              }}
            />

            {/* Top-Left Google-Maps-Style Search Box */}
            <div style={{ position: 'absolute', top: 12, left: 12, width: 260, zIndex: 5 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 12, top: 11, color: '#5f6368' }}
                />
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search Bellport address…"
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
                    boxShadow: '0 2px 6px rgba(60,64,67,0.15)',
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
                      onClick={() => focusParcel(m)}
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
                        textAlign: 'left',
                      }}
                    >
                      <strong>{m.addr}</strong>
                      <span style={{ color: '#5f6368' }}>{m.acres} ac</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quiet Top-Right Controls */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="icon-btn"
                  style={{
                    background: '#ffffff',
                    color: '#202124',
                    borderColor: '#dadce0',
                    boxShadow: '0 1px 4px rgba(60,64,67,0.15)',
                    height: 32,
                    fontSize: 12,
                  }}
                  onClick={() => setShowPoiDots((v) => !v)}
                >
                  <span>{showPoiDots ? 'Places: On' : 'Places: Off'}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{
                    background: '#ffffff',
                    color: '#202124',
                    borderColor: '#dadce0',
                    boxShadow: '0 1px 4px rgba(60,64,67,0.15)',
                    height: 32,
                    fontSize: 12,
                  }}
                  onClick={() => setBasemap((b) => (b === 'clean' ? 'aerial' : 'clean'))}
                >
                  <Layers size={13} />
                  <span>{basemap === 'clean' ? 'Aerial' : 'Clean Map'}</span>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: '#ffffff',
                  padding: 6,
                  borderRadius: 16,
                  border: '1px solid #dadce0',
                  boxShadow: '0 2px 6px rgba(60,64,67,0.15)',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Zoom in"
                  style={{ color: '#202124', borderColor: 'transparent', width: 30, height: 30 }}
                  onClick={() => setView((v) => ({ ...v, zoom: Math.min(10, v.zoom * 1.35) }))}
                >
                  <Plus size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Zoom out"
                  style={{ color: '#202124', borderColor: 'transparent', width: 30, height: 30 }}
                  onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.9, v.zoom / 1.35) }))}
                >
                  <Minus size={15} />
                </button>
                <div style={{ width: '100%', height: 1, background: '#f1f3f4' }} />
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Spin left 45°"
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
                    title="Spin right 45°"
                    style={{ color: '#202124', borderColor: 'transparent', width: 28, height: 28 }}
                    onClick={() => setView((v) => ({ ...v, bearing: (v.bearing + 45) % 360 }))}
                  >
                    <RotateCw size={13} />
                  </button>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="Reset North & Overview"
                  style={{
                    color: '#202124',
                    borderColor: 'transparent',
                    height: 26,
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                  }}
                  onClick={() =>
                    setView({ zoom: 1.25, centerLon: -72.9408, centerLat: 40.7528, bearing: 0 })
                  }
                >
                  <Compass size={13} />
                  <span>{view.bearing ? `${view.bearing}°` : 'N'}</span>
                </button>
              </div>
            </div>

            {/* Subtle Hover Readout */}
            {(hoveredPoi || hoveredParcel) && (
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
                  boxShadow: '0 2px 6px rgba(60,64,67,0.16)',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                {hoveredPoi ? (
                  <>
                    <strong>{hoveredPoi.name}</strong> · {POI_STYLE[hoveredPoi.kind].categoryLabel}
                  </>
                ) : hoveredParcel ? (
                  <>
                    <strong>{hoveredParcel.addr}</strong> · {hoveredParcel.acres} ac
                    {hoveredParcel.val ? (
                      <span className="priv-val">
                        {' '}
                        · Est. ${(hoveredParcel.val / 1_000_000).toFixed(2)}M
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Right: Selected Property or Place Dossier */}
          <aside
            style={{
              borderRadius: 'var(--radius)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: 620,
              overflowY: 'auto',
            }}
          >
            {selectedPoi ? (
              <>
                <div>
                  <span
                    className="badge"
                    style={{
                      background: POI_STYLE[selectedPoi.kind].color,
                      color: '#ffffff',
                      border: 'none',
                      marginBottom: 8,
                    }}
                  >
                    {POI_STYLE[selectedPoi.kind].categoryLabel}
                  </span>
                  <h2 style={{ fontSize: 22, margin: '4px 0' }}>{selectedPoi.name}</h2>
                  <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>
                    {selectedPoi.addr}, Bellport Village
                  </p>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.55, margin: 0 }}>{selectedPoi.desc}</p>
                <a
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${selectedPoi.lat},${selectedPoi.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  style={{ justifyContent: 'center', textDecoration: 'none' }}
                >
                  <MapPin size={14} />
                  <span>Open Google Street View</span>
                  <ExternalLink size={12} />
                </a>
              </>
            ) : !selectedParcel ? (
              <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>
                Click any home or place on the Bellport Village map.
              </p>
            ) : (
              <>
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span
                      className="badge"
                      style={{
                        background: CATEGORY_META[selectedParcel.cat].dot,
                        color: selectedParcel.cat === 'built_3yr' ? '#202124' : '#ffffff',
                        border: 'none',
                      }}
                    >
                      {CATEGORY_META[selectedParcel.cat].label}
                    </span>
                    {matchedIds.has(selectedParcel.id) && (
                      <span className="badge badge--village">Outlined Match</span>
                    )}
                  </div>
                  <h2 style={{ fontSize: 22, margin: '0 0 4px' }}>{selectedParcel.addr}</h2>
                  <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0 }}>
                    {selectedParcel.area} · {selectedParcel.clsLabel} · SBL {selectedParcel.sbl}
                  </p>
                </div>

                {matchedListing?.photoUrl && (
                  <div
                    style={{
                      borderRadius: 14,
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
                    borderRadius: 14,
                    background: 'var(--bg-band)',
                    border: '1px solid var(--line)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                      {selectedParcel.cat === 'for_sale' ? 'Asking Price' : 'Est. Market Value'}
                    </span>
                    <strong className="priv-val" style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.val ? `$${selectedParcel.val.toLocaleString()}` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Lot Size</span>
                    <strong style={{ fontSize: 15, fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.acres} ac
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Bedrooms / Space</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.beds
                        ? `${selectedParcel.beds} bd (MLS)`
                        : selectedParcel.est4br
                          ? '~4+ BR est.'
                          : 'Res'}{' '}
                      · {selectedParcel.sqft ? `${selectedParcel.sqft.toLocaleString()} ft²` : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Year Built</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.yr ?? '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>Walk to Marina</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      ~{selectedParcel.walkMin} min
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                      Structures Mapped
                    </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.bldgs?.length ?? 0}{' '}
                      {(selectedParcel.bldgs?.length ?? 0) === 1 ? 'footprint' : 'footprints'}
                    </strong>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {selectedParcel.pool && <span className="tag-pill">Swimming pool</span>}
                  {selectedParcel.waterfront && <span className="tag-pill">Waterfront / Bay</span>}
                  {selectedParcel.historic && <span className="tag-pill">Historic Lanes</span>}
                  {selectedParcel.absentee && (
                    <span className="tag-pill">2nd-Home / Out-of-Town Owner</span>
                  )}
                  {selectedParcel.soldDate && (
                    <span className="tag-pill priv-val">
                      Last MLS sale: {selectedParcel.soldDate}
                      {selectedParcel.soldPrice
                        ? ` ($${Math.round(selectedParcel.soldPrice / 1000)}k)`
                        : ''}
                    </span>
                  )}
                </div>

                {(selectedParcel.owner || selectedParcel.mail) && (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid var(--line)',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ color: 'var(--ink-2)', marginBottom: 2 }}>
                      NYS Public Roll Owner &amp; Tax Billing Origin
                    </div>
                    <strong className="priv-val" style={{ display: 'block' }}>
                      {selectedParcel.owner ?? 'Recorded Owner'}
                    </strong>
                    {selectedParcel.mail && (
                      <span style={{ color: 'var(--ink-2)' }}>
                        Tax bill mailed to: <strong>{selectedParcel.mail}</strong>
                      </span>
                    )}
                  </div>
                )}

                {selectedParcel.pastRemarks && !matchedListing && (
                  <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 3 }}>
                      Archived Past MLS Description
                    </strong>
                    {selectedParcel.pastRemarks}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matchedListing && (
                    <button
                      type="button"
                      className="icon-btn icon-btn--primary"
                      style={{ justifyContent: 'center' }}
                      onClick={() => onOpenListingDrawer(matchedListing.id)}
                    >
                      <span>
                        Open Full Listing &amp; {matchedListing.photos?.length ?? 1} Photos
                      </span>
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
                          ? 'Fetching past MLS & deed history…'
                          : activeDossier
                            ? 'Refresh Off-Market History (Cached)'
                            : 'Pull Past MLS, Taxes & AVM (1 Credit)'}
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
                    <span>Open Google Street View</span>
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
                      padding: 12,
                      borderRadius: 14,
                      background: 'var(--bg-band)',
                      border: '1px solid var(--line)',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <strong>Deep Off-Market Dossier</strong>
                    {(activeDossier.archivedPhotos[0] ?? activeDossier.streetViewUrl) && (
                      <img
                        src={activeDossier.archivedPhotos[0] ?? activeDossier.streetViewUrl ?? ''}
                        alt={selectedParcel.addr}
                        style={{
                          width: '100%',
                          borderRadius: 10,
                          aspectRatio: '16 / 10',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    {activeDossier.avmEstimates.length > 0 && (
                      <div className="priv-val">
                        <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                          Institutional AVM Valuations:
                        </span>
                        {activeDossier.avmEstimates.map((a) => (
                          <div key={a.source} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{a.source}</span>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>
                              ${a.estimate.toLocaleString()}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeDossier.propertyHistory.length > 0 && (
                      <div>
                        <span style={{ color: 'var(--ink-2)', display: 'block' }}>
                          Past Sales &amp; MLS Events:
                        </span>
                        {activeDossier.propertyHistory.slice(0, 6).map((ev, i) => (
                          <div
                            key={`${ev.date}-${i}`}
                            className="priv-val"
                            style={{ display: 'flex', justifyContent: 'space-between' }}
                          >
                            <span>
                              {ev.date} · {ev.event} ({ev.source})
                            </span>
                            <strong style={{ fontFamily: 'var(--font-mono)' }}>
                              {ev.price ? `$${ev.price.toLocaleString()}` : '—'}
                            </strong>
                          </div>
                        ))}
                      </div>
                    )}
                    {activeDossier.taxHistory.length > 0 && (
                      <div className="priv-val">
                        <span style={{ color: 'var(--ink-2)' }}>Recent Tax Bill: </span>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>
                          ${activeDossier.taxHistory[0].tax.toLocaleString()}/yr (
                          {activeDossier.taxHistory[0].year})
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
};
