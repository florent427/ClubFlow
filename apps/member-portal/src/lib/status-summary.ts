/**
 * Résumé « Où j'en suis » de l'accueil : paiements, documents, informations.
 *
 * Tout est calculé à partir de ce que l'API expose déjà (factures, échéanciers,
 * documents à signer, coordonnées manquantes). Les fonctions sont pures : la
 * date du jour est passée en paramètre, et une source absente (`null`) ne
 * produit aucune ligne plutôt qu'un « tout va bien » que rien ne prouve.
 */
import type { CoordinateGap, CoordinatesGap } from './coordinates';
import { formatEuroCents, formatShortDate } from './format';
import type {
  PaymentScheduleInstallmentStatus,
  ViewerPaymentSchedule,
} from './viewer-types';

/** `todo` et `alert` demandent une action ; `ok` et `info` n'en demandent pas. */
export type StatusTone = 'ok' | 'todo' | 'alert' | 'info';

export type StatusItem = {
  id: string;
  tone: StatusTone;
  title: string;
  detail?: string;
  /** Montant affiché à droite de la ligne (reste dû). */
  amount?: string;
  to?: string;
  cta?: string;
};

export type StatusFigure = { label: string; value: string };

export type StatusSectionKey = 'payments' | 'documents' | 'infos';

export type StatusSection = {
  key: StatusSectionKey;
  title: string;
  icon: string;
  figures: StatusFigure[];
  items: StatusItem[];
};

export type SummaryInvoice = {
  id: string;
  label: string;
  dueAt: string | null;
  totalPaidCents: number;
  balanceCents: number;
  coveredBySchedule: boolean;
  awaitingCardSetup: boolean;
};

export type SummaryCart = {
  itemsCount: number;
  totalCents: number;
  canValidate: boolean;
};

/** Au-delà, les factures ouvertes restantes sont regroupées sur une ligne. */
export const MAX_INVOICE_LINES = 4;

/** Un certificat qui expire dans ce délai est signalé avant l'échéance. */
export const CERT_WARNING_DAYS = 30;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isBefore(iso: string, today: Date): boolean {
  return startOfDay(new Date(iso)).getTime() < startOfDay(today).getTime();
}

function daysUntil(iso: string, today: Date): number {
  const ms =
    startOfDay(new Date(iso)).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86_400_000);
}

function invoiceLink(invoiceId: string): string {
  return `/factures?facture=${encodeURIComponent(invoiceId)}`;
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

// ── Paiements ────────────────────────────────────────────────────────

const ATTENTION_ORDER: PaymentScheduleInstallmentStatus[] = [
  'FAILED_FINAL',
  'REQUIRES_ACTION',
  'FAILED_RETRYABLE',
];

/** Une échéance encore attendue : ni réglée, ni annulée. */
function isUpcoming(status: PaymentScheduleInstallmentStatus): boolean {
  return status === 'SCHEDULED' || status === 'PROCESSING';
}

function scheduleMethodSuffix(method: ViewerPaymentSchedule['method']): string {
  switch (method) {
    case 'CARD':
      return 'prélevé sur votre carte';
    case 'SEPA_DEBIT':
      return 'prélevé sur votre compte';
    case 'MANUAL_TRANSFER':
      return 'par virement, à faire de votre côté';
  }
}

function scheduleItem(
  inv: SummaryInvoice,
  schedule: ViewerPaymentSchedule,
  today: Date,
): StatusItem {
  const base = {
    id: `invoice-${inv.id}`,
    title: inv.label,
    amount: formatEuroCents(inv.balanceCents),
    to: invoiceLink(inv.id),
  };
  const live = schedule.installments.filter((i) => i.status !== 'CANCELLED');
  const paidCount = live.filter((i) => i.status === 'PAID').length;
  const progress = `${paidCount} ${plural(paidCount, 'versement réglé', 'versements réglés')} sur ${live.length}`;

  const worst = ATTENTION_ORDER.find((s) => live.some((i) => i.status === s));
  if (worst === 'FAILED_FINAL') {
    return {
      ...base,
      tone: 'alert',
      detail: `Un versement n’a pas pu être encaissé. Le montant reste dû. ${progress}.`,
      cta: 'Régulariser',
    };
  }
  if (worst === 'REQUIRES_ACTION') {
    return {
      ...base,
      tone: 'alert',
      detail: `Votre banque attend votre confirmation pour un versement. ${progress}.`,
      cta: 'Confirmer',
    };
  }
  if (worst === 'FAILED_RETRYABLE') {
    return {
      ...base,
      tone: 'alert',
      detail: `Un prélèvement a été refusé. Une nouvelle tentative est prévue : vérifiez votre moyen de paiement. ${progress}.`,
      cta: 'Vérifier',
    };
  }

  const next = live
    .filter((i) => isUpcoming(i.status))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  if (!next) {
    return { ...base, tone: 'info', detail: `Échéancier en cours. ${progress}.` };
  }
  const nextLabel = `${formatEuroCents(next.amountCents)} le ${formatShortDate(next.dueOn)}`;
  // Un virement n'est pas prélevé : passé la date, c'est à l'adhérent d'agir.
  if (schedule.method === 'MANUAL_TRANSFER' && isBefore(next.dueOn, today)) {
    return {
      ...base,
      tone: 'todo',
      detail: `Virement de ${nextLabel} attendu. ${progress}.`,
      cta: 'Voir le RIB',
    };
  }
  return {
    ...base,
    tone: 'ok',
    detail: `Échéancier en cours : ${progress}. Prochain : ${nextLabel}, ${scheduleMethodSuffix(schedule.method)}.`,
    cta: 'Détail',
  };
}

function invoiceItem(
  inv: SummaryInvoice,
  schedule: ViewerPaymentSchedule | null | undefined,
  today: Date,
): StatusItem {
  const base = {
    id: `invoice-${inv.id}`,
    title: inv.label,
    amount: formatEuroCents(inv.balanceCents),
    to: invoiceLink(inv.id),
  };
  if (inv.awaitingCardSetup) {
    return {
      ...base,
      tone: 'alert',
      detail:
        'Échéancier créé, mais aucun moyen de paiement enregistré : rien ne sera prélevé tant que ce n’est pas fait.',
      cta: 'Enregistrer ma carte',
    };
  }
  if (inv.coveredBySchedule) {
    if (schedule) return scheduleItem(inv, schedule, today);
    return { ...base, tone: 'info', detail: 'Réglée par échéancier.', cta: 'Détail' };
  }
  if (inv.dueAt && isBefore(inv.dueAt, today)) {
    return {
      ...base,
      tone: 'alert',
      detail: `Échéance dépassée depuis le ${formatShortDate(inv.dueAt)}.`,
      cta: 'Payer',
    };
  }
  return {
    ...base,
    tone: 'todo',
    detail: inv.dueAt
      ? `À régler avant le ${formatShortDate(inv.dueAt)}.`
      : 'À régler.',
    cta: 'Payer',
  };
}

export type PaymentsInput = {
  /** `null` : facturation indisponible ou pas encore chargée. */
  billing: { isPayerView: boolean; invoices: SummaryInvoice[] } | null;
  /** Échéancier par facture ; clé absente = pas encore chargé. */
  schedules: Record<string, ViewerPaymentSchedule | null | undefined>;
  cart: SummaryCart | null;
  today: Date;
};

export function paymentsSection(input: PaymentsInput): StatusSection {
  const { billing, schedules, cart, today } = input;
  const section: StatusSection = {
    key: 'payments',
    title: 'Paiements',
    icon: 'account_balance_wallet',
    figures: [],
    items: [],
  };

  if (cart && cart.itemsCount > 0) {
    section.items.push({
      id: 'cart',
      tone: 'todo',
      title: `Panier d’adhésion en cours (${cart.itemsCount})`,
      detail: `Total ${formatEuroCents(cart.totalCents)}, ${cart.canValidate ? 'prêt à valider' : 'à compléter'}.`,
      to: '/adhesion',
      cta: cart.canValidate ? 'Valider' : 'Compléter',
    });
  }

  if (!billing) return section;
  if (!billing.isPayerView) {
    section.items.push({
      id: 'not-payer',
      tone: 'info',
      title: 'Paiements gérés par le payeur de votre foyer',
      detail: 'Vous n’avez rien à régler depuis ce profil.',
    });
    return section;
  }

  const open = billing.invoices.filter((i) => i.balanceCents > 0);
  const totalBalance = open.reduce((s, i) => s + i.balanceCents, 0);
  const totalPaid = billing.invoices.reduce((s, i) => s + i.totalPaidCents, 0);
  section.figures = [
    { label: 'Reste à payer', value: formatEuroCents(totalBalance) },
    { label: 'Déjà réglé', value: formatEuroCents(totalPaid) },
  ];

  for (const inv of open.slice(0, MAX_INVOICE_LINES)) {
    section.items.push(invoiceItem(inv, schedules[inv.id], today));
  }
  const hidden = open.length - MAX_INVOICE_LINES;
  if (hidden > 0) {
    section.items.push({
      id: 'invoices-more',
      tone: 'info',
      title: `${hidden} ${plural(hidden, 'autre facture ouverte', 'autres factures ouvertes')}`,
      to: '/factures',
      cta: 'Tout voir',
    });
  }

  if (open.length === 0) {
    section.items.push(
      billing.invoices.length === 0
        ? {
            id: 'no-invoice',
            tone: 'info',
            title: 'Aucune facture pour le moment',
          }
        : {
            id: 'all-paid',
            tone: 'ok',
            title: 'Tout est réglé',
            detail: 'Aucun solde en attente.',
            to: '/factures',
            cta: 'Mes factures',
          },
    );
  }
  return section;
}

// ── Documents ────────────────────────────────────────────────────────

export type DocumentsInput = {
  /** `null` : module documents coupé, en erreur ou pas encore chargé. */
  documentsToSign: { id: string; name: string; isRequired: boolean }[] | null;
  /** `null` : profil sans certificat médical (contact payeur). */
  medicalCert: { expiresAt: string | null; required: boolean } | null;
  today: Date;
};

function medicalCertItem(
  cert: { expiresAt: string | null; required: boolean },
  today: Date,
): StatusItem | null {
  const id = 'medical-cert';
  if (!cert.expiresAt) {
    if (!cert.required) return null;
    return {
      id,
      tone: 'todo',
      title: 'Certificat médical à fournir',
      detail: 'Remettez-le à votre club, qui l’enregistrera sur votre fiche.',
    };
  }
  const date = formatShortDate(cert.expiresAt);
  const days = daysUntil(cert.expiresAt, today);
  if (days < 0) {
    // Un club qui n'exige pas de certificat n'a rien à réclamer.
    if (!cert.required) return null;
    return {
      id,
      tone: 'alert',
      title: 'Certificat médical expiré',
      detail: `Expiré depuis le ${date}. Remettez un nouveau certificat à votre club.`,
    };
  }
  if (days <= CERT_WARNING_DAYS && cert.required) {
    return {
      id,
      tone: 'todo',
      title: 'Certificat médical bientôt expiré',
      detail: `Valide jusqu’au ${date}. Pensez à le renouveler.`,
    };
  }
  return {
    id,
    tone: 'ok',
    title: 'Certificat médical valide',
    detail: `Jusqu’au ${date}.`,
  };
}

export function documentsSection(input: DocumentsInput): StatusSection {
  const { documentsToSign, medicalCert, today } = input;
  const section: StatusSection = {
    key: 'documents',
    title: 'Documents',
    icon: 'description',
    figures: [],
    items: [],
  };

  if (documentsToSign) {
    // Les documents obligatoires d'abord : ce sont eux qui bloquent.
    const sorted = [...documentsToSign].sort(
      (a, b) => Number(b.isRequired) - Number(a.isRequired),
    );
    for (const doc of sorted) {
      section.items.push({
        id: `doc-${doc.id}`,
        tone: doc.isRequired ? 'todo' : 'info',
        title: doc.name,
        detail: doc.isRequired
          ? 'Signature obligatoire.'
          : 'Signature facultative.',
        to: '/documents-a-signer',
        cta: 'Signer',
      });
    }
    if (sorted.length === 0) {
      section.items.push({
        id: 'docs-none',
        tone: 'ok',
        title: 'Aucun document en attente de signature',
      });
    }
  }

  if (medicalCert) {
    const item = medicalCertItem(medicalCert, today);
    if (item) section.items.push(item);
  }
  return section;
}

// ── Informations ─────────────────────────────────────────────────────

const GAP_TITLE: Record<CoordinateGap, string> = {
  PHONE: 'Téléphone portable à renseigner',
  ADDRESS: 'Adresse postale à compléter',
  BIRTH_PLACE: 'Lieu de naissance à renseigner',
};

const GAP_WORD: Record<CoordinateGap, string> = {
  PHONE: 'téléphone',
  ADDRESS: 'adresse',
  BIRTH_PLACE: 'lieu de naissance',
};

export type InfosInput = {
  /** `null` : statut des coordonnées indisponible ou pas encore chargé. */
  coordinateGaps: Pick<CoordinatesGap, 'target' | 'targetId' | 'displayName' | 'missing'>[] | null;
  /**
   * Champs du profil que le club déclare obligatoires et qui sont vides.
   * `null` : profil pas encore chargé.
   */
  missingRequiredFields: { key: string; label: string }[] | null;
};

/** Champs du profil déjà couverts par une lacune de coordonnées. */
const FIELD_COVERED_BY: Record<string, CoordinateGap> = {
  PHONE: 'PHONE',
  ADDRESS_LINE: 'ADDRESS',
  POSTAL_CODE: 'ADDRESS',
  CITY: 'ADDRESS',
};

export function infosSection(input: InfosInput): StatusSection {
  const { coordinateGaps, missingRequiredFields } = input;
  const section: StatusSection = {
    key: 'infos',
    title: 'Informations',
    icon: 'badge',
    figures: [],
    items: [],
  };
  if (!coordinateGaps && !missingRequiredFields) return section;

  const accountMissing = new Set<CoordinateGap>();
  for (const gap of coordinateGaps ?? []) {
    if (gap.target === 'ACCOUNT') {
      for (const missing of gap.missing) {
        accountMissing.add(missing);
        section.items.push({
          id: `account-${missing}`,
          tone: 'todo',
          title: GAP_TITLE[missing],
          to: '/parametres',
          cta: 'Compléter',
        });
      }
      continue;
    }
    section.items.push({
      id: `${gap.target}-${gap.targetId ?? gap.displayName}`,
      tone: 'todo',
      title: `Coordonnées de ${gap.displayName} à compléter`,
      detail: `Manque : ${gap.missing.map((m) => GAP_WORD[m]).join(', ')}.`,
      to: '/adhesion',
      cta: 'Compléter',
    });
  }

  for (const field of missingRequiredFields ?? []) {
    const coveredBy = FIELD_COVERED_BY[field.key];
    if (coveredBy && accountMissing.has(coveredBy)) continue;
    section.items.push({
      id: `field-${field.key}`,
      tone: 'todo',
      title: `${field.label} à renseigner`,
      to: '/parametres',
      cta: 'Compléter',
    });
  }

  // « Complet » ne se déduit que du statut des coordonnées : sans lui, les
  // champs du profil seuls ne disent rien du téléphone ni de l'adresse.
  if (section.items.length === 0 && coordinateGaps) {
    section.items.push({
      id: 'infos-ok',
      tone: 'ok',
      title: 'Vos informations sont complètes',
      to: '/parametres',
      cta: 'Modifier',
    });
  }
  return section;
}

// ── Synthèse ─────────────────────────────────────────────────────────

/** Nombre de lignes qui attendent une action de l'adhérent. */
export function countActions(sections: StatusSection[]): number {
  return sections.reduce(
    (n, s) =>
      n + s.items.filter((i) => i.tone === 'todo' || i.tone === 'alert').length,
    0,
  );
}

export function actionsLabel(count: number): string {
  if (count === 0) return 'Tout est en ordre';
  return `${count} ${plural(count, 'action à faire', 'actions à faire')}`;
}
