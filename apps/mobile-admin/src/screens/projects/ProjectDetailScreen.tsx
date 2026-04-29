import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  formatEuroCents,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_PROJECT,
  CLUB_PROJECTS,
  DELETE_CLUB_PROJECT,
} from '../../lib/documents/projects';
import type { ProjectsStackParamList } from '../../navigation/types';

type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

type Project = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  status: ProjectStatus;
  startsAt: string | null;
  endsAt: string | null;
  coverImageUrl: string | null;
  posterAssetUrl: string | null;
  budgetPlannedCents: number | null;
  showContributorCredits: boolean;
  maxPhotosPerContributorPerPhase: number;
  maxVideosPerContributorPerPhase: number;
  maxTextsPerContributorPerPhase: number;
  createdAt: string;
  updatedAt: string;
};

type Data = { clubProject: Project | null };

type Nav = NativeStackNavigationProp<ProjectsStackParamList, 'ProjectDetail'>;
type Rt = RouteProp<ProjectsStackParamList, 'ProjectDetail'>;

const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  CLOSED: 'Clôturé',
  ARCHIVED: 'Archivé',
};

export function ProjectDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const projectId = route.params.projectId;

  const { data, loading, refetch } = useQuery<Data>(CLUB_PROJECT, {
    variables: { id: projectId },
    errorPolicy: 'all',
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const [deleteProject, deleteState] = useMutation(DELETE_CLUB_PROJECT, {
    refetchQueries: [{ query: CLUB_PROJECTS }],
  });

  const project = data?.clubProject ?? null;

  const handleDelete = async () => {
    try {
      await deleteProject({ variables: { id: projectId } });
      setConfirmDelete(false);
      Alert.alert('Projet supprimé', 'Le projet a bien été supprimé.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de supprimer.');
    }
  };

  if (loading && !project) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="PROJET"
          title="Détail du projet"
          showBack
          compact
        />
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!project) {
    return (
      <ScreenContainer padding={0}>
        <ScreenHero
          eyebrow="PROJET"
          title="Détail du projet"
          showBack
          compact
        />
        <View style={styles.body}>
          <Card>
            <EmptyState
              icon="folder-open-outline"
              title="Projet introuvable"
              description="Ce projet a peut-être été supprimé."
            />
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow={STATUS_LABELS[project.status]}
        title={project.title}
        subtitle={project.summary ?? undefined}
        showBack
        compact
      />
      <View style={styles.body}>
        {project.description ? (
          <Card title="Description">
            <Text style={styles.body_text}>{project.description}</Text>
          </Card>
        ) : null}

        <Card title="Budget">
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Budget prévu</Text>
            <Text style={styles.kvValue}>
              {formatEuroCents(project.budgetPlannedCents)}
            </Text>
          </View>
        </Card>

        <Card title="Période">
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Début</Text>
            <Text style={styles.kvValue}>
              {project.startsAt ? formatDateShort(project.startsAt) : '—'}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Fin</Text>
            <Text style={styles.kvValue}>
              {project.endsAt ? formatDateShort(project.endsAt) : '—'}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Mis à jour le</Text>
            <Text style={styles.kvValue}>
              {formatDateShort(project.updatedAt)}
            </Text>
          </View>
        </Card>

        <Card
          title="Limites contributeurs"
          subtitle="Quotas par phase live"
        >
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Photos / phase</Text>
            <Text style={styles.kvValue}>
              {project.maxPhotosPerContributorPerPhase}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Vidéos / phase</Text>
            <Text style={styles.kvValue}>
              {project.maxVideosPerContributorPerPhase}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Textes / phase</Text>
            <Text style={styles.kvValue}>
              {project.maxTextsPerContributorPerPhase}
            </Text>
          </View>
          <View style={styles.kv}>
            <Text style={styles.kvLabel}>Crédits affichés</Text>
            <Text style={styles.kvValue}>
              {project.showContributorCredits ? 'Oui' : 'Non'}
            </Text>
          </View>
        </Card>

        <Button
          label="Supprimer le projet"
          variant="danger"
          icon="trash-outline"
          onPress={() => setConfirmDelete(true)}
          fullWidth
        />
      </View>

      <ConfirmSheet
        visible={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Supprimer ce projet ?"
        message={`« ${project.title} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        destructive
        loading={deleteState.loading}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.huge,
  },
  body_text: {
    ...typography.body,
    color: palette.body,
  },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  kvLabel: { ...typography.smallStrong, color: palette.muted },
  kvValue: { ...typography.body, color: palette.ink },
});
