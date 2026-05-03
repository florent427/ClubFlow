import { gql } from '@apollo/client';

/**
 * Module Facturation — aligné avec apps/api/src/payments/payments.resolver.ts.
 * Statuts : DRAFT / OPEN / PAID / VOID
 * Méthodes : STRIPE_CARD | MANUAL_CASH | MANUAL_CHECK | MANUAL_TRANSFER
 */

export const CLUB_INVOICES = gql`
  query ClubInvoices {
    clubInvoices {
      id
      familyId
      familyLabel
      householdGroupLabel
      clubSeasonId
      label
      baseAmountCents
      amountCents
      status
      lockedPaymentMethod
      dueAt
      totalPaidCents
      balanceCents
      isCreditNote
      parentInvoiceId
      creditNoteReason
    }
  }
`;

export const CLUB_OVERDUE_INVOICES = gql`
  query ClubOverdueInvoices {
    clubOverdueInvoices {
      invoiceId
      label
      dueAt
      balanceCents
      payerEmail
      payerName
      lastRemindedAt
      canSendReminder
      nextReminderAvailableAt
    }
  }
`;

export const CLUB_INVOICE = gql`
  query ClubInvoice($id: String!) {
    clubInvoice(id: $id) {
      id
      familyId
      familyLabel
      clubSeasonId
      clubSeasonLabel
      label
      baseAmountCents
      amountCents
      totalPaidCents
      balanceCents
      status
      lockedPaymentMethod
      dueAt
      createdAt
      isCreditNote
      parentInvoiceId
      creditNoteReason
      lines {
        id
        kind
        memberId
        memberFirstName
        memberLastName
        membershipProductLabel
        membershipOneTimeFeeLabel
        subscriptionBillingRhythm
        baseAmountCents
        adjustments {
          id
          stepOrder
          type
          amountCents
          percentAppliedBp
          reason
        }
      }
      payments {
        id
        amountCents
        method
        externalRef
        paidByFirstName
        paidByLastName
        createdAt
      }
    }
  }
`;

export const RECORD_CLUB_MANUAL_PAYMENT = gql`
  mutation RecordClubManualPayment($input: RecordManualPaymentInput!) {
    recordClubManualPayment(input: $input) {
      id
      invoiceId
      amountCents
      method
      externalRef
      createdAt
    }
  }
`;

export const ISSUE_CLUB_INVOICE = gql`
  mutation IssueClubInvoice($id: String!) {
    issueClubInvoice(id: $id) {
      id
      status
    }
  }
`;

export const VOID_CLUB_INVOICE = gql`
  mutation VoidClubInvoice($id: String!, $reason: String) {
    voidClubInvoice(id: $id, reason: $reason) {
      id
      status
    }
  }
`;

export const SEND_INVOICE_REMINDER = gql`
  mutation SendInvoiceReminder($invoiceId: String!) {
    sendInvoiceReminder(invoiceId: $invoiceId) {
      sentTo
    }
  }
`;

export const CREATE_CLUB_CREDIT_NOTE = gql`
  mutation CreateClubCreditNote(
    $parentInvoiceId: String!
    $reason: String!
    $amountCents: Float
  ) {
    createClubCreditNote(
      parentInvoiceId: $parentInvoiceId
      reason: $reason
      amountCents: $amountCents
    ) {
      id
      status
      isCreditNote
    }
  }
`;

export const PAYMENT_METHODS = ['MANUAL_CASH', 'MANUAL_CHECK', 'MANUAL_TRANSFER', 'STRIPE_CARD'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MANUAL_CASH: 'Espèces',
  MANUAL_CHECK: 'Chèque',
  MANUAL_TRANSFER: 'Virement',
  STRIPE_CARD: 'Carte (Stripe)',
};

export const PAYMENT_METHOD_ICONS: Record<
  PaymentMethod,
  'cash-outline' | 'document-text-outline' | 'swap-horizontal-outline' | 'card-outline'
> = {
  MANUAL_CASH: 'cash-outline',
  MANUAL_CHECK: 'document-text-outline',
  MANUAL_TRANSFER: 'swap-horizontal-outline',
  STRIPE_CARD: 'card-outline',
};

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'VOID';

export const INVOICE_STATUS_BADGES: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: '#64748b', bg: '#f1f5f9' },
  OPEN: { label: 'Ouverte', color: '#92400e', bg: '#fef3c7' },
  PAID: { label: 'Payée', color: '#047857', bg: '#d1fae5' },
  VOID: { label: 'Annulée', color: '#991b1b', bg: '#fee2e2' },
};
