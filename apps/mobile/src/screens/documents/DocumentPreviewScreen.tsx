import { useQuery } from '@apollo/client/react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  EmptyState,
  GradientButton,
  Pill,
  ScreenHero,
  Skeleton,
} from '../../components/ui';
import { InlinePdfViewer } from '../../components/InlinePdfViewer';
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  VIEWER_DOCUMENTS_TO_SIGN,
  type ClubDocumentToSign,
  type ViewerDocumentsToSignData,
} from '../../lib/documents-graphql';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { palette, radius, spacing, typography } from '../../lib/theme';
import type { DocumentsStackParamList } from '../../types/navigation';

type Route = RouteProp<DocumentsStackParamList, 'DocumentPreview'>;
type Nav = NativeStackNavigationProp<DocumentsStackParamList>;

/**
 * Étape 2 du flux signature — **lecture du PDF en plein écran** avant
 * de cliquer sur "Signer ce document".
 *
 * Pourquoi un écran dédié ?
 *
 * - Sur l'ancien design, l'aperçu PDF était embarqué dans le même écran
 *   que les champs de signature, ce qui forçait à scroller pour voir le
 *   document **et** à scroller à nouveau pour signer — combinaison qui
 *   fait conflit avec le canvas de signature (cf. SignaturePad).
 * - Cet écran isole le viewer PDF dans un container `flex: 1` (occupe
 *   tout l'espace disponible) et propose un bouton fixe en bas pour
 *   passer à l'étape "Signer".
 *
 * UX :
 *  - Hero compact (titre + back)
 *  - Bandeau métadonnées (catégorie, "obligatoire", version)
 *  - PDF inline plein écran
 *  - CTA bas "Signer ce document" (gradient primary)
 *  - Lien secondaire "Ouvrir dans le navigateur"
 */
export function DocumentPreviewScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { documentId } = route.params;

  const { data, loading } = useQuery<ViewerDocumentsToSignData>(
    VIEWER_DOCUMENTS_TO_SIGN,
    { errorPolicy: 'all', fetchPolicy: 'cache-and-network' },
  );

  const doc: ClubDocumentToSign | null = useMemo(() => {
    const list = data?.viewerDocumentsToSign ?? [];
    return list.find((d) => d.id === documentId) ?? null;
  }, [data, documentId]);

  const pdfUrl = absolutizeMediaUrl(doc?.mediaAssetUrl);

  function openExternally() {
    if (!pdfUrl) return;
    void Linking.openURL(pdfUrl).catch(() => {
      Alert.alert(
        'Impossible d\'ouvrir',
        "Le PDF n'a pas pu être ouvert dans un navigateur.",
      );
    });
  }

  function goSign() {
    if (!doc) return;
    navigation.navigate('DocumentSign', { documentId: doc.id });
  }

  // ─── Loading ────────────────────────────────────────────────────────
  if (loading && !doc) {
    return (
      <View style={styles.flex}>
        <ScreenHero title="Document" gradient="hero" showBack compact />
        <View style={styles.skeleton}>
          <Skeleton height={48} borderRadius={radius.md} />
          <Skeleton height={400} borderRadius={radius.lg} />
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
        <View style={styles.errBox}>
          <EmptyState
            icon="alert-circle-outline"
            title="Document introuvable"
            description="Ce document n'est plus disponible. Il a peut-être déjà été signé ou retiré."
            variant="card"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="LECTURE AVANT SIGNATURE"
        title={doc.name}
        gradient="hero"
        showBack
        compact
      />

      {/* Métadonnées — pills compactes */}
      <View style={styles.metaRow}>
        <View style={styles.iconBubble}>
          <Ionicons
            name={CATEGORY_ICON[doc.category] ?? 'document-outline'}
            size={20}
            color={palette.primary}
          />
        </View>
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

      {doc.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {doc.description}
        </Text>
      ) : null}

      {/* PDF inline plein écran — flex:1 prend tout l'espace dispo
          (InlinePdfViewer.tsx, sans prop height, applique `flex: 1`). */}
      <View style={styles.pdfContainer}>
        {pdfUrl ? (
          <InlinePdfViewer url={pdfUrl} />
        ) : (
          <View style={styles.pdfMissing}>
            <Ionicons
              name="document-outline"
              size={40}
              color={palette.muted}
            />
            <Text style={styles.pdfMissingText}>
              PDF non disponible.
            </Text>
          </View>
        )}
      </View>

      {/* Footer — CTA + lien navigateur */}
      <View style={styles.footer}>
        {pdfUrl ? (
          <Pressable
            onPress={openExternally}
            style={({ pressed }) => [
              styles.openLink,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir le PDF dans un navigateur"
          >
            <Ionicons
              name="open-outline"
              size={16}
              color={palette.primary}
            />
            <Text style={styles.openLinkText}>
              Ouvrir dans un navigateur
            </Text>
          </Pressable>
        ) : null}

        <GradientButton
          label="Signer ce document"
          onPress={goSign}
          icon="create-outline"
          gradient="primary"
          size="lg"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  skeleton: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  errBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillsRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  description: {
    ...typography.small,
    color: palette.body,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  pdfContainer: {
    flex: 1,
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  pdfMissing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  pdfMissingText: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    gap: spacing.sm,
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  openLinkText: {
    ...typography.smallStrong,
    color: palette.primary,
  },
});
