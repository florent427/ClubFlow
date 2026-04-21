import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { CLUB_BRANDING, UPDATE_CLUB_BRANDING } from '../../lib/documents';
import type {
  ClubBrandingQueryData,
  UpdateClubBrandingMutationData,
} from '../../lib/types';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ToastProvider';

/**
 * Paramètres d'identité du club : logo, SIRET, adresse, mentions légales.
 * Ces champs alimentent les PDF (facture, avoir) et l'en-tête des documents
 * officiels.
 *
 * Le logo est stocké en data-URL (base64) pour éviter de dépendre d'un
 * hébergement fichier. Limité à ~400 Ko de PNG/JPEG → convient pour un pied
 * d'en-tête A4.
 */

const LOGO_MAX_BYTES = 400 * 1024;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function ClubBrandingSettingsPage() {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useQuery<ClubBrandingQueryData>(
    CLUB_BRANDING,
    { fetchPolicy: 'cache-and-network' },
  );
  const [updateBranding, updateState] =
    useMutation<UpdateClubBrandingMutationData>(UPDATE_CLUB_BRANDING);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [siret, setSiret] = useState('');
  const [address, setAddress] = useState('');
  const [legalMentions, setLegalMentions] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = data?.club;
    if (!c) return;
    setLogoUrl(c.logoUrl);
    setSiret(c.siret ?? '');
    setAddress(c.address ?? '');
    setLegalMentions(c.legalMentions ?? '');
  }, [data?.club]);

  async function handlePickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      setFormError('Format d’image non supporté (PNG, JPEG, WebP, SVG).');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setFormError(
        `Logo trop volumineux (${Math.round(file.size / 1024)} Ko, max ${LOGO_MAX_BYTES / 1024} Ko).`,
      );
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setLogoUrl(url);
      setFormError(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lecture impossible');
    }
  }

  function handleRemoveLogo() {
    setLogoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await updateBranding({
        variables: {
          input: {
            logoUrl: logoUrl ?? null,
            siret: siret.trim() || null,
            address: address.trim() || null,
            legalMentions: legalMentions.trim() || null,
          },
        },
      });
      showToast('Identité du club mise à jour', 'success');
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      setFormError(msg);
      showToast(msg, 'error');
    }
  }

  if (loading && !data) return <LoadingState label="Chargement…" />;
  if (error) {
    return (
      <ErrorState
        title="Impossible de charger l’identité du club"
        message={error.message}
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => void refetch()}
          >
            Réessayer
          </button>
        }
      />
    );
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">Paramètres</p>
        <h1 className="members-loom__title">Identité du club</h1>
        <p className="members-loom__lede">
          Informations imprimées sur les factures, avoirs et documents
          officiels générés par ClubFlow (logo, SIRET, mentions légales).
        </p>
      </header>

      <div className="members-loom__grid members-loom__grid--single">
        <section className="members-panel">
          <h2 className="members-panel__h">Logo et en-tête</h2>
          <form className="cf-branding-form" onSubmit={handleSubmit}>
            <div className="cf-branding-logo">
              <div className="cf-branding-logo__preview">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo du club"
                    className="cf-branding-logo__img"
                  />
                ) : (
                  <span className="cf-branding-logo__empty">
                    Pas de logo — en-tête texte seul.
                  </span>
                )}
              </div>
              <div className="cf-branding-logo__actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handlePickLogo}
                  className="cf-branding-logo__file"
                />
                {logoUrl ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleRemoveLogo}
                  >
                    Retirer le logo
                  </button>
                ) : null}
                <p className="cf-branding-logo__hint">
                  PNG / JPEG / WebP / SVG · max 400 Ko. Le logo est affiché en
                  en-tête des PDF.
                </p>
              </div>
            </div>

            <div className="cf-form-row">
              <label className="cf-field">
                <span className="cf-field__label">SIRET</span>
                <input
                  className="cf-field__input"
                  type="text"
                  value={siret}
                  onChange={(e) => setSiret(e.target.value)}
                  maxLength={32}
                  placeholder="14 chiffres sans espaces"
                />
              </label>
            </div>

            <label className="cf-field">
              <span className="cf-field__label">Adresse</span>
              <textarea
                className="cf-field__input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="12 rue du sport — 75011 Paris"
              />
            </label>

            <label className="cf-field">
              <span className="cf-field__label">Mentions légales</span>
              <textarea
                className="cf-field__input"
                value={legalMentions}
                onChange={(e) => setLegalMentions(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Association loi 1901 — n° RNA W0000000. TVA non applicable, art. 293 B du CGI."
              />
              <span className="cf-field__hint">
                Imprimées en pied de page des factures et avoirs.
              </span>
            </label>

            {formError ? (
              <p className="cf-form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="cf-form-actions">
              <button
                type="submit"
                className="btn-primary"
                disabled={updateState.loading}
              >
                {updateState.loading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
