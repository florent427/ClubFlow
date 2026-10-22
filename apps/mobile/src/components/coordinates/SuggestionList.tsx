import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, radius, spacing, typography } from '../../lib/theme';

/**
 * Liste de suggestions sous un champ. Des `View` simples plutôt qu'une
 * FlatList : le champ vit dans une ScrollView (pas de liste virtualisée
 * imbriquée). Le parent doit passer `keyboardShouldPersistTaps="handled"`
 * à sa ScrollView pour qu'un choix ne soit pas avalé par le clavier.
 */
export function SuggestionList<T>({
  items,
  loading,
  keyOf,
  labelOf,
  onPick,
  icon = 'location-outline',
}: {
  items: T[];
  loading: boolean;
  keyOf: (item: T) => string;
  labelOf: (item: T) => string;
  onPick: (item: T) => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  if (!loading && items.length === 0) return null;
  return (
    <View style={styles.box}>
      {loading && items.length === 0 ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={styles.muted}>Recherche…</Text>
        </View>
      ) : null}
      {items.map((item, i) => (
        <Pressable
          key={keyOf(item)}
          onPress={() => onPick(item)}
          style={({ pressed }) => [
            styles.row,
            i > 0 && styles.rowBorder,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Ionicons name={icon} size={16} color={palette.muted} />
          <Text style={styles.label} numberOfLines={2}>
            {labelOf(item)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: palette.border },
  pressed: { backgroundColor: palette.primaryTint },
  label: { flex: 1, ...typography.small, color: palette.ink },
  muted: { ...typography.small, color: palette.muted },
});
