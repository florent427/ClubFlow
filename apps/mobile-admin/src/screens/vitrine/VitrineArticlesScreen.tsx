import { useMutation, useQuery } from '@apollo/client/react';
import {
  ConfirmSheet,
  DataTable,
  DrawerSheet,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  palette,
  spacing,
  typography,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_VITRINE_ARTICLES,
  DELETE_VITRINE_ARTICLE,
  SET_VITRINE_ARTICLE_PINNED,
  SET_VITRINE_ARTICLE_STATUS,
} from '../../lib/documents/vitrine';
import type { VitrineStackParamList } from '../../navigation/types';

type Channel = 'NEWS' | 'BLOG';
type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

type Article = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: ArticleStatus;
  channel: Channel;
  publishedAt: string | null;
  updatedAt: string;
  pinned: boolean;
  coverImageUrl: string | null;
};

type Data = { clubVitrineArticles: Article[] };

type Nav = NativeStackNavigationProp<VitrineStackParamList, 'Articles'>;

const CHANNEL_CHIPS: FilterChip[] = [
  { key: 'NEWS', label: 'Actualités' },
  { key: 'BLOG', label: 'Blog' },
];

const STATUS_BADGE: Record<
  ArticleStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.warningText, bg: palette.warningBg },
  PUBLISHED: { label: 'Publié', color: palette.successText, bg: palette.successBg },
  ARCHIVED: { label: 'Archivé', color: palette.muted, bg: palette.bgAlt },
};

export function VitrineArticlesScreen() {
  const navigation = useNavigation<Nav>();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [actionArticle, setActionArticle] = useState<Article | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Article | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_ARTICLES, {
    variables: channel ? { channel } : {},
    errorPolicy: 'all',
  });

  const [setStatus, setStatusState] = useMutation(SET_VITRINE_ARTICLE_STATUS, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [setPinned, setPinnedState] = useMutation(SET_VITRINE_ARTICLE_PINNED, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });
  const [deleteArticle, deleteState] = useMutation(DELETE_VITRINE_ARTICLE, {
    refetchQueries: [{ query: CLUB_VITRINE_ARTICLES }],
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubVitrineArticles ?? [];
    return list.map((a) => {
      const dateBit = a.publishedAt
        ? `Publié le ${formatDateShort(a.publishedAt)}`
        : `Modifié le ${formatDateShort(a.updatedAt)}`;
      return {
        key: a.id,
        title: (a.pinned ? '📌 ' : '') + a.title,
        subtitle: dateBit,
        badge: STATUS_BADGE[a.status],
      };
    });
  }, [data]);

  const articleById = (id: string) =>
    data?.clubVitrineArticles?.find((x) => x.id === id) ?? null;

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="VITRINE"
        title="Articles"
        subtitle="Actualités et blog"
        showBack
        compact
      />
      <FilterChipBar
        chips={CHANNEL_CHIPS}
        activeKey={channel}
        onSelect={(k) => setChannel(k as Channel | null)}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun article"
        emptySubtitle="Créez votre premier article."
        emptyIcon="reader-outline"
        onPressRow={(id) =>
          navigation.navigate('ArticleEditor', { articleId: id })
        }
        onLongPressRow={(id) => {
          const a = articleById(id);
          if (a) setActionArticle(a);
        }}
      />

      <DrawerSheet
        visible={!!actionArticle}
        onClose={() => setActionArticle(null)}
        title={actionArticle?.title ?? ''}
        subtitle="Actions rapides"
      >
        {actionArticle ? (
          <View style={styles.actionsList}>
            <ActionRow
              icon={
                actionArticle.status === 'PUBLISHED'
                  ? 'eye-off-outline'
                  : 'send-outline'
              }
              label={
                actionArticle.status === 'PUBLISHED' ? 'Dépublier' : 'Publier'
              }
              onPress={() => {
                const next: ArticleStatus =
                  actionArticle.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
                void setStatus({
                  variables: {
                    input: { id: actionArticle.id, status: next },
                  },
                }).finally(() => setActionArticle(null));
              }}
              loading={setStatusState.loading}
            />
            <ActionRow
              icon={actionArticle.pinned ? 'bookmark' : 'bookmark-outline'}
              label={actionArticle.pinned ? 'Désépingler' : 'Épingler'}
              onPress={() => {
                void setPinned({
                  variables: {
                    id: actionArticle.id,
                    pinned: !actionArticle.pinned,
                  },
                }).finally(() => setActionArticle(null));
              }}
              loading={setPinnedState.loading}
            />
            <ActionRow
              icon="trash-outline"
              label="Supprimer"
              danger
              onPress={() => {
                setConfirmDelete(actionArticle);
                setActionArticle(null);
              }}
            />
          </View>
        ) : null}
      </DrawerSheet>

      <ConfirmSheet
        visible={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          void deleteArticle({ variables: { id: confirmDelete.id } }).finally(
            () => setConfirmDelete(null),
          );
        }}
        title="Supprimer cet article ?"
        message={
          confirmDelete
            ? `« ${confirmDelete.title} » sera définitivement supprimé.`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  loading,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? palette.danger : palette.body}
      />
      <Text
        style={[
          styles.actionLabel,
          danger && { color: palette.danger },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionsList: { gap: spacing.xs },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  actionLabel: {
    ...typography.body,
    color: palette.ink,
  },
});
