import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  SET_SHOP_INSTALLMENT_THRESHOLD,
  SHOP_INSTALLMENT_THRESHOLD,
} from '../../lib/documents';

type ThresholdData = { shopInstallmentThresholdCents: number | null };
type SetData = { setShopInstallmentThreshold: number | null };

/**
 * Réglages de la boutique — pour l'instant, le seuil du paiement en 3×.
 *
 * Le seuil vit en CENTIMES côté serveur (source de vérité), mais l'admin
 * raisonne en euros : la saisie est en euros et convertie au dernier moment.
 * Un champ VIDE signifie « pas de 3× », et c'est distinct de « 0 € » — d'où un
 * état `string` (et non un nombre) pour ne pas confondre le vide avec zéro.
 */
export function ShopSettingsTab() {
  const { data, loading } = useQuery<ThresholdData>(SHOP_INSTALLMENT_THRESHOLD, {
    fetchPolicy: 'cache-and-network',
  });
  const [save, { loading: saving }] = useMutation<SetData>(
    SET_SHOP_INSTALLMENT_THRESHOLD,
    { refetchQueries: [{ query: SHOP_INSTALLMENT_THRESHOLD }] },
  );

  const [euros, setEuros] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // Initialise le champ depuis le serveur, une fois chargé.
  const serverCents = data?.shopInstallmentThresholdCents ?? null;
  useEffect(() => {
    setEuros(serverCents == null ? '' : (serverCents / 100).toString());
  }, [serverCents]);

  async function onSave() {
    setMessage(null);
    setErreur(null);
    const trimmed = euros.trim();
    let thresholdCents: number | null;
    if (trimmed === '') {
      thresholdCents = null; // vide = 3× désactivé
    } else {
      const val = Number(trimmed.replace(',', '.'));
      if (!Number.isFinite(val) || val < 0) {
        setErreur('Saisissez un montant en euros (ou laissez vide pour désactiver le 3×).');
        return;
      }
      thresholdCents = Math.round(val * 100);
    }
    try {
      const res = await save({ variables: { thresholdCents } });
      const saved = res.data?.setShopInstallmentThreshold ?? null;
      setMessage(
        saved == null
          ? 'Paiement en 3× désactivé pour la boutique.'
          : `Paiement en 3× proposé à partir de ${(saved / 100).toFixed(2)} €.`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.');
    }
  }

  if (loading && !data) return <p className="cf-muted">Chargement…</p>;

  return (
    <div className="cf-card" style={{ maxWidth: 520 }}>
      <h3>Paiement en plusieurs fois</h3>
      <p className="cf-field__hint">
        À partir de ce montant de commande, l’adhérent peut choisir de régler en
        3× par carte. En dessous, seul le paiement comptant est proposé. Laissez
        le champ <strong>vide</strong> pour désactiver le 3× dans la boutique.
      </p>

      <label className="cf-field">
        <span className="cf-field__label">Seuil du 3× (en euros)</span>
        <input
          type="text"
          inputMode="decimal"
          className="cf-input"
          placeholder="ex. 60 — vide = pas de 3×"
          value={euros}
          onChange={(e) => setEuros(e.target.value)}
        />
      </label>

      {erreur ? <p className="cf-error">{erreur}</p> : null}
      {message ? (
        <div className="cf-alert cf-alert--info">
          <div className="cf-alert__content">
            <span>{message}</span>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="cf-btn cf-btn--primary"
        onClick={() => void onSave()}
        disabled={saving}
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
}
