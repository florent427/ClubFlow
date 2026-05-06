import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

export type BottomAction = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'neutral' | 'danger' | 'primary';
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  actions: BottomAction[];
  onAction: (key: string) => void;
  /** Titre optionnel au sommet du sheet. */
  title?: string;
};

/**
 * Bottom-sheet d'actions contextuelles (long-press menu).
 * Pattern similaire à MessageActionsSheet mais générique.
 */
export function BottomActionBar({
  visible,
  onClose,
  actions,
  onAction,
  title,
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
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => {
                if (a.disabled) return;
                onAction(a.key);
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && !a.disabled && styles.rowPressed,
                a.disabled && { opacity: 0.4 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <Ionicons
                name={a.icon}
                size={22}
                color={
                  a.tone === 'danger'
                    ? palette.danger
                    : a.tone === 'primary'
                      ? palette.primary
                      : palette.ink
                }
              />
              <Text
                style={[
                  styles.label,
                  {
                    color:
                      a.tone === 'danger'
                        ? palette.danger
                        : a.tone === 'primary'
                          ? palette.primary
                          : palette.ink,
                  },
                ]}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
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
  title: {
    ...typography.eyebrow,
    color: palette.muted,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  rowPressed: { backgroundColor: palette.bgAlt },
  label: { ...typography.bodyStrong, fontSize: 15 },
});
