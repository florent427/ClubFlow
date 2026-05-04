import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client/react';
import { REQUEST_PASSWORD_RESET } from '../lib/documents';
import type { RequestPasswordResetData } from '../lib/types';

/**
 * Page de demande de reset password.
 *
 * UX volontairement "neutre" : on affiche TOUJOURS le même message de
 * succès, qu'un compte existe ou non avec cet email. Empêche
 * l'énumération de comptes (info disclosure).
 *
 * La mutation `requestPasswordReset` côté API ne renvoie jamais d'erreur
 * pour un email inconnu (return ok:true) — donc le user voit toujours
 * "si un compte existe, un email est parti".
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, { loading }] = useMutation<RequestPasswordResetData>(
    REQUEST_PASSWORD_RESET,
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await request({
        variables: { input: { email: email.trim() } },
      });
      if (data?.requestPasswordReset?.ok) {
        setSent(true);
      } else {
        setError('Une erreur est survenue. Réessaie dans quelques instants.');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Demande impossible.';
      setError(msg);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-header">
          <p className="login-eyebrow">ClubFlow</p>
          <h1>Mot de passe oublié</h1>
          <p className="login-sub">
            Entrez l'email de votre compte. Si un compte existe, vous
            recevrez un lien pour définir un nouveau mot de passe.
          </p>
        </header>
        {sent ? (
          <div className="login-success">
            <p>
              📩 Si un compte existe avec <strong>{email}</strong>, un email
              avec le lien de réinitialisation vient d'être envoyé.
            </p>
            <p className="login-hint">
              Le lien expire dans 1 heure. Vérifie aussi tes spams.
            </p>
            <p>
              <Link to="/login" className="btn btn-secondary">
                Retour à la connexion
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="login-form">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
            </button>
            <p className="login-hint">
              <Link to="/login">← Retour à la connexion</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
