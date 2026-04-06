import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  VIEWER_FAMILY_BILLING,
  VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL,
  VIEWER_ME,
} from '../lib/viewer-documents';
import type { ViewerJoinFamilyByPayerEmailData, ViewerMeData } from '../lib/viewer-types';
import type { MainTabParamList } from '../types/navigation';

type Props = {
  variant?: 'dashboard' | 'compact';
};

export function JoinFamilyByPayerEmailCta({ variant = 'dashboard' }: Props) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const eligible =
    meData?.viewerMe?.canSelfAttachFamilyViaPayerEmail === true;

  const [joinFamily, { loading }] = useMutation<ViewerJoinFamilyByPayerEmailData>(
    VIEWER_JOIN_FAMILY_BY_PAYER_EMAIL,
    {
      refetchQueries: [{ query: VIEWER_ME }, { query: VIEWER_FAMILY_BILLING }],
    },
  );

  async function onSubmit() {
    setLocalError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setLocalError('Saisissez l’e-mail du responsable facturation.');
      return;
    }
    try {
      const { data } = await joinFamily({
        variables: { input: { payerEmail: trimmed } },
      });
      const res = data?.viewerJoinFamilyByPayerEmail;
      if (!res?.success) {
        setLocalError(res?.message ?? 'Échec du rattachement.');
        return;
      }
      setOpen(false);
      setEmail('');
      navigation.navigate('Famille');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Échec du rattachement.';
      setLocalError(msg);
    }
  }

  if (!eligible) {
    return null;
  }

  const compact = variant === 'compact';

  return (
    <>
      <View
        style={compact ? styles.bannerCompact : styles.banner}
        accessibilityRole="summary"
      >
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>
            {compact
              ? 'Rejoindre votre espace familial'
              : 'Rattacher ma fiche à un espace familial existant'}
          </Text>
          <Text style={styles.bannerLede}>
            Vous partagez les <Text style={styles.strong}>mêmes factures</Text>{' '}
            et voyez les <Text style={styles.strong}>mêmes enfants</Text> sur{' '}
            le portail. Chaque parent garde son{' '}
            <Text style={styles.strong}>espace personnel privé</Text>.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
          onPress={() => {
            setLocalError(null);
            setOpen(true);
          }}
        >
          <Text style={styles.btnPrimaryText}>Rejoindre un espace familial</Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => !loading && setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={() => !loading && setOpen(false)}
          />
          <View style={styles.modalWrap} pointerEvents="box-none">
            <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Ionicons name="mail-outline" size={24} color="#1565c0" />
              <Text style={styles.modalTitle}>
                E-mail du responsable facturation
              </Text>
            </View>
            <Text style={styles.modalLede}>
              Saisissez l&apos;adresse e-mail <Text style={styles.strong}>exacte</Text>{' '}
              du parent responsable de la facturation, telle qu&apos;enregistrée au
              club. En cas de doute, contactez le secrétariat.
            </Text>
            <Text style={styles.label}>E-mail du responsable</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ex. parent@domaine.fr"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            {localError ? (
              <Text style={styles.formError} accessibilityRole="alert">
                {localError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
                onPress={() => setOpen(false)}
                disabled={loading}
              >
                <Text style={styles.btnOutlineText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
                onPress={() => void onSubmit()}
                disabled={loading}
              >
                <Text style={styles.btnPrimaryText}>
                  {loading ? 'Rattachement…' : 'Valider le rattachement'}
                </Text>
              </Pressable>
            </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#90caf9',
    backgroundColor: '#e3f2fd',
    padding: 16,
    marginBottom: 16,
  },
  bannerCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { marginBottom: 12 },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0d47a1',
  },
  bannerLede: { fontSize: 14, color: '#333', lineHeight: 20 },
  strong: { fontWeight: '700' },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.85 },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    maxHeight: '90%',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  modalLede: { fontSize: 14, color: '#555', marginBottom: 12, lineHeight: 20 },
  label: { fontSize: 13, color: '#555', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  formError: { color: '#b00020', marginBottom: 8, fontSize: 14 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: '#1565c0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  btnOutlineText: { color: '#1565c0', fontWeight: '600' },
});
