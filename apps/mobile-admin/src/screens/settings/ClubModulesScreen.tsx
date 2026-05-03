import { useMutation, useQuery } from '@apollo/client/react';
import {
  CLUB_MODULES,
  Card,
  MODULE_LABELS,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
  type ClubModuleStatus,
  type ModuleCode,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { SET_CLUB_MODULE_ENABLED } from '../../lib/documents/settings';

type Data = { clubModules: ClubModuleStatus[] };

export function ClubModulesScreen() {
  const { data, loading, refetch } = useQuery<Data>(CLUB_MODULES, {
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });

  const [setEnabled, setEnabledState] = useMutation(SET_CLUB_MODULE_ENABLED, {
    refetchQueries: [{ query: CLUB_MODULES }],
  });

  const modules = useMemo(() => {
    const list = data?.clubModules ?? [];
    return [...list].sort((a, b) =>
      (MODULE_LABELS[a.moduleCode] ?? a.moduleCode).localeCompare(
        MODULE_LABELS[b.moduleCode] ?? b.moduleCode,
      ),
    );
  }, [data]);

  const toggle = (moduleCode: ModuleCode, enabled: boolean) => {
    void setEnabled({ variables: { moduleCode, enabled } }).catch(() => {});
  };

  return (
    <ScreenContainer
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="RÉGLAGES"
        title="Modules"
        subtitle={`${modules.filter((m) => m.enabled).length} actifs sur ${modules.length}`}
        showBack
        compact
      />

      <View style={styles.body}>
        {loading && modules.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <Card padding={0}>
            {modules.map((m, idx) => (
              <View
                key={m.moduleCode}
                style={[
                  styles.row,
                  idx !== modules.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>
                    {MODULE_LABELS[m.moduleCode] ?? m.moduleCode}
                  </Text>
                  <Text style={styles.rowSubtitle}>{m.moduleCode}</Text>
                </View>
                <Switch
                  value={m.enabled}
                  onValueChange={(v) => toggle(m.moduleCode, v)}
                  disabled={setEnabledState.loading}
                  trackColor={{
                    false: palette.bgAlt,
                    true: palette.primary,
                  }}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loaderWrap: { padding: spacing.xxl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    minHeight: 64,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  rowSubtitle: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
});
