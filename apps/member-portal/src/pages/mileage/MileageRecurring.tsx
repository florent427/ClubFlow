import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_CREATE_MILEAGE_RECURRING_TRIP,
  VIEWER_DELETE_MILEAGE_RECURRING_TRIP,
  VIEWER_MILEAGE_RECURRING_TRIPS,
  VIEWER_SET_MILEAGE_RECURRING_TRIP_ARCHIVED,
  VIEWER_UPDATE_MILEAGE_RECURRING_TRIP,
  type MileageVehicle,
  type ViewerMileageRecurringTripsData,
} from '../../lib/mileage-documents';
import {
  errorMessage,
  formatIsoDay,
  formatKm,
  formatWeekdays,
} from '../../lib/mileage-format';
import { RecurringForm } from './mileage-forms';

const VARS = { includeArchived: true };
const REFETCH = [{ query: VIEWER_MILEAGE_RECURRING_TRIPS, variables: VARS }];

export function MileageRecurring({
  vehicles,
  onGoToVehicles,
}: {
  vehicles: MileageVehicle[];
  onGoToVehicles: () => void;
}) {
  const { data, loading, error: loadError } = useQuery<ViewerMileageRecurringTripsData>(
    VIEWER_MILEAGE_RECURRING_TRIPS,
    { variables: VARS, fetchPolicy: 'cache-and-network' },
  );
  const [create] = useMutation(VIEWER_CREATE_MILEAGE_RECURRING_TRIP, {
    refetchQueries: REFETCH,
  });
  const [update] = useMutation(VIEWER_UPDATE_MILEAGE_RECURRING_TRIP);
  const [setArchived] = useMutation(VIEWER_SET_MILEAGE_RECURRING_TRIP_ARCHIVED);
  const [remove] = useMutation(VIEWER_DELETE_MILEAGE_RECURRING_TRIP, {
    refetchQueries: REFETCH,
  });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = data?.viewerMileageRecurringTrips ?? [];
  const archivedCount = rows.filter((r) => r.archived).length;
  const shown = rows.filter((r) => showArchived || !r.archived);
  const hasActiveVehicle = vehicles.some((v) => !v.archived);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <p className="mp-text-muted">
        Un trajet que vous faites chaque semaine (entraînement, cours à
        encadrer…) se déclare une fois ici ; une note se remplit ensuite
        d’un clic avec les jours prévus.
      </p>

      {!hasActiveVehicle ? (
        <div className="mp-hint mp-hint--block mp-hint--warn">
          <strong>Ajoutez d’abord un véhicule</strong>
          <p>Chaque trajet récurrent se fait avec un de vos véhicules.</p>
          <button type="button" className="mp-btn" onClick={onGoToVehicles}>
            Ajouter un véhicule
          </button>
        </div>
      ) : creating ? (
        <div className="mp-form-card">
          <h2 className="mp-section-title">Nouveau trajet récurrent</h2>
          <RecurringForm
            vehicles={vehicles}
            submitLabel="Ajouter"
            onSubmit={async (input) => {
              await create({ variables: { input } });
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <div className="mp-mileage-toolbar">
          {archivedCount > 0 ? (
            <label className="mp-checkbox">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Afficher les archivés ({archivedCount})
            </label>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="mp-btn-primary"
            onClick={() => setCreating(true)}
          >
            Ajouter un trajet récurrent
          </button>
        </div>
      )}

      {loadError ? <p className="mp-error">{errorMessage(loadError)}</p> : null}
      {error ? <p className="mp-error">{error}</p> : null}

      {loading && rows.length === 0 ? (
        <p className="mp-text-muted">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="mp-empty">Aucun trajet récurrent.</p>
      ) : (
        <ul className="mp-mileage-trips">
          {shown.map((r) =>
            editingId === r.id ? (
              <li key={r.id} className="mp-mileage-trip">
                <RecurringForm
                  vehicles={vehicles}
                  initial={r}
                  submitLabel="Enregistrer"
                  onSubmit={async (input) => {
                    await update({ variables: { id: r.id, input } });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={r.id}
                className={`mp-mileage-trip${r.archived ? ' mp-mileage-archived' : ''}`}
              >
                <div className="mp-mileage-trip__head">
                  <span className="mp-mileage-trip__route">
                    {r.fromLabel} → {r.toLabel}
                    {r.roundTrip ? ' (aller-retour)' : ''}
                  </span>
                  {r.archived ? (
                    <span className="mp-badge mp-badge--muted">Archivé</span>
                  ) : null}
                </div>
                <div className="mp-mileage-trip__meta">{r.purpose}</div>
                <div className="mp-mileage-trip__meta">
                  {formatWeekdays(r.weekdays)} · {r.vehicleLabel} ·{' '}
                  {formatKm(r.roundTrip ? r.distanceMeters * 2 : r.distanceMeters)} par
                  jour
                </div>
                <div className="mp-mileage-trip__meta">
                  Depuis le {formatIsoDay(r.startsOn)}
                  {r.endsOn ? ` jusqu’au ${formatIsoDay(r.endsOn)}` : ''}
                </div>
                <div className="mp-mileage-trip__actions">
                  {!r.archived ? (
                    <button
                      type="button"
                      className="mp-btn mp-btn-sm"
                      onClick={() => setEditingId(r.id)}
                    >
                      Modifier
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm"
                    onClick={() =>
                      void run(() =>
                        setArchived({ variables: { id: r.id, archived: !r.archived } }),
                      )
                    }
                  >
                    {r.archived ? 'Réactiver' : 'Archiver'}
                  </button>
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm mp-btn-danger"
                    onClick={() => {
                      if (!window.confirm('Supprimer ce trajet récurrent ?')) return;
                      void run(() => remove({ variables: { id: r.id } }));
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
