import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { useToast } from './ToastProvider';
import {
  GENERATE_SHOP_PRODUCT_DESCRIPTION,
  type GenerateShopProductDescriptionData,
} from '../lib/ai-documents';

/** Bornes alignées sur `GenerateShopProductDescriptionInput` côté API. */
const SOURCE_MIN = 20;
const SOURCE_MAX = 6000;

interface Props {
  /** Nom du produit en cours de saisie — sert de contexte au modèle. */
  productName: string;
  /** Appelé quand l'admin valide la proposition qu'il vient de relire. */
  onApply: (description: string) => void;
  /** Ferme le panneau sans rien appliquer. */
  onClose: () => void;
}

/**
 * Réécriture IA d'un descriptif fournisseur.
 *
 * Déroulé : l'admin colle le texte du catalogue → l'IA propose → **l'admin
 * relit et corrige dans une zone éditable** → il applique explicitement.
 *
 * La proposition n'écrase JAMAIS le champ description toute seule : c'est un
 * clic distinct, après lecture. Une génération qui s'applique dans le dos
 * écrase un texte que l'admin avait peut-être déjà rédigé.
 */
export function AiProductDescriptionPanel({
  productName,
  onApply,
  onClose,
}: Props) {
  const { showToast } = useToast();
  const [sourceText, setSourceText] = useState('');
  /** Null tant qu'aucune génération n'a abouti. */
  const [proposition, setProposition] = useState<string | null>(null);

  const [generate, { loading }] =
    useMutation<GenerateShopProductDescriptionData>(
      GENERATE_SHOP_PRODUCT_DESCRIPTION,
    );

  const nom = productName.trim();
  const source = sourceText.trim();
  const sourceTropCourte = source.length < SOURCE_MIN;

  async function onGenerate() {
    if (!nom) {
      showToast(
        'Renseignez d’abord le nom du produit : il sert de contexte à l’IA.',
        'error',
      );
      return;
    }
    if (sourceTropCourte) {
      showToast(
        `Collez le descriptif fournisseur (${SOURCE_MIN} caractères minimum).`,
        'error',
      );
      return;
    }
    try {
      const res = await generate({
        variables: {
          input: { productName: nom, supplierText: source.slice(0, SOURCE_MAX) },
        },
      });
      const texte = res.data?.generateShopProductDescription.description;
      if (!texte) throw new Error('Réponse vide');
      setProposition(texte);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <div className="cf-ai-panel">
      <div className="cf-ai-panel__head">
        <strong>Rédiger avec l’IA</strong>
        <button
          type="button"
          className="btn-ghost btn-ghost--sm"
          onClick={onClose}
          aria-label="Fermer"
        >
          <span className="material-symbols-outlined" aria-hidden>
            close
          </span>
        </button>
      </div>

      <label className="cf-field">
        <span className="cf-field__label">
          Descriptif du catalogue fournisseur
        </span>
        <textarea
          className="cf-input cf-textarea"
          value={sourceText}
          onChange={(e) => setSourceText(e.target.value)}
          rows={5}
          maxLength={SOURCE_MAX}
          disabled={loading}
          placeholder="Collez ici le texte brut du fournisseur (matière, coupe, tailles, entretien…)"
        />
        <span className="cf-field__hint">
          {source.length} / {SOURCE_MAX} caractères — {SOURCE_MIN} minimum.
        </span>
      </label>

      <div className="cf-form-actions">
        <button
          type="button"
          className="cf-btn cf-btn--primary cf-btn--sm"
          onClick={() => void onGenerate()}
          disabled={loading || sourceTropCourte}
          // `aria-busy` : le lecteur d'écran annonce l'attente, il n'y a pas
          // que le libellé qui change.
          aria-busy={loading}
        >
          {loading
            ? 'Rédaction en cours…'
            : proposition
              ? 'Régénérer'
              : 'Générer la description'}
        </button>
      </div>

      {loading ? (
        <p className="cf-muted" role="status">
          L’IA rédige la description — cela prend quelques secondes. Inutile de
          recliquer.
        </p>
      ) : null}

      {proposition !== null ? (
        <>
          <label className="cf-field">
            <span className="cf-field__label">
              Proposition — relisez et corrigez avant d’appliquer
            </span>
            <textarea
              className="cf-input cf-textarea"
              value={proposition}
              onChange={(e) => setProposition(e.target.value)}
              rows={5}
              maxLength={4000}
            />
          </label>
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn cf-btn--sm"
              onClick={onClose}
            >
              Abandonner
            </button>
            <button
              type="button"
              className="cf-btn cf-btn--primary cf-btn--sm"
              onClick={() => onApply(proposition)}
              disabled={proposition.trim().length === 0}
            >
              Utiliser cette description
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
