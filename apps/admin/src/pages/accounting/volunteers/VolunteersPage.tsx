import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_FINANCIAL_ACCOUNTS,
  RECORD_VOLUNTEER_REIMBURSEMENT,
  VOLUNTEER_ADVANCE_BALANCES,
  VOLUNTEER_OPEN_ITEMS,
  VOLUNTEER_REIMBURSEMENTS,
} from '../../../lib/documents';
import type {
  ClubFinancialAccountsData,
  VolunteerAdvanceBalancesData,
  VolunteerBalance,
  VolunteerOpenItemsData,
  VolunteerReimbursementsData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { Drawer } from '../../../components/ui';
import { formatEuro, formatFr, todayIso } from '../reconciliation/format';

/**
 * Ce que le club doit à ses bénévoles (ADR-0016), et le remboursement qui
 * solde plusieurs reçus d'un coup — l'écriture unique que le relevé
 * bancaire portera.
 */
export function VolunteersPage() {
  const { showToast } = useToast();
  const { data: balancesData, refetch: refetchBalances } =
    useQuery<VolunteerAdvanceBalancesData>(VOLUNTEER_ADVANCE_BALANCES, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: historyData, refetch: refetchHistory } =
    useQuery<VolunteerReimbursementsData>(VOLUNTEER_REIMBURSEMENTS, {
      variables: { memberId: null },
      fetchPolicy: 'cache-and-network',
    });
  const { data: accountsData } = useQuery<ClubFinancialAccountsData>(CLUB_FINANCIAL_ACCOUNTS, {
    fetchPolicy: 'cache-first',
  });
  const [record, { loading: saving }] = useMutation(RECORD_VOLUNTEER_REIMBURSEMENT);

  const [target, setTarget] = useState<VolunteerBalance | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [accountId, setAccountId] = useState('');
  const [paidOn, setPaidOn] = useState(todayIso());

  const { data: itemsData, refetch: refetchItems } = useQuery<VolunteerOpenItemsData>(
    VOLUNTEER_OPEN_ITEMS,
    {
      variables: { memberId: target?.memberId ?? '' },
      skip: !target,
      fetchPolicy: 'network-only',
    },
  );

  const balances = balancesData?.volunteerAdvanceBalances ?? [];
  const history = historyData?.volunteerReimbursements ?? [];
  const items = itemsData?.volunteerOpenItems ?? [];
  const payFrom = useMemo(
    () =>
      (accountsData?.clubFinancialAccounts ?? []).filter(
        (a) => a.isActive && (a.kind === 'BANK' || a.kind === 'CASH'),
      ),
    [accountsData],
  );
  const totalDue = balances.reduce((s, b) => s + b.openCents, 0);
  const selectedTotal = items
    .filter((i) => picked[i.entryId])
    .reduce((s, i) => s + i.amountCents, 0);

  function open(b: VolunteerBalance) {
    setTarget(b);
    setPicked({});
    setAccountId(payFrom[0]?.id ?? '');
    setPaidOn(todayIso());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    const entryIds = items.filter((i) => picked[i.entryId]).map((i) => i.entryId);
    if (entryIds.length === 0 || !accountId) {
      showToast('Choisis au moins un reçu et un compte', 'error');
      return;
    }
    try {
      await record({
        variables: {
          input: { memberId: target.memberId, financialAccountId: accountId, paidOn, entryIds },
        },
      });
      showToast(`Remboursement de ${formatEuro(selectedTotal)} enregistré`, 'success');
      setTarget(null);
      await Promise.all([refetchBalances(), refetchHistory()]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Remboursement impossible', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Frais avancés par les bénévoles</h1>
        <p className="members-loom__lede">
          Quand un bénévole paie de sa poche, la dépense est comptabilisée à sa
          date et le club lui doit l’argent. Rembourse-le en une fois : une
          seule écriture, plusieurs reçus soldés, et la ligne de relevé qui se
          rapproche toute seule.
        </p>
      </header>

      <section className="members-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="members-panel__h" style={{ margin: 0 }}>
            Ce que le club doit
          </h2>
          {totalDue > 0 ? (
            <span className="cf-pill cf-pill--warn">Total : {formatEuro(totalDue)}</span>
          ) : null}
        </div>
        {balances.length === 0 ? (
          <p className="cf-muted">
            Aucun frais avancé en attente. Dans la file de revue comptable, un
            reçu peut être marqué « avancé par un bénévole » : il apparaîtra ici.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Bénévole</th>
                <th>Reçus en attente</th>
                <th>Plus ancien</th>
                <th style={{ textAlign: 'right' }}>Montant dû</th>
                <th style={{ width: 200 }} />
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.memberId}>
                  <td>
                    <strong>
                      {b.firstName} {b.lastName}
                    </strong>
                  </td>
                  <td>{b.openCount}</td>
                  <td>{b.oldestOccurredAt ? formatFr(b.oldestOccurredAt) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatEuro(b.openCents)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={payFrom.length === 0}
                      onClick={() => open(b)}
                    >
                      Rembourser…
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="members-panel">
        <h2 className="members-panel__h">Remboursements passés</h2>
        {history.length === 0 ? (
          <p className="cf-muted">Aucun remboursement enregistré.</p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bénévole</th>
                <th>Depuis</th>
                <th>Reçus</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{formatFr(r.paidOn)}</td>
                  <td>{r.memberName}</td>
                  <td>{r.financialAccountLabel}</td>
                  <td>
                    {r.items.length}
                    <small className="cf-muted" style={{ display: 'block' }}>
                      {r.items.slice(0, 3).map((i) => i.label).join(', ')}
                      {r.items.length > 3 ? '…' : ''}
                    </small>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(r.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Drawer
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Rembourser ${target.firstName} ${target.lastName}` : 'Rembourser'}
        footer={
          <div className="cf-drawer-foot">
            <span className="cf-muted" style={{ marginRight: 'auto' }}>
              {formatEuro(selectedTotal)} sélectionné(s)
            </span>
            <button type="button" className="btn-ghost" onClick={() => setTarget(null)}>
              Annuler
            </button>
            <button type="submit" form="cf-reimburse" className="btn-primary" disabled={saving}>
              Enregistrer le remboursement
            </button>
          </div>
        }
      >
        <form id="cf-reimburse" onSubmit={onSubmit} className="cf-form">
          <p className="cf-muted">
            Une seule écriture sera créée, du total des reçus cochés : elle
            éteint la dette et fait sortir l’argent du compte choisi.
          </p>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Payé depuis *</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {payFrom.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Date du paiement *</span>
              <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
          </div>
          {items.length === 0 ? (
            <p className="cf-muted">Aucun reçu en attente pour ce bénévole.</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  onClick={() =>
                    setPicked(Object.fromEntries(items.map((i) => [i.entryId, true])))
                  }
                >
                  Tout cocher
                </button>
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={() => setPicked({})}>
                  Tout décocher
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => void refetchItems()}
                >
                  Rafraîchir
                </button>
              </div>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }} />
                    <th>Date</th>
                    <th>Reçu</th>
                    <th>Compte</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.entryId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!picked[i.entryId]}
                          onChange={(e) =>
                            setPicked((p) => ({ ...p, [i.entryId]: e.target.checked }))
                          }
                          aria-label={`Rembourser ${i.label}`}
                        />
                      </td>
                      <td>{formatFr(i.occurredAt)}</td>
                      <td>{i.label}</td>
                      <td>
                        <small className="cf-muted">
                          {i.accountCode} {i.accountLabel}
                        </small>
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatEuro(i.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </form>
      </Drawer>
    </>
  );
}
