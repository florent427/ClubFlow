import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Card,
  ConfirmSheet,
  GradientButton,
  Pill,
  ScreenContainer,
  ScreenHero,
  Skeleton,
  formatDateShort,
  formatDateTime,
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
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_INVOICE,
  INVOICE_STATUS_BADGES,
  PAYMENT_METHOD_ICONS,
  PAYMENT_METHOD_LABELS,
  SEND_INVOICE_REMINDER,
  VOID_CLUB_INVOICE,
  type InvoiceStatus,
  type PaymentMethod,
} from '../../lib/documents/billing';
import type { BillingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'InvoiceDetail'>;
type R = RouteProp<BillingStackParamList, 'InvoiceDetail'>;

type InvoiceDetail = {
  id: string;
  familyId: string;
  familyLabel: string | null;
  clubSeasonLabel: string | null;
  label: string;
  baseAmountCents: number;
  amountCents: number;
  totalPaidCents: number;
  balanceCents: number;
  status: InvoiceStatus;
  dueAt: string | null;
  createdAt: string;
  isCreditNote: boolean;
  parentInvoiceId: string | null;
  creditNoteReason: string | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
};

type InvoiceLine = {
  id: string;
  kind: string;
  memberId: string;
  memberFirstName: string;
  memberLastName: string;
  membershipProductLabel: string | null;
  membershipOneTimeFeeLabel: string | null;
  baseAmountCents: number;
  adjustments: { id: string; type: string; amountCents: number; reason: string | null }[];
};

type InvoicePayment = {
  id: string;
  amountCents: number;
  method: PaymentMethod;
  externalRef: string | null;
  paidByFirstName: string | null;
  paidByLastName: string | null;
  createdAt: string;
};

type Data = { clubInvoice: InvoiceDetail };

export function InvoiceDetailScreen() {
  const nav = useNavigation<Nav>();
  const { invoiceId } = useRoute<R>().params;
  const { data, loading, refetch } = useQuery<Data>(CLUB_INVOICE, {
    variables: { id: invoiceId },
    errorPolicy: 'all',
  });
  const [voidInvoice] = useMutation(VOID_CLUB_INVOICE);
  const [sendReminder] = useMutation(SEND_INVOICE_REMINDER);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const inv = data?.clubInvoice;
  const isOpen = inv?.status === 'OPEN' && !inv?.isCreditNote;
  const remaining = inv ? inv.balanceCents : 0;

  const onSendReminder = async () => {
    if (!inv) return;
    try {
      const res = await sendReminder({ variables: { invoiceId: inv.id } });
      const sentTo = (
        res.data as { sendInvoiceReminder?: { sentTo: string } } | null | undefined
      )?.sendInvoiceReminder?.sentTo;
      Alert.alert('Relance envoyée', `Email envoyé à ${sentTo ?? 'destinataire'}.`);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Envoi impossible.');
    }
  };

  const onVoidConfirm = async () => {
    if (!inv) return;
    setVoiding(true);
    try {
      await voidInvoice({ variables: { id: inv.id, reason: null } });
      setVoidConfirm(false);
      void refetch();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Annulation impossible.');
    } finally {
      setVoiding(false);
    }
  };

  if (loading || !inv) {
    return (
      <ScreenContainer scroll padding={0}>
        <ScreenHero
          eyebrow="FACTURE"
          title="Chargement…"
          showBack
          compact
        />
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={80} />
          <Skeleton height={120} />
          <Skeleton height={80} />
        </View>
      </ScreenContainer>
    );
  }

  const badge = inv.isCreditNote
    ? { label: 'Avoir', color: palette.infoText, bg: palette.infoBg }
    : INVOICE_STATUS_BADGES[inv.status];

  return (
    <ScreenContainer scroll padding={0} onRefresh={() => void refetch()}>
      <ScreenHero
        eyebrow={inv.isCreditNote ? 'AVOIR' : 'FACTURE'}
        title={formatEuroCents(inv.amountCents)}
        subtitle={inv.label}
        showBack
        compact
      />

      <View style={styles.body}>
        {/* Bandeau statut */}
        <Card>
          <View style={styles.statusRow}>
            <View
              style={[styles.badgeBig, { backgroundColor: badge.bg }]}
            >
              <Text style={[styles.badgeBigText, { color: badge.color }]}>
                {badge.label}
              </Text>
            </View>
            {inv.dueAt ? (
              <Text style={styles.due}>
                Échéance · {formatDateShort(inv.dueAt)}
              </Text>
            ) : null}
          </View>
          {inv.familyLabel ? (
            <View style={styles.kvRow}>
              <Ionicons
                name="people-outline"
                size={16}
                color={palette.muted}
              />
              <Text style={styles.kvValue}>{inv.familyLabel}</Text>
            </View>
          ) : null}
          {inv.clubSeasonLabel ? (
            <View style={styles.kvRow}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={palette.muted}
              />
              <Text style={styles.kvValue}>{inv.clubSeasonLabel}</Text>
            </View>
          ) : null}
          <View style={styles.kvRow}>
            <Ionicons
              name="time-outline"
              size={16}
              color={palette.muted}
            />
            <Text style={styles.kvValue}>
              Créée le {formatDateShort(inv.createdAt)}
            </Text>
          </View>
        </Card>

        {/* Solde */}
        <Card>
          <View style={styles.totalsRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>MONTANT TOTAL</Text>
              <Text style={styles.amount}>
                {formatEuroCents(inv.amountCents)}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.eyebrow}>RESTE À ENCAISSER</Text>
              <Text
                style={[
                  styles.amount,
                  remaining > 0 ? { color: palette.warningText } : { color: palette.successText },
                ]}
              >
                {formatEuroCents(remaining)}
              </Text>
            </View>
          </View>
          {inv.totalPaidCents > 0 ? (
            <View style={[styles.kvRow, { marginTop: spacing.sm }]}>
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={palette.successText}
              />
              <Text style={styles.kvValue}>
                Déjà encaissé : {formatEuroCents(inv.totalPaidCents)}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Lignes */}
        <Card title={`Détail (${inv.lines.length} ligne${inv.lines.length > 1 ? 's' : ''})`}>
          {inv.lines.length === 0 ? (
            <Text style={styles.muted}>Aucune ligne.</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              {inv.lines.map((line) => (
                <LineRow key={line.id} line={line} />
              ))}
            </View>
          )}
        </Card>

        {/* Paiements */}
        <Card
          title={`Encaissements (${inv.payments.length})`}
          subtitle={
            inv.payments.length === 0
              ? 'Aucun encaissement enregistré'
              : undefined
          }
        >
          {inv.payments.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              {inv.payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </View>
          ) : null}
        </Card>

        {/* Actions */}
        {isOpen ? (
          <View style={{ gap: spacing.sm }}>
            <GradientButton
              label={`Encaisser ${formatEuroCents(remaining)}`}
              icon="cash-outline"
              onPress={() =>
                nav.navigate('RecordPayment', { invoiceId: inv.id })
              }
              glow="primary"
            />
            <View style={styles.secondaryActions}>
              <Pill
                icon="mail-outline"
                label="Relance"
                onPress={() => void onSendReminder()}
              />
              <Pill
                icon="trash-outline"
                label="Annuler"
                tone="danger"
                onPress={() => setVoidConfirm(true)}
              />
            </View>
          </View>
        ) : null}
      </View>

      <ConfirmSheet
        visible={voidConfirm}
        title="Annuler cette facture ?"
        message={
          inv.totalPaidCents > 0
            ? "Des paiements ont été reçus. Préférez créer un avoir pour rembourser."
            : "L'opération est définitive."
        }
        confirmLabel="Annuler la facture"
        destructive
        loading={voiding}
        onCancel={() => setVoidConfirm(false)}
        onConfirm={() => void onVoidConfirm()}
      />
    </ScreenContainer>
  );
}

function LineRow({ line }: { line: InvoiceLine }) {
  const productLabel =
    line.membershipProductLabel ?? line.membershipOneTimeFeeLabel ?? line.kind;
  const totalAdjust = line.adjustments.reduce(
    (sum, a) => sum + a.amountCents,
    0,
  );
  const finalCents = line.baseAmountCents + totalAdjust;
  return (
    <View style={styles.line}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineTitle} numberOfLines={1}>
          {productLabel}
        </Text>
        <Text style={styles.lineSubtitle} numberOfLines={1}>
          {line.memberFirstName} {line.memberLastName}
        </Text>
        {line.adjustments.map((a) => (
          <Text key={a.id} style={styles.adjust} numberOfLines={1}>
            {a.amountCents < 0 ? '−' : '+'}
            {formatEuroCents(Math.abs(a.amountCents))}
            {a.reason ? ` · ${a.reason}` : ''}
          </Text>
        ))}
      </View>
      <Text style={styles.lineAmount}>{formatEuroCents(finalCents)}</Text>
    </View>
  );
}

function PaymentRow({ payment }: { payment: InvoicePayment }) {
  const icon = PAYMENT_METHOD_ICONS[payment.method] ?? 'cash-outline';
  const methodLabel = PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;
  return (
    <View style={styles.payRow}>
      <View style={styles.payIcon}>
        <Ionicons name={icon} size={20} color={palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payTitle}>
          {formatEuroCents(payment.amountCents)} · {methodLabel}
        </Text>
        <Text style={styles.payMeta} numberOfLines={1}>
          {formatDateTime(payment.createdAt)}
          {payment.externalRef ? ` · ${payment.externalRef}` : ''}
          {payment.paidByFirstName
            ? ` · ${payment.paidByFirstName} ${payment.paidByLastName ?? ''}`
            : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  badgeBig: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  badgeBigText: {
    ...typography.smallStrong,
    fontSize: 13,
  },
  due: {
    ...typography.small,
    color: palette.muted,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  kvValue: {
    ...typography.body,
    color: palette.body,
    flex: 1,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.muted,
  },
  amount: {
    ...typography.metric,
    color: palette.ink,
    marginTop: 2,
  },
  muted: {
    ...typography.small,
    color: palette.muted,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  lineTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  lineSubtitle: {
    ...typography.small,
    color: palette.muted,
  },
  adjust: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },
  lineAmount: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  payIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  payTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  payMeta: {
    ...typography.small,
    color: palette.muted,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
