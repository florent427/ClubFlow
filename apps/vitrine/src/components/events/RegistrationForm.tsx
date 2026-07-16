'use client';

import { useState } from 'react';
import styles from './RegistrationForm.module.css';

/** Créneau réservable passé par la page serveur (items bookable only). */
export interface BookableSlot {
  id: string;
  timeLabel: string | null;
  title: string;
  /** Places restantes — null = illimité. */
  remainingSpots: number | null;
}

interface RegistrationFormProps {
  eventSlug: string;
  /** Libellé du bouton, configurable par le club (publicCtaLabel). */
  ctaLabel: string | null;
  registrationOpen: boolean;
  slots: BookableSlot[];
}

function formatSpots(remaining: number): string {
  return remaining === 1 ? '1 place restante' : `${remaining} places restantes`;
}

/**
 * Formulaire d'inscription publique à un événement (landing vitrine).
 *
 * Même pattern que `ContactForm` : honeypot anti-bot (succès silencieux
 * sans appel API si rempli), POST vers une route Next qui relaie à la
 * mutation GraphQL publique. En plus : sélecteur de créneau obligatoire
 * quand l'événement propose des items réservables.
 */
export function RegistrationForm({
  eventSlug,
  ctaLabel,
  registrationOpen,
  slots,
}: RegistrationFormProps) {
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [honeypot, setHoneypot] = useState(''); // anti-bot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  if (!registrationOpen) {
    return (
      <p className={styles.closed} role="status">
        Les inscriptions sont fermées.
      </p>
    );
  }

  if (confirmation) {
    return (
      <div className={styles.confirmation} role="status">
        <span className={styles.confirmationCheck} aria-hidden="true">
          ✓
        </span>
        <p className={styles.confirmationMessage}>{confirmation}</p>
        <p className={styles.confirmationNote}>
          Vous recevrez un e-mail de confirmation.
        </p>
      </div>
    );
  }

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    if (honeypot.trim().length > 0) {
      // Bot piégé : succès silencieux sans appel API (cf. ContactForm).
      setConfirmation('Votre inscription a bien été enregistrée.');
      return;
    }
    if (slots.length > 0 && selectedSlots.length === 0) {
      setError('Choisissez au moins un créneau.');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Prénom, nom et e-mail requis.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/event-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventSlug,
          programItemIds: selectedSlots,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          note: note.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string | null;
        error?: string;
      } | null;
      if (!res.ok || !body?.success) {
        setError(body?.error ?? 'Échec de l’envoi, réessayez.');
      } else {
        setConfirmation(
          body.message ?? 'Votre inscription a bien été enregistrée.',
        );
      }
    } catch {
      setError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className={styles.honeypot}
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        aria-hidden="true"
      />

      {slots.length > 0 ? (
        <fieldset
          className={styles.slots}
          style={{ border: 'none' }}
          disabled={submitting}
        >
          <legend className={styles.slotsLabel}>
            Choisissez un ou plusieurs créneaux *
          </legend>
          {slots.map((slot) => {
            const full = slot.remainingSpots === 0;
            const selected = selectedSlots.includes(slot.id);
            const classNames = [
              styles.slot,
              selected ? styles.slotSelected : '',
              full ? styles.slotDisabled : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <label key={slot.id} className={classNames}>
                <input
                  type="checkbox"
                  name="programItem"
                  value={slot.id}
                  checked={selected}
                  onChange={() =>
                    setSelectedSlots((prev) =>
                      prev.includes(slot.id)
                        ? prev.filter((id) => id !== slot.id)
                        : [...prev, slot.id],
                    )
                  }
                  disabled={full || submitting}
                />
                {slot.timeLabel ? (
                  <span className={styles.slotTime}>{slot.timeLabel}</span>
                ) : null}
                <span className={styles.slotTitle}>{slot.title}</span>
                {full ? (
                  <span className={styles.slotFull}>Complet</span>
                ) : slot.remainingSpots !== null ? (
                  <span className={styles.slotSpots}>
                    {formatSpots(slot.remainingSpots)}
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
      ) : null}

      <div className={styles.row}>
        <label className={styles.field}>
          <span>Prénom *</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            disabled={submitting}
          />
        </label>
        <label className={styles.field}>
          <span>Nom *</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            disabled={submitting}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span>E-mail *</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span>Téléphone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={submitting}
        />
      </label>
      <label className={styles.field}>
        <span>Message</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          rows={4}
          placeholder="Ex. âge de l’enfant, questions…"
        />
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn btn--filled"
        disabled={submitting}
        style={{ alignSelf: 'flex-start' }}
      >
        {submitting ? 'Envoi…' : (ctaLabel ?? 'Je m’inscris')}
      </button>
      <p className="form-note">
        Vos données restent confidentielles et ne sont utilisées que pour
        organiser votre venue. En envoyant ce formulaire vous acceptez d’être
        recontacté par le club.
      </p>
    </form>
  );
}
