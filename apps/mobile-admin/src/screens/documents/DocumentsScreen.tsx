import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  palette,
  spacing,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  ARCHIVE_CLUB_DOCUMENT,
  CATEGORY_LABELS,
  CLUB_DOCUMENTS,
  DELETE_CLUB_DOCUMENT,
} from '../../lib/documents/documents';
import type { DocumentsStackParamList } from '../../navigation/types';

type ClubDocument = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: number;
  isRequired: boolean;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  minorsOnly: boolean;
  mediaAssetUrl: string | null;
  signedCount: number;
  createdAt: string;
  updatedAt: string;
};

type Data = { clubDocuments: ClubDocument[] };

type Nav = NativeStackNavigationProp<DocumentsStackParamList, 'Documents'>;

const STATUS_BADGE: Record<
  'active' | 'archived',
  { label: string; color: string; bg: string }
> = {
  active: {
    label: 'Actif',
    color: palette.successText,
    bg: palette.successBg,
  },
  archived: {
    label: 'Archivé',
    color: palette.muted,
    bg: palette.bgAlt,
  },
};

export function DocumentsScreen() {
  const navigation = useNavigation<Nav>();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_DOCUMENTS, {
    errorPolicy: 'all',
  });
  const [archiveDoc, { loading: archiving }] = useMutation(
    ARCHIVE_CLUB_DOCUMENT,
  );
  const [deleteDoc, { loading: deleting }] = useMutation(DELETE_CLUB_DOCUMENT);

  const documents = data?.clubDocuments ?? [];
  const target = documents.find((d) => d.id === actionTargetId) ?? null;
  const targetForDelete =
    documents.find((d) => d.id === confirmDeleteId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return documents
      .filter((d) => {
        if (statusFilter === 'active') return d.isActive;
        if (statusFilter === 'archived') return !d.isActive;
        return true;
      })
      .filter(
        (d) =>
          q.length === 0 ||
          d.name.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false),
      )
      .map((d) => {
        const categoryLabel = CATEGORY_LABELS[d.category] ?? d.category;
        return {
          key: d.id,
          title: `${d.name} · v${d.version}`,
          subtitle: `${categoryLabel} · ${d.signedCount} signature${
            d.signedCount > 1 ? 's' : ''
          }`,
          badge: d.isActive ? STATUS_BADGE.active : STATUS_BADGE.archived,
        };
      });
  }, [documents, statusFilter, debounced]);

  const handleArchiveOrRestore = async (id: string) => {
    try {
      await archiveDoc({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action impossible');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    if (targetForDelete && targetForDelete.signedCount > 0) {
      Alert.alert(
        'Suppression impossible',
        'Des signatures existent déjà pour ce document. Archivez-le plutôt.',
      );
      setConfirmDeleteId(null);
      return;
    }
    try {
      await deleteDoc({ variables: { id: confirmDeleteId } });
      setConfirmDeleteId(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Suppression impossible');
    }
  };

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="DOCUMENTS"
        title="À signer"
        subtitle={`${documents.length} document${
          documents.length > 1 ? 's' : ''
        }`}
        compact
        showBack
      />
      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un document…"
        />
      </View>
      <FilterChipBar
        chips={[
          { key: 'active', label: 'Actifs' },
          { key: 'archived', label: 'Archivés' },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
        allLabel="Tous"
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun document à signer"
        emptySubtitle="Créez-en depuis l'admin web."
        emptyIcon="document-text-outline"
        onPressRow={(id) =>
          navigation.navigate('DocumentDetail', { documentId: id })
        }
        onLongPressRow={(id) => setActionTargetId(id)}
      />

      <BottomActionBar
        visible={actionTargetId != null}
        onClose={() => setActionTargetId(null)}
        title={target?.name}
        actions={[
          {
            key: 'detail',
            label: 'Voir détail',
            icon: 'eye-outline',
          },
          {
            key: 'archive',
            label: target?.isActive ? 'Archiver' : 'Restaurer',
            icon: target?.isActive
              ? ('archive-outline' as const)
              : ('refresh-outline' as const),
            disabled: archiving,
          },
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
          if (key === 'detail')
            navigation.navigate('DocumentDetail', { documentId: id });
          if (key === 'archive') void handleArchiveOrRestore(id);
          if (key === 'delete') setConfirmDeleteId(id);
        }}
      />

      <ConfirmSheet
        visible={confirmDeleteId != null}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer le document ?"
        message={
          targetForDelete && targetForDelete.signedCount > 0
            ? 'Impossible : signatures existantes. Archivez-le plutôt.'
            : 'Cette action est irréversible. Le document et ses champs seront supprimés.'
        }
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
});
