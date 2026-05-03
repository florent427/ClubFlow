import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  spacing,
  type BottomAction,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CLOSE_CLUB_SURVEY,
  CLUB_SURVEYS,
  DELETE_CLUB_SURVEY,
  OPEN_CLUB_SURVEY,
} from '../../lib/documents/club-life';
import type { ClubLifeStackParamList } from '../../navigation/types';

type SurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED';

type Survey = {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  publishedAt: string | null;
  closesAt: string | null;
  totalResponses: number;
  createdAt: string;
};

type Data = { clubSurveys: Survey[] };

type Nav = NativeStackNavigationProp<ClubLifeStackParamList, 'Surveys'>;

const STATUS_BADGE: Record<
  SurveyStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: {
    label: 'Brouillon',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  OPEN: {
    label: 'Ouvert',
    color: palette.successText,
    bg: palette.successBg,
  },
  CLOSED: {
    label: 'Fermé',
    color: palette.muted,
    bg: palette.bgAlt,
  },
};

export function SurveysScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refetch } = useQuery<Data>(CLUB_SURVEYS, {
    errorPolicy: 'all',
  });

  const [actionTarget, setActionTarget] = useState<Survey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Survey | null>(null);

  const [openSurvey, openState] = useMutation(OPEN_CLUB_SURVEY, {
    refetchQueries: [{ query: CLUB_SURVEYS }],
  });
  const [closeSurvey, closeState] = useMutation(CLOSE_CLUB_SURVEY, {
    refetchQueries: [{ query: CLUB_SURVEYS }],
  });
  const [deleteSurvey, deleteState] = useMutation(DELETE_CLUB_SURVEY, {
    refetchQueries: [{ query: CLUB_SURVEYS }],
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubSurveys ?? [];
    const sorted = [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return sorted.map((s) => ({
      key: s.id,
      title: s.title,
      subtitle: `${s.totalResponses} réponse${s.totalResponses > 1 ? 's' : ''}${
        s.closesAt ? ` · clôture ${formatDateTime(s.closesAt)}` : ''
      }`,
      badge: STATUS_BADGE[s.status],
    }));
  }, [data]);

  const onLongPressRow = (id: string) => {
    const target = data?.clubSurveys?.find((s) => s.id === id);
    if (target) setActionTarget(target);
  };

  const actions = useMemo<BottomAction[]>(() => {
    if (!actionTarget) return [];
    const arr: BottomAction[] = [];
    if (actionTarget.status === 'DRAFT' || actionTarget.status === 'CLOSED') {
      arr.push({
        key: 'open',
        label: 'Ouvrir',
        icon: 'play-outline',
        tone: 'primary',
      });
    }
    if (actionTarget.status === 'OPEN') {
      arr.push({
        key: 'close',
        label: 'Fermer',
        icon: 'stop-circle-outline',
        tone: 'neutral',
      });
    }
    arr.push({
      key: 'delete',
      label: 'Supprimer',
      icon: 'trash-outline',
      tone: 'danger',
    });
    return arr;
  }, [actionTarget]);

  const handleAction = (key: string) => {
    if (!actionTarget) return;
    const target = actionTarget;
    setActionTarget(null);
    if (key === 'open') {
      void openSurvey({ variables: { id: target.id } });
    } else if (key === 'close') {
      void closeSurvey({ variables: { id: target.id } });
    } else if (key === 'delete') {
      setDeleteTarget(target);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    void deleteSurvey({ variables: { id } })
      .then(() => setDeleteTarget(null))
      .catch(() => setDeleteTarget(null));
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="VIE DU CLUB"
        title="Sondages"
        subtitle={`${data?.clubSurveys?.length ?? 0} sondages`}
        compact
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={() => void refetch()}
        refreshing={loading}
        emptyTitle="Aucun sondage"
        emptySubtitle="Recueillez l'avis de vos membres en quelques clics."
        emptyIcon="pie-chart-outline"
        onPressRow={(id) => navigation.navigate('SurveyDetail', { surveyId: id })}
        onLongPressRow={onLongPressRow}
      />
      <Pressable
        onPress={() => navigation.navigate('NewSurvey')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau sondage"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.title}
        actions={actions}
        onAction={handleAction}
      />
      <ConfirmSheet
        visible={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer ce sondage ?"
        message={deleteTarget?.title}
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading || openState.loading || closeState.loading}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
