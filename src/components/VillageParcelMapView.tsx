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

type FeatureCircleKey =
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

const FEATURE_CHIPS: Array<{ key: FeatureCircleKey; label: string }> = [
  { key: 'est4br', label: 'Est. 4+ BR (or 2,350+ ft²)' },
  { key: 'under3m', label: 'Est. Value < $3M' },
  { key: 'under15m', label: 'Est. Value < $1.5M' },
  { key: 'notSoldRecent', label: 'Not Sold in Past 3 Yrs' },
  { key: 'offMarketOnly', label: 'Off-Market Only' },
  { key: 'pool', label: 'Swimming Pool' },
  { key: 'halfAcre', label: '0.5+ Acre Lot' },
  { key: 'oneAcre', label: '1.0+ Acre Estate' },
  { key: 'waterfront', label: 'Waterfront / Bayfront' },
  { key: 'historic', label: 'Historic Lanes' },
  { key: 'ferryWalk', label: '< 8m Walk to Ferry' },
  { key: 'absentee', label: 'NYC / 2nd-Home Owner' },
];

const CATEGORY_META: Record<
  ParcelStatusCategory,
  { label: string; fill: string; stroke: string }
> = {
  for_sale: { label: 'For Sale Now', fill: '#ea4335', stroke: '#ffffff' },
  built_3yr: { label: 'Built Past 3 Yrs (2023+)', fill: '#fbbc04', stroke: '#202124' },
  sold_3yr: { label: 'Sold Past 3 Yrs (2023+)', fill: '#34a853', stroke: '#ffffff' },
  other: { label: 'Other Village Homes', fill: '#d7dce4', stroke: '#8b95a5' },
};

const POI_STYLE: Record<
  VillagePoiKind,
  { bg: string; fg: string; glyph: string; categoryLabel: string }
> = {
  golf: { bg: '#1e8e3e', fg: '#ffffff', glyph: '⛳', categoryLabel: 'Golf Course' },
  beach: { bg: '#0284c7', fg: '#ffffff', glyph: '🏖', categoryLabel: 'Beach & Ferry' },
  park: { bg: '#15803d', fg: '#ffffff', glyph: '🌲', categoryLabel: 'Park & Preserve' },
  public: { bg: '#4f46e5', fg: '#ffffff', glyph: '🏛', categoryLabel: 'Civic & Cultural' },
  dining: { bg: '#ea580c', fg: '#ffffff', glyph: '🍴', categoryLabel: 'Restaurant / Cafe' },
  shop: { bg: '#9333ea', fg: '#ffffff', glyph: '🛍', categoryLabel: 'Village Store' },
};

function matchesFeatureSet(p: VillageParcel, active: Set<FeatureCircleKey>): boolean {
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
  const [basemap, setBasemap] = useState<'satellite' | 'street'>('satellite');
  const [catFilter, setCatFilter] = useState<ParcelStatusCategory | 'all'>('all');
  const [circledFeatures, setCircledFeatures] = useState<Set<FeatureCircleKey>>(
    () => new Set<FeatureCircleKey>(['est4br', 'under3m', 'notSoldRecent', 'offMarketOnly'])
  );

  // Layer visibility toggles
  const [showStreets, setShowStreets] = useState(true);
  const [showParksBeaches, setShowParksBeaches] = useState(true);
  const [showDiningShops, setShowDiningShops] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<VillagePoi | null>(null);
  const [hoveredParcel, setHoveredParcel] = useState<VillageParcel | null>(null);
  const [hoveredPoi, setHoveredPoi] = useState<VillagePoi | null>(null);
  const [dossiersByAddr, setDossiersByAddr] = useState<Record<string, OffMarketDossier>>({});
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);

  // Viewport transform with full 360-degree spin (bearing in degrees)
  const [view, setView] = useState({
    zoom: 1.22,
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

  const circledIds = useMemo(() => {
    const out = new Set<string>();
    if (!bundle || circledFeatures.size === 0) return out;
    for (const p of bundle.parcels) {
      if (catFilter !== 'all' && p.cat !== catFilter) continue;
      if (matchesFeatureSet(p, circledFeatures)) out.add(p.id);
    }
    return out;
  }, [bundle, circledFeatures, catFilter]);

  const visiblePois = useMemo(() => {
    if (!bundle) return [];
    return (bundle.pois ?? []).filter((poi) => {
      if (poi.kind === 'dining' || poi.kind === 'shop') return showDiningShops;
      return showParksBeaches;
    });
  }, [bundle, showDiningShops, showParksBeaches]);

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

  // Rotated projection & inverse projection (sub-pixel accurate at any 0..360° bearing)
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

  // Render full rotatable aerial Village cadastre + exterior mask + streets + POIs + circled homes
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

    const isSat = basemap === 'satellite' && Boolean(aerialImg);
    const cosLat = 0.7575;
    const pxPerDegLon = (width / 0.036) * view.zoom;
    const pxPerDegLat = pxPerDegLon / cosLat;
    const rad = (view.bearing * Math.PI) / 180;

    // 1. Background & Rotated Aerial Orthoimagery
    ctx.fillStyle = isSat ? '#49505b' : '#dfe4ec';
    ctx.fillRect(0, 0, width, height);

    if (isSat && aerialImg) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rad);
      const ab = bundle.aerialBounds;
      const ix = (ab.west - view.centerLon) * pxPerDegLon;
      const iy = -(ab.north - view.centerLat) * pxPerDegLat;
      const iw = (ab.east - ab.west) * pxPerDegLon;
      const ih = (ab.north - ab.south) * pxPerDegLat;
      ctx.drawImage(aerialImg, ix, iy, iw, ih);
      ctx.restore();
    } else {
      // Street mode: fill Village interior warm ivory while outside stays muted grey
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
      ctx.fillStyle = '#f8f9fb';
      ctx.fill();
      ctx.restore();
    }

    // 2. Crisp Exterior Greyed-Out Veil outside Incorporated Bellport Village (evenodd mask!)
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
      ctx.fillStyle = isSat ? 'rgba(58, 64, 74, 0.56)' : 'rgba(148, 158, 172, 0.42)';
      ctx.fill('evenodd');
      ctx.restore();
    }

    // 3. Draw all 1,213 Surveyor Property Lines & Status Fills
    for (const p of bundle.parcels) {
      const dimmed = catFilter !== 'all' && p.cat !== catFilter;
      let fill = CATEGORY_META[p.cat].fill;
      let stroke = CATEGORY_META[p.cat].stroke;
      let alpha = dimmed ? 0.14 : isSat ? 0.72 : 0.86;
      let lw = p.cat === 'other' ? (view.zoom > 2 ? 0.9 : 0.65) : 1.6;

      if (p.cat === 'other') {
        if (p.cls === '552') {
          // 137-acre Bellport Country Club Golf Course
          fill = isSat ? 'rgba(52, 168, 83, 0.24)' : '#bbe6c5';
          stroke = isSat ? '#81c995' : '#34a853';
          alpha = dimmed ? 0.15 : 1;
          lw = 1.6;
        } else if (p.cls.startsWith('5') || p.cls.startsWith('9') || p.cls.startsWith('8')) {
          // Parks, Preserves & Waterfront public parcels
          fill = isSat ? 'rgba(52, 168, 83, 0.22)' : '#cdebd4';
          stroke = isSat ? 'rgba(168, 218, 181, 0.7)' : '#68b87d';
          alpha = dimmed ? 0.12 : 1;
        } else if (p.cls.startsWith('4')) {
          // Village Main Street commercial buildings
          fill = isSat ? 'rgba(232, 240, 254, 0.20)' : '#e8eef7';
          stroke = isSat ? 'rgba(255, 255, 255, 0.55)' : '#94a3b8';
          alpha = dimmed ? 0.12 : 1;
        } else {
          // Residential Village homes
          fill = isSat ? 'rgba(255, 255, 255, 0.10)' : '#e6ebf2';
          stroke = isSat ? 'rgba(255, 255, 255, 0.44)' : '#9aa5b5';
          alpha = dimmed ? 0.12 : 1;
        }
      }

      if (p.id === selectedParcelId) {
        stroke = '#00e5ff';
        lw = 3;
        alpha = 0.92;
      } else if (hoveredParcel?.id === p.id) {
        stroke = '#ffffff';
        lw = 2.2;
        alpha = 0.9;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;

      for (const ring of p.rings) {
        ctx.beginPath();
        ring.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Street Centerlines
    if (showStreets) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const st of bundle.streets) {
        const isMajor = /Main St|Station Rd|Country Club|Bellport Ln|Howells/i.test(st.name);
        ctx.strokeStyle = isSat
          ? isMajor
            ? 'rgba(255,255,255,0.48)'
            : 'rgba(255,255,255,0.24)'
          : isMajor
            ? '#ffffff'
            : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = isSat ? (isMajor ? 2.1 : 1.05) : isMajor ? 3.5 : 1.8;
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
    }

    // 5. Bold Incorporated Bellport Village Border Line
    if (bundle.boundaryRings) {
      ctx.save();
      for (const ring of bundle.boundaryRings) {
        ctx.beginPath();
        ring.forEach((pt, idx) => {
          const [px, py] = project(pt[0], pt[1], width, height);
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 6. High-Contrast Target Circles Around Feature-Matched Homes
    if (circledIds.size > 0) {
      for (const p of bundle.parcels) {
        if (!circledIds.has(p.id)) continue;
        const [cx, cy] = project(p.lon, p.lat, width, height);
        if (cx < -24 || cx > width + 24 || cy < -24 || cy > height + 24) continue;
        const r = Math.max(7.5, Math.min(16, 6.8 * Math.sqrt(view.zoom)));

        ctx.beginPath();
        ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.lineWidth = 3.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    // 7. Upright Collision-Free Street Name Labels (Major at overview, ALL 132 streets on zoom!)
    if (showStreets && bundle.streetLabels) {
      const placedBoxes: Array<[number, number, number, number]> = [];
      ctx.font = '600 10.5px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const ordered = [...bundle.streetLabels].sort((a, b) => Number(b.major) - Number(a.major));
      for (const sl of ordered) {
        if (!sl.major && view.zoom < 1.75) continue;
        const [sx, sy] = project(sl.lon, sl.lat, width, height);
        if (sx < 36 || sx > width - 36 || sy < 18 || sy > height - 18) continue;

        const tw = ctx.measureText(sl.name).width + 10;
        const th = 15;
        const box: [number, number, number, number] = [
          sx - tw / 2 - 6,
          sy - th / 2 - 4,
          sx + tw / 2 + 6,
          sy + th / 2 + 4,
        ];
        const collides = placedBoxes.some(
          (b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3])
        );
        if (collides) continue;
        placedBoxes.push(box);

        ctx.fillStyle = isSat ? 'rgba(15, 23, 42, 0.74)' : 'rgba(255, 255, 255, 0.88)';
        ctx.beginPath();
        ctx.roundRect(sx - tw / 2, sy - th / 2, tw, th, 6);
        ctx.fill();
        ctx.fillStyle = isSat ? '#f1f5f9' : '#1e293b';
        ctx.fillText(sl.name, sx, sy + 0.5);
      }
    }

    // 8. Golf Course, Parks, Beaches, Public Spaces, Restaurants & Stores Pins
    for (const poi of visiblePois) {
      const [px, py] = project(poi.lon, poi.lat, width, height);
      if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;
      const st = POI_STYLE[poi.kind];
      const isSelected = selectedPoi?.id === poi.id || hoveredPoi?.id === poi.id;
      const pinR = isSelected ? 11.5 : 9.5;

      ctx.beginPath();
      ctx.arc(px, py, pinR, 0, Math.PI * 2);
      ctx.fillStyle = st.bg;
      ctx.fill();
      ctx.lineWidth = isSelected ? 2.6 : 1.8;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = st.fg;
      ctx.fillText(st.glyph, px, py + 0.5);

      const showPoiLabel =
        isSelected ||
        poi.kind === 'golf' ||
        poi.kind === 'beach' ||
        (poi.kind === 'park' && view.zoom >= 1.2) ||
        view.zoom >= 2.15;

      if (showPoiLabel) {
        ctx.font = '600 10.5px system-ui, sans-serif';
        const lw = ctx.measureText(poi.name).width + 10;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        ctx.beginPath();
        ctx.roundRect(px - lw / 2, py + pinR + 3, lw, 16, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(poi.name, px, py + pinR + 11);
      }
    }

    // 9. Selected Parcel Highlight Ring
    if (selectedParcel) {
      const [sx, sy] = project(selectedParcel.lon, selectedParcel.lat, width, height);
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#ea4335';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.restore();
  }, [
    bundle,
    aerialImg,
    basemap,
    catFilter,
    circledIds,
    showStreets,
    visiblePois,
    selectedParcelId,
    selectedParcel,
    selectedPoi,
    hoveredParcel,
    hoveredPoi,
    project,
    view,
  ]);

  const findPoiAtScreenPoint = (clientX: number, clientY: number): VillagePoi | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    for (const poi of visiblePois) {
      const [px, py] = project(poi.lon, poi.lat, rect.width, rect.height);
      if (Math.hypot(px - x, py - y) <= 12) return poi;
    }
    return null;
  };

  const findParcelAtPoint = (clientX: number, clientY: number): VillageParcel | null => {
    const canvas = canvasRef.current;
    if (!canvas || !bundle) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const [lon, lat] = unproject(x, y, rect.width, rect.height);

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
    const nextZoom = Math.max(0.85, Math.min(10, view.zoom * factor));

    const cosLat = 0.7575;
    const pxPerDegLon = (rect.width / 0.036) * nextZoom;
    const pxPerDegLat = pxPerDegLon / cosLat;
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

      const cosLat = 0.7575;
      const pxPerDegLon = (rect.width / 0.036) * view.zoom;
      const pxPerDegLat = pxPerDegLon / cosLat;
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

  const toggleFeatureChip = (k: FeatureCircleKey) => {
    setCircledFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const applyPreset = (keys: FeatureCircleKey[]) => {
    setCatFilter('all');
    setCircledFeatures(new Set(keys));
  };

  const focusParcel = (p: VillageParcel) => {
    setSelectedPoi(null);
    setSelectedParcelId(p.id);
    setSearchText('');
    setView((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom, 3.3),
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
          <p style={{ color: 'var(--ink-2)' }}>Loading Bellport Village aerial parcel map…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="results-band" aria-label="Bellport Village Aerial Property Map">
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header & 1-Click Presets */}
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
            <span className="eyebrow">Rotatable Aerial Cadastre · SWIS 472203</span>
            <h1 style={{ fontSize: 'var(--fs-h2)', margin: '4px 0 6px' }}>
              Every property in Bellport Village, mapped.
            </h1>
            <p style={{ color: 'var(--ink-2)', maxWidth: '68ch', margin: 0 }}>
              Spin 360° (<strong>Shift+Drag</strong> or use the compass dial), zoom into any lane,
              and click any of the <strong>{bundle.totalParcels.toLocaleString()}</strong> Village
              lots, parks, beaches, the golf course, or Main Street restaurants and stores. Areas
              outside the Village border are greyed out.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pill-toggle is-active"
              onClick={() =>
                applyPreset(['est4br', 'under3m', 'notSoldRecent', 'offMarketOnly'])
              }
            >
              <Sparkles size={14} />
              <span>Preset: 4+ BR · &lt;$3M · Not Sold Recently</span>
            </button>
            <button
              type="button"
              className="pill-toggle"
              onClick={() => applyPreset(['historic', 'pool', 'under3m'])}
            >
              <span>Historic Lanes + Pool (&lt;$3M)</span>
            </button>
            <button
              type="button"
              className="pill-toggle"
              onClick={() => applyPreset(['absentee', 'halfAcre'])}
            >
              <span>NYC / 2nd-Home Owners (0.5+ ac)</span>
            </button>
            {circledFeatures.size > 0 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setCircledFeatures(new Set())}
              >
                <RotateCcw size={13} />
                <span>Clear Circles</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Color Legend + Feature Circling + Map Layer Toggles */}
        <div
          style={{
            padding: 16,
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
                    onClick={() => setCatFilter(catFilter === cat ? 'all' : cat)}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: CATEGORY_META[cat].fill,
                        border: '1px solid rgba(0,0,0,0.25)',
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

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
              {circledIds.size > 0
                ? `◎ ${circledIds.size} Village ${circledIds.size === 1 ? 'home' : 'homes'} circled`
                : 'Click features below to circle homes'}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              paddingTop: 10,
              borderTop: '1px solid var(--line)',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--ink-2)', marginRight: 4 }}>
              Circle homes with:
            </span>
            {FEATURE_CHIPS.map((fc) => (
              <button
                key={fc.key}
                type="button"
                className={`pill-toggle ${circledFeatures.has(fc.key) ? 'is-active' : ''}`}
                style={{ height: 29, fontSize: 12, padding: '0 10px' }}
                onClick={() => toggleFeatureChip(fc.key)}
              >
                {fc.label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              paddingTop: 8,
              borderTop: '1px solid var(--line)',
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--ink-2)' }}>Map overlays:</span>
            <button
              type="button"
              className={`pill-toggle ${showStreets ? 'is-active' : ''}`}
              style={{ height: 28, fontSize: 12 }}
              onClick={() => setShowStreets((v) => !v)}
            >
              All 132 Street Names
            </button>
            <button
              type="button"
              className={`pill-toggle ${showParksBeaches ? 'is-active' : ''}`}
              style={{ height: 28, fontSize: 12 }}
              onClick={() => setShowParksBeaches((v) => !v)}
            >
              ⛳ Golf, Parks, Beaches &amp; Civic
            </button>
            <button
              type="button"
              className={`pill-toggle ${showDiningShops ? 'is-active' : ''}`}
              style={{ height: 28, fontSize: 12 }}
              onClick={() => setShowDiningShops((v) => !v)}
            >
              🍴 Restaurants &amp; Village Stores
            </button>
          </div>
        </div>

        {/* Interactive Aerial Map + Right Dossier Panel */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 375px',
            gap: 18,
            alignItems: 'start',
          }}
          className="village-map-grid"
        >
          {/* Rotatable Aerial Canvas */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              border: '1px solid var(--line)',
              background: '#49505b',
              height: 640,
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

            {/* Top-Left Address Jump */}
            <div style={{ position: 'absolute', top: 12, left: 12, width: 270, zIndex: 5 }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={14}
                  style={{ position: 'absolute', left: 11, top: 11, color: 'var(--ink-2)' }}
                />
                <input
                  type="search"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Find any Bellport street or address…"
                  style={{
                    width: '100%',
                    height: 36,
                    paddingLeft: 32,
                    paddingRight: 10,
                    borderRadius: 999,
                    border: '1px solid var(--line)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: 12,
                    boxShadow: 'var(--shadow-1)',
                  }}
                />
              </div>
              {searchMatches.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    borderRadius: 14,
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    boxShadow: 'var(--shadow-2)',
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
                        borderBottom: '1px solid var(--line)',
                        background: 'transparent',
                        color: 'var(--ink)',
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <strong>{m.addr}</strong>
                      <span style={{ color: 'var(--ink-2)' }}>{m.acres} ac</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Top-Right Basemap, 360° Spin & Zoom Control Pod */}
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
              <button
                type="button"
                className="icon-btn"
                style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-1)' }}
                onClick={() => setBasemap((b) => (b === 'satellite' ? 'street' : 'satellite'))}
              >
                <Layers size={14} />
                <span>{basemap === 'satellite' ? 'Aerial View (Switch to Street)' : 'Street View (Switch to Aerial)'}</span>
              </button>

              {/* Spin & Zoom Controls */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5,
                  background: 'var(--surface)',
                  padding: 8,
                  borderRadius: 18,
                  border: '1px solid var(--line)',
                  boxShadow: 'var(--shadow-2)',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Spin counter-clockwise 45°"
                    onClick={() =>
                      setView((v) => ({ ...v, bearing: (v.bearing - 45 + 360) % 360 }))
                    }
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Reset North (0°)"
                    onClick={() => setView((v) => ({ ...v, bearing: 0 }))}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}
                  >
                    N {view.bearing}°
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Spin clockwise 45°"
                    onClick={() => setView((v) => ({ ...v, bearing: (v.bearing + 45) % 360 }))}
                  >
                    <RotateCw size={14} />
                  </button>
                </div>

                <input
                  type="range"
                  min={0}
                  max={359}
                  value={view.bearing}
                  aria-label="Spin map 0 to 360 degrees"
                  onChange={(e) =>
                    setView((v) => ({ ...v, bearing: Number(e.target.value) }))
                  }
                  style={{ width: 108 }}
                />

                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Zoom in"
                    onClick={() => setView((v) => ({ ...v, zoom: Math.min(10, v.zoom * 1.35) }))}
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Zoom out"
                    onClick={() =>
                      setView((v) => ({ ...v, zoom: Math.max(0.85, v.zoom / 1.35) }))
                    }
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Reset full Village view"
                    onClick={() =>
                      setView({ zoom: 1.22, centerLon: -72.9408, centerLat: 40.7528, bearing: 0 })
                    }
                  >
                    <Compass size={15} />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom-Left Hover Readout */}
            {(hoveredPoi || hoveredParcel) && (
              <div
                style={{
                  position: 'absolute',
                  left: 12,
                  bottom: 12,
                  padding: '8px 12px',
                  borderRadius: 14,
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  boxShadow: 'var(--shadow-2)',
                  fontSize: 12,
                  pointerEvents: 'none',
                }}
              >
                {hoveredPoi ? (
                  <>
                    <strong>
                      {POI_STYLE[hoveredPoi.kind].glyph} {hoveredPoi.name}
                    </strong>{' '}
                    · {POI_STYLE[hoveredPoi.kind].categoryLabel} ({hoveredPoi.addr})
                  </>
                ) : hoveredParcel ? (
                  <>
                    <strong>{hoveredParcel.addr}</strong> ·{' '}
                    {CATEGORY_META[hoveredParcel.cat].label} · {hoveredParcel.acres} ac
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

          {/* Right: Selected POI or Property Dossier */}
          <aside
            style={{
              borderRadius: 'var(--radius)',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              maxHeight: 640,
              overflowY: 'auto',
            }}
          >
            {selectedPoi ? (
              <>
                <div>
                  <span
                    className="badge"
                    style={{
                      background: POI_STYLE[selectedPoi.kind].bg,
                      color: '#ffffff',
                      border: 'none',
                      marginBottom: 8,
                    }}
                  >
                    {POI_STYLE[selectedPoi.kind].glyph}{' '}
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
                Click any parcel, beach, park, golf course, or Main Street shop on the aerial map.
              </p>
            ) : (
              <>
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span
                      className="badge"
                      style={{
                        background: CATEGORY_META[selectedParcel.cat].fill,
                        color: selectedParcel.cat === 'built_3yr' ? '#202124' : '#ffffff',
                        border: 'none',
                      }}
                    >
                      {CATEGORY_META[selectedParcel.cat].label}
                    </span>
                    {circledIds.has(selectedParcel.id) && (
                      <span className="badge badge--village">◎ Circled Match</span>
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
                      Frontage × Depth
                    </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>
                      {selectedParcel.front && selectedParcel.depth
                        ? `${selectedParcel.front}' × ${selectedParcel.depth}'`
                        : 'Irregular'}
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
