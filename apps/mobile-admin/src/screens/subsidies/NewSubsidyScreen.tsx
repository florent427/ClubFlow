import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  ScreenContainer,
  ScreenHero,
  TextField,
  spacing,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CREATE_CLUB_GRANT_APPLICATION } from '../../lib/documents/subsidies';
import type { SubsidiesStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SubsidiesStackParamList, 'NewSubsidy'>;

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

export function NewSubsidyScreen() {
  const navigation = useNavigation<Nav>();

  const [title, setTitle] = useState('');
  const [fundingBody, setFundingBody] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reportDueAt, setReportDueAt] = useState('');
  const [notes, setNotes] = useState('');

  const [createGrant, { loading: submitting }] = useMutation(
    CREATE_CLUB_GRANT_APPLICATION,
  );

  const onSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Champ requis', 'Le titre du dossier est obligatoire.');
      return;
    }
    const requestedCents = eurosToCents(requestedAmount);
    if (requestedCents == null || requestedCents <= 0) {
      Alert.alert(
        'Montant invalide',
        'Saisissez un montant demandé en euros (ex: 1500).',
      );
      return;
    }
    const startsIso = startsAt ? parseFrDate(startsAt) : null;
    if (startsAt && !startsIso) {
      Alert.alert('Date début invalide', 'Format attendu : JJ/MM/AAAA.');
      return;
    }
    const endsIso = endsAt ? parseFrDate(endsAt) : null;
    if (endsAt && !endsIso) {
      Alert.alert('Date fin invalide', 'Format attendu : JJ/MM/AAAA.');
      return;
    }
    const reportIso = reportDueAt ? parseFrDate(reportDueAt) : null;
    if (reportDueAt && !reportIso) {
      Alert.alert(
        'Date de bilan invalide',
        'Format attendu : JJ/MM/AAAA.',
      );
      return;
    }

    try {
      await createGrant({
        variables: {
          input: {
            title: title.trim(),
            fundingBody: fundingBody.trim() ? fundingBody.trim() : undefined,
            requestedAmountCents: requestedCents,
            startsAt: startsIso ? new Date(startsIso).toISOString() : undefined,
            endsAt: endsIso ? new Date(endsIso).toISOString() : undefined,
            reportDueAt: reportIso
              ? new Date(reportIso).toISOString()
              : undefined,
            notes: notes.trim() ? notes.trim() : undefined,
          },
        },
      });
      Alert.alert(
        'Dossier créé',
        'La demande de subvention a été enregistrée.',
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
        eyebrow="NOUVELLE SUBVENTION"
        title="Demande"
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Dossier">
          <View style={styles.fields}>
            <TextField
              label="Titre"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex : Subvention équipement 2026"
            />
            <TextField
              label="Organisme financeur"
              value={fundingBody}
              onChangeText={setFundingBody}
              placeholder="Ex : Mairie, Région, ANS"
            />
            <TextField
              label="Montant demandé (€)"
              value={requestedAmount}
              onChangeText={setRequestedAmount}
              placeholder="1500,00"
              keyboardType="decimal-pad"
            />
          </View>
        </Card>

        <Card title="Calendrier">
          <View style={styles.fields}>
            <TextField
              label="Début de la période (JJ/MM/AAAA)"
              value={startsAt}
              onChangeText={setStartsAt}
              placeholder="01/01/2026"
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label="Fin de la période (JJ/MM/AAAA)"
              value={endsAt}
              onChangeText={setEndsAt}
              placeholder="31/12/2026"
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label="Date butoir du bilan (JJ/MM/AAAA)"
              value={reportDueAt}
              onChangeText={setReportDueAt}
              placeholder="30/06/2027"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Card>

        <Card title="Notes">
          <TextField
            label="Commentaires (optionnel)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Pièces requises, contacts, conditions…"
            multiline
            numberOfLines={5}
          />
        </Card>

        <Button
          label="Créer le dossier"
          variant="primary"
          icon="checkmark-circle-outline"
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
  fields: {
    gap: spacing.md,
  },
});
