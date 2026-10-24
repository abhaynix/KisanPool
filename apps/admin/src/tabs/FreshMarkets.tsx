/**
 * Fresh market evidence: the operator's way to enter what a Fresh comparison needs.
 *
 * Entering data here never makes a market bookable by itself. The server decides
 * eligibility from the stored evidence (acceptance, receiving hours, price source
 * and age, verified costs), and every row shows where each value came from.
 */
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button } from '../components/ui/button';
import { Table } from '../components/ui/table';
import { ErrorBox, Freshness, Section, SkeletonTable, Toolbar, useRemote, when } from '../ui';

interface Evidence {
  code: string;
  name: string;
  location: { lat: number; lng: number };
  catalogueSource: { name: string };
  costs: { commissionPct: number | null; handlingINRPerKg: number | null; costsVerified: boolean; costsSourceName: string | null } | null;
  acceptance: { status: string; accepted: boolean | null; receivingHours: string | null; receivingHoursVerified: boolean; observedAt?: string; expiresAt?: string; sourceName?: string };
  price: { dataStatus: string; sourceType: string; modalPriceINRPerKg: number | null; sourceName: string; observedAt: string | null; eligibleForLiveRecommendation: boolean } | null;
}

const optionalNumber = (value: FormDataEntryValue | null): number | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
};
const localToIso = (value: FormDataEntryValue | null): string => new Date(String(value)).toISOString();
const isoToLocalInput = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const fieldStyle = { display: 'grid', gap: 4, fontSize: 13 } as const;

export function FreshMarketsTab() {
  const data = useRemote(() => api.freshMarkets('tomato'), 60_000);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const markets: Evidence[] = data.data?.markets ?? [];
  const current = markets.find((market) => market.code === selected) ?? markets[0];
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(`${label} saved. The comparison will use it on the next run.`);
      await data.refresh();
    } catch (err) {
      setError(err);
    }
  };

  const onMarket = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const code = String(f.get('code')).trim().toLowerCase();
    void run('Market', () => api.upsertFreshMarket(code, {
      name: String(f.get('name')),
      location: { name: String(f.get('name')), lat: Number(f.get('lat')), lng: Number(f.get('lng')) },
      sourceName: String(f.get('sourceName')),
    }));
  };

  const onCosts = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return;
    const f = new FormData(event.currentTarget);
    void run('Costs', () => api.upsertFreshMarket(current.code, {
      name: current.name,
      location: { name: current.name, lat: current.location.lat, lng: current.location.lng },
      sourceName: current.catalogueSource.name,
      costs: {
        commissionPct: optionalNumber(f.get('commissionPct')),
        handlingINRPerKg: optionalNumber(f.get('handlingINRPerKg')),
        costsVerified: f.get('costsVerified') === 'on',
        costsSourceName: String(f.get('costsSourceName') ?? '').trim() || null,
      },
    }));
  };

  const onAcceptance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return;
    const f = new FormData(event.currentTarget);
    void run('Acceptance', () => api.addFreshAcceptance(current.code, {
      cropKey: 'tomato',
      accepted: f.get('accepted') === 'on',
      receivingHours: String(f.get('receivingHours')),
      receivingHoursVerified: f.get('receivingHoursVerified') === 'on',
      receivingOpenHourIST: optionalNumber(f.get('receivingOpenHourIST')),
      receivingCloseHourIST: optionalNumber(f.get('receivingCloseHourIST')),
      sourceName: String(f.get('sourceName')),
      observedAt: localToIso(f.get('observedAt')),
      expiresAt: localToIso(f.get('expiresAt')),
    }));
  };

  const onPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return;
    const f = new FormData(event.currentTarget);
    void run('Price', () => api.addFreshPrice(current.code, {
      cropKey: 'tomato',
      sourceCommodityName: 'Tomato',
      sourceMinPrice: Number(f.get('min')),
      sourceModalPrice: Number(f.get('modal')),
      sourceMaxPrice: Number(f.get('max')),
      sourcePriceUnit: String(f.get('unit')),
      sourceType: String(f.get('sourceType')),
      sourceName: String(f.get('sourceName')),
      observedAt: localToIso(f.get('observedAt')),
    }));
  };

  return (
    <>
      <Toolbar>
        <div className="label-sm muted">
          Test-stage evidence for Fresh comparisons. Each row shows its source; a market is only bookable when the
          server finds acceptance, receiving hours, a rankable price and verified costs.
        </div>
        <Freshness at={data.refreshedAt} onRefresh={data.refresh} />
      </Toolbar>

      {message ? <div className="card" style={{ padding: 12, marginBottom: 12 }}>{message}</div> : null}
      {error ? <ErrorBox error={error} onRetry={() => setError(null)} /> : null}

      {data.loading ? (
        <SkeletonTable />
      ) : data.error ? (
        <ErrorBox error={data.error} onRetry={data.refresh} />
      ) : (
        <>
          <Section title="Markets and current evidence">
            <div className="card table-wrap">
              <Table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Acceptance</th>
                    <th>Costs</th>
                    <th>Latest price</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => (
                    <tr key={market.code} onClick={() => setSelected(market.code)} style={{ cursor: 'pointer', background: market.code === current?.code ? 'var(--surface-2, rgba(0,0,0,0.04))' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{market.name}<div className="label-sm muted">{market.code} · {market.catalogueSource.name}</div></td>
                      <td>
                        {market.acceptance.status === 'VALID'
                          ? `${market.acceptance.accepted ? 'Accepts tomato' : 'Does not accept'} · ${market.acceptance.receivingHoursVerified ? 'hours verified' : 'hours unverified'}`
                          : market.acceptance.status === 'EXPIRED' ? 'Acceptance expired' : 'No acceptance recorded'}
                      </td>
                      <td>{market.costs?.costsVerified ? `Verified · ${market.costs.commissionPct}% + ₹${market.costs.handlingINRPerKg}/kg` : 'Not verified'}</td>
                      <td>
                        {market.price
                          ? `₹${market.price.modalPriceINRPerKg}/kg · ${market.price.sourceType} · ${market.price.dataStatus}${market.price.eligibleForLiveRecommendation ? '' : ' (not rankable)'}`
                          : 'No price recorded'}
                        {market.price ? <div className="label-sm muted">{market.price.sourceName} · observed {when(market.price.observedAt)}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {markets.length === 0 ? <div style={{ padding: 16 }} className="muted">No active markets yet. Add one below.</div> : null}
            </div>
          </Section>

          <Section title="Add or update a market">
            <form className="card" onSubmit={onMarket} style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              <label style={fieldStyle}>Code (lowercase, dashes)<input className="input" name="code" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="pune-market-yard" /></label>
              <label style={fieldStyle}>Name<input className="input" name="name" required placeholder="Pune Market Yard" /></label>
              <label style={fieldStyle}>Latitude<input className="input" name="lat" type="number" step="any" required /></label>
              <label style={fieldStyle}>Longitude<input className="input" name="lng" type="number" step="any" required /></label>
              <label style={fieldStyle}>Source of this market record<input className="input" name="sourceName" required defaultValue="Operator entry" /></label>
              <div><Button type="submit" variant="soft" size="md" iconRight={null}>Save market</Button></div>
            </form>
          </Section>

          {current ? (
            <>
              <Section title={`Evidence for ${current.name}`}>
                <form className="card" onSubmit={onCosts} style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  <div style={{ gridColumn: '1 / -1', fontWeight: 600 }}>Selling costs</div>
                  <label style={fieldStyle}>Commission %<input className="input" name="commissionPct" type="number" step="0.1" min="0" max="30" defaultValue={current.costs?.commissionPct ?? ''} /></label>
                  <label style={fieldStyle}>Handling ₹/kg<input className="input" name="handlingINRPerKg" type="number" step="0.1" min="0" max="100" defaultValue={current.costs?.handlingINRPerKg ?? ''} /></label>
                  <label style={fieldStyle}>Cost source<input className="input" name="costsSourceName" defaultValue={current.costs?.costsSourceName ?? ''} placeholder="Market fee schedule or operator note" /></label>
                  <label style={{ ...fieldStyle, alignSelf: 'end' }}><span><input type="checkbox" name="costsVerified" defaultChecked={current.costs?.costsVerified ?? false} /> Costs are verified</span></label>
                  <div><Button type="submit" variant="soft" size="md" iconRight={null}>Save costs</Button></div>
                </form>

                <form className="card" onSubmit={onAcceptance} style={{ padding: 16, marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  <div style={{ gridColumn: '1 / -1', fontWeight: 600 }}>Crop acceptance and receiving hours (tomato)</div>
                  <label style={{ ...fieldStyle, alignSelf: 'end' }}><span><input type="checkbox" name="accepted" defaultChecked /> Market accepts tomato</span></label>
                  <label style={fieldStyle}>Receiving hours (text)<input className="input" name="receivingHours" required defaultValue="06:00–14:00 IST" /></label>
                  <label style={fieldStyle}>Open hour IST (0–23)<input className="input" name="receivingOpenHourIST" type="number" min="0" max="23" defaultValue="6" /></label>
                  <label style={fieldStyle}>Close hour IST (1–24, exclusive)<input className="input" name="receivingCloseHourIST" type="number" min="1" max="24" defaultValue="14" /></label>
                  <label style={{ ...fieldStyle, alignSelf: 'end' }}><span><input type="checkbox" name="receivingHoursVerified" defaultChecked /> Hours verified by operations</span></label>
                  <label style={fieldStyle}>Source<input className="input" name="sourceName" required defaultValue="Operator entry" /></label>
                  <label style={fieldStyle}>Observed at<input className="input" name="observedAt" type="datetime-local" required defaultValue={isoToLocalInput(now)} /></label>
                  <label style={fieldStyle}>Expires at<input className="input" name="expiresAt" type="datetime-local" required defaultValue={isoToLocalInput(soon)} /></label>
                  <div><Button type="submit" variant="soft" size="md" iconRight={null}>Save acceptance</Button></div>
                </form>

                <form className="card" onSubmit={onPrice} style={{ padding: 16, marginTop: 12, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                  <div style={{ gridColumn: '1 / -1', fontWeight: 600 }}>Price observation (tomato)</div>
                  <label style={fieldStyle}>Min<input className="input" name="min" type="number" step="0.01" min="0" required /></label>
                  <label style={fieldStyle}>Modal<input className="input" name="modal" type="number" step="0.01" min="0" required /></label>
                  <label style={fieldStyle}>Max<input className="input" name="max" type="number" step="0.01" min="0" required /></label>
                  <label style={fieldStyle}>Unit
                    <select className="input" name="unit" defaultValue="INR_PER_KG">
                      <option value="INR_PER_KG">₹ per kg</option>
                      <option value="INR_PER_QUINTAL">₹ per quintal</option>
                      <option value="INR_PER_TONNE">₹ per tonne</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>Price source
                    <select className="input" name="sourceType" defaultValue="OPERATOR_INDICATIVE">
                      <option value="OPERATOR_INDICATIVE">Operator indicative</option>
                      <option value="OFFICIAL">Official mandi record</option>
                      <option value="CONFIRMED_BUYER">Confirmed buyer offer</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>Source name<input className="input" name="sourceName" required defaultValue="Operator entry" /></label>
                  <label style={fieldStyle}>Observed at<input className="input" name="observedAt" type="datetime-local" required defaultValue={isoToLocalInput(new Date(now.getTime() - 2 * 60 * 60_000))} /></label>
                  <div style={{ gridColumn: '1 / -1' }} className="label-sm muted">Observations older than 24 hours are stale and 72 hours are expired; the price-age rule is applied when the comparison runs.</div>
                  <div><Button type="submit" variant="soft" size="md" iconRight={null}>Save price</Button></div>
                </form>
              </Section>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
