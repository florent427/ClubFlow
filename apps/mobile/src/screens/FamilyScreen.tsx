import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { interpretStripeReturn } from '../lib/shop-payment';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  EmptyState,
  ScreenHero,
  Skeleton,
} from '../components/ui';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { absolutizeMediaUrl } from '../lib/absolutize-url';
import {
  VIEWER_ALL_FAMILY_BILLING,
  VIEWER_APPLY_PAYER_CREDIT,
  VIEWER_CREATE_INVOICE_CHECKOUT_SESSION,
  VIEWER_LOCK_INVOICE_PAYMENT_CHOICE,
  VIEWER_PAYER_CREDIT,
} from '../lib/viewer-documents';
import type {
  ViewerAllFamilyBillingData,
  ViewerApplyPayerCreditData,
  ViewerFamilyBillingSummary,
  ViewerPayerCredit,
  ViewerPayerCreditData,
} from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';
import {
  payerCreditApplyCents,
  payerCreditApplyConfirmation,
  payerCreditKpi,
  payerCreditMovementTitle,
  shouldShowPayerCredit,
  signedEuroCents,
} from '../lib/payer-credit';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';

type ViewerLockInvoicePaymentChoiceData = {
  viewerLockInvoicePaymentChoice: {
    invoiceId: string;
    method: string;
    installmentsCount: number;
    instructions: string;
  };
};

type ViewerCreateInvoiceCheckoutSessionData = {
  viewerCreateInvoiceCheckoutSession: {
    url: string;
    sessionId: string;
    paymentReturnUrl: string;
  };
};

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'À payer';
    case 'PAID':
      return 'Payée';
    case 'DRAFT':
      return 'Brouillon';
    case 'VOID':
      return 'Annulée';
    default:
      return status;
  }
}

function statusStyle(status: string): object {
  switch (status) {
    case 'OPEN':
      return styles.invOpen;
    case 'PAID':
      return styles.invPaid;
    case 'DRAFT':
      return styles.invDraft;
    case 'VOID':
      return styles.invVoid;
    default:
      return {};
  }
}

function summaryKey(s: ViewerFamilyBillingSummary): string {
  return s.householdGroupId ?? s.familyId ?? 'unknown';
}

function summaryTabLabel(
  s: ViewerFamilyBillingSummary,
  index: number,
): string {
  if (s.familyLabel?.trim()) return s.familyLabel.trim();
  if (s.isHouseholdGroupSpace) return `Espace partagé ${index + 1}`;
  return `Foyer ${index + 1}`;
}

function MemberChip({
  firstName,
  lastName,
  photoUrl,
}: {
  firstName: string;
  lastName: string;
  photoUrl: string | null;
}) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`;
  // Réécrit `localhost`/`127.0.0.1` → IP LAN via EXPO_PUBLIC_API_BASE
  // pour que le téléphone physique puisse charger l'image. Sans ce
  // helper, les URLs `http://localhost:3000/media/<uuid>` retournées
  // par le backend en dev étaient inaccessibles → fallback initiales.
  const resolvedUrl = absolutizeMediaUrl(photoUrl);
  return (
    <View style={styles.chip}>
      {resolvedUrl ? (
        <Image source={{ uri: resolvedUrl }} style={styles.chipImg} />
      ) : (
        <View style={styles.chipPh}>
          <Text style={styles.chipPhText}>{initials}</Text>
        </View>
      )}
      <Text style={styles.chipName}>
        {firstName} {lastName}
      </Text>
    </View>
  );
}

/** « 12 sept. 2026 ». */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Crédit du compte (ADR-0022) : le sien, pas celui d'un foyer, d'où sa place
 * hors des onglets. L'historique se déplie à la demande.
 */
function PayerCreditCard({ credit }: { credit: ViewerPayerCredit }) {
  const [open, setOpen] = useState(false);
  const kpi = payerCreditKpi(credit.balanceCents);
  return (
    <Card title="Crédit">
      <View style={styles.creditHead}>
        <Text style={styles.creditLabel}>{kpi.label}</Text>
        <Text
          style={[
            styles.creditValue,
            kpi.tone === 'ok' && styles.creditValueOk,
            kpi.tone === 'due' && styles.creditValueDue,
          ]}
        >
          {kpi.value}
        </Text>
      </View>
      {credit.balanceCents < 0 ? (
        <Text style={styles.hint}>Contactez le club pour le régulariser.</Text>
      ) : credit.balanceCents > 0 ? (
        <Text style={styles.hint}>
          Utilisez-le depuis une facture à payer ci-dessous.
        </Text>
      ) : null}
      {credit.movements.length > 0 ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={styles.creditToggle}
          >
            <Text style={styles.creditToggleText}>
              {open
                ? 'Masquer l’historique'
                : `Voir l’historique (${credit.movements.length})`}
            </Text>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={palette.primary}
            />
          </Pressable>
          {open ? (
            <View style={styles.payList}>
              {credit.movements.map((m) => (
                <View key={m.paymentId} style={styles.creditRow}>
                  <View style={styles.flexShrink}>
                    <Text style={styles.creditRowTitle}>
                      {payerCreditMovementTitle(m)}
                    </Text>
                    <Text style={styles.payLine}>
                      {formatShortDate(m.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.creditRowAmount}>
                    {signedEuroCents(m.amountCents)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export function FamilyScreen() {
  const { data, loading, error } = useQuery<ViewerAllFamilyBillingData>(
    VIEWER_ALL_FAMILY_BILLING,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  // Une erreur, module Paiement coupé compris, ne donne rien à afficher.
  const { data: creditData } = useQuery<ViewerPayerCreditData>(
    VIEWER_PAYER_CREDIT,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  const credit = creditData?.viewerPayerCredit ?? null;

  const summaries = useMemo(
    () => data?.viewerAllFamilyBillingSummaries ?? [],
    [data],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeSummary = useMemo<ViewerFamilyBillingSummary | null>(() => {
    if (summaries.length === 0) return null;
    if (selectedKey) {
      const found = summaries.find((s) => summaryKey(s) === selectedKey);
      if (found) return found;
    }
    return summaries[0] ?? null;
  }, [summaries, selectedKey]);

  const multiFamily = summaries.length > 1;
  const anyPayerView = summaries.some((s) => s.isPayerView);
  const shared = activeSummary?.isHouseholdGroupSpace === true;

  const pageTitle = multiFamily
    ? 'Mes foyers'
    : shared
      ? 'Espace familial partagé'
      : 'Ma famille';

  // Regroupement des factures par familyId (pour espaces partagés où
  // plusieurs foyers cohabitent dans une même liste de factures).
  const invoicesByFamily = useMemo(() => {
    type Invoices = ViewerFamilyBillingSummary['invoices'];
    if (!activeSummary || !shared) return new Map<string, Invoices>();
    const map = new Map<string, Invoices>();
    for (const inv of activeSummary.invoices) {
      const key = inv.familyId ?? 'shared';
      const arr = map.get(key) ?? [];
      arr.push(inv);
      map.set(key, arr);
    }
    return map;
  }, [activeSummary, shared]);

  const heroSubtitle = multiFamily
    ? `Vous êtes rattaché à ${summaries.length} foyers.`
    : shared
      ? 'Espace partagé entre plusieurs foyers, factures et enfants en commun.'
      : 'Membres du foyer et factures visibles par les responsables.';

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow={multiFamily ? 'MES FOYERS' : 'MA FAMILLE'}
        title={pageTitle}
        subtitle={heroSubtitle}
        gradient="hero"
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.inner}
        showsVerticalScrollIndicator={false}
      >
      <JoinFamilyByPayerEmailCta variant="compact" />

      {anyPayerView ? <InviteFamilyMemberCta /> : null}

      {anyPayerView && shouldShowPayerCredit(credit) ? (
        <PayerCreditCard credit={credit} />
      ) : null}

      {/* Onglets multi-foyer */}
      {multiFamily ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          style={styles.tabs}
        >
          {summaries.map((s, i) => {
            const k = summaryKey(s);
            const active = activeSummary && summaryKey(activeSummary) === k;
            return (
              <Pressable
                key={k}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setSelectedKey(k)}
              >
                <Ionicons
                  name={
                    s.isHouseholdGroupSpace ? 'people-circle-outline' : 'people-outline'
                  }
                  size={16}
                  color={active ? '#1565c0' : '#475569'}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {summaryTabLabel(s, i)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Facturation indisponible"
          description="Module désactivé ou droits insuffisants."
          variant="card"
        />
      ) : loading && !activeSummary ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={120} borderRadius={radius.xl} />
          <Skeleton height={88} borderRadius={radius.lg} />
        </View>
      ) : !activeSummary ? (
        <EmptyState
          icon="people-outline"
          title="Aucune donnée foyer"
          description="Votre club ne vous a pas encore rattaché à un foyer."
          variant="card"
        />
      ) : !activeSummary.isPayerView ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Accès facturation restreint"
          description="Réservé aux comptes adultes du foyer."
          variant="card"
        />
      ) : (
        <FamilySummaryView
          summary={activeSummary}
          shared={shared}
          invoicesByFamily={invoicesByFamily}
          creditBalanceCents={credit?.balanceCents ?? null}
        />
      )}
      </ScrollView>
    </View>
  );
}

function FamilySummaryView({
  summary,
  shared,
  invoicesByFamily,
  creditBalanceCents,
}: {
  summary: ViewerFamilyBillingSummary;
  shared: boolean;
  invoicesByFamily: Map<string, ViewerFamilyBillingSummary['invoices']>;
  /** Crédit du compte ; null tant qu'il n'est pas connu. */
  creditBalanceCents: number | null;
}) {
  return (
    <>
      {shared && summary.linkedHouseholdFamilies.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.subtitle}>Foyers liés</Text>
          <Text style={styles.hint}>
            Chaque carte représente un foyer. Seuls les membres que vous
            êtes autorisé à voir apparaissent.
          </Text>
          {summary.linkedHouseholdFamilies.map((hf) => (
            <View key={hf.familyId} style={styles.linkedCard}>
              <Text style={styles.linkedTitle}>
                {hf.label?.trim() || 'Foyer sans nom'}
              </Text>
              {hf.payers.length > 0 ? (
                <Text style={styles.linkedRoleLine}>
                  <Text style={styles.linkedRoleLabel}>Payeur(s) : </Text>
                  {hf.payers.map((p) => `${p.firstName} ${p.lastName}`).join(', ')}
                </Text>
              ) : null}
              {hf.observers.length > 0 ? (
                <Text style={styles.linkedRoleLine}>
                  <Text style={styles.linkedRoleLabel}>Observateur(s) : </Text>
                  {hf.observers
                    .map((o) => `${o.firstName} ${o.lastName}`)
                    .join(', ')}
                </Text>
              ) : null}
              {hf.members.length === 0 ? (
                <Text style={styles.hint}>
                  Aucun membre de ce foyer n&apos;est affiché pour votre compte.
                </Text>
              ) : (
                <View style={styles.chipWrap}>
                  {hf.members.map((m) => (
                    <MemberChip
                      key={m.memberId}
                      firstName={m.firstName}
                      lastName={m.lastName}
                      photoUrl={m.photoUrl}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {!shared && summary.familyLabel ? (
        <Text style={styles.familyLabel}>{summary.familyLabel}</Text>
      ) : null}

      {summary.familyMembers.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.subtitle}>
            {shared ? 'Tous les membres de l’espace' : 'Membres'}
          </Text>
          <View style={styles.chipWrap}>
            {summary.familyMembers.map((m) => (
              <MemberChip
                key={m.memberId}
                firstName={m.firstName}
                lastName={m.lastName}
                photoUrl={m.photoUrl}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.subtitle}>
          {shared ? 'Paiements & factures (espace partagé)' : 'Factures'}
        </Text>
        {summary.invoices.length === 0 ? (
          <Text style={styles.hint}>Aucune facture.</Text>
        ) : shared && invoicesByFamily.size > 1 ? (
          // Espace partagé avec plusieurs foyers responsables : on
          // groupe les factures par foyer pour clarifier qui doit quoi.
          [...invoicesByFamily.entries()].map(([familyId, invoices]) => {
            const firstInvoice = invoices[0];
            const label =
              firstInvoice?.familyLabel?.trim() ||
              `Foyer ${familyId.slice(0, 6)}`;
            return (
              <View key={familyId} style={styles.invoiceGroup}>
                <Text style={styles.invoiceGroupTitle}>{label}</Text>
                {invoices.map((inv) => (
                  <InvoiceCard
                    key={inv.id}
                    inv={inv}
                    creditBalanceCents={creditBalanceCents}
                  />
                ))}
              </View>
            );
          })
        ) : (
          summary.invoices.map((inv) => (
            <InvoiceCard
              key={inv.id}
              inv={inv}
              creditBalanceCents={creditBalanceCents}
            />
          ))
        )}
      </View>
    </>
  );
}

function InvoiceCard({
  inv,
  creditBalanceCents,
}: {
  inv: ViewerFamilyBillingSummary['invoices'][number];
  creditBalanceCents: number | null;
}) {
  // Une facture est payable si elle a un solde > 0 et n'est pas en
  // brouillon / annulée. Pour le reste, le card reste affiché mais
  // non-cliquable (juste de la lecture des paiements passés).
  const payable = inv.balanceCents > 0 && inv.status !== 'DRAFT';

  const client = useApolloClient();
  const [createCheckout, { loading: starting }] =
    useMutation<ViewerCreateInvoiceCheckoutSessionData>(
      VIEWER_CREATE_INVOICE_CHECKOUT_SESSION,
    );
  const [lockChoice] = useMutation<ViewerLockInvoicePaymentChoiceData>(
    VIEWER_LOCK_INVOICE_PAYMENT_CHOICE,
  );
  const [applyPayerCredit, { loading: applyingCredit }] =
    useMutation<ViewerApplyPayerCreditData>(VIEWER_APPLY_PAYER_CREDIT);
  // Ce que « Utiliser mon crédit » réglerait ; 0 : pas de bouton.
  const creditCents = payerCreditApplyCents(inv, creditBalanceCents);

  // Le montant envoyé est celui que l'adhérent confirme : l'API le refuse
  // s'il dépasse le crédit ou le reste dû relus sous verrou.
  async function applyCredit(amountCents: number) {
    try {
      const { data } = await applyPayerCredit({
        variables: { invoiceId: inv.id, amountCents },
      });
      const applied = data?.viewerApplyPayerCredit.amountCents ?? amountCents;
      Alert.alert(
        'Crédit utilisé',
        `${formatEuroCents(applied)} réglés avec votre crédit.`,
      );
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de régler avec votre crédit.',
      );
    } finally {
      // Réussite ou refus, la facture et le crédit se relisent. Un rechargement
      // en échec ne doit pas lever hors du gestionnaire.
      await client
        .refetchQueries({
          include: [VIEWER_ALL_FAMILY_BILLING, VIEWER_PAYER_CREDIT],
        })
        .catch(() => undefined);
    }
  }

  function promptCredit() {
    if (creditCents <= 0 || creditBalanceCents == null || applyingCredit) {
      return;
    }
    Alert.alert(
      'Utiliser mon crédit',
      payerCreditApplyConfirmation({
        invoiceLabel: inv.label,
        applyCents: creditCents,
        invoiceBalanceCents: inv.balanceCents,
        creditBalanceCents,
      }),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: `Régler ${formatEuroCents(creditCents)}`,
          onPress: () => void applyCredit(creditCents),
        },
      ],
      { cancelable: true },
    );
  }

  // Repli hors ligne quand la carte n'aboutit pas : le payeur verrouille un
  // mode manuel et reçoit les modalités du club. Sans ça la seule issue
  // était de réessayer la même carte ou d'appeler le club.
  async function chooseManual(
    method: 'MANUAL_TRANSFER' | 'MANUAL_CHECK' | 'MANUAL_CASH',
  ) {
    try {
      const { data } = await lockChoice({
        variables: { invoiceId: inv.id, method, installmentsCount: 1 },
      });
      const instructions =
        data?.viewerLockInvoicePaymentChoice?.instructions ??
        'Votre choix a été transmis au club.';
      Alert.alert('Mode de règlement enregistré', instructions);
      await client.refetchQueries({ include: [VIEWER_ALL_FAMILY_BILLING] });
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer ce mode de règlement.',
      );
    }
  }

  function promptManual() {
    Alert.alert(
      'Régler autrement',
      'Le club recevra votre choix et vous transmettra les modalités.',
      [
        {
          text: 'Virement bancaire',
          onPress: () => void chooseManual('MANUAL_TRANSFER'),
        },
        { text: 'Chèque', onPress: () => void chooseManual('MANUAL_CHECK') },
        { text: 'Espèces', onPress: () => void chooseManual('MANUAL_CASH') },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  async function startPayment(installmentsCount?: number) {
    try {
      const { data } = await createCheckout({
        variables: { invoiceId: inv.id, installmentsCount },
      });
      const payload = data?.viewerCreateInvoiceCheckoutSession;
      if (!payload?.url) {
        Alert.alert(
          'Indisponible',
          'Impossible d\'initier le paiement. Réessayez plus tard.',
        );
        return;
      }
      // Navigateur INTÉGRÉ qui se ferme dès que Stripe redirige vers
      // `paymentReturnUrl` — on revient DANS l'app, pas sur le web déconnecté.
      // Même mécanique que le paiement boutique (interpretStripeReturn partagé).
      const res = await WebBrowser.openAuthSessionAsync(
        payload.url,
        payload.paymentReturnUrl,
      );
      const outcome = interpretStripeReturn(res);
      if (outcome === 'paid') {
        // « reçu », pas « payé » : le webhook Stripe (asynchrone) bascule le
        // vrai statut. On rafraîchit la facturation, qui le reflétera.
        Alert.alert(
          'Paiement reçu',
          'Votre paiement est en cours de confirmation.',
        );
        await client.refetchQueries({ include: [VIEWER_ALL_FAMILY_BILLING] });
        // Le webhook Stripe solde la facture quelques secondes plus tard : un
        // second refetch différé rattrape le statut sans action de l'adhérent.
        setTimeout(() => {
          void client.refetchQueries({ include: [VIEWER_ALL_FAMILY_BILLING] });
        }, 3500);
      } else if (outcome === 'canceled') {
        Alert.alert('Paiement annulé', 'Votre facture reste à régler.');
      }
      // 'dismissed' (fermeture manuelle) : pas de message.
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de lancer le paiement.',
      );
    }
  }

  function handlePress() {
    if (!payable || starting) return;
    // Sheet à 2 options : 1× ou 3× (Stripe peut refuser le 3× selon la
    // config du compte du club — on laisse Stripe trancher côté serveur).
    Alert.alert(
      'Régler cette facture',
      `Solde restant : ${formatEuroCents(inv.balanceCents)}\nChoisissez le mode de règlement.`,
      [
        {
          text: 'Payer en 1 fois',
          onPress: () => void startPayment(1),
        },
        {
          text: 'Payer en 3 fois',
          onPress: () => void startPayment(3),
        },
        {
          text: 'Régler autrement (virement, chèque, espèces)',
          onPress: () => promptManual(),
        },
        { text: 'Annuler', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }

  // On enveloppe systématiquement dans un Pressable — il devient un
  // container "non interactif" si la facture n'est pas payable, ce qui
  // évite de devoir gérer 2 arbres JSX différents.
  return (
    <Pressable
      onPress={handlePress}
      disabled={!payable || starting}
      accessibilityRole={payable ? 'button' : undefined}
      accessibilityLabel={
        payable
          ? `Payer ${formatEuroCents(inv.balanceCents)} pour ${inv.label}`
          : `Facture ${inv.label} ${statusLabel(inv.status)}`
      }
      style={({ pressed }) => [
        styles.invCard,
        statusStyle(inv.status),
        payable && pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.invHead}>
        <Text style={styles.invBadge}>{statusLabel(inv.status)}</Text>
        <Text style={styles.invAmount}>
          {formatEuroCents(inv.amountCents)}
        </Text>
      </View>
      <Text style={styles.invLabel}>{inv.label}</Text>
      <View style={styles.invDetails}>
        <Text style={styles.invDetailText}>
          Payé : {formatEuroCents(inv.totalPaidCents)}
        </Text>
        <Text style={styles.invBalance}>
          Solde : {formatEuroCents(inv.balanceCents)}
        </Text>
      </View>
      {inv.payments?.length ? (
        <View style={styles.payList}>
          {inv.payments.map((p) => (
            <Text key={p.id} style={styles.payLine}>
              {formatEuroCents(p.amountCents)} —{' '}
              {p.paidByFirstName || p.paidByLastName
                ? `${p.paidByFirstName ?? ''} ${p.paidByLastName ?? ''}`.trim()
                : 'Club'}
            </Text>
          ))}
        </View>
      ) : null}
      {payable ? (
        <View style={styles.payCtaRow}>
          {starting ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <>
              <Ionicons
                name="card-outline"
                size={16}
                color={palette.primary}
              />
              <Text style={styles.payCtaText}>
                Toucher pour régler en ligne
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={palette.primary}
              />
            </>
          )}
        </View>
      ) : null}
      {creditCents > 0 ? (
        <Pressable
          onPress={promptCredit}
          disabled={applyingCredit || starting}
          accessibilityRole="button"
          accessibilityLabel={`Utiliser mon crédit : régler ${formatEuroCents(creditCents)} pour ${inv.label}`}
          style={({ pressed }) => [
            styles.creditCta,
            pressed && { opacity: 0.85 },
          ]}
        >
          {applyingCredit ? (
            <ActivityIndicator size="small" color={palette.primary} />
          ) : (
            <>
              <Ionicons
                name="wallet-outline"
                size={16}
                color={palette.primary}
              />
              <Text style={styles.payCtaText}>
                Utiliser mon crédit · {formatEuroCents(creditCents)}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  inner: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  strong: { fontFamily: typography.bodyStrong.fontFamily },
  hint: { ...typography.small, color: palette.muted, marginBottom: spacing.sm },
  section: { gap: spacing.sm },
  subtitle: { ...typography.h3, color: palette.ink, marginBottom: spacing.sm },

  tabs: {
    marginHorizontal: -spacing.xl,
  },
  tabsRow: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    minHeight: 36,
  },
  tabActive: { backgroundColor: palette.primaryLight, borderColor: palette.primary },
  tabText: { ...typography.smallStrong, color: palette.body },
  tabTextActive: { color: palette.primary },

  familyLabel: {
    ...typography.bodyStrong,
    color: palette.body,
    marginBottom: spacing.md,
  },
  linkedCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.sm,
  },
  linkedTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  linkedRoleLine: { ...typography.small, color: palette.body, marginBottom: 2 },
  linkedRoleLabel: {
    fontFamily: typography.bodyStrong.fontFamily,
    color: palette.ink,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.bgAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipImg: { width: 26, height: 26, borderRadius: 13 },
  chipPh: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipPhText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: typography.smallStrong.fontFamily,
  },
  chipName: { ...typography.small, color: palette.body },

  invoiceGroup: { marginBottom: spacing.md, gap: spacing.sm },
  invoiceGroupTitle: {
    ...typography.eyebrow,
    color: palette.muted,
    marginBottom: spacing.xs,
  },

  invCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    ...shadow.sm,
  },
  invOpen: { backgroundColor: palette.warningBg, borderColor: palette.warningBorder },
  invPaid: { backgroundColor: palette.successBg, borderColor: palette.successBorder },
  invDraft: { backgroundColor: palette.bgAlt, borderColor: palette.border },
  invVoid: { backgroundColor: palette.dangerBg, borderColor: palette.dangerBorder },
  invHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  invBadge: { ...typography.smallStrong, color: palette.body },
  invAmount: { ...typography.h3, color: palette.ink },
  invLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
    marginBottom: spacing.sm,
  },
  invDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  invDetailText: { ...typography.small, color: palette.body },
  invBalance: { ...typography.smallStrong, color: palette.danger },
  payList: { marginTop: spacing.sm, gap: 2 },
  payLine: { ...typography.small, color: palette.muted },
  payCtaRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  payCtaText: {
    ...typography.smallStrong,
    color: palette.primary,
  },

  flexShrink: { flexShrink: 1 },
  creditHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  creditLabel: { ...typography.small, color: palette.muted },
  creditValue: { ...typography.h3, color: palette.ink },
  creditValueOk: { color: palette.successText },
  creditValueDue: { color: palette.warningText },
  creditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
  },
  creditToggleText: { ...typography.smallStrong, color: palette.primary },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  creditRowTitle: { ...typography.small, color: palette.body },
  creditRowAmount: { ...typography.smallStrong, color: palette.ink },
  creditCta: {
    marginTop: spacing.sm,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.primary,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
});
