import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { orderedCountries, type Country } from '../../lib/coordinates';
import { palette, radius, spacing, typography } from '../../lib/theme';

type Row = { kind: 'country'; country: Country } | { kind: 'separator' };

/**
 * Liste des pays (drapeau, nom français, indicatif) : pays prioritaires en
 * tête, séparateur, puis tous les pays par ordre alphabétique. Partagée par
 * le sélecteur d'indicatif et le pays de naissance.
 */
export function CountryPickerModal({
  visible,
  title,
  selected,
  priority = [],
  exclude = [],
  showDialCode = true,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  selected?: string | null;
  priority?: readonly string[];
  exclude?: readonly string[];
  showDialCode?: boolean;
  onSelect: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(() => {
    const { priority: top, others } = orderedCountries({
      priority,
      exclude,
      query,
    });
    const out: Row[] = top.map((country) => ({ kind: 'country', country }));
    if (top.length > 0 && others.length > 0) out.push({ kind: 'separator' });
    for (const country of others) out.push({ kind: 'country', country });
    return out;
  }, [priority, exclude, query]);

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={palette.primary} />
        </Pressable>
      </View>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={palette.muted} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un pays ou un indicatif"
          placeholderTextColor={palette.mutedSoft}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={rows}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(row, i) =>
          row.kind === 'country' ? row.country.code : `sep-${i}`
        }
        renderItem={({ item }) =>
          item.kind === 'separator' ? (
            <View style={styles.separator} />
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                item.country.code === selected && styles.rowActive,
                pressed && styles.rowPressed,
              ]}
              onPress={() => {
                onSelect(item.country.code);
                close();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.flag}>{item.country.flag}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.country.name}
              </Text>
              {showDialCode ? (
                <Text style={styles.dial}>{item.country.dialCode}</Text>
              ) : null}
              {item.country.code === selected ? (
                <Ionicons name="checkmark" size={18} color={palette.primary} />
              ) : null}
            </Pressable>
          )
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun pays ne correspond.</Text>
        }
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: { ...typography.bodyStrong, fontSize: 18, color: palette.ink },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
  },
  search: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowActive: { backgroundColor: palette.primaryTint },
  rowPressed: { backgroundColor: palette.bgAlt },
  flag: { fontSize: 22 },
  name: { flex: 1, ...typography.body, color: palette.ink },
  dial: { ...typography.small, color: palette.muted },
  separator: {
    height: 1,
    backgroundColor: palette.borderStrong,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
  },
  empty: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
