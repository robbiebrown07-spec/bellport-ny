import React, { useMemo, useRef, useState } from 'react';
import {
  Anchor,
  ArrowRight,
  Car,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Home,
  MapPin,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Train,
} from 'lucide-react';
import type { VillagePoi } from '../types';
import { evaluateArchitecturalBeauty } from '../lib/ownerAndAirbnb';
import {
  fmtShortDollar,
  resolveAssetUrl,
  toPseudoListing,
  type UnifiedHome,
} from '../lib/unifiedCatalog';
import { ScrollReveal } from './ScrollReveal';

interface AboutBellportViewProps {
  pois: VillagePoi[];
  catalog: UnifiedHome[];
  onOpenListing: (parcelId: string) => void;
  onShowOnMap?: (parcelId: string) => void;
  onJumpToMap?: () => void;
}

/**
 * 22 Visually Verified Showcase Residences in Incorporated Bellport Village
 * (100% real MLS & brokerage architectural photography — zero Google Street View).
 */
const VERIFIED_SHOWCASE_IDS = [
  'p-2713803', // 37 Bellport Ln (1832 Greek Revival Farmhouse)
  'p-2713910', // 37 Browns Ln (1890 Shingle-Style Estate)
  'p-2714051', // 15 Otis Ave (1928 Bay Bluff Estate)
  'p-2713733', // 22 Bellport Ln (1846 Historic District Residence)
  'p-2713905', // 34 Browns Ln (1870 Shingled Sea Captain's Home)
  'p-2714069', // 20 S Howells Point Rd (1928 Country Club Corridor Estate)
  'p-2713971', // 68 S Howells Pt Rd (Custom Gambrel Shingle Compound)
  'p-2713976', // 64 S Howells Pt Rd (1900 Shingled Estate)
  'p-2713837', // 13 Academy Ln (1932 Historic Lane Cottage)
  'p-2713683', // 2 Academy Ln (1936 1.28-Acre Village Compound)
  'p-2714005', // 14 Peathole Ln (1917 Coastal Retreat)
  'p-2714007', // 8 Titus Ln (1915 2.48-Acre Waterfront Sanctuary)
  'p-2713298', // 19 Third St (1949 Weathered Cedar-Shake Cape)
  'p-2713374', // 41 Station Rd (1922 Gabled Shingle Porch Cottage)
  'p-2713765', // 22 Bell St (1900 Historic Pocket Residence)
  'p-2713809', // 44 Bellport Ln (1900 Lower Bellport Lane Home)
  'p-2713740', // 13 Bell St (1935 Traditional Village Residence)
  'p-2713750', // 168 South Country Rd (1865 Village Landmark)
  'p-2713653', // 7 N Howells Pt Rd (1934 Leafy West Village Residence)
  'p-2713339', // 182 S Country Rd (1900 Classic Clapboard Home)
  'p-2713403', // 8 Woodland Park Rd (1922 Shaded Village Cottage)
  'p-2713296', // 17 Third St (1950 Light-Filled Village Ranch)
];

const PRESS_LINKS = [
  {
    outlet: 'Business Insider',
    title: 'Inside Bellport, NY — the Quiet Long Island Village Known as the “Un-Hamptons”',
    url: 'https://www.businessinsider.com/bellport-ny-summer-hotspot-2017-6',
    blurb:
      'Explores Bellport’s preservation culture, residents-only Ho-Hum Beach ferry, and why fashion, art, and literary New Yorkers prize its un-sceney pace.',
  },
  {
    outlet: 'Fire Island News',
    title: 'Summer in Bellport Village: Marina Concerts, Gateway Playhouse & Main Street Life',
    url: 'https://www.fireislandnews.com/arts-culture/this-summer-bellport-village/',
    blurb:
      'Local portrait of Bellport’s waterfront bandshell, Mothers’ Beach, Gateway Performing Arts Center, and Main Street dining.',
  },
  {
    outlet: 'The Real Deal',
    title: 'Why Historic Bellport Village Remains Self-Limiting & Architecturally Protected',
    url: 'https://therealdeal.com/new-york/2017/06/10/this-sleepy-town-near-nyc-could-become-the-next-summer-real-estate-hotspot/',
    blurb:
      'Examines how historic district protections, zero commercial waterfront, and a two-square-mile footprint preserve property values and village calm.',
  },
  {
    outlet: 'Greater Long Island · Town & Country',
    title: 'Why Town & Country Raves About Bellport’s Flip-Flops & Porch Culture',
    url: 'https://greaterlongisland.com/town-country-gives-bellport-village-rave-reviews/',
    blurb:
      'Highlights the contrast between East End flash and Bellport’s bike-everywhere community spirit.',
  },
  {
    outlet: 'Architectural Digest Showcase',
    title: 'Inside a Restored 1857 Bellport Village Greek Revival & Garden Compound',
    url: 'https://oldpurchase.com/properties/a-bellport-village-greek-revival-featured-in-architectural-digest',
    blurb:
      'Case study of how design-minded owners restore 19th-century Bellport homes while adding pools and modern kitchens.',
  },
  {
    outlet: 'The New York Times Archive',
    title: 'New York Times Coverage of Bellport Village & Great South Bay',
    url: 'https://www.nytimes.com/search?query=%22Bellport+Village%22',
    blurb:
      'Ongoing reporting on Bellport real estate, Old Inlet / Fire Island ecology, and South Shore cultural life.',
  },
];

type PoiFilter = 'all' | 'water_parks' | 'golf_civic' | 'dining' | 'shops';

export const AboutBellportView: React.FC<AboutBellportViewProps> = ({
  pois,
  catalog,
  onOpenListing,
  onShowOnMap,
  onJumpToMap,
}) => {
  const [poiFilter, setPoiFilter] = useState<PoiFilter>('all');
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const byParcelId = useMemo(
    () => new Map(catalog.map((h) => [h.parcelId, h])),
    [catalog]
  );

  const showcaseHomes = useMemo(() => {
    const items: Array<{ home: UnifiedHome; beautyDisplay: string; beautyScore: number }> = [];
    for (const pid of VERIFIED_SHOWCASE_IDS) {
      const h = byParcelId.get(pid);
      if (!h || h.isHidden || !h.photoUrl || h.photoSource !== 'mls') continue;
      const b = evaluateArchitecturalBeauty(toPseudoListing(h));
      items.push({ home: h, beautyDisplay: b.display, beautyScore: b.score10 });
    }
    return items;
  }, [byParcelId]);

  const filteredPois = useMemo(() => {
    return pois.filter((p) => {
      if (poiFilter === 'all') return true;
      if (poiFilter === 'water_parks') return p.kind === 'beach' || p.kind === 'park';
      if (poiFilter === 'golf_civic') return p.kind === 'golf' || p.kind === 'public';
      if (poiFilter === 'dining') return p.kind === 'dining';
      if (poiFilter === 'shops') return p.kind === 'shop';
      return true;
    });
  }, [pois, poiFilter]);

  const scrollCarousel = (dir: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 680, behavior: 'smooth' });
  };

  const marinaPoiPhoto = useMemo(() => {
    const found = pois.find((p) => p.id === 'poi-bellport-marina' || p.kind === 'beach');
    return resolveAssetUrl(found?.photoUrl) ?? resolveAssetUrl('/photos/p-2713803.webp');
  }, [pois]);

  const golfPoiPhoto = useMemo(() => {
    const found = pois.find((p) => p.kind === 'golf');
    return resolveAssetUrl(found?.photoUrl) ?? resolveAssetUrl('/photos/p-2714069.webp');
  }, [pois]);

  const cardStyle: React.CSSProperties = {
    padding: 24,
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  };

  return (
    <section style={{ padding: '22px 0 52px' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Hero Overview with Editorial Photo Triptych */}
        <ScrollReveal direction="up">
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Village Field Guide · Incorporated 1910 · 1.5 Sq Mi
              </span>
              <h1 style={{ fontSize: 30, margin: 0 }}>
                Bellport Village — Architecture, Bay Life &amp; the “Un-Hamptons”
              </h1>
              <p style={{ fontSize: 14.5, lineHeight: 1.66, color: 'var(--ink-2)', margin: 0 }}>
                Founded by 19th-century sea captains along a sheltered reach of Great South Bay,{' '}
                <strong style={{ color: 'var(--ink)' }}>Incorporated Bellport Village</strong>{' '}
                (~2,200 year-round residents; <strong>1,058 residential homes</strong>) moves by
                bicycle, porch, and sailboat rather than velvet ropes. Sycamore-shaded lanes of
                weathered cedar shingle and white Greek Revival farmhouses run south from Main
                Street to the Village Marina, where a residents-only ferry crosses the bay to{' '}
                <strong style={{ color: 'var(--ink)' }}>Ho-Hum Beach</strong> — the Village’s
                private oceanfront tract cutting all the way across Fire Island from bay to surf.
              </p>
            </div>

            {/* Crisp Editorial Triptych */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                marginTop: 4,
              }}
            >
              {[
                {
                  src: resolveAssetUrl('/photos/p-2713803.webp'),
                  caption: 'Historic Bellport Lane · c. 1832 Greek Revival',
                  pid: 'p-2713803',
                },
                {
                  src: marinaPoiPhoto,
                  caption: 'Bellport Marina & Whalehouse Point Ferry to Ho-Hum Beach',
                  pid: null,
                },
                {
                  src: resolveAssetUrl('/photos/p-2713971.webp'),
                  caption: 'South Howells Bluff · Shingle-Style Gambrel & Grounds',
                  pid: 'p-2713971',
                },
              ].map((item) => (
                <div
                  key={item.caption}
                  onClick={() => {
                    if (item.pid) onOpenListing(item.pid);
                  }}
                  style={{
                    position: 'relative',
                    borderRadius: 14,
                    overflow: 'hidden',
                    aspectRatio: '16 / 10',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                    cursor: item.pid ? 'pointer' : 'default',
                  }}
                >
                  {item.src && (
                    <img
                      src={item.src}
                      alt={item.caption}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 'auto 0 0 0',
                      padding: '18px 12px 9px',
                      background: 'linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.78) 100%)',
                      color: '#ffffff',
                      fontSize: 11.5,
                      fontWeight: 500,
                    }}
                  >
                    {item.caption}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Near-Top Carousel: 20+ Most Beautiful Homes in Bellport */}
        {showcaseHomes.length > 0 && (
          <ScrollReveal direction="up" delayMs={60}>
            <div style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <span className="eyebrow" style={{ marginBottom: 4 }}>
                    Curated Architectural Showcase · {showcaseHomes.length} Homes
                  </span>
                  <h2 style={{ fontSize: 23, margin: 0 }}>
                    Most Beautiful Homes in Bellport Village
                  </h2>
                  <p style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 3 }}>
                    Pre-war sea captains’ houses, weathered cedar-shake Capes, and Shingle-Style
                    estates photographed from MLS &amp; brokerage archives — click any home for
                    full details, photos, and history.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => scrollCarousel(-1)}
                    aria-label="Scroll showcase left"
                    style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => scrollCarousel(1)}
                    aria-label="Scroll showcase right"
                    style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              <div
                ref={carouselRef}
                style={{
                  display: 'flex',
                  gap: 14,
                  overflowX: 'auto',
                  scrollSnapType: 'x mandatory',
                  paddingBottom: 6,
                  scrollbarWidth: 'thin',
                }}
              >
                {showcaseHomes.map(({ home: h, beautyDisplay }) => (
                  <article
                    key={h.parcelId}
                    onClick={() => onOpenListing(h.parcelId)}
                    style={{
                      flex: '0 0 308px',
                      scrollSnapAlign: 'start',
                      borderRadius: 16,
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'transform 160ms ease, box-shadow 160ms ease',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '16 / 10',
                        background: 'var(--surface-subtle)',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={h.photoUrl}
                        alt={h.address}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                      <span
                        className="badge"
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: 10,
                          fontSize: 11,
                          background: h.isForSale
                            ? '#9be3b0'
                            : h.hasPastSale
                              ? 'rgba(32,33,36,0.84)'
                              : 'rgba(255,255,255,0.94)',
                          color: h.isForSale
                            ? '#124d2c'
                            : h.hasPastSale
                              ? '#ffffff'
                              : 'var(--ink)',
                          border: 'none',
                        }}
                      >
                        {h.isForSale
                          ? 'For Sale'
                          : h.hasPastSale
                            ? `Sold ${h.soldYear ?? ''}`
                            : 'Historic Village Estate'}
                      </span>

                      <span
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.95)',
                          color: 'var(--accent)',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        Beauty {beautyDisplay}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '12px 14px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 8,
                        }}
                      >
                        <strong style={{ fontSize: 15.5, color: 'var(--ink)' }}>{h.address}</strong>
                        <span
                          className="priv-val"
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--ink-2)',
                          }}
                        >
                          {h.isForSale || h.hasPastSale ? '' : 'Est. '}
                          {fmtShortDollar(h.price)}
                        </span>
                      </div>

                      <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                        <strong>{h.style}</strong> · c. {h.yearBuilt}
                      </div>

                      <div
                        style={{
                          fontSize: 11.5,
                          color: 'var(--ink-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {h.beds} bd · {h.baths} ba · {h.sqft.toLocaleString()} ft² · {h.lotAcres} ac
                        {' · '}
                        {h.area}
                      </div>

                      <div
                        style={{
                          marginTop: 'auto',
                          paddingTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: 'var(--accent)',
                            fontSize: 12.5,
                            fontWeight: 600,
                          }}
                        >
                          <span>More info</span>
                          <ArrowRight size={14} />
                        </span>

                        {onShowOnMap && (
                          <button
                            type="button"
                            className="show-on-map-btn"
                            style={{ minHeight: 30, padding: '3px 10px', fontSize: 11.5 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onShowOnMap(h.parcelId);
                            }}
                          >
                            <MapPin size={12} />
                            <span>Show on Map</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Commute from 910 Union Street, Park Slope + Vacation Market Profile */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          <ScrollReveal direction="left">
            <div style={{ ...cardStyle, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Compass size={17} color="var(--accent)" />
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Door-to-Door Commute
                </span>
              </div>
              <h2 style={{ fontSize: 20, margin: 0 }}>
                From 910 Union Street, Park Slope to Bellport Village
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55, margin: 0 }}>
                At roughly <strong>58 miles</strong> door-to-door, Bellport sits{' '}
                <strong>45–60 minutes closer to Park Slope than East Hampton or Amagansett</strong>{' '}
                and stops west of the single-lane Shinnecock Canal bottleneck.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  padding: 14,
                  borderRadius: 14,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--line)',
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Car size={16} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong>By Car: 1 hr 15 min – 1 hr 30 min</strong> (typical off-peak) ·{' '}
                    <strong>1 hr 45 min – 2 hr 10 min</strong> (peak summer Friday 4–7 PM).
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                      Prospect Expwy / BQE → I-495 LIE East (Exit 64/65) → NY-27 Sunrise Hwy →
                      Station Rd straight into Main Street.
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, background: 'var(--line)' }} />

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Train size={16} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <strong>By LIRR Train: 1 hr 40 min – 1 hr 55 min</strong> door-to-door.
                    <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
                      8-min walk from 910 Union St to <strong>Atlantic Terminal</strong> → Jamaica
                      transfer → Montauk Branch to <strong>Bellport Station</strong> (4-min bike or
                      quick pickup to Main St).
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                <a
                  href="https://www.google.com/maps/dir/?api=1&origin=910+Union+St,+Brooklyn,+NY+11215&destination=Bellport+Village,+NY+11713&travelmode=driving"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  <Car size={13} />
                  <span>Driving Route from 910 Union</span>
                  <ExternalLink size={12} />
                </a>
                <a
                  href="https://www.google.com/maps/dir/?api=1&origin=910+Union+St,+Brooklyn,+NY+11215&destination=Bellport+Station,+Bellport,+NY&travelmode=transit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="icon-btn"
                  style={{ textDecoration: 'none', fontSize: 12 }}
                >
                  <Train size={13} />
                  <span>LIRR Transit Route</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" delayMs={70}>
            <div style={{ ...cardStyle, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Home size={17} color="var(--accent)" />
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Homeowner Mix &amp; Market Character
                </span>
              </div>
              <h2 style={{ fontSize: 20, margin: 0 }}>
                Full-Time vs. Second-Home Owners &amp; Who Buys Here
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                }}
              >
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    ~68% Full-Time vs. ~32% Second-Home / Seasonal:
                  </strong>{' '}
                  Because roughly two-thirds of neighbors live in Bellport year-round, Main Street
                  cafes, markets, and restaurants stay lively through autumn and winter rather than
                  shuttering after Labor Day.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>Who Owns Homes Here:</strong> A
                  distinctive blend of <strong>Brooklyn &amp; Manhattan creative families</strong>{' '}
                  (architects, editors, designers, writers, gallery &amp; film creatives),{' '}
                  <strong>physicians &amp; scientists</strong>, and multi-generational sailing
                  families.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>Tightly Held Market:</strong> With only
                  1,058 residential parcels, just <strong>25–45 Village homes</strong> trade per
                  year. Median sale prices have risen <strong>+374%</strong> since 1993 while
                  remaining roughly half the price of comparable Sag Harbor or Amagansett homes.
                </li>
              </ul>
            </div>
          </ScrollReveal>
        </div>

        {/* Unusual Village Amenities + Construction/Airbnb Governance */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          <ScrollReveal direction="left">
            <div style={{ ...cardStyle, height: '100%' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <img
                  src={marinaPoiPhoto}
                  alt="Bellport Marina & Bay"
                  loading="lazy"
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                  }}
                />
                <img
                  src={golfPoiPhoto}
                  alt="Bellport Country Club & Bayfront"
                  loading="lazy"
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Anchor size={17} color="var(--accent)" />
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Resident Privileges
                </span>
              </div>
              <h2 style={{ fontSize: 20, margin: 0 }}>
                Unusual Amenities Exclusive to Village Owners
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                }}
              >
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    Private Fire Island Ocean Beach (Ho-Hum Beach):
                  </strong>{' '}
                  Cuts across Fire Island from Bellport Bay to the Atlantic surf — accessible only
                  to Village residents and guests via the 20-minute <em>Whalehouse Point</em> ferry
                  adjacent to the car-free Otis Pike High Dune Wilderness.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    Municipal 18-Hole Bayfront Golf &amp; Tennis:
                  </strong>{' '}
                  Village-owned <strong>Bellport Country Club</strong> offers resident-rate golf,
                  har-tru tennis courts, junior clinics, and bayfront dining.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    Town Marina, Mothers’ Beach &amp; Summer Bandshell:
                  </strong>{' '}
                  Resident boat slips, kids’ sailing lessons, gentle bay beach/playground, and free
                  weekly outdoor concerts overlooking the water.
                </li>
              </ul>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" delayMs={70}>
            <div style={{ ...cardStyle, height: '100%' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <img
                  src={resolveAssetUrl('/photos/p-2713910.webp')}
                  alt="37 Browns Lane historic shingle architecture"
                  loading="lazy"
                  onClick={() => onOpenListing('p-2713910')}
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                />
                <img
                  src={resolveAssetUrl('/photos/p-2713374.webp')}
                  alt="41 Station Road cedar-shingle cottage"
                  loading="lazy"
                  onClick={() => onOpenListing('p-2713374')}
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 9',
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={17} color="var(--accent)" />
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Local Rules &amp; Culture
                </span>
              </div>
              <h2 style={{ fontSize: 20, margin: 0 }}>
                Approach to Construction, Renovations &amp; Airbnb
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  color: 'var(--ink-2)',
                }}
              >
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    Historic Preservation &amp; Architectural Review:
                  </strong>{' '}
                  Inside the Bellport Lane / Browns / Academy Historic District, teardowns are
                  barred. Village-wide, the <strong>Architectural Review Board (ARB)</strong> favors
                  natural cedar shingle, clapboard, and traditional scale over McMansions.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>
                    Adding Pools, Pool Houses &amp; Studios:
                  </strong>{' '}
                  Very common on 0.32+ acre lots, subject to lot-coverage caps, setbacks, pool
                  fencing, and Suffolk County nitrogen-reducing I/A septic standards on expansions.
                </li>
                <li>
                  <strong style={{ color: 'var(--ink)' }}>Airbnb &amp; Summer Rentals:</strong>{' '}
                  Unlike unincorporated Brookhaven (which bans stays under 28 nights),{' '}
                  <strong>Incorporated Bellport Village permits rentals</strong> with a{' '}
                  <strong>2-year Village Rental Permit</strong>; summer tenants can purchase a
                  Seasonal Guest ID for the Ho-Hum ferry.
                </li>
              </ul>
            </div>
          </ScrollReveal>
        </div>

        {/* The Four Sections of Bellport Village — Each Topped with a Verified Representative Photo */}
        <ScrollReveal direction="up">
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}>
                  Neighborhood Geography
                </span>
                <h2 style={{ fontSize: 22, margin: 0 }}>The Four Sections of Bellport Village</h2>
              </div>
              {onJumpToMap && (
                <button type="button" className="icon-btn" onClick={onJumpToMap}>
                  <MapPin size={14} color="var(--accent)" />
                  <span>Explore Sections on Map →</span>
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))',
                gap: 14,
              }}
            >
              {[
                {
                  name: '1. Historic Lanes (South of Main · Center/East)',
                  streets:
                    'Bellport Ln, Browns Ln, Bell St, Hulse, Livingston, Rogers, Academy, Shore Rd',
                  desc: 'The 19th-century architectural heart. Sycamore canopies, shingled sea captains’ houses, and effortless walks to both Main Street shops and the Marina.',
                  photo: resolveAssetUrl('/photos/p-2713733.webp'),
                  sampleLabel: '22 Bellport Ln · c. 1846',
                  pid: 'p-2713733',
                },
                {
                  name: '2. South Howells & Bay Bluff (South of Main · West)',
                  streets: 'S. Howells Pt Rd, Country Club Rd, Thornhedge Rd, Otis Ave, Titus Ln',
                  desc: 'Grand estate corridor between Bellport Country Club and the Bay. Deep 0.5–2.4 acre lawns, heated gunite pools, Shingle compounds, and bay bluffs.',
                  photo: resolveAssetUrl('/photos/p-2714051.webp'),
                  sampleLabel: '15 Otis Ave · 1.22 Acres',
                  pid: 'p-2714051',
                },
                {
                  name: '3. Country Club & West (North of Main · West)',
                  streets: 'N. Howells Pt Rd, Woodland Park Rd, General McLean Dr, Bieselin Rd',
                  desc: 'Leafy, peaceful residential lanes north of South Country Road with generous 0.35–0.6 acre lots on dry inland ground.',
                  photo: resolveAssetUrl('/photos/p-2713653.webp'),
                  sampleLabel: '7 N Howells Pt Rd · c. 1934',
                  pid: 'p-2713653',
                },
                {
                  name: '4. Village North & East (North of Main · East)',
                  streets: 'Station Rd, 2nd–4th Sts, New Jersey Ave, N. Brewster Ln, Circuit Rd',
                  desc: 'Walkable vintage village blocks and classic cedar-shake Capes just above Main Street with deep, pool-ready backyards.',
                  photo: resolveAssetUrl('/photos/p-2713298.webp'),
                  sampleLabel: '19 Third St · c. 1949 Cape',
                  pid: 'p-2713298',
                },
              ].map((sec) => (
                <div
                  key={sec.name}
                  onClick={() => onOpenListing(sec.pid)}
                  style={{
                    borderRadius: 14,
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--line)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      aspectRatio: '16 / 10',
                      background: 'var(--bg)',
                      overflow: 'hidden',
                    }}
                  >
                    {sec.photo && (
                      <img
                        src={sec.photo}
                        alt={sec.sampleLabel}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        left: 8,
                        bottom: 8,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'rgba(15, 23, 42, 0.75)',
                        color: '#ffffff',
                        fontSize: 10.5,
                        fontWeight: 500,
                      }}
                    >
                      {sec.sampleLabel}
                    </span>
                  </div>
                  <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{sec.name}</strong>
                    <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}>
                      {sec.streets}
                    </div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.52, color: 'var(--ink-2)', margin: 0 }}>
                      {sec.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Climate Change Risk & How to Manage It */}
        <ScrollReveal direction="up">
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={17} color="var(--accent)" />
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Resilience &amp; Due Diligence
              </span>
            </div>
            <h2 style={{ fontSize: 21, margin: 0 }}>
              Climate Change &amp; Coastal Risk — How to Think About and Manage It
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
                fontSize: 13.5,
                lineHeight: 1.58,
                color: 'var(--ink-2)',
              }}
            >
              <div>
                <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                  1. Understand the Elevation Split (Shorefront Flood Zones AE/VE vs. Dry Upland)
                </strong>
                Fire Island shields Bellport from direct Atlantic surf, though bay storm surge
                affects immediate low-lying shorefront blocks (FEMA Zones AE and VE). Crucially,
                Bellport rises quickly onto a glacial outwash plain:{' '}
                <strong style={{ color: 'var(--ink)' }}>
                  over 80% of the Village — including upper Bellport Ln, Browns Ln, Bell St, Hulse,
                  upper Livingston, and virtually all blocks north of Main St — sits at 20–32 ft
                  elevation outside any coastal flood zone
                </strong>{' '}
                (requiring no mandatory flood insurance).
              </div>
              <div>
                <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                  2. Practical Buyer Playbook to Manage Risk
                </strong>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <li>
                    <strong>Buy Walkable Elevation:</strong> Choosing a lot 2–4 blocks off
                    the water gives a 6-minute walk to the Marina while staying outside coastal
                    flood zones &amp; FEMA 50%-rule renovation caps.
                  </li>
                  <li>
                    <strong>Harden Systems:</strong> Pair a natural-gas standby generator with
                    battery-backed sump pumps, elevated HVAC/pool condensers, and periodic arborist
                    pruning of mature oaks.
                  </li>
                  <li>
                    <strong>Insurance &amp; Septic Check:</strong> Verify windstorm deductibles and
                    confirm groundwater depth when planning a pool or finished basement.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Press & News Coverage */}
        <ScrollReveal direction="up">
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Newspaper size={17} color="var(--accent)" />
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Press &amp; Journalism
              </span>
            </div>
            <h2 style={{ fontSize: 21, margin: 0 }}>Selected News Coverage &amp; Profiles</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                gap: 12,
              }}
            >
              {PRESS_LINKS.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    border: '1px solid var(--line)',
                    background: 'var(--surface-subtle)',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.outlet}
                    </span>
                    <ExternalLink size={13} color="var(--ink-muted)" />
                  </div>
                  <strong style={{ fontSize: 14, lineHeight: 1.35, color: 'var(--ink)' }}>
                    {item.title}
                  </strong>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', margin: 0 }}>
                    {item.blurb}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Public Amenities & Main Street Commercial Directory with Photos & Links */}
        <ScrollReveal direction="up">
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <span className="eyebrow" style={{ marginBottom: 4 }}>
                  Parks, Golf, Marina, Dining &amp; Shops
                </span>
                <h2 style={{ fontSize: 21, margin: 0 }}>
                  Public Amenities &amp; Commercial Properties ({filteredPois.length})
                </h2>
              </div>

              <div className="segmented-tabs" role="group" aria-label="Amenity category">
                {(
                  [
                    ['all', 'All'],
                    ['water_parks', 'Beaches & Parks'],
                    ['golf_civic', 'Golf & Culture'],
                    ['dining', 'Restaurants'],
                    ['shops', 'Main St Stores'],
                  ] as const
                ).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    className={`segmented-tabs__tab ${poiFilter === val ? 'is-active' : ''}`}
                    style={{ fontSize: 12, padding: '5px 10px' }}
                    onClick={() => setPoiFilter(val)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: 14,
              }}
            >
              {filteredPois.map((poi) => {
                const imgSrc = resolveAssetUrl(poi.photoUrl);
                return (
                  <article
                    key={poi.id}
                    style={{
                      borderRadius: 14,
                      border: '1px solid var(--line)',
                      background: 'var(--bg)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {imgSrc && (
                      <div style={{ aspectRatio: '16 / 10', background: 'var(--surface-subtle)' }}>
                        <img
                          src={imgSrc}
                          alt={poi.name}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      </div>
                    )}
                    <div
                      style={{
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          className="badge"
                          style={{ textTransform: 'capitalize', fontSize: 10.5 }}
                        >
                          {poi.kind === 'public' ? 'Culture & Civic' : poi.kind}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{poi.addr}</span>
                      </div>
                      <strong style={{ fontSize: 14.5 }}>{poi.name}</strong>
                      <p
                        style={{
                          fontSize: 12.5,
                          color: 'var(--ink-2)',
                          lineHeight: 1.5,
                          margin: 0,
                          flex: 1,
                        }}
                      >
                        {poi.desc}
                      </p>
                      <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
                        {poi.websiteUrl && (
                          <a
                            href={poi.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            style={{
                              fontSize: 11.5,
                              padding: '4px 10px',
                              textDecoration: 'none',
                              flex: 1,
                              justifyContent: 'center',
                            }}
                          >
                            <span>{poi.websiteLabel ?? 'Website'}</span>
                            <ExternalLink size={11} />
                          </a>
                        )}
                        {poi.mapsUrl && (
                          <a
                            href={poi.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-btn"
                            style={{ fontSize: 11.5, padding: '4px 9px', textDecoration: 'none' }}
                            title="Open in Google Maps"
                          >
                            <MapPin size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};
