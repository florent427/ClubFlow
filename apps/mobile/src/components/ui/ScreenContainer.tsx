import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing } from '../../lib/theme';

type Props = {
  children: ReactNode;
  /** Si true (défaut), wrap dans un ScrollView. Sinon View simple. */
  scroll?: boolean;
  /** Padding horizontal du contenu (défaut spacing.lg). */
  padding?: number;
  /** Background du conteneur (défaut palette.bg). */
  background?: string;
  /** Évite la barre de bouton coupée par le keyboard. */
  keyboardAvoiding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'style'>;
};

/**
 * Conteneur d'écran avec safe area + background standardisé.
 * Remplace le pattern répétitif `<View style={{flex:1, bg:#fff, padding:16}}>...</View>`
 * et gère le bord inférieur (notch / home indicator iOS).
 */
export function ScreenContainer({
  children,
  scroll = true,
  padding,
  background,
  keyboardAvoiding = false,
  contentContainerStyle,
  scrollViewProps,
}: Props) {
  const insets = useSafeAreaInsets();
  const padX = padding ?? spacing.lg;
  const bg = background ?? palette.bg;

  const inner = scroll ? (
    <ScrollView
      style={[styles.flex, { backgroundColor: bg }]}
      contentContainerStyle={[
        {
          paddingHorizontal: padX,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.lg,
        },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.flex,
        {
          backgroundColor: bg,
          paddingHorizontal: padX,
          paddingTop: spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
        },
      ]}
    >
      {children}
    </View>
  );

  if (!keyboardAvoiding) return inner;
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {inner}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
