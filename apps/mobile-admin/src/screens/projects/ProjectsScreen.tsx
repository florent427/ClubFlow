import { useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  formatDateShort,
  palette,
  spacing,
  type DataTableRow,
  type FilterChip,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CLUB_PROJECTS } from '../../lib/documents/projects';
import type { ProjectsStackParamList } from '../../navigation/types';

type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

type Project = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: ProjectStatus;
  startsAt: string | null;
  endsAt: string | null;
  coverImageUrl: string | null;
  budgetPlannedCents: number | null;
  createdAt: string;
  updatedAt: string;
};

type Data = { clubProjects: Project[] };

type Nav = NativeStackNavigationProp<ProjectsStackParamList, 'Projects'>;

const STATUS_CHIPS: FilterChip[] = [
  { key: 'DRAFT', label: 'Brouillons' },
  { key: 'ACTIVE', label: 'Actifs' },
  { key: 'CLOSED', label: 'Clôturés' },
  { key: 'ARCHIVED', label: 'Archivés' },
];

const STATUS_BADGE: Record<
  ProjectStatus,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  ACTIVE: { label: 'Actif', color: palette.successText, bg: palette.successBg },
  CLOSED: {
    label: 'Clôturé',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  ARCHIVED: {
    label: 'Archivé',
    color: palette.muted,
    bg: palette.bgAlt,
  },
};

export function ProjectsScreen() {
  const navigation = useNavigation<Nav>();
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_PROJECTS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubProjects ?? [];
    return list
      .filter((p) => statusFilter == null || p.status === statusFilter)
      .map((p) => {
        const dateBit = p.startsAt
          ? `Début ${formatDateShort(p.startsAt)}`
          : `Créé le ${formatDateShort(p.createdAt)}`;
        return {
          key: p.id,
          title: p.title,
          subtitle: p.summary ?? dateBit,
          badge: STATUS_BADGE[p.status],
        };
      });
  }, [data, statusFilter]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="PROJETS"
        title="Projets"
        subtitle="Saisons, événements long-terme"
        compact
        showBack
      />
      <FilterChipBar
        chips={STATUS_CHIPS}
        activeKey={statusFilter}
        onSelect={(k) => setStatusFilter(k as ProjectStatus | null)}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucun projet"
        emptySubtitle="Créez votre premier projet via le bouton +"
        emptyIcon="folder-outline"
        onPressRow={(id) => navigation.navigate('ProjectDetail', { projectId: id })}
      />
      <Pressable
        onPress={() => navigation.navigate('NewProject')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouveau projet"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
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
