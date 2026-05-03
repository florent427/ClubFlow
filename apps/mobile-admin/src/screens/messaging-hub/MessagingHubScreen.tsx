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
  /** Route cible dans le MoreStack. */
  screen: 'MessagingHome' | 'QuickMessage' | 'Campaigns';
  /** Petit highlight d'usage typique. */
  hint?: string;
};

type DashData = {
  adminDashboardSummary: {
    recentAnnouncementsCount: number;
  } | null;
};

export function MessagingHubScreen() {
  const nav = useNavigation();
  const { permissions } = useViewer();
  // Pas indispensable, mais on récupère un compteur léger.
  useQuery<DashData>(ADMIN_DASHBOARD_SUMMARY, { errorPolicy: 'all' });

  const goTo = (name: string) => {
    (nav as unknown as { navigate: (n: string) => void }).navigate(name);
  };

  const tiles: Tile[] = [
    {
      key: 'instant',
      label: 'Messagerie instantanée',
      description: 'Chat en temps réel avec vos adhérents et groupes',
      icon: 'chatbubbles',
      module: 'MESSAGING',
      screen: 'MessagingHome',
      hint: 'Idéal pour échanges rapides et discussions de groupe',
    },
    {
      key: 'broadcast',
      label: 'Message multicanaux',
      description: 'Email, push et Telegram envoyés à un public ciblé',
      icon: 'paper-plane',
      module: 'COMMUNICATION',
      screen: 'QuickMessage',
      hint: 'Idéal pour annonces sortantes et notifications',
    },
    {
      key: 'campaigns',
      label: 'Campagnes',
      description: 'Programmer et suivre les envois récurrents',
      icon: 'megaphone',
      module: 'COMMUNICATION',
      screen: 'Campaigns',
      hint: 'Pour piloter les envois planifiés',
    },
  ];

  return (
    <ScreenContainer scroll padding={0}>
      <ScreenHero
        eyebrow="MESSAGE"
        title="Quel canal ?"
        subtitle="Choisissez le mode d'envoi le plus adapté"
        showBack
      />
      <View style={styles.list}>
        {tiles.map((tile) => {
          const enabled = isModuleEnabled(permissions, tile.module);
          return (
            <Pressable
              key={tile.key}
              onPress={() => goTo(tile.screen)}
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
                    <Text style={styles.title}>{tile.label}</Text>
                    <Text style={styles.subtitle}>{tile.description}</Text>
                    {tile.hint ? (
                      <Text style={styles.hint}>{tile.hint}</Text>
                    ) : null}
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
  title: {
    ...typography.h3,
    color: palette.ink,
  },
  subtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  hint: {
    ...typography.caption,
    color: palette.primary,
    marginTop: 6,
    backgroundColor: palette.primaryTint,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  lockHint: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
