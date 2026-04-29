import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CLUB_DYNAMIC_GROUPS } from '../../lib/documents/members';

type DynamicGroup = {
  id: string;
  name: string;
  minAge: number | null;
  maxAge: number | null;
  matchingActiveMembersCount: number;
};

type Data = { clubDynamicGroups: DynamicGroup[] };

function buildSubtitle(g: DynamicGroup): string {
  const ageBits: string[] = [];
  if (g.minAge != null) ageBits.push(`${g.minAge} ans+`);
  if (g.maxAge != null) ageBits.push(`≤ ${g.maxAge} ans`);
  const ageStr = ageBits.join(' · ') || 'Sans critère d\'âge';
  return ageStr;
}

export function DynamicGroupsScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_DYNAMIC_GROUPS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubDynamicGroups ?? [];
    return list.map((g) => ({
      key: g.id,
      title: g.name,
      subtitle: buildSubtitle(g),
      badge: {
        label: `${g.matchingActiveMembersCount}`,
        color: palette.primary,
        bg: palette.primaryLight,
      },
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="GROUPES"
        title="Groupes dynamiques"
        subtitle={`${data?.clubDynamicGroups?.length ?? 0} groupes`}
        showBack
        compact
      />
      <View style={styles.listWrap}>
        <DataTable
          data={rows}
          loading={loading}
          onRefresh={() => void refetch()}
          refreshing={loading}
          emptyTitle="Aucun groupe"
          emptySubtitle="Créez des groupes filtrés par âge ou par grade."
          emptyIcon="layers-outline"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
});
