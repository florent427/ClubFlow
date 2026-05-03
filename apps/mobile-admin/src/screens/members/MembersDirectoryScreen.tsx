import { useQuery } from '@apollo/client/react';
import {
  AnimatedPressable,
  DataTable,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  memberDisplayName,
  memberInitials,
  palette,
  spacing,
  typography,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CLUB_MEMBERS } from '../../lib/documents/members';
import type { MembersStackParamList } from '../../navigation/types';

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  photoUrl: string | null;
  gradeLevel: { id: string; label: string } | null;
};

function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';
}

function absolutizePhotoUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${getApiBaseUrl()}${url.startsWith('/') ? url : `/${url}`}`;
}

type Data = { clubMembers: MemberRow[] };

type Nav = NativeStackNavigationProp<MembersStackParamList, 'Directory'>;

const STATUS_BADGE = {
  ACTIVE: { label: 'Actif', color: palette.successText, bg: palette.successBg },
  INACTIVE: {
    label: 'Inactif',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  ARCHIVED: {
    label: 'Archivé',
    color: palette.muted,
    bg: palette.bgAlt,
  },
} as const;

export function MembersDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, loading, refetch } = useQuery<Data>(CLUB_MEMBERS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubMembers ?? [];
    const filtered = debounced.trim().length === 0
      ? list
      : list.filter((m) => {
          const q = debounced.toLowerCase();
          return (
            m.firstName.toLowerCase().includes(q) ||
            m.lastName.toLowerCase().includes(q) ||
            (m.pseudo?.toLowerCase().includes(q) ?? false) ||
            (m.email?.toLowerCase().includes(q) ?? false)
          );
        });

    return filtered.map((m) => ({
      key: m.id,
      title: memberDisplayName(m),
      subtitle: [m.email, m.gradeLevel?.label].filter(Boolean).join(' · '),
      badge: STATUS_BADGE[m.status],
      leading: (
        <Avatar
          photoUrl={absolutizePhotoUrl(m.photoUrl)}
          initials={memberInitials(m)}
        />
      ),
    }));
  }, [data, debounced]);

  return (
    <ScreenContainer scroll={false} padding={0}>
      <ScreenHero
        eyebrow="COMMUNAUTÉ"
        title="Adhérents"
        subtitle={`${data?.clubMembers?.length ?? 0} membres au total`}
        compact
        trailing={
          <AnimatedPressable
            onPress={() => navigation.navigate('NewMember')}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un membre"
            style={headerStyles.iconBtn}
          >
            <Ionicons name="add" size={22} color="#ffffff" />
          </AnimatedPressable>
        }
      />
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un membre…"
        />
      </View>
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle={
          debounced.length > 0 ? 'Aucun résultat' : 'Aucun adhérent'
        }
        emptySubtitle={
          debounced.length > 0
            ? `Aucun membre ne correspond à « ${debounced} ».`
            : 'Ajoutez vos premiers adhérents.'
        }
        emptyIcon={debounced.length > 0 ? 'search-outline' : 'people-outline'}
        onPressRow={(id) =>
          navigation.navigate('MemberDetail', { memberId: id })
        }
      />
      <Pressable
        onPress={() => navigation.navigate('NewMember')}
        style={({ pressed }) => [
          styles.fab,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un membre"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>
    </ScreenContainer>
  );
}

function Avatar({
  photoUrl,
  initials,
}: {
  photoUrl: string | null;
  initials: string;
}) {
  if (photoUrl) {
    return (
      <View style={avatarStyles.wrap}>
        <Image
          source={{ uri: photoUrl }}
          style={avatarStyles.img}
          resizeMode="cover"
        />
      </View>
    );
  }
  return (
    <View style={avatarStyles.wrap}>
      <Text style={avatarStyles.text}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});

const avatarStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: {
    width: 40,
    height: 40,
  },
  text: {
    ...typography.smallStrong,
    color: palette.surface,
  },
});

const headerStyles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
