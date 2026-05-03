import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  EmptyState,
  GradientButton,
  ScreenHero,
  Skeleton,
  TextField,
} from '../../components/ui';
import { SignatureCaptureModal } from '../../components/SignatureCaptureModal';
import {
  VIEWER_DOCUMENTS_TO_SIGN,
  VIEWER_SIGN_CLUB_DOCUMENT,
  type ClubDocumentField,
  type ClubDocumentToSign,
  type SignClubDocumentFieldValueInput,
  type ViewerDocumentsToSignData,
  type ViewerSignClubDocumentData,
} from '../../lib/documents-graphql';
import { palette, radius, spacing, typography } from '../../lib/theme';
import type { DocumentsStackParamList } from '../../types/navigation';

type Route = RouteProp<DocumentsStackParamList, 'DocumentSign'>;
type Nav = NativeStackNavigationProp<DocumentsStackParamList>;

/**
 * Stocke les valeurs saisies par l'utilisateur. La clé est l'ID du field.
 *
 * - SIGNATURE → string (dataURL `data:image/png;base64,...`)
 * - TEXT → string
 * - DATE → string (ISO YYYY-MM-DD ou format libre, le backend tolère)
 * - CHECKBOX → boolean
 */
type FieldValueMap = Record<string, string | boolean>;

/**
 * Étape 3 du flux signature — **complétion des champs**.
 *
 * Layout volontairement **sans aucun ScrollView** : le canvas de signature
 * (intégré dans `react-native-signature-canvas` via WebView) ne supporte
 * pas d'être enveloppé dans un ScrollView (les gestes verticaux du
 * signature_pad sont mangés par le scroll, on ne capture que des points
 * isolés).
 *
 * À la place :
 *  - les champs SIGNATURE sont rendus comme des **rangées tappables** —
 *    un tap ouvre une `SignatureCaptureModal` plein écran ;
 *  - les champs TEXT/DATE sont des inputs inline ;
 *  - les champs CHECKBOX sont des cases à cocher ;
 *  - on utilise une `FlatList` pour la liste des champs (au cas où il y
 *    en a beaucoup) — elle scrolle proprement sans interférer avec un
 *    canvas.
 *
 * Le PDF n'est PAS affiché ici (déjà lu dans `DocumentPreviewScreen`).
 * Le hero affiche un rappel + un bouton "Revoir le PDF".
 */
export function DocumentSignScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { documentId } = route.params;

  const { data, loading, error, refetch } =
    useQuery<ViewerDocumentsToSignData>(VIEWER_DOCUMENTS_TO_SIGN, {
      errorPolicy: 'all',
      fetchPolicy: 'cache-and-network',
    });

  const [signMutation, { loading: signing }] =
    useMutation<ViewerSignClubDocumentData>(VIEWER_SIGN_CLUB_DOCUMENT, {
      // Rafraîchit la liste + la bannière HomeDashboard dès que la
      // signature est validée (sans attendre le polling).
      refetchQueries: ['ViewerDocumentsToSign'],
      awaitRefetchQueries: true,
    });

  const [fieldValues, setFieldValues] = useState<FieldValueMap>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // ID du field SIGNATURE actuellement édité dans la modale plein écran.
  const [activeSignatureFieldId, setActiveSignatureFieldId] = useState<
    string | null
  >(null);

  const doc: ClubDocumentToSign | null = useMemo(() => {
    const list = data?.viewerDocumentsToSign ?? [];
    return list.find((d) => d.id === documentId) ?? null;
  }, [data, documentId]);

  const sortedFields = useMemo(() => {
    if (!doc) return [];
    return [...doc.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [doc]);

  const activeSignatureField = useMemo(
    () =>
      activeSignatureFieldId
        ? doc?.fields.find((f) => f.id === activeSignatureFieldId) ?? null
        : null,
    [doc, activeSignatureFieldId],
  );

  function setValue(fieldId: string, value: string | boolean) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  function clearValue(fieldId: string) {
    setFieldValues((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }

  /** Vérifie qu'on peut activer le bouton "Valider la signature". */
  const canSubmit = useMemo(() => {
    if (!doc) return false;
    for (const f of doc.fields) {
      if (!f.required) continue;
      const v = fieldValues[f.id];
      switch (f.fieldType) {
        case 'SIGNATURE':
          if (typeof v !== 'string' || v.length === 0) return false;
          break;
        case 'TEXT':
          if (typeof v !== 'string' || v.trim().length === 0) return false;
          break;
        case 'DATE':
          if (typeof v !== 'string' || v.trim().length === 0) return false;
          break;
        case 'CHECKBOX':
          if (v !== true) return false;
          break;
      }
    }
    return true;
  }, [doc, fieldValues]);

  async function onSubmit() {
    if (!doc) return;
    setSubmitErr(null);

    const inputValues: SignClubDocumentFieldValueInput[] = doc.fields
      .map((f) => buildFieldValue(f, fieldValues[f.id]))
      .filter((v): v is SignClubDocumentFieldValueInput => v !== null);

    if (inputValues.length === 0) {
      setSubmitErr('Aucun champ à signer.');
      return;
    }

    try {
      await signMutation({
        variables: {
          input: { documentId: doc.id, fieldValues: inputValues },
        },
      });
      void refetch();
      Alert.alert(
        'Document signé',
        'Votre signature a été enregistrée avec succès.',
        [
          {
            text: 'OK',
            onPress: () => navigation.popToTop(),
          },
        ],
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible d\'enregistrer la signature.';
      setSubmitErr(msg);
      Alert.alert('Erreur', msg);
    }
  }

  function reopenPreview() {
    if (!doc) return;
    navigation.navigate('DocumentPreview', { documentId: doc.id });
  }

  // ─── Loading & erreurs ──────────────────────────────────────────────
  if (loading && !doc) {
    return (
      <View style={styles.flex}>
        <ScreenHero title="Document" gradient="hero" showBack compact />
        <View style={styles.loaderBox}>
          <Skeleton height={120} borderRadius={radius.xl} />
          <Skeleton height={120} borderRadius={radius.xl} />
        </View>
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.flex}>
        <ScreenHero
          title="Document introuvable"
          gradient="hero"
          showBack
          compact
        />
        <View style={styles.errorBox}>
          <EmptyState
            icon="alert-circle-outline"
            title="Document introuvable"
            description={
              error?.message ??
              "Ce document n'est plus disponible. Il a peut-être déjà été signé ou retiré."
            }
            variant="card"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="SIGNATURE"
        title={doc.name}
        gradient="hero"
        showBack
        compact
      />

      {/* Lien "Revoir le PDF" — l'utilisateur peut retourner à l'aperçu
          si besoin. */}
      <Pressable
        onPress={reopenPreview}
        style={({ pressed }) => [
          styles.reviewBtn,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Revoir le PDF"
      >
        <Ionicons name="eye-outline" size={16} color={palette.primary} />
        <Text style={styles.reviewBtnText}>Revoir le PDF</Text>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {sortedFields.length > 0 ? (
          <FlatList
            style={styles.flex}
            contentContainerStyle={styles.list}
            data={sortedFields}
            keyExtractor={(f) => f.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <FieldRow
                field={item}
                index={index + 1}
                value={fieldValues[item.id]}
                onChange={(v) => setValue(item.id, v)}
                onClear={() => clearValue(item.id)}
                onOpenSignaturePad={() =>
                  setActiveSignatureFieldId(item.id)
                }
              />
            )}
            ListFooterComponent={
              <View style={styles.footerBlock}>
                {submitErr ? (
                  <View style={styles.errBox}>
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={palette.dangerText}
                    />
                    <Text style={styles.errText}>{submitErr}</Text>
                  </View>
                ) : null}

                {signing ? (
                  <View style={styles.signingBox}>
                    <ActivityIndicator color={palette.primary} />
                    <Text style={styles.signingText}>
                      Génération du PDF signé…
                    </Text>
                  </View>
                ) : (
                  <GradientButton
                    label="Valider la signature"
                    onPress={() => void onSubmit()}
                    icon="checkmark-circle-outline"
                    gradient="primary"
                    size="lg"
                    fullWidth
                    disabled={!canSubmit}
                    loading={signing}
                  />
                )}

                <Text style={styles.footnote}>
                  En validant, vous reconnaissez avoir lu le document et
                  acceptez son contenu. Votre signature, l'IP et l'heure
                  sont enregistrées à des fins légales.
                </Text>
              </View>
            }
          />
        ) : (
          <View style={styles.errorBox}>
            <EmptyState
              icon="information-circle-outline"
              title="Aucun champ à remplir"
              description="Ce document ne nécessite pas de signature manuscrite."
              variant="card"
            />
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Modale plein écran pour capturer une signature — montée toujours,
          visible toggle. NB : le canvas n'est instancié qu'une fois
          ouvert grâce au visible toggle de Modal. */}
      {activeSignatureField ? (
        <SignatureCaptureModal
          visible
          label={
            (activeSignatureField.label?.trim() ??
              defaultLabelFor(activeSignatureField, 1)) ||
            'Signature'
          }
          onSign={(b64) => {
            setValue(activeSignatureField.id, b64);
            setActiveSignatureFieldId(null);
          }}
          onClose={() => setActiveSignatureFieldId(null)}
        />
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FieldRow : une rangée par champ — tap sur SIGNATURE ouvre la modale
// ─────────────────────────────────────────────────────────────────────────

function FieldRow({
  field,
  index,
  value,
  onChange,
  onClear,
  onOpenSignaturePad,
}: {
  field: ClubDocumentField;
  index: number;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  onClear: () => void;
  onOpenSignaturePad: () => void;
}) {
  const label =
    field.label && field.label.trim().length > 0
      ? field.label
      : defaultLabelFor(field, index);

  switch (field.fieldType) {
    case 'SIGNATURE': {
      const signed = typeof value === 'string' && value.length > 0;
      return (
        <Pressable
          onPress={onOpenSignaturePad}
          accessibilityRole="button"
          accessibilityLabel={`${label} — ouvrir le pad de signature`}
          style={({ pressed }) => [
            styles.signatureRow,
            signed && styles.signatureRowSigned,
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.signatureRowHeader}>
            <View
              style={[
                styles.signatureIcon,
                signed && styles.signatureIconSigned,
              ]}
            >
              <Ionicons
                name={signed ? 'checkmark' : 'create-outline'}
                size={20}
                color={signed ? '#ffffff' : palette.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.signatureLabel}>
                {label}
                {field.required ? (
                  <Text style={{ color: palette.danger }}> *</Text>
                ) : null}
              </Text>
              <Text
                style={[
                  styles.signatureSub,
                  signed && { color: palette.successText },
                ]}
              >
                {signed
                  ? 'Signé — touchez pour modifier'
                  : 'Touchez pour signer'}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={palette.muted}
            />
          </View>
          {signed ? (
            <View style={styles.signedActionsRow}>
              <Pressable
                onPress={onClear}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.clearBtn,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Effacer la signature"
              >
                <Ionicons
                  name="trash-outline"
                  size={14}
                  color={palette.dangerText}
                />
                <Text style={styles.clearBtnText}>Effacer</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      );
    }

    case 'TEXT':
      return (
        <View style={styles.fieldBox}>
          <TextField
            label={`${label}${field.required ? ' *' : ''}`}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(t) => onChange(t)}
            placeholder="Saisir…"
          />
        </View>
      );

    case 'DATE':
      return (
        <View style={styles.fieldBox}>
          <TextField
            label={`${label}${field.required ? ' *' : ''}`}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(t) => onChange(t)}
            placeholder="JJ/MM/AAAA"
            hint="Format JJ/MM/AAAA, ou laissez vide pour la date du jour."
            keyboardType="numbers-and-punctuation"
          />
        </View>
      );

    case 'CHECKBOX':
      return (
        <View style={styles.fieldBox}>
          <CheckboxField
            label={label}
            required={field.required}
            checked={value === true}
            onToggle={() => onChange(!(value === true))}
          />
        </View>
      );

    default:
      return null;
  }
}

function CheckboxField({
  label,
  checked,
  onToggle,
  required,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  required?: boolean;
}) {
  return (
    <AnimatedPressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={styles.checkboxRow}
    >
      <View
        style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}
      >
        {checked ? (
          <Ionicons name="checkmark" size={18} color="#ffffff" />
        ) : null}
      </View>
      <Text style={styles.checkboxLabel}>
        {label}
        {required ? <Text style={{ color: palette.danger }}> *</Text> : null}
      </Text>
    </AnimatedPressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function defaultLabelFor(field: ClubDocumentField, index: number): string {
  switch (field.fieldType) {
    case 'SIGNATURE':
      return `Signature ${index}`;
    case 'TEXT':
      return `Champ texte ${index}`;
    case 'DATE':
      return `Date ${index}`;
    case 'CHECKBOX':
      return `Case à cocher ${index}`;
  }
}

function buildFieldValue(
  field: ClubDocumentField,
  value: string | boolean | undefined,
): SignClubDocumentFieldValueInput | null {
  switch (field.fieldType) {
    case 'SIGNATURE':
      if (typeof value !== 'string' || value.length === 0) {
        return null;
      }
      return {
        fieldId: field.id,
        type: 'SIGNATURE',
        valuePngBase64: value,
      };

    case 'TEXT':
      if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
      }
      return {
        fieldId: field.id,
        type: 'TEXT',
        text: value.trim(),
      };

    case 'DATE': {
      const text = typeof value === 'string' ? value.trim() : '';
      return {
        fieldId: field.id,
        type: 'DATE',
        text: text.length > 0 ? text : null,
      };
    }

    case 'CHECKBOX':
      return {
        fieldId: field.id,
        type: 'CHECKBOX',
        bool: value === true,
      };

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  loaderBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  errorBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  reviewBtnText: {
    ...typography.smallStrong,
    color: palette.primary,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },

  // ── Champ SIGNATURE — rangée tappable
  signatureRow: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: palette.border,
    gap: spacing.sm,
  },
  signatureRowSigned: {
    borderColor: palette.successBorder,
    backgroundColor: palette.successBg,
  },
  signatureRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  signatureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureIconSigned: {
    backgroundColor: palette.success,
  },
  signatureLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  signatureSub: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  signedActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: palette.dangerBg,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  clearBtnText: {
    ...typography.caption,
    color: palette.dangerText,
    fontWeight: '600',
  },

  // ── Champs TEXT/DATE/CHECKBOX
  fieldBox: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  checkboxBoxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkboxLabel: {
    ...typography.body,
    color: palette.ink,
    flex: 1,
  },

  // ── Footer block (sous la liste des champs)
  footerBlock: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  errBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.dangerBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.dangerBorder,
  },
  errText: { ...typography.small, color: palette.dangerText, flex: 1 },

  signingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.primaryTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.primaryLight,
  },
  signingText: {
    ...typography.bodyStrong,
    color: palette.primary,
  },

  footnote: {
    ...typography.caption,
    color: palette.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
