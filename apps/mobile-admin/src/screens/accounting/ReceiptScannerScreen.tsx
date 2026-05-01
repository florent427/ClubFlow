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
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { SUBMIT_RECEIPT_FOR_OCR } from '../../lib/documents/accounting';
import { storage } from '../../lib/storage';
import type { AccountingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AccountingStackParamList, 'ReceiptScanner'>;

type SubmitOcrResult = {
  submitReceiptForOcr: {
    extractionId: string | null;
    entryId: string | null;
    duplicateOfEntryId: string | null;
    budgetBlocked: boolean;
  };
};

function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE;
  if (explicit) return explicit.replace(/\/$/, '');
  const graphql =
    process.env.EXPO_PUBLIC_GRAPHQL_HTTP ?? 'http://localhost:3000/graphql';
  return graphql.replace(/\/graphql\/?$/, '') || 'http://localhost:3000';
}

/**
 * Représentation unifiée d'un fichier sélectionné (image OU PDF). Cette
 * forme reste compatible avec l'ancien API ImagePickerAsset utilisée
 * dans le composant + ajoute le support PDF multi-pages via expo-document-picker.
 */
type PickedFile = {
  uri: string;
  fileName: string | null;
  mimeType: string;
  /** True si c'est un PDF — affiche une icône PDF au lieu de l'image. */
  isPdf: boolean;
};

export function ReceiptScannerScreen() {
  const navigation = useNavigation<Nav>();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'uploading' | 'analyzing' | 'done'
  >('idle');

  const [submitOcr] = useMutation<SubmitOcrResult>(SUBMIT_RECEIPT_FOR_OCR);

  async function onCapture() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la caméra dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      // expo-image-picker v17+ : `MediaTypeOptions` est déprécié — on
      // passe un tableau de `MediaType` ('images' / 'videos' / 'livePhotos').
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    setPicked({
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
      isPdf: false,
    });
    setPhase('idle');
  }

  async function onPickFromGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      // expo-image-picker v17+ : `MediaTypeOptions` est déprécié — on
      // passe un tableau de `MediaType` ('images' / 'videos' / 'livePhotos').
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    setPicked({
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
      isPdf: false,
    });
    setPhase('idle');
  }

  /**
   * Sélection d'un PDF (factures multi-pages, scans). expo-document-picker
   * ouvre le picker système (Drive/Files/iCloud). On ne demande pas de
   * permission caméra/photos — c'est un picker fichier natif.
   */
  async function onPickPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    setPicked({
      uri: a.uri,
      fileName: a.name ?? `facture-${Date.now()}.pdf`,
      mimeType: a.mimeType ?? 'application/pdf',
      isPdf: true,
    });
    setPhase('idle');
  }

  async function onLaunchOcr() {
    if (!picked) return;
    const token = await storage.getToken();
    const clubId = await storage.getClubId();
    if (!token || !clubId) {
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
      return;
    }
    setUploading(true);
    setPhase('uploading');
    try {
      const form = new FormData();
      const fileName =
        picked.fileName ??
        (picked.isPdf
          ? `facture-${Date.now()}.pdf`
          : `receipt-${Date.now()}.jpg`);
      const mimeType = picked.mimeType;
      form.append('file', {
        uri: picked.uri,
        name: fileName,
        type: mimeType,
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
          `Upload échoué (HTTP ${res.status}). ${text.slice(0, 200)}`,
        );
      }
      const asset = (await res.json()) as { id: string };
      setPhase('analyzing');
      const ocrResult = await submitOcr({
        variables: { mediaAssetId: asset.id },
      });
      const entryId = ocrResult.data?.submitReceiptForOcr?.entryId;
      const duplicateOf = ocrResult.data?.submitReceiptForOcr?.duplicateOfEntryId;
      const budgetBlocked = ocrResult.data?.submitReceiptForOcr?.budgetBlocked;
      setPhase('done');
      if (budgetBlocked) {
        Alert.alert(
          'Budget IA atteint',
          'Le budget mensuel d\'extraction IA est atteint. Saisissez manuellement.',
        );
        return;
      }
      const targetId = entryId ?? duplicateOf;
      if (targetId) {
        navigation.replace('EntryDetail', { entryId: targetId });
      } else {
        Alert.alert(
          'Analyse incomplète',
          "L'extraction n'a pas pu créer d'écriture. Réessayez ou saisissez manuellement.",
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue.";
      Alert.alert('Erreur', msg);
      setPhase('idle');
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScreenContainer padding={0}>
      <ScreenHero
        eyebrow="OCR"
        title="Scanner un reçu"
        subtitle="Photographiez votre justificatif"
        compact
        showBack
      />

      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        {picked ? (
          <View style={styles.previewWrap}>
            {picked.isPdf ? (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfIcon}>📄</Text>
                <Text style={styles.pdfLabel}>Document PDF</Text>
              </View>
            ) : (
              <Image source={{ uri: picked.uri }} style={styles.preview} />
            )}
            <Text style={styles.previewMeta}>
              {picked.fileName ?? (picked.isPdf ? 'Facture PDF' : 'Photo capturée')}
            </Text>
          </View>
        ) : (
          <EmptyState
            icon="camera-outline"
            title="Aucun fichier"
            description="Photographie un reçu, choisis-en un dans la galerie, ou importe une facture PDF (multi-pages OK)."
          />
        )}
      </Card>

      <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}>
        <View style={styles.actions}>
          <GradientButton
            label={picked ? 'Reprendre une photo' : 'Capturer une photo'}
            icon="camera-outline"
            onPress={() => void onCapture()}
            fullWidth
          />
          <Button
            label="Choisir depuis la galerie"
            variant="ghost"
            icon="images-outline"
            onPress={() => void onPickFromGallery()}
          />
          <Button
            label="Importer un PDF (facture multi-pages)"
            variant="ghost"
            icon="document-attach-outline"
            onPress={() => void onPickPdf()}
          />
          {picked ? (
            <Button
              label={
                phase === 'uploading'
                  ? 'Upload…'
                  : phase === 'analyzing'
                    ? 'Analyse en cours…'
                    : 'Lancer l\'OCR'
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
            L'IA analyse votre reçu, cela peut prendre quelques secondes…
          </Text>
        ) : null}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  previewWrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: palette.bgAlt,
  },
  pdfPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: palette.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  pdfIcon: {
    fontSize: 96,
  },
  pdfLabel: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  previewMeta: {
    ...typography.small,
    color: palette.muted,
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
