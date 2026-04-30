import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  KpiTile,
  Pill,
  ScreenContainer,
  ScreenHero,
  absolutizeMediaUrl,
  formatDateShort,
  palette,
  radius,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import {
  ARCHIVE_CLUB_DOCUMENT,
  CATEGORY_LABELS,
  CATEGORY_TONES,
  CLUB_DOCUMENT,
  CLUB_DOCUMENT_SIGNATURE_STATS,
  DELETE_CLUB_DOCUMENT,
} from '../../lib/documents/documents';
import type { DocumentsStackParamList } from '../../navigation/types';

type DocumentField = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fieldType: string;
  required: boolean;
  label: string | null;
};

type ClubDocument = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  version: number;
  fileSha256: string;
  isRequired: boolean;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  minorsOnly: boolean;
  mediaAssetId: string;
  mediaAssetUrl: string | null;
  signedCount: number;
  fields: DocumentField[];
  createdAt: string;
  updatedAt: string;
};

type SignatureStats = {
  totalRequired: number;
  totalSigned: number;
  percentSigned: number;
  unsignedMemberIds: string[];
};

type DocData = { clubDocument: ClubDocument | null };
type StatsData = { clubDocumentSignatureStats: SignatureStats };

type Nav = NativeStackNavigationProp<
  DocumentsStackParamList,
  'DocumentDetail'
>;
type Route = RouteProp<DocumentsStackParamList, 'DocumentDetail'>;

export function DocumentDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { documentId } = route.params;

  const {
    data,
    loading,
    refetch,
  } = useQuery<DocData>(CLUB_DOCUMENT, {
    variables: { id: documentId },
    errorPolicy: 'all',
  });
  const { data: statsData, refetch: refetchStats } = useQuery<StatsData>(
    CLUB_DOCUMENT_SIGNATURE_STATS,
    {
      variables: { documentId },
      errorPolicy: 'all',
    },
  );

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [archiveDoc, { loading: archiving }] = useMutation(
    ARCHIVE_CLUB_DOCUMENT,
  );
  const [deleteDoc, { loading: deleting }] = useMutation(DELETE_CLUB_DOCUMENT);

  const doc = data?.clubDocument ?? null;
  const stats = statsData?.clubDocumentSignatureStats ?? null;

  if (loading && !doc) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="DOCUMENT"
          title="Chargement…"
          compact
          showBack
        />
      </ScreenContainer>
    );
  }

  if (!doc) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="DOCUMENT"
          title="Introuvable"
          compact
          showBack
        />
        <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <EmptyState
            icon="alert-circle-outline"
            title="Document introuvable"
            description="Le document n'existe plus ou n'est pas accessible."
          />
        </Card>
      </ScreenContainer>
    );
  }

  const categoryLabel = CATEGORY_LABELS[doc.category] ?? doc.category;
  const categoryTone = CATEGORY_TONES[doc.category] ?? 'neutral';

  const onArchiveOrRestore = async () => {
    try {
      await archiveDoc({ variables: { id: doc.id } });
      setConfirmArchive(false);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Action impossible');
    }
  };
  const onDelete = async () => {
    if (doc.signedCount > 0) {
      Alert.alert(
        'Suppression impossible',
        'Des signatures existent déjà pour ce document. Archivez-le plutôt.',
      );
      setConfirmDelete(false);
      return;
    }
    try {
      await deleteDoc({ variables: { id: doc.id } });
      setConfirmDelete(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Suppression impossible');
    }
  };

  const onOpenSourcePdf = async () => {
    // Réécrit `localhost` → IP LAN via EXPO_PUBLIC_API_BASE pour que le
    // téléphone puisse résoudre l'URL (cf. helper absolutizeMediaUrl).
    const resolved = absolutizeMediaUrl(doc.mediaAssetUrl);
    if (!resolved) {
      Alert.alert('Indisponible', 'L\'URL du document source est introuvable.');
      return;
    }
    try {
      await Linking.openURL(resolved);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'ouvrir le PDF.');
    }
  };

  const percent = stats?.percentSigned ?? 0;
  const clampedPercent = Math.max(0, Math.min(100, percent));

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => {
        void refetch();
        void refetchStats();
      }}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="DOCUMENT"
        title={doc.name}
        subtitle={`v${doc.version} · ${categoryLabel}`}
        compact
        showBack
      />

      <Card
        title="Informations"
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.pillsRow}>
          <Pill label={categoryLabel} tone={categoryTone} />
          <Pill
            label={doc.isActive ? 'Actif' : 'Archivé'}
            tone={doc.isActive ? 'success' : 'neutral'}
          />
          {doc.isRequired ? <Pill label="Obligatoire" tone="warning" /> : null}
          {doc.minorsOnly ? <Pill label="Mineurs" tone="info" /> : null}
        </View>
        <View style={styles.metaList}>
          <MetaRow label="Version" value={`v${doc.version}`} />
          <MetaRow
            label="Période"
            value={
              doc.validTo
                ? `${formatDateShort(doc.validFrom)} → ${formatDateShort(
                    doc.validTo,
                  )}`
                : `Depuis le ${formatDateShort(doc.validFrom)}`
            }
          />
          {doc.description ? (
            <MetaRow label="Description" value={doc.description} />
          ) : null}
        </View>
      </Card>

      <Card
        title="Statistiques de signature"
        subtitle={
          stats
            ? `${stats.totalSigned} signature${
                stats.totalSigned > 1 ? 's' : ''
              } sur ${stats.totalRequired} requises`
            : undefined
        }
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.kpisRow}>
          <KpiTile
            icon="people-outline"
            label="Requis"
            value={String(stats?.totalRequired ?? 0)}
            tone="primary"
            compact
          />
          <KpiTile
            icon="checkmark-done-outline"
            label="Signé"
            value={String(stats?.totalSigned ?? 0)}
            tone="success"
            compact
          />
          <KpiTile
            icon="trending-up-outline"
            label="Progression"
            value={`${Math.round(clampedPercent)}%`}
            tone="cool"
            compact
          />
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[styles.progressBarFill, { width: `${clampedPercent}%` }]}
          />
        </View>
      </Card>

      <Card
        title="Actions"
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        <View style={styles.actions}>
          <Button
            label="Voir les signataires"
            variant="primary"
            icon="people-outline"
            onPress={() =>
              navigation.navigate('DocumentSignatures', {
                documentId: doc.id,
              })
            }
          />
          <Button
            label="Voir le PDF source"
            variant="secondary"
            icon="document-outline"
            onPress={() => void onOpenSourcePdf()}
            disabled={!doc.mediaAssetUrl}
          />
          <Button
            label={doc.isActive ? 'Archiver' : 'Restaurer'}
            variant="ghost"
            icon={doc.isActive ? 'archive-outline' : 'refresh-outline'}
            onPress={() => setConfirmArchive(true)}
            loading={archiving}
          />
          <Button
            label="Supprimer définitivement"
            variant="danger"
            icon="trash-outline"
            onPress={() => setConfirmDelete(true)}
          />
        </View>
      </Card>

      <ConfirmSheet
        visible={confirmArchive}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => void onArchiveOrRestore()}
        title={
          doc.isActive ? 'Archiver le document ?' : 'Restaurer le document ?'
        }
        message={
          doc.isActive
            ? 'Le document ne sera plus proposé à la signature, mais l\'historique reste consultable.'
            : 'Le document redeviendra actif et proposé à la signature.'
        }
        confirmLabel={doc.isActive ? 'Archiver' : 'Restaurer'}
        loading={archiving}
      />
      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
        title="Supprimer le document ?"
        message={
          doc.signedCount > 0
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={4}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  metaList: {
    gap: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLabel: {
    ...typography.smallStrong,
    color: palette.muted,
  },
  metaValue: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
    textAlign: 'right',
  },
  kpisRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressBarBg: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: palette.bgAlt,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: palette.success,
  },
  actions: {
    gap: spacing.sm,
  },
});
