import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  GradientButton,
  ScreenContainer,
  ScreenHero,
  TextField,
  formatEuroCents,
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import {
  CLUB_INVOICE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_ICONS,
  PAYMENT_METHOD_LABELS,
  RECORD_CLUB_MANUAL_PAYMENT,
  type PaymentMethod,
} from '../../lib/documents/billing';
import type { BillingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'RecordPayment'>;
type R = RouteProp<BillingStackParamList, 'RecordPayment'>;

type InvoiceLite = {
  id: string;
  label: string;
  amountCents: number;
  totalPaidCents: number;
  balanceCents: number;
  familyLabel: string | null;
};

type Data = { clubInvoice: InvoiceLite };

export function RecordPaymentScreen() {
  const nav = useNavigation<Nav>();
  const { invoiceId } = useRoute<R>().params;

  const { data, loading } = useQuery<Data>(CLUB_INVOICE, {
    variables: { id: invoiceId ?? '' },
    skip: !invoiceId,
    errorPolicy: 'all',
  });
  const [recordPayment, { loading: submitting }] = useMutation(
    RECORD_CLUB_MANUAL_PAYMENT,
  );

  const inv = data?.clubInvoice;
  const remaining = inv?.balanceCents ?? 0;

  const [method, setMethod] = useState<PaymentMethod>('MANUAL_CASH');
  const [amount, setAmount] = useState('');
  const [externalRef, setExternalRef] = useState('');

  // Pré-remplir avec le solde restant à la première frappe
  useEffect(() => {
    if (inv && amount === '') {
      setAmount((remaining / 100).toFixed(2).replace('.', ','));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  const amountCents = useMemo(() => {
    const n = parseFloat(amount.replace(',', '.'));
    if (Number.isNaN(n) || n <= 0) return null;
    return Math.round(n * 100);
  }, [amount]);

  const isValid =
    amountCents !== null &&
    amountCents <= remaining + 1 && // tolérance 1 centime
    !!invoiceId;

  const onSubmit = async () => {
    if (!isValid || !invoiceId || amountCents === null) return;
    try {
      await recordPayment({
        variables: {
          input: {
            invoiceId,
            amountCents,
            method,
            externalRef: externalRef.trim() || null,
          },
        },
      });
      Alert.alert(
        'Encaissement enregistré',
        `${formatEuroCents(amountCents)} en ${PAYMENT_METHOD_LABELS[method].toLowerCase()}.`,
        [{ text: 'OK', onPress: () => nav.goBack() }],
      );
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Encaissement impossible.',
      );
    }
  };

  const setQuickAmount = (kind: 'full' | 'half' | 'third') => {
    if (remaining <= 0) return;
    const cents =
      kind === 'full'
        ? remaining
        : kind === 'half'
          ? Math.round(remaining / 2)
          : Math.round(remaining / 3);
    setAmount((cents / 100).toFixed(2).replace('.', ','));
  };

  if (!invoiceId) {
    return (
      <ScreenContainer>
        <ScreenHero
          eyebrow="ENCAISSEMENT"
          title="Encaisser"
          subtitle="Aucune facture sélectionnée"
          showBack
          compact
        />
      </ScreenContainer>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={{ flex: 1 }}>
        <ScreenContainer scroll padding={0} keyboardAvoiding>
          <ScreenHero
            eyebrow="ENCAISSEMENT"
            title="Encaisser un règlement"
            subtitle={
              inv
                ? `${inv.label} · ${inv.familyLabel ?? '—'}`
                : 'Chargement…'
            }
            showBack
            compact
          />

          <View style={styles.body}>
            {/* Récap facture */}
            {inv ? (
              <Card>
                <Text style={styles.eyebrow}>RESTE À ENCAISSER</Text>
                <Text style={styles.bigAmount}>
                  {formatEuroCents(remaining)}
                </Text>
                {inv.totalPaidCents > 0 ? (
                  <Text style={styles.alreadyPaid}>
                    Déjà encaissé : {formatEuroCents(inv.totalPaidCents)} sur{' '}
                    {formatEuroCents(inv.amountCents)}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {/* Méthode — 4 grands boutons */}
            <Card title="Méthode de paiement">
              <View style={styles.methods}>
                {PAYMENT_METHODS.map((m) => {
                  const active = method === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMethod(m)}
                      style={({ pressed }) => [
                        styles.method,
                        active && styles.methodActive,
                        pressed && !active && { opacity: 0.85 },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <View
                        style={[
                          styles.methodIcon,
                          active && styles.methodIconActive,
                        ]}
                      >
                        <Ionicons
                          name={PAYMENT_METHOD_ICONS[m]}
                          size={22}
                          color={active ? palette.surface : palette.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.methodLabel,
                          active && { color: palette.primary },
                        ]}
                        numberOfLines={1}
                      >
                        {PAYMENT_METHOD_LABELS[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>

            {/* Montant */}
            <Card title="Montant">
              <TextField
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                rightAdornment={
                  <Text style={styles.currency}>€</Text>
                }
                hint={
                  amountCents !== null && amountCents > remaining
                    ? `Au-delà du solde restant (${formatEuroCents(remaining)})`
                    : undefined
                }
                error={
                  amount.length > 0 && amountCents === null
                    ? 'Montant invalide'
                    : undefined
                }
              />
              {/* Quick amounts */}
              <View style={styles.quickRow}>
                <QuickAmount
                  label="Solde"
                  value={formatEuroCents(remaining)}
                  active={amountCents === remaining}
                  onPress={() => setQuickAmount('full')}
                />
                <QuickAmount
                  label="½"
                  value={formatEuroCents(Math.round(remaining / 2))}
                  active={amountCents === Math.round(remaining / 2)}
                  onPress={() => setQuickAmount('half')}
                />
                <QuickAmount
                  label="⅓"
                  value={formatEuroCents(Math.round(remaining / 3))}
                  active={amountCents === Math.round(remaining / 3)}
                  onPress={() => setQuickAmount('third')}
                />
              </View>
            </Card>

            {/* Référence externe */}
            <Card
              title={
                method === 'MANUAL_CHECK'
                  ? 'N° de chèque'
                  : method === 'MANUAL_TRANSFER'
                    ? 'Référence virement'
                    : method === 'STRIPE_CARD'
                      ? 'Référence Stripe'
                      : 'Référence (facultatif)'
              }
            >
              <TextField
                value={externalRef}
                onChangeText={setExternalRef}
                placeholder={
                  method === 'MANUAL_CHECK'
                    ? 'Ex : 0123456'
                    : method === 'MANUAL_TRANSFER'
                      ? 'Libellé apparaissant sur le relevé'
                      : 'Optionnel'
                }
                autoCapitalize="characters"
              />
            </Card>

            {/* CTA */}
            <View style={{ paddingTop: spacing.sm }}>
              <GradientButton
                label={
                  submitting
                    ? 'Encaissement…'
                    : amountCents !== null
                      ? `Encaisser ${formatEuroCents(amountCents)}`
                      : 'Saisir un montant'
                }
                icon="checkmark-circle-outline"
                disabled={!isValid || submitting || loading}
                loading={submitting}
                onPress={() => void onSubmit()}
                glow="primary"
              />
            </View>
          </View>
        </ScreenContainer>
      </View>
    </TouchableWithoutFeedback>
  );
}

function QuickAmount({
  label,
  value,
  active,
  onPress,
}: {
  label: string;
  value: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quick,
        active && styles.quickActive,
        pressed && !active && { opacity: 0.85 },
      ]}
    >
      <Text
        style={[
          styles.quickLabel,
          active && { color: palette.surface },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.quickValue,
          active && { color: palette.surface },
        ]}
      >
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.muted,
  },
  bigAmount: {
    ...typography.metricLg,
    color: palette.warningText,
    marginTop: 2,
  },
  alreadyPaid: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.xs,
  },

  methods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  method: {
    width: '48%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.surface,
  },
  methodActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primaryTint,
    ...shadow.sm,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconActive: {
    backgroundColor: palette.primary,
  },
  methodLabel: {
    ...typography.smallStrong,
    color: palette.body,
    textAlign: 'center',
  },

  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quick: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.bgAlt,
    alignItems: 'center',
  },
  quickActive: {
    backgroundColor: palette.primary,
  },
  quickLabel: {
    ...typography.caption,
    color: palette.muted,
  },
  quickValue: {
    ...typography.smallStrong,
    color: palette.ink,
    marginTop: 2,
  },
  currency: {
    ...typography.h3,
    color: palette.muted,
  },
});
