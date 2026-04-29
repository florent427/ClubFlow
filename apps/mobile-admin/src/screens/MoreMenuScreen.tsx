import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  ScreenContainer,
  ScreenHero,
  palette,
  radius,
  spacing,
  typography,
  type ModuleCode,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useViewer } from '../lib/club-modules-context';
import {
  canAccessAccounting,
  canAccessAdminCore,
  canAccessSystem,
  canAccessVitrine,
  isModuleEnabled,
} from '../lib/permissions';

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Module qui doit être actif (sinon grisé). */
  module?: ModuleCode;
  /** Permission requise. */
  canAccess?: (perms: ReturnType<typeof useViewer>['permissions']) => boolean;
  /** Route cible dans le MoreStack. */
  screen: string;
};

type Section = {
  title: string;
  tiles: Tile[];
};

const SECTIONS: Section[] = [
  {
    title: 'Communication',
    tiles: [
      {
        key: 'campaigns',
        label: 'Campagnes',
        icon: 'megaphone-outline',
        module: 'COMMUNICATION',
        screen: 'Campaigns',
      },
      {
        key: 'messaging',
        label: 'Messagerie',
        icon: 'chatbubbles-outline',
        module: 'MESSAGING',
        screen: 'MessagingHome',
      },
      {
        key: 'announcements',
        label: 'Annonces',
        icon: 'notifications-outline',
        module: 'CLUB_LIFE',
        screen: 'Announcements',
      },
      {
        key: 'surveys',
        label: 'Sondages',
        icon: 'pie-chart-outline',
        module: 'CLUB_LIFE',
        screen: 'Surveys',
      },
      {
        key: 'blog',
        label: 'Blog interne',
        icon: 'reader-outline',
        module: 'BLOG',
        screen: 'BlogPosts',
      },
    ],
  },
  {
    title: 'Finance',
    tiles: [
      {
        key: 'invoices',
        label: 'Facturation',
        icon: 'card-outline',
        module: 'PAYMENT',
        canAccess: canAccessAdminCore,
        screen: 'Invoices',
      },
      {
        key: 'accounting',
        label: 'Comptabilité',
        icon: 'calculator-outline',
        module: 'ACCOUNTING',
        canAccess: canAccessAccounting,
        screen: 'AccountingHome',
      },
      {
        key: 'sponsorships',
        label: 'Sponsoring',
        icon: 'handshake-outline' as keyof typeof Ionicons.glyphMap,
        module: 'SPONSORING',
        screen: 'Sponsorships',
      },
      {
        key: 'subsidies',
        label: 'Subventions',
        icon: 'gift-outline',
        module: 'SUBSIDIES',
        screen: 'Subsidies',
      },
      {
        key: 'shop',
        label: 'Boutique',
        icon: 'storefront-outline',
        module: 'SHOP',
        screen: 'ShopProducts',
      },
    ],
  },
  {
    title: 'Vitrine & contenu',
    tiles: [
      {
        key: 'vitrine',
        label: 'Site vitrine',
        icon: 'globe-outline',
        module: 'WEBSITE',
        canAccess: canAccessVitrine,
        screen: 'VitrineHome',
      },
      {
        key: 'articles',
        label: 'Articles',
        icon: 'newspaper-outline',
        module: 'WEBSITE',
        canAccess: canAccessVitrine,
        screen: 'VitrineArticles',
      },
      {
        key: 'gallery',
        label: 'Galerie',
        icon: 'images-outline',
        module: 'WEBSITE',
        canAccess: canAccessVitrine,
        screen: 'VitrineGallery',
      },
      {
        key: 'media',
        label: 'Médiathèque',
        icon: 'folder-outline',
        canAccess: canAccessVitrine,
        screen: 'MediaLibrary',
      },
    ],
  },
  {
    title: 'Configuration',
    tiles: [
      {
        key: 'settings',
        label: 'Paramètres',
        icon: 'settings-outline',
        canAccess: canAccessAdminCore,
        screen: 'SettingsHub',
      },
      {
        key: 'modules',
        label: 'Modules',
        icon: 'apps-outline',
        canAccess: canAccessAdminCore,
        screen: 'ClubModules',
      },
      {
        key: 'agent',
        label: 'Aïko (IA)',
        icon: 'sparkles-outline',
        canAccess: canAccessAdminCore,
        screen: 'AikoChat',
      },
    ],
  },
  {
    title: 'Administration plate-forme',
    tiles: [
      {
        key: 'system',
        label: 'Tableau système',
        icon: 'shield-checkmark-outline',
        canAccess: canAccessSystem,
        screen: 'SystemDashboard',
      },
      {
        key: 'admins',
        label: 'Administrateurs',
        icon: 'person-circle-outline',
        canAccess: canAccessSystem,
        screen: 'SystemAdmins',
      },
    ],
  },
];

export function MoreMenuScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { permissions } = useViewer();

  return (
    <ScreenContainer scroll>
      <ScreenHero
        eyebrow="MENU"
        title="Plus"
        subtitle="Tous les modules de votre club"
        compact
      />

      {SECTIONS.map((section) => {
        const visibleTiles = section.tiles.filter((t) => {
          if (t.canAccess && !t.canAccess(permissions)) return false;
          // Les sections "Vitrine" et "Communication" peuvent être visibles
          // même module désactivé, mais avec carte grisée.
          return true;
        });
        if (visibleTiles.length === 0) return null;
        return (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.grid}>
              {visibleTiles.map((tile) => {
                const enabled = tile.module
                  ? isModuleEnabled(permissions, tile.module)
                  : true;
                return (
                  <Pressable
                    key={tile.key}
                    onPress={() => {
                      if (!enabled) return;
                      navigation.navigate(tile.screen as never);
                    }}
                    style={({ pressed }) => [
                      styles.tile,
                      pressed && enabled && { opacity: 0.85 },
                      !enabled && styles.tileDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={tile.label}
                    accessibilityState={{ disabled: !enabled }}
                  >
                    <View
                      style={[
                        styles.tileIcon,
                        !enabled && styles.tileIconDisabled,
                      ]}
                    >
                      <Ionicons
                        name={tile.icon}
                        size={26}
                        color={enabled ? palette.primary : palette.muted}
                      />
                      {!enabled ? (
                        <View style={styles.lockBadge}>
                          <Ionicons
                            name="lock-closed"
                            size={10}
                            color={palette.surface}
                          />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.tileLabel,
                        !enabled && { color: palette.muted },
                      ]}
                      numberOfLines={2}
                    >
                      {tile.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.eyebrow,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: 6,
  },
  tileDisabled: {
    opacity: 0.55,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconDisabled: {
    backgroundColor: palette.bgAlt,
  },
  lockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    ...typography.caption,
    color: palette.body,
    textAlign: 'center',
  },
});
