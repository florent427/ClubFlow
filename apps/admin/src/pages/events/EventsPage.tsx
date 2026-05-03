import { useMutation, useQuery } from '@apollo/client/react';
import { useState, useMemo, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ADMIN_CANCEL_EVENT_REGISTRATION,
  ADMIN_REGISTER_MEMBER_TO_EVENT,
  CANCEL_CLUB_EVENT,
  CLUB_DYNAMIC_GROUPS,
  CLUB_EVENTS,
  CLUB_MEMBERS,
  CREATE_CLUB_EVENT,
  DELETE_CLUB_EVENT,
  PUBLISH_CLUB_EVENT,
  SEND_CLUB_EVENT_CONVOCATION,
  UPDATE_CLUB_EVENT,
} from '../../lib/documents';
import type {
  ClubEvent,
  ClubEventAttachment,
  ClubEventsQueryData,
  ClubEventStatusStr,
  DynamicGroupsQueryData,
  EventConvocationMode,
  MembersQueryData,
  SendClubEventConvocationMutationData,
} from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';
import { downloadCsv, toCsv } from '../../lib/csv-export';
import { getClubId, getToken } from '../../lib/storage';

/** Racine REST dérivée de l'URL GraphQL (pour l'upload/download des pièces jointes). */
const API_ROOT = (
  (import.meta as unknown as { env?: { VITE_GRAPHQL_HTTP?: string } }).env
    ?.VITE_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql'
).replace(/\/graphql\/?$/, '');

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function attachmentIconFor(mime: string): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'picture_as_pdf';
  return 'attach_file';
}

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
  const { data: groupsData } =
    useQuery<DynamicGroupsQueryData>(CLUB_DYNAMIC_GROUPS);
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
  const [sendConvocation, { loading: sendingConvocation }] = useMutation(
    SEND_CLUB_EVENT_CONVOCATION,
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ClubEvent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [confirmDelete, setConfirmDelete] = useState<ClubEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<ClubEvent | null>(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [convocationOpen, setConvocationOpen] = useState(false);
  const [convocationMode, setConvocationMode] =
    useState<EventConvocationMode>('REGISTERED');
  const [convocationGroupId, setConvocationGroupId] = useState<string>('');
  const [convocationSubject, setConvocationSubject] = useState('');
  const [convocationBody, setConvocationBody] = useState('');

  async function uploadAttachment(eventId: string, file: File) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('Fichier trop volumineux (max 10 Mo)', 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_ROOT}/events/${eventId}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-club-id': clubId,
        },
        body: fd,
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(msg || `Erreur HTTP ${res.status}`);
      }
      showToast('Pièce jointe ajoutée', 'success');
      const refreshed = await refetch();
      // Resync drawer state with freshly-hydrated event
      const updated = refreshed.data?.clubEvents?.find((ev) => ev.id === eventId);
      if (updated && detailEvent?.id === eventId) setDetailEvent(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur upload', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function downloadAttachment(eventId: string, att: ClubEventAttachment) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée', 'error');
      return;
    }
    try {
      const res = await fetch(
        `${API_ROOT}/events/${eventId}/attachments/${att.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-club-id': clubId,
          },
        },
      );
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur téléchargement',
        'error',
      );
    }
  }

  async function deleteAttachment(eventId: string, att: ClubEventAttachment) {
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      showToast('Session expirée', 'error');
      return;
    }
    if (
      !window.confirm(
        `Supprimer la pièce jointe « ${att.fileName} » ?`,
      )
    )
      return;
    try {
      const res = await fetch(
        `${API_ROOT}/events/${eventId}/attachments/${att.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-club-id': clubId,
          },
        },
      );
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
      showToast('Pièce jointe supprimée', 'success');
      const refreshed = await refetch();
      const updated = refreshed.data?.clubEvents?.find((ev) => ev.id === eventId);
      if (updated && detailEvent?.id === eventId) setDetailEvent(updated);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erreur', 'error');
    }
  }

  function onFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !detailEvent) return;
    void uploadAttachment(detailEvent.id, file);
  }

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

  function openConvocationModal(ev: ClubEvent) {
    setDetailEvent(ev);
    const defaultSubject = `Convocation : ${ev.title}`;
    const whenFr = new Date(ev.startsAt).toLocaleString('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const lines = [
      'Bonjour,',
      '',
      `Vous êtes convié(e) à l’événement « ${ev.title} ».`,
      '',
      `Date : ${whenFr}`,
    ];
    if (ev.location) lines.push(`Lieu : ${ev.location}`);
    if (ev.description) lines.push('', ev.description);
    lines.push('', 'À bientôt,');
    setConvocationMode('REGISTERED');
    setConvocationGroupId('');
    setConvocationSubject(defaultSubject);
    setConvocationBody(lines.join('\n'));
    setConvocationOpen(true);
  }

  async function onSendConvocation(e: FormEvent) {
    e.preventDefault();
    if (!detailEvent) return;
    if (convocationMode === 'DYNAMIC_GROUP' && !convocationGroupId) {
      showToast('Choisissez un groupe dynamique', 'error');
      return;
    }
    try {
      const res = await sendConvocation({
        variables: {
          input: {
            eventId: detailEvent.id,
            mode: convocationMode,
            dynamicGroupId:
              convocationMode === 'DYNAMIC_GROUP' ? convocationGroupId : null,
            subject: convocationSubject.trim() || null,
            body: convocationBody.trim() || null,
          },
        },
      });
      const r = (res.data as SendClubEventConvocationMutationData | null)
        ?.sendClubEventConvocation;
      if (r) {
        const bits: string[] = [`${r.sent}/${r.totalTargets} envoyé(s)`];
        if (r.suppressed > 0) bits.push(`${r.suppressed} supprimé(s)`);
        if (r.skipped > 0) bits.push(`${r.skipped} ignoré(s)`);
        if (r.failed > 0) bits.push(`${r.failed} en échec`);
        showToast(
          `Convocation — ${bits.join(' · ')}`,
          r.failed > 0 ? 'error' : 'success',
        );
      } else {
        showToast('Convocation envoyée', 'success');
      }
      setConvocationOpen(false);
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
            <span className="cf-field__label">
              Description / Programme détaillé
            </span>
            <textarea
              className="cf-input cf-textarea"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={10}
              maxLength={10000}
              placeholder={
                "Programme, itinéraire, horaires précis, matériel à prévoir, consignes de sécurité…\n\nCe texte apparaît tel quel sur la fiche événement et dans les convocations envoyées par e-mail."
              }
            />
            <span className="cf-field__hint">
              {form.description.length} / 10 000 caractères. Retours à la ligne conservés.
            </span>
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
        title={detailEvent ? `Détails : ${detailEvent.title}` : ''}
        onClose={() => setDetailEvent(null)}
        width={620}
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

            <section className="cf-event-attachments">
              <header className="cf-event-attachments__header">
                <h3>Pièces jointes</h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={onFilePicked}
                />
                <button
                  type="button"
                  className="cf-btn cf-btn--primary cf-btn--sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    upload_file
                  </span>
                  {uploading ? 'Envoi…' : 'Ajouter un fichier'}
                </button>
              </header>
              {detailEvent.attachments.length === 0 ? (
                <p className="cf-muted">
                  Aucune pièce jointe. PDF et images (max 10 Mo) acceptés.
                </p>
              ) : (
                <ul className="cf-event-attachments__list">
                  {detailEvent.attachments.map((a) => (
                    <li key={a.id} className="cf-event-attachments__item">
                      <span
                        className="material-symbols-outlined cf-event-attachments__icon"
                        aria-hidden
                      >
                        {attachmentIconFor(a.mimeType)}
                      </span>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost cf-event-attachments__name"
                        onClick={() =>
                          void downloadAttachment(detailEvent.id, a)
                        }
                        title={`${a.fileName} — ${fmtSize(a.sizeBytes)}`}
                      >
                        {a.fileName}
                      </button>
                      <span className="cf-muted cf-event-attachments__size">
                        {fmtSize(a.sizeBytes)}
                      </span>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost cf-btn--sm cf-event-attachments__delete"
                        onClick={() =>
                          void deleteAttachment(detailEvent.id, a)
                        }
                        aria-label={`Supprimer ${a.fileName}`}
                      >
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          delete
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
              <button
                type="button"
                className="cf-btn"
                onClick={() => openConvocationModal(detailEvent)}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  mail
                </span>
                Envoyer une convocation
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

      <Drawer
        open={convocationOpen}
        title={
          detailEvent
            ? `Convocation : ${detailEvent.title}`
            : 'Envoyer une convocation'
        }
        onClose={() => setConvocationOpen(false)}
        width={620}
      >
        {detailEvent ? (
          <form
            onSubmit={(e) => void onSendConvocation(e)}
            className="cf-form"
          >
            <fieldset className="cf-field">
              <span className="cf-field__label">Audience</span>
              <label className="cf-radio">
                <input
                  type="radio"
                  name="cf-convocation-mode"
                  checked={convocationMode === 'REGISTERED'}
                  onChange={() => setConvocationMode('REGISTERED')}
                />
                <span>
                  Inscrits uniquement ({detailEvent.registeredCount}
                  {detailEvent.waitlistCount > 0
                    ? ` + ${detailEvent.waitlistCount} en attente`
                    : ''}
                  )
                </span>
              </label>
              <label className="cf-radio">
                <input
                  type="radio"
                  name="cf-convocation-mode"
                  checked={convocationMode === 'ALL_MEMBERS'}
                  onChange={() => setConvocationMode('ALL_MEMBERS')}
                />
                <span>Tous les adhérents actifs (diffusion)</span>
              </label>
              <label className="cf-radio">
                <input
                  type="radio"
                  name="cf-convocation-mode"
                  checked={convocationMode === 'DYNAMIC_GROUP'}
                  onChange={() => setConvocationMode('DYNAMIC_GROUP')}
                />
                <span>Groupe dynamique ciblé</span>
              </label>
            </fieldset>
            {convocationMode === 'DYNAMIC_GROUP' ? (
              <label className="cf-field">
                <span className="cf-field__label">Groupe dynamique</span>
                <select
                  className="cf-input"
                  value={convocationGroupId}
                  onChange={(e) => setConvocationGroupId(e.target.value)}
                  required
                >
                  <option value="">— Choisir un groupe —</option>
                  {(groupsData?.clubDynamicGroups ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {g.matchingActiveMembersCount} membres
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="cf-field">
              <span className="cf-field__label">Objet</span>
              <input
                type="text"
                className="cf-input"
                value={convocationSubject}
                onChange={(e) => setConvocationSubject(e.target.value)}
                maxLength={200}
                placeholder="Auto-généré si laissé vide"
              />
            </label>
            <label className="cf-field">
              <span className="cf-field__label">Message</span>
              <textarea
                className="cf-input cf-textarea"
                value={convocationBody}
                onChange={(e) => setConvocationBody(e.target.value)}
                rows={12}
                maxLength={20000}
                placeholder="Auto-généré si laissé vide"
              />
              <span className="cf-field__hint">
                {convocationBody.length} / 20 000 caractères · e-mail texte
                brut, retours à la ligne conservés.
              </span>
            </label>
            <div className="cf-form-actions">
              <button
                type="button"
                className="cf-btn"
                onClick={() => setConvocationOpen(false)}
                disabled={sendingConvocation}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="cf-btn cf-btn--primary"
                disabled={sendingConvocation}
              >
                <span className="material-symbols-outlined" aria-hidden>
                  send
                </span>
                {sendingConvocation ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
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
