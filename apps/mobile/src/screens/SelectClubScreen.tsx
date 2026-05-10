import { useLazyQuery } from '@apollo/client/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenHero } from '../components/ui';
import { SEARCH_PUBLIC_CLUBS } from '../lib/viewer-documents';
import * as storage from '../lib/storage';
import { palette, radius, shadow, spacing, typography } from '../lib/theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SelectClub'>;

type PublicClub = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  tagline: string | null;
};

/**
 * Écran d'accueil affiché au 1er lancement (avant Login). L'utilisateur
 * recherche son club via autocomplete, le choisit, puis arrive sur
 * Login. Le club sélectionné est stocké en AsyncStorage et envoyé en
 * `x-club-id` à toutes les queries (publiques + authentifiées).
 *
 * "Changer de club" depuis Settings réinitialise et ramène ici.
 */
export function SelectClubScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [search, { data, loading }] = useLazyQuery<{
    searchPublicClubs: PublicClub[];
  }>(SEARCH_PUBLIC_CLUBS, { fetchPolicy: 'network-only' });

  // Debounce 250 ms : évite de bombarder l'API à chaque keypress.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (query.trim().length < 2) return;
    timeoutRef.current = setTimeout(() => {
      void search({ variables: { query: query.trim() } });
    }, 250);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query, search]);

  const results = data?.searchPublicClubs ?? [];

  async function handleSelect(club: PublicClub) {
    await storage.setSelectedClub({
      id: club.id,
      slug: club.slug,
      name: club.name,
      logoUrl: club.logoUrl,
    });
    navigation.replace('Login');
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="BIENVENUE"
        title="Quel est votre club ?"
        subtitle="Tapez le nom de votre club pour accéder à votre espace."
        gradient="hero"
      />
      <View style={styles.body}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={palette.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="ex. Shotokan, Karaté Sud, …"
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        {query.trim().length < 2 ? (
          <View style={styles.empty}>
            <Ionicons
              name="search-outline"
              size={48}
              color={palette.muted}
            />
            <Text style={styles.emptyText}>
              Saisissez au moins 2 lettres pour rechercher.
            </Text>
            <Text style={styles.hint}>
              Vous ne trouvez pas votre club ? Demandez à votre dirigeant
              le nom exact ou le lien d'invitation.
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.primary} />
            <Text style={styles.hint}>Recherche…</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={palette.warningText}
            />
            <Text style={styles.emptyText}>Aucun club trouvé.</Text>
            <Text style={styles.hint}>
              Vérifiez l'orthographe ou demandez le nom exact à votre club.
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void handleSelect(item)}
                style={({ pressed }) => [
                  styles.clubRow,
                  pressed && styles.clubRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Choisir ${item.name}`}
              >
                {item.logoUrl ? (
                  <Image
                    source={{ uri: item.logoUrl }}
                    style={styles.clubLogo}
                  />
                ) : (
                  <View style={[styles.clubLogo, styles.clubLogoFallback]}>
                    <Text style={styles.clubLogoInitials}>
                      {item.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName}>{item.name}</Text>
                  {item.tagline ? (
                    <Text style={styles.clubTagline}>{item.tagline}</Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={palette.muted}
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },
  body: { flex: 1, paddingHorizontal: spacing.xl, marginTop: -spacing.lg },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
    paddingVertical: 6,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emptyText: { ...typography.bodyStrong, color: palette.body },
  hint: {
    ...typography.small,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  clubRowPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  clubLogo: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.bgAlt,
  },
  clubLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubLogoInitials: {
    ...typography.bodyStrong,
    color: palette.primary,
    fontSize: 16,
  },
  clubName: { ...typography.bodyStrong, color: palette.ink },
  clubTagline: {
    ...typography.small,
    color: palette.muted,
    marginTop: 2,
  },
});
