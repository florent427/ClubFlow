import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ADD_CLUB_MILEAGE_RECURRING_TRIPS,
  ADD_CLUB_MILEAGE_TRIP,
  APPROVE_CLUB_MILEAGE_CLAIM,
  CLUB_MILEAGE_CLAIM,
  CLUB_MILEAGE_CLAIMS,
  CLUB_MILEAGE_RECURRING_TRIPS,
  CLUB_MILEAGE_VEHICLES,
  CREATE_CLUB_MILEAGE_CLAIM,
  CREATE_CLUB_MILEAGE_VEHICLE,
  DELETE_CLUB_MILEAGE_CLAIM,
  DELETE_CLUB_MILEAGE_TRIP,
  DELETE_CLUB_MILEAGE_VEHICLE,
  MILEAGE_MEMBERS,
  SET_CLUB_MILEAGE_VEHICLE_ARCHIVED,
  SUBMIT_CLUB_MILEAGE_CLAIM,
  UPDATE_CLUB_MILEAGE_CLAIM,
  UPDATE_CLUB_MILEAGE_VEHICLE,
} from '../../../lib/mileage-documents';
import type {
  AddClubMileageRecurringTripsData,
  ClubMileageClaimData,
  ClubMileageClaimsData,
  ClubMileageRecurringTripsData,
  ClubMileageVehiclesData,
  CreateClubMileageClaimData,
  MileageClaim,
  MileageMembersData,
  MileageSettlement,
  MileageTrip,
  MileageVehicle,
  MileageVehicleKind,
} from '../../../lib/mileage-documents';
import { useToast } from '../../../components/ToastProvider';
import { ConfirmModal, Drawer } from '../../../components/ui';
import { formatEuro, formatFr, todayIso } from '../reconciliation/format';
import { MileageClaimDetail, SettlementState } from './MileageClaimDetail';
import {
  SETTLEMENT_LABEL,
  STATUS_LABEL,
  STATUS_PILL,
  VEHICLE_KIND_LABEL,
  errorMessage,
  formatKm,
  formatWeekdays,
  kmInputToMeters,
} from './mileage-format';

type VehicleDraft = {
  id: string | null;
  label: string;
  kind: MileageVehicleKind;
  horsepower: string;
  isElectric: boolean;
};

type ClaimDraft = {
  id: string | null;
  title: string;
  settlement: MileageSettlement;
  memberNote: string;
};

type TripDraft = {
  vehicleId: string;
  tripDate: string;
  fromLabel: string;
  toLabel: string;
  purpose: string;
  km: string;
  roundTrip: boolean;
};

function firstDayOfMonth(): string {
  return `${todayIso().slice(0, 8)}01`;
}

function emptyTrip(vehicles: MileageVehicle[]): TripDraft {
  return {
    vehicleId: vehicles[0]?.id ?? '',
    tripDate: todayIso(),
    fromLabel: '',
    toLabel: '',
    purpose: '',
    km: '',
    roundTrip: true,
  };
}

/**
 * Saisie pour le compte d'un bénévole : ses véhicules, ses notes, les
 * déplacements ponctuels et le remplissage depuis ses trajets récurrents.
 */
export function MileageEntryTab() {
  const { showToast } = useToast();
  const [memberId, setMemberId] = useState('');
  const { data: membersData } = useQuery<MileageMembersData>(MILEAGE_MEMBERS);
  const members = useMemo(
    () =>
      [...(membersData?.clubMembers ?? [])].sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'),
      ),
    [membersData],
  );
  const member = members.find((m) => m.id === memberId) ?? null;

  const { data: vehiclesData, refetch: refetchVehicles } = useQuery<ClubMileageVehiclesData>(
    CLUB_MILEAGE_VEHICLES,
    {
      variables: { memberId, includeArchived: true },
      skip: !memberId,
      fetchPolicy: 'cache-and-network',
    },
  );
  const { data: recurringData } = useQuery<ClubMileageRecurringTripsData>(
    CLUB_MILEAGE_RECURRING_TRIPS,
    { variables: { memberId }, skip: !memberId, fetchPolicy: 'cache-and-network' },
  );
  const { data: claimsData, refetch: refetchClaims } = useQuery<ClubMileageClaimsData>(
    CLUB_MILEAGE_CLAIMS,
    {
      variables: { status: null, memberId },
      skip: !memberId,
      fetchPolicy: 'cache-and-network',
    },
  );

  const vehicles = memberId ? vehiclesData?.clubMileageVehicles ?? [] : [];
  const activeVehicles = vehicles.filter((v) => !v.archived);
  const recurring = memberId ? recurringData?.clubMileageRecurringTrips ?? [] : [];
  const claims = memberId ? claimsData?.clubMileageClaims ?? [] : [];

  // ── Mutations ──
  const [createVehicle, { loading: creatingVehicle }] = useMutation(CREATE_CLUB_MILEAGE_VEHICLE);
  const [updateVehicle, { loading: updatingVehicle }] = useMutation(UPDATE_CLUB_MILEAGE_VEHICLE);
  const [setVehicleArchived] = useMutation(SET_CLUB_MILEAGE_VEHICLE_ARCHIVED);
  const [deleteVehicle, { loading: deletingVehicle }] = useMutation(DELETE_CLUB_MILEAGE_VEHICLE);
  const [createClaim, { loading: creatingClaim }] =
    useMutation<CreateClubMileageClaimData>(CREATE_CLUB_MILEAGE_CLAIM);
  const [updateClaim, { loading: updatingClaim }] = useMutation(UPDATE_CLUB_MILEAGE_CLAIM);
  const [deleteClaim, { loading: deletingClaim }] = useMutation(DELETE_CLUB_MILEAGE_CLAIM);
  const [addTrip, { loading: addingTrip }] = useMutation(ADD_CLUB_MILEAGE_TRIP);
  const [deleteTrip, { loading: deletingTrip }] = useMutation(DELETE_CLUB_MILEAGE_TRIP);
  const [fillRecurring, { loading: filling }] = useMutation<AddClubMileageRecurringTripsData>(
    ADD_CLUB_MILEAGE_RECURRING_TRIPS,
  );
  const [submitClaim, { loading: submitting }] = useMutation(SUBMIT_CLUB_MILEAGE_CLAIM);
  const [approveClaim, { loading: approving }] = useMutation(APPROVE_CLUB_MILEAGE_CLAIM);

  // ── État local ──
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<MileageVehicle | null>(null);
  const [claimDraft, setClaimDraft] = useState<ClaimDraft | null>(null);
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const [claimToDelete, setClaimToDelete] = useState<MileageClaim | null>(null);
  const [tripToDelete, setTripToDelete] = useState<MileageTrip | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [trip, setTrip] = useState<TripDraft>(() => emptyTrip([]));
  const [fillFrom, setFillFrom] = useState(firstDayOfMonth());
  const [fillTo, setFillTo] = useState(todayIso());

  const { data: claimData } = useQuery<ClubMileageClaimData>(CLUB_MILEAGE_CLAIM, {
    variables: { id: openClaimId ?? '' },
    skip: !openClaimId,
    fetchPolicy: 'network-only',
  });
  const claim = openClaimId ? claimData?.clubMileageClaim ?? null : null;
  const editable = claim?.status === 'DRAFT';

  function pickMember(id: string) {
    setMemberId(id);
    setOpenClaimId(null);
  }

  // ── Véhicules ──
  async function onSubmitVehicle(e: FormEvent) {
    e.preventDefault();
    if (!vehicleDraft || !memberId) return;
    const label = vehicleDraft.label.trim();
    if (!label) {
      showToast('Donne un nom au véhicule', 'error');
      return;
    }
    let fiscalHorsepower: number | null = null;
    if (vehicleDraft.kind !== 'MOPED') {
      const cv = Number(vehicleDraft.horsepower);
      if (!Number.isInteger(cv) || cv < 1 || cv > 50) {
        showToast('Puissance fiscale invalide (en CV, voir la carte grise)', 'error');
        return;
      }
      fiscalHorsepower = cv;
    }
    const input = {
      label,
      kind: vehicleDraft.kind,
      fiscalHorsepower,
      isElectric: vehicleDraft.isElectric,
    };
    try {
      if (vehicleDraft.id) {
        await updateVehicle({ variables: { id: vehicleDraft.id, input } });
        showToast('Véhicule modifié', 'success');
      } else {
        await createVehicle({ variables: { memberId, input } });
        showToast('Véhicule ajouté', 'success');
      }
      setVehicleDraft(null);
      await refetchVehicles();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onToggleVehicle(v: MileageVehicle) {
    try {
      await setVehicleArchived({ variables: { id: v.id, archived: !v.archived } });
      showToast(v.archived ? 'Véhicule réactivé' : 'Véhicule archivé', 'success');
      await refetchVehicles();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDeleteVehicle() {
    if (!vehicleToDelete) return;
    try {
      await deleteVehicle({ variables: { id: vehicleToDelete.id } });
      showToast('Véhicule supprimé', 'success');
      setVehicleToDelete(null);
      await refetchVehicles();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  // ── Notes ──
  async function onSubmitClaimDraft(e: FormEvent) {
    e.preventDefault();
    if (!claimDraft || !memberId) return;
    const title = claimDraft.title.trim();
    if (!title) {
      showToast('Donne un titre à la note', 'error');
      return;
    }
    const input = {
      title,
      settlement: claimDraft.settlement,
      memberNote: claimDraft.memberNote.trim() || null,
    };
    try {
      if (claimDraft.id) {
        await updateClaim({ variables: { id: claimDraft.id, input } });
        showToast('Note modifiée', 'success');
      } else {
        const res = await createClaim({ variables: { memberId, input } });
        const created = res.data?.createClubMileageClaim;
        showToast('Note créée', 'success');
        if (created) {
          setTrip(emptyTrip(activeVehicles));
          setOpenClaimId(created.id);
        }
      }
      setClaimDraft(null);
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  function openClaim(id: string) {
    setTrip(emptyTrip(activeVehicles));
    setOpenClaimId(id);
  }

  async function onAddTrip(e: FormEvent) {
    e.preventDefault();
    if (!claim) return;
    const meters = kmInputToMeters(trip.km);
    if (meters === null || Number.isNaN(meters)) {
      showToast('Distance invalide : en km, ex. 12,5', 'error');
      return;
    }
    if (!trip.vehicleId) {
      showToast('Choisis un véhicule (ajoute-le d’abord s’il n’existe pas)', 'error');
      return;
    }
    if (!trip.fromLabel.trim() || !trip.toLabel.trim() || !trip.purpose.trim()) {
      showToast('Départ, arrivée et motif sont obligatoires', 'error');
      return;
    }
    try {
      await addTrip({
        variables: {
          claimId: claim.id,
          input: {
            vehicleId: trip.vehicleId,
            tripDate: trip.tripDate,
            fromLabel: trip.fromLabel.trim(),
            toLabel: trip.toLabel.trim(),
            purpose: trip.purpose.trim(),
            distanceMeters: meters,
            roundTrip: trip.roundTrip,
          },
        },
      });
      // Le formulaire reste rempli : le trajet est souvent le même d'un jour
      // à l'autre, seule la date change.
      showToast('Déplacement ajouté', 'success');
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onFillRecurring() {
    if (!claim) return;
    try {
      const res = await fillRecurring({
        variables: { claimId: claim.id, from: fillFrom, to: fillTo },
      });
      const added = res.data?.addClubMileageRecurringTrips.added ?? 0;
      showToast(
        added === 0
          ? 'Aucun déplacement à ajouter sur cette période'
          : `${added} déplacement${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`,
        added === 0 ? 'info' : 'success',
      );
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDeleteTrip() {
    if (!tripToDelete) return;
    try {
      await deleteTrip({ variables: { id: tripToDelete.id } });
      showToast('Déplacement supprimé', 'success');
      setTripToDelete(null);
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onSubmitClaim() {
    if (!claim) return;
    try {
      await submitClaim({ variables: { id: claim.id } });
      showToast('Note soumise', 'success');
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onApproveClaim() {
    if (!claim) return;
    try {
      await approveClaim({ variables: { id: claim.id } });
      showToast('Note validée', 'success');
      setConfirmApprove(false);
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  async function onDeleteClaim() {
    if (!claimToDelete) return;
    try {
      await deleteClaim({ variables: { id: claimToDelete.id } });
      showToast('Note supprimée', 'success');
      setClaimToDelete(null);
      setOpenClaimId(null);
      await refetchClaims();
    } catch (err) {
      showToast(errorMessage(err), 'error');
    }
  }

  return (
    <>
      <section className="members-panel">
        <label className="cf-field" style={{ maxWidth: 420 }}>
          <span>Bénévole</span>
          <select className="cf-field__input" value={memberId} onChange={(e) => pickMember(e.target.value)}>
            <option value="">— Choisir un membre —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.lastName} {m.firstName}
              </option>
            ))}
          </select>
        </label>
        {!memberId ? (
          <p className="cf-muted">
            Choisis le bénévole pour qui tu saisis : ses véhicules, ses notes et
            ses déplacements apparaîtront ici.
          </p>
        ) : null}
      </section>

      {member ? (
        <>
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
                Véhicules de {member.firstName} {member.lastName}
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setVehicleDraft({
                    id: null,
                    label: '',
                    kind: 'CAR',
                    horsepower: '',
                    isElectric: false,
                  })
                }
              >
                Ajouter un véhicule
              </button>
            </div>
            {vehicles.length === 0 ? (
              <p className="cf-muted">
                Aucun véhicule. La puissance fiscale (carte grise, case P.6) fixe la
                ligne du barème URSSAF.
              </p>
            ) : (
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Véhicule</th>
                    <th>Type</th>
                    <th>Puissance</th>
                    <th>Électrique</th>
                    <th style={{ width: 280 }} />
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id} style={v.archived ? { opacity: 0.6 } : undefined}>
                      <td>
                        <strong>{v.label}</strong>
                        {v.archived ? (
                          <span className="cf-pill cf-pill--muted" style={{ marginLeft: 6 }}>
                            Archivé
                          </span>
                        ) : null}
                      </td>
                      <td>{VEHICLE_KIND_LABEL[v.kind]}</td>
                      <td>{v.fiscalHorsepower ? `${v.fiscalHorsepower} CV` : '—'}</td>
                      <td>{v.isElectric ? 'Oui (+20 %)' : 'Non'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() =>
                              setVehicleDraft({
                                id: v.id,
                                label: v.label,
                                kind: v.kind,
                                horsepower: v.fiscalHorsepower ? String(v.fiscalHorsepower) : '',
                                isElectric: v.isElectric,
                              })
                            }
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => void onToggleVehicle(v)}
                          >
                            {v.archived ? 'Réactiver' : 'Archiver'}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--sm"
                            onClick={() => setVehicleToDelete(v)}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="members-panel">
            <h2 className="members-panel__h">Trajets récurrents</h2>
            {recurring.length === 0 ? (
              <p className="cf-muted">
                Aucun trajet récurrent. Le bénévole les déclare depuis son portail
                (par ex. « domicile → gymnase, lundi et jeudi »).
              </p>
            ) : (
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Trajet</th>
                    <th>Jours</th>
                    <th>Période</th>
                    <th style={{ textAlign: 'right' }}>Km (aller)</th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.fromLabel} → {r.toLabel}
                        {r.roundTrip ? ' (A/R)' : ''}
                        <small className="cf-muted" style={{ display: 'block' }}>
                          {r.purpose} · {r.vehicleLabel}
                        </small>
                      </td>
                      <td>{formatWeekdays(r.weekdays)}</td>
                      <td>
                        depuis le {formatFr(r.startsOn)}
                        {r.endsOn ? ` jusqu’au ${formatFr(r.endsOn)}` : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatKm(r.distanceMeters)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

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
                Notes de frais kilométriques
              </h2>
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  setClaimDraft({
                    id: null,
                    title: '',
                    settlement: 'REIMBURSEMENT',
                    memberNote: '',
                  })
                }
              >
                Nouvelle note
              </button>
            </div>
            {claims.length === 0 ? (
              <p className="cf-muted">Aucune note pour ce bénévole.</p>
            ) : (
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Note</th>
                    <th>Règlement</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Montant</th>
                    <th>Statut</th>
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.title}
                        <small className="cf-muted" style={{ display: 'block' }}>
                          {c.tripCount} déplacement{c.tripCount > 1 ? 's' : ''}
                          {c.firstTripDate
                            ? ` · ${formatFr(c.firstTripDate)} → ${formatFr(c.lastTripDate)}`
                            : ''}
                        </small>
                      </td>
                      <td>{SETTLEMENT_LABEL[c.settlement]}</td>
                      <td style={{ textAlign: 'right' }}>{formatKm(c.totalMeters)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatEuro(c.amountCents)}
                      </td>
                      <td>
                        <span className={STATUS_PILL[c.status]}>{STATUS_LABEL[c.status]}</span>{' '}
                        <SettlementState claim={c} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => openClaim(c.id)}
                        >
                          {c.status === 'DRAFT' ? 'Saisir' : 'Ouvrir'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}

      {/* ── Véhicule ── */}
      <Drawer
        open={vehicleDraft !== null}
        onClose={() => setVehicleDraft(null)}
        title={vehicleDraft?.id ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setVehicleDraft(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="cf-mileage-vehicle"
              className="btn-primary"
              disabled={creatingVehicle || updatingVehicle}
            >
              Enregistrer
            </button>
          </div>
        }
      >
        {vehicleDraft ? (
          <form id="cf-mileage-vehicle" onSubmit={onSubmitVehicle} className="cf-form">
            <label className="cf-field">
              <span>Nom *</span>
              <input className="cf-field__input"
                value={vehicleDraft.label}
                placeholder="Ex. Clio grise"
                maxLength={80}
                onChange={(e) => setVehicleDraft({ ...vehicleDraft, label: e.target.value })}
              />
            </label>
            <div className="cf-form-row">
              <label className="cf-field" style={{ flex: 1 }}>
                <span>Type *</span>
                <select className="cf-field__input"
                  value={vehicleDraft.kind}
                  onChange={(e) =>
                    setVehicleDraft({
                      ...vehicleDraft,
                      kind: e.target.value as MileageVehicleKind,
                    })
                  }
                >
                  {(Object.keys(VEHICLE_KIND_LABEL) as MileageVehicleKind[]).map((k) => (
                    <option key={k} value={k}>
                      {VEHICLE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {vehicleDraft.kind !== 'MOPED' ? (
                <label className="cf-field" style={{ flex: 1 }}>
                  <span>Puissance fiscale (CV) *</span>
                  <input className="cf-field__input"
                    type="number"
                    min={1}
                    max={50}
                    value={vehicleDraft.horsepower}
                    onChange={(e) =>
                      setVehicleDraft({ ...vehicleDraft, horsepower: e.target.value })
                    }
                  />
                </label>
              ) : null}
            </div>
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={vehicleDraft.isElectric}
                onChange={(e) =>
                  setVehicleDraft({ ...vehicleDraft, isElectric: e.target.checked })
                }
              />
              Véhicule électrique (barème majoré de 20 %)
            </label>
          </form>
        ) : null}
      </Drawer>

      {/* ── Création / modification d'une note ── */}
      <Drawer
        open={claimDraft !== null}
        onClose={() => setClaimDraft(null)}
        title={claimDraft?.id ? 'Modifier la note' : 'Nouvelle note de frais kilométriques'}
        footer={
          <div className="cf-drawer-foot">
            <button type="button" className="btn-ghost" onClick={() => setClaimDraft(null)}>
              Annuler
            </button>
            <button
              type="submit"
              form="cf-mileage-claim"
              className="btn-primary"
              disabled={creatingClaim || updatingClaim}
            >
              {claimDraft?.id ? 'Enregistrer' : 'Créer la note'}
            </button>
          </div>
        }
      >
        {claimDraft ? (
          <form id="cf-mileage-claim" onSubmit={onSubmitClaimDraft} className="cf-form">
            <label className="cf-field">
              <span>Titre *</span>
              <input className="cf-field__input"
                value={claimDraft.title}
                placeholder="Ex. Déplacements de septembre"
                onChange={(e) => setClaimDraft({ ...claimDraft, title: e.target.value })}
              />
            </label>
            <label className="cf-field">
              <span>Règlement *</span>
              <select className="cf-field__input"
                value={claimDraft.settlement}
                onChange={(e) =>
                  setClaimDraft({
                    ...claimDraft,
                    settlement: e.target.value as MileageSettlement,
                  })
                }
              >
                <option value="REIMBURSEMENT">Remboursement au bénévole</option>
                <option value="DONATION">Abandon en don (reçu fiscal)</option>
              </select>
            </label>
            <p className="cf-muted" style={{ margin: 0 }}>
              {claimDraft.settlement === 'DONATION'
                ? 'Le bénévole renonce au remboursement : la note devient un don, qui ouvre droit à un reçu fiscal (Cerfa 11580).'
                : 'Une fois validée, la note rejoint ce que le club doit au bénévole (« Frais bénévoles »).'}
            </p>
            <label className="cf-field">
              <span>Note du bénévole</span>
              <textarea className="cf-field__input"
                rows={3}
                value={claimDraft.memberNote}
                onChange={(e) => setClaimDraft({ ...claimDraft, memberNote: e.target.value })}
              />
            </label>
          </form>
        ) : null}
      </Drawer>

      {/* ── Saisie des déplacements d'une note ── */}
      <Drawer
        open={openClaimId !== null && claimDraft === null}
        onClose={() => setOpenClaimId(null)}
        width={760}
        title={claim ? `${claim.title} — ${claim.memberName}` : 'Note de frais kilométriques'}
        footer={
          claim ? (
            <div className="cf-drawer-foot">
              <span className="cf-muted" style={{ marginRight: 'auto' }}>
                {formatEuro(claim.amountCents)}
                {claim.estimated ? ' (estimation)' : ''}
              </span>
              {editable ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setClaimToDelete(claim)}
                  >
                    Supprimer la note
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setClaimDraft({
                        id: claim.id,
                        title: claim.title,
                        settlement: claim.settlement,
                        memberNote: claim.memberNote ?? '',
                      })
                    }
                  >
                    Modifier l’en-tête
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submitting || claim.tripCount === 0}
                    onClick={() => void onSubmitClaim()}
                  >
                    Soumettre
                  </button>
                </>
              ) : null}
              {claim.status === 'SUBMITTED' ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setConfirmApprove(true)}
                >
                  Valider
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {claim ? (
          <>
            <MileageClaimDetail
              claim={claim}
              onDeleteTrip={editable ? (t) => setTripToDelete(t) : undefined}
            />
            {claim.status === 'SUBMITTED' ? (
              <p className="cf-muted">
                Pour corriger une note soumise, renvoie-la en brouillon depuis
                l’onglet « Notes à valider ».
              </p>
            ) : null}
            {editable ? (
              <>
                <h3 className="members-panel__h" style={{ marginTop: 20 }}>
                  Ajouter un déplacement ponctuel
                </h3>
                {activeVehicles.length === 0 ? (
                  <p className="cf-muted">
                    Ajoute d’abord un véhicule à ce bénévole (section « Véhicules »).
                  </p>
                ) : (
                  <form onSubmit={onAddTrip} className="cf-form">
                    <div className="cf-form-row">
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Date *</span>
                        <input className="cf-field__input"
                          type="date"
                          value={trip.tripDate}
                          max={todayIso()}
                          onChange={(e) => setTrip({ ...trip, tripDate: e.target.value })}
                        />
                      </label>
                      <label className="cf-field" style={{ flex: 2 }}>
                        <span>Véhicule *</span>
                        <select className="cf-field__input"
                          value={trip.vehicleId}
                          onChange={(e) => setTrip({ ...trip, vehicleId: e.target.value })}
                        >
                          {activeVehicles.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="cf-form-row">
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Départ *</span>
                        <input className="cf-field__input"
                          value={trip.fromLabel}
                          placeholder="Ex. Domicile, Saint-Denis"
                          onChange={(e) => setTrip({ ...trip, fromLabel: e.target.value })}
                        />
                      </label>
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Arrivée *</span>
                        <input className="cf-field__input"
                          value={trip.toLabel}
                          placeholder="Ex. Gymnase, Saint-Pierre"
                          onChange={(e) => setTrip({ ...trip, toLabel: e.target.value })}
                        />
                      </label>
                    </div>
                    <div className="cf-form-row">
                      <label className="cf-field" style={{ flex: 2 }}>
                        <span>Motif *</span>
                        <input className="cf-field__input"
                          value={trip.purpose}
                          placeholder="Ex. Compétition régionale"
                          onChange={(e) => setTrip({ ...trip, purpose: e.target.value })}
                        />
                      </label>
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Distance aller (km) *</span>
                        <input className="cf-field__input"
                          inputMode="decimal"
                          value={trip.km}
                          placeholder="12,5"
                          onChange={(e) => setTrip({ ...trip, km: e.target.value })}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label className="cf-checkbox">
                        <input
                          type="checkbox"
                          checked={trip.roundTrip}
                          onChange={(e) => setTrip({ ...trip, roundTrip: e.target.checked })}
                        />
                        Aller-retour
                      </label>
                      <button
                        type="submit"
                        className="btn-primary"
                        style={{ marginLeft: 'auto' }}
                        disabled={addingTrip}
                      >
                        Ajouter le déplacement
                      </button>
                    </div>
                  </form>
                )}

                <h3 className="members-panel__h" style={{ marginTop: 20 }}>
                  Remplir depuis les trajets récurrents
                </h3>
                {recurring.filter((r) => !r.archived).length === 0 ? (
                  <p className="cf-muted">Ce bénévole n’a aucun trajet récurrent actif.</p>
                ) : (
                  <div className="cf-form">
                    <p className="cf-muted" style={{ margin: 0 }}>
                      Ajoute un déplacement pour chaque jour prévu par ses trajets
                      récurrents (trois mois au plus, jusqu’à aujourd’hui). Les jours
                      déjà saisis ne sont pas doublés.
                    </p>
                    <div className="cf-form-row" style={{ alignItems: 'flex-end' }}>
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Du</span>
                        <input className="cf-field__input"
                          type="date"
                          value={fillFrom}
                          onChange={(e) => setFillFrom(e.target.value)}
                        />
                      </label>
                      <label className="cf-field" style={{ flex: 1 }}>
                        <span>Au</span>
                        <input className="cf-field__input"
                          type="date"
                          value={fillTo}
                          max={todayIso()}
                          onChange={(e) => setFillTo(e.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ marginBottom: 10 }}
                        disabled={filling || !fillFrom || !fillTo}
                        onClick={() => void onFillRecurring()}
                      >
                        Remplir
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : (
          <p className="cf-muted">Chargement…</p>
        )}
      </Drawer>

      <ConfirmModal
        open={vehicleToDelete !== null}
        title="Supprimer ce véhicule ?"
        message="Un véhicule qui porte des déplacements ou un trajet récurrent ne se supprime pas : archive-le plutôt."
        confirmLabel="Supprimer"
        danger
        loading={deletingVehicle}
        onCancel={() => setVehicleToDelete(null)}
        onConfirm={() => void onDeleteVehicle()}
      />
      <ConfirmModal
        open={claimToDelete !== null}
        title="Supprimer cette note ?"
        message="La note et tous ses déplacements seront supprimés."
        confirmLabel="Supprimer"
        danger
        loading={deletingClaim}
        onCancel={() => setClaimToDelete(null)}
        onConfirm={() => void onDeleteClaim()}
      />
      <ConfirmModal
        open={tripToDelete !== null}
        title="Supprimer ce déplacement ?"
        message={
          tripToDelete
            ? `${formatFr(tripToDelete.tripDate)} — ${tripToDelete.fromLabel} → ${tripToDelete.toLabel}`
            : undefined
        }
        confirmLabel="Supprimer"
        danger
        loading={deletingTrip}
        onCancel={() => setTripToDelete(null)}
        onConfirm={() => void onDeleteTrip()}
      />
      <ConfirmModal
        open={confirmApprove && claim !== null}
        title="Valider la note ?"
        message={
          claim
            ? `Le montant de ${formatEuro(claim.amountCents)} sera figé et l’écriture passée.`
            : undefined
        }
        confirmLabel="Valider"
        loading={approving}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => void onApproveClaim()}
      />
    </>
  );
}
