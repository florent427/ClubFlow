import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CLUB_GRADE_LEVELS } from '../../lib/documents/members';

type GradeLevel = {
  id: string;
  label: string;
  sortOrder: number;
};

type Data = { clubGradeLevels: GradeLevel[] };

export function GradesScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_GRADE_LEVELS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = [...(data?.clubGradeLevels ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return list.map((g, idx) => ({
      key: g.id,
      title: g.label,
      subtitle: `Position ${idx + 1}`,
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="GRADES"
        title="Niveaux & ceintures"
        subtitle={`${data?.clubGradeLevels?.length ?? 0} grades`}
        showBack
        compact
      />
      <View style={styles.listWrap}>
        <DataTable
          data={rows}
          loading={loading}
          onRefresh={() => void refetch()}
          refreshing={loading}
          emptyTitle="Aucun grade"
          emptySubtitle="Définissez les ceintures / niveaux du club."
          emptyIcon="ribbon-outline"
        />
      </View>
      <Pressable
        onPress={() => {
          // TODO: formulaire CREATE/EDIT grade — placeholder pour l'instant
        }}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un grade"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
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
