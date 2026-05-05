import { useMutation } from '@apollo/client/react';
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
import {
  VIEWER_ACTIVE_CART,
  VIEWER_TOGGLE_CART_LICENSE,
  VIEWER_TOGGLE_PENDING_LICENSE,
  VIEWER_UPDATE_CART_ITEM,
  VIEWER_UPDATE_PENDING_ITEM,
  type CartItem,
  type CartPendingItem,
  type ClubOneTimeFee,
} from '../lib/cart-documents';

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  });
}

type Props =
  | {
      kind: 'item';
      item: CartItem;
      clubOneTimeFees: ClubOneTimeFee[];
    }
  | {
      kind: 'pending';
      pending: CartPendingItem;
      clubOneTimeFees: ClubOneTimeFee[];
    };

/**
 * Section "Frais ponctuels" pour un cart item OU pending item.
 * Liste les fees du club avec :
 * - LICENSE : toggle "déjà ma licence" + input numéro (validé regex)
 * - MANDATORY : badge info "obligatoire"
 * - OPTIONAL : checkbox toggleable (synchro override CSV)
 *
 * Mode unifié pending/item : on type-narrow sur `kind` mais l'UX est
 * identique (le payeur voit la même chose avant et après validation).
 */
export function CartItemFeesSection(props: Props) {
  const isPending = props.kind === 'pending';
  const targetId = isPending ? props.pending.id : props.item.id;
  const fees = props.clubOneTimeFees;

  const hasExistingLicense = isPending
    ? props.pending.hasExistingLicense
    : props.item.hasExistingLicense;
  const existingLicenseNumber = isPending
    ? props.pending.existingLicenseNumber
    : props.item.existingLicenseNumber;
  const overrideIds = isPending
    ? props.pending.oneTimeFeeOverrideIds
    : props.item.oneTimeFeeOverrideIds;

  const [licenseModalOpen, setLicenseModalOpen] = useState(false);

  const [toggleItemLicense, { loading: togglingItemLic }] = useMutation(
    VIEWER_TOGGLE_CART_LICENSE,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [togglePendingLicense, { loading: togglingPendingLic }] = useMutation(
    VIEWER_TOGGLE_PENDING_LICENSE,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [updateItem, { loading: updatingItem }] = useMutation(
    VIEWER_UPDATE_CART_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const [updatePending, { loading: updatingPending }] = useMutation(
    VIEWER_UPDATE_PENDING_ITEM,
    { refetchQueries: [{ query: VIEWER_ACTIVE_CART }] },
  );
  const togglingLicense = togglingItemLic || togglingPendingLic;
  const updatingFees = updatingItem || updatingPending;

  const licenseFee = fees.find((f) => f.kind === 'LICENSE');
  const mandatoryFees = fees.filter((f) => f.kind === 'MANDATORY');
  const optionalFees = fees.filter((f) => f.kind === 'OPTIONAL');

  /** Indique si une OPTIONAL fee est actuellement sélectionnée. */
  function isOptionalSelected(feeId: string): boolean {
    if (overrideIds === null) {
      // Pas d'override → suit le default autoApply
      return fees.find((f) => f.id === feeId)?.autoApply ?? false;
    }
    return overrideIds.includes(feeId);
  }

  async function handleToggleOptional(fee: ClubOneTimeFee) {
    const currentEffective = fees
      .filter((f) => f.kind === 'OPTIONAL' && isOptionalSelected(f.id))
      .map((f) => f.id);
    const next = currentEffective.includes(fee.id)
      ? currentEffective.filter((id) => id !== fee.id)
      : [...currentEffective, fee.id];
    try {
      if (isPending) {
        await updatePending({
          variables: {
            input: {
              pendingItemId: targetId,
              membershipProductIds: props.pending.membershipProductIds,
              billingRhythm: props.pending.billingRhythm,
              oneTimeFeeOverrideIds: next,
            },
          },
        });
      } else {
        await updateItem({
          variables: {
            input: { itemId: targetId, oneTimeFeeOverrideIds: next },
          },
        });
      }
    } catch {
      /* error UI gérée par Apollo errorLink global */
    }
  }

  async function handleToggleLicenseOff() {
    // Repasse à "pas de licence existante" → la fee LICENSE redevient
    // applicable sur cette ligne.
    try {
      if (isPending) {
        await togglePendingLicense({
          variables: {
            input: {
              pendingItemId: targetId,
              hasExistingLicense: false,
              existingLicenseNumber: null,
            },
          },
        });
      } else {
        await toggleItemLicense({
          variables: {
            input: {
              itemId: targetId,
              hasExistingLicense: false,
              existingLicenseNumber: null,
            },
          },
        });
      }
    } catch {
      /* idem */
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Frais ponctuels</Text>

      {/* === LICENSE === */}
      {licenseFee ? (
        <View style={styles.feeRow}>
          <Ionicons
            name={hasExistingLicense ? 'checkmark-circle' : 'card-outline'}
            size={20}
            color={hasExistingLicense ? '#16a34a' : '#1565c0'}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.feeLabel}>{licenseFee.label}</Text>
            {hasExistingLicense ? (
              <Text style={styles.feeSub}>
                Licence déclarée : {existingLicenseNumber}{' '}
                <Text style={styles.feeAmtStrike}>
                  (économie {formatEuros(licenseFee.amountCents)})
                </Text>
              </Text>
            ) : (
              <Text style={styles.feeSub}>
                Obligatoire — sauf si vous avez déjà une licence pour la
                saison
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {!hasExistingLicense ? (
              <Text style={styles.feeAmt}>
                {formatEuros(licenseFee.amountCents)}
              </Text>
            ) : null}
            <Pressable
              onPress={
                hasExistingLicense
                  ? () => void handleToggleLicenseOff()
                  : () => setLicenseModalOpen(true)
              }
              disabled={togglingLicense}
              style={styles.smallBtn}
            >
              <Text style={styles.smallBtnText}>
                {hasExistingLicense ? 'Retirer' : "J'en ai déjà une"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* === MANDATORY (info-only) === */}
      {mandatoryFees.map((f) => (
        <View key={f.id} style={styles.feeRow}>
          <Ionicons name="lock-closed" size={20} color="#475569" />
          <View style={{ flex: 1 }}>
            <Text style={styles.feeLabel}>{f.label}</Text>
            <Text style={styles.feeSub}>Obligatoire (auto-ajouté)</Text>
          </View>
          <Text style={styles.feeAmt}>{formatEuros(f.amountCents)}</Text>
        </View>
      ))}

      {/* === OPTIONAL (toggleable) === */}
      {optionalFees.map((f) => {
        const selected = isOptionalSelected(f.id);
        return (
          <Pressable
            key={f.id}
            onPress={() => void handleToggleOptional(f)}
            disabled={updatingFees}
            style={[styles.feeRow, styles.feeRowToggle]}
          >
            <Ionicons
              name={selected ? 'checkbox' : 'square-outline'}
              size={22}
              color={selected ? '#1565c0' : '#94a3b8'}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.feeLabel}>{f.label}</Text>
              <Text style={styles.feeSub}>Optionnel</Text>
            </View>
            <Text style={[styles.feeAmt, !selected && styles.feeAmtMuted]}>
              {formatEuros(f.amountCents)}
            </Text>
          </Pressable>
        );
      })}

      {licenseFee ? (
        <LicenseModal
          fee={licenseFee}
          open={licenseModalOpen}
          loading={togglingLicense}
          onClose={() => setLicenseModalOpen(false)}
          onSubmit={async (number) => {
            try {
              if (isPending) {
                await togglePendingLicense({
                  variables: {
                    input: {
                      pendingItemId: targetId,
                      hasExistingLicense: true,
                      existingLicenseNumber: number,
                    },
                  },
                });
              } else {
                await toggleItemLicense({
                  variables: {
                    input: {
                      itemId: targetId,
                      hasExistingLicense: true,
                      existingLicenseNumber: number,
                    },
                  },
                });
              }
              setLicenseModalOpen(false);
              return null;
            } catch (e: unknown) {
              return e instanceof Error ? e.message : 'Erreur inconnue.';
            }
          }}
        />
      ) : null}
    </View>
  );
}

function LicenseModal({
  fee,
  open,
  loading,
  onClose,
  onSubmit,
}: {
  fee: ClubOneTimeFee;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (licenseNumber: string) => Promise<string | null>;
}) {
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Validation client miroir du backend pour feedback immédiat ; le
  // serveur revalide.
  function validateClient(input: string): string | null {
    if (input.trim().length < 3) return 'Au moins 3 caractères.';
    if (fee.licenseNumberPattern) {
      try {
        const regex = new RegExp(fee.licenseNumberPattern);
        if (!regex.test(input.trim())) {
          return fee.licenseNumberFormatHint
            ? `Format attendu : ${fee.licenseNumberFormatHint}`
            : 'Format invalide.';
        }
      } catch {
        // Regex admin invalide — on laisse passer (le serveur tranchera).
      }
    }
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const clientErr = validateClient(number);
    if (clientErr) {
      setError(clientErr);
      return;
    }
    const serverErr = await onSubmit(number.trim());
    if (serverErr) setError(serverErr);
    else setNumber('');
  }

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={modalStyles.header}>
        <Text style={modalStyles.title}>Numéro de licence existante</Text>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={24} color="#1565c0" />
        </Pressable>
      </View>
      <View style={modalStyles.body}>
        <Text style={modalStyles.lede}>
          Saisissez le numéro de votre licence {fee.label} déjà en cours de
          validité pour la saison. Cela vous évite de la repayer.
        </Text>

        {fee.licenseNumberFormatHint ? (
          <View style={modalStyles.hintBox}>
            <Ionicons name="information-circle" size={18} color="#0369a1" />
            <Text style={modalStyles.hintText}>
              Format : {fee.licenseNumberFormatHint}
            </Text>
          </View>
        ) : null}

        <Text style={modalStyles.label}>Numéro de licence</Text>
        <TextInput
          style={modalStyles.input}
          value={number}
          onChangeText={(v) => {
            setNumber(v);
            if (error) setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ex. 12345678A"
        />

        {error ? <Text style={modalStyles.error}>{error}</Text> : null}

        <Pressable
          style={[modalStyles.btnPrimary, loading && modalStyles.btnDisabled]}
          disabled={loading}
          onPress={() => void handleSubmit()}
        >
          <Text style={modalStyles.btnPrimaryText}>
            {loading ? 'Vérification…' : 'Confirmer'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 99, 235, 0.15)',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1565c0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  feeRowToggle: {
    paddingVertical: 10,
  },
  feeLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  feeSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  feeAmt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  feeAmtMuted: { color: '#94a3b8', fontWeight: '500' },
  feeAmtStrike: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: 'rgba(21, 101, 192, 0.3)',
  },
  smallBtnText: { fontSize: 11, fontWeight: '700', color: '#1565c0' },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  body: { padding: 16, gap: 12 },
  lede: { fontSize: 13, color: '#475569', lineHeight: 19 },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  hintText: { fontSize: 12, color: '#0369a1', flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569' },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  error: { color: '#dc2626', fontSize: 13 },
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
