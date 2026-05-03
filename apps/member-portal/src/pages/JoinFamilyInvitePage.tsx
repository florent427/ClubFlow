import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ACCEPT_FAMILY_INVITE,
  PREVIEW_FAMILY_INVITE,
} from '../lib/viewer-documents';
import type {
  AcceptFamilyInviteData,
  PreviewFamilyInviteData,
} from '../lib/viewer-types';
import { getToken, hasMemberSession } from '../lib/storage';

function readInviteCode(params: URLSearchParams): string {
  return (params.get('code') ?? params.get('token') ?? '').trim();
}

/**
 * Page publique d'acceptation d'une invitation à rejoindre un foyer.
 * - Sans session : on affiche la prévisualisation puis on invite à se connecter.
 * - Avec session : on affiche la prévisualisation + bouton d'acceptation.
 */
export function JoinFamilyInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = readInviteCode(params);
  const loggedIn = Boolean(getToken());
  const hasSession = hasMemberSession();

  const [preview, setPreview] =
    useState<PreviewFamilyInviteData['previewFamilyInvite'] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [runPreview, { loading: previewLoading }] =
    useMutation<PreviewFamilyInviteData>(PREVIEW_FAMILY_INVITE);
  const [runAccept, { loading: accepting }] =
    useMutation<AcceptFamilyInviteData>(ACCEPT_FAMILY_INVITE);

  useEffect(() => {
    if (!code) {
      setPreviewError('Lien incomplet (code manquant).');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await runPreview({
          variables: { input: { code } },
        });
        if (cancelled) return;
        if (!data?.previewFamilyInvite) {
          setPreviewError('Invitation introuvable ou expirée.');
          return;
        }
        setPreview(data.previewFamilyInvite);
      } catch (err) {
        if (cancelled) return;
        setPreviewError(
          err instanceof Error
            ? err.message
            : 'Invitation introuvable ou expirée.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, runPreview]);

  async function onAccept() {
    setAcceptError(null);
    try {
      const { data } = await runAccept({ variables: { input: { code } } });
      const res = data?.acceptFamilyInvite;
      if (!res?.success) {
        setAcceptError(res?.message ?? 'Échec de l\u2019acceptation.');
        return;
      }
      setSuccess(res.message ?? 'Invitation acceptée.');
      setTimeout(() => {
        void navigate('/famille', { replace: true });
      }, 1800);
    } catch (err) {
      setAcceptError(
        err instanceof Error ? err.message : 'Échec de l\u2019acceptation.',
      );
    }
  }

  const inviterName = preview
    ? [preview.inviterFirstName, preview.inviterLastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'un proche'
    : '';
  const roleLabel = preview?.role === 'COPAYER' ? 'co-payeur' : 'observateur';

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <header className="auth-header">
          <p className="auth-eyebrow">ClubFlow</p>
          <h1>Invitation familiale</h1>
          {preview ? (
            <p className="auth-sub">
              {inviterName} vous invite à rejoindre son espace familial
              {preview.clubName ? ` chez ${preview.clubName}` : ''} en tant
              que <strong>{roleLabel}</strong>.
            </p>
          ) : previewLoading ? (
            <p className="auth-sub">Vérification de l'invitation…</p>
          ) : null}
        </header>

        {previewError ? (
          <div className="auth-error" role="alert">
            {previewError}
          </div>
        ) : null}

        {preview ? (
          <section className="auth-panel">
            <dl className="mp-kv">
              {preview.familyLabel ? (
                <>
                  <dt>Foyer</dt>
                  <dd>{preview.familyLabel}</dd>
                </>
              ) : null}
              <dt>Type d'accès</dt>
              <dd>
                {preview.role === 'COPAYER'
                  ? 'Co-payeur (espace partagé, même facturation)'
                  : 'Observateur (accès en lecture au foyer)'}
              </dd>
              <dt>Valable jusqu'au</dt>
              <dd>
                {new Date(preview.expiresAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </dd>
            </dl>

            {success ? (
              <p className="auth-success" role="status">
                {success}
              </p>
            ) : null}

            {acceptError ? (
              <p className="auth-error" role="alert">
                {acceptError}
              </p>
            ) : null}

            {loggedIn && hasSession ? (
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                disabled={accepting || Boolean(success)}
                onClick={() => void onAccept()}
              >
                {accepting
                  ? 'Acceptation…'
                  : success
                    ? 'Redirection…'
                    : 'Accepter l\u2019invitation'}
              </button>
            ) : loggedIn && !hasSession ? (
              <>
                <p className="mp-hint">
                  Sélectionnez d'abord votre profil pour continuer.
                </p>
                <Link
                  to={`/select-profile?returnTo=${encodeURIComponent(`/rejoindre?code=${encodeURIComponent(code)}`)}`}
                  className="mp-btn mp-btn-primary"
                >
                  Choisir un profil
                </Link>
              </>
            ) : (
              <>
                <p className="mp-hint">
                  Connectez-vous ou créez votre compte pour accepter cette
                  invitation.
                </p>
                <div className="auth-actions">
                  <Link
                    to={`/login?returnTo=${encodeURIComponent(`/rejoindre?code=${encodeURIComponent(code)}`)}`}
                    className="mp-btn mp-btn-primary"
                  >
                    Se connecter
                  </Link>
                  <Link
                    to={`/register?returnTo=${encodeURIComponent(`/rejoindre?code=${encodeURIComponent(code)}`)}`}
                    className="mp-btn mp-btn-outline"
                  >
                    Créer un compte
                  </Link>
                </div>
              </>
            )}
          </section>
        ) : null}

        <p className="auth-footer">
          <Link to="/" className="auth-link">
            Retour à l'accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
