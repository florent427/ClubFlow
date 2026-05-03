import { useQuery } from '@apollo/client/react';
import {
  DataTable,
  ScreenContainer,
  ScreenHero,
  SearchBar,
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
import { StyleSheet, Text, View } from 'react-native';
import { CLUB_CONTACTS } from '../../lib/documents/contacts';
import type { MembersStackParamList } from '../../navigation/types';

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  linkedMemberId: string | null;
};

type Data = { clubContacts: Contact[] };

type Nav = NativeStackNavigationProp<MembersStackParamList, 'Contacts'>;

export function ContactsScreen() {
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const { data, loading, refetch } = useQuery<Data>(CLUB_CONTACTS, {
    errorPolicy: 'all',
  });

  const rows = useMemo<DataTableRow[]>(() => {
    const list = data?.clubContacts ?? [];
    const q = debounced.trim().toLowerCase();
    const filtered =
      q.length === 0
        ? list
        : list.filter(
            (c) =>
              c.firstName.toLowerCase().includes(q) ||
              c.lastName.toLowerCase().includes(q) ||
              c.email.toLowerCase().includes(q),
          );

    return filtered.map((c) => {
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Sans nom';
      return {
        key: c.id,
        title: fullName,
        subtitle: c.email,
        leading: <AvatarFallback initials={memberInitials(c)} />,
        badge: c.linkedMemberId
          ? {
              label: 'Lié',
              color: palette.successText,
              bg: palette.successBg,
            }
          : c.emailVerified
            ? {
                label: 'Vérifié',
                color: palette.infoText,
                bg: palette.infoBg,
              }
            : null,
      };
    });
  }, [data, debounced]);

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="CRM"
        title="Contacts"
        subtitle={`${data?.clubContacts?.length ?? 0} contacts`}
        showBack
        compact
      />
      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un contact…"
        />
      </View>
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={() => void refetch()}
        refreshing={loading}
        emptyTitle={debounced.length > 0 ? 'Aucun résultat' : 'Aucun contact'}
        emptySubtitle={
          debounced.length > 0
            ? `Aucun contact ne correspond à « ${debounced} ».`
            : 'Vos prospects et anciens membres apparaîtront ici.'
        }
        emptyIcon={debounced.length > 0 ? 'search-outline' : 'book-outline'}
        onPressRow={(id) => navigation.navigate('ContactDetail', { contactId: id })}
      />
    </ScreenContainer>
  );
}

function AvatarFallback({ initials }: { initials: string }) {
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
});

const avatarStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.smallStrong,
    color: palette.surface,
  },
});
