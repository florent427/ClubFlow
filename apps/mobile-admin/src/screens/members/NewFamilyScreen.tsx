import { useMutation, useQuery } from '@apollo/client/react';
import {
  Card,
  GradientButton,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  TextField,
  memberDisplayName,
  memberInitials,
  palette,
  spacing,
  typography,
  useDebounced,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_FAMILIES,
  CLUB_MEMBERS,
  CREATE_CLUB_FAMILY,
} from '../../lib/documents/members';
import type { MembersStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MembersStackParamList, 'NewFamily'>;

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  email: string | null;
};

type Data = { clubMembers: Member[] };

export function NewFamilyScreen() {
  const navigation = useNavigation<Nav>();

  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, loading } = useQuery<Data>(CLUB_MEMBERS, {
    errorPolicy: 'all',
  });

  const [createFamily, { loading: creating }] = useMutation(
    CREATE_CLUB_FAMILY,
    {
      refetchQueries: [{ query: CLUB_FAMILIES }],
    },
  );

  const filtered = useMemo(() => {
    const list = data?.clubMembers ?? [];
    const q = debounced.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.pseudo?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }, [data, debounced]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (label.trim().length === 0) {
      Alert.alert('Champ requis', 'Le nom du foyer est obligatoire.');
      return;
    }
    if (selected.size === 0) {
      Alert.alert(
        'Aucun membre',
        'Sélectionnez au moins un adhérent à rattacher au foyer.',
      );
      return;
    }
    try {
      await createFamily({
        variables: {
          input: {
            label: label.trim(),
            memberIds: Array.from(selected),
          },
        },
      });
      Alert.alert('Foyer créé', 'Le nouveau foyer a été enregistré.');
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Impossible de créer le foyer.',
      );
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouveau foyer"
        subtitle={`${selected.size} membre${selected.size > 1 ? 's' : ''} sélectionné${selected.size > 1 ? 's' : ''}`}
        showBack
        compact
      />

      <View style={styles.content}>
        <Card title="Identité du foyer">
          <TextField
            label="Nom du foyer *"
            value={label}
            onChangeText={setLabel}
            autoCapitalize="words"
            placeholder="Ex : Famille Dupont"
          />
        </Card>

        <Card title="Membres">
          <View style={styles.searchWrap}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un membre…"
            />
          </View>

          {loading && filtered.length === 0 ? (
            <Text style={styles.helperText}>Chargement…</Text>
          ) : filtered.length === 0 ? (
            <Text style={styles.helperText}>Aucun membre trouvé.</Text>
          ) : (
            <View style={styles.list}>
              {filtered.map((m) => {
                const isSelected = selected.has(m.id);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggle(m.id)}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { opacity: 0.7 },
                      isSelected && styles.rowSelected,
                    ]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {memberInitials(m)}
                      </Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {memberDisplayName(m)}
                      </Text>
                      {m.email ? (
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {m.email}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.checkBubble,
                        isSelected && styles.checkBubbleOn,
                      ]}
                    >
                      {isSelected ? (
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={palette.surface}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        <GradientButton
          label={creating ? 'Création…' : 'Créer le foyer'}
          onPress={() => void onSubmit()}
          loading={creating}
          disabled={creating}
          iconRight="arrow-forward"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  searchWrap: { marginBottom: spacing.sm },
  helperText: {
    ...typography.small,
    color: palette.muted,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
  },
  rowSelected: { backgroundColor: palette.primaryTint },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.smallStrong,
    color: palette.surface,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  rowSubtitle: {
    ...typography.small,
    color: palette.muted,
  },
  checkBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBubbleOn: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
});
