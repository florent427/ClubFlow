import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  Card,
  KpiTile,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatEuroCents,
  palette,
  spacing,
  typography,
  useClubTheme,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DASHBOARD_SUMMARY } from '../../lib/documents/dashboard';
import { storage } from '../../lib/storage';
import { useViewer } from '../../lib/club-modules-context';
import {
  canAccessAccounting,
  canAccessSystem,
} from '../../lib/permissions';

type DashboardData = {
  dashboardSummary: {
    activeMembers: number;
    newMembersThisMonth: number;
    pendingPaymentsCount: number;
    pendingPaymentsTotalCents: number;
    upcomingEventsCount: number;
    upcomingSlotsCount: number;
    announcementsCount: number;
    surveysOpenCount: number;
    ordersThisMonth: number;
    revenueThisMonthCents: number;
    grantApplicationsActive: number;
    sponsorshipDealsActive: number;
    accountingBalanceCents: number;
    accountingNeedsReviewCount: number;
    messagingUnreadCount: number;
  } | null;
};

export function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { clubName, isClubBranded } = useClubTheme();
  const { permissions } = useViewer();
  const { data, loading, refetch } = useQuery<DashboardData>(
    DASHBOARD_SUMMARY,
    { errorPolicy: 'all' },
  );

  const summary = data?.dashboardSummary;

  const onLogout = async () => {
    await storage.clearAuth();
    navigation.reset({ index: 0, routes: [{ name: 'Login' as never }] });
  };

  return (
    <ScreenContainer
      scroll
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow={isClubBranded ? 'ESPACE ADMIN' : 'CLUBFLOW ADMIN'}
        title={clubName ?? 'Dashboard'}
        subtitle="Pilotez votre club en mobilité"
        trailing={
          <AnimatedPressable
            onPress={() => void onLogout()}
            accessibilityRole="button"
            accessibilityLabel="Déconnexion"
            style={dashHeaderStyles.logoutBtn}
          >
            <Ionicons name="log-out-outline" size={22} color="#ffffff" />
          </AnimatedPressable>
        }
      />

      {/* Quick actions */}
      <View style={styles.quickActions}>
        <QuickActionButton
          icon="add-circle-outline"
          label="Écriture"
          onPress={() =>
            navigation.navigate('More' as never, {
              screen: 'NewEntry',
            } as never)
          }
        />
        <QuickActionButton
          icon="megaphone-outline"
          label="Annonce"
          onPress={() =>
            navigation.navigate('More' as never, {
              screen: 'NewAnnouncement',
            } as never)
          }
        />
        <QuickActionButton
          icon="paper-plane-outline"
          label="Message"
          onPress={() =>
            navigation.navigate('More' as never, {
              screen: 'QuickMessage',
            } as never)
          }
        />
        <QuickActionButton
          icon="person-add-outline"
          label="Adhérent"
          onPress={() =>
            navigation.navigate('Community' as never, {
              screen: 'NewMember',
            } as never)
          }
        />
      </View>

      {/* KPIs row 1 */}
      <View style={styles.kpisRow}>
        <KpiTile
          icon="people"
          label="Membres actifs"
          value={String(summary?.activeMembers ?? '—')}
          delta={
            summary && summary.newMembersThisMonth > 0
              ? { value: `+${summary.newMembersThisMonth} ce mois`, positive: true }
              : null
          }
        />
        <KpiTile
          icon="card-outline"
          label="Impayés"
          value={
            summary
              ? formatEuroCents(summary.pendingPaymentsTotalCents)
              : '—'
          }
          tone="warm"
        />
      </View>

      <View style={styles.kpisRow}>
        <KpiTile
          icon="calendar-outline"
          label="Événements"
          value={String(summary?.upcomingEventsCount ?? '—')}
          tone="cool"
        />
        <KpiTile
          icon="chatbubble-ellipses-outline"
          label="Messages non lus"
          value={String(summary?.messagingUnreadCount ?? '—')}
          tone="primary"
        />
      </View>

      {canAccessAccounting(permissions) ? (
        <View style={styles.kpisRow}>
          <KpiTile
            icon="receipt-outline"
            label="À valider (compta)"
            value={String(summary?.accountingNeedsReviewCount ?? '—')}
            tone="admin"
          />
          <KpiTile
            icon="trending-up-outline"
            label="CA du mois"
            value={
              summary
                ? formatEuroCents(summary.revenueThisMonthCents)
                : '—'
            }
            tone="success"
          />
        </View>
      ) : null}

      {/* Activité récente */}
      <Card padding="lg" style={{ marginTop: spacing.lg, marginHorizontal: spacing.lg }}>
        <Text style={styles.sectionTitle}>Activité récente</Text>
        <View style={styles.recentList}>
          <RecentItem
            icon="checkmark-circle-outline"
            text="3 inscriptions validées sur «Stage de Pâques»"
            tone="success"
          />
          <RecentItem
            icon="card-outline"
            text="2 paiements Stripe reçus aujourd'hui"
            tone="info"
          />
          <RecentItem
            icon="alert-circle-outline"
            text="5 écritures comptables à catégoriser"
            tone="warning"
          />
        </View>
      </Card>

      {/* Ouverture rapide */}
      <Card padding="lg" style={{ margin: spacing.lg }}>
        <Text style={styles.sectionTitle}>Ouverture rapide</Text>
        <View style={styles.pillsRow}>
          <Pill
            icon="storefront-outline"
            label="Boutique"
            onPress={() =>
              navigation.navigate('More' as never, {
                screen: 'ShopProducts',
              } as never)
            }
          />
          <Pill
            icon="globe-outline"
            label="Vitrine"
            onPress={() =>
              navigation.navigate('More' as never, {
                screen: 'VitrineHome',
              } as never)
            }
          />
          <Pill
            icon="folder-open-outline"
            label="Subventions"
            onPress={() =>
              navigation.navigate('More' as never, {
                screen: 'Subsidies',
              } as never)
            }
          />
          {canAccessSystem(permissions) ? (
            <Pill
              icon="shield-checkmark-outline"
              label="Système"
              tone="primary"
              onPress={() =>
                navigation.navigate('More' as never, {
                  screen: 'SystemDashboard',
                } as never)
              }
            />
          ) : null}
        </View>
      </Card>
    </ScreenContainer>
  );
}

function QuickActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        quickStyles.btn,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={quickStyles.iconBubble}>
        <Ionicons name={icon} size={22} color={palette.primary} />
      </View>
      <Text style={quickStyles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RecentItem({
  icon,
  text,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone: 'success' | 'info' | 'warning';
}) {
  const color =
    tone === 'success'
      ? palette.successText
      : tone === 'info'
        ? palette.infoText
        : palette.warningText;
  return (
    <View style={styles.recentItem}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.recentText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  kpisRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: palette.ink,
    marginBottom: spacing.md,
  },
  recentList: { gap: spacing.sm },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recentText: { ...typography.body, color: palette.body, flex: 1 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

const quickStyles = StyleSheet.create({
  btn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.smallStrong,
    color: palette.body,
  },
});

const dashHeaderStyles = StyleSheet.create({
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
