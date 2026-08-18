import { useNavigate } from 'react-router-dom';

/**
 * CTA « M'inscrire comme membre » — renvoie vers le panier d'adhésion
 * (`/adhesion?inscription=moi`), qui ouvre la modale d'auto-inscription.
 *
 * ⚠️ Historique : ce composant portait sa propre modale et appelait
 * `viewerPromoteSelfToMember`, qui créait immédiatement la fiche `Member`
 * + une facture **DRAFT** — invisible et non payable pour l'adhérent. Le
 * membre se retrouvait inscrit sans panier ni page de paiement. Le seul
 * parcours d'adhésion valide est celui du panier
 * (`viewerRegisterSelfAsMember` → pending item → validation → facture
 * émise → Stripe), donc on redirige au lieu de dupliquer le formulaire.
 */
export function PromoteSelfToMemberCta() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="mp-btn mp-btn-primary"
      onClick={() => void navigate('/adhesion?inscription=moi')}
    >
      <span className="material-symbols-outlined" aria-hidden>
        person_check
      </span>
      M'inscrire comme membre
    </button>
  );
}
