import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { JoinFamilyByPayerEmailCta } from '../components/JoinFamilyByPayerEmailCta';
import { MemberProfileSwitcher } from '../components/MemberProfileSwitcher';
import { MemberRoleToggle } from '../components/MemberRoleToggle';
import { SlotCard } from '../components/SlotCard';
import {
  CLUB,
  VIEWER_ADMIN_SWITCH,
  VIEWER_FAMILY_BILLING,
  VIEWER_ME,
  VIEWER_UPCOMING_SLOTS,
} from '../lib/viewer-documents';
import type {
  ClubQueryData,
  ViewerAdminSwitchData,
  ViewerBillingData,
  ViewerMeData,
  ViewerUpcomingData,
} from '../lib/viewer-types';
import { formatEuroCents, medicalCertState } from '../lib/format';
import type { MainTabParamList } from '../types/navigation';

export function HomeDashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: adminSwitchData } = useQuery<ViewerAdminSwitchData>(
    VIEWER_ADMIN_SWITCH,
    { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
  );
  const { data: meData, loading: meLoading, error: meError } =
    useQuery<ViewerMeData>(VIEWER_ME, { errorPolicy: 'all' });
  const { data: clubData } = useQuery<ClubQueryData>(CLUB);

  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;

  const slotsQ = useQuery<ViewerUpcomingData>(VIEWER_UPCOMING_SLOTS, {
    skip: hideMemberModules,
    errorPolicy: 'all',
  });
  const billQ = useQuery<ViewerBillingData>(VIEWER_FAMILY_BILLING, {
    errorPolicy: 'all',
  });

  const me = meData?.viewerMe;
  const adminSwitch = adminSwitchData?.viewerAdminSwitch;
  const clubName = clubData?.club?.name;
  const slots = slotsQ.data?.viewerUpcomingCourseSlots ?? [];
  const dashSlots = slots.slice(0, 3);
  const billing = billQ.data?.viewerFamilyBillingSummary;
  const isPayer = billing?.isPayerView ?? false;
  const openInvoices =
    billing?.invoices.filter((i) => i.balanceCents > 0) ?? [];

  const cert = medicalCertState(me?.medicalCertExpiresAt ?? null);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageInner}>
      <View style={styles.heroHead}>
        <Text style={styles.eyebrow}>
          {clubName ? clubName : 'Espace membre'}
        </Text>
        {adminSwitch?.canAccessClubBackOffice === true ? (
          <MemberRoleToggle
            canAccessClubBackOffice
            adminWorkspaceClubId={adminSwitch.adminWorkspaceClubId}
            variant="header"
          />
        ) : null}
      </View>

      <MemberProfileSwitcher />

      <Text style={styles.heroTitle}>
        {meLoading
          ? '…'
          : me
            ? `Content de te revoir, ${me.firstName}`
            : meError
              ? 'Espace membre'
              : '…'}
      </Text>

      <View style={styles.badgesRow}>
        {!hideMemberModules ? (
          <>
            <View
              style={[
                styles.pill,
                !me?.gradeLevelLabel ? styles.pillMuted : null,
              ]}
            >
              <Ionicons name="school-outline" size={16} color="#555" />
              <Text style={styles.pillText}>
                {me?.gradeLevelLabel ?? 'Grade non renseigné'}
              </Text>
            </View>
            <View
              style={[styles.pill, cert.ok ? styles.pillOk : styles.pillWarn]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={16}
                color={cert.ok ? '#2e7d32' : '#f57c00'}
              />
              <Text style={styles.pillText}>{cert.label}</Text>
            </View>
            {me?.telegramLinked ? (
              <View style={[styles.pill, styles.pillOk]}>
                <Ionicons name="send-outline" size={16} color="#2e7d32" />
                <Text style={styles.pillText}>Telegram relié</Text>
              </View>
            ) : (
              <View style={[styles.pill, styles.pillMuted]}>
                <Ionicons name="send-outline" size={16} color="#888" />
                <Text style={styles.pillText}>Telegram non relié</Text>
              </View>
            )}
          </>
        ) : null}
        {billing?.isHouseholdGroupSpace ? (
          <Pressable
            style={[styles.pill, styles.pillMuted]}
            onPress={() => navigation.navigate('Famille')}
          >
            <Ionicons name="people-outline" size={16} color="#555" />
            <Text style={styles.pillLink}>Espace familial partagé</Text>
          </Pressable>
        ) : null}
      </View>

      <JoinFamilyByPayerEmailCta variant="dashboard" />

      {!hideMemberModules ? (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Mon programme</Text>
            {me?.gradeLevelLabel ? (
              <View style={styles.programBlock}>
                <View style={styles.programRow}>
                  <Ionicons name="school" size={22} color="#1565c0" />
                  <View>
                    <Text style={styles.programGrade}>{me.gradeLevelLabel}</Text>
                    <Text style={styles.hint}>Votre grade actuel</Text>
                  </View>
                </View>
                <Pressable onPress={() => navigation.navigate('Progression')}>
                  <Text style={styles.link}>Voir ma progression complète</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.emptySoft}>
                <Ionicons name="book-outline" size={32} color="#999" />
                <Text style={styles.emptyText}>
                  Votre grade n&apos;est pas encore renseigné. Les contenus
                  pédagogiques par grade seront disponibles ici.
                </Text>
              </View>
            )}
            <Pressable
              style={styles.btnOutline}
              onPress={() => navigation.navigate('Planning')}
            >
              <Text style={styles.btnOutlineText}>Consulter le planning</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Prochains cours</Text>
              {slots.length > 3 ? (
                <Pressable onPress={() => navigation.navigate('Planning')}>
                  <Text style={styles.link}>Voir tout</Text>
                </Pressable>
              ) : null}
            </View>
            {slotsQ.error ? (
              <Text style={styles.hint}>
                Planning indisponible (module ou droits).
              </Text>
            ) : dashSlots.length === 0 ? (
              <Text style={styles.hint}>Aucun cours à venir pour l’instant.</Text>
            ) : (
              dashSlots.map((s) => <SlotCard key={s.id} slot={s} />)
            )}
          </View>
        </>
      ) : null}

      <View style={[styles.panel, styles.panelWide]}>
        <Text style={styles.panelTitle}>Famille & paiements</Text>
        {billQ.error ? (
          <Text style={styles.hint}>
            Facturation indisponible (module ou droits).
          </Text>
        ) : !billing ? (
          <Text style={styles.hint}>Chargement…</Text>
        ) : !isPayer ? (
          <Text style={styles.hint}>
            L’accès au détail des factures est réservé au payeur du foyer.
          </Text>
        ) : (
          <>
            {billing.familyLabel ? (
              <Text style={styles.familyLabel}>{billing.familyLabel}</Text>
            ) : null}
            {openInvoices.length === 0 ? (
              <Text style={styles.hint}>Aucun solde ouvert.</Text>
            ) : (
              openInvoices.slice(0, 3).map((inv) => (
                <View key={inv.id} style={styles.invoiceLine}>
                  <Text style={styles.invoiceLabel}>{inv.label}</Text>
                  <Text style={styles.invoiceAmt}>
                    {formatEuroCents(inv.balanceCents)}
                  </Text>
                </View>
              ))
            )}
            <Pressable onPress={() => navigation.navigate('Famille')}>
              <Text style={styles.link}>Ouvrir Ma famille</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  pageInner: { padding: 16, paddingBottom: 32 },
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  eyebrow: {
    fontSize: 12,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  pillMuted: { opacity: 0.9 },
  pillOk: {
    backgroundColor: '#e8f5e9',
    borderColor: '#c8e6c9',
  },
  pillWarn: {
    backgroundColor: '#fff3e0',
    borderColor: '#ffe0b2',
  },
  pillText: { fontSize: 13, color: '#333', maxWidth: 220 },
  pillLink: { fontSize: 13, color: '#1565c0', fontWeight: '600' },
  panel: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  panelWide: {},
  panelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  programBlock: { marginBottom: 12 },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  programGrade: { fontSize: 17, fontWeight: '600' },
  hint: { fontSize: 14, color: '#666', marginTop: 4 },
  link: {
    fontSize: 15,
    color: '#1565c0',
    fontWeight: '600',
    marginTop: 8,
  },
  emptySoft: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: '#1565c0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  btnOutlineText: { color: '#1565c0', fontWeight: '600', fontSize: 15 },
  familyLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  invoiceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  invoiceLabel: { flex: 1, fontSize: 14, color: '#333' },
  invoiceAmt: { fontSize: 14, fontWeight: '700', color: '#111' },
});
