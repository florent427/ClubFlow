import { useState, type FormEvent } from 'react';
import type {
  MileageRecurringTrip,
  MileageRecurringTripInput,
  MileageTrip,
  MileageTripInput,
  MileageVehicle,
  MileageVehicleInput,
  MileageVehicleKind,
} from '../../lib/mileage-documents';
import {
  VEHICLE_KIND_LABELS,
  WEEKDAYS,
  errorMessage,
  kmInputToMeters,
  metersToKmInput,
  todayIso,
} from '../../lib/mileage-format';

/** Véhicules sélectionnables : actifs, plus celui déjà choisi s'il est archivé. */
function selectableVehicles(
  vehicles: MileageVehicle[],
  currentId: string,
): MileageVehicle[] {
  return vehicles.filter((v) => !v.archived || v.id === currentId);
}

function VehicleSelect({
  vehicles,
  value,
  onChange,
}: {
  vehicles: MileageVehicle[];
  value: string;
  onChange: (id: string) => void;
}) {
  const options = selectableVehicles(vehicles, value);
  return (
    <label className="mp-field">
      <span>Véhicule</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="" disabled>
          Choisir…
        </option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
            {v.archived ? ' (archivé)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function DistanceFields({
  km,
  setKm,
  roundTrip,
  setRoundTrip,
}: {
  km: string;
  setKm: (v: string) => void;
  roundTrip: boolean;
  setRoundTrip: (v: boolean) => void;
}) {
  return (
    <>
      <label className="mp-field">
        <span>Distance d’un aller (km)</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="ex. 12,5"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          required
        />
      </label>
      <label className="mp-checkbox" style={{ alignSelf: 'end', paddingBottom: 8 }}>
        <input
          type="checkbox"
          checked={roundTrip}
          onChange={(e) => setRoundTrip(e.target.checked)}
        />
        Aller-retour
      </label>
    </>
  );
}

function FormActions({
  busy,
  submitLabel,
  onCancel,
}: {
  busy: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <div className="mp-form-actions">
      {onCancel ? (
        <button type="button" className="mp-btn" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
      ) : null}
      <button type="submit" className="mp-btn-primary" disabled={busy}>
        {busy ? 'Enregistrement…' : submitLabel}
      </button>
    </div>
  );
}

// ── Déplacement ponctuel ──

export function TripForm({
  vehicles,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  vehicles: MileageVehicle[];
  initial?: MileageTrip;
  submitLabel: string;
  onSubmit: (input: MileageTripInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const firstActive = vehicles.find((v) => !v.archived)?.id ?? '';
  const [chosenVehicleId, setVehicleId] = useState(initial?.vehicleId ?? '');
  // Les véhicules peuvent arriver après le montage : à défaut de choix, le premier actif.
  const vehicleId = chosenVehicleId || firstActive;
  const [tripDate, setTripDate] = useState(initial?.tripDate ?? todayIso());
  const [fromLabel, setFromLabel] = useState(initial?.fromLabel ?? '');
  const [toLabel, setToLabel] = useState(initial?.toLabel ?? '');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [km, setKm] = useState(
    initial ? metersToKmInput(initial.distanceMeters) : '',
  );
  const [roundTrip, setRoundTrip] = useState(initial?.roundTrip ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const distanceMeters = kmInputToMeters(km);
    if (distanceMeters === null) {
      setError('Indiquez une distance en kilomètres (ex. 12,5).');
      return;
    }
    if (!vehicleId) {
      setError('Choisissez un véhicule.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        vehicleId,
        tripDate,
        fromLabel: fromLabel.trim(),
        toLabel: toLabel.trim(),
        purpose: purpose.trim(),
        distanceMeters,
        roundTrip,
      });
      if (!initial) {
        // Garde véhicule, date et trajet : on enchaîne souvent des
        // déplacements voisins. Seul le motif change d'une ligne à l'autre.
        setPurpose('');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="mp-form-grid">
        <label className="mp-field">
          <span>Date</span>
          <input
            type="date"
            value={tripDate}
            max={todayIso()}
            onChange={(e) => setTripDate(e.target.value)}
            required
          />
        </label>
        <VehicleSelect vehicles={vehicles} value={vehicleId} onChange={setVehicleId} />
        <label className="mp-field">
          <span>Départ</span>
          <input
            value={fromLabel}
            maxLength={160}
            placeholder="ex. Domicile, Saint-Denis"
            onChange={(e) => setFromLabel(e.target.value)}
            required
          />
        </label>
        <label className="mp-field">
          <span>Arrivée</span>
          <input
            value={toLabel}
            maxLength={160}
            placeholder="ex. Gymnase de Saint-Pierre"
            onChange={(e) => setToLabel(e.target.value)}
            required
          />
        </label>
        <label className="mp-field mp-field-wide">
          <span>Motif</span>
          <input
            value={purpose}
            maxLength={200}
            placeholder="ex. Encadrement du tournoi régional"
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
        </label>
        <DistanceFields
          km={km}
          setKm={setKm}
          roundTrip={roundTrip}
          setRoundTrip={setRoundTrip}
        />
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      <FormActions busy={busy} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

// ── Véhicule ──

export function VehicleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: MileageVehicle;
  submitLabel: string;
  onSubmit: (input: MileageVehicleInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [kind, setKind] = useState<MileageVehicleKind>(initial?.kind ?? 'CAR');
  const [cv, setCv] = useState(
    initial?.fiscalHorsepower != null ? String(initial.fiscalHorsepower) : '',
  );
  const [isElectric, setIsElectric] = useState(initial?.isElectric ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsCv = kind !== 'MOPED';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    let fiscalHorsepower: number | null = null;
    if (needsCv) {
      const n = Number(cv);
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        setError('Indiquez la puissance fiscale (CV), case P.6 de la carte grise.');
        return;
      }
      fiscalHorsepower = n;
    }
    setBusy(true);
    try {
      await onSubmit({ label: label.trim(), kind, fiscalHorsepower, isElectric });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="mp-form-grid">
        <label className="mp-field">
          <span>Nom du véhicule</span>
          <input
            value={label}
            maxLength={80}
            placeholder="ex. Clio grise"
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </label>
        <label className="mp-field">
          <span>Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MileageVehicleKind)}
          >
            {(Object.keys(VEHICLE_KIND_LABELS) as MileageVehicleKind[]).map((k) => (
              <option key={k} value={k}>
                {VEHICLE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {needsCv ? (
          <label className="mp-field">
            <span>Puissance fiscale (CV)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              step={1}
              value={cv}
              onChange={(e) => setCv(e.target.value)}
              required
            />
          </label>
        ) : null}
        <label className="mp-checkbox" style={{ alignSelf: 'end', paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={isElectric}
            onChange={(e) => setIsElectric(e.target.checked)}
          />
          Électrique (barème majoré de 20 %)
        </label>
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      <FormActions busy={busy} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

// ── Trajet récurrent ──

export function RecurringForm({
  vehicles,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  vehicles: MileageVehicle[];
  initial?: MileageRecurringTrip;
  submitLabel: string;
  onSubmit: (input: MileageRecurringTripInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const firstActive = vehicles.find((v) => !v.archived)?.id ?? '';
  const [chosenVehicleId, setVehicleId] = useState(initial?.vehicleId ?? '');
  // Les véhicules peuvent arriver après le montage : à défaut de choix, le premier actif.
  const vehicleId = chosenVehicleId || firstActive;
  const [fromLabel, setFromLabel] = useState(initial?.fromLabel ?? '');
  const [toLabel, setToLabel] = useState(initial?.toLabel ?? '');
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [km, setKm] = useState(
    initial ? metersToKmInput(initial.distanceMeters) : '',
  );
  const [roundTrip, setRoundTrip] = useState(initial?.roundTrip ?? true);
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? todayIso());
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(iso: number) {
    setWeekdays((prev) =>
      prev.includes(iso)
        ? prev.filter((d) => d !== iso)
        : [...prev, iso].sort((a, b) => a - b),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const distanceMeters = kmInputToMeters(km);
    if (distanceMeters === null) {
      setError('Indiquez une distance en kilomètres (ex. 12,5).');
      return;
    }
    if (weekdays.length === 0) {
      setError('Cochez au moins un jour de la semaine.');
      return;
    }
    if (!vehicleId) {
      setError('Choisissez un véhicule.');
      return;
    }
    if (endsOn && endsOn < startsOn) {
      setError('La date de fin précède la date de début.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        vehicleId,
        fromLabel: fromLabel.trim(),
        toLabel: toLabel.trim(),
        purpose: purpose.trim(),
        distanceMeters,
        roundTrip,
        weekdays,
        startsOn,
        endsOn: endsOn || null,
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
        <VehicleSelect vehicles={vehicles} value={vehicleId} onChange={setVehicleId} />
        <label className="mp-field">
          <span>Départ</span>
          <input
            value={fromLabel}
            maxLength={160}
            placeholder="ex. Domicile"
            onChange={(e) => setFromLabel(e.target.value)}
            required
          />
        </label>
        <label className="mp-field">
          <span>Arrivée</span>
          <input
            value={toLabel}
            maxLength={160}
            placeholder="ex. Dojo du club"
            onChange={(e) => setToLabel(e.target.value)}
            required
          />
        </label>
        <label className="mp-field mp-field-wide">
          <span>Motif</span>
          <input
            value={purpose}
            maxLength={200}
            placeholder="ex. Encadrement du cours enfants"
            onChange={(e) => setPurpose(e.target.value)}
            required
          />
        </label>
        <DistanceFields
          km={km}
          setKm={setKm}
          roundTrip={roundTrip}
          setRoundTrip={setRoundTrip}
        />
        <fieldset className="mp-mileage-fieldset mp-field-wide">
          <span>Jours</span>
          <div className="mp-mileage-weekdays">
            {WEEKDAYS.map((w) => {
              const on = weekdays.includes(w.iso);
              return (
                <label
                  key={w.iso}
                  className={`mp-mileage-weekday${on ? ' mp-mileage-weekday--on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleDay(w.iso)}
                  />
                  {w.short}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="mp-field">
          <span>À partir du</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </label>
        <label className="mp-field">
          <span>Jusqu’au (facultatif)</span>
          <input
            type="date"
            value={endsOn}
            min={startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="mp-error">{error}</p> : null}
      <FormActions busy={busy} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
