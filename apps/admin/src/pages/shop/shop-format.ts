import type {
  ShopPurchaseOrderStatusGql,
  ShopReceiptDiscrepancyReasonGql,
} from '../../lib/types';

export function fmtEuros(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

/** « Produit — L / Rouge », ou le seul nom du produit si pas de déclinaison. */
export function variantDisplay(
  productName: string,
  label: string | null,
): string {
  return label ? `${productName} — ${label}` : productName;
}

/** Delta signé, « — » quand le compteur n'a pas bougé. */
export function fmtDelta(n: number): string {
  if (n === 0) return '—';
  return n > 0 ? `+${n}` : String(n);
}

// ---------------------------------------------------------------------------
// Honnêteté d'affichage du reporting (ADR-0013 §1)
//
// `avgCostCents`, `marginCents` et `marginRate` valent NULL quand le coût
// d'achat n'a jamais été renseigné. Les afficher « 0 € » dirait « acheté
// gratuitement » et « 100 % de marge » — deux mensonges à partir d'une seule
// absence de donnée. On écrit « — » et on le justifie en légende.
// ---------------------------------------------------------------------------

/** Montant en centimes, ou « — » si le coût n'est pas connu. JAMAIS « 0 € ». */
export function fmtCostOrUnknown(cents: number | null): string {
  if (cents === null) return '—';
  return fmtEuros(cents);
}

/** Taux 0–1 en pourcentage, ou « — ». Un prix nul n'a PAS un taux infini. */
export function fmtMarginRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${(rate * 100).toFixed(1).replace('.', ',')} %`;
}

// ---------------------------------------------------------------------------
// Statut de commande fournisseur
//
// CALCULÉ côté serveur après chaque réception (ADR-0013 §3). Cette fonction
// ne fait que le TRADUIRE : elle ne le déduit jamais des lignes, sous peine
// d'afficher un état qui contredit le serveur.
// ---------------------------------------------------------------------------

export type PurchaseStatusPill = {
  label: string;
  cls: 'ok' | 'warn' | 'muted' | 'danger';
  hint: string;
};

const PURCHASE_STATUS: Record<
  ShopPurchaseOrderStatusGql,
  PurchaseStatusPill
> = {
  DRAFT: {
    label: 'Brouillon',
    cls: 'muted',
    hint: 'Modifiable. Ne compte pas encore dans l’encours fournisseur.',
  },
  ORDERED: {
    label: 'Envoyée',
    cls: 'warn',
    hint: 'Chez le fournisseur. Les reliquats comptent dans « en commande ».',
  },
  PARTIALLY_RECEIVED: {
    label: 'Partiellement reçue',
    cls: 'warn',
    hint: 'Au moins une livraison enregistrée, au moins une ligne encore ouverte.',
  },
  RECEIVED: {
    label: 'Reçue',
    cls: 'ok',
    hint: 'Toutes les lignes soldées — reçues, ou closes courtes avec motif.',
  },
  CANCELLED: {
    label: 'Annulée',
    cls: 'danger',
    hint: 'Abandonnée. Les lignes ne comptent plus dans l’encours.',
  },
};

export function purchaseStatusPill(
  s: ShopPurchaseOrderStatusGql,
): PurchaseStatusPill {
  return PURCHASE_STATUS[s];
}

// ---------------------------------------------------------------------------
// Motifs d'écart — LE point qui compte (ADR-0013 §2)
//
// Le motif n'est pas une étiquette posée après coup sur un écart : c'est LUI
// qui décide si la ligne reste ouverte ou se solde définitivement. Un menu
// déroulant nu ferait solder par erreur des lignes qu'on attend encore, sans
// que personne ne voie passer la décision.
//
// D'où `keepsOpen` et `consequence` : l'interface AFFICHE, à côté de chaque
// choix et avant la validation, ce que ce choix va faire.
// ---------------------------------------------------------------------------

export type DiscrepancyReasonMeta = {
  value: ShopReceiptDiscrepancyReasonGql;
  label: string;
  /** Vrai pour le SEUL motif qui laisse la ligne ouverte : BACKORDER. */
  keepsOpen: boolean;
  /** Ce que ce choix fait, en clair, à afficher à côté du choix. */
  consequence: string;
  /** Le commentaire devient obligatoire. */
  requiresNote: boolean;
};

export const DISCREPANCY_REASONS: DiscrepancyReasonMeta[] = [
  {
    value: 'BACKORDER',
    label: 'Reliquat annoncé — le fournisseur doit encore livrer',
    keepsOpen: true,
    consequence:
      'La ligne RESTE OUVERTE : le manquant est toujours attendu, il continue de compter dans « en commande », et une prochaine réception pourra le solder.',
    requiresNote: false,
  },
  {
    value: 'SUPPLIER_SHORTAGE',
    label: 'Rupture définitive chez le fournisseur',
    keepsOpen: false,
    consequence:
      'La ligne est SOLDÉE COURTE : le manquant ne viendra jamais, il disparaît de « en commande » et plus aucune réception ne sera acceptée dessus.',
    requiresNote: false,
  },
  {
    value: 'DAMAGED_IN_TRANSIT',
    label: 'Casse ou perte pendant le transport',
    keepsOpen: false,
    consequence:
      'La ligne est SOLDÉE COURTE : le manquant ne viendra jamais, il disparaît de « en commande » et plus aucune réception ne sera acceptée dessus.',
    requiresNote: false,
  },
  {
    value: 'PICKING_ERROR',
    label: 'Erreur de préparation du fournisseur',
    keepsOpen: false,
    consequence:
      'La ligne est SOLDÉE COURTE : le manquant ne viendra jamais, il disparaît de « en commande » et plus aucune réception ne sera acceptée dessus.',
    requiresNote: false,
  },
  {
    value: 'OVER_DELIVERY',
    label: 'Livraison excédentaire — reçu plus que commandé',
    keepsOpen: false,
    consequence:
      'La ligne est SOLDÉE : le surplus entre bien en stock, et plus aucune réception ne sera acceptée dessus.',
    requiresNote: false,
  },
  {
    value: 'OTHER',
    label: 'Autre motif',
    keepsOpen: false,
    consequence:
      'La ligne est SOLDÉE COURTE : le manquant ne viendra jamais, il disparaît de « en commande » et plus aucune réception ne sera acceptée dessus.',
    requiresNote: true,
  },
];

export function discrepancyMeta(
  value: ShopReceiptDiscrepancyReasonGql,
): DiscrepancyReasonMeta {
  const found = DISCREPANCY_REASONS.find((r) => r.value === value);
  // Le tableau couvre l'énumération entière ; ce repli n'existe que pour ne
  // pas rendre la fonction faillible à l'appel.
  return found ?? DISCREPANCY_REASONS[DISCREPANCY_REASONS.length - 1]!;
}

/**
 * Ce que la saisie d'une ligne va produire, AVANT envoi.
 *
 * Miroir exact de la règle serveur : le motif est obligatoire dès que le
 * CUMUL reçu s'écarte du commandé, et seul BACKORDER laisse ouvert. Rendu
 * pur pour être lisible d'un coup d'œil — le serveur reste l'arbitre.
 */
export type ReceiptLinePreview = {
  cumulative: number;
  /** Reste attendu APRÈS cette réception, si la ligne reste ouverte. */
  remaining: number;
  /** Vrai si le cumul s'écarte du commandé : un motif devient obligatoire. */
  hasDiscrepancy: boolean;
  /** Vrai si, en l'état de la saisie, la ligne sera soldée. */
  willClose: boolean;
  /** Message bloquant, ou null si la saisie est envoyable. */
  blocker: string | null;
};

export function previewReceiptLine(input: {
  orderedQty: number;
  alreadyReceived: number;
  receivedQty: number;
  reason: ShopReceiptDiscrepancyReasonGql | null;
  note: string;
}): ReceiptLinePreview {
  const cumulative = input.alreadyReceived + input.receivedQty;
  const hasDiscrepancy = cumulative !== input.orderedQty;
  const meta = input.reason ? discrepancyMeta(input.reason) : null;

  let blocker: string | null = null;
  if (hasDiscrepancy && meta === null) {
    blocker = `Écart de réception (${cumulative} reçu sur ${input.orderedQty} commandés) : un motif est obligatoire.`;
  } else if (meta?.requiresNote && input.note.trim().length === 0) {
    blocker = 'Le motif « Autre » demande un commentaire.';
  }

  // Sans écart, la ligne est atteinte : elle se solde d'elle-même. Avec
  // écart, c'est le motif qui décide — et lui seul.
  const willClose = hasDiscrepancy ? (meta?.keepsOpen === false) : true;

  return {
    cumulative,
    remaining: Math.max(0, input.orderedQty - cumulative),
    hasDiscrepancy,
    willClose,
    blocker,
  };
}
