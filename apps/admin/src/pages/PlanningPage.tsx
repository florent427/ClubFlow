import { useMutation, useQuery } from '@apollo/client/react';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { addDays } from 'date-fns/addDays';
import { eachDayOfInterval } from 'date-fns/eachDayOfInterval';
import { startOfMonth } from 'date-fns/startOfMonth';
import { startOfWeek } from 'date-fns/startOfWeek';
import {
  CourseSlotDetailModal,
  type CourseSlotDraft,
} from '../components/planning/CourseSlotDetailModal';
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

// Fonction historique utilisée par l'ancienne table de créneaux supprimée
// lors de la refonte v2. Conservée commentée en cas de réintroduction
// d'une vue liste dans un futur onglet :
// function formatSlotRange(startsAt: string, endsAt: string): string { ... }

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

  /** Création via drawer/modal (au lieu du form aside permanent historique). */
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [slotDrawerOpen, setSlotDrawerOpen] = useState(false);

  /** Recherche + filtres affichés dans la toolbar du calendrier. */
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCoachId, setFilterCoachId] = useState('');
  const [filterVenueId, setFilterVenueId] = useState('');

  /**
   * Modal édition/création.
   * - mode 'edit'  : double-clic sur un créneau existant
   * - mode 'create': double-clic sur une cellule vide du calendrier
   */
  const [slotModalMode, setSlotModalMode] = useState<'edit' | 'create' | null>(
    null,
  );
  const [slotModalInitial, setSlotModalInitial] =
    useState<CourseSlotDraft | null>(null);

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
        setVenueModalOpen(false);
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

  /** Filtre actif ? Utilisé par la toolbar pour afficher un bouton "Réinitialiser". */
  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    filterCoachId !== '' ||
    filterVenueId !== '';

  /**
   * Slots affichés après application de la recherche texte et des filtres
   * coach/lieu. La grille calendrier et la vue mois consomment le résultat
   * filtré — on garde ainsi une lecture ciblée sans toucher au backend.
   */
  const filteredSlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return slots.filter((s) => {
      if (filterCoachId && s.coachMemberId !== filterCoachId) return false;
      if (filterVenueId && s.venueId !== filterVenueId) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [slots, searchQuery, filterCoachId, filterVenueId]);

  /** KPIs visibles dans le header — compte sur la semaine pivot courante. */
  const kpis = useMemo(() => {
    const weekStart = startOfWeek(pivotDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);
    const coursesThisWeek = slots.filter((s) => {
      const d = new Date(s.startsAt);
      return d >= weekStart && d < weekEnd;
    }).length;
    const coachesThisWeek = new Set(
      slots
        .filter((s) => {
          const d = new Date(s.startsAt);
          return d >= weekStart && d < weekEnd;
        })
        .map((s) => s.coachMemberId),
    ).size;
    return {
      coursesThisWeek,
      coachesThisWeek,
      venues: venuesData?.clubVenues?.length ?? 0,
    };
  }, [slots, pivotDate, venuesData]);

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

  /** Pré-remplit le formulaire avec les valeurs d'un créneau existant
   * puis ouvre le drawer de création. */
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
    setSlotDrawerOpen(true);
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
      } else {
        showToast('Créneau créé', 'success');
      }
      setSlotRepeatWeeks('1');
      setSlotDrawerOpen(false);
    } catch {
      // error already shown via onError handler
    }
  }

  function openSlotDrawer() {
    clearDuplication();
    setSlotDrawerOpen(true);
  }

  function viewLabel(v: PlanningView): string {
    if (v === 'month') return 'Mois';
    if (v === 'week') return 'Semaine';
    return 'Jour';
  }

  /** Ouvre la modale en édition à partir d'un slot existant. */
  function openEditModal(slotId: string) {
    const source = slots.find((s) => s.id === slotId);
    if (!source) return;
    setSlotModalInitial({
      id: source.id,
      title: source.title,
      venueId: source.venueId,
      coachMemberId: source.coachMemberId,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      dynamicGroupId: source.dynamicGroupId ?? null,
      bookingEnabled: source.bookingEnabled ?? false,
      bookingCapacity: source.bookingCapacity ?? null,
    });
    setSlotModalMode('edit');
  }

  /**
   * Ouvre la modale en création avec un slot d'1h pré-rempli
   * à `day` + `hour:minute` (clic sur cellule vide).
   */
  function openCreateModal(day: Date, hour: number, minute: number) {
    const starts = new Date(day);
    starts.setHours(hour, minute, 0, 0);
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    // Pré-sélectionne le premier lieu disponible (cas courant : 1 seul lieu).
    const firstVenue = venuesData?.clubVenues?.[0]?.id ?? '';
    // Pré-sélectionne le premier coach disponible.
    const firstCoach = coaches[0]?.id ?? '';
    setSlotModalInitial({
      title: '',
      venueId: firstVenue,
      coachMemberId: firstCoach,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      dynamicGroupId: null,
      bookingEnabled: false,
      bookingCapacity: null,
    });
    setSlotModalMode('create');
  }

  function closeSlotModal() {
    setSlotModalMode(null);
    setSlotModalInitial(null);
  }

  /** Sauvegarde (create ou update) selon le mode en cours. */
  async function onSaveSlot(draft: CourseSlotDraft) {
    if (slotModalMode === 'create') {
      await createSlot({
        variables: {
          input: {
            venueId: draft.venueId,
            coachMemberId: draft.coachMemberId,
            title: draft.title,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            dynamicGroupId: draft.dynamicGroupId ?? undefined,
            bookingEnabled: draft.bookingEnabled,
            bookingCapacity: draft.bookingEnabled
              ? draft.bookingCapacity
              : undefined,
          },
        },
      });
      showToast('Créneau créé', 'success');
    } else if (slotModalMode === 'edit' && draft.id) {
      await updateSlot({
        variables: {
          input: {
            id: draft.id,
            venueId: draft.venueId,
            coachMemberId: draft.coachMemberId,
            title: draft.title,
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            dynamicGroupId: draft.dynamicGroupId,
            bookingEnabled: draft.bookingEnabled,
            bookingCapacity: draft.bookingEnabled
              ? draft.bookingCapacity
              : null,
          },
        },
      });
      showToast('Créneau modifié', 'success');
    }
  }

  return (
    <div className="members-loom planning-v2">
      {/* ═══ Modal édition créneau existant (drag sur grille → clic) ═══ */}
      <CourseSlotDetailModal
        open={slotModalMode !== null}
        onClose={closeSlotModal}
        mode={slotModalMode ?? 'edit'}
        initial={slotModalInitial}
        venues={venuesData?.clubVenues ?? []}
        coaches={membersData?.clubMembers ?? []}
        groups={groupsData?.clubDynamicGroups ?? []}
        onSave={onSaveSlot}
        onDuplicate={
          slotModalMode === 'edit' && slotModalInitial?.id
            ? () => {
                if (slotModalInitial?.id) duplicateSlot(slotModalInitial.id);
              }
            : undefined
        }
        onDelete={
          slotModalMode === 'edit' && slotModalInitial?.id
            ? () => {
                const id = slotModalInitial?.id;
                if (id) void deleteSlot({ variables: { id } });
              }
            : undefined
        }
      />

      {/* ═══ Modal création lieu ═══ */}
      {venueModalOpen ? (
        <>
          <div
            className="cf-modal-backdrop"
            role="presentation"
            onClick={() => setVenueModalOpen(false)}
          />
          <div
            className="cf-modal cf-modal--confirm planning-venue-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planning-venue-title"
          >
            <h2 id="planning-venue-title" className="cf-modal-title">
              <span className="material-symbols-outlined" aria-hidden>
                location_on
              </span>
              Nouveau lieu
            </h2>
            {formError ? (
              <p className="form-error">{formError}</p>
            ) : null}
            <form
              className="members-form"
              onSubmit={(e) => void onCreateVenue(e)}
            >
              <label className="field">
                <span>Nom</span>
                <input
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  placeholder="Dojo principal"
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Adresse (optionnel)</span>
                <input
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  placeholder="12 rue du sport, 75000 Paris"
                />
              </label>
              <div className="cf-modal-actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--ghost"
                  onClick={() => setVenueModalOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="cf-btn cf-btn--primary"
                  disabled={creatingVenue}
                >
                  {creatingVenue ? 'Création…' : 'Ajouter le lieu'}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}

      {/* ═══ Drawer création créneau ═══ */}
      {slotDrawerOpen ? (
        <>
          <div
            className="family-drawer-backdrop"
            role="presentation"
            onClick={() => setSlotDrawerOpen(false)}
          />
          <aside
            className="family-drawer planning-slot-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planning-slot-drawer-title"
          >
            <header className="family-drawer__head member-drawer__head">
              <div className="member-drawer__hero">
                <span
                  className="member-drawer__avatar member-drawer__avatar--empty"
                  aria-hidden
                >
                  <span className="material-symbols-outlined">
                    add_circle
                  </span>
                </span>
                <div className="member-drawer__hero-text">
                  <p className="members-loom__eyebrow">Planning</p>
                  <h2
                    className="family-drawer__title"
                    id="planning-slot-drawer-title"
                  >
                    {dupSource ? 'Dupliquer un créneau' : 'Nouveau créneau'}
                  </h2>
                  {dupSource ? (
                    <p className="cf-text-muted" style={{ margin: 0 }}>
                      Pré-rempli depuis «&nbsp;{dupSource}&nbsp;»
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="member-drawer__icon-btn member-drawer__icon-btn--close"
                onClick={() => setSlotDrawerOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                <span className="material-symbols-outlined" aria-hidden>
                  close
                </span>
              </button>
            </header>

            <form
              className="members-form family-drawer__section"
              onSubmit={(e) => void onCreateSlot(e)}
            >
              {formError ? (
                <p className="form-error">{formError}</p>
              ) : null}
              {dupSource ? (
                <div className="planning-dup-banner">
                  <span className="material-symbols-outlined" aria-hidden>
                    content_copy
                  </span>
                  <span>Copie de « {dupSource} »</span>
                  <button type="button" onClick={clearDuplication}>
                    Annuler
                  </button>
                </div>
              ) : null}
              <label className="field">
                <span>Titre du cours</span>
                <input
                  value={slotTitle}
                  onChange={(e) => setSlotTitle(e.target.value)}
                  placeholder="Ex. Karaté enfants ceinture blanche"
                  required
                  autoFocus
                />
              </label>
              <div className="cf-form__row">
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
                  <span>Professeur</span>
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
              </div>
              {coaches.length === 0 ? (
                <p className="cf-text-muted">
                  Aucun professeur.{' '}
                  <Link to="/members" className="cf-link">
                    Ouvrez un membre
                  </Link>{' '}
                  et cochez le rôle système <strong>COACH</strong>.
                </p>
              ) : null}
              <div className="cf-form__row">
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
              </div>
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
                <small className="cf-text-muted">
                  1 = pas de répétition. Crée une occurrence hebdomadaire à la
                  même heure.
                </small>
              </label>
              <div className="cf-form__actions">
                <button
                  type="button"
                  className="cf-btn cf-btn--ghost"
                  onClick={() => setSlotDrawerOpen(false)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="cf-btn cf-btn--primary"
                  disabled={
                    creatingSlot ||
                    (venuesData?.clubVenues ?? []).length === 0
                  }
                >
                  {creatingSlot
                    ? 'Création…'
                    : dupSource
                      ? 'Créer la copie'
                      : parseInt(slotRepeatWeeks, 10) > 1
                        ? `Créer ${parseInt(slotRepeatWeeks, 10)} créneaux`
                        : 'Créer le créneau'}
                </button>
              </div>
              {(venuesData?.clubVenues ?? []).length === 0 ? (
                <p className="cf-text-warning">
                  Créez d&rsquo;abord un lieu (bouton «&nbsp;+ Lieu&nbsp;»
                  dans l&rsquo;entête).
                </p>
              ) : null}
            </form>
          </aside>
        </>
      ) : null}

      {/* ═══ Hero : titre + CTAs ═══ */}
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">Module Planning</p>
            <h1 className="members-loom__title">Planning sportif</h1>
            <p className="members-loom__lede">
              Glisser-déposer pour déplacer un créneau (pas de 15&nbsp;min).
              Cliquer sur une cellule vide pour créer, ou utiliser le bouton
              «&nbsp;Nouveau créneau&nbsp;». Les professeurs sont les membres
              avec le rôle <strong>COACH</strong>.
            </p>
          </div>
          <div className="members-hero__ctas">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => setVenueModalOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden>
                location_on
              </span>
              Nouveau lieu
            </button>
            <button
              type="button"
              className="cf-btn cf-btn--primary members-hero__cta"
              onClick={openSlotDrawer}
              disabled={(venuesData?.clubVenues ?? []).length === 0}
              title={
                (venuesData?.clubVenues ?? []).length === 0
                  ? 'Créez d’abord un lieu'
                  : 'Créer un nouveau créneau'
              }
            >
              <span className="material-symbols-outlined" aria-hidden>
                add
              </span>
              Nouveau créneau
            </button>
          </div>
        </div>
      </header>

      {/* ═══ KPI row ═══ */}
      {slots.length > 0 ? (
        <div className="members-kpis planning-kpis">
          <div className="members-kpi">
            <span className="members-kpi__label">Cours cette semaine</span>
            <span className="members-kpi__value">{kpis.coursesThisWeek}</span>
            <span className="members-kpi__hint">
              semaine du{' '}
              {startOfWeek(pivotDate, { weekStartsOn: 1 }).toLocaleDateString(
                'fr-FR',
                { day: '2-digit', month: 'short' },
              )}
            </span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Coaches mobilisés</span>
            <span className="members-kpi__value">{kpis.coachesThisWeek}</span>
            <span className="members-kpi__hint">
              sur {coaches.length} professeur{coaches.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Lieux</span>
            <span className="members-kpi__value">{kpis.venues}</span>
            <span className="members-kpi__hint">
              configurés dans ce club
            </span>
          </div>
          <div className="members-kpi">
            <span className="members-kpi__label">Total créneaux</span>
            <span className="members-kpi__value">{slots.length}</span>
            <span className="members-kpi__hint">
              toutes dates confondues
            </span>
          </div>
        </div>
      ) : null}

      {/* ═══ Toolbar : vue + navigation ═══ */}
      <div className="planning-toolbar">
        <div
          className="cf-segmented"
          role="tablist"
          aria-label="Vue calendrier"
        >
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={`cf-segmented__btn${view === v ? ' cf-segmented__btn--active' : ''}`}
              onClick={() => setView(v)}
            >
              {viewLabel(v)}
            </button>
          ))}
        </div>
        <div className="planning-toolbar__nav" role="group" aria-label="Navigation temporelle">
          <button
            type="button"
            className="cf-btn cf-btn--ghost cf-btn--sm"
            onClick={goPrev}
            aria-label="Période précédente"
          >
            <span className="material-symbols-outlined" aria-hidden>
              chevron_left
            </span>
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--ghost cf-btn--sm"
            onClick={goToday}
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--ghost cf-btn--sm"
            onClick={goNext}
            aria-label="Période suivante"
          >
            <span className="material-symbols-outlined" aria-hidden>
              chevron_right
            </span>
          </button>
        </div>
      </div>

      {/* ═══ Filter bar : recherche + coach + lieu ═══ */}
      <div className="cf-toolbar planning-filters">
        <label className="field planning-filters__search">
          <span>Rechercher un cours</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Titre du cours…"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Coach</span>
          <select
            value={filterCoachId}
            onChange={(e) => setFilterCoachId(e.target.value)}
          >
            <option value="">Tous les coaches</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Lieu</span>
          <select
            value={filterVenueId}
            onChange={(e) => setFilterVenueId(e.target.value)}
          >
            <option value="">Tous les lieux</option>
            {(venuesData?.clubVenues ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilter ? (
          <button
            type="button"
            className="cf-btn cf-btn--ghost cf-btn--sm planning-filters__reset"
            onClick={() => {
              setSearchQuery('');
              setFilterCoachId('');
              setFilterVenueId('');
            }}
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
            Réinitialiser ({filteredSlots.length}/{slots.length})
          </button>
        ) : null}
      </div>

      {/* ═══ Calendar full-width ═══ */}
      <section className="planning-calendar-shell planning-calendar-shell--full">
        {view === 'month' ? (
          <PlanningMonthView
            monthPivot={monthPivot}
            slots={filteredSlots}
            onSelectDay={(d) => {
              setPivotDate(d);
              setView('week');
            }}
          />
        ) : (
          <PlanningTimeGrid
            days={view === 'day' ? [pivotDate] : weekDays}
            slots={filteredSlots}
            coachNameById={memberNameById}
            venueNameById={venueNameById}
            groupNameById={groupNameById}
            onSlotTimeChange={onSlotTimeChange}
            onSlotOpen={(id) => openEditModal(id)}
            onCellClick={(d, h, m) => openCreateModal(d, h, m)}
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

      {/* ═══ Empty state global : aucun lieu configuré ═══ */}
      {(venuesData?.clubVenues ?? []).length === 0 && slots.length === 0 ? (
        <div className="cf-alert cf-alert--info" role="status">
          <span className="material-symbols-outlined" aria-hidden>
            info
          </span>
          <div className="cf-alert__content">
            <strong>Commencez par créer un lieu</strong>
            <span>
              Un lieu (dojo, gymnase…) est nécessaire avant de pouvoir
              planifier un créneau. Cliquez sur «&nbsp;Nouveau lieu&nbsp;»
              dans l’entête.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
