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
import { InviteFamilyMemberCta } from '../components/InviteFamilyMemberCta';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { VIEWER_ALL_FAMILY_BILLING } from '../lib/viewer-documents';
import type {
  ViewerAllFamilyBillingData,
  ViewerFamilyBillingSummary,
} from '../lib/viewer-types';
import { formatEuroCents } from '../lib/format';

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

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>{pageTitle}</Text>

      {multiFamily ? (
        <Text style={styles.lead}>
          Vous êtes rattaché à <Text style={styles.strong}>{summaries.length} foyers</Text>.
          Sélectionnez un onglet pour voir le détail.
        </Text>
      ) : shared ? (
        <Text style={styles.lead}>
          Votre club a relié plusieurs foyers dans un{' '}
          <Text style={styles.strong}>espace partagé</Text>. Vous partagez les{' '}
          <Text style={styles.strong}>mêmes factures</Text> et voyez les{' '}
          <Text style={styles.strong}>mêmes enfants</Text>, mais chaque parent garde
          son <Text style={styles.strong}>espace personnel privé</Text>.
        </Text>
      ) : (
        <Text style={styles.leadTight}>
          Membres du foyer et factures visibles par les adultes responsables de
          la facturation.
        </Text>
      )}

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
        <Text style={styles.hint}>
          Facturation indisponible (module ou droits).
        </Text>
      ) : loading && !activeSummary ? (
        <Text style={styles.hint}>Chargement…</Text>
      ) : !activeSummary ? (
        <Text style={styles.hint}>Aucune donnée foyer.</Text>
      ) : !activeSummary.isPayerView ? (
        <Text style={styles.hint}>
          Réservé aux comptes adultes du foyer (mineurs : pas d&apos;accès
          facturation).
        </Text>
      ) : (
        <FamilySummaryView
          summary={activeSummary}
          shared={shared}
          invoicesByFamily={invoicesByFamily}
        />
      )}
    </ScrollView>
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
  page: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#111' },
  lead: { fontSize: 15, color: '#444', lineHeight: 22, marginBottom: 16 },
  leadTight: { fontSize: 15, color: '#444', marginBottom: 16 },
  strong: { fontWeight: '700' },
  hint: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 8 },
  section: { marginBottom: 20 },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111',
  },

  tabs: {
    marginBottom: 16,
    marginHorizontal: -16,
  },
  tabsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: 'white',
  },
  tabActive: { backgroundColor: '#dbeafe', borderColor: '#1565c0' },
  tabText: { color: '#475569', fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#1565c0', fontWeight: '700' },

  familyLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  linkedCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  linkedTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  linkedRoleLine: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 4,
  },
  linkedRoleLabel: { fontWeight: '700', color: '#0f172a' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipImg: { width: 32, height: 32, borderRadius: 16 },
  chipPh: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1565c0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipPhText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chipName: { fontSize: 14, color: '#333' },

  invoiceGroup: { marginBottom: 12 },
  invoiceGroupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  invCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  invOpen: { backgroundColor: '#fff3e0', borderColor: '#ffcc80' },
  invPaid: { backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' },
  invDraft: { backgroundColor: '#f5f5f5', borderColor: '#e0e0e0' },
  invVoid: { backgroundColor: '#fce4ec', borderColor: '#f48fb1' },
  invHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  invBadge: { fontSize: 13, fontWeight: '700', color: '#333' },
  invAmount: { fontSize: 17, fontWeight: '700', color: '#111' },
  invLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#222' },
  invDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  invDetailText: { fontSize: 14, color: '#555' },
  invBalance: { fontSize: 14, fontWeight: '700', color: '#c62828' },
  payList: { marginTop: 8 },
  payLine: { fontSize: 13, color: '#666', marginBottom: 4 },
});
