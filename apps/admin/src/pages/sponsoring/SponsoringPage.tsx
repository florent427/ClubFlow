import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ACTIVATE_CLUB_SPONSORSHIP_DEAL,
  CANCEL_CLUB_SPONSORSHIP_DEAL,
  CLOSE_CLUB_SPONSORSHIP_DEAL,
  CLUB_SPONSORSHIP_DEALS,
  CREATE_CLUB_SPONSORSHIP_DEAL,
  CREATE_CLUB_SPONSORSHIP_INSTALLMENT,
  DELETE_CLUB_SPONSORSHIP_DEAL,
  DELETE_CLUB_SPONSORSHIP_INSTALLMENT,
  MARK_CLUB_SPONSORSHIP_INSTALLMENT_RECEIVED,
  UPDATE_CLUB_SPONSORSHIP_DEAL,
} from '../../lib/documents';
import type {
  ClubSponsorshipDealsData,
  SponsorshipDeal,
  SponsorshipDealStatusGql,
  SponsorshipInstallmentRow,
  SponsorshipKindGql,
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

const STATUS_LABEL: Record<SponsorshipDealStatusGql, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  CLOSED: 'Clôturé',
  CANCELLED: 'Annulé',
};

const STATUS_CLASS: Record<SponsorshipDealStatusGql, 'ok' | 'warn' | 'muted'> =
  {
    DRAFT: 'warn',
    ACTIVE: 'ok',
    CLOSED: 'muted',
    CANCELLED: 'muted',
  };

export function SponsoringPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubSponsorshipDealsData>(
    CLUB_SPONSORSHIP_DEALS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_SPONSORSHIP_DEAL,
  );
  const [update] = useMutation(UPDATE_CLUB_SPONSORSHIP_DEAL);
  const [activate] = useMutation(ACTIVATE_CLUB_SPONSORSHIP_DEAL);
  const [closeDeal] = useMutation(CLOSE_CLUB_SPONSORSHIP_DEAL);
  const [cancelDeal] = useMutation(CANCEL_CLUB_SPONSORSHIP_DEAL);
  const [remove] = useMutation(DELETE_CLUB_SPONSORSHIP_DEAL);
  const [addInstallment] = useMutation(CREATE_CLUB_SPONSORSHIP_INSTALLMENT);
  const [markInstallmentReceived] = useMutation(
    MARK_CLUB_SPONSORSHIP_INSTALLMENT_RECEIVED,
  );
  const [removeInstallment] = useMutation(DELETE_CLUB_SPONSORSHIP_INSTALLMENT);

  const [tab, setTab] = useState<'ALL' | 'CASH' | 'IN_KIND'>('ALL');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorshipDeal | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<SponsorshipDeal | null>(null);

  // Form fields
  const [sponsorName, setSponsorName] = useState('');
  const [kind, setKind] = useState<SponsorshipKindGql>('CASH');
  const [valueEuros, setValueEuros] = useState('');
  const [inKindDescription, setInKindDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');

  const [installingDealId, setInstallingDealId] = useState<string | null>(null);
  const [installEuros, setInstallEuros] = useState('');
  const [installDate, setInstallDate] = useState('');

  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receivedEuros, setReceivedEuros] = useState('');
  const [receivedDate, setReceivedDate] = useState('');

  const allDeals = data?.clubSponsorshipDeals ?? [];
  const deals = useMemo(() => {
    if (tab === 'ALL') return allDeals;
    return allDeals.filter((d) => d.kind === tab);
  }, [allDeals, tab]);

  const kpis = useMemo(() => {
    let cashCommitted = 0;
    let cashReceived = 0;
    let inKindValue = 0;
    let activeCount = 0;
    for (const d of allDeals) {
      if (d.status === 'ACTIVE') activeCount++;
      if (d.kind === 'CASH') {
        cashCommitted += d.valueCents ?? 0;
        for (const i of d.installments) {
          cashReceived += i.receivedAmountCents ?? 0;
        }
      } else if (d.kind === 'IN_KIND' && d.valueCents) {
        inKindValue += d.valueCents;
      }
    }
    return { cashCommitted, cashReceived, inKindValue, activeCount };
  }, [allDeals]);

  function openCreate() {
    setEditing(null);
    setSponsorName('');
    setKind('CASH');
    setValueEuros('');
    setInKindDescription('');
    setStartsAt('');
    setEndsAt('');
    setNotes('');
    setDrawerOpen(true);
  }

  function openEdit(d: SponsorshipDeal) {
    setEditing(d);
    setSponsorName(d.sponsorName);
    setKind(d.kind);
    setValueEuros(
      d.valueCents !== null
        ? (d.valueCents / 100).toFixed(2).replace('.', ',')
        : '',
    );
    setInKindDescription(d.inKindDescription ?? '');
    setStartsAt(d.startsAt ? d.startsAt.slice(0, 10) : '');
    setEndsAt(d.endsAt ? d.endsAt.slice(0, 10) : '');
    setNotes(d.notes ?? '');
    setDrawerOpen(true);
  }

  async function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    const name = sponsorName.trim();
    if (!name) {
      showToast('Nom du sponsor requis', 'error');
      return;
    }
    if (kind === 'IN_KIND' && !inKindDescription.trim()) {
      showToast('Description requise pour un sponsoring en nature', 'error');
      return;
    }
    const valueCents = valueEuros ? parseEuros(valueEuros) : null;
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              sponsorName: name,
              valueCents,
              inKindDescription: inKindDescription.trim() || null,
              startsAt: startsAt ? new Date(startsAt).toISOString() : null,
              endsAt: endsAt ? new Date(endsAt).toISOString() : null,
              notes: notes.trim() || null,
            },
          },
        });
        showToast('Contrat mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              sponsorName: name,
              kind,
              valueCents,
              inKindDescription: inKindDescription.trim() || null,
              startsAt: startsAt ? new Date(startsAt).toISOString() : null,
              endsAt: endsAt ? new Date(endsAt).toISOString() : null,
              notes: notes.trim() || null,
            },
          },
        });
        showToast('Contrat créé', 'success');
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doActivate(id: string, dealKind: SponsorshipKindGql) {
    try {
      await activate({ variables: { id } });
      showToast(
        dealKind === 'IN_KIND'
          ? 'Contrat actif — écriture nature 860/871 générée'
          : 'Contrat activé',
        'success',
      );
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doClose(id: string) {
    try {
      await closeDeal({ variables: { id } });
      showToast('Contrat clôturé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doCancel(id: string) {
    try {
      await cancelDeal({ variables: { id } });
      showToast('Contrat annulé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doAddInstallment() {
    if (!installingDealId) return;
    const cents = parseEuros(installEuros);
    if (cents === null || cents <= 0) {
      showToast('Montant invalide', 'error');
      return;
    }
    try {
      await addInstallment({
        variables: {
          input: {
            dealId: installingDealId,
            expectedAmountCents: cents,
            expectedAt: installDate
              ? new Date(installDate).toISOString()
              : null,
          },
        },
      });
      showToast('Versement programmé', 'success');
      setInstallingDealId(null);
      setInstallEuros('');
      setInstallDate('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  function openMarkReceived(i: SponsorshipInstallmentRow) {
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
      showToast('Versement reçu — écriture compta générée', 'success');
      setReceivingId(null);
      setReceivedEuros('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doRemoveInstallment(id: string) {
    try {
      await removeInstallment({ variables: { id } });
      showToast('Versement supprimé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await remove({ variables: { id: confirmDel.id } });
      showToast('Contrat supprimé', 'success');
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
          <h1 className="cf-page-title">Sponsoring</h1>
          <p className="cf-page-subtitle">
            Cash ou nature. Le sponsoring en nature génère automatiquement les
            écritures neutres 860/871 (contributions volontaires).
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouveau contrat
        </button>
      </header>

      <div className="cf-acct-summary">
        <div className="cf-acct-summary__card">
          <span>Actifs</span>
          <strong>{kpis.activeCount}</strong>
        </div>
        <div className="cf-acct-summary__card cf-acct-summary__card--income">
          <span>Cash engagé</span>
          <strong>{fmtEuros(kpis.cashCommitted)}</strong>
        </div>
        <div className="cf-acct-summary__card cf-acct-summary__card--balance">
          <span>Cash reçu</span>
          <strong>{fmtEuros(kpis.cashReceived)}</strong>
        </div>
        <div className="cf-acct-summary__card">
          <span>Valeur nature</span>
          <strong>{fmtEuros(kpis.inKindValue)}</strong>
        </div>
      </div>

      <div className="cf-segmented" role="group" aria-label="Filtre type">
        <button
          type="button"
          className={`cf-segmented__btn${tab === 'ALL' ? ' cf-segmented__btn--active' : ''}`}
          onClick={() => setTab('ALL')}
        >
          Tous
        </button>
        <button
          type="button"
          className={`cf-segmented__btn${tab === 'CASH' ? ' cf-segmented__btn--active' : ''}`}
          onClick={() => setTab('CASH')}
        >
          <span className="material-symbols-outlined" aria-hidden>
            payments
          </span>
          Cash
        </button>
        <button
          type="button"
          className={`cf-segmented__btn${tab === 'IN_KIND' ? ' cf-segmented__btn--active' : ''}`}
          onClick={() => setTab('IN_KIND')}
        >
          <span className="material-symbols-outlined" aria-hidden>
            inventory
          </span>
          Nature
        </button>
      </div>

      {loading && deals.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : deals.length === 0 ? (
        <EmptyState
          icon="handshake"
          title="Aucun contrat"
          message="Créez votre premier contrat de sponsoring."
        />
      ) : (
        <div className="cf-grant-list">
          {deals.map((d) => {
            const isOpen = expanded === d.id;
            const receivedTotal = d.installments.reduce(
              (s, i) => s + (i.receivedAmountCents ?? 0),
              0,
            );
            return (
              <article
                key={d.id}
                className={`cf-grant-card ${isOpen ? 'is-open' : ''}`}
              >
                <header
                  className="cf-grant-card__head"
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <h3>{d.sponsorName}</h3>
                    <small className="cf-muted">
                      {d.kind === 'CASH' ? 'Cash' : 'Nature'}
                      {d.projectTitle ? ` · ${d.projectTitle}` : ''}
                      {d.inKindDescription ? ` · ${d.inKindDescription}` : ''}
                    </small>
                  </div>
                  <div className="cf-grant-card__meta">
                    <span className={`cf-pill cf-pill--${STATUS_CLASS[d.status]}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                    <strong>{fmtEuros(d.valueCents)}</strong>
                  </div>
                </header>
                {isOpen ? (
                  <div className="cf-grant-card__body">
                    <div className="cf-grant-card__row">
                      <div>
                        <label className="cf-muted">Type</label>
                        <strong>
                          {d.kind === 'CASH' ? 'Versement cash' : 'En nature'}
                        </strong>
                      </div>
                      <div>
                        <label className="cf-muted">Valeur</label>
                        <strong>{fmtEuros(d.valueCents)}</strong>
                      </div>
                      {d.kind === 'CASH' ? (
                        <div>
                          <label className="cf-muted">Reçu</label>
                          <strong>{fmtEuros(receivedTotal)}</strong>
                        </div>
                      ) : null}
                      <div>
                        <label className="cf-muted">Période</label>
                        <strong>
                          {fmtDate(d.startsAt)} → {fmtDate(d.endsAt)}
                        </strong>
                      </div>
                    </div>

                    {d.kind === 'CASH' ? (
                      <div className="cf-grant-card__installments">
                        <div className="cf-grant-card__section-head">
                          <h4>Versements</h4>
                          {d.status === 'ACTIVE' || d.status === 'DRAFT' ? (
                            <button
                              type="button"
                              className="cf-btn cf-btn--ghost cf-btn--sm"
                              onClick={() => setInstallingDealId(d.id)}
                            >
                              + Programmer
                            </button>
                          ) : null}
                        </div>
                        {d.installments.length === 0 ? (
                          <p className="cf-muted">Aucun versement programmé.</p>
                        ) : (
                          <table className="cf-table cf-table--compact">
                            <thead>
                              <tr>
                                <th>Date prévue</th>
                                <th style={{ textAlign: 'right' }}>Prévu</th>
                                <th>Date reçue</th>
                                <th style={{ textAlign: 'right' }}>Reçu</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.installments.map((i) => (
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
                                          onClick={() => openMarkReceived(i)}
                                        >
                                          Reçu
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
                                        Écriture #
                                        {i.accountingEntryId?.slice(0, 8) ??
                                          '—'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ) : d.inKindDescription ? (
                      <div className="cf-grant-card__inkind">
                        <strong>Apports en nature :</strong>
                        <p>{d.inKindDescription}</p>
                      </div>
                    ) : null}

                    <div className="cf-grant-card__actions">
                      {d.status === 'DRAFT' ? (
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={() => doActivate(d.id, d.kind)}
                        >
                          Activer
                        </button>
                      ) : null}
                      {d.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="cf-btn"
                          onClick={() => doClose(d.id)}
                        >
                          Clôturer
                        </button>
                      ) : null}
                      {(d.status === 'DRAFT' || d.status === 'ACTIVE') ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--danger"
                          onClick={() => doCancel(d.id)}
                        >
                          Annuler
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        onClick={() => openEdit(d)}
                      >
                        Éditer
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--danger"
                        onClick={() => setConfirmDel(d)}
                      >
                        Supprimer
                      </button>
                    </div>

                    {d.notes ? (
                      <p className="cf-grant-card__notes">{d.notes}</p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Modifier le contrat' : 'Nouveau contrat'}
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
              form="cf-sponsor-form"
            >
              {editing ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        }
      >
        <form
          id="cf-sponsor-form"
          onSubmit={onSubmitForm}
          className="cf-form"
        >
          <label className="cf-field">
            <span>Nom du sponsor *</span>
            <input
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              placeholder="ex: Décathlon, Crédit Agricole"
              maxLength={200}
              required
            />
          </label>
          {!editing ? (
            <label className="cf-field">
              <span>Type *</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as SponsorshipKindGql)}
              >
                <option value="CASH">Cash (versements monétaires)</option>
                <option value="IN_KIND">En nature (matériel, prestations)</option>
              </select>
            </label>
          ) : null}
          <label className="cf-field">
            <span>
              {kind === 'CASH' ? 'Valeur totale (€)' : 'Valeur estimée (€)'}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={valueEuros}
              onChange={(e) => setValueEuros(e.target.value)}
              placeholder="ex: 2000,00"
            />
          </label>
          {kind === 'IN_KIND' ? (
            <label className="cf-field">
              <span>Description des apports *</span>
              <textarea
                value={inKindDescription}
                onChange={(e) => setInKindDescription(e.target.value)}
                rows={3}
                placeholder="ex: 20 T-shirts logo club + 5 cartons de gourdes isothermes"
                maxLength={500}
              />
            </label>
          ) : null}
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

      <ConfirmModal
        open={installingDealId !== null}
        title="Programmer un versement"
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
        confirmLabel="Programmer"
        onConfirm={() => void doAddInstallment()}
        onCancel={() => {
          setInstallingDealId(null);
          setInstallEuros('');
          setInstallDate('');
        }}
      />

      <ConfirmModal
        open={receivingId !== null}
        title="Marquer le versement reçu"
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
              Une écriture compta sera générée automatiquement.
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
        title="Supprimer ce contrat ?"
        message={
          confirmDel
            ? `${confirmDel.sponsorName} — Versements, documents et écritures compta associées seront détachés.`
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
