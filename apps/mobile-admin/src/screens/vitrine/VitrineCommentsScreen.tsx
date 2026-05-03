import { useMutation, useQuery } from '@apollo/client/react';
import {
  ConfirmSheet,
  DataTable,
  DrawerSheet,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_VITRINE_COMMENTS,
  DELETE_VITRINE_COMMENT,
  SET_VITRINE_COMMENT_STATUS,
} from '../../lib/documents/vitrine';

type CommentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'NEEDS_REVIEW'
  | 'REJECTED'
  | 'SPAM';

type Comment = {
  id: string;
  authorName: string;
  authorEmail: string;
  body: string;
  articleTitle: string;
  status: CommentStatus;
  createdAt: string;
};

type Data = { clubVitrineComments: Comment[] };

const STATUS_CHIPS: FilterChip[] = [
  { key: 'PENDING', label: 'En attente' },
  { key: 'APPROVED', label: 'Approuvés' },
  { key: 'REJECTED', label: 'Rejetés' },
];

const STATUS_BADGE: Record<
  CommentStatus,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: 'En attente', color: palette.warningText, bg: palette.warningBg },
  APPROVED: { label: 'Approuvé', color: palette.successText, bg: palette.successBg },
  NEEDS_REVIEW: { label: 'À revoir', color: palette.warningText, bg: palette.warningBg },
  REJECTED: { label: 'Rejeté', color: palette.dangerText, bg: palette.dangerBg },
  SPAM: { label: 'Spam', color: palette.dangerText, bg: palette.dangerBg },
};

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

export function VitrineCommentsScreen() {
  const [status, setStatus] = useState<CommentStatus | null>(null);
  const [actionComment, setActionComment] = useState<Comment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Comment | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_VITRINE_COMMENTS, {
    variables: status ? { status } : {},
    errorPolicy: 'all',
  });

  const [setCommentStatus, setStatusState] = useMutation(
    SET_VITRINE_COMMENT_STATUS,
    {
      refetchQueries: [{ query: CLUB_VITRINE_COMMENTS }],
    },
  );
  const [deleteComment, deleteState] = useMutation(DELETE_VITRINE_COMMENT, {
    refetchQueries: [{ query: CLUB_VITRINE_COMMENTS }],
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubVitrineComments ?? [];
    return list.map((c) => ({
      key: c.id,
      title: c.authorName,
      subtitle: `${truncate(c.body, 60)} — sur « ${c.articleTitle} »`,
      badge: STATUS_BADGE[c.status],
    }));
  }, [data]);

  const commentById = (id: string) =>
    data?.clubVitrineComments?.find((x) => x.id === id) ?? null;

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="MODÉRATION"
        title="Commentaires"
        subtitle={`${data?.clubVitrineComments?.length ?? 0} commentaires`}
        showBack
        compact
      />
      <FilterChipBar
        chips={STATUS_CHIPS}
        activeKey={status}
        onSelect={(k) => setStatus(k as CommentStatus | null)}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun commentaire"
        emptySubtitle="Aucun commentaire à modérer pour ce filtre."
        emptyIcon="chatbubbles-outline"
        onLongPressRow={(id) => {
          const c = commentById(id);
          if (c) setActionComment(c);
        }}
      />

      <DrawerSheet
        visible={!!actionComment}
        onClose={() => setActionComment(null)}
        title={actionComment?.authorName ?? ''}
        subtitle={actionComment ? truncate(actionComment.body, 100) : undefined}
      >
        {actionComment ? (
          <View style={styles.actionsList}>
            <ActionRow
              icon="checkmark-circle-outline"
              label="Approuver"
              onPress={() => {
                void setCommentStatus({
                  variables: {
                    input: { id: actionComment.id, status: 'APPROVED' },
                  },
                }).finally(() => setActionComment(null));
              }}
              loading={setStatusState.loading}
            />
            <ActionRow
              icon="close-circle-outline"
              label="Rejeter"
              onPress={() => {
                void setCommentStatus({
                  variables: {
                    input: { id: actionComment.id, status: 'REJECTED' },
                  },
                }).finally(() => setActionComment(null));
              }}
              loading={setStatusState.loading}
            />
            <ActionRow
              icon="trash-outline"
              label="Supprimer"
              danger
              onPress={() => {
                setConfirmDelete(actionComment);
                setActionComment(null);
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
          void deleteComment({ variables: { id: confirmDelete.id } }).finally(
            () => setConfirmDelete(null),
          );
        }}
        title="Supprimer ce commentaire ?"
        message="Cette action est définitive."
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
