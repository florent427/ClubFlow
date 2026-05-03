import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, shadow, spacing, typography } from '../../lib/theme';

const QUICK_REACT = ['❤️', '👍', '😂', '🙏', '🔥', '👏'];

export type ActionKey =
  | 'reply'
  | 'copy'
  | 'edit'
  | 'delete'
  | 'forward'
  | 'morereact';

type Props = {
  visible: boolean;
  /** Si true, expose Modifier + Supprimer (auteur du message). */
  isMine: boolean;
  /** Si true, expose Supprimer (modérateur du salon). */
  canModerate?: boolean;
  /** Le salon autorise-t-il à répondre dans un fil ? */
  canReply: boolean;
  onClose: () => void;
  onPickEmoji: (emoji: string) => void;
  onAction: (action: ActionKey) => void;
};

/**
 * Bottom sheet façon WhatsApp affichée au long-press d'un message :
 * - Une rangée d'emojis fréquents en haut (réaction rapide) + bouton "+"
 *   qui ouvre le picker complet (action `morereact`).
 * - Une liste d'actions : Répondre / Copier / Modifier / Supprimer /
 *   Transférer.
 *
 * `Modifier` est masqué si le viewer n'est pas l'auteur. `Supprimer`
 * apparaît si l'auteur ou si modérateur du salon.
 */
export function MessageActionsSheet({
  visible,
  isMine,
  canModerate = false,
  canReply,
  onClose,
  onPickEmoji,
  onAction,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          {/* Quick reactions */}
          <View style={styles.reactRow}>
            {QUICK_REACT.map((e) => (
              <Pressable
                key={e}
                onPress={() => onPickEmoji(e)}
                style={styles.reactBtn}
                accessibilityRole="button"
                accessibilityLabel={`Réagir avec ${e}`}
              >
                <Text style={styles.reactEmoji}>{e}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => onAction('morereact')}
              style={[styles.reactBtn, styles.reactMore]}
              accessibilityRole="button"
              accessibilityLabel="Plus d'emojis"
            >
              <Ionicons name="add" size={22} color={palette.body} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          {/* Actions */}
          {canReply ? (
            <ActionRow
              icon="return-down-forward"
              label="Répondre"
              onPress={() => onAction('reply')}
            />
          ) : null}
          <ActionRow
            icon="copy-outline"
            label="Copier"
            onPress={() => onAction('copy')}
          />
          <ActionRow
            icon="arrow-redo-outline"
            label="Transférer"
            onPress={() => onAction('forward')}
          />
          {isMine ? (
            <ActionRow
              icon="create-outline"
              label="Modifier"
              onPress={() => onAction('edit')}
            />
          ) : null}
          {isMine || canModerate ? (
            <ActionRow
              icon="trash-outline"
              label="Supprimer"
              tone="danger"
              onPress={() => onAction('delete')}
            />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  tone = 'neutral',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'neutral' | 'danger';
  onPress: () => void;
}) {
  const color = tone === 'danger' ? palette.danger : palette.ink;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.actionRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    ...shadow.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.borderStrong,
    marginBottom: spacing.md,
  },

  reactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  reactBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgAlt,
  },
  reactEmoji: { fontSize: 26 },
  reactMore: {
    backgroundColor: palette.bgAlt,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: spacing.sm,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  actionRowPressed: { backgroundColor: palette.bgAlt },
  actionLabel: { ...typography.bodyStrong, fontSize: 15 },
});
