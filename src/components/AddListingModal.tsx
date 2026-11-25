import React, { useState } from 'react';
import { ClipboardPaste, FileSpreadsheet, PenLine, Sparkles, X } from 'lucide-react';
import type { BellportMicroArea, FloodZone, Listing, MarketStatus } from '../types';
import {
  inferBellportArea,
  parseCsvListings,
  parseListingSnippet,
  slugifyAddress,
} from '../lib/parser';

interface AddListingModalProps {
  open: boolean;
  onClose: () => void;
  onAddListings: (items: Listing[]) => void;
}

export const AddListingModal: React.FC<AddListingModalProps> = ({
  open,
  onClose,
  onAddListings,
}) => {
  const [mode, setMode] = useState<'paste' | 'csv' | 'manual'>('paste');
  const [rawSnippet, setRawSnippet] = useState('');
  const [csvNotice, setCsvNotice] = useState<string | null>(null);

  // Form state shared by Manual & post-parse review
  const [address, setAddress] = useState('');
  const [area, setArea] = useState<BellportMicroArea>('Historic Lanes');
  const [inVillage, setInVillage] = useState(true);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>('active');
  const [price, setPrice] = useState('1750000');
  const [beds, setBeds] = useState('4');
  const [baths, setBaths] = useState('3');
  const [sqft, setSqft] = useState('2500');
  const [lotAcres, setLotAcres] = useState('0.50');
  const [yearBuilt, setYearBuilt] = useState('1925');
  const [annualTaxes, setAnnualTaxes] = useState('16500');
  const [floodZone, setFloodZone] = useState<FloodZone>('X');
  const [style, setStyle] = useState('Cedar Shingle Colonial');
  const [brokerage, setBrokerage] = useState('Old Purchase Properties');
  const [sourceUrl, setSourceUrl] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [featuresText, setFeaturesText] = useState('Zone X, screened porch, room for pool');
  const [description, setDescription] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');

  if (!open) return null;

  const handleExtractFromPaste = () => {
    if (!rawSnippet.trim()) return;
    const draft = parseListingSnippet(rawSnippet);
    if (draft.address) setAddress(draft.address);
    if (draft.area) setArea(draft.area);
    if (typeof draft.inVillage === 'boolean') setInVillage(draft.inVillage);
    if (draft.price) setPrice(String(draft.price));
    if (draft.beds) setBeds(String(draft.beds));
    if (draft.baths) setBaths(String(draft.baths));
    if (draft.sqft) setSqft(String(draft.sqft));
    if (draft.lotAcres) setLotAcres(String(draft.lotAcres));
    if (draft.yearBuilt) setYearBuilt(String(draft.yearBuilt));
    if (draft.annualTaxes) setAnnualTaxes(String(draft.annualTaxes));
    if (draft.floodZone) setFloodZone(draft.floodZone);
    if (draft.sourceUrl) setSourceUrl(draft.sourceUrl);
    if (draft.features && draft.features.length > 0) {
      setFeaturesText(draft.features.join(', '));
    }
    if (draft.description) setDescription(draft.description);
    setMode('manual');
  };

  const handleSaveSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAddr = address.trim() || 'Untitled Bellport Property';
    const numericPrice = Number(price.replace(/[^0-9.]/g, '')) || 1000000;
    const features = featuresText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newListing: Listing = {
      id: `${slugifyAddress(cleanAddr)}-${Date.now().toString(36).slice(-4)}`,
      address: cleanAddr,
      area,
      inVillage,
      marketStatus,
      userStatus: 'shortlist',
      price: numericPrice,
      beds: Number(beds) || 3,
      baths: Number(baths) || 2,
      sqft: Number(sqft.replace(/[^0-9.]/g, '')) || 2000,
      lotAcres: Number(lotAcres) || 0.4,
      yearBuilt: Number(yearBuilt) || 1930,
      annualTaxes: Number(annualTaxes.replace(/[^0-9.]/g, '')) || 15000,
      floodZone,
      daysOnMarket: 1,
      listedDate: new Date().toISOString().slice(0, 10),
      style: style.trim() || 'Village Residence',
      archetype: features.some((f) => f.includes('pool')) ? 'shingle-pool' : 'colonial',
      headline:
        description.trim().slice(0, 96) ||
        `${beds}-bedroom ${style.toLowerCase()} in ${area}.`,
      description:
        description.trim() ||
        `${beds} beds, ${baths} baths, ${Number(sqft).toLocaleString()} sq ft on ${lotAcres} acres in ${area}.`,
      features,
      brokerage: brokerage.trim() || 'Direct / Local Broker',
      sourceUrl: sourceUrl.trim() || undefined,
      photoUrl: photoUrl.trim() || undefined,
      personalNotes: personalNotes.trim(),
      isSample: false,
    };

    onAddListings([newListing]);
    onClose();
  };

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsvListings(text);
      if (parsed.length === 0) {
        setCsvNotice('No valid listing rows found in CSV.');
        return;
      }
      onAddListings(parsed);
      onClose();
    } catch (err) {
      setCsvNotice(err instanceof Error ? err.message : 'Could not parse CSV file.');
    }
  };

  return (
    <div
      className="backdrop backdrop--center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal__header">
          <div>
            <h2 id="add-modal-title" style={{ fontSize: 22 }}>
              Add Bellport Listing
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Zero-scrape capture: paste listing text, upload a Redfin CSV, or enter manually.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        <div className="modal__body">
          <div className="segmented-tabs" style={{ alignSelf: 'flex-start' }}>
            <button
              type="button"
              className={`segmented-tabs__tab ${mode === 'paste' ? 'is-active' : ''}`}
              onClick={() => setMode('paste')}
            >
              <ClipboardPaste size={14} />
              <span>Smart Paste</span>
            </button>
            <button
              type="button"
              className={`segmented-tabs__tab ${mode === 'csv' ? 'is-active' : ''}`}
              onClick={() => setMode('csv')}
            >
              <FileSpreadsheet size={14} />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              className={`segmented-tabs__tab ${mode === 'manual' ? 'is-active' : ''}`}
              onClick={() => setMode('manual')}
            >
              <PenLine size={14} />
              <span>Manual Form</span>
            </button>
          </div>

          {mode === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Copy text from any Zillow, Redfin, Compass, or{' '}
                <strong>Old Purchase Properties</strong> listing page (or a saved-search alert
                email) and paste it below. We extract price, beds, baths, sq ft, acreage, Bellport
                lane boundary, and searchable keywords automatically.
              </p>
              <textarea
                id="smart-paste-textarea"
                className="textarea"
                rows={7}
                value={rawSnippet}
                onChange={(e) => setRawSnippet(e.target.value)}
                placeholder={`Example:\n42 Bellport Lane, Bellport Village, NY 11713\n$2,350,000 · 4 Beds · 3.5 Baths · 2,980 Sq Ft · 0.54 Acres\nBuilt in 1908. Classic shingle house with heated gunite pool, screened porch, wood-burning fireplace, and guest studio in Zone X. Taxes $19,400.`}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    setRawSnippet(
                      '42 Bellport Lane, Bellport Village, NY 11713\n$2,350,000 · 4 Beds · 3.5 Baths · 2,980 Sq Ft · 0.54 Acres\nBuilt in 1908. Classic shingle house south of Main Street with heated gunite pool, screened porch, wood-burning fireplace, and detached guest studio in Zone X. Annual taxes $19,400.'
                    )
                  }
                >
                  Load Example Text
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--primary"
                  onClick={handleExtractFromPaste}
                >
                  <Sparkles size={15} />
                  <span>Extract & Review Fields</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'csv' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Upload a <strong>Redfin &ldquo;Download All&rdquo;</strong> search export CSV or a
                Bellport Watch CSV file. Street names are automatically matched against Incorporated
                Village lanes.
              </p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFile}
                className="input"
              />
              {csvNotice && (
                <p style={{ fontSize: 13, color: 'var(--g-red-600)' }}>{csvNotice}</p>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <form onSubmit={handleSaveSingle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-grid">
                <div>
                  <label className="filter-field__label">Street Address</label>
                  <input
                    required
                    className="input"
                    value={address}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddress(val);
                      const inferred = inferBellportArea(val);
                      setArea(inferred.area);
                      setInVillage(inferred.inVillage);
                    }}
                    placeholder="e.g. 28 Browns Lane"
                  />
                </div>
                <div>
                  <label className="filter-field__label">Asking Price ($)</label>
                  <input
                    required
                    className="input"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="filter-field__label">Micro-Area</label>
                  <select
                    className="filter-field__select"
                    style={{ width: '100%' }}
                    value={area}
                    onChange={(e) => setArea(e.target.value as BellportMicroArea)}
                  >
                    <option value="Historic Lanes">Historic Lanes (South of Main)</option>
                    <option value="Country Club & Golf">Country Club & Golf</option>
                    <option value="Village Center">Village Center</option>
                    <option value="East Lanes & Circuit">East Lanes & Circuit</option>
                    <option value="Outside Village (11713)">Outside Village (11713)</option>
                  </select>
                </div>
                <div>
                  <label className="filter-field__label">Listing Status</label>
                  <select
                    className="filter-field__select"
                    style={{ width: '100%' }}
                    value={marketStatus}
                    onChange={(e) => setMarketStatus(e.target.value as MarketStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="off-market">Off-Market / Whisper</option>
                    <option value="contingent">In Contract / Contingent</option>
                    <option value="sold">Sold Comp</option>
                  </select>
                </div>
                <div>
                  <label className="filter-field__label">Bedrooms</label>
                  <input className="input" value={beds} onChange={(e) => setBeds(e.target.value)} />
                </div>
                <div>
                  <label className="filter-field__label">Bathrooms</label>
                  <input className="input" value={baths} onChange={(e) => setBaths(e.target.value)} />
                </div>
                <div>
                  <label className="filter-field__label">Interior Space (Sq Ft)</label>
                  <input className="input" value={sqft} onChange={(e) => setSqft(e.target.value)} />
                </div>
                <div>
                  <label className="filter-field__label">Lot Size (Acres)</label>
                  <input
                    className="input"
                    value={lotAcres}
                    onChange={(e) => setLotAcres(e.target.value)}
                  />
                </div>
                <div>
                  <label className="filter-field__label">Annual Taxes ($)</label>
                  <input
                    className="input"
                    value={annualTaxes}
                    onChange={(e) => setAnnualTaxes(e.target.value)}
                  />
                </div>
                <div>
                  <label className="filter-field__label">Flood Zone</label>
                  <select
                    className="filter-field__select"
                    style={{ width: '100%' }}
                    value={floodZone}
                    onChange={(e) => setFloodZone(e.target.value as FloodZone)}
                  >
                    <option value="X">Zone X (Minimal flood hazard)</option>
                    <option value="AE">Zone AE (100-yr coastal flood)</option>
                    <option value="VE">Zone VE (Direct wave velocity)</option>
                  </select>
                </div>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={inVillage}
                  onChange={(e) => setInVillage(e.target.checked)}
                />
                <span>
                  Inside <strong>Incorporated Village of Bellport</strong> (Ho-Hum Beach ferry &
                  Marina eligible)
                </span>
              </label>

              <div className="form-grid">
                <div>
                  <label className="filter-field__label">Architectural Style</label>
                  <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} />
                </div>
                <div>
                  <label className="filter-field__label">Brokerage / Source</label>
                  <input
                    className="input"
                    value={brokerage}
                    onChange={(e) => setBrokerage(e.target.value)}
                  />
                </div>
                <div>
                  <label className="filter-field__label">Listing URL (optional)</label>
                  <input
                    className="input"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="filter-field__label">Photo URL (optional)</label>
                  <input
                    className="input"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div>
                <label className="filter-field__label">
                  Searchable Keywords (comma-separated)
                </label>
                <input
                  className="input"
                  value={featuresText}
                  onChange={(e) => setFeaturesText(e.target.value)}
                />
              </div>

              <div>
                <label className="filter-field__label">Description / Remarks</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label className="filter-field__label">Personal Notes</label>
                <input
                  className="input"
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Initial impressions or broker questions..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="icon-btn" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="icon-btn icon-btn--primary">
                  Save Listing
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
