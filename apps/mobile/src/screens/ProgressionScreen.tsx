import { useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card, ScreenHero, Skeleton } from '../components/ui';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { MainTabParamList } from '../types/navigation';

const GRADE_HIERARCHY = [
  { label: 'Ceinture blanche', color: '#ffffff', border: '#cbd5e1' },
  { label: 'Ceinture jaune', color: '#fde047', border: '#eab308' },
  { label: 'Ceinture orange', color: '#fb923c', border: '#ea580c' },
  { label: 'Ceinture verte', color: '#22c55e', border: '#15803d' },
  { label: 'Ceinture bleue', color: '#3b82f6', border: '#1d4ed8' },
  { label: 'Ceinture marron', color: '#92400e', border: '#451a03' },
  { label: 'Ceinture noire 1er Dan', color: '#0f172a', border: '#000' },
  { label: 'Ceinture noire 2e Dan', color: '#0f172a', border: '#000' },
  { label: 'Ceinture noire 3e Dan', color: '#0f172a', border: '#000' },
  { label: 'Ceinture noire 4e Dan', color: '#0f172a', border: '#000' },
  { label: 'Ceinture noire 5e Dan', color: '#0f172a', border: '#000' },
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

  if (me?.hideMemberModules === true) return null;

  const currentGradeLabel = me?.gradeLevelLabel ?? null;
  const currentIndex = findGradeIndex(currentGradeLabel);
  const totalGrades = GRADE_HIERARCHY.length;
  const progress = currentIndex >= 0 ? (currentIndex + 1) / totalGrades : 0;

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="MA PROGRESSION"
        title={loading ? '…' : currentGradeLabel ?? 'Niveau à confirmer'}
        subtitle={
          currentIndex >= 0
            ? `${currentIndex + 1} / ${totalGrades} grades atteints`
            : 'Votre grade sera renseigné par le club.'
        }
        gradient="hero"
        overlap
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>
      </ScreenHero>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Card>
            <View style={{ gap: spacing.md }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={48} borderRadius={radius.md} />
              ))}
            </View>
          </Card>
        ) : (
          <Card title="Hiérarchie des grades" subtitle="Votre parcours dans le club.">
            <View style={{ gap: spacing.xs }}>
              {GRADE_HIERARCHY.map((grade, i) => {
                const isCurrent = i === currentIndex;
                const isPast = currentIndex >= 0 && i < currentIndex;
                const status: 'done' | 'current' | 'future' = isCurrent
                  ? 'current'
                  : isPast
                    ? 'done'
                    : 'future';
                return (
                  <View
                    key={grade.label}
                    style={[
                      styles.tlRow,
                      status === 'current' && styles.tlCurrent,
                      status === 'done' && styles.tlDone,
                    ]}
                  >
                    {/* Connector line entre les rows (sauf le dernier) */}
                    {i < GRADE_HIERARCHY.length - 1 ? (
                      <View
                        style={[
                          styles.tlConnector,
                          status === 'done' || status === 'current'
                            ? styles.tlConnectorActive
                            : null,
                        ]}
                      />
                    ) : null}
                    <View
                      style={[
                        styles.belt,
                        {
                          backgroundColor: grade.color,
                          borderColor: grade.border,
                        },
                      ]}
                    >
                      {status === 'done' ? (
                        <Ionicons name="checkmark" size={14} color="#ffffff" />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.tlTitle,
                          status === 'current' && styles.tlTitleCurrent,
                          status === 'future' && styles.tlTitleFuture,
                        ]}
                      >
                        {grade.label}
                      </Text>
                      {status === 'current' ? (
                        <Text style={styles.tlBadge}>Grade actuel</Text>
                      ) : status === 'future' ? (
                        <Text style={styles.tlSub}>À venir</Text>
                      ) : null}
                    </View>
                    {status === 'current' ? (
                      <View style={styles.dotPulse} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* Carte info */}
        <Card>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="information-circle" size={22} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Contenus pédagogiques</Text>
              <Text style={styles.infoText}>
                Les vidéos, quiz et exercices par grade arriveront
                prochainement dans votre espace.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  progressTrack: {
    marginTop: spacing.lg,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    marginTop: -spacing.md,
    gap: spacing.lg,
  },

  tlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    position: 'relative',
  },
  tlCurrent: {
    backgroundColor: palette.primaryLight,
  },
  tlDone: {
    opacity: 0.85,
  },
  tlConnector: {
    position: 'absolute',
    // Centre exact du belt rond (28×28) dans une row paddée de spacing.sm
    // à gauche : 8 (padding) + 14 (rayon) − 1 (½ width) = 21.
    left: spacing.sm + 14 - 1,
    // Démarre juste sous le belt (center 22 + rayon 14 = bottom 36) et
    // se termine juste avant le top du belt suivant (8 dans la row d'à
    // côté, séparée par un gap de spacing.xs = 4) → height 12.
    top: 36,
    width: 2,
    height: spacing.sm + spacing.xs,
    backgroundColor: palette.border,
  },
  tlConnectorActive: { backgroundColor: palette.primary },
  belt: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  tlTitle: { ...typography.bodyStrong, color: palette.ink },
  tlTitleCurrent: { color: palette.primaryDark },
  tlTitleFuture: { color: palette.muted },
  tlBadge: {
    ...typography.caption,
    color: palette.primary,
    marginTop: 2,
  },
  tlSub: { ...typography.caption, color: palette.mutedSoft, marginTop: 2 },
  dotPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.primary,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { ...typography.bodyStrong, color: palette.ink },
  infoText: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.xxs,
  },
});
