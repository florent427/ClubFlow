import { Audio } from 'expo-av';
import { useEffect, useRef, useState } from 'react';
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
 * Recorder — bouton press-and-hold qui enregistre via expo-av puis
 * upload en kind=audio. Affiche compteur et indicateur d'enregistrement.
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
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [uploading, setUploading] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  // Cleanup global au unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Accès micro refusé',
          "Autorisez l'accès au microphone dans les réglages.",
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const r = new Audio.Recording();
      // Preset HIGH_QUALITY donne du m4a (audio/mp4) sur iOS et 3gpp
      // ou m4a sur Android — tous deux dans la whitelist serveur.
      await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await r.startAsync();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(r);
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
    if (!recording) return;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const finalDurationMs = Date.now() - startedAtRef.current;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
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

  const isRecording = !!recording;

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
 * AUDIO. Lecture via expo-av Sound.
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
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const totalMs = durationMs && durationMs > 0 ? durationMs : 0;

  useEffect(() => {
    return () => {
      if (sound) {
        void sound.unloadAsync().catch(() => {});
      }
    };
  }, [sound]);

  async function toggle() {
    try {
      if (!sound) {
        const resolvedUrl = absolutizeMediaUrl(url) ?? url;
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: resolvedUrl },
          { shouldPlay: true },
        );
        setSound(s);
        setIsPlaying(true);
        s.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          setPositionMs(st.positionMillis);
          if (st.didJustFinish) {
            setIsPlaying(false);
            setPositionMs(0);
            void s.setPositionAsync(0);
          }
        });
        return;
      }
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
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
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Lecture'}
        style={({ pressed }) => [
          styles.playBtn,
          { backgroundColor: color },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
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
});
