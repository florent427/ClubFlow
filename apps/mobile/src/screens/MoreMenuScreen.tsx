import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@apollo/client/react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHero } from '../components/ui';
import { VIEWER_ME } from '../lib/viewer-documents';
import {
  VIEWER_DOCUMENTS_TO_SIGN,
  type ViewerDocumentsToSignData,
} from '../lib/documents-graphql';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { MainTabParamList } from '../types/navigation';

type Nav = BottomTabNavigationProp<MainTabParamList>;

type Tile = {
  /** Clé stable. */
  key: string;
  /** Nom affiché sous l'icône (≤ 14 car). */
  label: string;
  /** Icône Ionicons. */
  icon: IoniconName;
  /** Cible navigation tab. */
  target: keyof MainTabParamList;
  /** Si true, masque la vignette quand `hideMemberModules` est actif. */
  hiddenForContact?: boolean;
  /** Badge optionnel (compteur, ex. nb docs à signer). */
  badge?: number;
  /** Tonalité de l'icône. */
  tone?: 'primary' | 'warm' | 'cool' | 'neutral';
};

/**
 * **Plus** — écran d'overflow accessible depuis l'onglet "Plus" du menu
 * principal. On y déplace tous les modules secondaires pour ne garder
 * en racine que 5 onglets max (Accueil / Activités / Chat / Famille / Plus).
 *
 * Chaque vignette navigue vers le tab correspondant via `tabBarButton`
 * masqué (cf. MainTabs). Les modules cachés pour les profils contacts
 * (`hideMemberModules`) sont automatiquement filtrés.
 */
export function MoreMenuScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const { data: docsData } = useQuery<ViewerDocumentsToSignData>(
    VIEWER_DOCUMENTS_TO_SIGN,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;
  const docsToSignCount = docsData?.viewerDocumentsToSign?.length ?? 0;

  const canManageMembershipCart =
    meData?.viewerMe?.canManageMembershipCart === true;

  const tiles: Tile[] = [
    ...(canManageMembershipCart
      ? ([
          {
            key: 'panier',
            label: 'Panier d’adhésion',
            icon: 'basket-outline',
            target: 'Panier',
            tone: 'primary',
          },
        ] as Tile[])
      : []),
    {
      key: 'docs',
      label: 'Documents',
      icon: 'document-text-outline',
      target: 'Documents',
      tone: 'primary',
      badge: docsToSignCount,
    },
    {
      key: 'actus',
      label: 'Actualités',
      icon: 'megaphone-outline',
      target: 'Actus',
      tone: 'warm',
    },
    {
      key: 'progression',
      label: 'Ma progression',
      icon: 'school-outline',
      target: 'Progression',
      tone: 'cool',
      hiddenForContact: true,
    },
    {
      key: 'profil',
      label: 'Profil',
      icon: 'settings-outline',
      target: 'Parametres',
      tone: 'neutral',
    },
  ];

  const visible = tiles.filter((t) => !(t.hiddenForContact && hideMemberModules));

  function handleTilePress(tile: Tile) {
    try {
      navigation.navigate(tile.target as never);
    } catch {
      Alert.alert('Indisponible', `${tile.label} n'est pas accessible.`);
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="MENU"
        title="Plus"
        subtitle="Tous les modules de votre espace."
        gradient="hero"
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {visible.map((tile) => (
            <Pressable
              key={tile.key}
              onPress={() => handleTilePress(tile)}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
              style={({ pressed }) => [
                styles.tile,
                pressed && styles.tilePressed,
              ]}
            >
              <View
                style={[
                  styles.tileIcon,
                  tile.tone === 'warm' && styles.tileIconWarm,
                  tile.tone === 'cool' && styles.tileIconCool,
                  tile.tone === 'neutral' && styles.tileIconNeutral,
                ]}
              >
                <Ionicons
                  name={tile.icon}
                  size={26}
                  color={
                    tile.tone === 'neutral' ? palette.body : palette.primary
                  }
                />
                {tile.badge && tile.badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {tile.badge > 9 ? '9+' : tile.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {tile.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: '47%',
    aspectRatio: 1.1,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    ...shadow.sm,
  },
  tilePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tileIconWarm: {
    backgroundColor: palette.warningBg ?? '#fef3c7',
  },
  tileIconCool: {
    backgroundColor: '#e0f2fe',
  },
  tileIconNeutral: {
    backgroundColor: palette.bgAlt,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: palette.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.surface,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  tileLabel: {
    ...typography.smallStrong,
    color: palette.ink,
    textAlign: 'center',
  },
});
