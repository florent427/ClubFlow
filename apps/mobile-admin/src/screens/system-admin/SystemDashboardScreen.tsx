import {
  Card,
  EmptyState,
  KpiTile,
  ScreenContainer,
  ScreenHero,
  spacing,
} from '@clubflow/mobile-shared';
import { StyleSheet, View } from 'react-native';

/**
 * Vue d'ensemble plate-forme. La query agrégée multi-clubs n'est pas
 * encore exposée côté API ; on affiche des KPI placeholder + un message
 * indiquant que la vue complète arrive.
 */
export function SystemDashboardScreen() {
  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="SYSTÈME"
        title="Administration plate-forme"
        subtitle="Tous les clubs"
        showBack
        compact
      />
      <View style={styles.body}>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCol}>
            <KpiTile label="Clubs total" value="—" icon="business-outline" />
          </View>
          <View style={styles.kpiCol}>
            <KpiTile
              label="Utilisateurs total"
              value="—"
              icon="people-outline"
            />
          </View>
        </View>
        <View style={styles.kpiRow}>
          <View style={styles.kpiCol}>
            <KpiTile
              label="Adhésions actives"
              value="—"
              icon="card-outline"
            />
          </View>
          <View style={styles.kpiCol}>
            <KpiTile
              label="Modules actifs"
              value="—"
              icon="apps-outline"
            />
          </View>
        </View>

        <Card>
          <EmptyState
            icon="construct-outline"
            title="Tableau global en cours d'implémentation"
            description="L'agrégation multi-clubs (revenus, KPIs croisés, alertes plate-forme) sera disponible dans une prochaine version. Utilisez l'admin web pour la supervision détaillée."
          />
        </Card>
      </View>
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
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kpiCol: { flex: 1 },
});
