import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import type { MainTabParamList } from '../types/navigation';

const GRADE_HIERARCHY = [
  { label: 'Ceinture blanche', color: '#ffffff', border: '#ccc' },
  { label: 'Ceinture jaune', color: '#fdd835', border: '#f9a825' },
  { label: 'Ceinture orange', color: '#ff9800', border: '#e65100' },
  { label: 'Ceinture verte', color: '#4caf50', border: '#2e7d32' },
  { label: 'Ceinture bleue', color: '#2196f3', border: '#1565c0' },
  { label: 'Ceinture marron', color: '#795548', border: '#4e342e' },
  { label: 'Ceinture noire 1er Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 2e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 3e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 4e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 5e Dan', color: '#212121', border: '#000' },
];

function findGradeIndex(gradeLabel: string | null | undefined): number {
  if (!gradeLabel) return -1;
  const lower = gradeLabel.toLowerCase();
  return GRADE_HIERARCHY.findIndex((g) =>
    lower.includes(g.label.toLowerCase().replace('ceinture ', '')),
  );
}

export function ProgressionScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });

  const me = data?.viewerMe;

  useEffect(() => {
    if (!loading && me?.hideMemberModules === true) {
      navigation.navigate('Home');
    }
  }, [loading, me?.hideMemberModules, navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.pageTitle}>Ma progression</Text>
        <Text style={styles.hint}>Chargement…</Text>
      </View>
    );
  }
  if (me?.hideMemberModules === true) {
    return null;
  }

  const currentGradeLabel = me?.gradeLevelLabel ?? null;
  const currentIndex = findGradeIndex(currentGradeLabel);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.inner}>
      <Text style={styles.pageTitle}>Ma progression</Text>
      <Text style={styles.lead}>
        Votre parcours au sein du club. Les jalons et ressources pédagogiques
        seront enrichis progressivement.
      </Text>

      <View style={styles.currentBlock}>
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.belt,
              {
                backgroundColor:
                  currentIndex >= 0 ? GRADE_HIERARCHY[currentIndex].color : '#e0e0e0',
                borderColor:
                  currentIndex >= 0 ? GRADE_HIERARCHY[currentIndex].border : '#bbb',
              },
            ]}
          />
          <View>
            <Text style={styles.gradeTitle}>
              {currentGradeLabel ?? 'Niveau à confirmer'}
            </Text>
            <Text style={styles.hint}>
              Votre grade actuel tel que renseigné par le club.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.subtitle}>Hiérarchie des grades</Text>
      {GRADE_HIERARCHY.map((grade, i) => {
        const isCurrent = i === currentIndex;
        const isPast = currentIndex >= 0 && i < currentIndex;

        let rowStyle = styles.tlFuture;
        if (isCurrent) rowStyle = styles.tlActive;
        else if (isPast) rowStyle = styles.tlDone;

        return (
          <View key={grade.label} style={[styles.tlRow, rowStyle]}>
            <View
              style={[
                styles.tlDot,
                {
                  backgroundColor: grade.color,
                  borderColor: grade.border,
                },
              ]}
            />
            <View>
              <Text style={styles.tlTitle}>{grade.label}</Text>
              {isCurrent ? (
                <Text style={styles.tlCurrent}>Votre grade actuel</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#fff' },
  pageTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  lead: { fontSize: 16, color: '#444', lineHeight: 24, marginBottom: 16 },
  hint: { fontSize: 14, color: '#666' },
  currentBlock: { marginBottom: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  belt: {
    width: 56,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
  },
  gradeTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 12,
    color: '#111',
  },
  tlRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  tlDone: { backgroundColor: '#f1f8e9' },
  tlActive: { backgroundColor: '#e3f2fd' },
  tlFuture: { backgroundColor: '#fafafa' },
  tlDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 2,
  },
  tlTitle: { fontSize: 15, fontWeight: '600', color: '#222' },
  tlCurrent: { fontSize: 13, color: '#1565c0', marginTop: 2 },
});
