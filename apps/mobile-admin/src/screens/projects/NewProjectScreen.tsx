import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_PROJECTS,
  CREATE_CLUB_PROJECT,
} from '../../lib/documents/projects';
import { frDateToIso } from '../../lib/forms';
import type { ProjectsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ProjectsStackParamList, 'NewProject'>;

export function NewProjectScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [budgetEuros, setBudgetEuros] = useState('');

  const [createProject, { loading }] = useMutation(CREATE_CLUB_PROJECT, {
    refetchQueries: [{ query: CLUB_PROJECTS }],
  });

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1) {
      Alert.alert('Champ manquant', 'Le titre est obligatoire.');
      return;
    }

    let startsAtIso: string | undefined = undefined;
    if (startsAt.trim().length > 0) {
      const parsed = frDateToIso(startsAt);
      if (!parsed) {
        Alert.alert(
          'Date invalide',
          'Date de début au format JJ/MM/AAAA.',
        );
        return;
      }
      startsAtIso = parsed;
    }

    let endsAtIso: string | undefined = undefined;
    if (endsAt.trim().length > 0) {
      const parsed = frDateToIso(endsAt);
      if (!parsed) {
        Alert.alert(
          'Date invalide',
          'Date de fin au format JJ/MM/AAAA.',
        );
        return;
      }
      endsAtIso = parsed;
    }

    let budgetCents: number | undefined = undefined;
    const budgetParsed = budgetEuros.trim();
    if (budgetParsed.length > 0) {
      const num = Number(budgetParsed.replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) {
        Alert.alert('Budget invalide', 'Le budget doit être un montant positif.');
        return;
      }
      budgetCents = Math.round(num * 100);
    }

    try {
      await createProject({
        variables: {
          input: {
            title: trimmedTitle,
            summary:
              summary.trim().length > 0 ? summary.trim() : undefined,
            description:
              description.trim().length > 0 ? description.trim() : undefined,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
            budgetPlannedCents: budgetCents,
          },
        },
      });
      Alert.alert('Projet créé', 'Le projet a bien été enregistré.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer le projet.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouveau projet"
        subtitle="Saison, événement long-terme…"
        showBack
        compact
      />
      <View style={styles.body}>
        <Card title="Présentation">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Saison 2026, Tournoi annuel…"
              autoCapitalize="sentences"
            />
            <TextField
              label="Résumé"
              value={summary}
              onChangeText={setSummary}
              placeholder="Phrase courte affichée dans la liste"
              multiline
              numberOfLines={2}
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Objectifs, contexte, particularités…"
              multiline
              numberOfLines={5}
            />
          </View>
        </Card>

        <Card title="Période">
          <View style={styles.fields}>
            <Text style={styles.subhead}>Dates au format JJ/MM/AAAA</Text>
            <View style={styles.row}>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Début"
                  value={startsAt}
                  onChangeText={setStartsAt}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Fin"
                  value={endsAt}
                  onChangeText={setEndsAt}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </View>
        </Card>

        <Card title="Budget">
          <View style={styles.fields}>
            <TextField
              label="Budget prévu (€)"
              value={budgetEuros}
              onChangeText={setBudgetEuros}
              placeholder="0,00"
              keyboardType="decimal-pad"
              hint="Optionnel — peut être ajusté plus tard."
            />
          </View>
        </Card>

        <Button
          label="Créer le projet"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={loading}
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
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  fields: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  rowFlex1: { flex: 1 },
  subhead: { ...typography.smallStrong, color: palette.muted },
});
