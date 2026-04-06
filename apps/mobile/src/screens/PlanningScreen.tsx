import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SlotCard } from '../components/SlotCard';
import { VIEWER_ME, VIEWER_UPCOMING_SLOTS } from '../lib/viewer-documents';
import type { ViewerMeData, ViewerUpcomingData } from '../lib/viewer-types';
import type { MainTabParamList } from '../types/navigation';

export function PlanningScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: meData, loading: meLoading } = useQuery<ViewerMeData>(
    VIEWER_ME,
    { fetchPolicy: 'cache-first' },
  );
  const hideMemberModules =
    meData?.viewerMe?.hideMemberModules === true;

  const { data, loading, error } = useQuery<ViewerUpcomingData>(
    VIEWER_UPCOMING_SLOTS,
    { skip: meLoading || hideMemberModules, errorPolicy: 'all' },
  );

  useEffect(() => {
    if (!meLoading && hideMemberModules) {
      navigation.navigate('Home');
    }
  }, [meLoading, hideMemberModules, navigation]);

  if (meLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Planning</Text>
        <Text style={styles.hint}>Chargement…</Text>
      </View>
    );
  }
  if (hideMemberModules) {
    return null;
  }

  const slots = data?.viewerUpcomingCourseSlots ?? [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Planning</Text>
      <Text style={styles.lead}>
        Vos prochains créneaux de cours liés à votre profil.
      </Text>

      {error ? (
        <Text style={styles.hint}>
          Impossible d’afficher le planning (module désactivé ou droits
          insuffisants).
        </Text>
      ) : loading ? (
        <Text style={styles.hint}>Chargement…</Text>
      ) : slots.length === 0 ? (
        <Text style={styles.hint}>Aucun cours à venir.</Text>
      ) : (
        slots.map((s) => <SlotCard key={s.id} slot={s} large />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  lead: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 16 },
  hint: { fontSize: 14, color: '#666' },
});
