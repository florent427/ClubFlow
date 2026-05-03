import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import {
  CREATE_FAMILY_INVITE,
  SEND_FAMILY_INVITE_BY_EMAIL,
} from '../lib/viewer-documents';
import type {
  CreateFamilyInviteData,
  FamilyInviteRole,
} from '../lib/viewer-types';

type InviteResult = {
  code: string;
  rawToken: string;
  expiresAt: string;
};

/**
 * Bouton et modale « Inviter un proche » : permet au payeur d'un foyer
 * de générer un code + lien à partager (co-payeur ou observateur).
 *
 * Après génération, l'utilisateur peut :
 *   - Copier le code à communiquer oralement
 *   - Copier le lien direct à partager par SMS/messagerie
 *   - Entrer un email pour envoyer directement l'invitation par mail
 */
export function InviteFamilyMemberCta() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<FamilyInviteRole>('COPAYER');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  const [createInvite, { loading: creating }] =
    useMutation<CreateFamilyInviteData>(CREATE_FAMILY_INVITE);
  const [sendInviteByEmail, { loading: sending }] = useMutation(
    SEND_FAMILY_INVITE_BY_EMAIL,
  );

  function resetAndClose() {
    setOpen(false);
    setResult(null);
    setLocalError(null);
    setCopiedCode(false);
    setCopiedLink(false);
    setRole('COPAYER');
    setEmail('');
    setEmailSentTo(null);
  }

  async function onGenerate() {
    setLocalError(null);
    try {
      const { data } = await createInvite({
        variables: { input: { role } },
      });
      if (!data?.createFamilyInvite) {
        setLocalError('Impossible de générer l\u2019invitation.');
        return;
      }
      setResult({
        code: data.createFamilyInvite.code,
        rawToken: data.createFamilyInvite.rawToken,
        expiresAt: data.createFamilyInvite.expiresAt,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible de générer l\u2019invitation.';
      setLocalError(msg);
    }
  }

  const inviteUrl = result
    ? `${window.location.origin}/rejoindre?token=${encodeURIComponent(result.rawToken)}`
    : '';

  async function copy(value: string, which: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value);
      if (which === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      // ignore
    }
  }

  async function onSendEmail() {
    setLocalError(null);
    setEmailSentTo(null);
    if (!result) return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setLocalError('Adresse email invalide.');
      return;
    }
    try {
      await sendInviteByEmail({
        variables: {
          input: {
            code: result.code,
            email: trimmed,
            inviteUrl,
          },
        },
      });
      setEmailSentTo(trimmed);
      setEmail('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Échec de l\u2019envoi.';
      setLocalError(msg);
    }
  }

  const busy = creating || sending;

  return (
    <>
      <button
        type="button"
        className="mp-btn mp-btn-outline"
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          person_add
        </span>
        Inviter un proche
      </button>

      {open ? (
        <div
          className="mp-modal-backdrop"
          role="presentation"
          onClick={() => !busy && resetAndClose()}
        />
      ) : null}
      {open ? (
        <div
          className="mp-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-family-title"
        >
          <h2 id="invite-family-title" className="mp-modal-title">
            Inviter un proche à votre espace familial
          </h2>

          {!result ? (
            <>
              <p className="mp-hint mp-modal-lede">
                Choisissez le type d'accès, puis partagez le code et le lien
                générés avec la personne de votre choix. L'invitation est
                valable 14 jours.
              </p>
              <fieldset className="mp-fieldset">
                <legend className="mp-legend">Type d'accès</legend>
                <label className="mp-radio">
                  <input
                    type="radio"
                    name="invite-role"
                    value="COPAYER"
                    checked={role === 'COPAYER'}
                    onChange={() => setRole('COPAYER')}
                    disabled={busy}
                  />
                  <span>
                    <strong>Co-payeur</strong>
                    <span className="mp-hint">
                      Crée un nouveau foyer résidence relié au vôtre dans un
                      espace partagé. Les deux parents voient les mêmes
                      factures et les mêmes enfants.
                    </span>
                  </span>
                </label>
                <label className="mp-radio">
                  <input
                    type="radio"
                    name="invite-role"
                    value="VIEWER"
                    checked={role === 'VIEWER'}
                    onChange={() => setRole('VIEWER')}
                    disabled={busy}
                  />
                  <span>
                    <strong>Observateur</strong>
                    <span className="mp-hint">
                      Rejoint directement votre foyer en lecture. Pratique
                      pour un grand-parent, un tuteur, etc.
                    </span>
                  </span>
                </label>
              </fieldset>

              {localError ? (
                <p className="mp-form-error" role="alert">
                  {localError}
                </p>
              ) : null}

              <div className="mp-modal-actions">
                <button
                  type="button"
                  className="mp-btn mp-btn-outline"
                  disabled={busy}
                  onClick={resetAndClose}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="mp-btn mp-btn-primary"
                  disabled={busy}
                  onClick={() => void onGenerate()}
                >
                  {creating ? 'Génération…' : 'Générer l\u2019invitation'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mp-hint mp-modal-lede">
                Invitation générée. Expire le{' '}
                <strong>
                  {new Date(result.expiresAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
                .
              </p>

              <div className="mp-field">
                <span>Code à 8 caractères</span>
                <div className="mp-invite-code-row">
                  <code className="mp-invite-code">{result.code}</code>
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-btn-sm"
                    onClick={() => void copy(result.code, 'code')}
                  >
                    {copiedCode ? 'Copié ✓' : 'Copier'}
                  </button>
                </div>
              </div>

              <div className="mp-field">
                <span>Lien d'invitation</span>
                <div className="mp-invite-code-row">
                  <input
                    type="text"
                    value={inviteUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="mp-btn mp-btn-outline mp-btn-sm"
                    onClick={() => void copy(inviteUrl, 'link')}
                  >
                    {copiedLink ? 'Copié ✓' : 'Copier'}
                  </button>
                </div>
              </div>

              {/* Bloc envoi par email */}
              <div className="mp-modal-divider">
                <span className="mp-modal-divider-label">
                  📧 Envoyer par email directement
                </span>
                <div className="mp-modal-email-row">
                  <input
                    type="email"
                    placeholder="email@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onSendEmail();
                    }}
                    disabled={sending}
                  />
                  <button
                    type="button"
                    className="mp-btn mp-btn-primary mp-btn-sm"
                    disabled={sending || !email.trim()}
                    onClick={() => void onSendEmail()}
                  >
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </div>
                {emailSentTo ? (
                  <p className="mp-modal-email-sent" role="status">
                    ✓ Invitation envoyée à <strong>{emailSentTo}</strong>
                  </p>
                ) : null}
              </div>

              {localError ? (
                <p className="mp-form-error" role="alert">
                  {localError}
                </p>
              ) : null}

              <div className="mp-modal-actions">
                <button
                  type="button"
                  className="mp-btn mp-btn-primary"
                  onClick={resetAndClose}
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
