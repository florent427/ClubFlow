import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_CLUB_VOLUNTEER_HOURS_POSTING,
  CLUB_VOLUNTEER_HOURS,
  CREATE_CLUB_VOLUNTEER_HOURS,
  CREATE_CLUB_VOLUNTEER_HOURS_CATEGORY,
  DELETE_CLUB_VOLUNTEER_HOURS,
  DELETE_CLUB_VOLUNTEER_HOURS_CATEGORY,
  POST_CLUB_VOLUNTEER_HOURS,
  SET_CLUB_VOLUNTEER_HOURLY_RATE,
  SET_CLUB_VOLUNTEER_HOURS_CATEGORY_ARCHIVED,
  UPDATE_CLUB_VOLUNTEER_HOURS,
  UPDATE_CLUB_VOLUNTEER_HOURS_CATEGORY,
  VOLUNTEER_PEOPLE,
} from '../../../lib/documents';
import type {
  ClubVolunteerHoursData,
  VolunteerHours,
  VolunteerHoursCategory,
  VolunteerHoursPosting,
  VolunteerPeopleData,
} from '../../../lib/types';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';
import { formatEuro, formatFr, todayIso } from '../reconciliation/format';

/** « 1 h 30 », « 45 min », « 3 h ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** « 15,50 » ou « 15.5 » → 1550 ; vide → null ; invalide → NaN. */
export function parseEurosToCents(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace('€', '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100);
}

function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function firstDayOfMonth(): string {
  return `${todayIso().slice(0, 8)}01`;
}

type Person = { key: string; label: string; memberId: string | null; contactId: string | null };

type Draft = {
  id: string | null;
  person: string;
  workedOn: string;
  hours: string;
  minutes: string;
  categoryId: string;
  activity: string;
  rate: string;
  notes: string;
};

type CategoryDraft = { id: string | null; label: string; rate: string };

const EMPTY_DRAFT: Draft = {
  id: null,
  person: '',
  workedOn: todayIso(),
  hours: '',
  minutes: '',
  categoryId: '',
  activity: '',
  rate: '',
  notes: '',
};

/**
 * Bénévolat valorisé : les heures données au club, valorisées au taux
 * horaire, puis comptabilisées par période en contribution volontaire en
 * nature (864000 Personnel bénévole / 870000 Bénévolat). Neutre sur le
 * résultat : la valeur apparaît en pied du compte de résultat.
 */
export function VolunteerHoursPage() {
  const { showToast } = useToast();
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(todayIso());
  const { data, loading, refetch } = useQuery<ClubVolunteerHoursData>(CLUB_VOLUNTEER_HOURS, {
    variables: { from: from || null, to: to || null },
    fetchPolicy: 'cache-and-network',
  });
  const { data: peopleData } = useQuery<VolunteerPeopleData>(VOLUNTEER_PEOPLE);

  const [setRate, { loading: savingRate }] = useMutation(SET_CLUB_VOLUNTEER_HOURLY_RATE);
  const [createHours, { loading: creating }] = useMutation(CREATE_CLUB_VOLUNTEER_HOURS);
  const [updateHours, { loading: updating }] = useMutation(UPDATE_CLUB_VOLUNTEER_HOURS);
  const [deleteHours] = useMutation(DELETE_CLUB_VOLUNTEER_HOURS);
  const [postHours, { loading: posting }] = useMutation(POST_CLUB_VOLUNTEER_HOURS);
  const [cancelPosting, { loading: cancelling }] = useMutation(
    CANCEL_CLUB_VOLUNTEER_HOURS_POSTING,
  );
  const [createCategory, { loading: creatingCategory }] = useMutation(
    CREATE_CLUB_VOLUNTEER_HOURS_CATEGORY,
  );
  const [updateCategory, { loading: updatingCategory }] = useMutation(
    UPDATE_CLUB_VOLUNTEER_HOURS_CATEGORY,
  );
  const [setCategoryArchived] = useMutation(SET_CLUB_VOLUNTEER_HOURS_CATEGORY_ARCHIVED);
  const [deleteCategory] = useMutation(DELETE_CLUB_VOLUNTEER_HOURS_CATEGORY);

  const clubRate = data?.clubVolunteerHourlyRate ?? null;
  const [rateInput, setRateInput] = useState('');
  useEffect(() => {
    setRateInput(centsToInput(clubRate));
  }, [clubRate]);

  const categories = data?.clubVolunteerHoursCategories ?? [];
  const rows = data?.clubVolunteerHours ?? [];
  const postings = data?.clubVolunteerHoursPostings ?? [];
  const pending = rows.filter((r) => !r.postingId);
  const totals = useMemo(
    () => ({
      minutes: rows.reduce((s, r) => s + r.minutes, 0),
      cents: rows.reduce((s, r) => s + r.valueCents, 0),
      pendingCents: pending.reduce((s, r) => s + r.valueCents, 0),
      pendingMinutes: pending.reduce((s, r) => s + r.minutes, 0),
    }),
    [rows, pending],
  );
  const byVolunteer = useMemo(() => {
    const m = new Map<string, { name: string; minutes: number; cents: number }>();
    for (const r of rows) {
      const key = r.memberId ?? r.contactId ?? r.id;
      const cur = m.get(key) ?? { name: r.volunteerName, minutes: 0, cents: 0 };
      cur.minutes += r.minutes;
      cur.cents += r.valueCents;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes);
  }, [rows]);
  // Récapitulatif par type : c'est le détail que demande l'annexe.
  const byCategory = useMemo(() => {
    const m = new Map<string, { label: string; minutes: number; cents: number }>();
    for (const r of rows) {
      const label = r.categoryLabel ?? 'Sans type';
      const cur = m.get(label) ?? { label, minutes: 0, cents: 0 };
      cur.minutes += r.minutes;
      cur.cents += r.valueCents;
      m.set(label, cur);
    }
    return [...m.values()].sort((a, b) => b.cents - a.cents);
  }, [rows]);

  // Bénévoles proposables : adhérents, puis contacts qui ne sont pas déjà
  // un adhérent (un parent adhérent n'apparaît qu'une fois).
  const people = useMemo<Person[]>(() => {
    const list: Person[] = [];
    for (const m of peopleData?.clubMembers ?? []) {
      list.push({
        key: `m:${m.id}`,
        label: `${m.firstName} ${m.lastName} (adhérent)`,
        memberId: m.id,
        contactId: null,
      });
    }
    for (const c of peopleData?.clubContacts ?? []) {
      if (c.linkedMemberId) continue;
      list.push({
        key: `c:${c.id}`,
        label: `${c.firstName} ${c.lastName} (contact)`,
        memberId: null,
        contactId: c.id,
      });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [peopleData]);
  const activities = useMemo(
    () => [...new Set(rows.map((r) => r.activity))].sort((a, b) => a.localeCompare(b, 'fr')),
    [rows],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<VolunteerHoursCategory | null>(null);
  const [toDelete, setToDelete] = useState<VolunteerHours | null>(null);
  const [confirmPost, setConfirmPost] = useState(false);
  const [toCancel, setToCancel] = useState<VolunteerHoursPosting | null>(null);

  function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Erreur inattendue';
  }

  async function onSaveRate(e: FormEvent) {
    e.preventDefault();
    const cents = parseEurosToCents(rateInput);
    if (Number.isNaN(cents)) {
      showToast('Taux invalide : un montant en euros, ex. 15,50', 'error');
      return;
    }
    try {
      await setRate({ variables: { hourlyRateCents: cents } });
      showToast('Taux horaire enregistré', 'success');
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onSubmitCategory(e: FormEvent) {
    e.preventDefault();
    if (!categoryDraft) return;
    const cents = parseEurosToCents(categoryDraft.rate);
    if (cents === null || Number.isNaN(cents)) {
      showToast('Taux invalide : un montant en euros, ex. 25,00', 'error');
      return;
    }
    const input = { label: categoryDraft.label.trim(), hourlyRateCents: cents };
    try {
      if (categoryDraft.id) {
        await updateCategory({ variables: { id: categoryDraft.id, input } });
        showToast('Type modifié — le nouveau taux vaut pour les prochaines saisies', 'success');
      } else {
        await createCategory({ variables: { input } });
        showToast('Type de bénévolat ajouté', 'success');
      }
      setCategoryDraft(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onToggleArchived(c: VolunteerHoursCategory) {
    try {
      await setCategoryArchived({ variables: { id: c.id, archived: !c.archived } });
      showToast(c.archived ? 'Type réactivé' : 'Type archivé', 'success');
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDeleteCategory() {
    if (!categoryToDelete) return;
    try {
      await deleteCategory({ variables: { id: categoryToDelete.id } });
      showToast('Type supprimé', 'success');
      setCategoryToDelete(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, workedOn: to && to < todayIso() ? to : todayIso() });
  }

  function openEdit(r: VolunteerHours) {
    const person = people.find((p) =>
      r.memberId ? p.memberId === r.memberId : p.contactId === r.contactId,
    );
    setDraft({
      id: r.id,
      person: person?.label ?? '',
      workedOn: r.workedOn,
      hours: String(Math.floor(r.minutes / 60)),
      minutes: String(r.minutes % 60),
      categoryId: r.categoryId ?? '',
      activity: r.activity === r.categoryLabel ? '' : r.activity,
      rate:
        r.hourlyRateCents ===
        (categories.find((c) => c.id === r.categoryId)?.hourlyRateCents ?? clubRate)
          ? ''
          : centsToInput(r.hourlyRateCents),
      notes: r.notes ?? '',
    });
  }

  async function onSubmitDraft(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const person = people.find((p) => p.label === draft.person);
    if (!person) {
      showToast('Choisis un bénévole dans la liste', 'error');
      return;
    }
    const minutes = (Number(draft.hours) || 0) * 60 + (Number(draft.minutes) || 0);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      showToast('Durée invalide', 'error');
      return;
    }
    const rate = parseEurosToCents(draft.rate);
    if (Number.isNaN(rate)) {
      showToast('Taux invalide : un montant en euros, ex. 25,00', 'error');
      return;
    }
    const input = {
      memberId: person.memberId,
      contactId: person.contactId,
      workedOn: draft.workedOn,
      minutes,
      categoryId: draft.categoryId || null,
      activity: draft.activity.trim() || null,
      hourlyRateCents: rate,
      notes: draft.notes.trim() || null,
    };
    try {
      if (draft.id) {
        await updateHours({ variables: { id: draft.id, input } });
        showToast('Heures modifiées', 'success');
      } else {
        await createHours({ variables: { input } });
        showToast('Heures enregistrées', 'success');
      }
      setDraft(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDelete() {
    if (!toDelete) return;
    try {
      await deleteHours({ variables: { id: toDelete.id } });
      showToast('Saisie supprimée', 'success');
      setToDelete(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onPost() {
    try {
      await postHours({ variables: { input: { periodStart: from, periodEnd: to } } });
      showToast('Bénévolat comptabilisé (864 / 870)', 'success');
      setConfirmPost(false);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onCancelPosting() {
    if (!toCancel) return;
    try {
      await cancelPosting({ variables: { id: toCancel.id } });
      showToast('Comptabilisation annulée : les heures sont de nouveau modifiables', 'success');
      setToCancel(null);
      await refetch();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  const draftMinutes = draft
    ? (Number(draft.hours) || 0) * 60 + (Number(draft.minutes) || 0)
    : 0;
  const draftCategory = draft ? categories.find((c) => c.id === draft.categoryId) : undefined;
  const draftDefaultRate = draftCategory?.hourlyRateCents ?? clubRate;
  const draftRate = draft ? parseEurosToCents(draft.rate) ?? draftDefaultRate : null;
  const draftValue =
    draftRate !== null && !Number.isNaN(draftRate) && draftMinutes > 0
      ? Math.round((draftMinutes * draftRate) / 60)
      : null;

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Comptabilité</p>
        <h1 className="members-loom__title">Bénévolat valorisé</h1>
        <p className="members-loom__lede">
          Les heures données au club par ses bénévoles, valorisées au taux
          de leur type (enseignement, secrétariat, aide aux événements…), puis
          comptabilisées en contribution volontaire en nature
          (864 Personnel bénévole / 870 Bénévolat). Le résultat ne change pas :
          la valeur apparaît en pied du compte de résultat, et sert aux
          dossiers de subvention.
        </p>
      </header>

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
            Types de bénévolat et taux horaires
          </h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCategoryDraft({ id: null, label: '', rate: '' })}
          >
            Ajouter un type
          </button>
        </div>
        <p className="cf-muted" style={{ marginTop: 8 }}>
          La valeur d’une heure dépend de l’aide apportée : le coût de
          remplacement d’une prestation équivalente. Par exemple : aide aux
          événements au SMIC, secrétariat, enseignement par un éducateur
          qualifié, encadrement technique spécialisé. Les taux élevés doivent
          pouvoir se justifier (grille salariale, coût employeur, tarif
          professionnel) ; indique la méthode dans l’annexe des comptes.
        </p>
        {categories.length === 0 ? (
          <p className="cf-muted">
            Aucun type de bénévolat. Ajoute-en un par nature d’aide, chacun
            avec son taux.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Taux</th>
                <th style={{ textAlign: 'right' }}>Saisies</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} style={c.archived ? { opacity: 0.55 } : undefined}>
                  <td>
                    <strong>{c.label}</strong>
                    {c.archived ? (
                      <span className="cf-pill" style={{ marginLeft: 8 }}>
                        Archivé
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(c.hourlyRateCents)}/h</td>
                  <td style={{ textAlign: 'right' }}>{c.hoursCount}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() =>
                          setCategoryDraft({
                            id: c.id,
                            label: c.label,
                            rate: centsToInput(c.hourlyRateCents),
                          })
                        }
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => void onToggleArchived(c)}
                      >
                        {c.archived ? 'Réactiver' : 'Archiver'}
                      </button>
                      {c.hoursCount === 0 ? (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setCategoryToDelete(c)}
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form
          className="cf-form-row"
          onSubmit={onSaveRate}
          style={{ alignItems: 'flex-end', marginTop: 12 }}
        >
          <label className="cf-field" style={{ maxWidth: 260 }}>
            <span>Taux d’une saisie sans type (€ / heure)</span>
            <input
              inputMode="decimal"
              value={rateInput}
              placeholder="ex. 15,00"
              onChange={(e) => setRateInput(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={savingRate}>
            Enregistrer
          </button>
        </form>
        <p className="cf-muted" style={{ marginTop: 8 }}>
          Un nouveau taux ne s’applique qu’aux prochaines saisies : les heures
          déjà saisies gardent leur valeur. Le taux reste modifiable sur
          chaque saisie.
        </p>
      </section>

      <section className="members-panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="cf-form-row" style={{ alignItems: 'flex-end' }}>
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
            <button type="button" className="btn-primary" onClick={openNew}>
              Ajouter des heures
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={pending.length === 0 || !from || !to}
              onClick={() => setConfirmPost(true)}
            >
              Comptabiliser la période…
            </button>
          </div>
        </div>

        <p style={{ margin: '12px 0' }}>
          <span className="cf-pill">
            {formatDuration(totals.minutes)} · {formatEuro(totals.cents)}
          </span>{' '}
          {pending.length > 0 ? (
            <span className="cf-pill cf-pill--warn">
              À comptabiliser : {formatDuration(totals.pendingMinutes)} ·{' '}
              {formatEuro(totals.pendingCents)}
            </span>
          ) : null}
        </p>

        {loading && rows.length === 0 ? (
          <p className="cf-muted">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="cf-muted">
            Aucune heure saisie sur cette période. « Ajouter des heures » pour
            enregistrer l’encadrement d’un cours, une buvette, une compétition…
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Bénévole</th>
                <th>Type / activité</th>
                <th style={{ textAlign: 'right' }}>Durée</th>
                <th style={{ textAlign: 'right' }}>Taux</th>
                <th style={{ textAlign: 'right' }}>Valeur</th>
                <th>Statut</th>
                <th style={{ width: 170 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatFr(r.workedOn)}</td>
                  <td>
                    <strong>{r.volunteerName}</strong>
                  </td>
                  <td>
                    {r.categoryLabel ? <strong>{r.categoryLabel}</strong> : r.activity}
                    {r.categoryLabel && r.activity !== r.categoryLabel ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {r.activity}
                      </small>
                    ) : null}
                    {r.notes ? (
                      <small className="cf-muted" style={{ display: 'block' }}>
                        {r.notes}
                      </small>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatDuration(r.minutes)}</td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(r.hourlyRateCents)}/h</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatEuro(r.valueCents)}
                  </td>
                  <td>
                    {r.postingId ? (
                      <span className="cf-pill cf-pill--ok">Comptabilisée</span>
                    ) : (
                      <span className="cf-pill">À comptabiliser</span>
                    )}
                  </td>
                  <td>
                    {r.postingId ? null : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => openEdit(r)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setToDelete(r)}
                        >
                          Supprimer
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

      {byCategory.length > 0 ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Par type de bénévolat (période)</h2>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Heures</th>
                <th style={{ textAlign: 'right' }}>Valeur</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td style={{ textAlign: 'right' }}>{formatDuration(c.minutes)}</td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(c.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {byVolunteer.length > 1 ? (
        <section className="members-panel">
          <h2 className="members-panel__h">Par bénévole (période)</h2>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Bénévole</th>
                <th style={{ textAlign: 'right' }}>Heures</th>
                <th style={{ textAlign: 'right' }}>Valeur</th>
              </tr>
            </thead>
            <tbody>
              {byVolunteer.map((v) => (
                <tr key={v.name}>
                  <td>{v.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatDuration(v.minutes)}</td>
                  <td style={{ textAlign: 'right' }}>{formatEuro(v.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="members-panel">
        <h2 className="members-panel__h">Comptabilisations</h2>
        {postings.length === 0 ? (
          <p className="cf-muted">
            Aucune comptabilisation. « Comptabiliser la période » crée une
            écriture 864 / 870 datée du dernier jour, une ligne par type de bénévolat.
          </p>
        ) : (
          <table className="cf-table">
            <thead>
              <tr>
                <th>Période</th>
                <th>Saisies</th>
                <th style={{ textAlign: 'right' }}>Heures</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Écriture</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {postings.map((p) => (
                <tr key={p.id}>
                  <td>
                    {formatFr(p.periodStart)} → {formatFr(p.periodEnd)}
                  </td>
                  <td>{p.hoursCount}</td>
                  <td style={{ textAlign: 'right' }}>{formatDuration(p.totalMinutes)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatEuro(p.totalCents)}
                  </td>
                  <td>
                    {p.entryStatus === 'LOCKED' ? (
                      <span className="cf-pill">Clôturée</span>
                    ) : (
                      <span className="cf-pill cf-pill--ok">Comptabilisée</span>
                    )}
                  </td>
                  <td>
                    {p.entryStatus === 'LOCKED' ? null : (
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => setToCancel(p)}
                      >
                        Annuler…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Modifier des heures' : 'Ajouter des heures'}
        footer={
          <div className="cf-drawer-foot">
            <span className="cf-muted" style={{ marginRight: 'auto' }}>
              {draftValue !== null ? `Valeur : ${formatEuro(draftValue)}` : ''}
            </span>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="cf-volunteer-hours"
              className="btn-primary"
              disabled={creating || updating}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        {draft ? (
          <form id="cf-volunteer-hours" onSubmit={onSubmitDraft} className="cf-form">
            <label className="cf-field">
              <span>Bénévole *</span>
              <input
                list="cf-volunteer-people"
                value={draft.person}
                placeholder="Tape un nom…"
                onChange={(e) => setDraft({ ...draft, person: e.target.value })}
              />
              <datalist id="cf-volunteer-people">
                {people.map((p) => (
                  <option key={p.key} value={p.label} />
                ))}
              </datalist>
            </label>
            <div className="cf-form-row">
              <label className="cf-field" style={{ flex: 2 }}>
                <span>Date *</span>
                <input
                  type="date"
                  value={draft.workedOn}
                  onChange={(e) => setDraft({ ...draft, workedOn: e.target.value })}
                />
              </label>
              <label className="cf-field" style={{ flex: 1 }}>
                <span>Heures</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={draft.hours}
                  onChange={(e) => setDraft({ ...draft, hours: e.target.value })}
                />
              </label>
              <label className="cf-field" style={{ flex: 1 }}>
                <span>Minutes</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  value={draft.minutes}
                  onChange={(e) => setDraft({ ...draft, minutes: e.target.value })}
                />
              </label>
            </div>
            <label className="cf-field">
              <span>Type de bénévolat</span>
              <select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              >
                <option value="">— Sans type (taux du club) —</option>
                {categories
                  .filter((c) => !c.archived || c.id === draft.categoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} — {formatEuro(c.hourlyRateCents)}/h
                    </option>
                  ))}
              </select>
            </label>
            <label className="cf-field">
              <span>{draft.categoryId ? 'Précision (facultatif)' : 'Activité *'}</span>
              <input
                list="cf-volunteer-activities"
                value={draft.activity}
                maxLength={120}
                placeholder="ex. Cours enfants du mercredi"
                onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
              />
              <datalist id="cf-volunteer-activities">
                {activities.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
            <label className="cf-field">
              <span>Taux horaire (€ / h)</span>
              <input
                inputMode="decimal"
                value={draft.rate}
                placeholder={
                  draftDefaultRate !== null
                    ? `${centsToInput(draftDefaultRate)} (${draftCategory ? 'taux du type' : 'taux du club'})`
                    : 'Aucun taux : choisis un type'
                }
                onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
              />
            </label>
            <label className="cf-field">
              <span>Notes</span>
              <textarea
                rows={2}
                maxLength={500}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
          </form>
        ) : null}
      </Drawer>

      <Drawer
        open={categoryDraft !== null}
        onClose={() => setCategoryDraft(null)}
        title={categoryDraft?.id ? 'Modifier le type de bénévolat' : 'Nouveau type de bénévolat'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setCategoryDraft(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="cf-volunteer-category"
              className="btn-primary"
              disabled={creatingCategory || updatingCategory}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        {categoryDraft ? (
          <form id="cf-volunteer-category" onSubmit={onSubmitCategory} className="cf-form">
            <label className="cf-field">
              <span>Type *</span>
              <input
                value={categoryDraft.label}
                maxLength={120}
                placeholder="ex. Enseignement du karaté par un éducateur qualifié"
                onChange={(e) => setCategoryDraft({ ...categoryDraft, label: e.target.value })}
              />
            </label>
            <label className="cf-field">
              <span>Taux horaire (€ / h) *</span>
              <input
                inputMode="decimal"
                value={categoryDraft.rate}
                placeholder="ex. 25,00"
                onChange={(e) => setCategoryDraft({ ...categoryDraft, rate: e.target.value })}
              />
            </label>
            {categoryDraft.id ? (
              <p className="cf-muted">
                Le nouveau taux vaut pour les prochaines saisies ; les heures
                déjà saisies gardent leur valeur.
              </p>
            ) : null}
          </form>
        ) : null}
      </Drawer>

      <ConfirmModal
        open={categoryToDelete !== null}
        title="Supprimer ce type de bénévolat ?"
        message={categoryToDelete ? `« ${categoryToDelete.label} » n’a aucune saisie.` : undefined}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDeleteCategory()}
        onCancel={() => setCategoryToDelete(null)}
      />

      <ConfirmModal
        open={toDelete !== null}
        title="Supprimer cette saisie ?"
        message={
          toDelete
            ? `${toDelete.volunteerName} — ${toDelete.activity}, ${formatDuration(toDelete.minutes)} le ${formatFr(toDelete.workedOn)}.`
            : undefined
        }
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmModal
        open={confirmPost}
        title="Comptabiliser le bénévolat de la période ?"
        message={`Du ${formatFr(from)} au ${formatFr(to)} : ${pending.length} saisie(s), ${formatDuration(totals.pendingMinutes)}, ${formatEuro(totals.pendingCents)}. Une écriture 864 / 870 sera passée au ${formatFr(to)} ; les heures ne seront plus modifiables, sauf en annulant la comptabilisation.`}
        confirmLabel="Comptabiliser"
        loading={posting}
        onConfirm={() => void onPost()}
        onCancel={() => setConfirmPost(false)}
      />

      <ConfirmModal
        open={toCancel !== null}
        title="Annuler cette comptabilisation ?"
        message={
          toCancel
            ? `L’écriture du ${formatFr(toCancel.periodStart)} au ${formatFr(toCancel.periodEnd)} (${formatEuro(toCancel.totalCents)}) sera annulée et ses ${toCancel.hoursCount} saisie(s) redeviendront modifiables.`
            : undefined
        }
        confirmLabel="Annuler la comptabilisation"
        danger
        loading={cancelling}
        onConfirm={() => void onCancelPosting()}
        onCancel={() => setToCancel(null)}
      />
    </>
  );
}
