import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
  VIEWER_ME,
  VIEWER_REGISTER_SELF_AS_MEMBER,
} from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

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
 * CTA « M'inscrire moi-même » version cart-based.
 * Utilise l'identité du viewer (firstName/lastName auto via VIEWER_ME),
 * demande civilité + date de naissance + sélection formule + rythme.
 * Crée un PendingItem via `viewerRegisterSelfAsMember` — le Member sera
 * créé à la validation du panier (parité avec RegisterChildMemberCta).
 */
export function RegisterSelfMemberCta({
  onSuccess,
}: {
  onSuccess?: () => void;
} = {}) {
  const { data: meData } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });
  const me = meData?.viewerMe;
  const viewerFirstName = me?.firstName ?? '';
  const viewerLastName = me?.lastName ?? '';

  const [open, setOpen] = useState(false);
  const [civility, setCivility] = useState<Civility>('MR');
  const [birthDate, setBirthDate] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [billingRhythm, setBillingRhythm] = useState<BillingRhythm>('ANNUAL');
  const [error, setError] = useState<string | null>(null);

  const [register, { loading }] = useMutation(VIEWER_REGISTER_SELF_AS_MEMBER);
  const [fetchFormulas, { data: formulasData, loading: formulasLoading }] =
    useLazyQuery<{ viewerEligibleMembershipFormulas: Formula[] }>(
      VIEWER_ELIGIBLE_MEMBERSHIP_FORMULAS,
    );

  useEffect(() => {
    if (open && birthDate) {
      void fetchFormulas({
        variables: {
          birthDate,
          identityFirstName: viewerFirstName,
          identityLastName: viewerLastName,
        },
      });
    }
  }, [open, birthDate, viewerFirstName, viewerLastName, fetchFormulas]);

  const formulas = formulasData?.viewerEligibleMembershipFormulas ?? [];
  const availableFormulas = formulas.filter((f) => !f.alreadyTakenInSeason);
  const allTaken = formulas.length > 0 && availableFormulas.length === 0;
  const selectedFormulas = formulas.filter((f) =>
    selectedProductIds.includes(f.id),
  );

  // Pré-sélection de la 1re formule disponible.
  useEffect(() => {
    if (availableFormulas.length > 0 && selectedProductIds.length === 0) {
      setSelectedProductIds([availableFormulas[0].id]);
    }
  }, [availableFormulas, selectedProductIds.length]);

  // Si une des formules cochées n'a pas de tarif mensuel → bascule en
  // ANNUAL automatiquement (évite état invalide).
  const monthlyAvailable =
    selectedFormulas.length > 0 &&
    selectedFormulas.every((f) => f.monthlyAmountCents > 0);
  useEffect(() => {
    if (!monthlyAvailable && billingRhythm === 'MONTHLY') {
      setBillingRhythm('ANNUAL');
    }
  }, [monthlyAvailable, billingRhythm]);

  const totalAnnualCents = selectedFormulas.reduce(
    (s, f) => s + f.annualAmountCents,
    0,
  );
  const totalMonthlyCents = selectedFormulas.reduce(
    (s, f) => s + f.monthlyAmountCents,
    0,
  );

  function reset() {
    setOpen(false);
    setCivility('MR');
    setBirthDate('');
    setShowPicker(false);
    setSelectedProductIds([]);
    setBillingRhythm('ANNUAL');
    setError(null);
  }

  function onPickerChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event.type === 'set' && selected) {
      setBirthDate(toIsoDate(selected));
      // Reset la sélection formule pour forcer la pré-sélection sur le
      // nouveau range éligible (les formules dépendent de la date).
      setSelectedProductIds([]);
    }
  }

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function onSubmit() {
    setError(null);
    if (!birthDate) {
      setError('Sélectionnez une date de naissance.');
      return;
    }
    if (selectedProductIds.length === 0) {
      setError('Sélectionnez au moins une formule.');
      return;
    }
    try {
      const { data } = await register({
        variables: {
          input: {
            civility,
            birthDate,
            membershipProductIds: selectedProductIds,
            billingRhythm,
          },
        },
      });
      const res = (data as {
        viewerRegisterSelfAsMember?: { pendingItemId: string };
      })?.viewerRegisterSelfAsMember;
      if (!res?.pendingItemId) {
        setError("L'inscription n'a pas pu être enregistrée.");
        return;
      }
      reset();
      onSuccess?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.');
    }
  }

  const maxDate = new Date();
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 100);

  return (
    <>
      <Pressable style={styles.cta} onPress={() => setOpen(true)}>
        <Ionicons name="person-add-outline" size={20} color="#1565c0" />
        <View style={styles.flex}>
          <Text style={styles.ctaTitle}>M'inscrire moi-même</Text>
          <Text style={styles.ctaDesc}>
            Ajouter ma propre adhésion au panier du foyer.
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
          <Text style={styles.modalTitle}>M'inscrire moi-même</Text>
          <Pressable onPress={reset}>
            <Ionicons name="close" size={24} color="#1565c0" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.identityCard}>
            Adhérent : <Text style={styles.identityStrong}>
              {viewerFirstName} {viewerLastName}
            </Text>
          </Text>

          <Text style={styles.label}>Civilité</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.choice, civility === 'MR' && styles.choiceActive]}
              onPress={() => setCivility('MR')}
            >
              <Text
                style={
                  civility === 'MR' ? styles.choiceTextActive : styles.choiceText
                }
              >
                Monsieur
              </Text>
            </Pressable>
            <Pressable
              style={[styles.choice, civility === 'MME' && styles.choiceActive]}
              onPress={() => setCivility('MME')}
            >
              <Text
                style={
                  civility === 'MME' ? styles.choiceTextActive : styles.choiceText
                }
              >
                Madame
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Date de naissance</Text>
          <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
            <Text style={birthDate ? styles.dateText : styles.datePlaceholder}>
              {birthDate ? toFrDisplay(birthDate) : 'JJ-MM-AAAA'}
            </Text>
          </Pressable>
          {showPicker ? (
            <DateTimePicker
              value={birthDate ? new Date(birthDate) : new Date(1990, 0, 1)}
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

          <Text style={styles.label}>
            Formule(s) d'adhésion
            {selectedProductIds.length > 0
              ? ` (${selectedProductIds.length} sélectionnée${
                  selectedProductIds.length > 1 ? 's' : ''
                })`
              : ''}
          </Text>
          {!birthDate ? (
            <Text style={styles.hint}>
              Renseignez votre date de naissance pour voir les formules
              disponibles.
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
              Vous avez déjà pris toutes les formules compatibles pour cette
              saison.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {formulas.map((f) => {
                const checked = selectedProductIds.includes(f.id);
                const disabled = f.alreadyTakenInSeason;
                return (
                  <Pressable
                    key={f.id}
                    style={[
                      styles.formulaCard,
                      checked && styles.formulaCardActive,
                      disabled && styles.formulaCardDisabled,
                    ]}
                    onPress={() => !disabled && toggleProduct(f.id)}
                    disabled={disabled}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons
                        name={
                          disabled
                            ? 'lock-closed'
                            : checked
                              ? 'checkbox'
                              : 'square-outline'
                        }
                        size={20}
                        color={
                          disabled ? '#94a3b8' : checked ? '#1565c0' : '#64748b'
                        }
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.formulaTitle,
                            checked && styles.formulaTitleActive,
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
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {selectedFormulas.length > 0 ? (
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
                    Annuel ({formatEuros(totalAnnualCents)})
                  </Text>
                </Pressable>
                {monthlyAvailable ? (
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
                      Mensuel ({formatEuros(totalMonthlyCents)}/mois)
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[
              styles.btnPrimary,
              (loading || selectedProductIds.length === 0) && styles.btnDisabled,
            ]}
            disabled={loading || selectedProductIds.length === 0}
            onPress={() => void onSubmit()}
          >
            <Text style={styles.btnPrimaryText}>
              {loading ? 'Envoi…' : "M'ajouter au panier"}
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
  identityCard: {
    fontSize: 13,
    color: '#475569',
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  identityStrong: { fontWeight: '700', color: '#0f172a' },
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
  formulaPrice: { fontSize: 12, color: '#475569', marginTop: 2 },
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
