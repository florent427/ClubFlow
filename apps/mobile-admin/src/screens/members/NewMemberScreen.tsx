import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  Card,
  GradientButton,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  radius,
  spacing,
  typography,
  type BottomAction,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_FAMILIES,
  CLUB_GRADE_LEVELS,
  CLUB_MEMBERS,
  CREATE_CLUB_MEMBER,
} from '../../lib/documents/members';
import type { MembersStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MembersStackParamList, 'NewMember'>;

type Civility = 'MR' | 'MME';
const CIVILITY_LABEL: Record<Civility, string> = {
  MR: 'M.',
  MME: 'Mme',
};

type GradeLevel = { id: string; label: string; sortOrder: number };
type Family = { id: string; label: string | null };

type GradeData = { clubGradeLevels: GradeLevel[] };
type FamilyData = { clubFamilies: Family[] };

type PickerOpen = 'civility' | 'grade' | 'family' | null;

/** Convertit "JJ/MM/AAAA" → "AAAA-MM-JJ" (ISO date) ; null si invalide. */
function parseFrDate(s: string): string | null {
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

export function NewMemberScreen() {
  const navigation = useNavigation<Nav>();

  const { data: gradeData } = useQuery<GradeData>(CLUB_GRADE_LEVELS, {
    errorPolicy: 'all',
  });
  const { data: familyData } = useQuery<FamilyData>(CLUB_FAMILIES, {
    errorPolicy: 'all',
  });

  // Étape 1 — Identité
  const [civility, setCivility] = useState<Civility>('MR');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [pseudoTouched, setPseudoTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  // Étape 2 — Adresse
  const [addressLine, setAddressLine] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');

  // Étape 3 — Profil club
  const [gradeLevelId, setGradeLevelId] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [medicalCertExpiresAt, setMedicalCertExpiresAt] = useState('');

  const [pickerOpen, setPickerOpen] = useState<PickerOpen>(null);

  const [createMember, { loading: creating }] = useMutation(CREATE_CLUB_MEMBER, {
    refetchQueries: [{ query: CLUB_MEMBERS }],
  });

  const grades = [...(gradeData?.clubGradeLevels ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const families = familyData?.clubFamilies ?? [];

  const selectedGrade = grades.find((g) => g.id === gradeLevelId) ?? null;
  const selectedFamily = families.find((f) => f.id === familyId) ?? null;

  const handlePseudoFocus = () => {
    if (!pseudoTouched && pseudo.length === 0 && firstName.length > 0) {
      setPseudo(firstName.toLowerCase());
    }
  };

  const onSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert(
        'Champs requis',
        'Prénom, nom et email sont obligatoires.',
      );
      return;
    }

    const birthIso =
      birthDate.trim().length === 0 ? null : parseFrDate(birthDate);
    if (birthDate.trim().length > 0 && birthIso === null) {
      Alert.alert(
        'Date invalide',
        'La date de naissance doit être au format JJ/MM/AAAA.',
      );
      return;
    }

    const certIso =
      medicalCertExpiresAt.trim().length === 0
        ? null
        : parseFrDate(medicalCertExpiresAt);
    if (medicalCertExpiresAt.trim().length > 0 && certIso === null) {
      Alert.alert(
        'Date invalide',
        'La date d\'expiration du certificat doit être au format JJ/MM/AAAA.',
      );
      return;
    }

    try {
      const input: Record<string, unknown> = {
        civility,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      };
      if (phone.trim().length > 0) input.phone = phone.trim();
      if (addressLine.trim().length > 0) input.addressLine = addressLine.trim();
      if (postalCode.trim().length > 0) input.postalCode = postalCode.trim();
      if (city.trim().length > 0) input.city = city.trim();
      if (birthIso) input.birthDate = birthIso;
      if (certIso) input.medicalCertExpiresAt = certIso;
      if (gradeLevelId) input.gradeLevelId = gradeLevelId;
      if (familyId) input.familyId = familyId;

      await createMember({ variables: { input } });
      Alert.alert('Adhérent créé', 'Le nouveau membre a été ajouté.');
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de créer l\'adhérent.',
      );
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouvel adhérent"
        subtitle="Inscription en 3 étapes"
        showBack
        compact
      />

      <View style={styles.content}>
        {/* Étape 1 — Identité */}
        <Card title="1. Identité">
          <View style={styles.stack}>
            <View>
              <Text style={styles.fieldLabel}>Civilité</Text>
              <Pressable
                onPress={() => setPickerOpen('civility')}
                style={({ pressed }) => [
                  styles.picker,
                  pressed && styles.pickerPressed,
                ]}
              >
                <Text style={styles.pickerText}>
                  {CIVILITY_LABEL[civility]}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={palette.muted}
                />
              </Pressable>
            </View>

            <TextField
              label="Prénom *"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              textContentType="givenName"
            />
            <TextField
              label="Nom *"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              textContentType="familyName"
            />
            <TextField
              label="Email *"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label="Pseudo"
              value={pseudo}
              onChangeText={(v) => {
                setPseudo(v);
                setPseudoTouched(true);
              }}
              onFocus={handlePseudoFocus}
              autoCapitalize="none"
              hint="Auto-suggéré depuis le prénom — éditable."
            />
            <TextField
              label="Téléphone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            <TextField
              label="Date de naissance"
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="JJ/MM/AAAA"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Card>

        {/* Étape 2 — Adresse */}
        <Card title="2. Adresse">
          <View style={styles.stack}>
            <TextField
              label="Adresse"
              value={addressLine}
              onChangeText={setAddressLine}
              autoCapitalize="words"
              textContentType="streetAddressLine1"
            />
            <TextField
              label="Code postal"
              value={postalCode}
              onChangeText={setPostalCode}
              keyboardType="number-pad"
              maxLength={20}
              textContentType="postalCode"
            />
            <TextField
              label="Ville"
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
              textContentType="addressCity"
            />
          </View>
        </Card>

        {/* Étape 3 — Profil club */}
        <Card title="3. Profil club">
          <View style={styles.stack}>
            <View>
              <Text style={styles.fieldLabel}>Grade</Text>
              <Pressable
                onPress={() => setPickerOpen('grade')}
                style={({ pressed }) => [
                  styles.picker,
                  pressed && styles.pickerPressed,
                ]}
              >
                <Text style={styles.pickerText}>
                  {selectedGrade?.label ?? 'Aucun grade sélectionné'}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={palette.muted}
                />
              </Pressable>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Famille (optionnel)</Text>
              <Pressable
                onPress={() => setPickerOpen('family')}
                style={({ pressed }) => [
                  styles.picker,
                  pressed && styles.pickerPressed,
                ]}
              >
                <Text style={styles.pickerText}>
                  {selectedFamily
                    ? selectedFamily.label ?? 'Foyer'
                    : 'Aucune famille'}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={palette.muted}
                />
              </Pressable>
            </View>

            <TextField
              label="Expiration certificat médical"
              value={medicalCertExpiresAt}
              onChangeText={setMedicalCertExpiresAt}
              placeholder="JJ/MM/AAAA"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        </Card>

        <GradientButton
          label={creating ? 'Création…' : 'Créer l\'adhérent'}
          onPress={() => void onSubmit()}
          loading={creating}
          disabled={creating}
          iconRight="arrow-forward"
        />
      </View>

      <BottomActionBar
        visible={pickerOpen === 'civility'}
        onClose={() => setPickerOpen(null)}
        title="Civilité"
        actions={
          [
            { key: 'MR', label: CIVILITY_LABEL.MR, icon: 'person-outline' },
            { key: 'MME', label: CIVILITY_LABEL.MME, icon: 'person-outline' },
          ] as BottomAction[]
        }
        onAction={(key) => {
          setCivility(key as Civility);
          setPickerOpen(null);
        }}
      />

      <BottomActionBar
        visible={pickerOpen === 'grade'}
        onClose={() => setPickerOpen(null)}
        title="Grade"
        actions={[
          {
            key: '__none__',
            label: 'Aucun grade',
            icon: 'remove-circle-outline',
          },
          ...grades.map((g) => ({
            key: g.id,
            label: g.label,
            icon: 'ribbon-outline' as const,
          })),
        ]}
        onAction={(key) => {
          setGradeLevelId(key === '__none__' ? null : key);
          setPickerOpen(null);
        }}
      />

      <BottomActionBar
        visible={pickerOpen === 'family'}
        onClose={() => setPickerOpen(null)}
        title="Famille"
        actions={[
          {
            key: '__none__',
            label: 'Aucune famille',
            icon: 'remove-circle-outline',
          },
          ...families.map((f) => ({
            key: f.id,
            label: f.label ?? 'Foyer',
            icon: 'home-outline' as const,
          })),
        ]}
        onAction={(key) => {
          setFamilyId(key === '__none__' ? null : key);
          setPickerOpen(null);
        }}
      />
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
  fieldLabel: {
    ...typography.smallStrong,
    color: palette.body,
    marginBottom: spacing.xs,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
  },
  pickerPressed: { opacity: 0.7 },
  pickerText: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
  },
});
