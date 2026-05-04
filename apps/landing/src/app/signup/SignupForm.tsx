'use client';

import { useState, useTransition } from 'react';
import {
  CREATE_CLUB_AND_ADMIN_MUTATION,
  gqlRequest,
  type CreateClubAndAdminResult,
} from '@/lib/graphql';
import { slugify } from '@/lib/slugify';

type FormState = {
  clubName: string;
  clubSlug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

const INITIAL: FormState = {
  clubName: '',
  clubSlug: '',
  email: '',
  password: '',
  firstName: '',
  lastName: '',
};

export function SignupForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateClubAndAdminResult | null>(null);
  const [pending, startTransition] = useTransition();

  const adminUrl =
    process.env.NEXT_PUBLIC_LANDING_ADMIN_URL ??
    process.env.LANDING_ADMIN_URL ??
    'http://localhost:5173';

  const updateField = (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setForm((f) => {
        const next = { ...f, [key]: value };
        if (key === 'clubName' && !slugTouched) {
          next.clubSlug = slugify(value);
        }
        return next;
      });
    };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setForm((f) => ({ ...f, clubSlug: slugify(e.target.value) }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { data, errors } = await gqlRequest<{
        createClubAndAdmin: CreateClubAndAdminResult;
      }>(CREATE_CLUB_AND_ADMIN_MUTATION, {
        input: {
          clubName: form.clubName,
          clubSlug: form.clubSlug || undefined,
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
        },
      });
      if (errors?.length) {
        const code = errors[0].extensions?.code;
        if (code === 'CONFLICT' || /already.exists/i.test(errors[0].message)) {
          setError('Cet email est déjà utilisé. Essayez de vous connecter.');
        } else if (/réservé/i.test(errors[0].message)) {
          setError(
            `Le slug "${form.clubSlug}" est réservé. Choisissez une autre adresse.`,
          );
        } else {
          setError(errors[0].message);
        }
        return;
      }
      if (data?.createClubAndAdmin) {
        setSuccess(data.createClubAndAdmin);
      }
    });
  };

  if (success) {
    return (
      <div className="signup-success">
        <h2>🎉 Bienvenue sur ClubFlow !</h2>
        <p>
          Votre club <strong>{form.clubName}</strong> a été créé.
        </p>
        {success.emailSent ? (
          <p>
            📩 Un email de vérification a été envoyé à{' '}
            <strong>{form.email}</strong>. Cliquez sur le lien pour activer
            votre compte, puis connectez-vous.
          </p>
        ) : (
          <p className="muted">
            ⚠️ L'email de vérification n'a pas pu être envoyé (config SMTP en
            cours). Connectez-vous directement et contactez-nous si problème.
          </p>
        )}
        <p>
          Votre vitrine est dispo en attendant sur{' '}
          <a href={success.vitrineFallbackUrl}>{success.vitrineFallbackUrl}</a>.
        </p>
        <a href={`${adminUrl}/login`} className="btn btn-primary btn-lg">
          Se connecter à l'admin
        </a>
        <style>{`
          .signup-success {
            text-align: center;
            padding: var(--space-8);
          }
          .signup-success h2 { margin-bottom: var(--space-6); }
          .signup-success p {
            margin-bottom: var(--space-4);
            color: var(--color-text);
          }
          .signup-success .muted { color: var(--color-text-muted); }
          .signup-success a.btn { margin-top: var(--space-6); }
        `}</style>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="signup-form" noValidate>
      <fieldset disabled={pending}>
        <legend>Votre club</legend>
        <label>
          <span>Nom du club *</span>
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={form.clubName}
            onChange={updateField('clubName')}
            placeholder="Karaté Club Saint-Paul"
            autoComplete="organization"
          />
        </label>
        <label>
          <span>Adresse de votre vitrine</span>
          <div className="slug-row">
            <input
              type="text"
              value={form.clubSlug}
              onChange={handleSlugChange}
              placeholder="karate-saint-paul"
              maxLength={50}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              aria-describedby="slug-help"
            />
            <span className="slug-suffix">.clubflow.topdigital.re</span>
          </div>
          <small id="slug-help" className="muted">
            Vous pourrez ajouter votre propre domaine plus tard depuis l'admin.
          </small>
        </label>
      </fieldset>

      <fieldset disabled={pending}>
        <legend>Votre compte admin</legend>
        <div className="row-2">
          <label>
            <span>Prénom *</span>
            <input
              type="text"
              required
              minLength={1}
              maxLength={80}
              value={form.firstName}
              onChange={updateField('firstName')}
              autoComplete="given-name"
            />
          </label>
          <label>
            <span>Nom *</span>
            <input
              type="text"
              required
              minLength={1}
              maxLength={80}
              value={form.lastName}
              onChange={updateField('lastName')}
              autoComplete="family-name"
            />
          </label>
        </div>
        <label>
          <span>Email *</span>
          <input
            type="email"
            required
            value={form.email}
            onChange={updateField('email')}
            autoComplete="email"
          />
        </label>
        <label>
          <span>Mot de passe (8 caractères minimum) *</span>
          <input
            type="password"
            required
            minLength={8}
            maxLength={200}
            value={form.password}
            onChange={updateField('password')}
            autoComplete="new-password"
          />
        </label>
      </fieldset>

      {error && <p className="form-error" role="alert">{error}</p>}

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending}
      >
        {pending ? 'Création…' : 'Créer mon club gratuitement'}
      </button>
      <p className="muted disclaimer">
        En créant votre club, vous acceptez nos{' '}
        <a href="/mentions-legales">mentions légales</a>. ClubFlow est gratuit
        pendant la phase de lancement, sans CB ni engagement.
      </p>

      <style>{`
        .signup-form fieldset {
          border: 0;
          padding: 0;
          margin: 0 0 var(--space-8);
        }
        .signup-form legend {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--color-text-muted);
          margin-bottom: var(--space-4);
          padding: 0;
        }
        .signup-form label {
          display: block;
          margin-bottom: var(--space-4);
        }
        .signup-form label > span {
          display: block;
          margin-bottom: var(--space-2);
          font-size: 0.95rem;
          color: var(--color-text);
        }
        .signup-form input {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          font-size: 1rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          color: var(--color-text);
          font-family: inherit;
        }
        .signup-form input:focus {
          outline: 0;
          border-color: var(--color-primary);
        }
        .signup-form input:invalid:not(:placeholder-shown) {
          border-color: var(--color-danger);
        }
        .row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }
        .row-2 label { margin-bottom: 0; }
        .slug-row {
          display: flex;
          align-items: stretch;
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          background: var(--color-bg);
        }
        .slug-row input {
          border: 0;
          background: transparent;
          flex: 1;
        }
        .slug-row input:focus { outline: 0; }
        .slug-suffix {
          padding: var(--space-3) var(--space-4);
          color: var(--color-text-muted);
          font-size: 0.95rem;
          border-left: 1px solid var(--color-border);
          white-space: nowrap;
        }
        .signup-form small {
          display: block;
          margin-top: var(--space-1);
          font-size: 0.8rem;
        }
        .form-error {
          padding: var(--space-3) var(--space-4);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--color-danger);
          border-radius: var(--radius);
          color: var(--color-danger);
          margin-bottom: var(--space-4);
        }
        .btn-block {
          width: 100%;
          text-align: center;
        }
        .disclaimer {
          margin-top: var(--space-4);
          font-size: 0.85rem;
          text-align: center;
        }
      `}</style>
    </form>
  );
}
