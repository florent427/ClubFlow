import { useLazyQuery, useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
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
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_REGISTER_CHILD_MEMBER,
} from '../lib/viewer-documents';

type Civility = 'MR' | 'MME';
type BillingRhythm = 'ANNUAL' | 'MONTHLY';

type Formula = {
  id: string;
  label: string;
  annualAmountCents: number;
  monthlyAmountCents: number;
  alreadyTakenInSeason: boolean;
};

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toFrDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

/**
 * CTA « Inscrire un enfant » — version mobile.
 * Étapes : prénom, nom, civilité, date de naissance (date picker FR),
 * sélection formule (auto-fetch après identité+naissance), rythme.
 * Génère un PendingItem dans le panier d'adhésion.
 *
 * `onSuccess` est appelé après création du PendingItem pour permettre
 * au parent (PanierAdhesionScreen) de refetch le cart actif.
 */
export function RegisterChildMemberCta({
  onSuccess,
}: {
  onSuccess?: () => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);
  const [formulaId, setFormulaId] = useState<string>('');
  const [billingRhythm, setBillingRhythm] = useState<BillingRhythm>('ANNUAL');
  const [error, setError] = useState<string | null>(null);

  const [registerChild, { loading }] = useMutation(VIEWER_REGISTER_CHILD_MEMBER);
  const [fetchFormulas, { data: formulasData, loading: formulasLoading }] =
    useLazyQuery<{ viewerEligibleMembershipFormulas: Formula[] }>(
      VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
    );

  useEffect(() => {
    if (open && birthDate && firstName.trim() && lastName.trim()) {
      void fetchFormulas({
        variables: {
          birthDate,
          identityFirstName: firstName.trim(),
          identityLastName: lastName.trim(),
        },
      });
    }
  }, [open, birthDate, firstName, lastName, fetchFormulas]);

  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter((f) => !f.alreadyTakenInSeason);
  const selectedFormula = formulas.find((f) => f.id === formulaId) ?? null;

  // Pré-sélection de la 1re formule disponible.
  useEffect(() => {
    if (availableFormulas.length > 0 && !formulaId) {
      setFormulaId(availableFormulas[0].id);
    }
  }, [availableFormulas, formulaId]);

  function reset() {
    setOpen(false);
    setFirstName('');
    setLastName('');
    setCivility('MR');
    setBirthDate('');
    setShowPicker(false);
    setFormulaId('');
    setBillingRhythm('ANNUAL');
    setError(null);
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
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
    if (!formulaId) {
      setError('Sélectionnez une formule d’adhésion.');
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
            membershipProductIds: [formulaId],
            billingRhythm,
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
      // Pas de popup "Inscription envoyée" : on ferme la modale et on
      // laisse le parent gérer le feedback (refetch cart + nav vers
      // l'écran Panier qui affiche le pendingItem fraîchement créé).
      reset();
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.');
    }
  }

  const maxDate = new Date();
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 100);
  const identityComplete =
    Boolean(birthDate) && firstName.trim().length > 0 && lastName.trim().length > 0;
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;

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

              <Text style={styles.label}>Formule d'adhésion</Text>
              {!identityComplete ? (
                <Text style={styles.hint}>
                  Renseignez prénom, nom et date de naissance pour voir les
                  formules disponibles.
                </Text>
              ) : formulasLoading ? (
                <Text style={styles.hint}>Chargement des formules…</Text>
              ) : formulas.length === 0 ? (
                <Text style={styles.warn}>
                  Aucune formule disponible pour cette date de naissance.
                  Contactez le club.
                </Text>
              ) : allTaken ? (
                <Text style={styles.warn}>
                  Toutes les formules compatibles ont déjà été prises pour
                  cette saison par {firstName} {lastName}.
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {formulas.map((f) => {
                    const active = f.id === formulaId;
                    const disabled = f.alreadyTakenInSeason;
                    return (
                      <Pressable
                        key={f.id}
                        style={[
                          styles.formulaCard,
                          active && styles.formulaCardActive,
                          disabled && styles.formulaCardDisabled,
                        ]}
                        onPress={() => !disabled && setFormulaId(f.id)}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.formulaTitle,
                            active && styles.formulaTitleActive,
                          ]}
                        >
                          {f.label}
                          {disabled ? ' (déjà prise)' : ''}
                        </Text>
                        <Text style={styles.formulaPrice}>
                          {formatEuros(f.annualAmountCents)} / an
                          {f.monthlyAmountCents > 0
                            ? ` ou ${formatEuros(f.monthlyAmountCents)}/mois`
                            : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {selectedFormula ? (
                <>
                  <Text style={styles.label}>Rythme de règlement</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[
                        styles.choice,
                        billingRhythm === 'ANNUAL' && styles.choiceActive,
                      ]}
                      onPress={() => setBillingRhythm('ANNUAL')}
                    >
                      <Text
                        style={
                          billingRhythm === 'ANNUAL'
                            ? styles.choiceTextActive
                            : styles.choiceText
                        }
                      >
                        Annuel ({formatEuros(selectedFormula.annualAmountCents)})
                      </Text>
                    </Pressable>
                    {selectedFormula.monthlyAmountCents > 0 ? (
                      <Pressable
                        style={[
                          styles.choice,
                          billingRhythm === 'MONTHLY' && styles.choiceActive,
                        ]}
                        onPress={() => setBillingRhythm('MONTHLY')}
                      >
                        <Text
                          style={
                            billingRhythm === 'MONTHLY'
                              ? styles.choiceTextActive
                              : styles.choiceText
                          }
                        >
                          Mensuel ({formatEuros(selectedFormula.monthlyAmountCents)}/mois)
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                style={[styles.btnPrimary, (loading || !formulaId) && styles.btnDisabled]}
                disabled={loading || !formulaId}
                onPress={() => void onSubmit()}
              >
                <Text style={styles.btnPrimaryText}>
                  {loading ? 'Envoi…' : 'Inscrire l\'enfant'}
                </Text>
              </Pressable>
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
  warn: { fontSize: 12, color: '#b45309' },
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
  formulaCard: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'white',
  },
  formulaCardActive: { borderColor: '#1565c0', backgroundColor: '#eff6ff' },
  formulaCardDisabled: { opacity: 0.5 },
  formulaTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  formulaTitleActive: { color: '#1565c0' },
  formulaPrice: { fontSize: 12, color: '#475569', marginTop: 4 },
  btnPrimary: {
    backgroundColor: '#1565c0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  btnPrimaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
