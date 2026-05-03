import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  Pill,
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
import { CLUB_VITRINE_SETTINGS } from '../../lib/documents/vitrine';
import type { VitrineStackParamList } from '../../navigation/types';

type SettingsData = {
  clubVitrineSettings: {
    customDomain: string | null;
    vitrinePublished: boolean;
  } | null;
};

type Nav = NativeStackNavigationProp<VitrineStackParamList, 'VitrineHome'>;

type Action = {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: keyof VitrineStackParamList;
};

const ACTIONS: Action[] = [
  {
    key: 'pages',
    label: 'Pages',
    description: 'Pages publiques du site',
    icon: 'document-text-outline',
    screen: 'Pages',
  },
  {
    key: 'articles',
    label: 'Articles',
    description: 'Actualités et blog',
    icon: 'reader-outline',
    screen: 'Articles',
  },
  {
    key: 'gallery',
    label: 'Galerie',
    description: 'Photos et albums',
    icon: 'images-outline',
    screen: 'Gallery',
  },
];

export function VitrineHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<SettingsData>(
    CLUB_VITRINE_SETTINGS,
    { errorPolicy: 'all' },
  );

  const settings = data?.clubVitrineSettings ?? null;

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="SITE VITRINE"
        title="Accueil vitrine"
        subtitle="Pages publiques du club"
        compact
      />

      <View style={styles.body}>
        <Card title="Aperçu de votre vitrine">
          <View style={styles.statusRow}>
            <Pill
              label={settings?.vitrinePublished ? 'Publiée' : 'Hors ligne'}
              tone={settings?.vitrinePublished ? 'success' : 'warning'}
              icon={settings?.vitrinePublished ? 'globe-outline' : 'pause-outline'}
            />
            {settings?.customDomain ? (
              <Pill
                label={settings.customDomain}
                tone="info"
                icon="link-outline"
              />
            ) : null}
          </View>
          <Text style={styles.helper}>
            {settings?.vitrinePublished
              ? 'Votre site vitrine est actuellement visible par tous.'
              : 'Votre site vitrine n\'est pas encore publié.'}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>Accès rapides</Text>
        <View style={styles.actionsCol}>
          {ACTIONS.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => navigation.navigate(a.screen as never)}
              style={({ pressed }) => [
                styles.actionCard,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon} size={24} color={palette.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionLabel}>{a.label}</Text>
                <Text style={styles.actionDesc}>{a.description}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={palette.mutedSoft}
              />
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
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  helper: {
    ...typography.small,
    color: palette.muted,
  },
  sectionTitle: {
    ...typography.eyebrow,
    color: palette.muted,
  },
  actionsCol: {
    gap: spacing.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  actionDesc: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
});
