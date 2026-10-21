import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_CREATE_MILEAGE_VEHICLE,
  VIEWER_DELETE_MILEAGE_VEHICLE,
  VIEWER_MILEAGE_VEHICLES,
  VIEWER_SET_MILEAGE_VEHICLE_ARCHIVED,
  VIEWER_UPDATE_MILEAGE_VEHICLE,
  type MileageVehicle,
} from '../../lib/mileage-documents';
import { VEHICLE_KIND_LABELS, errorMessage } from '../../lib/mileage-format';
import { VehicleForm } from './mileage-forms';

const REFETCH = [
  { query: VIEWER_MILEAGE_VEHICLES, variables: { includeArchived: true } },
];

export function MileageVehicles({
  vehicles,
  loading,
}: {
  vehicles: MileageVehicle[];
  loading: boolean;
}) {
  const [create] = useMutation(VIEWER_CREATE_MILEAGE_VEHICLE, {
    refetchQueries: REFETCH,
  });
  const [update] = useMutation(VIEWER_UPDATE_MILEAGE_VEHICLE);
  const [setArchived] = useMutation(VIEWER_SET_MILEAGE_VEHICLE_ARCHIVED);
  const [remove] = useMutation(VIEWER_DELETE_MILEAGE_VEHICLE, {
    refetchQueries: REFETCH,
  });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archivedCount = vehicles.filter((v) => v.archived).length;
  const shown = vehicles.filter((v) => showArchived || !v.archived);

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
        Le barème fiscal dépend du type de véhicule et de sa puissance fiscale
        (case P.6 de la carte grise) ; un véhicule électrique est majoré de
        20 %. Un véhicule déjà utilisé s’archive au lieu de se supprimer.
      </p>

      {creating ? (
        <div className="mp-form-card">
          <h2 className="mp-section-title">Nouveau véhicule</h2>
          <VehicleForm
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
            Ajouter un véhicule
          </button>
        </div>
      )}

      {error ? <p className="mp-error">{error}</p> : null}

      {loading && vehicles.length === 0 ? (
        <p className="mp-text-muted">Chargement…</p>
      ) : shown.length === 0 ? (
        <p className="mp-empty">Aucun véhicule enregistré.</p>
      ) : (
        <ul className="mp-mileage-trips">
          {shown.map((v) =>
            editingId === v.id ? (
              <li key={v.id} className="mp-mileage-trip">
                <VehicleForm
                  initial={v}
                  submitLabel="Enregistrer"
                  onSubmit={async (input) => {
                    await update({ variables: { id: v.id, input } });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={v.id}
                className={`mp-mileage-trip${v.archived ? ' mp-mileage-archived' : ''}`}
              >
                <div className="mp-mileage-trip__head">
                  <span className="mp-mileage-trip__route">{v.label}</span>
                  {v.archived ? (
                    <span className="mp-badge mp-badge--muted">Archivé</span>
                  ) : null}
                </div>
                <div className="mp-mileage-trip__meta">
                  {VEHICLE_KIND_LABELS[v.kind]}
                  {v.fiscalHorsepower != null ? ` · ${v.fiscalHorsepower} CV` : ''}
                  {v.isElectric ? ' · électrique' : ''}
                </div>
                <div className="mp-mileage-trip__actions">
                  {!v.archived ? (
                    <button
                      type="button"
                      className="mp-btn mp-btn-sm"
                      onClick={() => setEditingId(v.id)}
                    >
                      Modifier
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm"
                    onClick={() =>
                      void run(() =>
                        setArchived({ variables: { id: v.id, archived: !v.archived } }),
                      )
                    }
                  >
                    {v.archived ? 'Réactiver' : 'Archiver'}
                  </button>
                  <button
                    type="button"
                    className="mp-btn mp-btn-sm mp-btn-danger"
                    onClick={() => {
                      if (!window.confirm(`Supprimer le véhicule « ${v.label} » ?`)) return;
                      void run(() => remove({ variables: { id: v.id } }));
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
