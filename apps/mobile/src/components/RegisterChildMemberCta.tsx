import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { VIEWER_REGISTER_CHILD_MEMBER } from '../lib/viewer-documents';

type Civility = 'MR' | 'MME';

/**
 * Convertit une Date JS en chaîne ISO `YYYY-MM-DD` (format API).
 */
function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convertit une chaîne ISO `YYYY-MM-DD` en affichage `JJ-MM-AAAA` (FR).
 */
function toFrDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * CTA « Inscrire un enfant » — version mobile : prénom, nom, civilité,
 * date de naissance. Génère un PendingItem dans le panier d'adhésion ;
 * la formule sera choisie côté admin (ou web) ensuite.
 */
export function RegisterChildMemberCta() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>(''); // ISO YYYY-MM-DD interne
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation(VIEWER_REGISTER_CHILD_MEMBER);

  function reset() {
    setOpen(false);
    setFirstName('');
    setLastName('');
    setCivility('MR');
    setBirthDate('');
    setShowPicker(false);
    setError(null);
    setSuccess(null);
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    // Sur Android, le picker se ferme tout seul après sélection (event.type === 'set' ou 'dismissed').
    // Sur iOS, on reste affiché en mode 'spinner'/'inline' tant que l'user n'a pas confirmé.
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event.type === 'set' && selected) {
      setBirthDate(toIsoDate(selected));
    }
  }

  async function onSubmit() {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Prénom et nom sont obligatoires.');
      return;
    }
    if (!birthDate) {
      setError('Sélectionnez une date de naissance.');
      return;
    }
    try {
      const { data } = await registerChild({
        variables: {
          input: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            civility,
            birthDate,
            // Schema attend `membershipProductIds: [ID!]!` (array requis).
            // Vide = panier en attente, le club choisira la formule côté admin.
            membershipProductIds: [],
          },
        },
      });
      const res = (data as {
        viewerRegisterChildMember?: { pendingItemId: string; firstName: string };
      })?.viewerRegisterChildMember;
      if (!res?.pendingItemId) {
        setError("L'inscription n'a pas pu être enregistrée.");
        return;
      }
      setSuccess(
        `${res.firstName} a bien été ajouté au panier d'adhésion. Le club finalisera la formule.`,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.');
    }
  }

  // Date max raisonnable = aujourd'hui (pas de naissance future).
  const maxDate = new Date();
  // Date min = il y a 100 ans (couvre tous cas adhérent).
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 100);

  return (
    <>
      <Pressable style={styles.cta} onPress={() => setOpen(true)}>
        <Ionicons name="people-circle-outline" size={20} color="#1565c0" />
        <View style={styles.flex}>
          <Text style={styles.ctaTitle}>Inscrire un enfant</Text>
          <Text style={styles.ctaDesc}>
            Ajouter un enfant au foyer et lancer son adhésion.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={reset}
        presentationStyle="pageSheet"
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Inscrire un enfant</Text>
          <Pressable onPress={reset}>
            <Ionicons name="close" size={24} color="#1565c0" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {success ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
              <Text style={styles.successTitle}>Inscription envoyée !</Text>
              <Text style={styles.successText}>{success}</Text>
              <Pressable style={styles.btnPrimary} onPress={reset}>
                <Text style={styles.btnPrimaryText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Prénom</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Nom</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Civilité</Text>
              <View style={styles.row}>
                <Pressable
                  style={[
                    styles.choice,
                    civility === 'MR' && styles.choiceActive,
                  ]}
                  onPress={() => setCivility('MR')}
                >
                  <Text
                    style={
                      civility === 'MR'
                        ? styles.choiceTextActive
                        : styles.choiceText
                    }
                  >
                    Monsieur
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.choice,
                    civility === 'MME' && styles.choiceActive,
                  ]}
                  onPress={() => setCivility('MME')}
                >
                  <Text
                    style={
                      civility === 'MME'
                        ? styles.choiceTextActive
                        : styles.choiceText
                    }
                  >
                    Madame
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Date de naissance</Text>
              <Pressable
                style={styles.input}
                onPress={() => setShowPicker(true)}
              >
                <Text style={birthDate ? styles.dateText : styles.datePlaceholder}>
                  {birthDate ? toFrDisplay(birthDate) : 'JJ-MM-AAAA'}
                </Text>
              </Pressable>
              {showPicker ? (
                <DateTimePicker
                  value={birthDate ? new Date(birthDate) : new Date(2015, 0, 1)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={maxDate}
                  minimumDate={minDate}
                  onChange={onPickerChange}
                  locale="fr-FR"
                />
              ) : null}
              <Text style={styles.hint}>
                Nécessaire pour proposer la bonne formule d'adhésion.
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.btnPrimary, loading && styles.btnDisabled]}
                disabled={loading}
                onPress={() => void onSubmit()}
              >
                <Text style={styles.btnPrimaryText}>
                  {loading ? 'Envoi…' : 'Inscrire l\'enfant'}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 12,
    padding: 14,
  },
  ctaTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  ctaDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  modalBody: { padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569' },
  hint: { fontSize: 12, color: '#64748b' },
  error: { color: '#dc2626', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  choiceActive: { backgroundColor: '#dbeafe', borderColor: '#1565c0' },
  choiceText: { color: '#475569', fontWeight: '600' },
  choiceTextActive: { color: '#1565c0', fontWeight: '700' },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    justifyContent: 'center',
  },
  dateText: { fontSize: 15, color: '#0f172a' },
  datePlaceholder: { fontSize: 15, color: '#94a3b8' },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  successBox: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  successText: { color: '#475569', textAlign: 'center', lineHeight: 21 },
});
