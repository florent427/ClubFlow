import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useQuery } from '@apollo/client/react';
import {
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
import { VIEWER_ME, VIEWER_UPCOMING_SLOTS } from '../lib/viewer-documents';
import type { ViewerMeData, ViewerUpcomingData } from '../lib/viewer-types';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { MainTabParamList } from '../types/navigation';

type Nav = BottomTabNavigationProp<MainTabParamList>;

type Card = {
  key: string;
  label: string;
  description: string;
  icon: IoniconName;
  target: keyof MainTabParamList;
  /** Compteur affiché en pill (ex. nb cours à venir). */
  count?: number;
  /** Tonalité de l'accent. */
  tone: 'primary' | 'warm' | 'cool';
};

/**
 * **Activités** — hub central qui regroupe Planning, Réservations et
 * Événements en 3 cartes. Évite de mettre ces 3 modules en racines de
 * tab bar (qui était saturée à 10 onglets) tout en gardant un accès
 * d'un seul tap depuis la tab bar.
 *
 * Si le profil actif est un contact (`hideMemberModules=true`), seules
 * les Événements sont visibles (Planning + Réservations sont des
 * modules réservés aux adhérents).
 */
export function ActivitiesHubScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;

  const slotsQ = useQuery<ViewerUpcomingData>(VIEWER_UPCOMING_SLOTS, {
    skip: hideMemberModules,
    errorPolicy: 'all',
  });
  const slotsCount = slotsQ.data?.viewerUpcomingCourseSlots?.length ?? 0;

  const allCards: Card[] = [
    {
      key: 'planning',
      label: 'Planning',
      description: 'Cours et créneaux à venir',
      icon: 'calendar-outline',
      target: 'Planning',
      tone: 'primary',
      count: slotsCount,
    },
    {
      key: 'reservations',
      label: 'Réservations',
      description: 'Réserver un cours, gérer mes inscriptions',
      icon: 'checkmark-circle-outline',
      target: 'Reservations',
      tone: 'cool',
    },
    {
      key: 'events',
      label: 'Événements',
      description: 'Stages, compétitions, soirées du club',
      icon: 'star-outline',
      target: 'Evenements',
      tone: 'warm',
    },
  ];

  // Pour un contact (parent de mineur sans fiche adhérent perso) : on
  // n'affiche que les événements (Planning et Réservations supposent
  // une fiche adhérent active).
  const cards = hideMemberModules
    ? allCards.filter((c) => c.key === 'events')
    : allCards;

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="ACTIVITÉS"
        title="Vie sportive"
        subtitle="Planning, réservations et événements du club."
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
        {cards.map((card) => (
          <Pressable
            key={card.key}
            onPress={() => navigation.navigate(card.target as never)}
            accessibilityRole="button"
            accessibilityLabel={card.label}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
            ]}
          >
            <View
              style={[
                styles.iconBubble,
                card.tone === 'warm' && styles.iconBubbleWarm,
                card.tone === 'cool' && styles.iconBubbleCool,
              ]}
            >
              <Ionicons
                name={card.icon}
                size={28}
                color={palette.primary}
              />
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardHead}>
                <Text style={styles.cardLabel}>{card.label}</Text>
                {card.count != null && card.count > 0 ? (
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>{card.count}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardDesc}>{card.description}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={22}
              color={palette.muted}
            />
          </Pressable>
        ))}
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    ...shadow.sm,
  },
  cardPressed: { opacity: 0.85 },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleWarm: {
    backgroundColor: palette.warningBg ?? '#fef3c7',
  },
  iconBubbleCool: {
    backgroundColor: '#e0f2fe',
  },
  cardBody: { flex: 1, gap: 2 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  cardDesc: {
    ...typography.small,
    color: palette.muted,
  },
  countPill: {
    backgroundColor: palette.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
