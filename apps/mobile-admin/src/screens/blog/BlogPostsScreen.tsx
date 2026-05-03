import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  formatDateShort,
  palette,
  spacing,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  ARCHIVE_BLOG_POST,
  CLUB_BLOG_POSTS,
  DELETE_BLOG_POST,
  PUBLISH_BLOG_POST,
} from '../../lib/documents/blog';

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  coverImageUrl: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Data = { clubBlogPosts: BlogPost[] };

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  PUBLISHED: {
    label: 'Publié',
    color: palette.successText,
    bg: palette.successBg,
  },
  ARCHIVED: {
    label: 'Archivé',
    color: palette.warningText,
    bg: palette.warningBg,
  },
};

export function BlogPostsScreen() {
  const nav = useNavigation();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_BLOG_POSTS, {
    errorPolicy: 'all',
  });
  const [publishPost, { loading: publishing }] = useMutation(PUBLISH_BLOG_POST);
  const [archivePost, { loading: archiving }] = useMutation(ARCHIVE_BLOG_POST);
  const [deletePost, { loading: deleting }] = useMutation(DELETE_BLOG_POST);

  const posts = data?.clubBlogPosts ?? [];
  const target = posts.find((p) => p.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return posts
      .filter((p) => statusFilter == null || p.status === statusFilter)
      .filter(
        (p) =>
          q.length === 0 ||
          p.title.toLowerCase().includes(q) ||
          (p.excerpt?.toLowerCase().includes(q) ?? false),
      )
      .map((p) => ({
        key: p.id,
        title: p.title,
        subtitle: p.publishedAt
          ? `Publié le ${formatDateShort(p.publishedAt)}`
          : `Créé le ${formatDateShort(p.createdAt)}`,
        badge: STATUS_BADGE[p.status] ?? null,
      }));
  }, [posts, statusFilter, debounced]);

  const handlePublish = async (id: string) => {
    try {
      await publishPost({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Publication impossible');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await archivePost({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Archivage impossible');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deletePost({ variables: { id: confirmDeleteId } });
      setConfirmDeleteId(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Suppression impossible');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="BLOG INTERNE"
        title="Articles"
        subtitle={`${posts.length} article${posts.length > 1 ? 's' : ''}`}
        compact
      />
      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un article…"
        />
      </View>
      <FilterChipBar
        chips={[
          { key: 'DRAFT', label: 'Brouillons' },
          { key: 'PUBLISHED', label: 'Publiés' },
          { key: 'ARCHIVED', label: 'Archivés' },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun article"
        emptySubtitle="Rédigez votre premier article."
        emptyIcon="reader-outline"
        onPressRow={(id) =>
          (nav as any).navigate('BlogPostEditor', { postId: id })
        }
        onLongPressRow={(id) => setActionTargetId(id)}
      />
      <Pressable
        onPress={() => (nav as any).navigate('NewBlogPost')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouvel article"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={actionTargetId != null}
        onClose={() => setActionTargetId(null)}
        title={target?.title}
        actions={[
          ...(target?.status === 'DRAFT' || target?.status === 'ARCHIVED'
            ? [
                {
                  key: 'publish',
                  label: 'Publier',
                  icon: 'cloud-upload-outline' as const,
                  tone: 'primary' as const,
                  disabled: publishing,
                },
              ]
            : []),
          ...(target?.status === 'PUBLISHED'
            ? [
                {
                  key: 'archive',
                  label: 'Archiver',
                  icon: 'archive-outline' as const,
                  disabled: archiving,
                },
              ]
            : []),
          {
            key: 'delete',
            label: 'Supprimer',
            icon: 'trash-outline',
            tone: 'danger',
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'publish') void handlePublish(id);
          if (key === 'archive') void handleArchive(id);
          if (key === 'delete') setConfirmDeleteId(id);
        }}
      />
      <ConfirmSheet
        visible={confirmDeleteId != null}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer l'article ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        loading={deleting}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
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
