import { useQuery } from '@apollo/client/react';
import {
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_FINANCIAL_ACCOUNTS,
} from '../../lib/documents/accounting';

type FinancialAccount = {
  id: string;
  label: string;
  kind: string;
  isActive: boolean;
  isDefault: boolean;
  accountingAccountCode: string;
};

type AccountingAccount = {
  id: string;
  code: string;
  label: string;
  kind: string;
  isActive: boolean;
};

type FinancialAccountsData = {
  clubFinancialAccounts: FinancialAccount[];
};
type AccountingAccountsData = {
  clubAccountingAccounts: AccountingAccount[];
};

const FIN_KIND_LABEL: Record<string, string> = {
  BANK: 'Banque',
  CASH: 'Caisse',
  STRIPE_TRANSIT: 'Transit Stripe',
  OTHER_TRANSIT: 'Autre transit',
};

const ACC_KIND_LABEL: Record<string, string> = {
  ASSET: 'Actif',
  LIABILITY: 'Passif',
  INCOME: 'Produit',
  EXPENSE: 'Charge',
  NEUTRAL_IN_KIND: 'Don nature',
};

export function AccountingSettingsScreen() {
  const {
    data: finData,
    loading: finLoading,
    refetch: refetchFin,
  } = useQuery<FinancialAccountsData>(CLUB_FINANCIAL_ACCOUNTS, {
    errorPolicy: 'all',
  });
  const {
    data: accData,
    loading: accLoading,
    refetch: refetchAcc,
  } = useQuery<AccountingAccountsData>(CLUB_ACCOUNTING_ACCOUNTS, {
    errorPolicy: 'all',
  });

  const finAccounts = finData?.clubFinancialAccounts ?? [];
  const accAccounts = useMemo(
    () =>
      (accData?.clubAccountingAccounts ?? []).filter((a) => a.isActive),
    [accData],
  );

  const onRefresh = () => {
    void refetchFin();
    void refetchAcc();
  };

  return (
    <ScreenContainer
      padding={0}
      onRefresh={onRefresh}
      refreshing={finLoading || accLoading}
    >
      <ScreenHero
        eyebrow="PARAMÈTRES"
        title="Réglages comptabilité"
        subtitle="Comptes financiers & plan comptable"
        compact
        showBack
      />

      <Card
        title="Comptes financiers"
        subtitle={`${finAccounts.length} compte(s)`}
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        {finAccounts.length === 0 ? (
          <Text style={styles.empty}>
            {finLoading ? 'Chargement…' : 'Aucun compte financier configuré.'}
          </Text>
        ) : (
          <View style={styles.list}>
            {finAccounts.map((a) => (
              <View key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {a.label}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {FIN_KIND_LABEL[a.kind] ?? a.kind} ·{' '}
                    {a.accountingAccountCode}
                  </Text>
                </View>
                {a.isDefault ? (
                  <Pill label="Par défaut" tone="primary" />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card
        title="Plan comptable"
        subtitle={`${accAccounts.length} compte(s) actif(s)`}
        style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
      >
        {accAccounts.length === 0 ? (
          <Text style={styles.empty}>
            {accLoading ? 'Chargement…' : 'Plan comptable vide.'}
          </Text>
        ) : (
          <View style={styles.list}>
            {accAccounts.map((a) => (
              <View key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {a.code} · {a.label}
                  </Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {ACC_KIND_LABEL[a.kind] ?? a.kind}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  rowSubtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  empty: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
