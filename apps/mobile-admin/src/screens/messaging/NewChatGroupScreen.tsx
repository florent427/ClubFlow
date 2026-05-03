import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  DataTable,
  Pill,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  TextField,
  memberDisplayName,
  palette,
  spacing,
  typography,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  ADMIN_CREATE_CHAT_GROUP,
  CLUB_CHAT_ROOMS_ADMIN,
} from '../../lib/documents/messaging';
import { CLUB_MEMBERS } from '../../lib/documents/members';
import type { MessagingStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MessagingStackParamList, 'NewChatGroup'>;

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};
type MembersData = { clubMembers: Member[] };

type ChannelMode = 'OPEN' | 'RESTRICTED' | 'READ_ONLY';

const MODE_LABELS: Record<ChannelMode, string> = {
  OPEN: 'Ouvert',
  RESTRICTED: 'Restreint',
  READ_ONLY: 'Lecture seule',
};

export function NewChatGroupScreen() {
  const navigation = useNavigation<Nav>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [channelMode, setChannelMode] = useState<ChannelMode>('OPEN');
  const [isBroadcastChannel, setIsBroadcastChannel] = useState(false);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);

  const membersQuery = useQuery<MembersData>(CLUB_MEMBERS, {
    errorPolicy: 'all',
  });

  const [createGroup, { loading }] = useMutation(ADMIN_CREATE_CHAT_GROUP, {
    refetchQueries: [{ query: CLUB_CHAT_ROOMS_ADMIN }],
  });

  const filteredMembers = useMemo(() => {
    const list = (membersQuery.data?.clubMembers ?? []).filter(
      (m) => m.status === 'ACTIVE',
    );
    const q = debounced.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter(
      (m) =>
        m.firstName.toLowerCase().includes(q) ||
        m.lastName.toLowerCase().includes(q) ||
        (m.pseudo?.toLowerCase().includes(q) ?? false) ||
        (m.email?.toLowerCase().includes(q) ?? false),
    );
  }, [membersQuery.data, debounced]);

  const memberRows = useMemo<DataTableRow[]>(() => {
    return filteredMembers.map((m) => ({
      key: m.id,
      title: memberDisplayName(m),
      subtitle: m.email ?? null,
      badge: memberIds.has(m.id)
        ? {
            label: '✓',
            color: palette.successText,
            bg: palette.successBg,
          }
        : null,
    }));
  }, [filteredMembers, memberIds]);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      Alert.alert('Nom invalide', 'Le nom doit faire entre 2 et 80 caractères.');
      return;
    }
    if (memberIds.size === 0) {
      Alert.alert(
        'Aucun membre',
        'Ajoute au moins un membre dans ce salon.',
      );
      return;
    }
    try {
      await createGroup({
        variables: {
          input: {
            name: trimmed,
            description:
              description.trim().length > 0 ? description.trim() : null,
            channelMode,
            isBroadcastChannel,
            memberIds: [...memberIds],
            membershipScopes: [],
            writePermissions: [],
          },
        },
      });
      Alert.alert('Salon créé', 'Le salon a bien été créé.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Création impossible.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding scroll={false}>
      <ScreenHero
        eyebrow="NOUVEAU"
        title="Nouveau salon"
        subtitle="Discussion de groupe"
        showBack
        compact
      />

      <View style={styles.body}>
        <Card title="Informations">
          <View style={styles.fields}>
            <TextField
              label="Nom *"
              value={name}
              onChangeText={setName}
              placeholder="Ex : Coach U13"
              autoCapitalize="sentences"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="À quoi sert ce salon ?"
              multiline
              numberOfLines={3}
            />
          </View>
        </Card>

        <Card title="Mode du salon">
          <View style={styles.pillsRow}>
            {(['OPEN', 'RESTRICTED', 'READ_ONLY'] as ChannelMode[]).map((m) => (
              <Pill
                key={m}
                label={MODE_LABELS[m]}
                tone={channelMode === m ? 'primary' : 'neutral'}
                onPress={() => setChannelMode(m)}
              />
            ))}
          </View>
          <View style={[styles.pillsRow, { marginTop: spacing.md }]}>
            <Pill
              label={
                isBroadcastChannel
                  ? 'Canal de diffusion'
                  : 'Discussion classique'
              }
              tone={isBroadcastChannel ? 'primary' : 'neutral'}
              icon={
                isBroadcastChannel
                  ? 'megaphone-outline'
                  : 'chatbubbles-outline'
              }
              onPress={() => setIsBroadcastChannel((v) => !v)}
            />
          </View>
        </Card>

        <Card title={`Membres (${memberIds.size})`}>
          <View style={styles.fields}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un membre…"
            />
            <View style={styles.tableBox}>
              <DataTable
                data={memberRows}
                loading={membersQuery.loading}
                emptyTitle="Aucun membre"
                emptySubtitle="Aucun membre actif trouvé."
                emptyIcon="people-outline"
                onPressRow={toggleMember}
              />
            </View>
            <Text style={styles.hint}>
              Touche un membre pour l'ajouter ou le retirer du salon.
            </Text>
          </View>
        </Card>

        <Button
          label="Créer le salon"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  fields: { gap: spacing.md },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...typography.small, color: palette.muted },
  tableBox: {
    height: 320,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
});
