import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Button,
  Card,
  ScreenHero,
  TextField,
} from '../components/ui';
import { MemberProfileSwitcher } from '../components/MemberProfileSwitcher';
import {
  VIEWER_CLEAR_PAYER_SPACE_PIN,
  VIEWER_ME,
  VIEWER_SET_PAYER_SPACE_PIN,
  VIEWER_UPDATE_MY_PROFILE,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import * as storage from '../lib/storage';
import { palette, radius, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

function getApiBaseUrl(): string {
  const u =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return u.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

export function SettingsScreen() {
  const navigation = useNavigation();
  const rootNav =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>() ??
    navigation;

  const { data: meData, refetch } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-and-network',
  });
  const me = meData?.viewerMe;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!me) return;
    setFirstName(me.firstName ?? '');
    setLastName(me.lastName ?? '');
    setPhone(me.phone ?? '');
    setEmail(me.email ?? '');
    setPhotoUrl(me.photoUrl ?? null);
  }, [me]);

  const [updateProfile] = useMutation(VIEWER_UPDATE_MY_PROFILE);

  async function logout() {
    await storage.clearAuth();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'Login' }] }),
    );
  }

  async function chooseOtherProfile() {
    await storage.clearClubId();
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'SelectProfile' }] }),
    );
  }

  async function onSaveProfile() {
    setSavingProfile(true);
    try {
      await updateProfile({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            photoUrl: photoUrl ?? null,
          },
        },
      });
      Alert.alert('Profil enregistré', 'Vos informations ont été mises à jour.');
      void refetch();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible de mettre à jour le profil.';
      Alert.alert('Erreur', msg);
    } finally {
      setSavingProfile(false);
    }
  }

  async function onPickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie photos dans les réglages de l'appareil.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    await uploadPhoto(asset);
  }

  async function uploadPhoto(asset: ImagePicker.ImagePickerAsset) {
    const token = await storage.getToken();
    const clubId = await storage.getClubId();
    if (!token || !clubId) {
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      const fileName = asset.fileName ?? `photo-${Date.now()}.jpg`;
      const mimeType = asset.mimeType ?? 'image/jpeg';
      form.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
      const res = await fetch(`${getApiBaseUrl()}/media/upload?kind=image`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Club-Id': clubId,
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Upload échoué (HTTP ${res.status}). ${text || 'Vérifie taille / format.'}`,
        );
      }
      const data = (await res.json()) as { publicUrl: string };
      setPhotoUrl(data.publicUrl);
      await updateProfile({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            photoUrl: data.publicUrl,
          },
        },
      });
      void refetch();
      Alert.alert('Photo mise à jour', 'Votre photo de profil est enregistrée.');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Échec de l'upload.";
      Alert.alert('Erreur', msg);
    } finally {
      setUploadingPhoto(false);
    }
  }

  const initials =
    `${(firstName[0] ?? '?').toUpperCase()}${(lastName[0] ?? '').toUpperCase()}`.trim();

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="MON COMPTE"
        title="Paramètres"
        subtitle="Profil, photo, sécurité et session."
        gradient="hero"
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
      <MemberProfileSwitcher />

      {/* Photo de profil */}
      <Card title="Photo de profil">
        <View style={styles.photoRow}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitials}>{initials || '?'}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.photoHint}>
              JPG ou PNG, carré recommandé (10 Mo max).
            </Text>
            <Button
              label={uploadingPhoto ? 'Envoi…' : 'Choisir une photo'}
              icon="camera-outline"
              onPress={() => void onPickPhoto()}
              loading={uploadingPhoto}
              variant="secondary"
              size="sm"
            />
          </View>
        </View>
      </Card>

      {/* Informations */}
      <Card title="Informations">
        <View style={{ gap: spacing.md }}>
          <View style={styles.row}>
            <TextField
              label="Prénom"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              containerStyle={{ flex: 1 }}
            />
            <TextField
              label="Nom"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              containerStyle={{ flex: 1 }}
            />
          </View>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            hint="Une copie sera adressée au(x) payeur(s) si vous êtes dans un foyer."
          />
          <TextField
            label="Téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Button
            label={savingProfile ? 'Enregistrement…' : 'Enregistrer'}
            onPress={() => void onSaveProfile()}
            loading={savingProfile}
            fullWidth
            icon="save-outline"
          />
        </View>
      </Card>

      <PayerSpacePinCard
        pinSet={Boolean(me?.payerSpacePinSet)}
        onChanged={() => void refetch()}
      />

      {/* Session */}
      <Card title="Session" padding={spacing.lg}>
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => void chooseOtherProfile()}
            style={({ pressed }) => [
              styles.sessionRow,
              pressed && styles.sessionRowPressed,
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name="people-outline"
              size={20}
              color={palette.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionLabel}>Choisir un autre profil</Text>
              <Text style={styles.sessionSub}>Membres d'un même foyer.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </Pressable>

          <Pressable
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.sessionRow,
              pressed && styles.sessionRowPressed,
            ]}
            accessibilityRole="button"
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={palette.danger}
            />
            <Text style={[styles.sessionLabel, { color: palette.danger }]}>
              Se déconnecter
            </Text>
          </Pressable>
        </View>
      </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** PIN payeur — version stylée avec Card + Buttons UI primitives. */
function PayerSpacePinCard({
  pinSet,
  onChanged,
}: {
  pinSet: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'set' | 'change' | 'clear'>(
    'idle',
  );
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);

  const [setPin] = useMutation(VIEWER_SET_PAYER_SPACE_PIN);
  const [clearPin] = useMutation(VIEWER_CLEAR_PAYER_SPACE_PIN);

  function reset() {
    setMode('idle');
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
  }

  async function onSubmitSet() {
    if (!/^\d{4}$/.test(newPin)) {
      Alert.alert('PIN invalide', 'Entrez exactement 4 chiffres.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('Confirmation', 'Les deux PIN ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await setPin({
        variables: { newPin, currentPin: pinSet ? currentPin : null },
      });
      Alert.alert('PIN enregistré', 'Votre PIN a été mis à jour.');
      reset();
      onChanged();
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitClear() {
    if (!/^\d{4}$/.test(currentPin)) {
      Alert.alert('PIN invalide', 'Entrez votre PIN actuel (4 chiffres).');
      return;
    }
    setBusy(true);
    try {
      await clearPin({ variables: { currentPin } });
      Alert.alert('PIN supprimé', "Votre espace payeur n'est plus protégé.");
      reset();
      onChanged();
    } catch (err: unknown) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="PIN espace payeur" subtitle="Code à 4 chiffres protégeant l'accès aux factures.">
      {mode === 'idle' && !pinSet ? (
        <Button
          label="Définir un PIN"
          icon="lock-closed-outline"
          onPress={() => setMode('set')}
          fullWidth
        />
      ) : null}

      {mode === 'idle' && pinSet ? (
        <View style={{ gap: spacing.sm }}>
          <View style={styles.pinStatusRow}>
            <Ionicons
              name="shield-checkmark"
              size={20}
              color={palette.success}
            />
            <Text style={styles.pinStatusText}>PIN actif.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Modifier"
              onPress={() => setMode('change')}
              variant="secondary"
              style={{ flex: 1 }}
            />
            <Button
              label="Supprimer"
              onPress={() => setMode('clear')}
              variant="ghost"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      {mode === 'set' || mode === 'change' ? (
        <View style={{ gap: spacing.md }}>
          {mode === 'change' ? (
            <TextField
              label="PIN actuel"
              value={currentPin}
              onChangeText={setCurrentPin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
          ) : null}
          <TextField
            label="Nouveau PIN (4 chiffres)"
            value={newPin}
            onChangeText={setNewPin}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
          />
          <TextField
            label="Confirmer"
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Annuler"
              onPress={reset}
              variant="ghost"
              style={{ flex: 1 }}
            />
            <Button
              label={busy ? 'En cours…' : 'Enregistrer'}
              onPress={() => void onSubmitSet()}
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      {mode === 'clear' ? (
        <View style={{ gap: spacing.md }}>
          <TextField
            label="PIN actuel pour confirmer"
            value={currentPin}
            onChangeText={setCurrentPin}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Annuler"
              onPress={reset}
              variant="ghost"
              style={{ flex: 1 }}
            />
            <Button
              label={busy ? 'En cours…' : 'Supprimer le PIN'}
              onPress={() => void onSubmitClear()}
              loading={busy}
              variant="danger"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  scroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.borderStrong,
  },
  avatarPlaceholder: {
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
  },
  photoHint: {
    ...typography.small,
    color: palette.muted,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  pinStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.successBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  pinStatusText: { ...typography.bodyStrong, color: '#15803d' },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    minHeight: 48,
  },
  sessionRowPressed: { backgroundColor: palette.bgAlt },
  sessionLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  sessionSub: { ...typography.small, color: palette.muted, marginTop: 2 },
});
