import { useMutation } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  formatEuroCents,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CREATE_CLUB_ACCOUNTING_ENTRY_QUICK } from '../../lib/documents/accounting';
import type { AccountingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'NewQuickEntry'>;

type EntryKind = 'INCOME' | 'EXPENSE';

type ArticleRow = {
  uid: string;
  label: string;
  amount: string; // euros input
};

const KIND_OPTIONS: { key: EntryKind; label: string }[] = [
  { key: 'EXPENSE', label: 'Dépense' },
  { key: 'INCOME', label: 'Recette' },
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

function newUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function NewQuickEntryScreen() {
  const navigation = useNavigation<Nav>();

  const [kind, setKind] = useState<EntryKind>('EXPENSE');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(todayFr());
  const [articles, setArticles] = useState<ArticleRow[]>([
    { uid: newUid(), label: '', amount: '' },
  ]);

  const [createQuick, { loading: submitting }] = useMutation(
    CREATE_CLUB_ACCOUNTING_ENTRY_QUICK,
  );

  const totalCents = useMemo(() => eurosToCents(amount) ?? 0, [amount]);
  const articlesSumCents = useMemo(
    () =>
      articles.reduce((acc, a) => acc + (eurosToCents(a.amount) ?? 0), 0),
    [articles],
  );

  const sumMatches =
    totalCents > 0 && Math.abs(totalCents - articlesSumCents) <= 1;
  const showSumWarning =
    totalCents > 0 && articlesSumCents > 0 && !sumMatches;

  const addArticle = () => {
    setArticles((prev) => [
      ...prev,
      { uid: newUid(), label: '', amount: '' },
    ]);
  };

  const removeArticle = (uid: string) => {
    setArticles((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((a) => a.uid !== uid);
    });
  };

  const updateArticle = (
    uid: string,
    patch: Partial<Omit<ArticleRow, 'uid'>>,
  ) => {
    setArticles((prev) =>
      prev.map((a) => (a.uid === uid ? { ...a, ...patch } : a)),
    );
  };

  const onSubmit = async () => {
    if (!label.trim()) {
      Alert.alert('Champ requis', 'Indiquez un libellé global.');
      return;
    }
    const amountCents = eurosToCents(amount);
    if (amountCents == null || amountCents <= 0) {
      Alert.alert(
        'Montant invalide',
        'Saisissez un montant total en euros (ex: 12.50).',
      );
      return;
    }

    const cleanArticles = articles
      .map((a) => ({
        label: a.label.trim(),
        amountCents: eurosToCents(a.amount),
      }))
      .filter(
        (a): a is { label: string; amountCents: number } =>
          a.label.length > 0 && a.amountCents != null && a.amountCents > 0,
      );

    if (cleanArticles.length === 0) {
      Alert.alert(
        'Articles requis',
        'Ajoutez au moins un article avec libellé et montant.',
      );
      return;
    }

    const sum = cleanArticles.reduce((acc, a) => acc + a.amountCents, 0);
    if (Math.abs(sum - amountCents) > 1) {
      Alert.alert(
        'Total incohérent',
        `La somme des articles (${formatEuroCents(sum)}) ne correspond pas au montant total (${formatEuroCents(amountCents)}).`,
      );
      return;
    }

    const iso = occurredAt ? parseFrDate(occurredAt) : null;
    if (occurredAt && !iso) {
      Alert.alert('Date invalide', 'Format attendu : JJ/MM/AAAA.');
      return;
    }

    try {
      await createQuick({
        variables: {
          input: {
            kind,
            label: label.trim(),
            amountCents,
            occurredAt: iso ? new Date(iso).toISOString() : undefined,
            articles: cleanArticles.map((a) => ({
              label: a.label,
              amountCents: a.amountCents,
            })),
          },
        },
      });
      Alert.alert(
        'Catégorisation IA en cours',
        "L'écriture apparaît dans la file de revue. L'IA finalise la catégorisation en arrière-plan.",
      );
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Création impossible.';
      Alert.alert('Erreur', msg);
    }
  };

  return (
    <ScreenContainer keyboardAvoiding padding={0}>
      <ScreenHero
        eyebrow="SAISIE RAPIDE IA"
        title="Nouvelle facture"
        subtitle="L'IA catégorise chaque article"
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
                  onPress={() => setKind(opt.key)}
                />
              );
            })}
          </View>
        </Card>

        <Card title="Détails">
          <View style={styles.fields}>
            <TextField
              label="Intitulé global"
              value={label}
              onChangeText={setLabel}
              placeholder="Ex : Facture Dell 02/2026"
            />
            <TextField
              label="Montant total (€)"
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

        <Card
          title="Articles"
          subtitle={`${articles.length} ligne${articles.length > 1 ? 's' : ''}`}
          headerRight={
            <Pill
              label={`Σ ${formatEuroCents(articlesSumCents)}`}
              tone={
                articlesSumCents === 0
                  ? 'neutral'
                  : sumMatches
                    ? 'success'
                    : 'warning'
              }
            />
          }
        >
          <View style={styles.articlesList}>
            {articles.map((a, idx) => (
              <View key={a.uid} style={styles.articleRow}>
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <TextField
                    label={`Article ${idx + 1}`}
                    value={a.label}
                    onChangeText={(v) => updateArticle(a.uid, { label: v })}
                    placeholder="Libellé"
                  />
                  <TextField
                    label="Montant (€)"
                    value={a.amount}
                    onChangeText={(v) => updateArticle(a.uid, { amount: v })}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                  />
                </View>
                <Pressable
                  onPress={() => removeArticle(a.uid)}
                  disabled={articles.length <= 1}
                  style={({ pressed }) => [
                    styles.removeBtn,
                    pressed && { opacity: 0.5 },
                    articles.length <= 1 && { opacity: 0.3 },
                  ]}
                  accessibilityLabel="Supprimer l'article"
                >
                  <Ionicons name="close" size={18} color={palette.danger} />
                </Pressable>
              </View>
            ))}
            {showSumWarning ? (
              <Text style={styles.warningText}>
                La somme des articles ne correspond pas au montant total.
              </Text>
            ) : null}
            <Button
              label="Ajouter un article"
              variant="ghost"
              icon="add-circle-outline"
              size="sm"
              onPress={addArticle}
            />
          </View>
        </Card>

        <Button
          label="Soumettre à l'IA"
          variant="primary"
          icon="sparkles-outline"
          onPress={() => void onSubmit()}
          loading={submitting}
          fullWidth
        />
      </View>
    </ScreenContainer>
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
  articlesList: {
    gap: spacing.md,
  },
  articleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22, // align with the first input under the label
  },
  warningText: {
    ...typography.small,
    color: palette.warningText,
  },
});
