import { useMutation, useQuery } from '@apollo/client/react';
import { useState, type FormEvent } from 'react';
import { formatEuroCents } from '../../lib/format';
import {
  VIEWER_ADD_MILEAGE_RECURRING_TRIPS,
  VIEWER_ADD_MILEAGE_TRIP,
  VIEWER_CREATE_MILEAGE_CLAIM,
  VIEWER_DELETE_MILEAGE_CLAIM,
  VIEWER_DELETE_MILEAGE_TRIP,
  VIEWER_MILEAGE_CLAIM,
  VIEWER_MILEAGE_CLAIMS,
  VIEWER_SUBMIT_MILEAGE_CLAIM,
  VIEWER_UPDATE_MILEAGE_CLAIM,
  VIEWER_UPDATE_MILEAGE_TRIP,
  type MileageClaim,
  type MileageClaimInput,
  type MileageClaimSummary,
  type MileageSettlement,
  type MileageVehicle,
  type ViewerAddMileageRecurringTripsData,
  type ViewerCreateMileageClaimData,
  type ViewerMileageClaimData,
  type ViewerMileageClaimsData,
} from '../../lib/mileage-documents';
import {
  claimBadge,
  daysBetween,
  errorMessage,
  firstDayOfMonthIso,
  formatIsoDay,
  formatKm,
  todayIso,
} from '../../lib/mileage-format';
import { TripForm } from './mileage-forms';

const MAX_FILL_DAYS = 93;

function ClaimBadge({ claim }: { claim: MileageClaimSummary }) {
  const b = claimBadge(claim);
  return <span className={`mp-badge mp-badge--${b.tone}`}>{b.label}</span>;
}

function periodLabel(claim: MileageClaimSummary): string {
  if (!claim.firstTripDate) return 'Aucun déplacement';
  if (claim.firstTripDate === claim.lastTripDate) {
    return formatIsoDay(claim.firstTripDate);
  }
  return `${formatIsoDay(claim.firstTripDate)} → ${formatIsoDay(claim.lastTripDate)}`;
}

function AmountLine({ claim }: { claim: MileageClaimSummary }) {
  return (
    <span className="mp-mileage-amount">
      {formatEuroCents(claim.amountCents)}
      {claim.estimated ? <small>estimation</small> : null}
    </span>
  );
}

function ProvisionalNotice() {
  return (
    <p className="mp-hint mp-hint--warn">
      Le barème kilométrique de cette année n’est pas encore publié : le
      montant est calculé sur le barème précédent et sera recalculé à la
      validation.
    </p>
  );
}

function settlementLabel(s: MileageSettlement): string {
  return s === 'DONATION' ? 'Abandon de frais (don)' : 'Remboursement';
}

// ── Choix du règlement ──

function SettlementFields({
  value,
  onChange,
}: {
  value: MileageSettlement;
  onChange: (s: MileageSettlement) => void;
}) {
  return (
    <fieldset className="mp-mileage-fieldset mp-field-wide">
      <span>Règlement</span>
      <label className="mp-checkbox">
        <input
          type="radio"
          name="settlement"
          checked={value === 'REIMBURSEMENT'}
          onChange={() => onChange('REIMBURSEMENT')}
        />
        Le club me rembourse
      </label>
      <label className="mp-checkbox">
        <input
          type="radio"
          name="settlement"
          checked={value === 'DONATION'}
          onChange={() => onChange('DONATION')}
        />
        Je renonce au remboursement (abandon de frais) et reçois un reçu
        fiscal
      </label>
    </fieldset>
  );
}

function ClaimHeaderForm({
  initial,
  donationAvailable,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: MileageClaimSummary;
  donationAvailable: boolean;
  submitLabel: string;
  onSubmit: (input: MileageClaimInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [settlement, setSettlement] = useState<MileageSettlement>(
    initial?.settlement ?? 'REIMBURSEMENT',
  );
  const [note, setNote] = useState(initial?.memberNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        // Sans reçus fiscaux, l'abandon n'est pas proposé : on garde le
        // choix existant (une note déjà en don le reste).
        settlement: donationAvailable ? settlement : (initial?.settlement ?? 'REIMBURSEMENT'),
        memberNote: note.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="mp-form-grid">
        <label className="mp-field mp-field-wide">
          <span>Titre</span>
          <input
            value={title}
            maxLength={120}
            placeholder="ex. Octobre 2026"
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        {donationAvailable ? (
          <SettlementFields value={settlement} onChange={setSettlement} />
        ) : null}
        <label className="mp-field mp-field-wide">
          <span>Note pour le trésorier (facultatif)</span>
          <textarea
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      <div className="mp-form-actions">
        <button type="button" className="mp-btn" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button type="submit" className="mp-btn-primary" disabled={busy}>
          {busy ? 'Enregistrement…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Liste ──

export function MileageClaimsList({
  donationAvailable,
  hasVehicle,
  onOpen,
  onGoToVehicles,
}: {
  donationAvailable: boolean;
  hasVehicle: boolean;
  onOpen: (id: string) => void;
  onGoToVehicles: () => void;
}) {
  const { data, loading, error } = useQuery<ViewerMileageClaimsData>(
    VIEWER_MILEAGE_CLAIMS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create] = useMutation<ViewerCreateMileageClaimData>(
    VIEWER_CREATE_MILEAGE_CLAIM,
    { refetchQueries: [{ query: VIEWER_MILEAGE_CLAIMS }] },
  );
  const [creating, setCreating] = useState(false);
  const claims = data?.viewerMileageClaims ?? [];

  async function onCreate(input: MileageClaimInput) {
    const res = await create({ variables: { input } });
    const id = res.data?.viewerCreateMileageClaim.id;
    setCreating(false);
    if (id) onOpen(id);
  }

  return (
    <div>
      <p className="mp-text-muted">
        Une note regroupe les déplacements d’une période (ex. un mois). Un
        déplacement ponctuel (tournoi, réunion…) s’ajoute dans la note : ouvrez-la
        ou créez-en une, puis « Ajouter un déplacement ponctuel ».
      </p>

      {!hasVehicle ? (
        <div className="mp-hint mp-hint--block mp-hint--warn">
          <strong>Ajoutez d’abord un véhicule</strong>
          <p>
            Le barème dépend de la puissance fiscale du véhicule : chaque
            déplacement en désigne un.
          </p>
          <button type="button" className="mp-btn" onClick={onGoToVehicles}>
            Ajouter un véhicule
          </button>
        </div>
      ) : null}

      {creating ? (
        <div className="mp-form-card">
          <h2 className="mp-section-title">Nouvelle note de frais</h2>
          <ClaimHeaderForm
            donationAvailable={donationAvailable}
            submitLabel="Créer la note"
            onSubmit={onCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <div className="mp-mileage-toolbar">
          <span className="mp-text-muted">
            {claims.length > 0
              ? `${claims.length} note${claims.length > 1 ? 's' : ''}`
              : ''}
          </span>
          <button
            type="button"
            className="mp-btn-primary"
            onClick={() => setCreating(true)}
          >
            Nouvelle note
          </button>
        </div>
      )}

      {error ? <p className="mp-error">{errorMessage(error)}</p> : null}
      {loading && claims.length === 0 ? (
        <p className="mp-text-muted">Chargement…</p>
      ) : claims.length === 0 ? (
        <p className="mp-empty">
          Aucune note pour l’instant. Créez-en une par période (ex. un mois),
          puis ajoutez-y vos déplacements.
        </p>
      ) : (
        <div className="mp-event-list">
          {claims.map((c) => (
            <article key={c.id} className="mp-event-card">
              <header className="mp-event-card__head">
                <h3 className="mp-event-card__title">{c.title}</h3>
                <ClaimBadge claim={c} />
              </header>
              <div className="mp-event-card__meta">
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    date_range
                  </span>
                  {periodLabel(c)}
                </span>
                <span>
                  <span className="material-symbols-outlined" aria-hidden>
                    route
                  </span>
                  {c.tripCount} déplacement{c.tripCount > 1 ? 's' : ''} ·{' '}
                  {formatKm(c.totalMeters)}
                </span>
                {c.settlement === 'DONATION' ? (
                  <span>
                    <span className="material-symbols-outlined" aria-hidden>
                      volunteer_activism
                    </span>
                    Abandon de frais
                  </span>
                ) : null}
              </div>
              {c.status === 'DRAFT' && c.reviewComment ? (
                <p className="mp-hint mp-hint--warn">
                  Renvoyée pour correction : {c.reviewComment}
                </p>
              ) : null}
              <div className="mp-event-card__actions" style={{ justifyContent: 'space-between' }}>
                <AmountLine claim={c} />
                <button type="button" className="mp-btn" onClick={() => onOpen(c.id)}>
                  {c.status === 'DRAFT' ? 'Compléter' : 'Voir'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Remplissage depuis les trajets récurrents ──

function RecurringFill({ claimId }: { claimId: string }) {
  const [from, setFrom] = useState(firstDayOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [fill, { loading }] = useMutation<ViewerAddMileageRecurringTripsData>(
    VIEWER_ADD_MILEAGE_RECURRING_TRIPS,
  );
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const days = daysBetween(from, to);
    if (days < 0) {
      setError('La date de fin précède la date de début.');
      return;
    }
    if (days > MAX_FILL_DAYS) {
      setError('Remplissez au plus trois mois à la fois.');
      return;
    }
    try {
      const res = await fill({ variables: { claimId, from, to } });
      const added = res.data?.viewerAddMileageRecurringTrips.added ?? 0;
      setResult(
        added === 0
          ? 'Aucun déplacement ajouté : ils sont déjà déclarés dans une de vos notes, ou aucun trajet récurrent ne tombe sur cette période.'
          : `${added} déplacement${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}. Ceux déjà présents n’ont pas été dupliqués ; supprimez les jours où vous n’êtes pas venu.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="mp-text-muted" style={{ marginTop: 0 }}>
        Ajoute un déplacement pour chaque jour prévu par vos trajets récurrents
        sur la période (jusqu’à aujourd’hui, trois mois au plus).
      </p>
      <div className="mp-form-grid">
        <label className="mp-field">
          <span>Du</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label className="mp-field">
          <span>Au</span>
          <input
            type="date"
            value={to}
            max={todayIso()}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </label>
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      {result ? <p className="mp-hint mp-hint-ok">{result}</p> : null}
      <div className="mp-form-actions">
        <button type="submit" className="mp-btn" disabled={loading}>
          {loading ? 'Remplissage…' : 'Remplir depuis mes trajets récurrents'}
        </button>
      </div>
    </form>
  );
}

// ── Déplacements d'une note ──

function TripList({
  claim,
  vehicles,
}: {
  claim: MileageClaim;
  vehicles: MileageVehicle[];
}) {
  const editable = claim.status === 'DRAFT';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [update] = useMutation(VIEWER_UPDATE_MILEAGE_TRIP);
  const [remove] = useMutation(VIEWER_DELETE_MILEAGE_TRIP);
  const [error, setError] = useState<string | null>(null);
  const trips = [...claim.trips].sort((a, b) =>
    a.tripDate === b.tripDate ? 0 : a.tripDate < b.tripDate ? -1 : 1,
  );

  async function onDelete(id: string) {
    if (!window.confirm('Supprimer ce déplacement ?')) return;
    setError(null);
    try {
      await remove({ variables: { id } });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (trips.length === 0) {
    return <p className="mp-empty">Aucun déplacement dans cette note.</p>;
  }

  return (
    <>
      {error ? <p className="mp-error">{error}</p> : null}
      <ul className="mp-mileage-trips">
        {trips.map((t) =>
          editingId === t.id ? (
            <li key={t.id} className="mp-mileage-trip">
              <TripForm
                vehicles={vehicles}
                initial={t}
                submitLabel="Enregistrer"
                onSubmit={async (input) => {
                  await update({ variables: { id: t.id, input } });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={t.id} className="mp-mileage-trip">
              <div className="mp-mileage-trip__head">
                <span className="mp-mileage-trip__route">
                  {t.fromLabel} → {t.toLabel}
                  {t.roundTrip ? ' (aller-retour)' : ''}
                </span>
                <strong>{formatEuroCents(t.amountCents)}</strong>
              </div>
              <div className="mp-mileage-trip__meta">
                {formatIsoDay(t.tripDate)} · {t.vehicleLabel} ·{' '}
                {formatKm(t.totalMeters)}
                {t.recurringTripId ? ' · trajet récurrent' : ''}
              </div>
              <div className="mp-mileage-trip__meta">{t.purpose}</div>
              {t.scaleLabel ? (
                <div className="mp-mileage-trip__meta mp-text-muted">Barème : {t.scaleLabel}</div>
              ) : null}
              {editable ? (
                <div className="mp-mileage-trip__actions">
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm"
                    onClick={() => setEditingId(t.id)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm mp-btn-danger"
                    onClick={() => void onDelete(t.id)}
                  >
                    Supprimer
                  </button>
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>
    </>
  );
}

// ── Éditeur d'une note ──

export function MileageClaimEditor({
  claimId,
  donationAvailable,
  vehicles,
  onBack,
  onGoToVehicles,
}: {
  claimId: string;
  donationAvailable: boolean;
  vehicles: MileageVehicle[];
  onBack: () => void;
  onGoToVehicles: () => void;
}) {
  const { data, loading, error } = useQuery<ViewerMileageClaimData>(
    VIEWER_MILEAGE_CLAIM,
    { variables: { id: claimId }, fetchPolicy: 'cache-and-network' },
  );
  const [updateClaim] = useMutation(VIEWER_UPDATE_MILEAGE_CLAIM);
  const [addTrip] = useMutation(VIEWER_ADD_MILEAGE_TRIP);
  const [submitClaim, { loading: submitting }] = useMutation(
    VIEWER_SUBMIT_MILEAGE_CLAIM,
    { refetchQueries: [{ query: VIEWER_MILEAGE_CLAIMS }] },
  );
  const [deleteClaim, { loading: deleting }] = useMutation(
    VIEWER_DELETE_MILEAGE_CLAIM,
    { refetchQueries: [{ query: VIEWER_MILEAGE_CLAIMS }] },
  );
  const [editingHeader, setEditingHeader] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const claim = data?.viewerMileageClaim;
  const back = (
    <button type="button" className="mp-back-link mp-mileage-back" onClick={onBack}>
      <span className="material-symbols-outlined" aria-hidden>
        arrow_back
      </span>
      Mes notes
    </button>
  );

  if (!claim) {
    return (
      <div>
        {back}
        {error ? (
          <p className="mp-error">{errorMessage(error)}</p>
        ) : loading ? (
          <p className="mp-text-muted">Chargement…</p>
        ) : (
          <p className="mp-empty">Note introuvable.</p>
        )}
      </div>
    );
  }

  const editable = claim.status === 'DRAFT';
  const activeVehicles = vehicles.filter((v) => !v.archived);

  async function onSubmitClaim() {
    if (
      !window.confirm(
        'Soumettre la note au trésorier ? Elle ne sera plus modifiable, sauf s’il vous la renvoie.',
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await submitClaim({ variables: { id: claimId } });
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function onDeleteClaim() {
    if (!window.confirm('Supprimer cette note et tous ses déplacements ?')) return;
    setActionError(null);
    try {
      await deleteClaim({ variables: { id: claimId } });
      onBack();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  return (
    <div>
      {back}

      <div className="mp-form-card">
        {editingHeader ? (
          <ClaimHeaderForm
            initial={claim}
            donationAvailable={donationAvailable}
            submitLabel="Enregistrer"
            onSubmit={async (input) => {
              await updateClaim({ variables: { id: claimId, input } });
              setEditingHeader(false);
            }}
            onCancel={() => setEditingHeader(false)}
          />
        ) : (
          <>
            <div className="mp-mileage-trip__head">
              <h2 className="mp-section-title" style={{ margin: 0 }}>
                {claim.title}
              </h2>
              <ClaimBadge claim={claim} />
            </div>

            {claim.status === 'DRAFT' && claim.reviewComment ? (
              <div className="mp-hint mp-hint--block mp-hint--warn">
                <strong>Le trésorier vous a renvoyé cette note</strong>
                <p>{claim.reviewComment}</p>
              </div>
            ) : null}
            {claim.status === 'REJECTED' ? (
              <div className="mp-hint mp-hint--block mp-hint--danger">
                <strong>Note refusée</strong>
                <p>{claim.reviewComment || 'Aucun motif indiqué.'}</p>
              </div>
            ) : null}
            {claim.status === 'SUBMITTED' ? (
              <p className="mp-hint">
                Soumise le {new Date(claim.submittedAt ?? claim.createdAt).toLocaleDateString('fr-FR')}
                {' '}— en attente de validation par le trésorier.
              </p>
            ) : null}
            {claim.status === 'APPROVED' ? (
              <p className="mp-hint mp-hint-ok">
                {claim.settlement === 'DONATION'
                  ? claim.taxReceiptNumber
                    ? `Validée — reçu fiscal n° ${claim.taxReceiptNumber} émis.`
                    : 'Validée — votre don figurera sur votre prochain reçu fiscal.'
                  : claim.reimbursed
                    ? 'Validée et remboursée.'
                    : 'Validée — remboursement à venir.'}
              </p>
            ) : null}

            <dl className="mp-mileage-summary">
              <div>
                <dt>{claim.estimated ? 'Montant estimé' : 'Montant'}</dt>
                <dd>{formatEuroCents(claim.amountCents)}</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>{formatKm(claim.totalMeters)}</dd>
              </div>
              <div>
                <dt>Déplacements</dt>
                <dd>{claim.tripCount}</dd>
              </div>
              <div>
                <dt>Règlement</dt>
                <dd>{settlementLabel(claim.settlement)}</dd>
              </div>
            </dl>
            {claim.provisional ? <ProvisionalNotice /> : null}
            {claim.estimated && !claim.provisional && claim.tripCount > 0 ? (
              <p className="mp-text-muted">
                Estimation au barème fiscal : le montant est figé à la
                validation.
              </p>
            ) : null}
            {claim.memberNote ? (
              <p className="mp-text-muted">Votre note : {claim.memberNote}</p>
            ) : null}

            {editable ? (
              <div className="mp-mileage-trip__actions">
                <button
                  type="button"
                  className="mp-btn mp-btn-sm"
                  onClick={() => setEditingHeader(true)}
                >
                  Modifier le titre / règlement
                </button>
                <button
                  type="button"
                  className="mp-btn mp-btn-sm mp-btn-danger"
                  disabled={deleting}
                  onClick={() => void onDeleteClaim()}
                >
                  Supprimer la note
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="mp-form-card">
        <h2 className="mp-section-title">Déplacements</h2>
        <TripList claim={claim} vehicles={vehicles} />
      </div>

      {editable ? (
        <>
          <div className="mp-form-card">
            <h2 className="mp-section-title">Ajouter un déplacement ponctuel</h2>
            {activeVehicles.length === 0 ? (
              <div className="mp-hint mp-hint--block mp-hint--warn">
                <strong>Aucun véhicule actif</strong>
                <p>Ajoutez le véhicule utilisé pour pouvoir saisir un déplacement.</p>
                <button type="button" className="mp-btn" onClick={onGoToVehicles}>
                  Ajouter un véhicule
                </button>
              </div>
            ) : (
              <TripForm
                vehicles={vehicles}
                submitLabel="Ajouter"
                onSubmit={async (input) => {
                  await addTrip({ variables: { claimId, input } });
                }}
              />
            )}
          </div>

          <div className="mp-form-card">
            <h2 className="mp-section-title">Trajets récurrents</h2>
            <RecurringFill claimId={claimId} />
          </div>

          {actionError ? <p className="mp-error">{actionError}</p> : null}
          <div className="mp-form-card">
            <div className="mp-mileage-toolbar">
              <div>
                <div className="mp-text-muted">
                  {claim.estimated ? 'Total estimé' : 'Total'}
                </div>
                <AmountLine claim={claim} />
              </div>
              <button
                type="button"
                className="mp-btn-primary"
                disabled={submitting || claim.tripCount === 0}
                onClick={() => void onSubmitClaim()}
              >
                {submitting ? 'Envoi…' : 'Soumettre au trésorier'}
              </button>
            </div>
            {claim.tripCount === 0 ? (
              <p className="mp-text-muted">Ajoutez au moins un déplacement pour soumettre.</p>
            ) : null}
          </div>
        </>
      ) : actionError ? (
        <p className="mp-error">{actionError}</p>
      ) : null}
    </div>
  );
}
