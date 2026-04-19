import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addDays } from 'date-fns/addDays';
import { eachDayOfInterval } from 'date-fns/eachDayOfInterval';
import { startOfMonth } from 'date-fns/startOfMonth';
import { startOfWeek } from 'date-fns/startOfWeek';
import { CourseSlotDetailModal } from '../components/planning/CourseSlotDetailModal';
import { PlanningMonthView } from '../components/planning/PlanningMonthView';
import { PlanningTimeGrid } from '../components/planning/PlanningTimeGrid';
import { useToast } from '../components/ToastProvider';
import {
  CLUB_COURSE_SLOTS,
  CLUB_DYNAMIC_GROUPS,
  CLUB_MEMBERS,
  CLUB_VENUES,
  CREATE_CLUB_COURSE_SLOT,
  CREATE_CLUB_VENUE,
  DELETE_CLUB_COURSE_SLOT,
  UPDATE_CLUB_COURSE_SLOT,
} from '../lib/documents';
import { snapInstantToUtcQuarterHour } from '../lib/planning-calendar';
import type {
  CourseSlotsQueryData,
  DynamicGroupsQueryData,
  MembersQueryData,
  VenuesQueryData,
} from '../lib/types';
import {
  usePlanningCalendarSearchParams,
  type PlanningView,
} from '../planning/usePlanningCalendarSearchParams';

/**
 * Recommandation UX #7 — Duplication de créneaux
 * Ajout d'un bouton « Dupliquer » sur chaque ligne de créneau qui
 * pré-remplit le formulaire de création avec les valeurs du créneau source.
 */

function formatSlotRange(startsAt: string, endsAt: string): string {
  try {
    const a = new Date(startsAt);
    const b = new Date(endsAt);
    return (
      a.toLocaleString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }) +
      ' — ' +
      b.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    );
  } catch {
    return '—';
  }
}

/** Convertit une date ISO en valeur datetime-local (YYYY-MM-DDTHH:mm). */
function toLocalDatetime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export function PlanningPage() {
  const { showToast } = useToast();
  const {
    view,
    pivotDate,
    setView,
    setPivotDate,
    goNext,
    goPrev,
    goToday,
  } = usePlanningCalendarSearchParams();

  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [slotTitle, setSlotTitle] = useState('');
  const [slotVenueId, setSlotVenueId] = useState('');
  const [slotCoachId, setSlotCoachId] = useState('');
  const [slotStarts, setSlotStarts] = useState('');
  const [slotEnds, setSlotEnds] = useState('');
  const [slotGroupId, setSlotGroupId] = useState('');
  const [slotRepeatWeeks, setSlotRepeatWeeks] = useState('1');
  const [formError, setFormError] = useState<string | null>(null);

  /** Indique qu'on est en mode duplication (pré-remplissage). */
  const [dupSource, setDupSource] = useState<string | null>(null);

  /** Fiche créneau (double-clic sur le calendrier). */
  const [slotDetailId, setSlotDetailId] = useState<string | null>(null);

  const { data: venuesData, refetch: refetchVenues } =
    useQuery<VenuesQueryData>(CLUB_VENUES);
  const { data: slotsData, refetch: refetchSlots } =
    useQuery<CourseSlotsQueryData>(CLUB_COURSE_SLOTS);
  const { data: membersData } = useQuery<MembersQueryData>(CLUB_MEMBERS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const [createVenue, { loading: creatingVenue }] = useMutation(
    CREATE_CLUB_VENUE,
    {
      onCompleted: () => {
        setVenueName('');
        setVenueAddress('');
        setFormError(null);
        void refetchVenues();
      },
      onError: (e) => setFormError(e.message),
    },
  );

  const [createSlot, { loading: creatingSlot }] = useMutation(
    CREATE_CLUB_COURSE_SLOT,
    {
      onCompleted: () => {
        setSlotTitle('');
        setSlotStarts('');
        setSlotEnds('');
        setSlotGroupId('');
        setDupSource(null);
        setFormError(null);
        void refetchSlots();
      },
      onError: (e) => {
        setFormError(e.message);
        showToast(e.message, 'error');
      },
    },
  );

  const [updateSlot] = useMutation(UPDATE_CLUB_COURSE_SLOT, {
    onCompleted: () => void refetchSlots(),
    onError: (e) => showToast(e.message, 'error'),
  });

  const [deleteSlot] = useMutation(DELETE_CLUB_COURSE_SLOT, {
    onCompleted: () => void refetchSlots(),
    onError: (e) => setFormError(e.message),
  });

  const coaches = useMemo(() => {
    const list = membersData?.clubMembers ?? [];
    return list.filter((m) => m.roles.includes('COACH'));
  }, [membersData]);

  const slots = slotsData?.clubCourseSlots ?? [];

  const detailSlot = useMemo(
    () =>
      slotDetailId ? slots.find((s) => s.id === slotDetailId) ?? null : null,
    [slots, slotDetailId],
  );

  const memberNameById = useMemo(() => {
    const members = membersData?.clubMembers ?? [];
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, `${x.firstName} ${x.lastName}`);
    }
    return m;
  }, [membersData]);

  const venueNameById = useMemo(() => {
    const venues = venuesData?.clubVenues ?? [];
    const m = new Map<string, string>();
    for (const v of venues) m.set(v.id, v.name);
    return m;
  }, [venuesData]);

  const groupNameById = useMemo(() => {
    const groups = groupsData?.clubDynamicGroups ?? [];
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groupsData]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(pivotDate, { weekStartsOn: 1 });
    const end = addDays(start, 6);
    return eachDayOfInterval({ start, end });
  }, [pivotDate]);

  const monthPivot = useMemo(() => startOfMonth(pivotDate), [pivotDate]);

  const onSlotTimeChange = useCallback(
    (slotId: string, next: { startsAt: string; endsAt: string }) => {
      void updateSlot({
        variables: {
          input: {
            id: slotId,
            startsAt: next.startsAt,
            endsAt: next.endsAt,
          },
        },
      });
    },
    [updateSlot],
  );

  /** Pré-remplit le formulaire avec les valeurs d'un créneau existant. */
  function duplicateSlot(slotId: string) {
    const source = slots.find((s) => s.id === slotId);
    if (!source) return;
    setSlotTitle(source.title + ' (copie)');
    setSlotVenueId(source.venueId);
    setSlotCoachId(source.coachMemberId);
    setSlotStarts(toLocalDatetime(source.startsAt));
    setSlotEnds(toLocalDatetime(source.endsAt));
    setSlotGroupId(source.dynamicGroupId ?? '');
    setDupSource(source.title);
    setFormError(null);
    document.getElementById('slot-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  function clearDuplication() {
    setSlotTitle('');
    setSlotStarts('');
    setSlotEnds('');
    setSlotGroupId('');
    setDupSource(null);
  }

  async function onCreateVenue(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!venueName.trim()) {
      setFormError('Nom du lieu obligatoire.');
      return;
    }
    await createVenue({
      variables: {
        input: {
          name: venueName.trim(),
          addressLine: venueAddress.trim() || undefined,
        },
      },
    });
  }

  async function onCreateSlot(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!slotTitle.trim() || !slotVenueId || !slotCoachId || !slotStarts || !slotEnds) {
      setFormError('Titre, lieu, professeur et horaires sont obligatoires.');
      return;
    }
    let starts = new Date(slotStarts);
    let ends = new Date(slotEnds);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setFormError('Dates invalides.');
      return;
    }
    starts = snapInstantToUtcQuarterHour(starts);
    ends = snapInstantToUtcQuarterHour(ends);
    if (ends <= starts) {
      setFormError('La fin doit être après le début (durée minimale 15 min).');
      return;
    }
    const weeks = Math.max(1, Math.min(52, parseInt(slotRepeatWeeks, 10) || 1));
    const occurrences: { starts: Date; ends: Date }[] = [];
    for (let i = 0; i < weeks; i++) {
      const s = new Date(starts.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const e = new Date(ends.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      occurrences.push({ starts: s, ends: e });
    }
    try {
      for (const occ of occurrences) {
        await createSlot({
          variables: {
            input: {
              venueId: slotVenueId,
              coachMemberId: slotCoachId,
              title: slotTitle.trim(),
              startsAt: occ.starts.toISOString(),
              endsAt: occ.ends.toISOString(),
              dynamicGroupId: slotGroupId || undefined,
            },
          },
        });
      }
      if (weeks > 1) {
        showToast(`${weeks} créneaux créés`, 'success');
      }
      setSlotRepeatWeeks('1');
    } catch {
      // error already shown via onError handler
    }
  }

  function viewLabel(v: PlanningView): string {
    if (v === 'month') return 'Mois';
    if (v === 'week') return 'Semaine';
    return 'Jour';
  }

  return (
    <div className="members-loom">
      <CourseSlotDetailModal
        open={detailSlot !== null}
        onClose={() => setSlotDetailId(null)}
        slot={detailSlot}
        venueLabel={
          detailSlot
            ? venueNameById.get(detailSlot.venueId) ?? detailSlot.venueId
            : ''
        }
        coachLabel={
          detailSlot
            ? memberNameById.get(detailSlot.coachMemberId) ??
              detailSlot.coachMemberId
            : ''
        }
        groupLabel={
          detailSlot?.dynamicGroupId
            ? groupNameById.get(detailSlot.dynamicGroupId) ?? null
            : null
        }
        timeRangeLabel={
          detailSlot
            ? formatSlotRange(detailSlot.startsAt, detailSlot.endsAt)
            : ''
        }
        onDuplicate={() => {
          if (detailSlot) duplicateSlot(detailSlot.id);
        }}
        onDelete={() => {
          if (detailSlot) void deleteSlot({ variables: { id: detailSlot.id } });
        }}
      />
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Planning</p>
        <h1 className="members-loom__title">Lieux et créneaux cours</h1>
        <p className="members-loom__lede">
          Calendrier : déplacez et redimensionnez les créneaux (pas de 15 min,
          validation UTC côté serveur). Les professeurs sont des membres actifs
          avec le rôle <strong>COACH</strong>.
        </p>
      </header>

      <div className="planning-toolbar">
        <div className="planning-toolbar__views" role="tablist" aria-label="Vue calendrier">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`btn btn-tight${view === v ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => setView(v)}
            >
              {viewLabel(v)}
            </button>
          ))}
        </div>
        <div className="planning-toolbar__nav">
          <button type="button" className="btn btn-ghost btn-tight" onClick={goPrev}>
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <button type="button" className="btn btn-ghost btn-tight" onClick={goToday}>
            Aujourd’hui
          </button>
          <button type="button" className="btn btn-ghost btn-tight" onClick={goNext}>
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      <section className="planning-calendar-shell members-panel">
        {view === 'month' ? (
          <PlanningMonthView
            monthPivot={monthPivot}
            slots={slots}
            onSelectDay={(d) => {
              setPivotDate(d);
              setView('week');
            }}
          />
        ) : (
          <PlanningTimeGrid
            days={view === 'day' ? [pivotDate] : weekDays}
            slots={slots}
            coachNameById={memberNameById}
            venueNameById={venueNameById}
            groupNameById={groupNameById}
            onSlotTimeChange={onSlotTimeChange}
            onSlotOpen={(id) => setSlotDetailId(id)}
            onDayHeaderClick={
              view === 'week'
                ? (d) => {
                    setPivotDate(d);
                    setView('day');
                  }
                : undefined
            }
          />
        )}
      </section>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Liste des créneaux</h2>
          {formError ? <p className="form-error">{formError}</p> : null}
          {slots.length === 0 ? (
            <p className="muted">Aucun créneau. Ajoutez un lieu puis un cours.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Cours</th>
                    <th>Lieu</th>
                    <th>Professeur</th>
                    <th>Horaire</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="members-table__name">{s.title}</span>
                        {s.dynamicGroupId ? (
                          <span className="members-table__sub">Groupe lié</span>
                        ) : null}
                      </td>
                      <td>{venueNameById.get(s.venueId) ?? s.venueId}</td>
                      <td>
                        {memberNameById.get(s.coachMemberId) ?? s.coachMemberId}
                      </td>
                      <td>{formatSlotRange(s.startsAt, s.endsAt)}</td>
                      <td>
                        <div className="planning-slot-actions">
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            title="Dupliquer ce créneau"
                            onClick={() => duplicateSlot(s.id)}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '1rem' }}
                            >
                              content_copy
                            </span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-tight"
                            onClick={() => {
                              if (confirm('Supprimer ce créneau ?')) {
                                void deleteSlot({ variables: { id: s.id } });
                              }
                            }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="members-panel members-panel--aside">
          <h2 className="members-panel__h">Nouveau lieu</h2>
          <form className="members-form" onSubmit={(e) => void onCreateVenue(e)}>
            <label className="field">
              <span>Nom</span>
              <input
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="Dojo principal"
                required
              />
            </label>
            <label className="field">
              <span>Adresse (optionnel)</span>
              <input
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary members-form__submit"
              disabled={creatingVenue}
            >
              {creatingVenue ? 'Création…' : 'Ajouter le lieu'}
            </button>
          </form>

          <h2 className="members-panel__h" style={{ marginTop: '1.5rem' }} id="slot-form">
            {dupSource ? 'Dupliquer un créneau' : 'Nouveau créneau'}
          </h2>

          {dupSource ? (
            <div className="planning-dup-banner">
              <span className="material-symbols-outlined">content_copy</span>
              Pré-rempli depuis « {dupSource} »
              <button type="button" onClick={clearDuplication}>
                Annuler
              </button>
            </div>
          ) : null}

          <form className="members-form" onSubmit={(e) => void onCreateSlot(e)}>
            <label className="field">
              <span>Titre</span>
              <input
                value={slotTitle}
                onChange={(e) => setSlotTitle(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Lieu</span>
              <select
                value={slotVenueId}
                onChange={(e) => setSlotVenueId(e.target.value)}
                required
              >
                <option value="">— Choisir —</option>
                {(venuesData?.clubVenues ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Professeur (COACH)</span>
              <select
                value={slotCoachId}
                onChange={(e) => setSlotCoachId(e.target.value)}
                required
              >
                <option value="">— Choisir —</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </label>
            {coaches.length === 0 ? (
              <p className="muted">
                Aucun professeur.{' '}
                <Link to="/members" className="cf-link">
                  Ouvrez un membre
                </Link>{' '}
                et cochez le rôle système <strong>COACH</strong> dans les rôles.
              </p>
            ) : null}
            <label className="field">
              <span>Début</span>
              <input
                type="datetime-local"
                value={slotStarts}
                onChange={(e) => setSlotStarts(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Fin</span>
              <input
                type="datetime-local"
                value={slotEnds}
                onChange={(e) => setSlotEnds(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Groupe dynamique (optionnel)</span>
              <select
                value={slotGroupId}
                onChange={(e) => setSlotGroupId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {(groupsData?.clubDynamicGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Répéter chaque semaine pendant (1–52)</span>
              <input
                type="number"
                min={1}
                max={52}
                value={slotRepeatWeeks}
                onChange={(e) => setSlotRepeatWeeks(e.target.value)}
              />
              <small className="muted">
                1 = pas de répétition. Crée une occurrence par semaine à la même
                heure.
              </small>
            </label>
            <button
              type="submit"
              className="btn btn-primary members-form__submit"
              disabled={creatingSlot || (venuesData?.clubVenues ?? []).length === 0}
            >
              {creatingSlot
                ? 'Création…'
                : dupSource
                  ? 'Créer la copie'
                  : parseInt(slotRepeatWeeks, 10) > 1
                    ? `Créer ${parseInt(slotRepeatWeeks, 10)} créneaux`
                    : 'Créer le créneau'}
            </button>
            {(venuesData?.clubVenues ?? []).length === 0 ? (
              <p className="muted">Créez d'abord un lieu.</p>
            ) : null}
          </form>
        </aside>
      </div>
    </div>
  );
}
