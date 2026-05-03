import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  GradientButton,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_SURVEYS,
  CREATE_CLUB_SURVEY,
} from '../../lib/documents/club-life';
import type { ClubLifeStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ClubLifeStackParamList, 'NewSurvey'>;

/** Convertit "JJ/MM/AAAA" → "AAAA-MM-JJ" (ISO date) ; null si invalide. */
function parseFrDate(s: string): string | null {
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export function NewSurveyScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multipleChoice, setMultipleChoice] = useState(false);
  const [allowAnonymous, setAllowAnonymous] = useState(false);
  const [publishNow, setPublishNow] = useState(true);

  const [createSurvey, { loading: creating }] = useMutation(
    CREATE_CLUB_SURVEY,
    {
      refetchQueries: [{ query: CLUB_SURVEYS }],
    },
  );

  const setOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const addOption = () => {
    if (options.length >= 20) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async () => {
    if (title.trim().length === 0) {
      Alert.alert('Champ requis', 'Le titre du sondage est obligatoire.');
      return;
    }
    const cleanedOptions = options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (cleanedOptions.length < 2) {
      Alert.alert(
        'Options insuffisantes',
        'Renseignez au moins 2 options non vides.',
      );
      return;
    }

    let closesAtIso: string | null = null;
    if (closesAt.trim().length > 0) {
      const parsed = parseFrDate(closesAt);
      if (!parsed) {
        Alert.alert(
          'Date invalide',
          'La date de clôture doit être au format JJ/MM/AAAA.',
        );
        return;
      }
      closesAtIso = parsed;
    }

    try {
      const input: Record<string, unknown> = {
        title: title.trim(),
        options: cleanedOptions,
        multipleChoice,
        allowAnonymous,
        publishNow,
      };
      if (description.trim().length > 0) {
        input.description = description.trim();
      }
      if (closesAtIso) {
        input.closesAt = closesAtIso;
      }
      await createSurvey({ variables: { input } });
      Alert.alert(
        'Sondage créé',
        publishNow
          ? 'Le sondage a été ouvert aux votes.'
          : 'Le brouillon a été enregistré.',
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error
          ? err.message
          : 'Impossible de créer le sondage.',
      );
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouveau sondage"
        showBack
        compact
      />

      <View style={styles.content}>
        <Card title="Question">
          <View style={styles.stack}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex : Quel jour pour le stage de mai ?"
              maxLength={200}
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Précisez le contexte si besoin."
              multiline
              numberOfLines={4}
              maxLength={5000}
            />
            <TextField
              label="Date de clôture (optionnel)"
              value={closesAt}
              onChangeText={setClosesAt}
              placeholder="JJ/MM/AAAA"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Card>

        <Card title="Options de vote">
          <View style={styles.stack}>
            {options.map((opt, idx) => (
              <View key={idx} style={styles.optionRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    value={opt}
                    onChangeText={(v) => setOption(idx, v)}
                    placeholder={`Option ${idx + 1}`}
                  />
                </View>
                {options.length > 2 ? (
                  <Pressable
                    onPress={() => removeOption(idx)}
                    style={({ pressed }) => [
                      styles.removeBtn,
                      pressed && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Retirer cette option"
                  >
                    <Ionicons name="close" size={18} color={palette.danger} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < 20 ? (
              <Button
                label="Ajouter une option"
                icon="add-outline"
                variant="ghost"
                onPress={addOption}
                fullWidth
                size="sm"
              />
            ) : null}
          </View>
        </Card>

        <Card title="Options">
          <View style={styles.optionsRow}>
            <View style={styles.optionLabel}>
              <Text style={styles.optionTitle}>Choix multiples</Text>
              <Text style={styles.optionHint}>
                Permet de cocher plusieurs réponses.
              </Text>
            </View>
            <Pill
              label={multipleChoice ? 'Activé' : 'Désactivé'}
              tone={multipleChoice ? 'primary' : 'neutral'}
              icon={
                multipleChoice ? 'checkbox-outline' : 'square-outline'
              }
              onPress={() => setMultipleChoice((v) => !v)}
            />
          </View>

          <View style={[styles.optionsRow, styles.optionsRowBordered]}>
            <View style={styles.optionLabel}>
              <Text style={styles.optionTitle}>Vote anonyme</Text>
              <Text style={styles.optionHint}>
                Cache l'identité des votants dans les résultats.
              </Text>
            </View>
            <Pill
              label={allowAnonymous ? 'Anonyme' : 'Nominatif'}
              tone={allowAnonymous ? 'info' : 'neutral'}
              icon={allowAnonymous ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setAllowAnonymous((v) => !v)}
            />
          </View>

          <View style={[styles.optionsRow, styles.optionsRowBordered]}>
            <View style={styles.optionLabel}>
              <Text style={styles.optionTitle}>Publication</Text>
              <Text style={styles.optionHint}>
                Ouvrir le sondage immédiatement.
              </Text>
            </View>
            <Pill
              label={publishNow ? 'Ouvrir' : 'Brouillon'}
              tone={publishNow ? 'success' : 'neutral'}
              icon={publishNow ? 'send' : 'document-outline'}
              onPress={() => setPublishNow((v) => !v)}
            />
          </View>
        </Card>

        <GradientButton
          label={creating ? 'Création…' : 'Créer le sondage'}
          onPress={() => void onSubmit()}
          loading={creating}
          disabled={creating}
          iconRight="arrow-forward"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  stack: { gap: spacing.md },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  optionsRowBordered: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  optionLabel: { flex: 1, gap: 2 },
  optionTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  optionHint: {
    ...typography.small,
    color: palette.muted,
  },
});
