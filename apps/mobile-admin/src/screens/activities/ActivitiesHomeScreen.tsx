import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  ScreenContainer,
  ScreenHero,
  palette,
  radius,
  shadow,
  spacing,
  typography,
  type ModuleCode,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ADMIN_DASHBOARD_SUMMARY } from '../../lib/documents/dashboard';
import { useViewer } from '../../lib/club-modules-context';
import { isModuleEnabled } from '../../lib/permissions';

type Tile = {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  module: ModuleCode;
  screen: 'Planning' | 'Events' | 'Projects' | 'Booking';
  /** Compteur live affiché en bas à droite si non null. */
  badge?: number | null;
};

type DashData = {
  adminDashboardSummary: {
    upcomingSessionsCount: number;
    upcomingEventsCount: number;
  } | null;
};

export function ActivitiesHomeScreen() {
  const nav = useNavigation();
  const { permissions } = useViewer();
  const { data } = useQuery<DashData>(ADMIN_DASHBOARD_SUMMARY, {
    errorPolicy: 'all',
  });
  const summary = data?.adminDashboardSummary;

  const goTo = (name: string) => {
    (nav as unknown as { navigate: (n: string) => void }).navigate(name);
  };

  const tiles: Tile[] = [
    {
      key: 'planning',
      label: 'Planning sportif',
      description: 'Cours, créneaux, coachs',
      icon: 'calendar',
      module: 'PLANNING',
      screen: 'Planning',
      badge: summary?.upcomingSessionsCount ?? null,
    },
    {
      key: 'events',
      label: 'Événements',
      description: 'Stages, compétitions, rassemblements',
      icon: 'trophy',
      module: 'EVENTS',
      screen: 'Events',
      badge: summary?.upcomingEventsCount ?? null,
    },
    {
      key: 'projects',
      label: 'Projets',
      description: 'Projets long-terme, gala, stage',
      icon: 'folder-open',
      module: 'PROJECTS',
      screen: 'Projects',
    },
    {
      key: 'booking',
      label: 'Réservations',
      description: 'Salle, matériel, créneaux libres',
      icon: 'key',
      module: 'BOOKING',
      screen: 'Booking',
    },
  ];

  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow="ACTIVITÉS"
        title="Vie sportive"
        subtitle="Pilotez les cours, événements et projets"
      />
      <View style={styles.list}>
        {tiles.map((tile) => {
          const enabled = isModuleEnabled(permissions, tile.module);
          return (
            <Pressable
              key={tile.key}
              onPress={() => {
                if (!enabled) {
                  // Soft : on autorise quand même la navigation, l'écran
                  // affichera l'empty state. Le verrouillage strict est
                  // dans le MoreMenu pour les modules optionnels.
                  goTo(tile.screen);
                  return;
                }
                goTo(tile.screen);
              }}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
            >
              <Card>
                <View style={styles.row}>
                  <View
                    style={[
                      styles.iconBubble,
                      !enabled && styles.iconBubbleDisabled,
                    ]}
                  >
                    <Ionicons
                      name={tile.icon}
                      size={26}
                      color={enabled ? palette.primary : palette.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.title}>{tile.label}</Text>
                      {tile.badge != null && tile.badge > 0 ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{tile.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.subtitle}>{tile.description}</Text>
                    {!enabled ? (
                      <Text style={styles.lockHint}>Module désactivé</Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={palette.mutedSoft}
                  />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  iconBubbleDisabled: {
    backgroundColor: palette.bgAlt,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: palette.ink,
  },
  subtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  lockHint: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  badge: {
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    ...typography.smallStrong,
    color: palette.surface,
    fontSize: 12,
  },
});
