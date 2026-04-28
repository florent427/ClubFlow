import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState, ScreenHero, Skeleton } from '../components/ui';
import { SlotCard } from '../components/SlotCard';
import { VIEWER_ME, VIEWER_UPCOMING_SLOTS } from '../lib/viewer-documents';
import type {
  ViewerMeData,
  ViewerSlot,
  ViewerUpcomingData,
} from '../lib/viewer-types';
import { palette, radius, spacing, typography } from '../lib/theme';
import type { MainTabParamList } from '../types/navigation';

export function PlanningScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: meData, loading: meLoading } = useQuery<ViewerMeData>(
    VIEWER_ME,
    { fetchPolicy: 'cache-first' },
  );
  const hideMemberModules = meData?.viewerMe?.hideMemberModules === true;

  const { data, loading, error } = useQuery<ViewerUpcomingData>(
    VIEWER_UPCOMING_SLOTS,
    { skip: meLoading || hideMemberModules, errorPolicy: 'all' },
  );

  useEffect(() => {
    if (!meLoading && hideMemberModules) {
      navigation.navigate('Home');
    }
  }, [meLoading, hideMemberModules, navigation]);

  if (hideMemberModules) return null;

  const slots = data?.viewerUpcomingCourseSlots ?? [];

  // Groupe les slots par jour ("Lundi 8 mai", etc.)
  const groupedByDay = useMemo(() => groupSlotsByDay(slots), [slots]);

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="MON PLANNING"
        title="Prochains cours"
        subtitle={
          slots.length > 0
            ? `${slots.length} cours à venir`
            : 'Vos créneaux planifiés.'
        }
        gradient="hero"
        overlap
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Planning indisponible"
            description="Le module est désactivé ou vos droits sont insuffisants."
            variant="card"
          />
        ) : loading ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={20} width="40%" />
            <Skeleton height={88} borderRadius={radius.lg} />
            <Skeleton height={88} borderRadius={radius.lg} />
          </View>
        ) : slots.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="Aucun cours à venir"
            description="Les prochains créneaux planifiés apparaîtront ici."
            variant="card"
          />
        ) : (
          groupedByDay.map(({ day, items }) => (
            <View key={day} style={styles.daySection}>
              <Text style={styles.dayLabel}>{day}</Text>
              {items.map((s) => (
                <SlotCard key={s.id} slot={s} large />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function groupSlotsByDay(slots: ViewerSlot[]) {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const map = new Map<string, ViewerSlot[]>();
  for (const s of slots) {
    const d = new Date(s.startsAt);
    const label = fmt.format(d);
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    const arr = map.get(cap) ?? [];
    arr.push(s);
    map.set(cap, arr);
  }
  return [...map.entries()].map(([day, items]) => ({ day, items }));
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    marginTop: -spacing.xxl,
    gap: spacing.lg,
  },
  daySection: { gap: spacing.sm },
  dayLabel: {
    ...typography.eyebrow,
    color: palette.muted,
    paddingLeft: spacing.xs,
  },
});
