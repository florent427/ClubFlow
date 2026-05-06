import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { palette, radius, spacing } from '../../theme/tokens';
import { typography } from '../../theme/typography';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Rechercher…',
  onSubmit,
  autoFocus,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons
        name="search"
        size={18}
        color={palette.muted}
        style={{ marginRight: spacing.sm }}
      />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={18} color={palette.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.bgAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 44,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
    padding: 0,
  },
  clear: { marginLeft: spacing.xs },
});
