import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AnimatedPressable,
  Card,
  EmptyState,
  GradientButton,
  Pill,
  ScreenHero,
  Skeleton,
  TextField,
} from '../../components/ui';
import { SignaturePad } from '../../components/SignaturePad';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  VIEWER_DOCUMENTS_TO_SIGN,
  VIEWER_SIGN_CLUB_DOCUMENT,
  type ClubDocumentField,
  type ClubDocumentToSign,
  type SignClubDocumentFieldValueInput,
  type ViewerDocumentsToSignData,
  type ViewerSignClubDocumentData,
} from '../../lib/documents-graphql';
import {
  palette,
  radius,
  shadow,
  spacing,
  typography,
} from '../../lib/theme';
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
    useMutation<ViewerSignClubDocumentData>(VIEWER_SIGN_CLUB_DOCUMENT);

  const [fieldValues, setFieldValues] = useState<FieldValueMap>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const doc: ClubDocumentToSign | null = useMemo(() => {
    const list = data?.viewerDocumentsToSign ?? [];
    return list.find((d) => d.id === documentId) ?? null;
  }, [data, documentId]);

  const sortedFields = useMemo(() => {
    if (!doc) return [];
    return [...doc.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [doc]);

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

    // Construit la liste fieldValues attendue par la mutation.
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
          input: {
            documentId: doc.id,
            fieldValues: inputValues,
          },
        },
      });
      // Met à jour la liste pour le badge HomeDashboard.
      void refetch();
      Alert.alert(
        'Document signé',
        'Votre signature a été enregistrée avec succès.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
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

  function openPdfExternally() {
    if (!doc?.mediaAssetUrl) return;
    void Linking.openURL(doc.mediaAssetUrl).catch(() => {
      Alert.alert(
        'Impossible d\'ouvrir',
        "Le PDF n'a pas pu être ouvert dans un navigateur.",
      );
    });
  }

  // ─── Loading & erreurs ──────────────────────────────────────────────
  if (loading && !doc) {
    return (
      <View style={styles.flex}>
        <ScreenHero
          title="Document"
          gradient="hero"
          showBack
          overlap
          compact
        />
        <View style={styles.contentScroll}>
          <Skeleton height={120} borderRadius={radius.xl} />
          <Skeleton height={300} borderRadius={radius.xl} />
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
        <View style={[styles.contentScroll, { paddingTop: spacing.xl }]}>
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
        eyebrow="DOCUMENT À SIGNER"
        title={doc.name}
        gradient="hero"
        showBack
        overlap
        compact
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.contentScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* === En-tête : description + pills === */}
          <Card>
            <View style={styles.headerRow}>
              <View style={styles.iconBubble}>
                <Ionicons
                  name={CATEGORY_ICON[doc.category] ?? 'document-outline'}
                  size={24}
                  color={palette.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                {doc.description ? (
                  <Text style={styles.description}>{doc.description}</Text>
                ) : null}
                <View style={styles.pillsRow}>
                  <Pill
                    icon="folder-outline"
                    tone="neutral"
                    label={CATEGORY_LABEL[doc.category] ?? 'Document'}
                  />
                  {doc.isRequired ? (
                    <Pill
                      icon="alert-circle-outline"
                      tone="danger"
                      label="Obligatoire"
                    />
                  ) : null}
                  <Pill
                    icon="git-branch-outline"
                    tone="neutral"
                    label={`v${doc.version}`}
                  />
                </View>
              </View>
            </View>
          </Card>

          {/* === Visualisation PDF === */}
          <Card title="Document">
            <Text style={styles.helper}>
              Consultez le PDF avant de signer. Il s'ouvrira dans le
              navigateur de votre téléphone.
            </Text>
            <Pressable
              onPress={openPdfExternally}
              disabled={!doc.mediaAssetUrl}
              style={({ pressed }) => [
                styles.pdfRow,
                pressed && styles.pdfRowPressed,
                !doc.mediaAssetUrl && styles.pdfRowDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir le PDF"
            >
              <View style={styles.pdfIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={28}
                  color={palette.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pdfTitle}>Ouvrir le PDF</Text>
                <Text style={styles.pdfSub} numberOfLines={1}>
                  {doc.mediaAssetUrl
                    ? `${doc.name} · v${doc.version}`
                    : 'PDF non disponible'}
                </Text>
              </View>
              <Ionicons
                name="open-outline"
                size={20}
                color={palette.primary}
              />
            </Pressable>
          </Card>

          {/* === Champs à remplir === */}
          {sortedFields.length > 0 ? (
            <Card title="Champs à compléter">
              <View style={{ gap: spacing.lg }}>
                {sortedFields.map((field, idx) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    index={idx + 1}
                    value={fieldValues[field.id]}
                    onChange={(v) => setValue(field.id, v)}
                    onClear={() => clearValue(field.id)}
                  />
                ))}
              </View>
            </Card>
          ) : (
            <EmptyState
              icon="information-circle-outline"
              title="Aucun champ à remplir"
              description="Ce document ne nécessite pas de signature manuscrite."
              variant="card"
            />
          )}

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

          {/* === CTA bas === */}
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
            En validant, vous reconnaissez avoir lu le document et acceptez son
            contenu. Votre signature, l'IP et l'heure sont enregistrées à des
            fins légales.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// FieldEditor : un éditeur par type de champ
// ─────────────────────────────────────────────────────────────────────────

function FieldEditor({
  field,
  index,
  value,
  onChange,
  onClear,
}: {
  field: ClubDocumentField;
  index: number;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
  onClear: () => void;
}) {
  const label =
    field.label && field.label.trim().length > 0
      ? field.label
      : defaultLabelFor(field, index);

  switch (field.fieldType) {
    case 'SIGNATURE':
      return (
        <SignaturePad
          label={label}
          required={field.required}
          signed={typeof value === 'string' && value.length > 0}
          onSign={(b64) => onChange(b64)}
          onClear={onClear}
        />
      );

    case 'TEXT':
      return (
        <TextField
          label={`${label}${field.required ? ' *' : ''}`}
          value={typeof value === 'string' ? value : ''}
          onChangeText={(t) => onChange(t)}
          placeholder="Saisir…"
        />
      );

    case 'DATE':
      // Pas de DatePicker natif (compat Expo Go) → input texte avec hint format.
      return (
        <TextField
          label={`${label}${field.required ? ' *' : ''}`}
          value={typeof value === 'string' ? value : ''}
          onChangeText={(t) => onChange(t)}
          placeholder="JJ/MM/AAAA"
          hint="Saisissez la date au format JJ/MM/AAAA, ou laissez vide pour la date du jour."
          keyboardType="numbers-and-punctuation"
        />
      );

    case 'CHECKBOX':
      return (
        <CheckboxField
          label={label}
          required={field.required}
          checked={value === true}
          onToggle={() => onChange(!(value === true))}
        />
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
        style={[
          styles.checkboxBox,
          checked && styles.checkboxBoxChecked,
        ]}
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

/**
 * Convertit la valeur saisie côté client en `SignClubDocumentFieldValueInput`
 * attendu par la mutation. Retourne null si la valeur est vide pour un
 * champ non-requis (on n'envoie pas d'entrée vide).
 */
function buildFieldValue(
  field: ClubDocumentField,
  value: string | boolean | undefined,
): SignClubDocumentFieldValueInput | null {
  switch (field.fieldType) {
    case 'SIGNATURE':
      if (typeof value !== 'string' || value.length === 0) {
        return field.required ? null : null;
      }
      return {
        fieldId: field.id,
        type: 'SIGNATURE',
        valuePngBase64: value,
      };

    case 'TEXT':
      if (typeof value !== 'string' || value.trim().length === 0) {
        return field.required ? null : null;
      }
      return {
        fieldId: field.id,
        type: 'TEXT',
        text: value.trim(),
      };

    case 'DATE': {
      const text = typeof value === 'string' ? value.trim() : '';
      // Le backend tolère vide → utilise date du jour.
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
  contentScroll: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    marginTop: -spacing.md,
    gap: spacing.lg,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    ...typography.body,
    color: palette.body,
    marginBottom: spacing.sm,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },

  helper: { ...typography.small, color: palette.muted, marginBottom: spacing.sm },

  pdfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.primaryTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.primaryLight,
  },
  pdfRowPressed: { opacity: 0.7 },
  pdfRowDisabled: { opacity: 0.5 },
  pdfIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  pdfTitle: { ...typography.bodyStrong, color: palette.ink },
  pdfSub: { ...typography.small, color: palette.muted, marginTop: 2 },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.bgAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
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
