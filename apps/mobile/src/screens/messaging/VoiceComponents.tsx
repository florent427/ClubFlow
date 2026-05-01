import { useEffect, useRef, useState } from 'react';
/*
 * Import défensif d'`expo-audio`. Si le module natif n'est pas dispo
 * dans la version d'Expo Go installée (vieux build, SDK incompatible…),
 * `require` throw et on bascule sur un mode "vocal indisponible" plutôt
 * que de crasher l'app entière au boot.
 *
 * Cause initiale : SDK 55 a remplacé `expo-av` (déprécié) par
 * `expo-audio`, et certaines installations Expo Go n'ont pas encore
 * le nouveau module natif → `Cannot find native module 'ExpoAudio'`.
 */
let expoAudio: typeof import('expo-audio') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expoAudio = require('expo-audio');
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn(
    '[VoiceComponents] expo-audio indisponible — vocal désactivé.',
    err,
  );
}
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  uploadMediaAsset,
  type UploadedMediaAsset,
} from '../../lib/media-upload';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { palette, radius, spacing, typography } from '../../lib/theme';

/* ─────────────────────────────────────────────────────────────────
 * Recorder — bouton qui enregistre via expo-audio puis upload en
 * kind=audio. Affiche compteur + boutons annuler/envoyer pendant
 * l'enregistrement.
 *
 * **Pourquoi expo-audio et pas expo-av** : `expo-av` est déprécié
 * dans Expo SDK 55 et son module natif `ExponentAV` n'est plus inclus
 * dans Expo Go. La nouvelle lib `expo-audio` (recording + playback)
 * est l'API recommandée.
 * ───────────────────────────────────────────────────────────────── */

type VoiceRecorderProps = {
  /** Appelé après upload réussi avec le MediaAsset. */
  onRecorded: (asset: UploadedMediaAsset, durationMs: number) => void;
  /** Appelé pour signaler l'état "en train d'enregistrer" au parent. */
  onRecordingStateChange?: (recording: boolean) => void;
  /** Couleur du bouton (par défaut palette.primary). */
  color?: string;
};

export function VoiceRecorder({
  onRecorded,
  onRecordingStateChange,
  color = palette.primary,
}: VoiceRecorderProps) {
  // Si expo-audio n'est pas chargé (Expo Go incompatible), on n'affiche
  // pas le bouton micro — pas de crash, juste de la fonctionnalité absente.
  if (!expoAudio) return null;
  // Hook expo-audio chargé via le require défensif. ESLint ne sait pas
  // que `expoAudio` est non-null ici (vérifié à la ligne précédente).
  const recorder = expoAudio.useAudioRecorder(
    expoAudio.RecordingPresets.HIGH_QUALITY,
  );
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uploading, setUploading] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  // Cleanup au unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (recorder.isRecording) {
        void recorder.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (!expoAudio) return;
    try {
      const perm = await expoAudio.AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Accès micro refusé',
          "Autorisez l'accès au microphone dans les réglages.",
        );
        return;
      }
      // `setAudioModeAsync` est nécessaire pour que l'iOS sorte du mode
      // silencieux et autorise l'enregistrement même si l'interrupteur
      // de sonnerie est sur silencieux.
      await expoAudio.setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      onRecordingStateChange?.(true);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 100);
    } catch (err) {
      Alert.alert(
        'Enregistrement impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    }
  }

  async function stop(send: boolean) {
    if (!isRecording) return;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const finalDurationMs = Date.now() - startedAtRef.current;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      setIsRecording(false);
      onRecordingStateChange?.(false);
      if (!send || !uri || finalDurationMs < 500) {
        // Trop court (< 0.5s) → on annule silencieusement, on évite
        // d'envoyer un vocal vide quand l'utilisateur tape juste sur
        // le bouton.
        return;
      }
      // Détection de l'extension réelle pour cohérence avec le MIME
      // détecté côté serveur (file-type).
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'm4a';
      const mime =
        ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'ogg'
            ? 'audio/ogg'
            : ext === 'webm'
              ? 'audio/webm'
              : 'audio/mp4';
      setUploading(true);
      const uploaded = await uploadMediaAsset(
        {
          uri,
          fileName: `voice-${Date.now()}.${ext}`,
          mimeType: mime,
        },
        'audio',
      );
      onRecorded(uploaded, finalDurationMs);
    } catch (err) {
      Alert.alert(
        'Envoi vocal impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    } finally {
      setUploading(false);
    }
  }

  if (uploading) {
    return (
      <View style={styles.recPill}>
        <ActivityIndicator size="small" color={color} />
        <Text style={[styles.recText, { color }]}>Envoi…</Text>
      </View>
    );
  }

  if (isRecording) {
    return (
      <View style={styles.recPill}>
        <View style={[styles.recDot, { backgroundColor: '#ef4444' }]} />
        <Text style={styles.recText}>{formatDuration(elapsedMs)}</Text>
        <Pressable
          onPress={() => void stop(false)}
          accessibilityRole="button"
          accessibilityLabel="Annuler le vocal"
          style={styles.recCancel}
          hitSlop={8}
        >
          <Ionicons name="close" size={20} color={palette.muted} />
        </Pressable>
        <Pressable
          onPress={() => void stop(true)}
          accessibilityRole="button"
          accessibilityLabel="Envoyer le vocal"
          style={[styles.recSend, { backgroundColor: color }]}
          hitSlop={8}
        >
          <Ionicons name="send" size={18} color="#ffffff" />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => void start()}
      accessibilityRole="button"
      accessibilityLabel="Enregistrer un message vocal"
      style={({ pressed }) => [styles.micBtn, pressed && { opacity: 0.7 }]}
      hitSlop={6}
    >
      <Ionicons name="mic" size={22} color={color} />
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Player — affiche durée + bouton play/pause sur un AttachmentRow
 * AUDIO. Lecture via expo-audio.
 * ───────────────────────────────────────────────────────────────── */

type VoicePlayerProps = {
  url: string;
  durationMs: number | null;
  /** Couleur d'accent (par défaut palette.primary). */
  color?: string;
};

export function VoicePlayer({
  url,
  durationMs,
  color = palette.primary,
}: VoicePlayerProps) {
  // Si expo-audio absent, on affiche un fallback "module indisponible"
  // au lieu de planter le rendu de la bulle.
  if (!expoAudio) {
    return (
      <View style={styles.playerUnavailable}>
        <Ionicons name="alert-circle-outline" size={18} color={palette.muted} />
        <Text style={styles.playerUnavailableText}>
          Lecteur vocal indisponible
        </Text>
      </View>
    );
  }
  // L'URL est rewrite localhost → IP LAN au cas où.
  const resolvedUrl = absolutizeMediaUrl(url) ?? url;
  // `useAudioPlayer` initialise un player à partir d'une source URI.
  // Le player est nettoyé automatiquement au unmount du composant.
  const player = expoAudio.useAudioPlayer({ uri: resolvedUrl });
  const status = expoAudio.useAudioPlayerStatus(player);

  const totalMs =
    status.duration > 0
      ? status.duration * 1000
      : durationMs && durationMs > 0
        ? durationMs
        : 0;
  const positionMs = status.currentTime * 1000;

  function toggle() {
    try {
      if (status.playing) {
        player.pause();
      } else {
        // Si on est à la fin (didJustFinish = position au max), on
        // remet à zéro avant de relancer.
        if (status.didJustFinish || (totalMs > 0 && positionMs >= totalMs)) {
          void player.seekTo(0);
        }
        player.play();
      }
    } catch (err) {
      Alert.alert(
        'Lecture impossible',
        err instanceof Error ? err.message : 'Erreur inconnue.',
      );
    }
  }

  const progressPct =
    totalMs > 0 ? Math.min(100, (positionMs / totalMs) * 100) : 0;

  return (
    <View style={styles.player}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Lecture'}
        style={({ pressed }) => [
          styles.playBtn,
          { backgroundColor: color },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={18}
          color="#ffffff"
        />
      </Pressable>
      <View style={styles.playerBody}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPct}%`, backgroundColor: color },
            ]}
          />
        </View>
        <Text style={styles.playerDuration}>
          {formatDuration(positionMs > 0 ? positionMs : totalMs)}
        </Text>
      </View>
    </View>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 160,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recText: {
    ...typography.smallStrong,
    color: palette.body,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  recCancel: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recSend: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 200,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerBody: {
    flex: 1,
    gap: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  playerDuration: {
    ...typography.caption,
    color: palette.muted,
    fontVariant: ['tabular-nums'],
  },
  playerUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playerUnavailableText: {
    ...typography.caption,
    color: palette.muted,
    fontStyle: 'italic',
  },
});
