import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
  type BottomAction,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_ACCOUNTING_ACCOUNTS,
  CLUB_FINANCIAL_ACCOUNTS,
  CREATE_CLUB_ACCOUNTING_ENTRY,
} from '../../lib/documents/accounting';
import type { AccountingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<
  AccountingStackParamList,
  'NewManualEntry'
>;

type EntryKind = 'INCOME' | 'EXPENSE' | 'IN_KIND';

type AccountingAccount = {
  id: string;
  code: string;
  label: string;
  kind: 'INCOME' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'IN_KIND';
  isActive: boolean;
};

type FinancialAccount = {
  id: string;
  label: string;
  kind: string;
  isActive: boolean;
  isDefault: boolean;
  accountingAccountCode: string | null;
};

type AccountsData = { clubAccountingAccounts: AccountingAccount[] };
type FinancialData = { clubFinancialAccounts: FinancialAccount[] };

const KIND_OPTIONS: { key: EntryKind; label: string }[] = [
  { key: 'INCOME', label: 'Recette' },
  { key: 'EXPENSE', label: 'Dépense' },
  { key: 'IN_KIND', label: 'Don nature' },
];

function parseFrDate(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function eurosToCents(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed.replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

function todayFr(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function NewManualEntryScreen() {
  const navigation = useNavigation<Nav>();

  const [kind, setKind] = useState<EntryKind>('EXPENSE');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [accountCode, setAccountCode] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(todayFr());
  const [financialAccountId, setFinancialAccountId] = useState<string | null>(
    null,
  );
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [financialPickerOpen, setFinancialPickerOpen] = useState(false);

  const { data: accountsData } = useQuery<AccountsData>(
    CLUB_ACCOUNTING_ACCOUNTS,
    { errorPolicy: 'all' },
  );
  const { data: financialData } = useQuery<FinancialData>(
    CLUB_FINANCIAL_ACCOUNTS,
    { errorPolicy: 'all' },
  );

  const [createEntry, { loading: submitting }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY,
  );

  // Filtre les comptes selon le kind sélectionné
  const filteredAccounts = useMemo(() => {
    const all = accountsData?.clubAccountingAccounts ?? [];
    return all
      .filter((a) => a.isActive)
      .filter((a) => {
        if (kind === 'INCOME') return a.kind === 'INCOME';
        if (kind === 'EXPENSE') return a.kind === 'EXPENSE';
        if (kind === 'IN_KIND') return a.kind === 'IN_KIND';
        return true;
      });
  }, [accountsData, kind]);

  const selectedAccount = useMemo(
    () =>
      accountsData?.clubAccountingAccounts.find((a) => a.code === accountCode) ??
      null,
    [accountsData, accountCode],
  );

  const financialAccounts = useMemo(
    () =>
      (financialData?.clubFinancialAccounts ?? []).filter((f) => f.isActive),
    [financialData],
  );

  const selectedFinancial = useMemo(
    () =>
      financialAccounts.find((f) => f.id === financialAccountId) ?? null,
    [financialAccounts, financialAccountId],
  );

  const accountActions: BottomAction[] = useMemo(
    () =>
      filteredAccounts.map((a) => ({
        key: a.code,
        label: `${a.code} – ${a.label}`,
        icon: 'pricetag-outline' as const,
      })),
    [filteredAccounts],
  );

  const financialActions: BottomAction[] = useMemo(
    () =>
      financialAccounts.map((f) => ({
        key: f.id,
        label: f.label + (f.isDefault ? ' (défaut)' : ''),
        icon: 'wallet-outline' as const,
      })),
    [financialAccounts],
  );

  const onChangeKind = (next: EntryKind) => {
    setKind(next);
    // Reset compte si l'ancien n'est plus compatible
    setAccountCode(null);
  };

  const onSubmit = async () => {
    if (!label.trim()) {
      Alert.alert('Champ requis', 'Indiquez un libellé.');
      return;
    }
    const amountCents = eurosToCents(amount);
    if (amountCents == null) {
      Alert.alert('Montant invalide', 'Saisissez un montant en euros (ex: 12.50).');
      return;
    }
    if (!accountCode) {
      Alert.alert('Compte requis', 'Choisissez un compte comptable.');
      return;
    }
    const iso = occurredAt ? parseFrDate(occurredAt) : null;
    if (occurredAt && !iso) {
      Alert.alert('Date invalide', 'Format attendu : JJ/MM/AAAA.');
      return;
    }

    try {
      await createEntry({
        variables: {
          input: {
            kind,
            label: label.trim(),
            amountCents,
            accountCode,
            occurredAt: iso ? new Date(iso).toISOString() : undefined,
            financialAccountId: financialAccountId ?? undefined,
          },
        },
      });
      Alert.alert('Écriture créée', 'L\'écriture a été enregistrée.');
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Création impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  return (
    <ScreenContainer keyboardAvoiding padding={0}>
      <ScreenHero
        eyebrow="SAISIE MANUELLE"
        title="Nouvelle écriture"
        subtitle="Compte + montant + libellé"
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Type d'écriture">
          <View style={styles.pillRow}>
            {KIND_OPTIONS.map((opt) => {
              const active = kind === opt.key;
              return (
                <Pill
                  key={opt.key}
                  label={opt.label}
                  tone={active ? 'primary' : 'neutral'}
                  onPress={() => onChangeKind(opt.key)}
                />
              );
            })}
          </View>
        </Card>

        <Card title="Détails">
          <View style={styles.fields}>
            <TextField
              label="Libellé"
              value={label}
              onChangeText={setLabel}
              placeholder="Ex : Achat fournitures bureau"
            />
            <TextField
              label="Montant (€)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
            <TextField
              label="Date (JJ/MM/AAAA)"
              value={occurredAt}
              onChangeText={setOccurredAt}
              placeholder="01/01/2026"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Card>

        <Card title="Imputation">
          <View style={styles.fields}>
            <PickerRow
              label="Compte comptable"
              valueLabel={
                selectedAccount
                  ? `${selectedAccount.code} – ${selectedAccount.label}`
                  : null
              }
              placeholder="Choisir un compte…"
              onPress={() => setAccountPickerOpen(true)}
              disabled={accountActions.length === 0}
              hint={
                accountActions.length === 0
                  ? 'Aucun compte disponible pour ce type.'
                  : undefined
              }
            />
            <PickerRow
              label="Compte financier"
              valueLabel={selectedFinancial?.label ?? null}
              placeholder="Choisir banque/caisse (optionnel)"
              onPress={() => setFinancialPickerOpen(true)}
              disabled={financialActions.length === 0}
            />
          </View>
        </Card>

        <Button
          label="Créer l'écriture"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={() => void onSubmit()}
          loading={submitting}
          fullWidth
        />
      </View>

      <BottomActionBar
        visible={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        title="Compte comptable"
        actions={accountActions}
        onAction={(key) => {
          setAccountCode(key);
          setAccountPickerOpen(false);
        }}
      />
      <BottomActionBar
        visible={financialPickerOpen}
        onClose={() => setFinancialPickerOpen(false)}
        title="Compte financier"
        actions={financialActions}
        onAction={(key) => {
          setFinancialAccountId(key);
          setFinancialPickerOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

function PickerRow({
  label,
  valueLabel,
  placeholder,
  onPress,
  disabled,
  hint,
}: {
  label: string;
  valueLabel: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.pickerInput,
          pressed && { opacity: 0.7 },
          disabled && { opacity: 0.4 },
        ]}
      >
        <Text
          style={[
            styles.pickerValue,
            !valueLabel && { color: palette.mutedSoft },
          ]}
          numberOfLines={1}
        >
          {valueLabel ?? placeholder}
        </Text>
      </Pressable>
      {hint ? <Text style={styles.pickerHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  fields: {
    gap: spacing.md,
  },
  pickerLabel: {
    ...typography.smallStrong,
    color: palette.body,
  },
  pickerInput: {
    minHeight: 48,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  pickerValue: {
    ...typography.body,
    color: palette.ink,
  },
  pickerHint: {
    ...typography.small,
    color: palette.muted,
  },
});
