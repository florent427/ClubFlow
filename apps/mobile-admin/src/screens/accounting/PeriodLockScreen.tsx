import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  LOCK_ACCOUNTING_MONTH,
  UNLOCK_ACCOUNTING_MONTH,
} from '../../lib/documents/accounting';

const FRENCH_MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

function buildLast12Months(): { key: string; label: string }[] {
  const now = new Date();
  const list: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    list.push({
      key: `${yyyy}-${mm}`,
      label: `${FRENCH_MONTHS[d.getMonth()]} ${yyyy}`,
    });
  }
  return list;
}

export function PeriodLockScreen() {
  const months = useMemo(buildLast12Months, []);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [busyMonth, setBusyMonth] = useState<string | null>(null);

  const [lockMonth] = useMutation(LOCK_ACCOUNTING_MONTH);
  const [unlockMonth] = useMutation(UNLOCK_ACCOUNTING_MONTH);

  async function onToggle(monthKey: string, currentlyLocked: boolean) {
    setBusyMonth(monthKey);
    try {
      if (currentlyLocked) {
        await unlockMonth({ variables: { month: monthKey } });
        setLocked((prev) => ({ ...prev, [monthKey]: false }));
        Alert.alert('Période déverrouillée', `${monthKey} est à nouveau modifiable.`);
      } else {
        await lockMonth({ variables: { month: monthKey } });
        setLocked((prev) => ({ ...prev, [monthKey]: true }));
        Alert.alert('Période verrouillée', `${monthKey} ne peut plus être modifiée.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      Alert.alert('Erreur', msg);
    } finally {
      setBusyMonth(null);
    }
  }

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="VERROU"
        title="Verrouillage mensuel"
        subtitle="Geler une période pour empêcher toute modification"
        compact
        showBack
      />
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <Text style={styles.intro}>
          Une fois verrouillé, un mois devient en lecture seule. Les écritures
          existantes restent consultables mais ne peuvent plus être modifiées.
        </Text>
      </Card>
      <View style={styles.list}>
        {months.map((m) => {
          const isLocked = locked[m.key] === true;
          return (
            <View key={m.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.monthLabel}>{m.label}</Text>
                <Text style={styles.monthKey}>{m.key}</Text>
              </View>
              <Button
                label={isLocked ? 'Déverrouiller' : 'Verrouiller'}
                variant={isLocked ? 'ghost' : 'primary'}
                size="sm"
                icon={isLocked ? 'lock-open-outline' : 'lock-closed-outline'}
                onPress={() => void onToggle(m.key, isLocked)}
                loading={busyMonth === m.key}
              />
            </View>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...typography.small,
    color: palette.muted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  monthLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  monthKey: {
    ...typography.small,
    color: palette.muted,
  },
});
