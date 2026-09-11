import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_CASH_BOOK,
  CLUB_CASH_COUNTS,
  CLUB_FINANCIAL_ACCOUNTS,
  DELETE_CASH_COUNT,
  RECORD_CASH_COUNT,
  RECORD_CASH_TRANSFER,
  VALIDATE_CASH_COUNT,
} from '../../../lib/documents';
import type {
  ClubCashBookData,
  ClubCashCountsData,
  ClubFinancialAccountsData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { Drawer } from '../../../components/ui';
import { formatEuro, formatFr, formatSigned, inputToCents, todayIso } from '../reconciliation/format';

/** Premier jour du mois de `iso`. */
function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Dernier jour du mois de `iso`. */
function monthEnd(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

type TransferDirection = 'DEPOSIT' | 'WITHDRAWAL';

/**
 * Le livre d'une caisse (ADR-0014 §8).
 *
 * Une caisse n'envoie pas de relevé : son équivalent est le comptage, où
 * quelqu'un ouvre le tiroir et dit ce qu'il y a. L'écart constaté attend sa
 * validation avant de devenir une écriture — un billet retrouvé le lendemain
 * ne doit pas avoir déjà creusé les comptes.
 */
export function CashBookPage() {
  const { showToast } = useToast();
  const { data: accountsData } = useQuery<ClubFinancialAccountsData>(CLUB_FINANCIAL_ACCOUNTS, {
    fetchPolicy: 'cache-and-network',
  });

  const cashAccounts = useMemo(
    () => (accountsData?.clubFinancialAccounts ?? []).filter((a) => a.isActive && a.kind === 'CASH'),
    [accountsData],
  );
  const bankAccounts = useMemo(
    () => (accountsData?.clubFinancialAccounts ?? []).filter((a) => a.isActive && a.kind === 'BANK'),
    [accountsData],
  );

  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(() => monthStart(todayIso()));
  const [to, setTo] = useState(() => monthEnd(todayIso()));

  useEffect(() => {
    if (!accountId && cashAccounts.length > 0) setAccountId(cashAccounts[0].id);
  }, [accountId, cashAccounts]);

  const { data: bookData, refetch: refetchBook } = useQuery<ClubCashBookData>(CLUB_CASH_BOOK, {
    variables: { financialAccountId: accountId, from, to },
    skip: !accountId,
    fetchPolicy: 'cache-and-network',
  });
  const { data: countsData, refetch: refetchCounts } = useQuery<ClubCashCountsData>(
    CLUB_CASH_COUNTS,
    {
      variables: { financialAccountId: accountId || null },
      skip: !accountId,
      fetchPolicy: 'cache-and-network',
    },
  );

  const [recordCount, { loading: counting }] = useMutation(RECORD_CASH_COUNT);
  const [validateCount, { loading: validating }] = useMutation(VALIDATE_CASH_COUNT);
  const [deleteCount] = useMutation(DELETE_CASH_COUNT);
  const [recordTransfer, { loading: transferring }] = useMutation(RECORD_CASH_TRANSFER);

  const [countOpen, setCountOpen] = useState(false);
  const [countedOn, setCountedOn] = useState(todayIso());
  const [countedInput, setCountedInput] = useState('');
  const [countNote, setCountNote] = useState('');

  const [transfer, setTransfer] = useState<TransferDirection | null>(null);
  const [bankId, setBankId] = useState('');
  const [transferOn, setTransferOn] = useState(todayIso());
  const [amountInput, setAmountInput] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const book = bookData?.clubCashBook ?? null;
  const counts = countsData?.clubCashCounts ?? [];
  const account = cashAccounts.find((a) => a.id === accountId) ?? null;

  async function refreshAll() {
    await Promise.all([refetchBook(), refetchCounts()]);
  }

  function openCount() {
    setCountedOn(todayIso());
    setCountedInput('');
    setCountNote('');
    setCountOpen(true);
  }

  function openTransfer(direction: TransferDirection) {
    setTransfer(direction);
    setBankId(bankAccounts[0]?.id ?? '');
    setTransferOn(todayIso());
    setAmountInput('');
    setTransferNote('');
  }

  async function onCount(e: FormEvent) {
    e.preventDefault();
    const cents = inputToCents(countedInput);
    if (cents === null || Number.isNaN(cents) || cents < 0) {
      showToast('Montant compté invalide', 'error');
      return;
    }
    try {
      await recordCount({
        variables: {
          input: {
            financialAccountId: accountId,
            countedOn,
            countedCents: cents,
            note: countNote.trim() || null,
          },
        },
      });
      setCountOpen(false);
      showToast('Comptage enregistré', 'success');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Comptage impossible', 'error');
    }
  }

  async function onTransfer(e: FormEvent) {
    e.preventDefault();
    const cents = inputToCents(amountInput);
    if (cents === null || Number.isNaN(cents) || cents <= 0) {
      showToast('Montant invalide', 'error');
      return;
    }
    if (!bankId) {
      showToast('Choisis un compte bancaire', 'error');
      return;
    }
    const deposit = transfer === 'DEPOSIT';
    try {
      await recordTransfer({
        variables: {
          input: {
            fromAccountId: deposit ? accountId : bankId,
            toAccountId: deposit ? bankId : accountId,
            amountCents: cents,
            on: transferOn,
            note: transferNote.trim() || null,
          },
        },
      });
      setTransfer(null);
      showToast(
        deposit
          ? `Dépôt de ${formatEuro(cents)} enregistré : il se rapprochera du relevé`
          : `Retrait de ${formatEuro(cents)} enregistré`,
        'success',
      );
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Mouvement impossible', 'error');
    }
  }

  async function onValidate(countId: string) {
    try {
      await validateCount({ variables: { countId } });
      showToast('Écart validé', 'success');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Validation impossible', 'error');
    }
  }

  async function onDelete(countId: string) {
    try {
      await deleteCount({ variables: { countId } });
      showToast('Comptage supprimé', 'success');
      await refreshAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Livre de caisse</h1>
        <p className="members-loom__lede">
          Une caisse n’envoie pas de relevé : c’est le comptage qui en tient
          lieu. Compte le tiroir, compare, et ne valide l’écart que lorsqu’il
          est vraiment un écart. Les espèces déposées en banque se rapprochent
          ensuite toutes seules.
        </p>
      </header>

      {cashAccounts.length === 0 ? (
        <section className="members-panel">
          <p className="cf-muted">
            Aucune caisse active. Crée-en une dans Paramètres → Comptabilité →
            Comptes financiers.
          </p>
        </section>
      ) : (
        <>
          <section className="members-panel">
            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label className="cf-field">
                  <span>Caisse</span>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} ({a.accountingAccountCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="cf-field">
                  <span>Du</span>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="cf-field">
                  <span>Au</span>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-primary" onClick={openCount}>
                  Compter la caisse…
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={bankAccounts.length === 0}
                  onClick={() => openTransfer('DEPOSIT')}
                >
                  Déposer en banque…
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={bankAccounts.length === 0}
                  onClick={() => openTransfer('WITHDRAWAL')}
                >
                  Retirer de la banque…
                </button>
              </div>
            </div>
          </section>

          <section className="members-panel">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2 className="members-panel__h" style={{ margin: 0 }}>
                Mouvements
              </h2>
              {book ? (
                <span className="cf-pill cf-pill--ok">
                  Solde au {formatFr(book.to)} : {formatEuro(book.closingCents)}
                </span>
              ) : null}
            </div>

            {book && !book.hasOpeningBalance ? (
              <p className="cf-pill cf-pill--warn" style={{ display: 'inline-block' }}>
                Cette caisse n’a pas de solde d’ouverture : les soldes ci-dessous
                partent de zéro. Renseigne-le dans Paramètres → Comptabilité →
                Exercice.
              </p>
            ) : null}

            <table className="cf-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Date</th>
                  <th>Libellé</th>
                  <th style={{ width: 150 }}>Contrepartie</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Mouvement</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Solde</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4}>
                    <em className="cf-muted">Solde au {formatFr(from)}</em>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {book ? formatEuro(book.openingCents) : '—'}
                  </td>
                </tr>
                {(book?.lines ?? []).map((l) => (
                  <tr key={l.entryId}>
                    <td>{formatFr(l.occurredAt)}</td>
                    <td>
                      {l.label}
                      {l.reconciledAt ? (
                        <span className="cf-pill cf-pill--ok" style={{ marginLeft: 6 }}>
                          Rapproché
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <small className="cf-muted">{l.counterpartCodes.join(', ') || '—'}</small>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatSigned(l.amountCents)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatEuro(l.balanceCents)}
                    </td>
                  </tr>
                ))}
                {book && book.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <span className="cf-muted">Aucun mouvement sur cette période.</span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="members-panel">
            <h2 className="members-panel__h">Comptages</h2>
            {counts.length === 0 ? (
              <p className="cf-muted">
                Aucun comptage. « Compter la caisse » enregistre ce qu’il y a dans
                le tiroir ; rien n’est comptabilisé tant que l’écart n’est pas
                validé.
              </p>
            ) : (
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Compté</th>
                    <th style={{ textAlign: 'right' }}>Attendu</th>
                    <th style={{ textAlign: 'right' }}>Écart</th>
                    <th>Note</th>
                    <th style={{ width: 220 }} />
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.id}>
                      <td>{formatFr(c.countedOn)}</td>
                      <td style={{ textAlign: 'right' }}>{formatEuro(c.countedCents)}</td>
                      <td style={{ textAlign: 'right' }}>{formatEuro(c.expectedCents)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {c.deltaCents === 0 ? (
                          <span className="cf-pill cf-pill--ok">juste</span>
                        ) : (
                          formatSigned(c.deltaCents)
                        )}
                      </td>
                      <td>
                        <small className="cf-muted">{c.note ?? '—'}</small>
                      </td>
                      <td>
                        {c.validatedAt ? (
                          <span className="cf-pill cf-pill--muted">
                            Validé{c.adjustmentEntryId ? ' · écriture créée' : ''}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn-primary btn-ghost--sm"
                              disabled={validating}
                              onClick={() => void onValidate(c.id)}
                            >
                              {c.deltaCents === 0 ? 'Valider' : 'Valider l’écart'}
                            </button>
                            <button
                              type="button"
                              className="btn-ghost btn-ghost--sm"
                              onClick={() => void onDelete(c.id)}
                            >
                              Jeter
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <Drawer
        open={countOpen}
        onClose={() => setCountOpen(false)}
        title={account ? `Compter ${account.label}` : 'Compter la caisse'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setCountOpen(false)}>
              Annuler
            </button>
            <button type="submit" form="cf-cash-count" className="btn-primary" disabled={counting}>
              Enregistrer le comptage
            </button>
          </div>
        }
      >
        <form id="cf-cash-count" onSubmit={onCount} className="cf-form">
          <p className="cf-muted">
            Compte les billets et les pièces, sans regarder la comptabilité.
            L’écart s’affichera ensuite : rien n’est comptabilisé avant que tu
            l’aies validé.
          </p>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Date du comptage *</span>
              <input
                type="date"
                value={countedOn}
                max={todayIso()}
                onChange={(e) => setCountedOn(e.target.value)}
              />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Montant compté (€) *</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="128,40"
                value={countedInput}
                onChange={(e) => setCountedInput(e.target.value)}
              />
            </label>
          </div>
          <label className="cf-field">
            <span>Note</span>
            <input
              type="text"
              placeholder="Compté à deux après la buvette"
              value={countNote}
              onChange={(e) => setCountNote(e.target.value)}
            />
          </label>
        </form>
      </Drawer>

      <Drawer
        open={transfer !== null}
        onClose={() => setTransfer(null)}
        title={transfer === 'DEPOSIT' ? 'Déposer des espèces en banque' : 'Retirer des espèces'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setTransfer(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="cf-cash-transfer"
              className="btn-primary"
              disabled={transferring}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        <form id="cf-cash-transfer" onSubmit={onTransfer} className="cf-form">
          <p className="cf-muted">
            {transfer === 'DEPOSIT'
              ? 'L’argent quitte la caisse et entre en banque. La ligne « VERSEMENT ESPECES » du relevé se rapprochera de cette écriture.'
              : 'L’argent quitte la banque et entre en caisse. La ligne de retrait du relevé se rapprochera de cette écriture.'}
          </p>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>{transfer === 'DEPOSIT' ? 'Vers la banque *' : 'Depuis la banque *'}</span>
              <select value={bankId} onChange={(e) => setBankId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Date *</span>
              <input
                type="date"
                value={transferOn}
                onChange={(e) => setTransferOn(e.target.value)}
              />
            </label>
          </div>
          <div className="cf-form-row">
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Montant (€) *</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="250,00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </label>
            <label className="cf-field" style={{ flex: 1 }}>
              <span>Note</span>
              <input
                type="text"
                placeholder="Bordereau 4412"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
              />
            </label>
          </div>
          {book ? (
            <p className="cf-muted">
              Solde de la caisse à la fin de la période affichée (
              {formatFr(book.to)}) : {formatEuro(book.closingCents)}.
            </p>
          ) : null}
        </form>
      </Drawer>
    </>
  );
}
