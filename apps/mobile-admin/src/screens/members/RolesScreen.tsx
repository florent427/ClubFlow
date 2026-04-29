import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { CLUB_ROLE_DEFINITIONS } from '../../lib/documents/members';

type RoleDefinition = {
  id: string;
  label: string;
  sortOrder: number;
};

type Data = { clubRoleDefinitions: RoleDefinition[] };

/** Couleurs déterministes par rôle (le backend n'expose pas de color). */
const ROLE_COLORS = [
  palette.primary,
  palette.accent,
  palette.cool,
  palette.success,
  palette.warning,
  palette.danger,
  palette.info,
] as const;

function colorForRole(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % ROLE_COLORS.length;
  return ROLE_COLORS[index];
}

export function RolesScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_ROLE_DEFINITIONS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = [...(data?.clubRoleDefinitions ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    return list.map((r) => ({
      key: r.id,
      title: r.label,
      subtitle: 'Rôle personnalisé',
      leading: <RoleBubble color={colorForRole(r.id)} />,
    }));
  }, [data]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="RÔLES"
        title="Rôles personnalisés"
        subtitle={`${data?.clubRoleDefinitions?.length ?? 0} rôles définis`}
        showBack
        compact
      />
      <View style={styles.listWrap}>
        <DataTable
          data={rows}
          loading={loading}
          onRefresh={() => void refetch()}
          refreshing={loading}
          emptyTitle="Aucun rôle"
          emptySubtitle="Créez des rôles pour qualifier vos membres (parent référent, juge, etc.)."
          emptyIcon="shield-checkmark-outline"
        />
      </View>
    </ScreenContainer>
  );
}

function RoleBubble({ color }: { color: string }) {
  return <View style={[styles.bubble, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  bubble: {
    width: 16,
    height: 16,
    borderRadius: 8,
    margin: spacing.sm,
  },
});
