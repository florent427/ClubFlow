import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ARCHIVE_CLUB_GRANT_APPLICATION,
  CLUB_GRANT_APPLICATIONS,
  CREATE_CLUB_GRANT_APPLICATION,
  CREATE_CLUB_GRANT_INSTALLMENT,
  DELETE_CLUB_GRANT_APPLICATION,
  DELETE_CLUB_GRANT_INSTALLMENT,
  MARK_CLUB_GRANT_GRANTED,
  MARK_CLUB_GRANT_INSTALLMENT_RECEIVED,
  MARK_CLUB_GRANT_REPORTED,
  REJECT_CLUB_GRANT_APPLICATION,
  SETTLE_CLUB_GRANT_APPLICATION,
  SUBMIT_CLUB_GRANT_APPLICATION,
  UPDATE_CLUB_GRANT_APPLICATION,
} from '../../lib/documents';
import type {
  ClubGrantApplicationsData,
  GrantApplication,
  GrantApplicationStatusGql,
  GrantInstallmentRow,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmtEuros(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

function parseEuros(s: string): number | null {
  const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const STATUS_LABEL: Record<GrantApplicationStatusGql, string> = {
  DRAFT: 'Brouillon',
  REQUESTED: 'Demandée',
  GRANTED: 'Accordée',
  PARTIALLY_PAID: 'Partiellement versée',
  PAID: 'Versée',
  REPORTED: 'Rapport soumis',
  SETTLED: 'Soldée',
  REJECTED: 'Refusée',
  ARCHIVED: 'Archivée',
  SUBMITTED: 'Déposée (legacy)',
};

const STATUS_CLASS: Record<GrantApplicationStatusGql, 'ok' | 'warn' | 'muted'> =
  {
    DRAFT: 'warn',
    REQUESTED: 'warn',
    GRANTED: 'ok',
    PARTIALLY_PAID: 'ok',
    PAID: 'ok',
    REPORTED: 'ok',
    SETTLED: 'muted',
    REJECTED: 'muted',
    ARCHIVED: 'muted',
    SUBMITTED: 'warn',
  };

export function SubsidiesPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubGrantApplicationsData>(
    CLUB_GRANT_APPLICATIONS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_GRANT_APPLICATION,
  );
  const [update] = useMutation(UPDATE_CLUB_GRANT_APPLICATION);
  const [submit] = useMutation(SUBMIT_CLUB_GRANT_APPLICATION);
  const [markGranted] = useMutation(MARK_CLUB_GRANT_GRANTED);
  const [reject] = useMutation(REJECT_CLUB_GRANT_APPLICATION);
  const [markReported] = useMutation(MARK_CLUB_GRANT_REPORTED);
  const [settle] = useMutation(SETTLE_CLUB_GRANT_APPLICATION);
  const [archive] = useMutation(ARCHIVE_CLUB_GRANT_APPLICATION);
  const [remove] = useMutation(DELETE_CLUB_GRANT_APPLICATION);
  const [addInstallment] = useMutation(CREATE_CLUB_GRANT_INSTALLMENT);
  const [markInstallmentReceived] = useMutation(
    MARK_CLUB_GRANT_INSTALLMENT_RECEIVED,
  );
  const [removeInstallment] = useMutation(DELETE_CLUB_GRANT_INSTALLMENT);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GrantApplication | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<GrantApplication | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [fundingBody, setFundingBody] = useState('');
  const [requestedEuros, setRequestedEuros] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reportDueAt, setReportDueAt] = useState('');
  const [notes, setNotes] = useState('');

  // Grant granted prompt
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantedEuros, setGrantedEuros] = useState('');

  // Add installment
  const [installingGrantId, setInstallingGrantId] = useState<string | null>(
    null,
  );
  const [installEuros, setInstallEuros] = useState('');
  const [installDate, setInstallDate] = useState('');

  // Mark installment received
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receivedEuros, setReceivedEuros] = useState('');
  const [receivedDate, setReceivedDate] = useState('');

  const apps = data?.clubGrantApplications ?? [];

  // KPIs
  const kpis = useMemo(() => {
    let requested = 0;
    let granted = 0;
    let received = 0;
    let pendingReport = 0;
    for (const a of apps) {
      if (a.requestedAmountCents) requested += a.requestedAmountCents;
      if (a.grantedAmountCents) granted += a.grantedAmountCents;
      for (const i of a.installments) {
        if (i.receivedAmountCents) received += i.receivedAmountCents;
      }
      if (
        (a.status === 'PAID' || a.status === 'PARTIALLY_PAID') &&
        !a.reportSubmittedAt
      ) {
        pendingReport++;
      }
    }
    return { requested, granted, received, pendingReport };
  }, [apps]);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setFundingBody('');
    setRequestedEuros('');
    setStartsAt('');
    setEndsAt('');
    setReportDueAt('');
    setNotes('');
    setDrawerOpen(true);
  }

  function openEdit(a: GrantApplication) {
    setEditing(a);
    setTitle(a.title);
    setFundingBody(a.fundingBody ?? '');
    setRequestedEuros(
      a.requestedAmountCents !== null
        ? (a.requestedAmountCents / 100).toFixed(2).replace('.', ',')
        : '',
    );
    setStartsAt(a.startsAt ? a.startsAt.slice(0, 10) : '');
    setEndsAt(a.endsAt ? a.endsAt.slice(0, 10) : '');
    setReportDueAt(a.reportDueAt ? a.reportDueAt.slice(0, 10) : '');
    setNotes(a.notes ?? '');
    setDrawerOpen(true);
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      showToast('Titre requis', 'error');
      return;
    }
    const requestedCents = requestedEuros ? parseEuros(requestedEuros) : null;
    try {
      const variables = {
        input: {
          ...(editing ? { id: editing.id } : {}),
          title: t,
          fundingBody: fundingBody.trim() || null,
          requestedAmountCents: requestedCents,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          reportDueAt: reportDueAt
            ? new Date(reportDueAt).toISOString()
            : null,
          notes: notes.trim() || null,
        },
      };
      if (editing) {
        await update({ variables });
        showToast('Dossier mis à jour', 'success');
      } else {
        await create({ variables });
        showToast('Dossier créé', 'success');
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doSubmit(id: string) {
    try {
      await submit({ variables: { id } });
      showToast('Dossier soumis', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doMarkGranted() {
    if (!grantingId) return;
    const cents = parseEuros(grantedEuros);
    if (cents === null || cents <= 0) {
      showToast('Montant accordé invalide', 'error');
      return;
    }
    try {
      await markGranted({
        variables: { input: { id: grantingId, grantedAmountCents: cents } },
      });
      showToast('Subvention accordée', 'success');
      setGrantingId(null);
      setGrantedEuros('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doAddInstallment() {
    if (!installingGrantId) return;
    const cents = parseEuros(installEuros);
    if (cents === null || cents <= 0) {
      showToast('Montant invalide', 'error');
      return;
    }
    try {
      await addInstallment({
        variables: {
          input: {
            grantId: installingGrantId,
            expectedAmountCents: cents,
            expectedAt: installDate
              ? new Date(installDate).toISOString()
              : null,
          },
        },
      });
      showToast('Tranche ajoutée', 'success');
      setInstallingGrantId(null);
      setInstallEuros('');
      setInstallDate('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doMarkInstallmentReceived(i: GrantInstallmentRow) {
    setReceivingId(i.id);
    setReceivedEuros((i.expectedAmountCents / 100).toFixed(2).replace('.', ','));
    setReceivedDate('');
  }

  async function confirmReceived() {
    if (!receivingId) return;
    const cents = parseEuros(receivedEuros);
    if (cents === null || cents <= 0) {
      showToast('Montant invalide', 'error');
      return;
    }
    try {
      await markInstallmentReceived({
        variables: {
          input: {
            id: receivingId,
            receivedAmountCents: cents,
            receivedAt: receivedDate
              ? new Date(receivedDate).toISOString()
              : null,
          },
        },
      });
      showToast('Tranche marquée reçue — écriture compta générée', 'success');
      setReceivingId(null);
      setReceivedEuros('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doRemoveInstallment(installmentId: string) {
    try {
      await removeInstallment({ variables: { id: installmentId } });
      showToast('Tranche supprimée', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doReject(id: string) {
    try {
      await reject({ variables: { id } });
      showToast('Dossier refusé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doMarkReported(id: string) {
    try {
      await markReported({ variables: { id } });
      showToast('Rapport marqué soumis', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doSettle(id: string) {
    try {
      await settle({ variables: { id } });
      showToast('Dossier soldé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doArchive(id: string) {
    try {
      await archive({ variables: { id } });
      showToast('Dossier archivé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await remove({ variables: { id: confirmDel.id } });
      showToast('Dossier supprimé', 'success');
      setConfirmDel(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <div className="cf-page">
      <header className="cf-page-header">
        <div>
          <h1 className="cf-page-title">Subventions</h1>
          <p className="cf-page-subtitle">
            Workflow complet : brouillon → demandée → accordée → versée (par
            tranches) → justifiée → soldée. Chaque versement génère
            automatiquement une écriture compta.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouveau dossier
        </button>
      </header>

      <div className="cf-acct-summary">
        <div className="cf-acct-summary__card">
          <span>Demandé</span>
          <strong>{fmtEuros(kpis.requested)}</strong>
        </div>
        <div className="cf-acct-summary__card cf-acct-summary__card--income">
          <span>Accordé</span>
          <strong>{fmtEuros(kpis.granted)}</strong>
        </div>
        <div className="cf-acct-summary__card cf-acct-summary__card--balance">
          <span>Encaissé</span>
          <strong>{fmtEuros(kpis.received)}</strong>
        </div>
        {kpis.pendingReport > 0 ? (
          <div
            className="cf-acct-summary__card"
            style={{ background: 'rgba(255, 180, 0, 0.08)' }}
          >
            <span>Rapports à rendre</span>
            <strong>{kpis.pendingReport}</strong>
          </div>
        ) : null}
      </div>

      {loading && apps.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : apps.length === 0 ? (
        <EmptyState
          icon="volunteer_activism"
          title="Aucun dossier"
          message="Créez votre premier dossier de subvention pour suivre le cycle complet."
        />
      ) : (
        <div className="cf-grant-list">
          {apps.map((a) => {
            const isOpen = expanded === a.id;
            const receivedTotal = a.installments.reduce(
              (s, i) => s + (i.receivedAmountCents ?? 0),
              0,
            );
            const expectedTotal = a.installments.reduce(
              (s, i) => s + i.expectedAmountCents,
              0,
            );
            return (
              <article
                key={a.id}
                className={`cf-grant-card ${isOpen ? 'is-open' : ''}`}
              >
                <header
                  className="cf-grant-card__head"
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <h3>{a.title}</h3>
                    <small className="cf-muted">
                      {a.fundingBody ?? 'Bailleur non précisé'}
                      {a.projectTitle ? ` · Projet : ${a.projectTitle}` : ''}
                    </small>
                  </div>
                  <div className="cf-grant-card__meta">
                    <span className={`cf-pill cf-pill--${STATUS_CLASS[a.status]}`}>
                      {STATUS_LABEL[a.status]}
                    </span>
                    <strong>
                      {fmtEuros(a.grantedAmountCents ?? a.requestedAmountCents)}
                    </strong>
                  </div>
                </header>
                {isOpen ? (
                  <div className="cf-grant-card__body">
                    <div className="cf-grant-card__row">
                      <div>
                        <label className="cf-muted">Demandé</label>
                        <strong>{fmtEuros(a.requestedAmountCents)}</strong>
                      </div>
                      <div>
                        <label className="cf-muted">Accordé</label>
                        <strong>{fmtEuros(a.grantedAmountCents)}</strong>
                      </div>
                      <div>
                        <label className="cf-muted">Reçu</label>
                        <strong>{fmtEuros(receivedTotal)}</strong>
                      </div>
                      <div>
                        <label className="cf-muted">Rapport dû</label>
                        <strong>{fmtDate(a.reportDueAt)}</strong>
                      </div>
                    </div>

                    {/* Installments */}
                    <div className="cf-grant-card__installments">
                      <div className="cf-grant-card__section-head">
                        <h4>Tranches</h4>
                        {(a.status === 'GRANTED' ||
                          a.status === 'PARTIALLY_PAID' ||
                          a.status === 'REQUESTED') &&
                        a.grantedAmountCents ? (
                          <button
                            type="button"
                            className="cf-btn cf-btn--ghost cf-btn--sm"
                            onClick={() => setInstallingGrantId(a.id)}
                          >
                            + Ajouter
                          </button>
                        ) : null}
                      </div>
                      {a.installments.length === 0 ? (
                        <p className="cf-muted">Aucune tranche prévue.</p>
                      ) : (
                        <table className="cf-table cf-table--compact">
                          <thead>
                            <tr>
                              <th>Date prévue</th>
                              <th style={{ textAlign: 'right' }}>
                                Montant prévu
                              </th>
                              <th>Date reçue</th>
                              <th style={{ textAlign: 'right' }}>
                                Montant reçu
                              </th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.installments.map((i) => (
                              <tr key={i.id}>
                                <td>{fmtDate(i.expectedAt)}</td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {fmtEuros(i.expectedAmountCents)}
                                </td>
                                <td>
                                  {i.receivedAt ? (
                                    fmtDate(i.receivedAt)
                                  ) : (
                                    <span className="cf-muted">—</span>
                                  )}
                                </td>
                                <td
                                  style={{
                                    textAlign: 'right',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {fmtEuros(i.receivedAmountCents)}
                                </td>
                                <td>
                                  {!i.receivedAt ? (
                                    <>
                                      <button
                                        type="button"
                                        className="cf-btn cf-btn--sm"
                                        onClick={() =>
                                          doMarkInstallmentReceived(i)
                                        }
                                      >
                                        Marquer reçue
                                      </button>{' '}
                                      <button
                                        type="button"
                                        className="btn-ghost btn-ghost--danger"
                                        onClick={() =>
                                          doRemoveInstallment(i.id)
                                        }
                                      >
                                        Supprimer
                                      </button>
                                    </>
                                  ) : (
                                    <span className="cf-muted">
                                      Écriture compta #
                                      {i.accountingEntryId?.slice(0, 8) ?? '—'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Actions workflow */}
                    <div className="cf-grant-card__actions">
                      {a.status === 'DRAFT' ? (
                        <button
                          type="button"
                          className="cf-btn"
                          onClick={() => doSubmit(a.id)}
                        >
                          Soumettre la demande
                        </button>
                      ) : null}
                      {(a.status === 'REQUESTED' || a.status === 'DRAFT') ? (
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={() => {
                            setGrantingId(a.id);
                            setGrantedEuros(
                              a.requestedAmountCents
                                ? (a.requestedAmountCents / 100)
                                    .toFixed(2)
                                    .replace('.', ',')
                                : '',
                            );
                          }}
                        >
                          Accordée
                        </button>
                      ) : null}
                      {a.status === 'REQUESTED' ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger"
                          onClick={() => doReject(a.id)}
                        >
                          Refusée
                        </button>
                      ) : null}
                      {(a.status === 'PAID' ||
                        a.status === 'PARTIALLY_PAID') &&
                      !a.reportSubmittedAt ? (
                        <button
                          type="button"
                          className="cf-btn"
                          onClick={() => doMarkReported(a.id)}
                        >
                          Rapport soumis
                        </button>
                      ) : null}
                      {a.status === 'REPORTED' ? (
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={() => doSettle(a.id)}
                        >
                          Solder
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        onClick={() => openEdit(a)}
                      >
                        Éditer
                      </button>
                      {a.status !== 'ARCHIVED' && a.status !== 'SETTLED' ? (
                        <button
                          type="button"
                          className="cf-btn cf-btn--ghost"
                          onClick={() => doArchive(a.id)}
                        >
                          Archiver
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--danger"
                        onClick={() => setConfirmDel(a)}
                      >
                        Supprimer
                      </button>
                    </div>

                    {a.notes ? (
                      <p className="cf-grant-card__notes">{a.notes}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* Drawer créer/éditer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Modifier le dossier' : 'Nouveau dossier'}
        footer={
          <div className="cf-drawer-foot">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={creating}
              form="cf-subsidies-form"
            >
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        }
      >
        <form
          id="cf-subsidies-form"
          onSubmit={onSubmitForm}
          className="cf-form"
        >
          <label className="cf-field">
            <span>Titre du dossier *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Stage international Pologne 2026"
              maxLength={200}
              required
            />
          </label>
          <label className="cf-field">
            <span>Bailleur</span>
            <input
              type="text"
              value={fundingBody}
              onChange={(e) => setFundingBody(e.target.value)}
              placeholder="ex: Mairie, FDVA, CNDS, Région"
              maxLength={200}
            />
          </label>
          <label className="cf-field">
            <span>Montant demandé (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={requestedEuros}
              onChange={(e) => setRequestedEuros(e.target.value)}
              placeholder="ex: 2000,00"
            />
          </label>
          <div className="cf-form-row">
            <label className="cf-field">
              <span>Début</span>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="cf-field">
              <span>Fin</span>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </label>
          </div>
          <label className="cf-field">
            <span>Date limite rapport</span>
            <input
              type="date"
              value={reportDueAt}
              onChange={(e) => setReportDueAt(e.target.value)}
            />
          </label>
          <label className="cf-field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </label>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      {/* Modal "accordée" */}
      <ConfirmModal
        open={grantingId !== null}
        title="Subvention accordée"
        message={
          <label className="cf-field">
            <span>Montant accordé (€) *</span>
            <input
              type="text"
              inputMode="decimal"
              value={grantedEuros}
              onChange={(e) => setGrantedEuros(e.target.value)}
              autoFocus
            />
          </label>
        }
        confirmLabel="Confirmer"
        onConfirm={() => void doMarkGranted()}
        onCancel={() => {
          setGrantingId(null);
          setGrantedEuros('');
        }}
      />

      {/* Modal "ajouter tranche" */}
      <ConfirmModal
        open={installingGrantId !== null}
        title="Ajouter une tranche"
        message={
          <div>
            <label className="cf-field">
              <span>Montant prévu (€) *</span>
              <input
                type="text"
                inputMode="decimal"
                value={installEuros}
                onChange={(e) => setInstallEuros(e.target.value)}
                autoFocus
              />
            </label>
            <label className="cf-field">
              <span>Date prévue</span>
              <input
                type="date"
                value={installDate}
                onChange={(e) => setInstallDate(e.target.value)}
              />
            </label>
          </div>
        }
        confirmLabel="Ajouter"
        onConfirm={() => void doAddInstallment()}
        onCancel={() => {
          setInstallingGrantId(null);
          setInstallEuros('');
          setInstallDate('');
        }}
      />

      {/* Modal "marquer reçue" */}
      <ConfirmModal
        open={receivingId !== null}
        title="Marquer la tranche reçue"
        message={
          <div>
            <label className="cf-field">
              <span>Montant reçu (€) *</span>
              <input
                type="text"
                inputMode="decimal"
                value={receivedEuros}
                onChange={(e) => setReceivedEuros(e.target.value)}
                autoFocus
              />
            </label>
            <label className="cf-field">
              <span>Date de réception</span>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </label>
            <p className="cf-muted">
              Une écriture comptable sera générée automatiquement.
            </p>
          </div>
        }
        confirmLabel="Valider"
        onConfirm={() => void confirmReceived()}
        onCancel={() => {
          setReceivingId(null);
          setReceivedEuros('');
          setReceivedDate('');
        }}
      />

      <ConfirmModal
        open={confirmDel !== null}
        title="Supprimer ce dossier ?"
        message={
          confirmDel
            ? `${confirmDel.title} — Tranches, documents et écritures compta associées seront détachés.`
            : undefined
        }
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
