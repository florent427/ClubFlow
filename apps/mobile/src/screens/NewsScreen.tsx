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

function SurveyCard({ survey, refetch }: { survey: ViewerClubSurvey; refetch: () => void }) {
  const [selected, setSelected] = useState<string[]>(survey.viewerSelectedOptionIds);
  const [respond, { loading }] = useMutation(VIEWER_RESPOND_TO_CLUB_SURVEY);
  const [err, setErr] = useState<string | null>(null);
  const closed = survey.status === 'CLOSED';
  const already = survey.viewerSelectedOptionIds.length > 0;

  function toggle(id: string) {
    if (closed) return;
    if (survey.multipleChoice) {
      setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
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
      <Text style={styles.title}>{survey.title}</Text>
      {survey.description ? <Text style={styles.body}>{survey.description}</Text> : null}
      {survey.options.map((o) => {
        const pct = Math.round((o.responseCount / total) * 100);
        const mine = selected.includes(o.id);
        return (
          <Pressable
            key={o.id}
            onPress={() => toggle(o.id)}
            style={[styles.option, mine && styles.optionOn]}
            disabled={closed}
          >
            <View style={[styles.optionBar, { width: `${pct}%` }]} />
            <Text style={styles.optionLabel}>
              {o.label} — {o.responseCount} ({pct}%)
            </Text>
          </Pressable>
        );
      })}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {!closed ? (
        <Pressable
          onPress={() => void onSubmit()}
          style={[styles.btn, loading && styles.btnDisabled]}
          disabled={loading || selected.length === 0}
        >
          <Text style={styles.btnText}>{already ? 'Mettre à jour' : 'Voter'}</Text>
        </Pressable>
      ) : (
        <Text style={styles.muted}>Sondage clos</Text>
      )}
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
  const items: Array<
    | { kind: 'ann'; ann: ViewerClubAnnouncementsData['viewerClubAnnouncements'][number] }
    | { kind: 'sur'; sur: ViewerClubSurvey }
  > = [
    ...announcements.map((a) => ({ kind: 'ann' as const, ann: a })),
    ...surveys.map((s) => ({ kind: 'sur' as const, sur: s })),
  ];

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(it) =>
        it.kind === 'ann' ? `ann-${it.ann.id}` : `sur-${it.sur.id}`
      }
      refreshControl={
        <RefreshControl
          refreshing={annLoading || surLoading}
          onRefresh={() => {
            void annRefetch();
            void surRefetch();
          }}
        />
      }
      renderItem={({ item }) =>
        item.kind === 'ann' ? (
          <View style={[styles.card, item.ann.pinned && styles.pinned]}>
            <Text style={styles.title}>
              {item.ann.pinned ? '📌 ' : ''}
              {item.ann.title}
            </Text>
            <Text style={styles.body}>{item.ann.body}</Text>
          </View>
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
        <Text style={styles.muted}>Aucune actualité pour le moment.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  pinned: { borderLeftWidth: 4, borderLeftColor: '#f59e0b' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6, color: '#0f172a' },
  body: { fontSize: 14, color: '#334155' },
  option: {
    position: 'relative',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    marginTop: 8,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  optionOn: { borderColor: '#1a237e', backgroundColor: '#eef2ff' },
  optionBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#dbeafe',
  },
  optionLabel: { fontSize: 14, color: '#0f172a' },
  btn: {
    marginTop: 10,
    backgroundColor: '#1a237e',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600' },
  err: { color: '#dc2626', marginTop: 6 },
  muted: { color: '#64748b', textAlign: 'center', padding: 20 },
});
