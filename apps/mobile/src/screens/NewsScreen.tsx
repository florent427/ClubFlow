import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  EmptyState,
  Pill,
  ScreenHero,
  Skeleton,
} from '../components/ui';
import {
  VIEWER_CLUB_ANNOUNCEMENTS,
  VIEWER_CLUB_SURVEYS,
  VIEWER_RESPOND_TO_CLUB_SURVEY,
} from '../lib/viewer-documents';
import type {
  ViewerClubAnnouncementsData,
  ViewerClubSurvey,
  ViewerClubSurveysData,
} from '../lib/viewer-types';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';

function formatPublishedDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return '';
  }
}

function SurveyCard({
  survey,
  refetch,
}: {
  survey: ViewerClubSurvey;
  refetch: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    survey.viewerSelectedOptionIds,
  );
  const [respond, { loading }] = useMutation(VIEWER_RESPOND_TO_CLUB_SURVEY);
  const [err, setErr] = useState<string | null>(null);
  const closed = survey.status === 'CLOSED';
  const already = survey.viewerSelectedOptionIds.length > 0;

  function toggle(id: string) {
    if (closed) return;
    if (survey.multipleChoice) {
      setSelected((p) =>
        p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
      );
    } else {
      setSelected([id]);
    }
  }

  async function onSubmit() {
    setErr(null);
    try {
      await respond({
        variables: { input: { surveyId: survey.id, optionIds: selected } },
      });
      refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    }
  }

  const total = survey.totalResponses || 1;

  return (
    <View style={styles.card}>
      <View style={styles.surveyHeader}>
        <View style={styles.surveyIcon}>
          <Ionicons name="bar-chart" size={18} color={palette.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kind}>SONDAGE</Text>
          <Text style={styles.title}>{survey.title}</Text>
        </View>
        {closed ? <Pill label="Clos" tone="neutral" /> : null}
      </View>
      {survey.description ? (
        <Text style={styles.body}>{survey.description}</Text>
      ) : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {survey.options.map((o) => {
          const pct = Math.round((o.responseCount / total) * 100);
          const mine = selected.includes(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => toggle(o.id)}
              style={[styles.option, mine && styles.optionOn]}
              disabled={closed}
              accessibilityRole="button"
              accessibilityLabel={`Option ${o.label}`}
              accessibilityState={{ selected: mine }}
            >
              <View
                style={[
                  styles.optionBar,
                  { width: `${pct}%` },
                  mine && styles.optionBarOn,
                ]}
              />
              <View style={styles.optionContent}>
                <View style={styles.optionLeft}>
                  <Ionicons
                    name={
                      mine
                        ? survey.multipleChoice
                          ? 'checkbox'
                          : 'radio-button-on'
                        : survey.multipleChoice
                          ? 'square-outline'
                          : 'radio-button-off'
                    }
                    size={18}
                    color={mine ? palette.primary : palette.muted}
                  />
                  <Text
                    style={[styles.optionLabel, mine && styles.optionLabelOn]}
                  >
                    {o.label}
                  </Text>
                </View>
                <Text style={styles.optionPct}>{pct}%</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.surveyFooter}>
        {survey.totalResponses} réponse{survey.totalResponses > 1 ? 's' : ''}
      </Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {!closed ? (
        <Button
          label={already ? 'Mettre à jour' : 'Voter'}
          onPress={() => void onSubmit()}
          loading={loading}
          disabled={selected.length === 0}
          icon="send-outline"
          fullWidth
        />
      ) : null}
    </View>
  );
}

function AnnouncementCard({
  ann,
}: {
  ann: ViewerClubAnnouncementsData['viewerClubAnnouncements'][number];
}) {
  return (
    <View style={[styles.card, ann.pinned && styles.cardPinned]}>
      <View style={styles.surveyHeader}>
        <View
          style={[
            styles.annIcon,
            ann.pinned && { backgroundColor: palette.warningBg },
          ]}
        >
          <Ionicons
            name={ann.pinned ? 'star' : 'megaphone'}
            size={18}
            color={ann.pinned ? palette.warning : palette.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kind}>
            {ann.pinned ? 'ÉPINGLÉ' : 'ANNONCE'}
          </Text>
          <Text style={styles.title}>{ann.title}</Text>
        </View>
      </View>
      <Text style={styles.body}>{ann.body}</Text>
      {ann.publishedAt ? (
        <Text style={styles.published}>
          {formatPublishedDate(ann.publishedAt)}
        </Text>
      ) : null}
    </View>
  );
}

export function NewsScreen() {
  const {
    data: annData,
    refetch: annRefetch,
    loading: annLoading,
  } = useQuery<ViewerClubAnnouncementsData>(VIEWER_CLUB_ANNOUNCEMENTS);
  const {
    data: surData,
    refetch: surRefetch,
    loading: surLoading,
  } = useQuery<ViewerClubSurveysData>(VIEWER_CLUB_SURVEYS);

  const announcements = annData?.viewerClubAnnouncements ?? [];
  const surveys = surData?.viewerClubSurveys ?? [];
  const loading = annLoading || surLoading;
  const items: Array<
    | { kind: 'ann'; ann: ViewerClubAnnouncementsData['viewerClubAnnouncements'][number] }
    | { kind: 'sur'; sur: ViewerClubSurvey }
  > = [
    ...announcements.map((a) => ({ kind: 'ann' as const, ann: a })),
    ...surveys.map((s) => ({ kind: 'sur' as const, sur: s })),
  ];

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="VIE DU CLUB"
        title="Actualités"
        subtitle={
          items.length > 0
            ? `${announcements.length} annonce${announcements.length > 1 ? 's' : ''}, ${surveys.length} sondage${surveys.length > 1 ? 's' : ''}`
            : 'Annonces et sondages du club.'
        }
        gradient="hero"
      />
      <FlatList
        style={styles.flex}
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(it) =>
          it.kind === 'ann' ? `ann-${it.ann.id}` : `sur-${it.sur.id}`
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              void annRefetch();
              void surRefetch();
            }}
            tintColor={palette.primary}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'ann' ? (
            <AnnouncementCard ann={item.ann} />
          ) : (
            <SurveyCard
              survey={item.sur}
              refetch={() => {
                void surRefetch();
              }}
            />
          )
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton height={140} borderRadius={radius.xl} />
              <Skeleton height={140} borderRadius={radius.xl} />
            </View>
          ) : (
            <EmptyState
              icon="megaphone-outline"
              title="Pas d'actualités"
              description="Les annonces et sondages du club apparaîtront ici."
              variant="card"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },

  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: spacing.sm,
    ...shadow.md,
  },
  cardPinned: {
    borderLeftWidth: 4,
    borderLeftColor: palette.warning,
  },

  surveyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  surveyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  annIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kind: { ...typography.eyebrow, color: palette.muted, fontSize: 10 },
  title: {
    ...typography.h3,
    color: palette.ink,
    marginTop: 2,
  },
  body: { ...typography.body, color: palette.body },
  published: { ...typography.caption, color: palette.mutedSoft },

  option: {
    position: 'relative',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    overflow: 'hidden',
    backgroundColor: palette.bgAlt,
  },
  optionOn: { borderColor: palette.primary, backgroundColor: palette.primaryTint },
  optionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: palette.bgAlt,
  },
  optionBarOn: { backgroundColor: palette.primaryLight },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  optionLabel: { ...typography.body, color: palette.ink, flex: 1 },
  optionLabelOn: {
    fontFamily: typography.bodyStrong.fontFamily,
    color: palette.primaryDark,
  },
  optionPct: { ...typography.smallStrong, color: palette.muted },

  surveyFooter: { ...typography.caption, color: palette.muted },
  err: { ...typography.small, color: palette.danger },
});
