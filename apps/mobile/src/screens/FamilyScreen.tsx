import { useQuery } from '@apollo/client/react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { VIEWER_FAMILY_BILLING } from '../lib/viewer-documents';
import type { ViewerBillingData } from '../lib/viewer-types';
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
  const { data, loading, error } = useQuery<ViewerBillingData>(
    VIEWER_FAMILY_BILLING,
    { errorPolicy: 'all' },
  );

  const summary = data?.viewerFamilyBillingSummary;
  const shared = summary?.isHouseholdGroupSpace === true;
  const linked = summary?.linkedHouseholdFamilies ?? [];

  const pageTitle = shared ? 'Espace familial partagé' : 'Ma famille';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>{pageTitle}</Text>

      {shared ? (
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

      {error ? (
        <Text style={styles.hint}>
          Facturation indisponible (module ou droits).
        </Text>
      ) : loading ? (
        <Text style={styles.hint}>Chargement…</Text>
      ) : !summary ? (
        <Text style={styles.hint}>Aucune donnée foyer.</Text>
      ) : !summary.isPayerView ? (
        <Text style={styles.hint}>
          Réservé aux comptes adultes du foyer (mineurs : pas d&apos;accès
          facturation).
        </Text>
      ) : (
        <>
          {shared && linked.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.subtitle}>Foyers liés</Text>
              <Text style={styles.hint}>
                Chaque carte représente un foyer. Seuls les membres que vous
                êtes autorisé à voir apparaissent.
              </Text>
              {linked.map((hf) => (
                <View key={hf.familyId} style={styles.linkedCard}>
                  <Text style={styles.linkedTitle}>
                    {hf.label?.trim() || 'Foyer sans nom'}
                  </Text>
                  {hf.members.length === 0 ? (
                    <Text style={styles.hint}>
                      Aucun membre de ce foyer n&apos;est affiché pour votre
                      compte.
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

          {shared ? (
            <View style={styles.section}>
              <Text style={styles.subtitle}>Documents & messages</Text>
              <Text style={styles.hint}>
                Documents partagés et messages familiaux — en conception.
              </Text>
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
            ) : (
              summary.invoices.map((inv) => (
                <View
                  key={inv.id}
                  style={[styles.invCard, statusStyle(inv.status)]}
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
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#111' },
  lead: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 16 },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
