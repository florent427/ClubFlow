import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  uploadMediaAsset,
  type MediaUploadKind,
  type UploadedMediaAsset,
} from '../../lib/media-upload';
import { palette, radius, spacing, typography } from '../../lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Appelé une fois le fichier uploadé avec succès — le parent ajoute
   *  l'asset à `pendingAttachments[]` du composer. */
  onUploaded: (asset: UploadedMediaAsset, kind: MediaUploadKind) => void;
};

type SourceKey = 'photo-camera' | 'photo-library' | 'video' | 'document';

/**
 * Bottom sheet "Ajouter une pièce jointe" — propose 4 sources :
 *  - Prendre une photo (caméra arrière)
 *  - Choisir une image (galerie)
 *  - Vidéo (galerie ; pour la caméra vidéo on attendra la phase 2)
 *  - Document (PDF)
 *
 * Chaque action lance le picker correspondant puis upload le fichier
 * via `/media/upload?kind=...`. En cas de succès, ferme la sheet et
 * appelle `onUploaded` avec le `MediaAsset` créé. En cas d'erreur :
 * Alert + sheet reste ouverte pour permettre une nouvelle tentative.
 */
export function AttachmentPickerSheet({
  visible,
  onClose,
  onUploaded,
}: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<SourceKey | null>(null);

  async function handlePhotoCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à l'appareil photo dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    await runUpload('photo-camera', 'image', {
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
    });
  }

  async function handlePhotoLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    await runUpload('photo-library', 'image', {
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'image/jpeg',
    });
  }

  async function handleVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Accès refusé',
        "Autorisez l'accès à la galerie dans les réglages.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    await runUpload('video', 'video', {
      uri: a.uri,
      fileName: a.fileName ?? null,
      mimeType: a.mimeType ?? 'video/mp4',
    });
  }

  async function handleDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const a = result.assets[0];
    await runUpload('document', 'document', {
      uri: a.uri,
      fileName: a.name,
      mimeType: a.mimeType ?? 'application/pdf',
    });
  }

  async function runUpload(
    source: SourceKey,
    kind: MediaUploadKind,
    asset: { uri: string; fileName: string | null; mimeType: string },
  ) {
    setBusy(source);
    try {
      const uploaded = await uploadMediaAsset(asset, kind);
      onUploaded(uploaded, kind);
      onClose();
    } catch (err) {
      Alert.alert(
        'Upload impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>Ajouter une pièce jointe</Text>

        <View style={styles.row}>
          <SourceButton
            label="Photo"
            sublabel="Appareil"
            icon="camera-outline"
            onPress={() => void handlePhotoCamera()}
            busy={busy === 'photo-camera'}
            disabled={busy !== null}
          />
          <SourceButton
            label="Galerie"
            sublabel="Image"
            icon="image-outline"
            onPress={() => void handlePhotoLibrary()}
            busy={busy === 'photo-library'}
            disabled={busy !== null}
          />
          <SourceButton
            label="Vidéo"
            sublabel="≤ 50 Mo"
            icon="film-outline"
            onPress={() => void handleVideo()}
            busy={busy === 'video'}
            disabled={busy !== null}
          />
          <SourceButton
            label="PDF"
            sublabel="≤ 10 Mo"
            icon="document-attach-outline"
            onPress={() => void handleDocument()}
            busy={busy === 'document'}
            disabled={busy !== null}
          />
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cancelBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function SourceButton({
  label,
  sublabel,
  icon,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  sublabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.sourceBtn,
        pressed && !disabled && { opacity: 0.85 },
        disabled && !busy && { opacity: 0.5 },
      ]}
    >
      <View style={styles.sourceIcon}>
        {busy ? (
          <ActivityIndicator color={palette.primary} />
        ) : (
          <Ionicons name={icon} size={26} color={palette.primary} />
        )}
      </View>
      <Text style={styles.sourceLabel}>{label}</Text>
      <Text style={styles.sourceSub}>{sublabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    marginBottom: spacing.sm,
  },
  title: { ...typography.h3, color: palette.ink, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  sourceBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  sourceIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sourceLabel: {
    ...typography.smallStrong,
    color: palette.ink,
  },
  sourceSub: {
    ...typography.caption,
    color: palette.muted,
  },
  cancelBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: palette.bg,
    borderRadius: radius.md,
  },
  cancelText: {
    ...typography.bodyStrong,
    color: palette.body,
  },
});
