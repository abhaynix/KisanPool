import { api } from '../api';
import { Empty, ErrorBox, Freshness, Section, SkeletonTable, Stat, Toolbar, useRemote } from '../ui';

export function FreshOpsTab() {
  const ops = useRemote(() => api.freshOps(), 60_000);
  const data = ops.data;
  const counts = data ? [
    data.marketPrices.staleOrInvalid.length,
    data.recovery.openIncidents.length,
    data.cargo.receiptDiscrepancies.length,
    data.cargo.unsoldCargo.length,
    data.cargo.pendingConsentOrReroute.length,
    data.noFeasibleFreshRecommendations.length,
  ] : [];
  const total = counts.reduce((sum, count) => sum + count, 0);

  return <div className="stack">
    <Toolbar>
      <div className="label-sm muted">Fresh data quality, unresolved cargo and recovery cases</div>
      <Freshness at={ops.refreshedAt} onRefresh={ops.refresh} />
    </Toolbar>
    {ops.loading ? <SkeletonTable /> : ops.error ? <ErrorBox error={ops.error} onRetry={ops.refresh} /> : data ? <>
      <div className="kpi-grid">
        <Stat label="Needs attention" value={String(total)} />
        <Stat label="Stale / invalid prices" value={String(data.marketPrices.staleOrInvalid.length)} />
        <Stat label="Open incidents" value={String(data.recovery.openIncidents.length)} />
        <Stat label="Cargo discrepancies" value={String(data.cargo.receiptDiscrepancies.length)} />
        <Stat label="Pending decisions" value={String(data.cargo.pendingConsentOrReroute.length)} />
      </div>
      <div className="card body-md muted">
        {data.failedImports.configured ? `Failed price imports: ${data.failedImports.failedCount ?? 'unknown'}` : data.failedImports.note}
      </div>
      {total === 0 ? <Empty message="No recorded data-quality or cargo/recovery items need attention." /> : null}
      {data.marketPrices.staleOrInvalid.length ? <Section title="Stale or invalid market prices">
        <div className="card stack">{data.marketPrices.staleOrInvalid.map((item: any) => <div className="row" key={item._id} style={{ justifyContent: 'space-between' }}>
          <span>{item.marketId?.name ?? 'Unknown market'} · {item.cropKey} · {item.sourceName}</span><span className="badge warn">{item.dataStatus}</span>
        </div>)}</div>
      </Section> : null}
      {data.recovery.openIncidents.length ? <Section title="Open vehicle recovery incidents">
        <div className="card stack">{data.recovery.openIncidents.map((item: any) => <div className="row" key={item._id} style={{ justifyContent: 'space-between' }}>
          <span>{item.category} · trip {String(item.tripId?._id ?? item.tripId)} · {item.description}</span><span className="badge warn">{item.status}</span>
        </div>)}</div>
      </Section> : null}
      {data.cargo.receiptDiscrepancies.length ? <Section title="Cargo receipt discrepancies">
        <div className="card stack">{data.cargo.receiptDiscrepancies.map((item: any) => <div className="row" key={item._id} style={{ justifyContent: 'space-between' }}>
          <span>Shipment {String(item.shipmentId)} · received {item.receivedKg} kg</span><span className="badge bad">variance {item.dispatchReceiptVarianceKg} kg</span>
        </div>)}</div>
      </Section> : null}
      {data.cargo.pendingConsentOrReroute.length ? <Section title="Pending farmer / transporter decisions">
        <div className="card stack">{data.cargo.pendingConsentOrReroute.map((item: any, index: number) => <div className="row" key={`${item.shipmentId}-${item.version}-${index}`} style={{ justifyContent: 'space-between' }}>
          <span>Shipment {String(item.shipmentId)} · {item.quantityKg} kg · {item.option} v{item.version}</span><span className="badge warn">{item.status}</span>
        </div>)}</div>
      </Section> : null}
      {data.cargo.unsoldCargo.length ? <Section title="Cargo awaiting disposition">
        <div className="card stack">{data.cargo.unsoldCargo.map((item: any) => <div className="row" key={item._id} style={{ justifyContent: 'space-between' }}>
          <span>Shipment {String(item.shipmentId)} · {item.currentLocation?.name || 'Location unavailable'}</span><span className="badge info">{item.remainingAvailableKg} kg</span>
        </div>)}</div>
      </Section> : null}
      {data.noFeasibleFreshRecommendations.length ? <Section title="Fresh requests with no feasible market">
        <div className="card stack">{data.noFeasibleFreshRecommendations.map((item: any) => <div key={item._id}>
          <div>Recommendation {String(item._id)} · {new Date(item.generatedAt).toLocaleString()}</div>
          <div className="label-sm muted">{[...(item.warnings ?? []), ...(item.missingData ?? [])].join(' · ')}</div>
        </div>)}</div>
      </Section> : null}
    </> : null}
  </div>;
}
