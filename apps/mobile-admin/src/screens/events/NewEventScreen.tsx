import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
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
import { CLUB_EVENTS, CREATE_CLUB_EVENT } from '../../lib/documents/events';
import { frDateTimeToIso, frDateToIso } from '../../lib/forms';
import type { EventsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<EventsStackParamList, 'NewEvent'>;

export function NewEventScreen() {
  const navigation = useNavigation<Nav>();

  // Card "Informations"
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  // Card "Quand"
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Card "Inscriptions"
  const [capacity, setCapacity] = useState('');
  const [priceEuros, setPriceEuros] = useState('');
  const [registrationOpensAt, setRegistrationOpensAt] = useState('');
  const [registrationClosesAt, setRegistrationClosesAt] = useState('');
  const [allowContactRegistration, setAllowContactRegistration] = useState(false);
  const [publishNow, setPublishNow] = useState(true);

  const [createEvent, { loading }] = useMutation(CREATE_CLUB_EVENT, {
    refetchQueries: [{ query: CLUB_EVENTS }],
  });

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 1) {
      Alert.alert('Champs manquants', 'Le titre est obligatoire.');
      return;
    }
    const startsAt = frDateTimeToIso(startDate, startTime);
    const endsAt = frDateTimeToIso(endDate, endTime);
    if (!startsAt || !endsAt) {
      Alert.alert(
        'Dates invalides',
        'Vérifie le format JJ/MM/AAAA pour la date et HH:MM pour l\'heure.',
      );
      return;
    }

    const capN = capacity.trim().length === 0 ? null : Number(capacity.trim());
    if (capN != null && (!Number.isFinite(capN) || capN < 0)) {
      Alert.alert('Capacité invalide', 'La capacité doit être un entier positif.');
      return;
    }

    const priceParsed = priceEuros.trim();
    let priceCents: number | null = null;
    if (priceParsed.length > 0) {
      const num = Number(priceParsed.replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) {
        Alert.alert('Tarif invalide', 'Le tarif doit être un montant positif.');
        return;
      }
      priceCents = Math.round(num * 100);
    }

    let registrationOpensIso: string | null | undefined = undefined;
    if (registrationOpensAt.trim().length > 0) {
      registrationOpensIso = frDateToIso(registrationOpensAt);
      if (!registrationOpensIso) {
        Alert.alert(
          'Date invalide',
          'Date d\'ouverture des inscriptions au format JJ/MM/AAAA.',
        );
        return;
      }
    }
    let registrationClosesIso: string | null | undefined = undefined;
    if (registrationClosesAt.trim().length > 0) {
      registrationClosesIso = frDateToIso(registrationClosesAt);
      if (!registrationClosesIso) {
        Alert.alert(
          'Date invalide',
          'Date de fermeture des inscriptions au format JJ/MM/AAAA.',
        );
        return;
      }
    }

    try {
      await createEvent({
        variables: {
          input: {
            title: trimmedTitle,
            description: description.trim().length > 0 ? description.trim() : undefined,
            location: location.trim().length > 0 ? location.trim() : undefined,
            startsAt,
            endsAt,
            capacity: capN ?? undefined,
            priceCents: priceCents ?? undefined,
            registrationOpensAt: registrationOpensIso,
            registrationClosesAt: registrationClosesIso,
            allowContactRegistration,
            publishNow,
          },
        },
      });
      Alert.alert('Événement créé', 'L\'événement a bien été enregistré.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer l\'événement.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouvel événement"
        subtitle="Stage, compétition, rassemblement…"
        showBack
        compact
      />
      <View style={styles.body}>
        <Card title="Informations">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Tournoi régional, stage d'été…"
              autoCapitalize="sentences"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Programme, infos pratiques…"
              multiline
              numberOfLines={4}
            />
            <TextField
              label="Lieu"
              value={location}
              onChangeText={setLocation}
              placeholder="Salle, ville, adresse"
            />
          </View>
        </Card>

        <Card title="Quand">
          <View style={styles.fields}>
            <Text style={styles.subhead}>Début</Text>
            <View style={styles.row}>
              <View style={styles.rowFlex2}>
                <TextField
                  label="Date"
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Heure"
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={styles.subhead}>Fin</Text>
            <View style={styles.row}>
              <View style={styles.rowFlex2}>
                <TextField
                  label="Date"
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="JJ/MM/AAAA"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Heure"
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="HH:MM"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          </View>
        </Card>

        <Card title="Inscriptions">
          <View style={styles.fields}>
            <View style={styles.row}>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Capacité"
                  value={capacity}
                  onChangeText={setCapacity}
                  placeholder="Illimitée si vide"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.rowFlex1}>
                <TextField
                  label="Tarif (€)"
                  value={priceEuros}
                  onChangeText={setPriceEuros}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <TextField
              label="Ouverture des inscriptions"
              value={registrationOpensAt}
              onChangeText={setRegistrationOpensAt}
              placeholder="JJ/MM/AAAA"
              keyboardType="numbers-and-punctuation"
            />
            <TextField
              label="Fermeture des inscriptions"
              value={registrationClosesAt}
              onChangeText={setRegistrationClosesAt}
              placeholder="JJ/MM/AAAA"
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.pillsRow}>
              <Pill
                label={
                  allowContactRegistration
                    ? 'Contacts autorisés'
                    : 'Contacts non autorisés'
                }
                tone={allowContactRegistration ? 'success' : 'neutral'}
                icon={
                  allowContactRegistration
                    ? 'checkmark-circle-outline'
                    : 'close-circle-outline'
                }
                onPress={() => setAllowContactRegistration((v) => !v)}
              />
              <Pill
                label={publishNow ? 'Publier maintenant' : 'Garder en brouillon'}
                tone={publishNow ? 'primary' : 'neutral'}
                icon={publishNow ? 'send-outline' : 'document-outline'}
                onPress={() => setPublishNow((v) => !v)}
              />
            </View>
          </View>
        </Card>

        <Button
          label="Créer l'événement"
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
  rowFlex2: { flex: 2 },
  subhead: { ...typography.smallStrong, color: palette.muted },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
