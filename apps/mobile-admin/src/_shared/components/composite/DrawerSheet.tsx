import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, radius, shadow, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Si true (default), wrap children dans un ScrollView. */
  scrollable?: boolean;
  /** Footer sticky (boutons d'action). */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Bottom-sheet plein écran (90% hauteur) pour remplacer les Drawer
 * 560px du web. Header avec titre + bouton close, body scrollable,
 * footer optionnel sticky.
 */
export function DrawerSheet({
  visible,
  onClose,
  title,
  subtitle,
  scrollable = true,
  footer,
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            { paddingTop: insets.top + spacing.sm },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color={palette.body} />
            </Pressable>
          </View>

          {scrollable ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={{
                paddingHorizontal: spacing.lg,
                paddingBottom: footer ? 0 : insets.bottom + spacing.lg,
              }}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View
              style={[styles.body, { paddingHorizontal: spacing.lg }]}
            >
              {children}
            </View>
          )}

          {footer ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, spacing.md) },
              ]}
            >
              {footer}
            </View>
          ) : null}
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
    maxHeight: '92%',
    minHeight: '50%',
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.h1,
    color: palette.ink,
  },
  subtitle: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: palette.surface,
  },
});
