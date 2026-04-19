import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ARCHIVE_CLUB_GRANT_APPLICATION,
  CLUB_GRANT_APPLICATIONS,
  CREATE_CLUB_GRANT_APPLICATION,
  DELETE_CLUB_GRANT_APPLICATION,
  SUBMIT_CLUB_GRANT_APPLICATION,
  UPDATE_CLUB_GRANT_APPLICATION,
} from '../../lib/documents';
import type {
  ClubGrantApplicationsData,
  GrantApplication,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmtEuros(cents: number | null): string {
  if (cents === null || cents === undefined) return '—';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

function statusLabel(s: GrantApplication['status']): {
  label: string;
  cls: 'ok' | 'warn' | 'muted';
} {
  if (s === 'SUBMITTED') return { label: 'Déposé', cls: 'ok' };
  if (s === 'ARCHIVED') return { label: 'Archivé', cls: 'muted' };
  return { label: 'Brouillon', cls: 'warn' };
}

export function SubsidiesPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubGrantApplicationsData>(
    CLUB_GRANT_APPLICATIONS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(
    CREATE_CLUB_GRANT_APPLICATION,
  );
  const [update, { loading: updating }] = useMutation(
    UPDATE_CLUB_GRANT_APPLICATION,
  );
  const [submit] = useMutation(SUBMIT_CLUB_GRANT_APPLICATION);
  const [archive] = useMutation(ARCHIVE_CLUB_GRANT_APPLICATION);
  const [remove] = useMutation(DELETE_CLUB_GRANT_APPLICATION);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GrantApplication | null>(null);
  const [confirmDel, setConfirmDel] = useState<GrantApplication | null>(null);

  const [title, setTitle] = useState('');
  const [amountEuros, setAmountEuros] = useState('');
  const [notes, setNotes] = useState('');

  const apps = data?.clubGrantApplications ?? [];

  function openCreate() {
    setEditing(null);
    setTitle('');
    setAmountEuros('');
    setNotes('');
    setDrawerOpen(true);
  }

  function openEdit(a: GrantApplication) {
    setEditing(a);
    setTitle(a.title);
    setAmountEuros(
      a.amountCents !== null ? (a.amountCents / 100).toFixed(2).replace('.', ',') : '',
    );
    setNotes(a.notes ?? '');
    setDrawerOpen(true);
  }

  function parseEuros(s: string): number | null {
    const cleaned = s.trim().replace(/\s/g, '').replace(',', '.');
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (t.length === 0) {
      showToast('Titre requis', 'error');
      return;
    }
    const amountCents = parseEuros(amountEuros);
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              title: t,
              amountCents,
              notes: notes.trim() || null,
            },
          },
        });
        showToast('Dossier mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              title: t,
              ...(amountCents !== null ? { amountCents } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            },
          },
        });
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
      showToast('Dossier marqué comme déposé', 'success');
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
            Suivi des demandes de subvention et de leur avancement.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <span className="material-symbols-outlined" aria-hidden>add</span>
          Nouveau dossier
        </button>
      </header>

      {loading && apps.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : apps.length === 0 ? (
        <EmptyState
          icon="volunteer_activism"
          title="Aucun dossier de subvention"
          message="Préparez votre premier dossier pour suivre son statut jusqu'à l'obtention."
        />
      ) : (
        <ul className="cf-finance-list">
          {apps.map((a) => {
            const pill = statusLabel(a.status);
            return (
              <li key={a.id} className="cf-finance-card">
                <div className="cf-finance-card__head">
                  <h2>{a.title}</h2>
                  <span className={`cf-pill cf-pill--${pill.cls}`}>
                    {pill.label}
                  </span>
                </div>
                <p className="cf-finance-card__amount">
                  {fmtEuros(a.amountCents)}
                </p>
                <p className="cf-finance-card__meta">
                  Créé le {fmt(a.createdAt)} · Modifié le {fmt(a.updatedAt)}
                </p>
                {a.notes ? (
                  <p className="cf-finance-card__notes">{a.notes}</p>
                ) : null}
                <div className="cf-finance-card__actions">
                  <button type="button" className="btn-ghost" onClick={() => openEdit(a)}>
                    Modifier
                  </button>
                  {a.status === 'DRAFT' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void doSubmit(a.id)}
                    >
                      Marquer déposé
                    </button>
                  ) : null}
                  {a.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => void doArchive(a.id)}
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
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Modifier le dossier' : 'Nouveau dossier'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={creating || updating}
              form="cf-grant-form"
            >
              {editing ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        }
      >
        <form id="cf-grant-form" onSubmit={onSubmit} className="cf-form">
          <label className="cf-field">
            <span>Titre *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="cf-field">
            <span>Montant demandé (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountEuros}
              onChange={(e) => setAmountEuros(e.target.value)}
              placeholder="ex : 5 000,00"
            />
          </label>
          <label className="cf-field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Description du projet, échéance, référent…"
            />
          </label>
          <button type="submit" style={{ display: 'none' }} />
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDel !== null}
        title="Supprimer ce dossier ?"
        message={
          confirmDel ? `« ${confirmDel.title} » sera supprimé définitivement.` : undefined
        }
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
