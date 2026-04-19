import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_SPONSORSHIP_DEALS,
  CREATE_CLUB_SPONSORSHIP_DEAL,
  DELETE_CLUB_SPONSORSHIP_DEAL,
  UPDATE_CLUB_SPONSORSHIP_DEAL,
} from '../../lib/documents';
import type {
  ClubSponsorshipDealsData,
  SponsorshipDeal,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmtEuros(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function statusLabel(s: SponsorshipDeal['status']): {
  label: string;
  cls: 'ok' | 'muted';
} {
  if (s === 'CLOSED') return { label: 'Clôturé', cls: 'muted' };
  return { label: 'Actif', cls: 'ok' };
}

export function SponsoringPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubSponsorshipDealsData>(
    CLUB_SPONSORSHIP_DEALS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_SPONSORSHIP_DEAL,
  );
  const [update, { loading: updating }] = useMutation(
    UPDATE_CLUB_SPONSORSHIP_DEAL,
  );
  const [remove] = useMutation(DELETE_CLUB_SPONSORSHIP_DEAL);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorshipDeal | null>(null);
  const [confirmDel, setConfirmDel] = useState<SponsorshipDeal | null>(null);

  const [sponsorName, setSponsorName] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SponsorshipDeal['status']>('ACTIVE');

  const deals = data?.clubSponsorshipDeals ?? [];
  const totalActive = deals
    .filter((d) => d.status === 'ACTIVE')
    .reduce((acc, d) => acc + (d.amountCents ?? 0), 0);

  function openCreate() {
    setEditing(null);
    setSponsorName('');
    setAmountEuros('');
    setNotes('');
    setStatus('ACTIVE');
    setDrawerOpen(true);
  }

  function openEdit(d: SponsorshipDeal) {
    setEditing(d);
    setSponsorName(d.sponsorName);
    setAmountEuros(
      d.amountCents !== null ? (d.amountCents / 100).toFixed(2).replace('.', ',') : '',
    );
    setNotes(d.notes ?? '');
    setStatus(d.status);
    setDrawerOpen(true);
  }

  function parseEuros(s: string): number | null {
    const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = sponsorName.trim();
    if (name.length === 0) {
      showToast('Nom du sponsor requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              sponsorName: name,
              amountCents,
              notes: notes.trim() || null,
              status,
            },
          },
        });
        showToast('Contrat mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              sponsorName: name,
              ...(amountCents !== null ? { amountCents } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
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
            Contrats actifs : <strong>{fmtEuros(totalActive)}</strong>
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          Nouveau contrat
        </button>
      </header>

      {loading && deals.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : deals.length === 0 ? (
        <EmptyState
          icon="handshake"
          title="Aucun contrat de sponsoring"
          description="Créez votre premier contrat pour suivre les engagements sponsors."
        />
      ) : (
        <ul className="cf-finance-list">
          {deals.map((d) => {
            const pill = statusLabel(d.status);
            return (
              <li key={d.id} className="cf-finance-card">
                <div className="cf-finance-card__head">
                  <h2>{d.sponsorName}</h2>
                  <span className={`cf-pill cf-pill--${pill.cls}`}>
                    {pill.label}
                  </span>
                </div>
                <p className="cf-finance-card__amount">
                  {fmtEuros(d.amountCents)}
                </p>
                {d.notes ? (
                  <p className="cf-finance-card__notes">{d.notes}</p>
                ) : null}
                <div className="cf-finance-card__actions">
                  <button type="button" className="btn-ghost" onClick={() => openEdit(d)}>
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--danger"
                    onClick={() => setConfirmDel(d)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Modifier le contrat' : 'Nouveau contrat'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={creating || updating}
              form="cf-sponsor-form"
            >
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        }
      >
        <form id="cf-sponsor-form" onSubmit={submit} className="cf-form">
          <label className="cf-field">
            <span>Nom du sponsor *</span>
            <input
              type="text"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="cf-field">
            <span>Montant (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder="ex : 1 500,00"
            />
          </label>
          {editing ? (
            <label className="cf-field">
              <span>Statut</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SponsorshipDeal['status'])}
              >
                <option value="ACTIVE">Actif</option>
                <option value="CLOSED">Clôturé</option>
              </select>
            </label>
          ) : null}
          <label className="cf-field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={2000}
            />
          </label>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDel !== null}
        title="Supprimer ce contrat ?"
        message={
          confirmDel
            ? `Le contrat avec ${confirmDel.sponsorName} sera supprimé définitivement.`
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
