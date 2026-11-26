import React, { useMemo, useState } from 'react';
import {
  Anchor,
  Car,
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
import { resolveAssetUrl } from '../lib/unifiedCatalog';

interface AboutBellportViewProps {
  pois: VillagePoi[];
  onJumpToMap?: () => void;
}

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

export const AboutBellportView: React.FC<AboutBellportViewProps> = ({ pois, onJumpToMap }) => {
  const [poiFilter, setPoiFilter] = useState<PoiFilter>('all');

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

  const cardStyle: React.CSSProperties = {
    padding: 22,
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  };

  return (
    <section style={{ padding: '22px 0 48px' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Hero Overview */}
        <div style={cardStyle}>
          <span className="eyebrow" style={{ marginBottom: 0 }}>
            Village Guide · Incorporated 1910 · 1.5 Sq Mi
          </span>
          <h1 style={{ fontSize: 28, margin: 0 }}>
            About Bellport, NY — A Warm, Clear-Eyed Field Guide
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'var(--ink-2)', margin: 0 }}>
            Founded by 19th-century sea captains along a sheltered arm of the Great South Bay,{' '}
            <strong style={{ color: 'var(--ink)' }}>Incorporated Bellport Village</strong> (~2,200
            year-round residents; <strong>1,058 residential homes</strong>) is widely nicknamed{' '}
            <strong style={{ color: 'var(--ink)' }}>“the Un-Hamptons.”</strong> Tree-canopied lanes
            of weathered cedar-shingle and clapboard homes run south from a brick-sidewalk Main
            Street down to a Village Marina, where a residents-only ferry crosses the bay to{' '}
            <strong style={{ color: 'var(--ink)' }}>Ho-Hum Beach</strong> — the Village’s private
            ocean beach on Fire Island. Life moves by bicycle and front porch rather than velvet
            ropes or highway gridlock, yet an important nuance for buyers is boundary discipline:
            municipal beach, ferry, golf, and zoning protections belong specifically to{' '}
            <strong style={{ color: 'var(--ink)' }}>Incorporated Bellport Village</strong>, distinct
            from surrounding unincorporated Brookhaven hamlets.
          </p>
        </div>

        {/* Commute from 910 Union Street, Park Slope + Vacation Market Profile */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          {/* Travel Time from 910 Union Street, Park Slope */}
          <div style={cardStyle}>
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
                    Prospect Expwy / BQE → I-495 LIE East (Exit 64/65) → NY-27 Sunrise Hwy → Station
                    Rd straight into Main Street.
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

          {/* Vacation Home Market, Full-Time vs Second-Home Mix & Who Lives Here */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Home size={17} color="var(--accent)" />
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Homeowner Mix & Market Character
              </span>
            </div>
            <h2 style={{ fontSize: 20, margin: 0 }}>
              Full-Time vs. Second-Home Owners & Who Buys Here
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
                On the NYS tax roll, 117 homes (~11%) mail tax bills directly out-of-town, and local
                brokerage/Census data places total weekend & second-home ownership around{' '}
                <strong>30%–35%</strong> (concentrated heavily south of Main Street). Because ~65–70%
                of neighbors live in Bellport year-round, shops and restaurants don’t shutter after
                Labor Day.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>Who Owns Homes Here:</strong> A distinctive
                blend of <strong>Brooklyn & Manhattan creative families</strong> (architects,
                magazine editors, designers, gallery owners, writers, theater/film creatives),{' '}
                <strong>physicians & Brookhaven National Lab scientists</strong>, and
                multi-generational sailing/golfing families.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>Tightly Held Vacation Market:</strong> With
                only 1,058 residential parcels and zero room to sprawl, just{' '}
                <strong>25–45 Village homes</strong> typically trade per year. Long-term median sale
                prices have risen <strong>+374%</strong> since 1993 (outpacing the +337% U.S.
                national Case-Shiller average) while remaining roughly half the price of comparable
                Sag Harbor or Amagansett homes.
              </li>
            </ul>
          </div>
        </div>

        {/* Unusual Village Amenities + Construction/Airbnb Governance */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Anchor size={17} color="var(--accent)" />
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Resident Privileges
              </span>
            </div>
            <h2 style={{ fontSize: 20, margin: 0 }}>Unusual Amenities Exclusive to Village Owners</h2>
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
                Accessible only to Village residents, guests, and boaters via the 20-minute{' '}
                <em>Whalehouse Point</em> ferry from the foot of Bellport Lane — lifeguarded ocean
                surf bordering the car-free Otis Pike High Dune Wilderness.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>
                  Municipal 18-Hole Bayfront Golf & Tennis:
                </strong>{' '}
                Village-owned <strong>Bellport Country Club</strong> offers resident-rate golf
                memberships, har-tru tennis courts, junior clinics, and bayfront dining.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>
                  Town Marina, Mothers’ Beach & Summer Bandshell:
                </strong>{' '}
                Resident boat slips, kids’ sailing lessons, gentle bay beach/playground for young
                children, and free weekly outdoor concerts overlooking the water.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>White-Glove Village Sanitation:</strong>{' '}
                Municipal twice-weekly trash pickup, leaf/brush collection, and dedicated Village
                Hall staff.
              </li>
            </ul>
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={17} color="var(--accent)" />
              <span className="eyebrow" style={{ marginBottom: 0 }}>
                Local Rules & Culture
              </span>
            </div>
            <h2 style={{ fontSize: 20, margin: 0 }}>
              Approach to Construction, Renovations & Airbnb
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
                  Historic Preservation & Architectural Review:
                </strong>{' '}
                Inside the Bellport Lane / Browns / Academy Historic District, teardowns are barred
                and exterior changes go before the Historic District Preservation Commission.
                Village-wide, the <strong>Architectural Review Board (ARB)</strong> favors cedar
                shingle, clapboard, and traditional scale over oversized McMansions.
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>Adding Pools, Pool Houses & ADUs:</strong>{' '}
                Adding an in-ground pool or detached studio/pool house is very common on 0.32+ acre
                lots, subject to strict lot-coverage caps, side/rear setbacks, self-latching pool
                fencing, and Suffolk County septic clearances (bedroom expansions often trigger
                modern nitrogen-reducing I/A septic tanks).
              </li>
              <li>
                <strong style={{ color: 'var(--ink)' }}>Airbnb & Summer Rentals:</strong> Unlike
                unincorporated Town of Brookhaven (which bans stays under 28 nights),{' '}
                <strong>Incorporated Bellport Village permits rentals</strong> with a{' '}
                <strong>2-year Village Rental Permit</strong> and safety/pool-alarm inspection;
                summer tenants can buy a $650 Seasonal Guest ID for the Ho-Hum ferry. Quiet family
                bookings thrive, while party houses face swift code enforcement.
              </li>
            </ul>
          </div>
        </div>

        {/* The Four Sections of Town */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span className="eyebrow" style={{ marginBottom: 4 }}>
                Neighborhood Geography
              </span>
              <h2 style={{ fontSize: 21, margin: 0 }}>The Four Sections of Bellport Village</h2>
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
              gap: 12,
            }}
          >
            {[
              {
                name: '1. Historic Lanes (South of Main · Center/East)',
                streets: 'Bellport Ln, Browns Ln, Bell St, Hulse, Livingston, Rogers, Academy, Shore Rd',
                desc: 'The 19th-century architectural heart. Sycamore canopies, shingled sea captains’ houses, and effortless walks to both Main Street shops and the Marina. Highest $/ft² and tightest inventory.',
              },
              {
                name: '2. South Howells & Bay Bluff (South of Main · West)',
                streets: 'S. Howells Pt Rd, Country Club Rd, Thornhedge Rd, Otis Ln, Point Rd',
                desc: 'Grand estate corridor between Bellport Golf Club and the Bay. Deep 0.5–1.5 acre lawns, heated gunite pools, classic Colonials, and sweeping waterfront bluffs.',
              },
              {
                name: '3. Country Club & West (North of Main · West)',
                streets: 'Bieselin Rd, N. Howells Pt Rd, General McLean Dr, Kreamer St',
                desc: 'Leafy, peaceful residential lanes north of South Country Road. Generous 0.3–0.5 acre lots, high-and-dry Flood Zone X elevation, and strong value per square foot.',
              },
              {
                name: '4. Village North & East (North of Main · East)',
                streets: '2nd–4th Sts, New Jersey Ave, N. Brewster Ln, Circuit Rd, Maplewood Dr',
                desc: 'Walkable vintage village blocks just above Main Street transitioning eastward into curving, family-friendly mid-century loops (Circuit & Maplewood) with spacious pool-ready yards.',
              },
            ].map((sec) => (
              <div
                key={sec.name}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{sec.name}</strong>
                <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}>
                  {sec.streets}
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.52, color: 'var(--ink-2)', margin: 0 }}>
                  {sec.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Climate Change Risk & How to Manage It */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={17} color="var(--accent)" />
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              Resilience & Due Diligence
            </span>
          </div>
          <h2 style={{ fontSize: 21, margin: 0 }}>
            Climate Change & Coastal Risk — How to Think About and Manage It
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
                1. Understand the Elevation Split (Zone X vs. AE/VE)
              </strong>
              Fire Island shields Bellport from direct Atlantic surf, though bay storm surge (and
              higher tidal exchange since the 2012 Old Inlet breach) affects immediate waterfront
              blocks. Crucially, Bellport rises quickly onto a glacial outwash plain:{' '}
              <strong style={{ color: 'var(--ink)' }}>
                over 80% of the Village — including upper Bellport Ln, Browns Ln, Bell St, Hulse,
                upper Livingston, and virtually all blocks north of Main St — sits at 20–32 ft
                elevation in FEMA Flood Zone X
              </strong>{' '}
              (outside the 100-year floodplain, with no mandatory flood insurance), whereas Shore
              Rd, Point Rd, and lowest S. Howells sit in Zones AE/VE.
            </div>
            <div>
              <strong style={{ color: 'var(--ink)', display: 'block', marginBottom: 4 }}>
                2. Practical Buyer Playbook to Manage Risk
              </strong>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>
                  <strong>Buy Walkable Elevation:</strong> Choosing a Zone X lot 2–4 blocks off the
                  water gives a 6-minute walk to the Marina while avoiding surge & FEMA 50%-rule
                  renovation caps.
                </li>
                <li>
                  <strong>Harden Systems:</strong> Pair a natural-gas standby generator with
                  battery-backed basement sump pumps, elevated HVAC/pool condensers, and periodic
                  arborist pruning of mature oaks.
                </li>
                <li>
                  <strong>Insurance & Septic Check:</strong> Verify windstorm deductibles on
                  homeowners policies and confirm groundwater depth if planning a finished basement
                  or pool.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Press & News Coverage */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Newspaper size={17} color="var(--accent)" />
            <span className="eyebrow" style={{ marginBottom: 0 }}>
              Press & Journalism
            </span>
          </div>
          <h2 style={{ fontSize: 21, margin: 0 }}>Selected News Coverage & Profiles</h2>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>
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

        {/* Public Amenities & Main Street Commercial Directory with Photos & Links */}
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
                Parks, Golf, Marina, Dining & Shops
              </span>
              <h2 style={{ fontSize: 21, margin: 0 }}>
                Public Amenities & Commercial Properties ({filteredPois.length})
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
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  )}
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span
                        className="badge"
                        style={{ textTransform: 'capitalize', fontSize: 10.5 }}
                      >
                        {poi.kind === 'public' ? 'Culture & Civic' : poi.kind}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{poi.addr}</span>
                    </div>
                    <strong style={{ fontSize: 14.5 }}>{poi.name}</strong>
                    <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: 0, flex: 1 }}>
                      {poi.desc}
                    </p>
                    <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
                      {poi.websiteUrl && (
                        <a
                          href={poi.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn"
                          style={{ fontSize: 11.5, padding: '4px 10px', textDecoration: 'none', flex: 1, justifyContent: 'center' }}
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
      </div>
    </section>
  );
};
