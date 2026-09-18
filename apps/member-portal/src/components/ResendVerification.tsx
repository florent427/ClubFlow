import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { RESEND_VERIFICATION } from '../lib/documents';
import { canResendVerification } from '../lib/email-verification';

type Props = {
  /** Adresse déjà saisie ; l'adhérent peut la corriger avant l'envoi. */
  email: string;
};

/**
 * Renvoi du lien de vérification.
 *
 * Le lien expire au bout de 48 h. La mutation existait depuis l'origine, mais
 * aucun écran ne l'appelait : passé ce délai, l'adhérent n'avait aucun recours
 * visible (audit du 2026-09-14, point 2.4).
 *
 * La réponse de l'API est la même pour une adresse inconnue et pour un compte
 * déjà vérifié : le message affiché reste donc neutre.
 */
export function ResendVerification({ email }: Props) {
  const [adresse, setAdresse] = useState(email);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resend, { loading }] = useMutation<{
    resendVerificationEmail: { ok: boolean };
  }>(RESEND_VERIFICATION);

  async function envoyer() {
    setErreur(null);
    if (!canResendVerification(adresse)) {
      setErreur('Saisissez l’adresse e-mail de votre compte.');
      return;
    }
    try {
      await resend({ variables: { input: { email: adresse.trim() } } });
      setEnvoye(true);
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : 'Envoi impossible pour le moment. Réessayez dans une minute.',
      );
    }
  }

  if (envoye) {
    return (
      <p className="auth-footer" role="status">
        Si un compte attend une vérification à cette adresse, un nouveau lien
        vient d’y être envoyé. Pensez aux indésirables.
      </p>
    );
  }

  return (
    <div className="auth-resend">
      <label className="auth-field">
        <span>Adresse e-mail du compte</span>
        <input
          type="email"
          autoComplete="email"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
      </label>
      {erreur ? <p className="auth-error">{erreur}</p> : null}
      <button
        type="button"
        className="auth-btn auth-btn-secondary"
        disabled={loading}
        onClick={() => void envoyer()}
      >
        {loading ? 'Envoi…' : 'Renvoyer le lien de vérification'}
      </button>
    </div>
  );
}
