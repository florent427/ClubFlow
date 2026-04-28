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
  TextInput,
  View,
} from 'react-native';
import { MemberProfileSwitcher } from '../components/MemberProfileSwitcher';
import {
  VIEWER_CLEAR_PAYER_SPACE_PIN,
  VIEWER_ME,
  VIEWER_SET_PAYER_SPACE_PIN,
  VIEWER_UPDATE_MY_PROFILE,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import * as storage from '../lib/storage';
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

  // ---------- Profil de base ----------
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
        'Autorisez l\'accès à la galerie photos dans les réglages de l\'appareil.',
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
      // RN FormData : { uri, name, type } — supporté nativement par fetch.
      form.append('file', {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
      const res = await fetch(
        `${getApiBaseUrl()}/media/upload?kind=image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Club-Id': clubId,
          },
          body: form,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Upload échoué (HTTP ${res.status}). ${text || 'Vérifie taille / format.'}`,
        );
      }
      const data = (await res.json()) as { publicUrl: string };
      setPhotoUrl(data.publicUrl);
      // Auto-save de la nouvelle photo (cohérent avec le portail web).
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
        err instanceof Error ? err.message : 'Échec de l\'upload.';
      Alert.alert('Erreur', msg);
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.page} contentContainerStyle={styles.pageInner}>
        <Text style={styles.title}>Paramètres</Text>
        <Text style={styles.lead}>
          Gérez votre profil, votre photo, et la sécurité de votre espace.
        </Text>

        <MemberProfileSwitcher />

        {/* ---- Photo de profil ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photo de profil</Text>
          <View style={styles.photoRow}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitials}>
                  {(firstName[0] ?? '?').toUpperCase()}
                  {(lastName[0] ?? '').toUpperCase()}
                </Text>
              </View>
            )}
            <Pressable
              style={[styles.btnSecondary, uploadingPhoto && styles.btnDisabled]}
              disabled={uploadingPhoto}
              onPress={() => void onPickPhoto()}
            >
              <Ionicons name="camera-outline" size={18} color="#1e293b" />
              <Text style={styles.btnSecondaryText}>
                {uploadingPhoto ? 'Envoi…' : 'Choisir une photo'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ---- Informations personnelles ---- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informations</Text>
          <View style={styles.field}>
            <Text style={styles.label}>Prénom</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Les e-mails du club concernant votre fiche y seront envoyés —
              une copie sera toujours adressée au(x) payeur(s) si vous êtes
              dans un foyer.
            </Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>
          <Pressable
            style={[styles.btnPrimary, savingProfile && styles.btnDisabled]}
            disabled={savingProfile}
            onPress={() => void onSaveProfile()}
          >
            <Text style={styles.btnPrimaryText}>
              {savingProfile ? 'Enregistrement…' : 'Enregistrer'}
            </Text>
          </Pressable>
        </View>

        {/* ---- PIN payeur ---- */}
        <PayerSpacePinCard
          pinSet={Boolean(me?.payerSpacePinSet)}
          onChanged={() => void refetch()}
        />

        {/* ---- Actions session ---- */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btnGhost, pressed && styles.pressed]}
            onPress={() => void chooseOtherProfile()}
          >
            <Text style={styles.btnGhostText}>Choisir un autre profil</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btnDanger, pressed && styles.pressed]}
            onPress={() => void logout()}
          >
            <Text style={styles.btnDangerText}>Se déconnecter</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Carte PIN payeur. 3 modes :
 *  - aucun PIN défini → afficher saisie nouveau PIN (4 chiffres)
 *  - PIN défini → afficher boutons "Modifier" et "Supprimer"
 *  - mode édition (set ou clear) avec champ "PIN actuel"
 */
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
        variables: {
          newPin,
          currentPin: pinSet ? currentPin : null,
        },
      });
      Alert.alert('PIN enregistré', 'Votre PIN a été mis à jour.');
      reset();
      onChanged();
    } catch (err: unknown) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Échec',
      );
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
      Alert.alert('PIN supprimé', 'Votre espace payeur n\'est plus protégé.');
      reset();
      onChanged();
    } catch (err: unknown) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Échec',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>PIN espace payeur</Text>
      <Text style={styles.hint}>
        Code à 4 chiffres qui protège l'accès aux factures et à l'espace
        familial. Optionnel — laissez vide si aucune protection
        supplémentaire ne vous semble nécessaire.
      </Text>

      {mode === 'idle' && !pinSet ? (
        <Pressable
          style={styles.btnPrimary}
          onPress={() => setMode('set')}
        >
          <Text style={styles.btnPrimaryText}>Définir un PIN</Text>
        </Pressable>
      ) : null}

      {mode === 'idle' && pinSet ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.muted}>✓ PIN actuellement défini.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.btnSecondary, styles.flex]}
              onPress={() => setMode('change')}
            >
              <Text style={styles.btnSecondaryText}>Modifier</Text>
            </Pressable>
            <Pressable
              style={[styles.btnGhost, styles.flex]}
              onPress={() => setMode('clear')}
            >
              <Text style={styles.btnGhostText}>Supprimer</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {(mode === 'set' || mode === 'change') ? (
        <View style={{ gap: 8 }}>
          {mode === 'change' ? (
            <View style={styles.field}>
              <Text style={styles.label}>PIN actuel</Text>
              <TextInput
                style={styles.input}
                value={currentPin}
                onChangeText={setCurrentPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
              />
            </View>
          ) : null}
          <View style={styles.field}>
            <Text style={styles.label}>Nouveau PIN (4 chiffres)</Text>
            <TextInput
              style={styles.input}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Confirmer le PIN</Text>
            <TextInput
              style={styles.input}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.btnGhost, styles.flex]}
              onPress={reset}
            >
              <Text style={styles.btnGhostText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnPrimary,
                styles.flex,
                busy && styles.btnDisabled,
              ]}
              disabled={busy}
              onPress={() => void onSubmitSet()}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? 'En cours…' : 'Enregistrer'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {mode === 'clear' ? (
        <View style={{ gap: 8 }}>
          <View style={styles.field}>
            <Text style={styles.label}>PIN actuel pour confirmer</Text>
            <TextInput
              style={styles.input}
              value={currentPin}
              onChangeText={setCurrentPin}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.btnGhost, styles.flex]}
              onPress={reset}
            >
              <Text style={styles.btnGhostText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnDanger,
                styles.flex,
                busy && styles.btnDisabled,
              ]}
              disabled={busy}
              onPress={() => void onSubmitClear()}
            >
              <Text style={styles.btnDangerText}>
                {busy ? 'En cours…' : 'Supprimer le PIN'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: '#f8fafc' },
  pageInner: { padding: 16, paddingBottom: 48, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  lead: { fontSize: 14, color: '#475569', lineHeight: 20 },

  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },

  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#cbd5e1',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },

  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569' },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  muted: { fontSize: 13, color: '#475569' },

  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnSecondary: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  btnSecondaryText: { color: '#1e293b', fontWeight: '600', fontSize: 14 },
  btnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnGhostText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  btnDanger: {
    backgroundColor: '#c62828',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDangerText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },

  actions: { gap: 8, marginTop: 8 },
});
