import { useState } from 'react';
import { api, type FreshMarketDTO, type FreshPriceDTO } from '../api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Chip } from '../components/ui/chip';
import { Input } from '../components/ui/input';
import { Table } from '../components/ui/table';
import { Alert } from '../components/ui/alert';
import { Empty, ErrorBox, Freshness, Section, SkeletonTable, Toolbar, useRemote, when } from '../ui';

interface PriceRowState {
  marketId: string;
  crop: 'tomato' | 'onion' | 'grapes';
  price: string;
  unit: 'kg' | 'quintal' | 'tonne';
  sourceType: 'OPERATOR' | 'DEMO' | 'OFFICIAL';
}

export function FreshDataTab() {
  const marketsRemote = useRemote(() => api.freshMarkets(), 60_000);
  const pricesRemote = useRemote(() => api.freshLatestPrices(), 30_000);

  // Section A: Market Form State
  const [editingMarketId, setEditingMarketId] = useState<string | null>(null);
  const [marketName, setMarketName] = useState('');
  const [marketCode, setMarketCode] = useState('');
  const [marketLat, setMarketLat] = useState('');
  const [marketLng, setMarketLng] = useState('');
  const [commissionPct, setCommissionPct] = useState('5');
  const [handlingINRPerKg, setHandlingINRPerKg] = useState('0.5');
  const [acceptedCrops, setAcceptedCrops] = useState<string[]>([
    'tomato',
    'onion',
    'grapes',
  ]);
  const [newCustomCrop, setNewCustomCrop] = useState('');
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketSuccess, setMarketSuccess] = useState<string | null>(null);
  const [marketSaving, setMarketSaving] = useState(false);

  // Section B: Inline price inputs map keyed by `${marketId}-${crop}`
  const [inlinePrices, setInlinePrices] = useState<Record<string, PriceRowState>>({});
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceSuccess, setPriceSuccess] = useState<string | null>(null);
  const [priceSaving, setPriceSaving] = useState(false);

  // Section C: Selected row for history
  const [selectedHistory, setSelectedHistory] = useState<{
    marketId: string;
    marketName: string;
    crop: string;
  } | null>(null);
  const [historyItems, setHistoryItems] = useState<FreshPriceDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const resetMarketForm = () => {
    setEditingMarketId(null);
    setMarketName('');
    setMarketCode('');
    setMarketLat('');
    setMarketLng('');
    setCommissionPct('5');
    setHandlingINRPerKg('0.5');
    setAcceptedCrops(['tomato', 'onion', 'grapes']);
    setMarketError(null);
  };

  const handleEditMarket = (market: FreshMarketDTO) => {
    setEditingMarketId(market._id);
    setMarketName(market.name);
    setMarketCode(market.code);
    setMarketLat(String(market.location?.lat ?? ''));
    setMarketLng(String(market.location?.lng ?? ''));
    setCommissionPct(String(market.commissionPct ?? 0));
    setHandlingINRPerKg(String(market.handlingINRPerKg ?? 0));
    setAcceptedCrops(market.acceptedCrops ?? ['tomato', 'onion', 'grapes']);
    setMarketError(null);
    setMarketSuccess(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    setMarketError(null);
    setMarketSuccess(null);
    setMarketSaving(true);

    const lat = Number(marketLat);
    const lng = Number(marketLng);

    const payload = {
      name: marketName.trim(),
      code: marketCode.trim(),
      location: { lat, lng },
      commissionPct: Number(commissionPct),
      handlingINRPerKg: Number(handlingINRPerKg),
      acceptedCrops,
    };

    try {
      if (editingMarketId) {
        await api.updateFreshMarket(editingMarketId, payload);
        setMarketSuccess(`Market "${marketName}" updated successfully.`);
      } else {
        await api.createFreshMarket(payload);
        setMarketSuccess(`Market "${marketName}" created successfully.`);
      }
      resetMarketForm();
      marketsRemote.refresh();
      pricesRemote.refresh();
    } catch (err: any) {
      setMarketError(err?.message || 'Could not save market.');
    } finally {
      setMarketSaving(false);
    }
  };

  const handleToggleMarketActive = async (market: FreshMarketDTO) => {
    try {
      await api.updateFreshMarket(market._id, { active: !market.active });
      marketsRemote.refresh();
      pricesRemote.refresh();
    } catch (err: any) {
      window.alert(err?.message || 'Failed to update market status');
    }
  };

  const handleInlineChange = (
    marketId: string,
    crop: string,
    field: 'price' | 'unit' | 'sourceType',
    value: string,
  ) => {
    const key = `${marketId}-${crop}`;
    const current = inlinePrices[key] ?? {
      marketId,
      crop,
      price: '',
      unit: 'quintal',
      sourceType: 'OPERATOR',
    };
    setInlinePrices({
      ...inlinePrices,
      [key]: {
        ...current,
        [field]: value,
      },
    });
  };

  const handleSaveSinglePrice = async (marketId: string, crop: string) => {
    const key = `${marketId}-${crop}`;
    const row = inlinePrices[key];
    const priceVal = Number(row?.price);
    if (!row || !row.price || Number.isNaN(priceVal) || priceVal <= 0) {
      setPriceError('Price 0 se zyada honi chahiye');
      return;
    }

    setPriceError(null);
    setPriceSuccess(null);
    setPriceSaving(true);

    try {
      await api.createFreshPrice({
        marketId,
        crop,
        price: priceVal,
        unit: row.unit || 'quintal',
        sourceType: row.sourceType || 'OPERATOR',
      });
      setPriceSuccess(`Price updated for ${crop}.`);
      setInlinePrices((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      pricesRemote.refresh();
    } catch (err: any) {
      setPriceError(err?.message || 'Could not save price');
    } finally {
      setPriceSaving(false);
    }
  };

  const handleSaveAllChangedPrices = async () => {
    const changed = Object.values(inlinePrices).filter((r) => {
      const num = Number(r.price);
      return r.price.trim() !== '' && !Number.isNaN(num) && num > 0;
    });

    if (changed.length === 0) {
      setPriceError('Koi badla hua price nahi hai save karne ke liye.');
      return;
    }

    setPriceError(null);
    setPriceSuccess(null);
    setPriceSaving(true);

    try {
      const payload = changed.map((r) => ({
        marketId: r.marketId,
        crop: r.crop,
        price: Number(r.price),
        unit: r.unit || 'quintal',
        sourceType: r.sourceType || 'OPERATOR',
      }));
      await api.bulkUpdateFreshPrices(payload);
      setPriceSuccess(`Saved ${changed.length} price updates successfully.`);
      setInlinePrices({});
      pricesRemote.refresh();
    } catch (err: any) {
      setPriceError(err?.message || 'Could not save bulk prices');
    } finally {
      setPriceSaving(false);
    }
  };

  const handleSelectHistory = async (marketId: string, marketName: string, crop: string) => {
    setSelectedHistory({ marketId, marketName, crop });
    setHistoryLoading(true);
    try {
      const hist = await api.freshPriceHistory(marketId, crop);
      setHistoryItems(hist);
    } catch (err) {
      console.error(err);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const markets = marketsRemote.data ?? [];
  const latestPrices = pricesRemote.data ?? [];

  // Map latest prices by `${marketId}-${crop}`
  const priceMap = new Map<string, FreshPriceDTO>();
  for (const lp of latestPrices) {
    priceMap.set(`${lp.marketId}-${lp.crop}`, lp);
  }

  return (
    <div className="stack" style={{ gap: 'var(--s-xl)' }}>
      <Toolbar>
        <div className="label-sm muted">Manage Fresh markets, operator prices, and update history</div>
        <Freshness
          at={marketsRemote.refreshedAt}
          onRefresh={() => {
            marketsRemote.refresh();
            pricesRemote.refresh();
          }}
        />
      </Toolbar>

      {/* =========================================================================
          SECTION A: MARKETS TABLE & ADD/EDIT FORM
      ========================================================================= */}
      <Section title="Section A: Fresh Markets">
        {/* Form Card */}
        <Card className="card stack" style={{ padding: 'var(--s-lg)', maxWidth: 840 }}>
          <div className="headline-sm">{editingMarketId ? 'Edit Market' : 'Add New Market'}</div>

          {marketError && (
            <Alert tone="danger" title="Validation Error">
              {marketError}
            </Alert>
          )}

          {marketSuccess && (
            <Alert tone="success" title="Success">
              {marketSuccess}
            </Alert>
          )}

          <form onSubmit={handleSaveMarket} className="stack" style={{ gap: 'var(--s-md)' }}>
            <div className="row" style={{ gap: 'var(--s-md)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px' }}>
                <label className="label-sm muted">Market Name *</label>
                <Input
                  required
                  placeholder="e.g. Kopargaon APMC"
                  value={marketName}
                  onChange={(e) => setMarketName(e.target.value)}
                />
              </div>

              <div style={{ flex: '1 1 200px' }}>
                <label className="label-sm muted">Unique Code (lowercase) *</label>
                <Input
                  required
                  placeholder="e.g. kopargaon-apmc"
                  value={marketCode}
                  onChange={(e) => setMarketCode(e.target.value)}
                />
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--s-md)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="label-sm muted">Latitude (8 to 37) *</label>
                <Input
                  required
                  type="number"
                  step="0.0001"
                  placeholder="19.8913"
                  value={marketLat}
                  onChange={(e) => setMarketLat(e.target.value)}
                />
              </div>

              <div style={{ flex: '1 1 200px' }}>
                <label className="label-sm muted">Longitude (68 to 98) *</label>
                <Input
                  required
                  type="number"
                  step="0.0001"
                  placeholder="74.4799"
                  value={marketLng}
                  onChange={(e) => setMarketLng(e.target.value)}
                />
              </div>
            </div>
            <div className="label-sm muted" style={{ fontSize: '0.8rem', color: '#666' }}>
              ℹ Google Maps me long-press karke coordinates copy karo
            </div>

            <div className="row" style={{ gap: 'var(--s-md)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <label className="label-sm muted">Commission % (0-30)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  value={commissionPct}
                  onChange={(e) => setCommissionPct(e.target.value)}
                />
              </div>

              <div style={{ flex: '1 1 180px' }}>
                <label className="label-sm muted">Handling ₹/kg (≥0)</label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  value={handlingINRPerKg}
                  onChange={(e) => setHandlingINRPerKg(e.target.value)}
                />
              </div>

              <div style={{ flex: '2 1 320px' }}>
                <label className="label-sm muted">Accepted Crops & Custom Produce</label>
                <div className="row" style={{ gap: 'var(--s-sm)', marginTop: 6, flexWrap: 'wrap' }}>
                  {(['tomato', 'onion', 'grapes', 'potato'] as const).map((crop) => {
                    const checked = acceptedCrops.includes(crop);
                    return (
                      <label
                        key={crop}
                        className="row"
                        style={{
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                          background: checked ? 'var(--bg-subtle, #f0f7f0)' : 'transparent',
                          padding: '4px 8px',
                          borderRadius: 4,
                          border: '1px solid var(--border-subtle, #ddd)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAcceptedCrops([...acceptedCrops, crop]);
                            } else {
                              setAcceptedCrops(acceptedCrops.filter((c) => c !== crop));
                            }
                          }}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{crop}</span>
                      </label>
                    );
                  })}

                  {/* Custom crops added */}
                  {acceptedCrops
                    .filter((c) => !['tomato', 'onion', 'grapes', 'potato'].includes(c))
                    .map((custom) => (
                      <span
                        key={custom}
                        className="row"
                        style={{
                          alignItems: 'center',
                          gap: 6,
                          background: '#e0f2fe',
                          borderColor: '#7dd3fc',
                          borderWidth: 1,
                          borderStyle: 'solid',
                          padding: '4px 8px',
                          borderRadius: 4,
                          fontSize: '0.875rem',
                        }}
                      >
                        <strong style={{ textTransform: 'capitalize' }}>{custom}</strong>
                        <button
                          type="button"
                          onClick={() => setAcceptedCrops(acceptedCrops.filter((c) => c !== custom))}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#0369a1',
                            fontWeight: 'bold',
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>

                {/* Add Custom Crop input */}
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <Input
                    placeholder="Custom crop name (e.g. pomegranate, chilli)"
                    value={newCustomCrop}
                    onChange={(e) => setNewCustomCrop(e.target.value)}
                    style={{ flex: 1, maxWidth: 260 }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const norm = newCustomCrop.trim().toLowerCase();
                      if (norm && !acceptedCrops.includes(norm)) {
                        setAcceptedCrops([...acceptedCrops, norm]);
                        setNewCustomCrop('');
                      }
                    }}
                  >
                    + Add Custom Crop
                  </Button>
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 'var(--s-sm)', marginTop: 'var(--s-sm)' }}>
              <Button type="submit" variant="solid" disabled={marketSaving}>
                {marketSaving ? 'Saving…' : editingMarketId ? 'Update Market' : 'Add Market'}
              </Button>
              {editingMarketId && (
                <Button type="button" variant="outline" onClick={resetMarketForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* Markets Table */}
        {marketsRemote.loading ? (
          <SkeletonTable />
        ) : marketsRemote.error ? (
          <ErrorBox error={marketsRemote.error} onRetry={marketsRemote.refresh} />
        ) : markets.length === 0 ? (
          <Empty message="No Fresh markets found. Add your first market above or run seed:fresh-demo." />
        ) : (
          <div className="card table-wrap">
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Location (Lat, Lng)</th>
                  <th>Accepted Crops</th>
                  <th style={{ textAlign: 'right' }}>Commission</th>
                  <th style={{ textAlign: 'right' }}>Handling</th>
                  <th style={{ textAlign: 'center' }}>Active</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m._id} style={{ opacity: m.active ? 1 : 0.6 }}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    <td>
                      <code>{m.code}</code>
                    </td>
                    <td>
                      {m.location?.lat?.toFixed(4)}, {m.location?.lng?.toFixed(4)}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {m.acceptedCrops?.map((c) => (
                          <Chip key={c} tone="default">
                            {c}
                          </Chip>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{m.commissionPct}%</td>
                    <td style={{ textAlign: 'right' }}>₹{m.handlingINRPerKg}/kg</td>
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        variant={m.active ? 'solid' : 'outline'}
                        className="text-xs py-1 px-2"
                        onClick={() => handleToggleMarketActive(m)}
                      >
                        {m.active ? 'Active' : 'Inactive'}
                      </Button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        className="text-xs py-1 px-2"
                        onClick={() => handleEditMarket(m)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Section>

      {/* =========================================================================
          SECTION B: PRICES QUICK UPDATE GRID
      ========================================================================= */}
      <Section title="Section B: Prices – Quick Update">
        <Toolbar>
          <div className="label-sm muted">
            Market × Accepted Crop grid. Enter prices inline and click Save or Save All.
          </div>
          <Button
            variant="solid"
            disabled={priceSaving || Object.keys(inlinePrices).length === 0}
            onClick={handleSaveAllChangedPrices}
          >
            {priceSaving ? 'Saving…' : `Save All Changed (${Object.keys(inlinePrices).length})`}
          </Button>
        </Toolbar>

        {priceError && (
          <Alert tone="danger" title="Price Error">
            {priceError}
          </Alert>
        )}
        {priceSuccess && (
          <Alert tone="success" title="Success">
            {priceSuccess}
          </Alert>
        )}

        {pricesRemote.loading ? (
          <SkeletonTable />
        ) : pricesRemote.error ? (
          <ErrorBox error={pricesRemote.error} onRetry={pricesRemote.refresh} />
        ) : markets.length === 0 ? (
          <Empty message="Add markets first to manage prices." />
        ) : (
          <div className="card table-wrap">
            <Table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Crop</th>
                  <th>Current Price</th>
                  <th>Source</th>
                  <th>Freshness</th>
                  <th>New Price</th>
                  <th>Unit</th>
                  <th>Source</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {markets.flatMap((market) =>
                  (market.acceptedCrops || []).map((crop) => {
                    const rowKey = `${market._id}-${crop}`;
                    const currentPrice = priceMap.get(rowKey);
                    const inline = inlinePrices[rowKey] ?? {
                      marketId: market._id,
                      crop,
                      price: '',
                      unit: currentPrice?.unit ?? 'quintal',
                      sourceType: 'OPERATOR',
                    };

                    const freshness = currentPrice?.freshness ?? 'expired';
                    const isStaleOrExpired = !currentPrice || freshness === 'stale' || freshness === 'expired';

                    return (
                      <tr
                        key={rowKey}
                        style={{
                          cursor: 'pointer',
                          background:
                            selectedHistory?.marketId === market._id &&
                            selectedHistory?.crop === crop
                              ? 'var(--bg-subtle, #f5f5f5)'
                              : undefined,
                        }}
                        onClick={() => handleSelectHistory(market._id, market.name, crop)}
                      >
                        <td>
                          <strong>{market.name}</strong>
                          {!market.active && (
                            <span className="muted text-xs" style={{ marginLeft: 6 }}>
                              (Inactive)
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ textTransform: 'capitalize' }}>{crop}</span>
                        </td>
                        <td>
                          {currentPrice ? (
                            <div>
                              <strong>₹{currentPrice.price}</strong>{' '}
                              <span className="muted text-xs">/ {currentPrice.unit}</span>
                            </div>
                          ) : (
                            <span className="muted text-xs">No price</span>
                          )}
                        </td>
                        <td>
                          {currentPrice ? (
                            <Chip tone="default">{currentPrice.sourceType}</Chip>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {currentPrice ? (
                            <div className="stack" style={{ gap: 2 }}>
                              <Chip
                                tone={
                                  freshness === 'fresh'
                                    ? 'success'
                                    : freshness === 'stale'
                                    ? 'warning'
                                    : 'danger'
                                }
                              >
                                {freshness.toUpperCase()} ({currentPrice.ageHours}h)
                              </Chip>
                              {isStaleOrExpired && (
                                <span className="label-sm" style={{ color: '#d97706', fontSize: '0.75rem' }}>
                                  Price purana hai, update karo
                                </span>
                              )}
                            </div>
                          ) : (
                            <Chip tone="danger">NO PRICE</Chip>
                          )}
                        </td>
                        {/* Inline inputs */}
                        <td onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="number"
                            step="1"
                            min="1"
                            placeholder={currentPrice ? String(currentPrice.price) : '₹ Price'}
                            style={{ width: 110 }}
                            value={inline.price}
                            onChange={(e) =>
                              handleInlineChange(market._id, crop, 'price', e.target.value)
                            }
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                            value={inline.unit}
                            onChange={(e) =>
                              handleInlineChange(market._id, crop, 'unit', e.target.value as any)
                            }
                          >
                            <option value="quintal">quintal</option>
                            <option value="kg">kg</option>
                            <option value="tonne">tonne</option>
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <select
                            className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm"
                            value={inline.sourceType}
                            onChange={(e) =>
                              handleInlineChange(
                                market._id,
                                crop,
                                'sourceType',
                                e.target.value as any,
                              )
                            }
                          >
                            <option value="OPERATOR">OPERATOR</option>
                            <option value="DEMO">DEMO</option>
                            <option value="OFFICIAL">OFFICIAL</option>
                          </select>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="solid"
                            className="text-xs py-1 px-3"
                            disabled={priceSaving || !inline.price}
                            onClick={() => handleSaveSinglePrice(market._id, crop)}
                          >
                            Save
                          </Button>
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </Table>
          </div>
        )}
      </Section>

      {/* =========================================================================
          SECTION C: PRICE HISTORY
      ========================================================================= */}
      <Section
        title={`Section C: Price History ${
          selectedHistory ? `— ${selectedHistory.marketName} (${selectedHistory.crop})` : ''
        }`}
      >
        {!selectedHistory ? (
          <Card className="card" style={{ padding: 'var(--s-xl)', textAlign: 'center' }}>
            <div className="muted">
              Click any market × crop row in Section B above to view its append-only price history.
            </div>
          </Card>
        ) : historyLoading ? (
          <SkeletonTable />
        ) : historyItems.length === 0 ? (
          <Empty message={`No recorded price history for ${selectedHistory.marketName} (${selectedHistory.crop}).`} />
        ) : (
          <div className="card table-wrap">
            <Table>
              <thead>
                <tr>
                  <th>Observed At</th>
                  <th>Price</th>
                  <th>Unit</th>
                  <th>₹ / kg equivalent</th>
                  <th>Source</th>
                  <th>Age (Hours)</th>
                  <th>Freshness</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => {
                  const perKg =
                    item.unit === 'kg'
                      ? item.price
                      : item.unit === 'quintal'
                      ? item.price / 100
                      : item.price / 1000;
                  return (
                    <tr key={item._id}>
                      <td>{when(item.observedAt)}</td>
                      <td>
                        <strong>₹{item.price}</strong>
                      </td>
                      <td>{item.unit}</td>
                      <td>₹{perKg.toFixed(2)}/kg</td>
                      <td>
                        <Chip tone="default">{item.sourceType}</Chip>
                      </td>
                      <td>{item.ageHours}h</td>
                      <td>
                        <Chip
                          tone={
                            item.freshness === 'fresh'
                              ? 'success'
                              : item.freshness === 'stale'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {(item.freshness || 'unknown').toUpperCase()}
                        </Chip>
                      </td>
                      <td>
                        <code>{item.createdBy}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
