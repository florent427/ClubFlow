import { useMutation, useQuery } from '@apollo/client/react';
import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import {
  ADMIN_CANCEL_EVENT_REGISTRATION,
  ADMIN_REGISTER_MEMBER_TO_EVENT,
  CANCEL_CLUB_EVENT,
  CLUB_EVENTS,
  CLUB_MEMBERS,
  CREATE_CLUB_EVENT,
  DELETE_CLUB_EVENT,
  PUBLISH_CLUB_EVENT,
  UPDATE_CLUB_EVENT,
} from '../../lib/documents';
import type {
  ClubEvent,
  ClubEventsQueryData,
  ClubEventStatusStr,
  MembersQueryData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { downloadCsv, toCsv } from '../../lib/csv-export';

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtEuro(cents: number | null): string {
  if (cents === null) return 'Gratuit';
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: ClubEventStatusStr): string {
  if (s === 'DRAFT') return 'Brouillon';
  if (s === 'PUBLISHED') return 'Publié';
  return 'Annulé';
}
function statusTone(s: ClubEventStatusStr): string {
  if (s === 'PUBLISHED') return 'ok';
  if (s === 'DRAFT') return 'warn';
  return 'danger';
}

type FormState = {
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  priceCents: string;
  allowContactRegistration: boolean;
  publishNow: boolean;
};

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    location: '',
    startsAt: '',
    endsAt: '',
    capacity: '',
    registrationOpensAt: '',
    registrationClosesAt: '',
    priceCents: '',
    allowContactRegistration: false,
    publishNow: true,
  };
}

export function EventsPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubEventsQueryData>(CLUB_EVENTS);
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const [create, { loading: creating }] = useMutation(CREATE_CLUB_EVENT);
  const [update, { loading: updating }] = useMutation(UPDATE_CLUB_EVENT);
  const [publish] = useMutation(PUBLISH_CLUB_EVENT);
  const [cancel] = useMutation(CANCEL_CLUB_EVENT);
  const [remove] = useMutation(DELETE_CLUB_EVENT);
  const [adminRegisterMember, { loading: registering }] = useMutation(
    ADMIN_REGISTER_MEMBER_TO_EVENT,
  );
  const [adminCancelRegistration] = useMutation(
    ADMIN_CANCEL_EVENT_REGISTRATION,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClubEvent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<ClubEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<ClubEvent | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const events = useMemo(
    () =>
      [...(data?.clubEvents ?? [])].sort((a, b) =>
        a.startsAt < b.startsAt ? 1 : -1,
      ),
    [data],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }
  function openEdit(e: ClubEvent) {
    setEditing(e);
    setForm({
      title: e.title,
      description: e.description ?? '',
      location: e.location ?? '',
      startsAt: toLocalInputValue(e.startsAt),
      endsAt: toLocalInputValue(e.endsAt),
      capacity: e.capacity !== null ? String(e.capacity) : '',
      registrationOpensAt: toLocalInputValue(e.registrationOpensAt),
      registrationClosesAt: toLocalInputValue(e.registrationClosesAt),
      priceCents:
        e.priceCents !== null ? (e.priceCents / 100).toFixed(2) : '',
      allowContactRegistration: e.allowContactRegistration,
      publishNow: true,
    });
    setDrawerOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const startsAt = fromLocalInput(form.startsAt);
    const endsAt = fromLocalInput(form.endsAt);
    if (!startsAt || !endsAt || !form.title.trim()) {
      showToast('Titre, début et fin requis', 'error');
      return;
    }
    if (endsAt <= startsAt) {
      showToast('La fin doit être après le début', 'error');
      return;
    }
    const priceCents = form.priceCents
      ? Math.round(parseFloat(form.priceCents.replace(',', '.')) * 100)
      : undefined;
    const capacity = form.capacity ? parseInt(form.capacity, 10) : undefined;
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              title: form.title.trim(),
              description: form.description.trim() || undefined,
              location: form.location.trim() || undefined,
              startsAt,
              endsAt,
              capacity,
              registrationOpensAt: fromLocalInput(form.registrationOpensAt),
              registrationClosesAt: fromLocalInput(form.registrationClosesAt),
              priceCents,
              allowContactRegistration: form.allowContactRegistration,
            },
          },
        });
        showToast('Événement mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              title: form.title.trim(),
              description: form.description.trim() || undefined,
              location: form.location.trim() || undefined,
              startsAt,
              endsAt,
              capacity,
              registrationOpensAt: fromLocalInput(form.registrationOpensAt),
              registrationClosesAt: fromLocalInput(form.registrationClosesAt),
              priceCents,
              allowContactRegistration: form.allowContactRegistration,
              publishNow: form.publishNow,
            },
          },
        });
        showToast(
          form.publishNow ? 'Événement publié' : 'Brouillon enregistré',
          'success',
        );
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onPublish(e: ClubEvent) {
    try {
      await publish({ variables: { id: e.id } });
      showToast('Événement publié', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  async function onCancel(e: ClubEvent) {
    try {
      await cancel({ variables: { id: e.id } });
      showToast('Événement annulé', 'success');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }
  async function onAdminRegisterMember(memberId: string) {
    if (!detailEvent) return;
    try {
      const res = await adminRegisterMember({
        variables: { eventId: detailEvent.id, memberId },
      });
      showToast('Adhérent inscrit', 'success');
      const updated = (res.data as { adminRegisterMemberToEvent: ClubEvent } | null)
        ?.adminRegisterMemberToEvent;
      if (updated) setDetailEvent(updated);
      setMemberPickerOpen(false);
      setMemberSearch('');
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  async function onAdminCancelRegistration(registrationId: string) {
    if (!detailEvent) return;
    try {
      const res = await adminCancelRegistration({
        variables: { registrationId },
      });
      showToast('Inscription annulée', 'success');
      const updated = (res.data as {
        adminCancelEventRegistration: ClubEvent;
      } | null)?.adminCancelEventRegistration;
      if (updated) setDetailEvent(updated);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  function exportAttendeesCsv(ev: ClubEvent) {
    const csv = toCsv(
      ['Nom', 'Statut', 'Inscrit le', 'Annulé le', 'Note'],
      ev.registrations.map((r) => [
        r.displayName ?? '',
        r.status === 'REGISTERED'
          ? 'Confirmé'
          : r.status === 'WAITLISTED'
            ? 'En attente'
            : 'Annulé',
        r.registeredAt ? new Date(r.registeredAt).toLocaleString('fr-FR') : '',
        r.cancelledAt ? new Date(r.cancelledAt).toLocaleString('fr-FR') : '',
        r.note ?? '',
      ]),
    );
    const slug = ev.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'evenement';
    downloadCsv(`emargement-${slug}.csv`, csv);
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await remove({ variables: { id: confirmDelete.id } });
      showToast('Événement supprimé', 'success');
      setConfirmDelete(null);
      await refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  return (
    <section className="cf-page">
      <header className="cf-page__header">
        <div>
          <h1 className="cf-page__title">Événements</h1>
          <p className="cf-page__subtitle">
            Organisez compétitions, stages, réunions et gérez les inscriptions.
          </p>
        </div>
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={openCreate}
        >
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouvel événement
        </button>
      </header>

      {loading && events.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : events.length === 0 ? (
        <EmptyState
          icon="event"
          title="Aucun événement"
          message="Créez une compétition, un stage ou un rassemblement."
          action={
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={openCreate}
            >
              Créer
            </button>
          }
        />
      ) : (
        <ul className="cf-event-list">
          {events.map((e) => (
            <li key={e.id} className="cf-event-card">
              <div className="cf-event-card__head">
                <h3 className="cf-event-card__title">{e.title}</h3>
                <span className={`cf-pill cf-pill--${statusTone(e.status)}`}>
                  {statusLabel(e.status)}
                </span>
              </div>
              <div className="cf-event-card__meta">
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    schedule
                  </span>
                  {fmtDateTime(e.startsAt)}
                </span>
                {e.location ? (
                  <span>
                    <span className="material-symbols-outlined" aria-hidden>
                      place
                    </span>
                    {e.location}
                  </span>
                ) : null}
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    group
                  </span>
                  {e.registeredCount}
                  {e.capacity !== null ? ` / ${e.capacity}` : ''} inscrit
                  {e.registeredCount > 1 ? 's' : ''}
                  {e.waitlistCount > 0 ? ` (+${e.waitlistCount} attente)` : ''}
                </span>
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    euro
                  </span>
                  {fmtEuro(e.priceCents)}
                </span>
              </div>
              {e.description ? (
                <p className="cf-event-card__body">{e.description}</p>
              ) : null}
              <div className="cf-event-card__actions">
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => setDetailEvent(e)}
                >
                  Voir les inscrits
                </button>
                {e.status === 'DRAFT' ? (
                  <button
                    type="button"
                    className="cf-btn cf-btn--primary"
                    onClick={() => void onPublish(e)}
                  >
                    Publier
                  </button>
                ) : null}
                {e.status === 'PUBLISHED' ? (
                  <button
                    type="button"
                    className="cf-btn"
                    onClick={() => void onCancel(e)}
                  >
                    Annuler
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => openEdit(e)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--danger"
                  onClick={() => setConfirmDelete(e)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier l’événement' : 'Nouvel événement'}
        onClose={() => setDrawerOpen(false)}
        width={720}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Titre</span>
            <input
              type="text"
              className="cf-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Description</span>
            <textarea
              className="cf-input cf-textarea"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
              maxLength={10000}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Lieu</span>
            <input
              type="text"
              className="cf-input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              maxLength={200}
            />
          </label>
          <div className="cf-form-row">
            <label className="cf-field">
              <span className="cf-field__label">Début</span>
              <input
                type="datetime-local"
                className="cf-input"
                value={form.startsAt}
                onChange={(e) =>
                  setForm({ ...form, startsAt: e.target.value })
                }
                required
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Fin</span>
              <input
                type="datetime-local"
                className="cf-input"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="cf-form-row">
            <label className="cf-field">
              <span className="cf-field__label">Capacité (optionnel)</span>
              <input
                type="number"
                min={0}
                className="cf-input"
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: e.target.value })
                }
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Prix (€, optionnel)</span>
              <input
                type="text"
                className="cf-input"
                value={form.priceCents}
                onChange={(e) =>
                  setForm({ ...form, priceCents: e.target.value })
                }
                placeholder="ex. 25,00"
              />
            </label>
          </div>
          <div className="cf-form-row">
            <label className="cf-field">
              <span className="cf-field__label">
                Ouverture des inscriptions
              </span>
              <input
                type="datetime-local"
                className="cf-input"
                value={form.registrationOpensAt}
                onChange={(e) =>
                  setForm({ ...form, registrationOpensAt: e.target.value })
                }
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">
                Clôture des inscriptions
              </span>
              <input
                type="datetime-local"
                className="cf-input"
                value={form.registrationClosesAt}
                onChange={(e) =>
                  setForm({ ...form, registrationClosesAt: e.target.value })
                }
              />
            </label>
          </div>
          <label className="cf-checkbox">
            <input
              type="checkbox"
              checked={form.allowContactRegistration}
              onChange={(e) =>
                setForm({
                  ...form,
                  allowContactRegistration: e.target.checked,
                })
              }
            />
            <span>Ouvrir aux contacts (non-adhérents)</span>
          </label>
          {!editing ? (
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={form.publishNow}
                onChange={(e) =>
                  setForm({ ...form, publishNow: e.target.checked })
                }
              />
              <span>Publier immédiatement</span>
            </label>
          ) : null}
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating || updating}
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={detailEvent !== null}
        title={detailEvent ? `Inscrits : ${detailEvent.title}` : ''}
        onClose={() => setDetailEvent(null)}
        width={560}
      >
        {detailEvent ? (
          <div className="cf-form">
            <p className="cf-muted">
              {detailEvent.registeredCount} inscrit
              {detailEvent.registeredCount > 1 ? 's' : ''}
              {detailEvent.waitlistCount > 0
                ? ` + ${detailEvent.waitlistCount} en attente`
                : ''}
              {detailEvent.capacity !== null
                ? ` (capacité ${detailEvent.capacity})`
                : ''}
            </p>
            <div className="cf-form-actions" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="cf-btn cf-btn--primary"
                onClick={() => {
                  setMemberSearch('');
                  setMemberPickerOpen(true);
                }}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  person_add
                </span>
                Inscrire un adhérent
              </button>
              <button
                type="button"
                className="cf-btn"
                onClick={() => exportAttendeesCsv(detailEvent)}
                disabled={detailEvent.registrations.length === 0}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  download
                </span>
                Export émargement CSV
              </button>
            </div>
            {memberPickerOpen ? (
              <div className="cf-registration-picker">
                <input
                  type="search"
                  className="cf-input"
                  placeholder="Rechercher un adhérent…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  autoFocus
                />
                <ul className="cf-registration-picker__list">
                  {(() => {
                    const q = memberSearch.trim().toLowerCase();
                    const alreadyMemberIds = new Set(
                      detailEvent.registrations
                        .filter((r) => r.status !== 'CANCELLED' && r.memberId)
                        .map((r) => r.memberId as string),
                    );
                    const matches = (membersData?.clubMembers ?? [])
                      .filter((m) => !alreadyMemberIds.has(m.id))
                      .filter((m) => {
                        if (!q) return true;
                        const name = `${m.firstName} ${m.lastName}`.toLowerCase();
                        return (
                          name.includes(q) ||
                          (m.email ?? '').toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 20);
                    if (matches.length === 0) {
                      return (
                        <li className="cf-muted">Aucun adhérent trouvé.</li>
                      );
                    }
                    return matches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="cf-btn cf-btn--ghost cf-registration-picker__item"
                          disabled={registering}
                          onClick={() => void onAdminRegisterMember(m.id)}
                        >
                          {m.firstName} {m.lastName}
                          {m.email ? (
                            <span className="cf-muted"> · {m.email}</span>
                          ) : null}
                        </button>
                      </li>
                    ));
                  })()}
                </ul>
                <button
                  type="button"
                  className="cf-btn"
                  onClick={() => {
                    setMemberPickerOpen(false);
                    setMemberSearch('');
                  }}
                >
                  Fermer
                </button>
              </div>
            ) : null}
            <ul className="cf-registration-list">
              {detailEvent.registrations.length === 0 ? (
                <li className="cf-muted">Aucune inscription pour l’instant.</li>
              ) : (
                detailEvent.registrations.map((r) => (
                  <li
                    key={r.id}
                    className={`cf-registration${
                      r.status === 'CANCELLED'
                        ? ' cf-registration--cancelled'
                        : ''
                    }`}
                  >
                    <span className="cf-registration__name">
                      {r.displayName ?? '—'}
                    </span>
                    <span
                      className={`cf-pill cf-pill--${
                        r.status === 'REGISTERED'
                          ? 'ok'
                          : r.status === 'WAITLISTED'
                            ? 'warn'
                            : 'muted'
                      }`}
                    >
                      {r.status === 'REGISTERED'
                        ? 'Confirmé'
                        : r.status === 'WAITLISTED'
                          ? 'En attente'
                          : 'Annulé'}
                    </span>
                    {r.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost cf-btn--sm"
                        onClick={() => void onAdminCancelRegistration(r.id)}
                      >
                        Annuler
                      </button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer l’événement ?"
        message={`L’événement « ${confirmDelete?.title ?? ''} » et toutes les inscriptions seront supprimés.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
