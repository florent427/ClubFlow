'use client';

import { useState } from 'react';
import styles from './ContactForm.module.css';

interface ContactFormProps {
  clubSlug: string;
}

export function ContactForm({ clubSlug }: ContactFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState(''); // anti-bot
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    if (honeypot.trim().length > 0) {
      setStatus({ ok: true });
      return;
    }
    if (!email.trim() || !message.trim()) {
      setStatus({ ok: false, error: 'E-mail et message requis.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubSlug,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStatus({
          ok: false,
          error: body?.error ?? 'Échec de l’envoi, réessayez.',
        });
      } else {
        setStatus({ ok: true });
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setMessage('');
      }
    } catch {
      setStatus({
        ok: false,
        error: 'Erreur réseau. Vérifiez votre connexion.',
      });
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
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Prénom</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={submitting}
          />
        </label>
        <label className={styles.field}>
          <span>Nom</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
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
        <span>Message *</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          disabled={submitting}
          rows={6}
        />
      </label>
      {status?.ok === true ? (
        <p className={styles.success} role="status">
          Merci, votre message a bien été envoyé. Nous vous recontacterons
          rapidement.
        </p>
      ) : null}
      {status && status.ok === false ? (
        <p className={styles.error} role="alert">
          {status.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="btn btn--filled"
        disabled={submitting}
        style={{ alignSelf: 'flex-start' }}
      >
        {submitting ? 'Envoi…' : 'Envoyer le message'}
      </button>
      <p className="form-note">
        Vos données restent confidentielles et ne sont utilisées que pour vous
        recontacter. En envoyant ce formulaire vous acceptez d’être recontacté
        par le club.
      </p>
    </form>
  );
}
