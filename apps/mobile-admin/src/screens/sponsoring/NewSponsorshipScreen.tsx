import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  spacing,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { CREATE_CLUB_SPONSORSHIP_DEAL } from '../../lib/documents/sponsoring';
import type { SponsoringStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<
  SponsoringStackParamList,
  'NewSponsorship'
>;

type Kind = 'CASH' | 'IN_KIND';

const KIND_OPTIONS: { key: Kind; label: string }[] = [
  { key: 'CASH', label: 'Numéraire' },
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

export function NewSponsorshipScreen() {
  const navigation = useNavigation<Nav>();

  const [sponsorName, setSponsorName] = useState('');
  const [kind, setKind] = useState<Kind>('CASH');
  const [amount, setAmount] = useState('');
  const [inKindDescription, setInKindDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');

  const [createDeal, { loading: submitting }] = useMutation(
    CREATE_CLUB_SPONSORSHIP_DEAL,
  );

  const onSubmit = async () => {
    if (!sponsorName.trim()) {
      Alert.alert('Champ requis', 'Le nom du sponsor est obligatoire.');
      return;
    }

    let valueCents: number | null = null;
    if (kind === 'CASH') {
      valueCents = eurosToCents(amount);
      if (valueCents == null || valueCents <= 0) {
        Alert.alert('Montant invalide', 'Saisissez un montant > 0.');
        return;
      }
    } else if (!inKindDescription.trim()) {
      Alert.alert(
        'Description requise',
        'Décrivez le don en nature (ex: 10 maillots).',
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

    try {
      await createDeal({
        variables: {
          input: {
            sponsorName: sponsorName.trim(),
            kind,
            valueCents: kind === 'CASH' ? valueCents : undefined,
            inKindDescription:
              kind === 'IN_KIND' ? inKindDescription.trim() : undefined,
            startsAt: startsIso ? new Date(startsIso).toISOString() : undefined,
            endsAt: endsIso ? new Date(endsIso).toISOString() : undefined,
            notes: notes.trim() ? notes.trim() : undefined,
          },
        },
      });
      Alert.alert(
        'Convention créée',
        'La convention de sponsoring a été enregistrée.',
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
        eyebrow="NOUVEAU SPONSOR"
        title="Convention de sponsoring"
        compact
        showBack
      />

      <View style={styles.body}>
        <Card title="Sponsor">
          <View style={styles.fields}>
            <TextField
              label="Nom du sponsor"
              value={sponsorName}
              onChangeText={setSponsorName}
              placeholder="Ex : Boulangerie Martin"
            />
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
          </View>
        </Card>

        {kind === 'CASH' ? (
          <Card title="Montant">
            <TextField
              label="Valeur (€)"
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              keyboardType="decimal-pad"
            />
          </Card>
        ) : (
          <Card title="Don en nature">
            <TextField
              label="Description"
              value={inKindDescription}
              onChangeText={setInKindDescription}
              placeholder="Ex : 10 maillots floqués"
              multiline
              numberOfLines={4}
            />
          </Card>
        )}

        <Card title="Période">
          <View style={styles.fields}>
            <TextField
              label="Date de début (JJ/MM/AAAA)"
              value={startsAt}
              onChangeText={setStartsAt}
              placeholder="01/09/2026"
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label="Date de fin (JJ/MM/AAAA)"
              value={endsAt}
              onChangeText={setEndsAt}
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
            placeholder="Conditions particulières, contreparties…"
            multiline
            numberOfLines={4}
          />
        </Card>

        <Button
          label="Créer"
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
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
