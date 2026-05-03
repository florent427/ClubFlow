import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ScreenContainer,
  ScreenHero,
  palette,
  radius,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SettingsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'SettingsHub'>;

type Tile = {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: keyof SettingsStackParamList;
};

const TILES: Tile[] = [
  {
    key: 'club-branding',
    label: 'Identité du club',
    description: 'Logo, palette, tagline',
    icon: 'color-palette-outline',
    screen: 'ClubBranding',
  },
  {
    key: 'modules',
    label: 'Modules',
    description: 'Activer / désactiver',
    icon: 'apps-outline',
    screen: 'ClubModules',
  },
  {
    key: 'fields',
    label: 'Champs adhérents',
    description: 'Formulaires de profil',
    icon: 'list-outline',
    screen: 'MemberFields',
  },
  {
    key: 'adhesion',
    label: 'Adhésion',
    description: 'Saison et inscriptions',
    icon: 'people-outline',
    screen: 'Adhesion',
  },
  {
    key: 'pricing',
    label: 'Tarifs',
    description: 'Règles de remise',
    icon: 'pricetag-outline',
    screen: 'PricingRules',
  },
  {
    key: 'mail',
    label: 'Email',
    description: 'Domaine d\'envoi',
    icon: 'mail-outline',
    screen: 'MailDomain',
  },
  {
    key: 'ai',
    label: 'IA',
    description: 'Configuration assistant',
    icon: 'sparkles-outline',
    screen: 'AiSettings',
  },
  {
    key: 'profile',
    label: 'Profil',
    description: 'Mon compte',
    icon: 'person-circle-outline',
    screen: 'Profile',
  },
];

export function SettingsHubScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="RÉGLAGES"
        title="Paramètres"
        subtitle="Configuration du club"
        compact
      />
      <View style={styles.body}>
        <View style={styles.grid}>
          {TILES.map((tile) => (
            <Pressable
              key={tile.key}
              onPress={() => navigation.navigate(tile.screen as never)}
              style={({ pressed }) => [
                styles.tile,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
            >
              <View style={styles.iconBubble}>
                <Ionicons
                  name={tile.icon}
                  size={26}
                  color={palette.primary}
                />
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {tile.label}
              </Text>
              <Text style={styles.description} numberOfLines={2}>
                {tile.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: 4,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  label: {
    ...typography.smallStrong,
    color: palette.ink,
    textAlign: 'center',
  },
  description: {
    ...typography.caption,
    color: palette.muted,
    textAlign: 'center',
  },
});
