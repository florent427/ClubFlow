import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CANCEL_CLUB_VOLUNTEER_HOURS_POSTING,
  CLUB_VOLUNTEER_HOURS,
  CREATE_CLUB_VOLUNTEER_HOURS,
  DELETE_CLUB_VOLUNTEER_HOURS,
  POST_CLUB_VOLUNTEER_HOURS,
  SET_CLUB_VOLUNTEER_HOURLY_RATE,
  UPDATE_CLUB_VOLUNTEER_HOURS,
  VOLUNTEER_PEOPLE,
} from '../../../lib/documents';
import type {
  ClubVolunteerHoursData,
  VolunteerHours,
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
  activity: string;
  rate: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  person: '',
  workedOn: todayIso(),
  hours: '',
  minutes: '',
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

  const clubRate = data?.clubVolunteerHourlyRate ?? null;
  const [rateInput, setRateInput] = useState('');
  useEffect(() => {
    setRateInput(centsToInput(clubRate));
  }, [clubRate]);

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
      activity: r.activity,
      rate: r.hourlyRateCents === clubRate ? '' : centsToInput(r.hourlyRateCents),
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
      activity: draft.activity.trim(),
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
  const draftRate = draft ? parseEurosToCents(draft.rate) ?? clubRate : null;
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
          horaire, puis comptabilisées en contribution volontaire en nature
          (864 Personnel bénévole / 870 Bénévolat). Le résultat ne change pas :
          la valeur apparaît en pied du compte de résultat, et sert aux
          dossiers de subvention.
        </p>
      </header>

      <section className="members-panel">
        <h2 className="members-panel__h">Taux horaire du club</h2>
        <form className="cf-form-row" onSubmit={onSaveRate} style={{ alignItems: 'flex-end' }}>
          <label className="cf-field" style={{ maxWidth: 220 }}>
            <span>Taux par défaut (€ / heure)</span>
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
          Usage courant : SMIC horaire brut chargé, ou le taux d’un salarié
          équivalent pour un encadrant qualifié (taux modifiable sur chaque
          saisie). Indique la méthode retenue dans l’annexe des comptes. Un
          nouveau taux ne s’applique qu’aux prochaines saisies.
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
                <th>Activité</th>
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
                    {r.activity}
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
            écriture 864 / 870 datée du dernier jour, une ligne par activité.
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
              <span>Activité *</span>
              <input
                list="cf-volunteer-activities"
                value={draft.activity}
                maxLength={120}
                placeholder="ex. Encadrement des cours enfants"
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
                  clubRate !== null ? `${centsToInput(clubRate)} (taux du club)` : 'Aucun taux club'
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
