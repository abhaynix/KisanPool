import { Table } from '../components/ui/table';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Input } from '../components/ui/input';
import { useEffect, useState } from 'react';
import { api, type KycGroup } from '../api';
import { Badge, Empty, ErrorBox, Loading, kg, when } from '../ui';

/**
 * Grouped by transporter, because RC and DL are approved together: that is what
 * flips the vehicle to VERIFIED and lets it appear in matching at all (ADR-010).
 */
export function VerificationTab() {
  const [groups, setGroups] = useState<KycGroup[] | null>(null);
  const [error, setError] = useState<unknown>();
  const [filter, setFilter] = useState('PENDING');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; type: string; userName: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const load = (): void => {
    setError(undefined);
    setGroups(null);
    api.documents(filter || undefined).then(setGroups).catch(setError);
  };

  useEffect(load, [filter]);

  const review = async (id: string, status: 'VERIFIED' | 'REJECTED', reason?: string): Promise<boolean> => {
    setBusy(id);
    setNote(null);
    setError(undefined);
    try {
      const result = await api.reviewDocument(id, status, reason ?? undefined);
      setNote(
        result.vehicleVerification === 'VERIFIED'
          ? 'Vehicle is now VERIFIED: it will start appearing in matching.'
          : `Saved. Vehicle is ${result.vehicleVerification ?? 'unchanged'}.`,
      );
      load();
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const confirmReject = async (): Promise<void> => {
    if (!rejectTarget || !rejectionReason.trim()) return;
    const saved = await review(rejectTarget.id, 'REJECTED', rejectionReason.trim());
    if (saved) setRejectTarget(null);
  };

  return (
    <div className="stack">
      <div className="row">
        {['PENDING', 'VERIFIED', 'REJECTED', ''].map((value) => (
          <button
            key={value || 'ALL'}
            className={`btn ${filter === value ? '' : 'secondary'}`}
            onClick={() => setFilter(value)}
          >
            {value || 'All'}
          </button>
        ))}
      </div>

      {note ? (
        <div
          className="card"
          style={{ background: 'transparent', borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--success)' }}>{note}</span>
        </div>
      ) : null}

      {error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : !groups ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Empty message="Nothing to review here." />
      ) : (
        groups.map((group) => (
          <div key={group.user._id} className="card">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <div className="headline-md">{group.user.name || 'Unnamed'}</div>
                <div className="label-sm muted">{group.user.phone}</div>
              </div>
              {group.vehicle ? (
                <div style={{ textAlign: 'right' }}>
                  <div className="label-lg">{group.vehicle.registrationNumber}</div>
                  <div className="label-sm muted">
                    {group.vehicle.vehicleType} · {kg(group.vehicle.capacityKg)}
                  </div>
                  <Badge value={group.vehicle.verificationStatus} />
                </div>
              ) : (
                <span className="muted label-sm">no vehicle registered</span>
              )}
            </div>

            <div className="table-wrap" style={{ marginTop: 'var(--s-md)' }}>
              <Table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th>File</th>
                    <th style={{ width: 200 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {group.documents.map((doc) => (
                    <tr key={doc._id}>
                      <td>
                        <strong>{doc.type}</strong>
                        {doc.type === 'RC' || doc.type === 'DL' ? (
                          <div className="label-sm muted">gates matching</div>
                        ) : (
                          <div className="label-sm muted">gates payouts</div>
                        )}
                      </td>
                      <td className="label-sm muted">{when(doc.createdAt)}</td>
                      <td>
                        <Badge value={doc.status} />
                        {doc.rejectionReason ? (
                          <div className="label-sm" style={{ color: 'var(--error)' }}>
                            {doc.rejectionReason}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </td>
                      <td>
                        <div className="row">
                          <button
                            className="btn"
                            disabled={busy === doc._id || doc.status === 'VERIFIED'}
                            onClick={() => void review(doc._id, 'VERIFIED')}
                          >
                            Approve
                          </button>
                          <button
                            className="btn danger"
                            disabled={busy === doc._id || doc.status === 'REJECTED'}
                            onClick={() => {
                              setRejectionReason('');
                              setRejectTarget({ id: doc._id, type: doc.type, userName: group.user.name || 'this transporter' });
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        ))
      )}
      <ConfirmDialog
        open={rejectTarget !== null}
        title="Reject this document?"
        confirmLabel="Reject document"
        cancelLabel="Keep document pending"
        typeToConfirm="REJECT"
        canConfirm={rejectionReason.trim().length > 0}
        busy={rejectTarget !== null && busy === rejectTarget.id}
        error={error instanceof Error ? error.message : undefined}
        onConfirm={() => void confirmReject()}
        onCancel={() => setRejectTarget(null)}
      >
        {rejectTarget ? (
          <div className="space-y-3">
            <p>
              This will mark the {rejectTarget.type} document as rejected for {rejectTarget.userName}.
              The reason will be shown to the transporter. Rejecting an RC or DL document can also
              move the vehicle to rejected and keep it out of matching.
            </p>
            <label className="block text-sm text-muted-foreground" htmlFor="rejection-reason">
              Reason shown to the transporter
            </label>
            <Input
              id="rejection-reason"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Explain what needs to be corrected"
              required
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
