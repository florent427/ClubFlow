import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  GradientButton,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  formatDateTime,
  formatEuroCents,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CANCEL_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_ENTRIES,
  CLUB_ACCOUNTING_ENTRY,
  CLUB_ACCOUNTING_SUMMARY,
  CLUB_FINANCIAL_ACCOUNTS,
  CONFIRM_ACCOUNTING_EXTRACTION,
  DELETE_ACCOUNTING_ENTRY_PERMANENT,
  VALIDATE_ACCOUNTING_ENTRY_LINE,
} from '../../lib/documents/accounting';
import { getAuthedImageSource } from '../../lib/media';
import type { AccountingStackParamList } from '../../navigation/types';

type EntryStatus =
  | 'DRAFT'
  | 'NEEDS_REVIEW'
  | 'POSTED'
  | 'LOCKED'
  | 'CANCELLED';

type EntryLine = {
  id: string;
  accountCode: string;
  accountLabel: string | null;
  label: string | null;
  debitCents: number;
  creditCents: number;
  validatedAt: string | null;
  iaSuggestedAccountCode: string | null;
  iaReasoning: string | null;
  iaConfidencePct: number | null;
  mergedFromArticleLabels: string[];
};

type EntryDocument = {
  id: string;
  mediaAssetId: string;
};

type EntryExtraction = {
  id: string;
  extractedVendor: string | null;
  extractedInvoiceNumber: string | null;
  extractedTotalCents: number | null;
  extractedVatCents: number | null;
  extractedDate: string | null;
  extractedAccountCode: string | null;
  /** JSON stringifié — `{ vendor: 0.95, ... }`. À parser. */
  confidencePerFieldJson: string | null;
  /** JSON stringifié de la décision IA finale (sortie du comparateur). */
  categorizationJson: string | null;
  model: string | null;
  error: string | null;
};

/**
 * Forme parsée de `categorizationJson`. Décision finale produite par le
 * comparateur IA (ou par fallback expertise/OCR brut).
 */
type CategorizedDecision = {
  vendor: string | null;
  invoiceNumber: string | null;
  totalTtcCents: number;
  date: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  paymentMethodNeedsManual: boolean;
  globalReasoning: string;
  globalConfidencePct: number;
  agreement: {
    vendor: boolean;
    total: boolean;
    date: boolean;
    lines: boolean;
    paymentMethod: boolean;
  };
  lines: Array<{
    accountCode: string;
    amountCents: number;
    label: string;
    reasoning: string;
    confidencePct: number;
    projectId: string | null;
    sourceLabels: string[];
  }>;
};

/** Seuil au-dessus duquel on bascule en "validation rapide" (1 clic). */
const QUICK_VALIDATE_THRESHOLD = 85;

function safeParseDecision(
  raw: string | null | undefined,
): CategorizedDecision | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CategorizedDecision;
  } catch {
    return null;
  }
}

function safeParseConfidence(
  raw: string | null | undefined,
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

type Entry = {
  id: string;
  kind: 'INCOME' | 'EXPENSE' | 'IN_KIND';
  status: EntryStatus;
  source: string;
  label: string;
  amountCents: number;
  vatTotalCents: number | null;
  occurredAt: string;
  consolidatedAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  /** Présent = pipeline IA OCR en cours (entry stub en attente). */
  aiProcessingStartedAt: string | null;
  invoiceNumber: string | null;
  /** Si non null, cette écriture est en collision avec une autre. */
  duplicateOfEntryId: string | null;
  financialAccountId: string | null;
  financialAccountLabel: string | null;
  financialAccountCode: string | null;
  createdAt: string;
  lines: EntryLine[];
  documents: EntryDocument[];
  extraction: EntryExtraction | null;
};

/**
 * Compte financier d'un club (banque/caisse/Stripe). Utilisé pour la
 * contrepartie des dépenses (= ligne CREDIT). Chargé via
 * `CLUB_FINANCIAL_ACCOUNTS`.
 */
type FinancialAccount = {
  id: string;
  label: string;
  kind: string;
  isActive: boolean;
  isDefault: boolean;
  accountingAccountCode: string;
};

/** Modes de paiement supportés (alignés sur API). */
const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Espèces' },
  { value: 'CHECK', label: 'Chèque' },
  { value: 'TRANSFER', label: 'Virement' },
  { value: 'CARD', label: 'Carte bancaire' },
  { value: 'DIRECT_DEBIT', label: 'Prélèvement' },
  { value: 'OTHER', label: 'Autre' },
] as const;

function paymentMethodLabel(code: string | null): string {
  if (!code) return 'Non défini';
  return PAYMENT_METHODS.find((m) => m.value === code)?.label ?? code;
}

/** Si le mode de paiement nécessite une référence (n° chèque, n° virement…). */
function paymentMethodNeedsReference(code: string | null): boolean {
  return code === 'CHECK' || code === 'TRANSFER' || code === 'OTHER';
}

type Data = { clubAccountingEntry: Entry | null };

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'EntryDetail'>;
type Route = RouteProp<AccountingStackParamList, 'EntryDetail'>;

const STATUS_TONE: Record<
  EntryStatus,
  'neutral' | 'warning' | 'success' | 'info' | 'danger'
> = {
  DRAFT: 'neutral',
  NEEDS_REVIEW: 'warning',
  POSTED: 'success',
  LOCKED: 'info',
  CANCELLED: 'danger',
};

const STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: 'Brouillon',
  NEEDS_REVIEW: 'À valider',
  POSTED: 'Validée',
  LOCKED: 'Verrouillée',
  CANCELLED: 'Annulée',
};

const KIND_LABEL: Record<'INCOME' | 'EXPENSE' | 'IN_KIND', string> = {
  INCOME: 'Recette',
  EXPENSE: 'Dépense',
  IN_KIND: 'Don nature',
};

/** Codes PCG des comptes "banque/contrepartie" (ne pas modifier en review). */
const BANK_CODES = new Set(['512000', '530000']);

/** Convertit cents → string décimal "12.34" pour l'input éditable. */
function centsToString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Parse "12.34" / "12,34" → cents (1234). Retourne null si invalide. */
function parseEurosToCents(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Format ISO → "YYYY-MM-DD" pour l'input texte. */
function isoToDateString(iso: string): string {
  return iso.slice(0, 10);
}

/** Pill colorée selon score de confiance IA (0-1). */
function ConfidencePill({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const tone: 'success' | 'warning' | 'danger' =
    pct >= 85 ? 'success' : pct >= 50 ? 'warning' : 'danger';
  return <Pill label={`IA ${pct}%`} tone={tone} />;
}

/** Source d'image authentifiée — résolue async via getAuthedImageSource. */
function useAuthedImageSource(mediaAssetId: string | null) {
  const [source, setSource] = useState<{
    uri: string;
    headers: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!mediaAssetId) {
      setSource(null);
      return;
    }
    let cancelled = false;
    void getAuthedImageSource(mediaAssetId).then((src) => {
      if (!cancelled) setSource(src);
    });
    return () => {
      cancelled = true;
    };
  }, [mediaAssetId]);

  return source;
}

export function EntryDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { entryId } = route.params;

  const { data, loading, refetch, startPolling, stopPolling } =
    useQuery<Data>(CLUB_ACCOUNTING_ENTRY, {
      variables: { id: entryId },
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    });

  // Polling 4s tant que le pipeline IA tourne en background. Stop dès
  // que l'entry sort du mode "Analyse en cours".
  const isAiProcessing =
    data?.clubAccountingEntry?.aiProcessingStartedAt != null;
  useEffect(() => {
    if (isAiProcessing) {
      startPolling(4000);
      return () => stopPolling();
    }
    stopPolling();
    return undefined;
  }, [isAiProcessing, startPolling, stopPolling]);

  /**
   * Liste des comptes financiers du club (banque, caisse, Stripe…) pour
   * permettre à l'utilisateur de choisir la contrepartie de la dépense.
   * cache-first car ça change rarement (admin paramétrage).
   */
  const { data: faData } = useQuery<{
    clubFinancialAccounts: FinancialAccount[];
  }>(CLUB_FINANCIAL_ACCOUNTS, {
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });
  const financialAccounts = useMemo(
    () =>
      (faData?.clubFinancialAccounts ?? []).filter((f) => f.isActive),
    [faData],
  );

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // NOTE : pas de mutation Consolider/Déconsolider sur mobile-admin.
  // Le pipeline IA produit déjà une décision avec 1 ligne par compte
  // (groupes dédupliqués), donc rien à fusionner après. Et côté API,
  // `consolidate()` n'autorise QUE NEEDS_REVIEW — incompatible avec le
  // bouton qui s'affichait sur POSTED. À reconsidérer si on ajoute la
  // saisie manuelle multi-lignes sur mobile.
  const [cancelEntry, { loading: cancelling }] = useMutation(
    CANCEL_ACCOUNTING_ENTRY,
  );
  const [deleteEntry, { loading: deleting }] = useMutation(
    DELETE_ACCOUNTING_ENTRY_PERMANENT,
  );
  const [confirmExtraction, { loading: confirming }] = useMutation(
    CONFIRM_ACCOUNTING_EXTRACTION,
    {
      // Après validation d'une écriture, rafraîchit le registre + les
      // KPIs Recettes/Dépenses/Solde pour qu'ils prennent en compte le
      // nouveau POSTED. Strings = refetch TOUTES les versions actives
      // de la query (avec leurs variables courantes — peu importe les
      // dates from/to du summary, on refresh tout).
      refetchQueries: ['ClubAccountingEntries', 'ClubAccountingSummary'],
      awaitRefetchQueries: false,
    },
  );
  const [validateLine] = useMutation(VALIDATE_ACCOUNTING_ENTRY_LINE);

  const entry = data?.clubAccountingEntry ?? null;

  // ───────── Mode "validation" pour status NEEDS_REVIEW ─────────
  // État local des champs éditables. Initialisé depuis l'entry chargée.
  // - editVendor + editInvoiceNumber : sources du libellé (calculé,
  //   pas saisi) — l'utilisateur édite ces 2 champs et le libellé
  //   se met à jour en temps réel.
  // - editAmount : total TTC. Quand il change, on propage
  //   proportionnellement aux montants des lignes débit (preserve
  //   les ratios IA). Affichage live des nouveaux montants.
  const [editVendor, setEditVendor] = useState<string>('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('');
  const [editPaymentRef, setEditPaymentRef] = useState<string>('');
  /** Compte financier de contrepartie sélectionné (banque/caisse/…). */
  const [editFinancialAccountId, setEditFinancialAccountId] =
    useState<string>('');
  // Map<lineId, accountCode édité>. Vide tant que l'utilisateur n'a rien
  // modifié — sinon on garderait des updates inutiles.
  const [editLineCodes, setEditLineCodes] = useState<Record<string, string>>(
    {},
  );

  // Reset l'état d'édition à chaque (re)chargement de l'entry — sinon
  // les champs gardent les valeurs de l'écriture précédente quand on
  // navigue vers une autre.
  useEffect(() => {
    if (!entry) return;
    setEditVendor(entry.extraction?.extractedVendor ?? '');
    setEditInvoiceNumber(entry.extraction?.extractedInvoiceNumber ?? '');
    setEditAmount(centsToString(entry.amountCents));
    setEditDate(isoToDateString(entry.occurredAt));
    setEditPaymentMethod(entry.paymentMethod ?? '');
    setEditPaymentRef(entry.paymentReference ?? '');
    setEditFinancialAccountId(entry.financialAccountId ?? '');
    setEditLineCodes({});
  }, [
    entry?.id,
    entry?.amountCents,
    entry?.occurredAt,
    entry?.paymentMethod,
    entry?.paymentReference,
    entry?.financialAccountId,
    entry?.extraction?.extractedVendor,
    entry?.extraction?.extractedInvoiceNumber,
  ]);

  // Pré-sélection auto du compte financier "défaut" du club si l'entry
  // n'en a pas encore (cas écriture OCR_AI nouvellement créée).
  useEffect(() => {
    if (editFinancialAccountId) return;
    if (entry?.financialAccountId) return;
    const def = financialAccounts.find((f) => f.isDefault);
    if (def) setEditFinancialAccountId(def.id);
  }, [financialAccounts, entry?.financialAccountId, editFinancialAccountId]);

  /**
   * Libellé calculé en direct depuis vendor + n° facture. Format :
   *  - "{n°} — {vendor}"  si les deux présents
   *  - "{vendor}"         si vendor seul
   *  - "Facture {n°}"     si n° seul
   *  - "Reçu à qualifier" sinon
   */
  const computedLabel = useMemo(() => {
    const v = editVendor.trim();
    const n = editInvoiceNumber.trim();
    if (n && v) return `${n} — ${v}`;
    if (v) return v;
    if (n) return `Facture ${n}`;
    return 'Reçu à qualifier';
  }, [editVendor, editInvoiceNumber]);

  /**
   * Propagation proportionnelle du total TTC saisi vers les montants
   * des lignes débit (hors banque). Préserve les ratios IA.
   *
   * - 1 seule ligne débit → assigne directement le total
   * - N lignes débit → ratio = newTotal / oldTotal, applique sur chaque
   *   ligne, réconcilie l'écart d'arrondi sur la dernière ligne
   *
   * Retourne `Map<lineId, newAmountCents>` — même si l'utilisateur
   * n'a pas changé le total, on retourne la répartition courante (utile
   * pour l'affichage live).
   */
  const propagatedLineAmounts = useMemo(() => {
    const result = new Map<string, number>();
    if (!entry) return result;
    const newTotal = parseEurosToCents(editAmount);
    if (newTotal == null) return result;
    const articleLinesLocal = (entry.lines ?? []).filter(
      (l) => !BANK_CODES.has(l.accountCode),
    );
    const oldTotal = articleLinesLocal.reduce(
      (s, l) => s + l.debitCents,
      0,
    );
    if (articleLinesLocal.length === 0) return result;
    if (articleLinesLocal.length === 1) {
      result.set(articleLinesLocal[0].id, newTotal);
      return result;
    }
    if (oldTotal === 0) {
      // Cas dégénéré : toutes les lignes à 0 → on met tout sur la 1re
      result.set(articleLinesLocal[0].id, newTotal);
      for (let i = 1; i < articleLinesLocal.length; i++) {
        result.set(articleLinesLocal[i].id, 0);
      }
      return result;
    }
    // Distribution proportionnelle + réconciliation arrondi sur la dernière
    let allocated = 0;
    for (let i = 0; i < articleLinesLocal.length - 1; i++) {
      const l = articleLinesLocal[i];
      const newAmt = Math.round((l.debitCents / oldTotal) * newTotal);
      result.set(l.id, newAmt);
      allocated += newAmt;
    }
    const last = articleLinesLocal[articleLinesLocal.length - 1];
    result.set(last.id, Math.max(0, newTotal - allocated));
    return result;
  }, [entry, editAmount]);

  // L'écriture est "à valider" SEULEMENT si l'IA a fini son analyse.
  // Pendant le pipeline IA, on masque le form de validation (les
  // métadonnées ne sont pas encore prêtes).
  const isReview =
    entry?.status === 'NEEDS_REVIEW' && !entry?.aiProcessingStartedAt;
  const firstReceipt = useMemo(
    () => entry?.documents[0] ?? null,
    [entry?.documents],
  );
  const docImageSource = useAuthedImageSource(
    firstReceipt?.mediaAssetId ?? null,
  );

  // Décision IA finale (issue du comparateur ou fallback). Présente si
  // l'écriture a traversé le pipeline OCR — null si saisie manuelle.
  const decision = useMemo(
    () => safeParseDecision(entry?.extraction?.categorizationJson),
    [entry?.extraction?.categorizationJson],
  );
  const conf = useMemo(
    () => safeParseConfidence(entry?.extraction?.confidencePerFieldJson),
    [entry?.extraction?.confidencePerFieldJson],
  );

  /**
   * Si la décision IA a une confiance globale haute ET concorde sur les
   * 3 dimensions clés, on bascule en mode "validation rapide" : un seul
   * gros bouton vert. L'utilisateur peut toujours déplier l'édition.
   */
  const canQuickValidate =
    isReview &&
    decision != null &&
    decision.globalConfidencePct >= QUICK_VALIDATE_THRESHOLD &&
    decision.agreement.vendor &&
    decision.agreement.total &&
    decision.agreement.lines;

  /** Mode édition forcé par l'utilisateur (sinon mode rapide par défaut). */
  const [showFullEdit, setShowFullEdit] = useState(false);

  /**
   * Set des lignes dont le reasoning IA est déplié. Tap sur le bloc 💭
   * d'une ligne → toggle l'id dans ce set → on retire la limite de
   * lignes du Text. Permet de lire l'argumentation complète de l'IA
   * (jusqu'à 1500 chars depuis serveur) sans encombrer la liste.
   */
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(
    new Set(),
  );
  const toggleReasoning = (lineId: string) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  /** Idem pour le globalReasoning (1 seul bloc, pas de map). */
  const [globalReasoningExpanded, setGlobalReasoningExpanded] =
    useState(false);

  // Lignes hors banque (= articles) — celles qu'on peut requalifier.
  const articleLines = useMemo(
    () => (entry?.lines ?? []).filter((l) => !BANK_CODES.has(l.accountCode)),
    [entry?.lines],
  );

  if (loading && !entry) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ÉCRITURE"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="ÉCRITURE"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Écriture introuvable"
            description="L'écriture n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const isConsolidated = entry.consolidatedAt != null;
  const sign =
    entry.kind === 'INCOME' ? '+' : entry.kind === 'EXPENSE' ? '−' : '';

  // ───────── Handlers ─────────
  const onCancel = async () => {
    await cancelEntry({
      variables: { input: { id: entry.id, reason: 'Annulé via mobile' } },
    });
    setConfirmCancel(false);
    await refetch();
  };
  const onDelete = async () => {
    await deleteEntry({ variables: { id: entry.id } });
    setConfirmDelete(false);
    navigation.goBack();
  };

  /**
   * Validation post-OCR :
   *  1. Pour chaque ligne dont le code a été modifié → validateAccountingEntryLine
   *  2. confirmAccountingExtraction (passe NEEDS_REVIEW → POSTED + corrige header)
   */
  const onConfirmExtraction = async () => {
    const amountCents = parseEurosToCents(editAmount);
    if (amountCents == null) {
      Alert.alert('Montant invalide', 'Saisis un montant en euros valide (ex. 42.50).');
      return;
    }
    if (!computedLabel.trim() || computedLabel === 'Reçu à qualifier') {
      Alert.alert(
        'Libellé manquant',
        'Renseigne au moins le fournisseur ou le n° de facture.',
      );
      return;
    }
    let occurredAt: Date | undefined;
    if (editDate.trim()) {
      const d = new Date(editDate.trim());
      if (Number.isNaN(d.getTime())) {
        Alert.alert(
          'Date invalide',
          'Format attendu : YYYY-MM-DD (ex. 2026-05-01).',
        );
        return;
      }
      occurredAt = d;
    }
    // Construit le payload `lineAmounts` à partir de la propagation
    // calculée — UNIQUEMENT si on a plusieurs lignes débit (sinon
    // l'API se débrouille avec amountCents tout court).
    const lineAmountsPayload =
      propagatedLineAmounts.size >= 2
        ? Array.from(propagatedLineAmounts.entries()).map(
            ([lineId, amt]) => ({ lineId, amountCents: amt }),
          )
        : undefined;

    // Antidoublon : si l'API a déjà flaggé l'entry comme doublon de
    // quelqu'un, on demande confirmation à l'utilisateur avant de
    // valider. Si confirmé → forceDuplicate=true bypass le check API.
    let forceDuplicate = false;
    if (entry.duplicateOfEntryId) {
      const userConfirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          '⚠️ Doublon détecté',
          `Cette facture (n° ${editInvoiceNumber || '—'} · ${formatEuroCents(amountCents)}) correspond à une écriture déjà saisie. Valider quand même ?`,
          [
            { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Valider quand même',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ],
          { cancelable: false },
        );
      });
      if (!userConfirmed) return;
      forceDuplicate = true;
    }
    try {
      // 1. Mise à jour des comptes par ligne (si modifiés)
      for (const [lineId, code] of Object.entries(editLineCodes)) {
        if (!code.trim()) continue;
        await validateLine({
          variables: { lineId, accountCode: code.trim() },
        });
      }
      // 2. Validation globale : header + statut POSTED
      await confirmExtraction({
        variables: {
          input: {
            entryId: entry.id,
            label: computedLabel.trim(),
            amountCents,
            occurredAt: occurredAt?.toISOString(),
            paymentMethod: editPaymentMethod || null,
            paymentReference:
              paymentMethodNeedsReference(editPaymentMethod) &&
              editPaymentRef.trim()
                ? editPaymentRef.trim()
                : null,
            ...(lineAmountsPayload
              ? { lineAmounts: lineAmountsPayload }
              : {}),
            ...(editFinancialAccountId
              ? { financialAccountId: editFinancialAccountId }
              : {}),
            invoiceNumber: editInvoiceNumber.trim() || null,
            ...(forceDuplicate ? { forceDuplicate: true } : {}),
          },
        },
      });
      await refetch();
      Alert.alert('Écriture validée', "L'écriture a été passée en POSTED.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      Alert.alert('Validation échouée', msg);
    }
  };

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow={
          isAiProcessing
            ? 'ANALYSE EN COURS'
            : isReview
              ? 'À VALIDER'
              : 'ÉCRITURE'
        }
        title={entry.label}
        subtitle={
          isAiProcessing
            ? "L'IA prépare votre écriture…"
            : `${sign}${formatEuroCents(entry.amountCents)}`
        }
        compact
        showBack
      />

      {/* Bandeau "Analyse IA en cours" — masque tout le reste tant que
          le pipeline tourne. L'utilisateur sait qu'il peut quitter
          l'écran et continuer à scanner. */}
      {isAiProcessing ? (
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View style={styles.processingBox}>
            <Text style={styles.processingEmoji}>⏳</Text>
            <Text style={styles.processingTitle}>Analyse IA en cours</Text>
            <Text style={styles.processingHint}>
              L'IA lit votre facture, propose la ventilation comptable et le
              mode de paiement. Vous pouvez quitter cet écran et continuer
              à scanner d'autres factures — l'analyse continue en arrière-plan.
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Photo du justificatif (si présent) */}
      {firstReceipt && docImageSource ? (
        <Card
          title="Justificatif"
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
        >
          <Image
            source={docImageSource}
            style={styles.receiptImg}
            resizeMode="contain"
          />
        </Card>
      ) : null}

      {/* Bandeau ANTIDOUBLON — si une autre entry du club a même
          (n° facture, montant). Visible que ce soit en review ou
          déjà POSTED (l'utilisateur peut découvrir le doublon après
          coup). */}
      {entry.duplicateOfEntryId ? (
        <Card
          style={{
            marginHorizontal: spacing.lg,
            marginTop: spacing.lg,
            borderLeftWidth: 4,
            borderLeftColor: palette.warningText,
          }}
        >
          <View style={styles.duplicateBox}>
            <Text style={styles.duplicateTitle}>
              ⚠️ Doublon potentiel détecté
            </Text>
            <Text style={styles.duplicateBody}>
              Cette facture (n° {entry.invoiceNumber ?? '—'} · {formatEuroCents(entry.amountCents)})
              correspond à une écriture déjà saisie dans ce club. Vérifie
              avant de valider.
            </Text>
            <Button
              label="Voir l'écriture existante"
              variant="ghost"
              icon="open-outline"
              onPress={() =>
                navigation.push('EntryDetail', {
                  entryId: entry.duplicateOfEntryId!,
                })
              }
            />
          </View>
        </Card>
      ) : null}

      {/* Bandeau "À valider" — uniquement en NEEDS_REVIEW */}
      {isReview ? (
        <Card
          title="Validation post-OCR"
          subtitle={
            entry.extraction?.error
              ? `OCR partiel : ${entry.extraction.error.slice(0, 80)}`
              : decision
                ? `Pipeline IA · ${entry.extraction?.model ?? 'modèle'}`
                : entry.extraction?.model
                  ? `Extraction IA · ${entry.extraction.model}`
                  : 'Saisie manuelle requise'
          }
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
        >
          {/* Réflexion structurée IA — bandeau visible si décision présente */}
          {decision ? (
            <View style={styles.aiReasoningBox}>
              <View style={styles.aiReasoningHeader}>
                <Pill
                  label={`Confiance ${decision.globalConfidencePct}%`}
                  tone={
                    decision.globalConfidencePct >= 85
                      ? 'success'
                      : decision.globalConfidencePct >= 50
                        ? 'warning'
                        : 'danger'
                  }
                />
                {decision.agreement.vendor &&
                decision.agreement.total &&
                decision.agreement.lines ? (
                  <Pill label="OCR + Expertise concordent" tone="success" />
                ) : (
                  <Pill label="Divergence OCR / Expertise" tone="warning" />
                )}
              </View>
              {decision.globalReasoning ? (
                <Pressable
                  onPress={() =>
                    setGlobalReasoningExpanded((v) => !v)
                  }
                  hitSlop={4}
                >
                  <Text
                    style={styles.aiReasoningText}
                    numberOfLines={
                      globalReasoningExpanded ? undefined : 4
                    }
                  >
                    {decision.globalReasoning}
                  </Text>
                  <Text style={styles.reasoningToggle}>
                    {globalReasoningExpanded
                      ? '▲ Réduire'
                      : '▼ Lire le raisonnement complet'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {entry.extraction?.extractedInvoiceNumber ||
          entry.extraction?.extractedVendor ? (
            <View style={styles.metaList}>
              {entry.extraction.extractedInvoiceNumber ? (
                <MetaRow
                  label="N° facture"
                  value={entry.extraction.extractedInvoiceNumber}
                  confidence={conf.invoiceNumber}
                />
              ) : null}
              {entry.extraction.extractedVendor ? (
                <MetaRow
                  label="Fournisseur"
                  value={entry.extraction.extractedVendor}
                  confidence={conf.vendor}
                />
              ) : null}
              {entry.extraction.extractedVatCents != null ? (
                <MetaRow
                  label="TVA détectée"
                  value={`${formatEuroCents(entry.extraction.extractedVatCents)} (non récup. asso)`}
                />
              ) : null}
            </View>
          ) : null}

          {/* N° facture + fournisseur — TOUJOURS éditables (même en
              mode quick validate). Le libellé est calculé en direct. */}
          <View style={styles.identityForm}>
            <TextField
              label="N° de facture"
              value={editInvoiceNumber}
              onChangeText={setEditInvoiceNumber}
              placeholder="Ex. F-2026-001"
              autoCapitalize="characters"
            />
            <TextField
              label="Fournisseur"
              value={editVendor}
              onChangeText={setEditVendor}
              placeholder="Ex. Decathlon"
            />
            <View style={styles.computedLabelBox}>
              <Text style={styles.computedLabelLabel}>
                Libellé écriture (auto)
              </Text>
              <Text style={styles.computedLabelValue} numberOfLines={2}>
                {computedLabel}
              </Text>
            </View>
          </View>

          {/* Mode rapide vs édition complète (montant / date / paiement) */}
          {canQuickValidate && !showFullEdit ? (
            <View style={styles.quickActions}>
              <Text style={styles.quickHint}>
                Les deux IA sont d'accord à {decision?.globalConfidencePct}% —
                tu peux valider tel quel.
              </Text>
              <GradientButton
                label="Valider en 1 clic"
                icon="checkmark-circle"
                onPress={() => void onConfirmExtraction()}
                loading={confirming}
                fullWidth
              />
              <Button
                label="Modifier le montant / la date / le paiement…"
                variant="ghost"
                icon="create-outline"
                onPress={() => setShowFullEdit(true)}
              />
            </View>
          ) : (
            <>
              <View style={styles.editForm}>
                <TextField
                  label="Montant TTC (€)"
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  hint={
                    propagatedLineAmounts.size >= 2
                      ? "L'asso ne sépare pas la TVA. Le total est réparti automatiquement entre les lignes selon les ratios IA."
                      : "L'asso ne sépare pas la TVA — saisis le total TTC."
                  }
                />
                {/* Picker mode de paiement (chips) — bandeau "À saisir
                    manuellement" si l'IA n'a pas pu trancher */}
                <View>
                  <Text style={styles.pickerLabel}>Mode de paiement</Text>
                  {decision?.paymentMethodNeedsManual ? (
                    <Text style={styles.pickerHint}>
                      ⚠️ L'IA n'a pas pu détecter le mode de paiement —
                      sélectionne manuellement.
                    </Text>
                  ) : null}
                  <View style={styles.chipRow}>
                    {PAYMENT_METHODS.map((m) => (
                      <Pressable
                        key={m.value}
                        onPress={() => setEditPaymentMethod(m.value)}
                        style={[
                          styles.paymentChip,
                          editPaymentMethod === m.value &&
                            styles.paymentChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentChipText,
                            editPaymentMethod === m.value &&
                              styles.paymentChipTextActive,
                          ]}
                        >
                          {m.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {paymentMethodNeedsReference(editPaymentMethod) ? (
                  <TextField
                    label={
                      editPaymentMethod === 'CHECK'
                        ? 'N° de chèque'
                        : editPaymentMethod === 'TRANSFER'
                          ? 'Référence virement'
                          : 'Référence (optionnel)'
                    }
                    value={editPaymentRef}
                    onChangeText={setEditPaymentRef}
                    placeholder={
                      editPaymentMethod === 'CHECK' ? '0000123' : 'Réf...'
                    }
                  />
                ) : null}
                {/* Compte financier de contrepartie (banque/caisse/Stripe).
                    C'est ce qui détermine le compte comptable de la
                    ligne CREDIT (= où l'argent sort). */}
                {financialAccounts.length > 0 ? (
                  <View>
                    <Text style={styles.pickerLabel}>
                      Encaissé / payé sur
                    </Text>
                    <Text style={styles.pickerHintMuted}>
                      Détermine la ligne contrepartie en comptabilité
                      (ex. Banque principale → compte 512000).
                    </Text>
                    <View style={styles.chipRow}>
                      {financialAccounts.map((fa) => (
                        <Pressable
                          key={fa.id}
                          onPress={() => setEditFinancialAccountId(fa.id)}
                          style={[
                            styles.paymentChip,
                            editFinancialAccountId === fa.id &&
                              styles.paymentChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.paymentChipText,
                              editFinancialAccountId === fa.id &&
                                styles.paymentChipTextActive,
                            ]}
                          >
                            {fa.label} · {fa.accountingAccountCode}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <TextField
                  label="Date (YYYY-MM-DD)"
                  value={editDate}
                  onChangeText={setEditDate}
                  placeholder="2026-05-01"
                />
              </View>

              <View style={styles.actions}>
                <GradientButton
                  label="Valider l'écriture"
                  icon="checkmark-circle-outline"
                  onPress={() => void onConfirmExtraction()}
                  loading={confirming}
                  fullWidth
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {/* Métadonnées (toujours visibles) */}
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.pillsRow}>
          <Pill
            label={STATUS_LABEL[entry.status]}
            tone={STATUS_TONE[entry.status]}
          />
          <Pill label={KIND_LABEL[entry.kind]} tone="primary" />
          <Pill label={entry.source} />
          {isConsolidated ? <Pill label="Consolidée" tone="info" /> : null}
        </View>
        <View style={styles.metaList}>
          <MetaRow label="Date" value={formatDateTime(entry.occurredAt)} />
          <MetaRow label="Créée le" value={formatDateTime(entry.createdAt)} />
          {entry.paymentMethod ? (
            <MetaRow
              label="Mode de paiement"
              value={
                paymentMethodLabel(entry.paymentMethod) +
                (entry.paymentReference ? ` · ${entry.paymentReference}` : '')
              }
            />
          ) : null}
          {entry.financialAccountLabel ? (
            <MetaRow
              label="Compte de contrepartie"
              value={
                entry.financialAccountLabel +
                (entry.financialAccountCode
                  ? ` · ${entry.financialAccountCode}`
                  : '')
              }
            />
          ) : null}
          {entry.vatTotalCents != null ? (
            <MetaRow
              label="TVA"
              value={formatEuroCents(entry.vatTotalCents)}
            />
          ) : null}
          {entry.documents.length > 0 ? (
            <MetaRow
              label="Documents"
              value={`${entry.documents.length} fichier(s)`}
            />
          ) : null}
        </View>
      </Card>

      {/* Lignes — éditables par compte si NEEDS_REVIEW */}
      <Card
        title="Lignes"
        subtitle={`${entry.lines.length} ligne(s)`}
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        {entry.lines.length === 0 ? (
          <EmptyState
            icon="document-outline"
            title="Aucune ligne"
            description="Cette écriture n'a pas encore de ligne."
          />
        ) : (
          <View style={styles.linesList}>
            {entry.lines.map((line) => {
              const isBank = BANK_CODES.has(line.accountCode);
              const editable = isReview && !isBank;
              return (
                <View key={line.id} style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    {editable ? (
                      <TextField
                        label="Compte PCG"
                        value={editLineCodes[line.id] ?? line.accountCode}
                        onChangeText={(v) =>
                          setEditLineCodes((prev) => ({
                            ...prev,
                            [line.id]: v,
                          }))
                        }
                        keyboardType="number-pad"
                        containerStyle={styles.inlineEdit}
                      />
                    ) : (
                      <>
                        <Text style={styles.lineCode} numberOfLines={1}>
                          {line.accountCode}
                          {line.accountLabel ? ` · ${line.accountLabel}` : ''}
                        </Text>
                        {line.label ? (
                          <Text style={styles.lineLabel} numberOfLines={2}>
                            {line.label}
                          </Text>
                        ) : null}
                      </>
                    )}
                    {/* Pills : confiance IA + indicateur "validée" */}
                    {!isBank ? (
                      <View style={styles.linePillsRow}>
                        {line.iaConfidencePct != null ? (
                          <ConfidencePill score={line.iaConfidencePct / 100} />
                        ) : null}
                        {line.validatedAt ? (
                          <Pill label="Ligne validée" tone="success" />
                        ) : null}
                        {line.mergedFromArticleLabels.length > 0 ? (
                          <Pill
                            label={`${line.mergedFromArticleLabels.length} articles`}
                            tone="info"
                          />
                        ) : null}
                      </View>
                    ) : null}
                    {/* Reasoning IA par ligne — tap pour déplier.
                        Indique la limite via "▼ Voir plus" / "▲ Réduire". */}
                    {!isBank && line.iaReasoning ? (
                      <Pressable
                        onPress={() => toggleReasoning(line.id)}
                        hitSlop={4}
                      >
                        <Text
                          style={styles.lineReasoning}
                          numberOfLines={
                            expandedReasoning.has(line.id) ? undefined : 3
                          }
                        >
                          💭 {line.iaReasoning}
                        </Text>
                        <Text style={styles.reasoningToggle}>
                          {expandedReasoning.has(line.id)
                            ? '▲ Réduire'
                            : '▼ Voir le raisonnement IA complet'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.lineAmounts}>
                    {(() => {
                      // Affichage live : si on est en review, on
                      // affiche les montants propagés (basés sur
                      // editAmount) plutôt que les montants persistés.
                      // - Lignes débit non-banque : valeur propagée
                      // - Ligne banque : nouveau total (= editAmount)
                      // - Hors review (POSTED, etc.) : valeurs DB
                      const proposedAmount = isReview
                        ? !isBank
                          ? propagatedLineAmounts.get(line.id)
                          : parseEurosToCents(editAmount) ?? line.creditCents
                        : undefined;
                      const debit =
                        proposedAmount !== undefined && line.debitCents > 0
                          ? proposedAmount
                          : line.debitCents;
                      const credit =
                        proposedAmount !== undefined && line.creditCents > 0
                          ? proposedAmount
                          : line.creditCents;
                      const changed =
                        isReview &&
                        ((line.debitCents > 0 && debit !== line.debitCents) ||
                          (line.creditCents > 0 &&
                            credit !== line.creditCents));
                      return (
                        <>
                          {debit > 0 ? (
                            <Text
                              style={[
                                styles.debit,
                                changed && styles.amountChanged,
                              ]}
                            >
                              D {formatEuroCents(debit)}
                            </Text>
                          ) : null}
                          {credit > 0 ? (
                            <Text
                              style={[
                                styles.credit,
                                changed && styles.amountChanged,
                              ]}
                            >
                              C {formatEuroCents(credit)}
                            </Text>
                          ) : null}
                          {debit === 0 && credit === 0 ? (
                            <Text style={styles.amountPlaceholder}>—</Text>
                          ) : null}
                          {/* Indicateur "valeur recalculée live" */}
                          {changed ? (
                            <Text style={styles.amountOriginalHint}>
                              (était {formatEuroCents(
                                line.debitCents > 0
                                  ? line.debitCents
                                  : line.creditCents,
                              )})
                            </Text>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      <Card
        title="Actions"
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.actions}>
          <Button
            label="Annuler l'écriture"
            variant="ghost"
            icon="close-circle-outline"
            onPress={() => setConfirmCancel(true)}
            disabled={entry.status === 'CANCELLED'}
          />
          <Button
            label="Supprimer définitivement"
            variant="danger"
            icon="trash-outline"
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </Card>

      <ConfirmSheet
        visible={confirmCancel}
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => void onCancel()}
        title="Annuler l'écriture ?"
        message="Cette action passe l'écriture au statut Annulée. Vous pourrez la consulter mais elle n'impactera plus le solde."
        confirmLabel="Annuler l'écriture"
        loading={cancelling}
      />
      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Supprimer définitivement ?"
        message="Cette action est irréversible. L'écriture et toutes ses lignes seront supprimées."
        confirmLabel="Supprimer"
        destructive
        loading={deleting}
      />
    </ScreenContainer>
  );
}

function MetaRow({
  label,
  value,
  confidence,
}: {
  label: string;
  value: string;
  confidence?: number;
}) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValueWrap}>
        <Text style={styles.metaValue} numberOfLines={2}>
          {value}
        </Text>
        {confidence != null ? <ConfidencePill score={confidence} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metaList: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    ...typography.smallStrong,
    color: palette.muted,
  },
  metaValue: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
    textAlign: 'right',
  },
  metaValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  receiptImg: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: palette.bgAlt,
  },
  editForm: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  linesList: { gap: spacing.sm },
  lineRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
    gap: spacing.md,
  },
  lineCode: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  lineLabel: {
    ...typography.small,
    color: palette.muted,
  },
  linePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inlineEdit: {
    marginBottom: 0,
  },
  lineAmounts: {
    alignItems: 'flex-end',
    gap: 2,
  },
  debit: {
    ...typography.smallStrong,
    color: palette.dangerText,
  },
  credit: {
    ...typography.smallStrong,
    color: palette.successText,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  aiReasoningBox: {
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  aiReasoningHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  aiReasoningText: {
    ...typography.small,
    color: palette.ink,
    fontStyle: 'italic',
  },
  quickActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickHint: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
  },
  lineReasoning: {
    ...typography.small,
    color: palette.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  reasoningToggle: {
    ...typography.small,
    color: palette.primary,
    fontWeight: '600',
    marginTop: 4,
    fontSize: 11,
  },
  amountPlaceholder: {
    ...typography.smallStrong,
    color: palette.muted,
  },
  pickerLabel: {
    ...typography.smallStrong,
    color: palette.ink,
    marginBottom: spacing.xs,
  },
  pickerHint: {
    ...typography.small,
    color: palette.warningText,
    marginBottom: spacing.xs,
  },
  pickerHintMuted: {
    ...typography.small,
    color: palette.muted,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  paymentChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.bg,
  },
  paymentChipActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  paymentChipText: {
    ...typography.small,
    color: palette.ink,
  },
  paymentChipTextActive: {
    color: palette.bg,
    fontWeight: '700',
  },
  identityForm: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  computedLabelBox: {
    backgroundColor: palette.bgAlt,
    borderRadius: 12,
    padding: spacing.md,
    gap: 4,
    borderLeftWidth: 3,
    borderLeftColor: palette.primary,
  },
  computedLabelLabel: {
    ...typography.smallStrong,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  computedLabelValue: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  amountChanged: {
    // Quand le montant ligne a été recalculé live, on le rend en
    // primary pour signaler "valeur en attente de validation".
    color: palette.primary,
  },
  amountOriginalHint: {
    ...typography.small,
    color: palette.muted,
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 2,
  },
  duplicateBox: {
    gap: spacing.sm,
  },
  duplicateTitle: {
    ...typography.bodyStrong,
    color: palette.warningText,
  },
  duplicateBody: {
    ...typography.small,
    color: palette.ink,
    lineHeight: 18,
  },
  processingBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  processingEmoji: {
    fontSize: 48,
  },
  processingTitle: {
    ...typography.bodyStrong,
    color: palette.primary,
  },
  processingHint: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
  },
});
