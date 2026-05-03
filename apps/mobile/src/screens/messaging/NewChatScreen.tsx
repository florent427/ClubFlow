import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import { EmptyState, ScreenHero } from '../../components/ui';
import {
  VIEWER_GET_OR_CREATE_DIRECT_CHAT,
  VIEWER_SEARCH_CLUB_MEMBERS,
} from '../../lib/messaging-documents';
import { absolutizeMediaUrl } from '../../lib/absolutize-url';
import { palette, radius, spacing, typography } from '../../lib/theme';
import type { MessagingStackParamList, ChatRoomRow } from './types';

type SearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  photoUrl: string | null;
};

type SearchData = {
  viewerSearchClubMembers: SearchResult[];
};

type DirectChatData = {
  viewerGetOrCreateDirectChat: ChatRoomRow;
};

type Nav = NativeStackNavigationProp<MessagingStackParamList>;

/**
 * **Nouvelle conversation** — recherche unifiée d'un adhérent par
 * pseudo / prénom / nom dans un seul champ. Sélection → ouverture
 * (ou récupération idempotente) d'un chat 1-on-1.
 *
 * Backend :
 *  - `viewerSearchClubMembers(q)` — match insensible à la casse
 *    sur pseudo, firstName, lastName ; min. 2 caractères
 *  - `viewerGetOrCreateDirectChat(peerMemberId)` — récupère ou crée
 *    le salon direct (clé unique par paire)
 *
 * UX :
 *  - Champ de recherche autofocus en haut (sous le hero)
 *  - Debounce 250 ms pour limiter les calls API pendant la frappe
 *  - Liste virtualizée des résultats avec avatar + nom + pseudo
 *  - Tap → mutation getOrCreate + navigation vers MessagingThread
 */
export function NewChatScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce 250 ms sur la frappe — évite de cracher 1 requête par
  // touche tout en restant réactif perceptuellement.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  const { data, loading } = useQuery<SearchData>(VIEWER_SEARCH_CLUB_MEMBERS, {
    variables: { q: debouncedQuery, limit: 20 },
    skip: debouncedQuery.length < 2,
    fetchPolicy: 'cache-and-network',
  });

  const [openDirect, { loading: opening }] =
    useMutation<DirectChatData>(VIEWER_GET_OR_CREATE_DIRECT_CHAT);

  const results = data?.viewerSearchClubMembers ?? [];
  const showHint = debouncedQuery.length < 2;
  const showEmpty =
    !showHint && !loading && results.length === 0;

  async function handleSelect(member: SearchResult) {
    if (opening) return;
    try {
      const { data } = await openDirect({
        variables: { peerMemberId: member.id },
      });
      const room = data?.viewerGetOrCreateDirectChat;
      if (!room) return;
      // Replace pour ne pas empiler NewChat dans l'historique.
      navigation.replace('MessagingThread', { roomId: room.id });
    } catch {
      // Erreur silencieuse — on pourrait afficher un toast.
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHero
        eyebrow="MESSAGERIE"
        title="Nouvelle conversation"
        subtitle="Recherchez un membre du club par pseudo, prénom ou nom."
        gradient="hero"
        showBack
        compact
      />

      {/* Champ de recherche */}
      <View style={styles.searchBox}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Pseudo, prénom ou nom…"
            placeholderTextColor={palette.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Rechercher un membre"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={palette.muted}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Résultats */}
      {showHint ? (
        <View style={styles.hintBox}>
          <Ionicons
            name="people-outline"
            size={36}
            color={palette.muted}
          />
          <Text style={styles.hintText}>
            Saisissez au moins 2 caractères pour rechercher.
          </Text>
        </View>
      ) : showEmpty ? (
        <View style={styles.errorBox}>
          <EmptyState
            icon="person-remove-outline"
            title="Aucun résultat"
            description={`Aucun membre ne correspond à « ${debouncedQuery} ». Vérifiez l'orthographe.`}
            variant="card"
          />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            loading ? (
              <ActivityIndicator
                style={styles.listLoader}
                color={palette.primary}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              onPress={() => void handleSelect(item)}
              disabled={opening}
            />
          )}
        />
      )}

      {opening ? (
        <View style={styles.openingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.openingText}>Ouverture de la conversation…</Text>
        </View>
      ) : null}
    </View>
  );
}

function MemberRow({
  member,
  onPress,
  disabled,
}: {
  member: SearchResult;
  onPress: () => void;
  disabled?: boolean;
}) {
  const photoUrl = absolutizeMediaUrl(member.photoUrl);
  const initials = `${member.firstName[0] ?? '?'}${member.lastName[0] ?? ''}`
    .toUpperCase()
    .trim();
  const fullName = `${member.firstName} ${member.lastName}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Démarrer une conversation avec ${fullName}`}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.avatar}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials || '?'}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {fullName}
        </Text>
        {member.pseudo ? (
          <Text style={styles.pseudo} numberOfLines={1}>
            @{member.pseudo}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={20}
        color={palette.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.bg },

  searchBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: palette.bg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
    padding: 0,
  },

  hintBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.giant,
    alignItems: 'center',
    gap: spacing.sm,
  },
  hintText: {
    ...typography.body,
    color: palette.muted,
    textAlign: 'center',
  },
  errorBox: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },

  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  listLoader: {
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  rowPressed: { opacity: 0.85 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.bgAlt,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
  },
  avatarInitials: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  name: {
    ...typography.bodyStrong,
    color: palette.ink,
  },
  pseudo: {
    ...typography.caption,
    color: palette.muted,
    marginTop: 2,
  },

  openingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  openingText: {
    ...typography.bodyStrong,
    color: '#ffffff',
  },
});
