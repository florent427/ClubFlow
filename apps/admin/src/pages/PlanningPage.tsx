import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  CLUB_COURSE_SLOTS,
  CLUB_DYNAMIC_GROUPS,
  CLUB_MEMBERS,
  CLUB_VENUES,
  CREATE_CLUB_COURSE_SLOT,
  CREATE_CLUB_VENUE,
  DELETE_CLUB_COURSE_SLOT,
} from '../lib/documents';
import type {
  CourseSlotsQueryData,
  DynamicGroupsQueryData,
  MembersQueryData,
  VenuesQueryData,
} from '../lib/types';

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

export function PlanningPage() {
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [slotTitle, setSlotTitle] = useState('');
  const [slotVenueId, setSlotVenueId] = useState('');
  const [slotCoachId, setSlotCoachId] = useState('');
  const [slotStarts, setSlotStarts] = useState('');
  const [slotEnds, setSlotEnds] = useState('');
  const [slotGroupId, setSlotGroupId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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
        setFormError(null);
        void refetchSlots();
      },
      onError: (e) => setFormError(e.message),
    },
  );

  const [deleteSlot] = useMutation(DELETE_CLUB_COURSE_SLOT, {
    onCompleted: () => void refetchSlots(),
    onError: (e) => setFormError(e.message),
  });

  const coaches = useMemo(() => {
    const list = membersData?.clubMembers ?? [];
    return list.filter((m) => m.roles.includes('COACH'));
  }, [membersData]);

  const venues = venuesData?.clubVenues ?? [];
  const slots = slotsData?.clubCourseSlots ?? [];
  const groups = groupsData?.clubDynamicGroups ?? [];
  const members = membersData?.clubMembers ?? [];

  const memberNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) {
      m.set(x.id, `${x.firstName} ${x.lastName}`);
    }
    return m;
  }, [members]);

  const venueNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of venues) m.set(v.id, v.name);
    return m;
  }, [venues]);

  async function onCreateVenue(e: React.FormEvent) {
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

  async function onCreateSlot(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!slotTitle.trim() || !slotVenueId || !slotCoachId || !slotStarts || !slotEnds) {
      setFormError('Titre, lieu, professeur et horaires sont obligatoires.');
      return;
    }
    const starts = new Date(slotStarts);
    const ends = new Date(slotEnds);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
      setFormError('Dates invalides.');
      return;
    }
    await createSlot({
      variables: {
        input: {
          venueId: slotVenueId,
          coachMemberId: slotCoachId,
          title: slotTitle.trim(),
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
          dynamicGroupId: slotGroupId || undefined,
        },
      },
    });
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Planning</p>
        <h1 className="members-loom__title">Lieux et créneaux cours</h1>
        <p className="members-loom__lede">
          Créneaux avec détection des conflits professeur (chevauchement
          interdit). Les professeurs sont des membres actifs avec le rôle{' '}
          <strong>COACH</strong>.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Créneaux</h2>
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
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="members-table__name">{s.title}</span>
                        {s.dynamicGroupId ? (
                          <span className="members-table__sub">
                            Groupe lié
                          </span>
                        ) : null}
                      </td>
                      <td>{venueNameById.get(s.venueId) ?? s.venueId}</td>
                      <td>
                        {memberNameById.get(s.coachMemberId) ??
                          s.coachMemberId}
                      </td>
                      <td>{formatSlotRange(s.startsAt, s.endsAt)}</td>
                      <td>
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

          <h2 className="members-panel__h" style={{ marginTop: '1.5rem' }}>
            Nouveau créneau
          </h2>
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
                {venues.map((v) => (
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
                Aucun professeur : attribuez le rôle COACH à un membre (API /
                futur écran).
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
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn btn-primary members-form__submit"
              disabled={creatingSlot || venues.length === 0}
            >
              {creatingSlot ? 'Création…' : 'Créer le créneau'}
            </button>
            {venues.length === 0 ? (
              <p className="muted">Créez d’abord un lieu.</p>
            ) : null}
          </form>
        </aside>
      </div>
    </div>
  );
}
