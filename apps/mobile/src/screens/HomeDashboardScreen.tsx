import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, EmptyState, Pill, ScreenContainer } from '../components/ui';
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
import { palette, radius, spacing, typography } from '../lib/theme';
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
  const totalBalance = openInvoices.reduce((s, i) => s + i.balanceCents, 0);
  const totalPaid =
    billing?.invoices.reduce((s, i) => s + i.totalPaidCents, 0) ?? 0;
  const nowMs = Date.now();
  const hasOverdue = openInvoices.some(
    (i) => i.dueAt && new Date(i.dueAt).getTime() < nowMs,
  );

  const cert = medicalCertState(me?.medicalCertExpiresAt ?? null);

  return (
    <ScreenContainer>
      {/* Hero */}
      <View>
        <View style={styles.heroHead}>
          <Text style={styles.eyebrow}>{clubName ?? 'ESPACE MEMBRE'}</Text>
          {adminSwitch?.canAccessClubBackOffice === true ? (
            <MemberRoleToggle
              canAccessClubBackOffice
              adminWorkspaceClubId={adminSwitch.adminWorkspaceClubId}
              variant="header"
            />
          ) : null}
        </View>
        <Text style={styles.heroTitle}>
          {meLoading
            ? '…'
            : me
              ? `Bonjour ${me.firstName}`
              : meError
                ? 'Espace membre'
                : '…'}
        </Text>
        {me ? (
          <Text style={styles.heroSubtitle}>
            Heureux de vous revoir.
          </Text>
        ) : null}
      </View>

      <MemberProfileSwitcher />

      {/* Pills */}
      <View style={styles.pillsRow}>
        {!hideMemberModules ? (
          <>
            <Pill
              icon="school-outline"
              tone={me?.gradeLevelLabel ? 'primary' : 'neutral'}
              label={me?.gradeLevelLabel ?? 'Grade non renseigné'}
            />
            <Pill
              icon="shield-checkmark-outline"
              tone={cert.ok ? 'success' : 'warning'}
              label={cert.label}
            />
            {me?.telegramLinked ? (
              <Pill icon="send-outline" tone="success" label="Telegram relié" />
            ) : (
              <Pill
                icon="send-outline"
                tone="neutral"
                label="Telegram non relié"
              />
            )}
          </>
        ) : null}
        {billing?.isHouseholdGroupSpace && isPayer ? (
          <Pill
            icon="people-outline"
            tone="info"
            label="Espace familial partagé"
            onPress={() => navigation.navigate('Famille')}
          />
        ) : null}
      </View>

      <JoinFamilyByPayerEmailCta variant="dashboard" />

      {/* Mon programme */}
      {!hideMemberModules ? (
        <Card title="Mon programme">
          {me?.gradeLevelLabel ? (
            <View style={{ gap: spacing.md }}>
              <View style={styles.programRow}>
                <View style={styles.gradeIcon}>
                  <Ionicons name="school" size={22} color={palette.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.programGrade}>{me.gradeLevelLabel}</Text>
                  <Text style={styles.programGradeSub}>Votre grade actuel</Text>
                </View>
              </View>
              <Button
                label="Voir ma progression"
                onPress={() => navigation.navigate('Progression')}
                variant="secondary"
                icon="trending-up-outline"
                fullWidth
              />
            </View>
          ) : (
            <EmptyState
              icon="book-outline"
              title="Grade à compléter"
              description="Les contenus pédagogiques par grade apparaîtront ici dès qu'il sera renseigné."
            />
          )}
        </Card>
      ) : null}

      {/* Prochains cours */}
      {!hideMemberModules ? (
        <Card
          title="Prochains cours"
          headerRight={
            slots.length > 3 ? (
              <Pressable
                onPress={() => navigation.navigate('Planning')}
                accessibilityRole="link"
                accessibilityLabel="Voir tous les cours"
                hitSlop={8}
              >
                <Text style={styles.linkText}>Voir tout</Text>
              </Pressable>
            ) : null
          }
        >
          {slotsQ.error ? (
            <Text style={styles.hintError}>
              Planning indisponible (module ou droits).
            </Text>
          ) : dashSlots.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="Aucun cours à venir"
              description="Les prochains créneaux planifiés apparaîtront ici."
            />
          ) : (
            <View style={{ gap: spacing.md }}>
              {dashSlots.map((s) => (
                <SlotCard key={s.id} slot={s} />
              ))}
            </View>
          )}
        </Card>
      ) : null}

      {/* Mes factures (uniquement payeurs) */}
      {isPayer ? (
        <Card
          title="Mes factures"
          headerRight={
            hasOverdue ? <Pill tone="danger" label="En retard" /> : null
          }
        >
          {billQ.error ? (
            <Text style={styles.hintError}>
              Facturation indisponible (module ou droits).
            </Text>
          ) : !billing ? (
            <Text style={styles.hint}>Chargement…</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={styles.kpiRow}>
                <Kpi
                  label="Reste à payer"
                  value={formatEuroCents(totalBalance)}
                  tone={totalBalance > 0 ? 'warning' : 'success'}
                />
                <Kpi
                  label="Déjà réglé"
                  value={formatEuroCents(totalPaid)}
                  tone="success"
                />
              </View>
              {openInvoices.length === 0 ? (
                <Text style={styles.hint}>
                  ✓ Aucun solde ouvert — tout est à jour.
                </Text>
              ) : (
                <View style={{ gap: spacing.sm }}>
                  {openInvoices.slice(0, 3).map((inv) => {
                    const overdue =
                      inv.dueAt && new Date(inv.dueAt).getTime() < nowMs;
                    return (
                      <View key={inv.id} style={styles.invoiceLine}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.invoiceLabel} numberOfLines={1}>
                            {inv.label}
                          </Text>
                          {overdue ? (
                            <Text style={styles.invoiceOverdue}>En retard</Text>
                          ) : null}
                        </View>
                        <Text style={styles.invoiceAmt}>
                          {formatEuroCents(inv.balanceCents)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <Pressable
                onPress={() => navigation.navigate('Famille')}
                accessibilityRole="link"
                accessibilityLabel="Voir toutes les factures"
                style={styles.linkRow}
              >
                <Text style={styles.linkText}>Voir toutes les factures</Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  color={palette.primary}
                />
              </Pressable>
            </View>
          )}
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning';
}) {
  const bg = tone === 'success' ? palette.successBg : palette.warningBg;
  const fg = tone === 'success' ? '#15803d' : '#92400e';
  return (
    <View style={[styles.kpi, { backgroundColor: bg }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color: fg }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eyebrow: { ...typography.eyebrow, color: palette.primary },
  heroTitle: {
    ...typography.displayLg,
    color: palette.ink,
    marginTop: spacing.sm,
  },
  heroSubtitle: {
    ...typography.body,
    color: palette.muted,
    marginTop: spacing.xs,
  },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  gradeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programGrade: { ...typography.h3, color: palette.ink },
  programGradeSub: { ...typography.small, color: palette.muted },

  hint: { ...typography.small, color: palette.muted },
  hintError: { ...typography.small, color: palette.danger },

  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpi: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xxs,
  },
  kpiLabel: { ...typography.caption, color: palette.muted },
  kpiValue: { ...typography.metric },

  invoiceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  invoiceLabel: { ...typography.bodyStrong, color: palette.ink },
  invoiceOverdue: {
    ...typography.caption,
    color: palette.danger,
    marginTop: 2,
  },
  invoiceAmt: { ...typography.bodyStrong, color: palette.ink },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    minHeight: 36,
  },
  linkText: {
    ...typography.bodyStrong,
    color: palette.primary,
  },
});
