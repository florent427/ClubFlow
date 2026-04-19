import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { CREATE_FAMILY_INVITE } from '../lib/viewer-documents';
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
 */
export function InviteFamilyMemberCta() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<FamilyInviteRole>('COPAYER');
  const [result, setResult] = useState<InviteResult | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [createInvite, { loading }] = useMutation<CreateFamilyInviteData>(
    CREATE_FAMILY_INVITE,
  );

  function resetAndClose() {
    setOpen(false);
    setResult(null);
    setLocalError(null);
    setCopiedCode(false);
    setCopiedLink(false);
    setRole('COPAYER');
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
        err instanceof Error ? err.message : 'Impossible de générer l\u2019invitation.';
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
          onClick={() => !loading && resetAndClose()}
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
                    disabled={loading}
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
                    disabled={loading}
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
                  disabled={loading}
                  onClick={resetAndClose}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className="mp-btn mp-btn-primary"
                  disabled={loading}
                  onClick={() => void onGenerate()}
                >
                  {loading ? 'Génération…' : 'Générer l\u2019invitation'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mp-hint mp-modal-lede">
                Partagez ces informations avec la personne invitée. Le code
                et le lien expirent le{' '}
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
