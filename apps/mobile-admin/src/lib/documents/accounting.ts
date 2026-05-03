import { gql } from '@apollo/client';

export const CLUB_ACCOUNTING_ENTRIES = gql`
  query ClubAccountingEntries(
    $from: DateTime
    $to: DateTime
    $status: AccountingEntryStatus
  ) {
    clubAccountingEntries(from: $from, to: $to, status: $status) {
      id
      kind
      status
      source
      label
      amountCents
      occurredAt
      consolidatedAt
      aiProcessingStartedAt
    }
  }
`;

export const CLUB_ACCOUNTING_ENTRY = gql`
  query ClubAccountingEntry($id: ID!) {
    clubAccountingEntry(id: $id) {
      id
      kind
      status
      source
      label
      amountCents
      vatTotalCents
      occurredAt
      consolidatedAt
      paymentMethod
      paymentReference
      aiProcessingStartedAt
      invoiceNumber
      duplicateOfEntryId
      financialAccountId
      financialAccountLabel
      financialAccountCode
      createdAt
      lines {
        id
        accountCode
        accountLabel
        label
        debitCents
        creditCents
        validatedAt
        iaSuggestedAccountCode
        iaReasoning
        iaConfidencePct
        mergedFromArticleLabels
      }
      documents {
        id
        mediaAssetId
        fileName
        publicUrl
        mimeType
      }
      extraction {
        id
        extractedVendor
        extractedInvoiceNumber
        extractedTotalCents
        extractedVatCents
        extractedDate
        extractedAccountCode
        confidencePerFieldJson
        categorizationJson
        model
        error
      }
    }
  }
`;

export const CLUB_ACCOUNTING_REVIEW_QUEUE = gql`
  query ClubAccountingReviewQueue {
    clubAccountingReviewQueue {
      id
      kind
      label
      amountCents
      occurredAt
      status
      source
    }
  }
`;

export const CLUB_ACCOUNTING_SUMMARY = gql`
  query ClubAccountingSummary($from: DateTime, $to: DateTime) {
    clubAccountingSummary(from: $from, to: $to) {
      incomeCents
      expenseCents
      balanceCents
    }
  }
`;

export const CLUB_ACCOUNTING_ACCOUNTS = gql`
  query ClubAccountingAccounts {
    clubAccountingAccounts {
      id
      code
      label
      kind
      isActive
    }
  }
`;

export const CLUB_FINANCIAL_ACCOUNTS = gql`
  query ClubFinancialAccounts {
    clubFinancialAccounts {
      id
      label
      kind
      isActive
      isDefault
      accountingAccountCode
    }
  }
`;

export const CLUB_PAYMENT_ROUTES = gql`
  query ClubPaymentRoutes {
    clubPaymentRoutes {
      id
      method
      financialAccountId
    }
  }
`;

export const CANCEL_ACCOUNTING_ENTRY = gql`
  mutation CancelAccountingEntry($input: CancelAccountingEntryInput!) {
    cancelClubAccountingEntry(input: $input) {
      id
      status
    }
  }
`;

export const DELETE_ACCOUNTING_ENTRY_PERMANENT = gql`
  mutation DeleteAccountingEntryPermanent($id: ID!) {
    deleteClubAccountingEntryPermanent(id: $id)
  }
`;

export const CONSOLIDATE_ACCOUNTING_ENTRY = gql`
  mutation ConsolidateAccountingEntry($entryId: ID!) {
    consolidateAccountingEntry(entryId: $entryId)
  }
`;

export const UNCONSOLIDATE_ACCOUNTING_ENTRY = gql`
  mutation UnconsolidateAccountingEntry($entryId: ID!) {
    unconsolidateAccountingEntry(entryId: $entryId)
  }
`;

export const VALIDATE_ACCOUNTING_ENTRY_LINE = gql`
  mutation ValidateAccountingEntryLine(
    $lineId: ID!
    $accountCode: String
  ) {
    validateAccountingEntryLine(lineId: $lineId, accountCode: $accountCode)
  }
`;

export const SUBMIT_RECEIPT_FOR_OCR = gql`
  mutation SubmitReceiptForOcr($mediaAssetId: ID!) {
    submitReceiptForOcr(mediaAssetId: $mediaAssetId) {
      extractionId
      entryId
      duplicateOfEntryId
      budgetBlocked
    }
  }
`;

/**
 * Variante multi-pages : prend un array de `mediaAssetId`. L'IA voit
 * toutes les pages dans l'ordre fourni et produit 1 seule écriture
 * NEEDS_REVIEW. Limite : 10 pages max.
 */
export const SUBMIT_MULTIPAGE_RECEIPT_FOR_OCR = gql`
  mutation SubmitMultiPageReceiptForOcr($mediaAssetIds: [ID!]!) {
    submitMultiPageReceiptForOcr(mediaAssetIds: $mediaAssetIds) {
      extractionId
      entryId
      duplicateOfEntryId
      budgetBlocked
    }
  }
`;

export const CONFIRM_ACCOUNTING_EXTRACTION = gql`
  mutation ConfirmAccountingExtraction(
    $input: ConfirmExtractionInput!
  ) {
    confirmAccountingExtraction(input: $input) {
      id
      status
      label
      amountCents
      occurredAt
      paymentMethod
      paymentReference
      invoiceNumber
      duplicateOfEntryId
      financialAccountId
      financialAccountLabel
      financialAccountCode
      aiProcessingStartedAt
    }
  }
`;

export const CREATE_CLUB_ACCOUNTING_ENTRY = gql`
  mutation CreateClubAccountingEntry($input: CreateAccountingEntryInput!) {
    createClubAccountingEntry(input: $input) {
      id
      status
    }
  }
`;

export const CREATE_CLUB_ACCOUNTING_ENTRY_QUICK = gql`
  mutation CreateClubAccountingEntryQuick(
    $input: CreateQuickAccountingEntryInput!
  ) {
    createClubAccountingEntryQuick(input: $input) {
      id
      pendingCategorization
    }
  }
`;

export const LOCK_ACCOUNTING_MONTH = gql`
  mutation LockAccountingMonth($month: String!) {
    lockClubAccountingMonth(month: $month)
  }
`;

export const UNLOCK_ACCOUNTING_MONTH = gql`
  mutation UnlockAccountingMonth($month: String!) {
    unlockClubAccountingMonth(month: $month)
  }
`;
