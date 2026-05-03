/**
 * Limites dures HARD-CODÉES appliquées à chaque tool. Ces limites sont
 * vérifiées côté serveur AVANT l'exécution et ne peuvent pas être
 * contournées par le LLM (jamais mentionnées dans le prompt).
 *
 * Si un tool dépasse une limite, il est refusé avec status BLOCKED_BY_LIMITS.
 */

export interface AgentToolLimits {
  /** Nombre max de messages du user par minute. */
  maxMessagesPerMinutePerUser: number;
  /** Nombre max de messages par jour / club. */
  maxMessagesPerDayPerClub: number;
  /** Nombre max d'itérations tool-call dans une boucle agent. */
  maxToolCallIterations: number;
  /** Nombre max de tools distincts par message. */
  maxToolCallsPerMessage: number;
  /** Taille max du texte user en entrée. */
  maxUserMessageLength: number;
  /** Timeout d'exécution par tool call (ms). */
  toolCallTimeoutMs: number;
  /** Durée de validité d'une PendingAction avant expiration auto. */
  pendingActionTtlMinutes: number;
}

export const AGENT_GLOBAL_LIMITS: AgentToolLimits = {
  maxMessagesPerMinutePerUser: 30,
  maxMessagesPerDayPerClub: 1000,
  maxToolCallIterations: 10,
  maxToolCallsPerMessage: 6,
  maxUserMessageLength: 8000,
  toolCallTimeoutMs: 30_000,
  pendingActionTtlMinutes: 5,
};

/**
 * Limites spécifiques par tool. Si un tool n'est pas listé, les limites
 * par défaut ci-dessous s'appliquent.
 *
 * Ces limites sont AU-DELÀ de ce que le LLM peut demander — elles
 * protègent contre un chaînage destructif.
 */
export interface ToolSpecificLimit {
  /** Nombre max d'entités ciblées par un seul appel (ex. recipients). */
  maxTargets?: number;
  /** Montant max en centimes (ex. pour factures, paiements, avoirs). */
  maxAmountCents?: number;
  /** Nombre max d'appels de ce tool dans une conversation. */
  maxCallsPerConversation?: number;
  /** Raison lisible affichée en cas de blocage. */
  reason?: string;
}

export const AGENT_TOOL_LIMITS: Record<string, ToolSpecificLimit> = {
  // Mass emails — cap à 100 destinataires par appel
  sendClubMessageCampaign: {
    maxTargets: 200,
    maxCallsPerConversation: 2,
    reason: 'Envoi en masse limité à 200 destinataires par appel et 2 envois par conversation.',
  },
  sendClubQuickMessage: {
    maxTargets: 100,
    maxCallsPerConversation: 5,
    reason: 'Envoi rapide limité à 100 destinataires et 5 appels par conversation.',
  },
  sendClubEventConvocation: {
    maxTargets: 500,
    maxCallsPerConversation: 3,
    reason: 'Convocations limitées à 500 destinataires et 3 appels par conversation.',
  },
  sendInvoiceReminder: {
    maxCallsPerConversation: 20,
    reason: 'Relances de paiement limitées à 20 par conversation.',
  },

  // Paiements / factures — cap à 5000 € par appel
  recordClubManualPayment: {
    maxAmountCents: 500_000,
    reason: 'Paiement manuel limité à 5000 € par appel (anti-saisie accidentelle).',
  },
  createClubInvoice: {
    maxAmountCents: 500_000,
    reason: 'Création de facture limitée à 5000 € (anti-montant accidentel).',
  },
  createMembershipInvoiceDraft: {
    maxAmountCents: 500_000,
    reason: 'Facture d\'adhésion limitée à 5000 € en création automatique.',
  },
  createClubCreditNote: {
    maxAmountCents: 500_000,
    reason: 'Avoir limité à 5000 €.',
  },
  clubApplyCartItemExceptionalDiscount: {
    maxAmountCents: 100_000,
    reason: 'Remise exceptionnelle limitée à 1000 €.',
  },

  // Bulk deletes — 1 seule entité par appel
  deleteClubMember: { maxCallsPerConversation: 3, reason: 'Suppression de membres limitée à 3 par conversation.' },
  deleteClubFamily: { maxCallsPerConversation: 2, reason: 'Suppression de foyers limitée à 2 par conversation.' },
  deleteClubEvent: { maxCallsPerConversation: 3, reason: 'Suppression d\'événements limitée à 3 par conversation.' },
  deleteVitrineArticle: { maxCallsPerConversation: 5, reason: 'Suppressions d\'articles limitées à 5 par conversation.' },
  deleteClubAccountingEntry: { maxCallsPerConversation: 5, reason: 'Suppressions comptables limitées à 5 par conversation.' },

  // Mutations sensibles — 1 par conversation
  updateClubBranding: { maxCallsPerConversation: 1, reason: 'Identité du club modifiable une seule fois par conversation.' },
  updateClubVitrineSettings: { maxCallsPerConversation: 1, reason: 'Paramètres vitrine modifiables une seule fois par conversation.' },
  updateClubAiSettings: { maxCallsPerConversation: 1, reason: "Configuration IA modifiable une seule fois par conversation (anti-abus). Pour plusieurs changements, commencer une nouvelle conversation." },
  clubValidateMembershipCart: { maxCallsPerConversation: 3, reason: 'Validation de paniers limitée à 3 par conversation.' },
};

export function getToolLimits(toolName: string): ToolSpecificLimit {
  return AGENT_TOOL_LIMITS[toolName] ?? {};
}
