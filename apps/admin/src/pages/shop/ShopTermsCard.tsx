import { useMutation, useQuery } from '@apollo/client/react';
import { useRef, useState, type ChangeEvent } from 'react';
import { SET_SHOP_TERMS, SHOP_TERMS } from '../../lib/documents';
import { getClubId, getToken } from '../../lib/storage';
import type {
  SetShopTermsMutationData,
  ShopTermsQueryData,
} from '../../lib/types';

/** Limite serveur d'un document (`MediaAssetsService.MAX_BYTES`). */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function apiBase(): string {
  return (
    (import.meta.env as Record<string, string | undefined>)
      .VITE_GRAPHQL_HTTP?.replace(/\/graphql.*$/, '') ?? 'http://localhost:3000'
  );
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' });
}

/**
 * Conditions générales de vente de la boutique (ADR-0017).
 *
 * Deux temps, comme partout où l'admin dépose un fichier : le PDF est
 * téléversé (`POST /media/upload`), puis désigné comme CGV par une mutation.
 * C'est elle qui vérifie qu'il s'agit d'un PDF du club et le rend public.
 *
 * Remplacer n'efface rien : l'ancienne version reste la preuve de ce qu'ont
 * accepté les commandes passées sous elle.
 */
export function ShopTermsCard() {
  const { data, loading } = useQuery<ShopTermsQueryData>(SHOP_TERMS, {
    fetchPolicy: 'cache-and-network',
  });
  const [setTerms, { loading: saving }] =
    useMutation<SetShopTermsMutationData>(SET_SHOP_TERMS, {
      refetchQueries: [{ query: SHOP_TERMS }],
      awaitRefetchQueries: true,
    });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const terms = data?.shopTerms ?? null;
  const busy = uploading || saving;

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Vider le champ permet de redéposer le même fichier après une erreur.
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    setErreur(null);
    if (file.type !== 'application/pdf') {
      setErreur('Choisissez un fichier PDF.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setErreur('Le PDF dépasse 10 Mo.');
      return;
    }
    const token = getToken();
    const clubId = getClubId();
    if (!token || !clubId) {
      setErreur('Session expirée : reconnectez-vous.');
      return;
    }
    const remplacement = terms !== null;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${apiBase()}/media/upload?kind=document&ownerKind=SHOP_TERMS&ownerId=${encodeURIComponent(clubId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'X-Club-Id': clubId },
          body: form,
        },
      );
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        message?: unknown;
      } | null;
      if (!res.ok || !body?.id) {
        throw new Error(
          typeof body?.message === 'string'
            ? body.message
            : `Téléversement impossible (HTTP ${res.status}).`,
        );
      }
      await setTerms({ variables: { mediaAssetId: body.id } });
      setMessage(
        remplacement
          ? 'Nouvelles CGV en ligne : les prochaines commandes devront les accepter.'
          : 'CGV en ligne : toute commande d’adhérent devra désormais les accepter.',
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    if (
      !window.confirm(
        'Retirer les conditions générales de vente ? Les adhérents pourront commander sans les accepter.',
      )
    ) {
      return;
    }
    setMessage(null);
    setErreur(null);
    try {
      await setTerms({ variables: { mediaAssetId: null } });
      setMessage('CGV retirées de la boutique.');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Retrait impossible.');
    }
  }

  return (
    <div className="cf-card">
      <h3>Conditions générales de vente</h3>
      <p className="cf-field__hint">
        Un PDF que l’adhérent doit accepter avant toute commande, sur le portail
        comme dans l’application. C’est le serveur qui vérifie l’acceptation :
        sans elle, la commande est refusée.
      </p>

      {loading && !data ? (
        <p className="cf-muted">Chargement…</p>
      ) : terms ? (
        <p>
          <a href={terms.url} target="_blank" rel="noreferrer">
            {terms.fileName}
          </a>
          {terms.updatedAt ? (
            <span className="cf-muted">
              {' '}
              · en ligne depuis le {fmtDay(terms.updatedAt)}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="cf-muted">
          Aucune CGV en ligne : les adhérents commandent sans acceptation.
        </p>
      )}

      <p className="cf-field__hint">
        Les versions de l’application mobile antérieures à cette fonction ne
        savent pas proposer les CGV : tant que des CGV sont en ligne, leurs
        commandes sont refusées avec un message invitant à mettre l’application
        à jour.
      </p>

      {erreur ? <p className="cf-error">{erreur}</p> : null}
      {message ? (
        <div className="cf-alert cf-alert--info">
          <div className="cf-alert__content">
            <span>{message}</span>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => void onPickFile(e)}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? 'Téléversement…'
            : terms
              ? 'Remplacer le PDF'
              : 'Déposer le PDF'}
        </button>
        {terms ? (
          <button
            type="button"
            className="cf-btn cf-btn--danger"
            disabled={busy}
            onClick={() => void onRemove()}
          >
            Retirer
          </button>
        ) : null}
      </div>
    </div>
  );
}
