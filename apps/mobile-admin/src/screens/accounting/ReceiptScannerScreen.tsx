import { useMutation } from '@apollo/client/react';
import {
  Button,
  Card,
  EmptyState,
  GradientButton,
  ScreenContainer,
  ScreenHero,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SUBMIT_MULTIPAGE_RECEIPT_FOR_OCR } from '../../lib/documents/accounting';
import { storage } from '../../lib/storage';
import type { AccountingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'ReceiptScanner'>;

type SubmitMultipageResult = {
  submitMultiPageReceiptForOcr: {
    extractionId: string | null;
    entryId: string | null;
    duplicateOfEntryId: string | null;
    budgetBlocked: boolean;
  };
};

/**
 * Représentation unifiée d'une page sélectionnée (image OU PDF).
 * Une facture = un array de PickedFile (1 page = 1 entrée).
 */
type PickedFile = {
  uri: string;
  fileName: string | null;
  mimeType: string;
  isPdf: boolean;
};

const MAX_PAGES = 10;

function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');
  const graphql =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return graphql.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

export function ReceiptScannerScreen() {
  const navigation = useNavigation<Nav>();
  /**
   * Pages de la facture en cours de constitution. Ordre = ordre de
   * lecture (page 1 en index 0). L'utilisateur peut ajouter des photos
   * via caméra/galerie OU un PDF (1 PDF compte pour 1 entrée mais
   * peut contenir N pages côté binaire).
   */
  const [pages, setPages] = useState<PickedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'uploading' | 'analyzing' | 'done'
  >('idle');

  const [submitOcr] = useMutation<SubmitMultipageResult>(
    SUBMIT_MULTIPAGE_RECEIPT_FOR_OCR,
  );

  function appendPage(p: PickedFile) {
    setPages((prev) => {
      if (prev.length >= MAX_PAGES) {
        Alert.alert(
          'Limite atteinte',
          `Maximum ${MAX_PAGES} pages par facture.`,
        );
        return prev;
      }
      return [...prev, p];
    });
    setPhase('idle');
  }

  function removePage(index: number) {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }

  async function onCapture() {
    if (pages.length >= MAX_PAGES) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_PAGES} pages.`);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la caméra dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    appendPage({
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
      isPdf: false,
    });
  }

  async function onPickFromGallery() {
    if (pages.length >= MAX_PAGES) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_PAGES} pages.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie dans les réglages.",
      );
      return;
    }
    // Sélection multiple autorisée (jusqu'à la limite restante).
    const remaining = MAX_PAGES - pages.length;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (result.canceled || result.assets.length === 0) return;
    const newPages: PickedFile[] = result.assets.slice(0, remaining).map((a) => ({
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
      isPdf: false,
    }));
    setPages((prev) => [...prev, ...newPages]);
    setPhase('idle');
  }

  async function onPickPdf() {
    if (pages.length >= MAX_PAGES) {
      Alert.alert('Limite atteinte', `Maximum ${MAX_PAGES} pages.`);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    appendPage({
      uri: a.uri,
      fileName: a.name ?? `facture-${Date.now()}.pdf`,
      mimeType: a.mimeType ?? 'application/pdf',
      isPdf: true,
    });
  }

  /**
   * Upload des N pages vers /media/upload, récupère les mediaAssetId,
   * puis appelle la mutation `submitMultiPageReceiptForOcr` avec les ids.
   * Uploads en parallèle (Promise.all) pour minimiser la latence.
   */
  async function onLaunchOcr() {
    if (pages.length === 0) return;
    const token = await storage.getToken();
    const clubId = await storage.getClubId();
    if (!token || !clubId) {
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
      return;
    }
    setUploading(true);
    setPhase('uploading');
    try {
      const mediaAssetIds = await Promise.all(
        pages.map(async (page, index) => {
          const form = new FormData();
          const fileName =
            page.fileName ??
            (page.isPdf
              ? `page-${index + 1}-${Date.now()}.pdf`
              : `page-${index + 1}-${Date.now()}.jpg`);
          form.append('file', {
            uri: page.uri,
            name: fileName,
            type: page.mimeType,
          } as unknown as Blob);
          form.append('kind', 'DOCUMENT');
          const res = await fetch(`${getApiBaseUrl()}/media/upload`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Club-Id': clubId,
            },
            body: form,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(
              `Upload page ${index + 1} échoué (HTTP ${res.status}). ${text.slice(0, 150)}`,
            );
          }
          const asset = (await res.json()) as { id: string };
          return asset.id;
        }),
      );

      setPhase('analyzing');
      const ocrResult = await submitOcr({
        variables: { mediaAssetIds },
      });
      const entryId =
        ocrResult.data?.submitMultiPageReceiptForOcr?.entryId;
      const duplicateOf =
        ocrResult.data?.submitMultiPageReceiptForOcr?.duplicateOfEntryId;
      const budgetBlocked =
        ocrResult.data?.submitMultiPageReceiptForOcr?.budgetBlocked;
      setPhase('done');
      if (budgetBlocked) {
        Alert.alert(
          'Budget IA atteint',
          "Le budget mensuel d'extraction IA est atteint. Saisissez manuellement.",
        );
        return;
      }
      const targetId = entryId ?? duplicateOf;
      if (targetId) {
        if (duplicateOf) {
          // Doublon détecté — on ouvre directement l'entry existante.
          navigation.replace('EntryDetail', { entryId: targetId });
        } else {
          // OCR lancé en background côté API. On revient AU REGISTRE pour
          // que l'utilisateur voie sa nouvelle écriture en "Analyse en
          // cours" + qu'il puisse enchaîner d'autres scans sans attendre.
          Alert.alert(
            'Analyse lancée',
            "L'IA analyse votre facture en arrière-plan. Vous pouvez scanner d'autres factures pendant ce temps.",
            [
              {
                text: 'Continuer',
                onPress: () => {
                  // Reset du scanner pour enchaîner
                  navigation.replace('AccountingHome');
                },
              },
            ],
          );
        }
      } else {
        Alert.alert(
          'Analyse incomplète',
          "L'extraction n'a pas pu créer d'écriture. Réessayez ou saisissez manuellement.",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inattendue.';
      Alert.alert('Erreur', msg);
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  }

  const hasPages = pages.length > 0;

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="OCR"
        title={
          hasPages
            ? `Facture ${pages.length} page${pages.length > 1 ? 's' : ''}`
            : 'Scanner une facture'
        }
        subtitle={
          hasPages
            ? "Ajoute d'autres pages, retire-en, ou lance l'analyse."
            : 'Photographie ou importe ton justificatif'
        }
        compact
        showBack
      />

      {/* Galerie horizontale des pages ajoutées */}
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        {hasPages ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailRow}
          >
            {pages.map((page, index) => (
              <View key={`${page.uri}-${index}`} style={styles.thumbnailWrap}>
                {page.isPdf ? (
                  <View style={[styles.thumbnail, styles.pdfThumbnail]}>
                    <Text style={styles.pdfThumbIcon}>📄</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: page.uri }}
                    style={styles.thumbnail}
                  />
                )}
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>{index + 1}</Text>
                </View>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removePage(index)}
                  hitSlop={8}
                >
                  <Ionicons
                    name="close-circle"
                    size={24}
                    color={palette.danger}
                  />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <EmptyState
            icon="camera-outline"
            title="Aucune page"
            description="Photographie ta facture (1 photo par page si elle est multi-pages), ou importe un PDF. Tu peux mélanger photos et PDF."
          />
        )}
      </Card>

      {/* Boutons d'ajout + lancement */}
      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.actions}>
          <GradientButton
            label={
              hasPages
                ? `Ajouter une page (${pages.length}/${MAX_PAGES})`
                : 'Capturer une photo'
            }
            icon="camera-outline"
            onPress={() => void onCapture()}
            fullWidth
            disabled={uploading || pages.length >= MAX_PAGES}
          />
          <Button
            label="Choisir depuis la galerie"
            variant="ghost"
            icon="images-outline"
            onPress={() => void onPickFromGallery()}
            disabled={uploading || pages.length >= MAX_PAGES}
          />
          <Button
            label="Importer un PDF"
            variant="ghost"
            icon="document-attach-outline"
            onPress={() => void onPickPdf()}
            disabled={uploading || pages.length >= MAX_PAGES}
          />
          {hasPages ? (
            <Button
              label={
                phase === 'uploading'
                  ? `Upload ${pages.length} page${pages.length > 1 ? 's' : ''}…`
                  : phase === 'analyzing'
                    ? 'Analyse IA en cours…'
                    : `Lancer l'OCR (${pages.length} page${pages.length > 1 ? 's' : ''})`
              }
              variant="primary"
              icon="sparkles-outline"
              onPress={() => void onLaunchOcr()}
              loading={uploading}
              disabled={uploading}
            />
          ) : null}
        </View>
        {phase === 'analyzing' ? (
          <Text style={styles.phaseHint}>
            L'IA analyse {pages.length > 1 ? 'toutes les pages' : 'la facture'},
            cela peut prendre quelques secondes…
          </Text>
        ) : null}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  thumbnailRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  thumbnailWrap: {
    position: 'relative',
  },
  thumbnail: {
    width: 96,
    height: 128,
    borderRadius: 12,
    backgroundColor: palette.bgAlt,
  },
  pdfThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfThumbIcon: {
    fontSize: 40,
  },
  pageBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  pageBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: palette.bg,
    borderRadius: 12,
  },
  actions: {
    gap: spacing.sm,
  },
  phaseHint: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
