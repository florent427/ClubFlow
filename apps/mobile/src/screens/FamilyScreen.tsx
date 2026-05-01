import { useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  EmptyState,
  ScreenHero,
  Skeleton,
} from '../components/ui';
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { VIEWER_ALL_FAMILY_BILLING } from '../lib/viewer-documents';
import type {
  ViewerAllFamilyBillingData,
  ViewerFamilyBillingSummary,
} from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';

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
  return (
    <View style={styles.chip}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.chipImg} />
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

export function FamilyScreen() {
  const { data, loading, error } = useQuery<ViewerAllFamilyBillingData>(
    VIEWER_ALL_FAMILY_BILLING,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );

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
}: {
  summary: ViewerFamilyBillingSummary;
  shared: boolean;
  invoicesByFamily: Map<string, ViewerFamilyBillingSummary['invoices']>;
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
                  <InvoiceCard key={inv.id} inv={inv} />
                ))}
              </View>
            );
          })
        ) : (
          summary.invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} />)
        )}
      </View>
    </>
  );
}

function InvoiceCard({
  inv,
}: {
  inv: ViewerFamilyBillingSummary['invoices'][number];
}) {
  return (
    <View style={[styles.invCard, statusStyle(inv.status)]}>
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
    </View>
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
});
