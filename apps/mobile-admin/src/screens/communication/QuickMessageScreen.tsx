import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
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
  type BottomAction,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SEND_QUICK_MESSAGE } from '../../lib/documents/communication';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MEMBERS,
} from '../../lib/documents/members';
import type { CommunicationStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<
  CommunicationStackParamList,
  'QuickMessage'
>;

type Channel = 'EMAIL' | 'PUSH' | 'TELEGRAM';
type RecipientType = 'MEMBER' | 'DYNAMIC_GROUP';

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  pseudo: string | null;
  email: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
};
type MembersData = { clubMembers: Member[] };

type DynamicGroup = {
  id: string;
  name: string;
  matchingActiveMembersCount: number;
};
type GroupsData = { clubDynamicGroups: DynamicGroup[] };

const CHANNELS: { key: Channel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'EMAIL', label: 'Email', icon: 'mail-outline' },
  { key: 'PUSH', label: 'Push', icon: 'notifications-outline' },
  { key: 'TELEGRAM', label: 'Telegram', icon: 'paper-plane-outline' },
];

export function QuickMessageScreen() {
  const navigation = useNavigation<Nav>();

  const [recipientType, setRecipientType] = useState<RecipientType>('MEMBER');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>(['PUSH']);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [memberSearch, setMemberSearch] = useState('');
  const debounced = useDebounced(memberSearch, 200);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  const membersQuery = useQuery<MembersData>(CLUB_MEMBERS, {
    errorPolicy: 'all',
    skip: recipientType !== 'MEMBER',
  });
  const groupsQuery = useQuery<GroupsData>(CLUB_DYNAMIC_GROUPS, {
    errorPolicy: 'all',
    skip: recipientType !== 'DYNAMIC_GROUP',
  });

  const [sendQuickMessage, { loading }] = useMutation(SEND_QUICK_MESSAGE);

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
      badge:
        m.id === memberId
          ? {
              label: 'Sélectionné',
              color: palette.successText,
              bg: palette.successBg,
            }
          : null,
    }));
  }, [filteredMembers, memberId]);

  const selectedGroup = useMemo(
    () =>
      groupsQuery.data?.clubDynamicGroups?.find((g) => g.id === groupId) ??
      null,
    [groupsQuery.data, groupId],
  );
  const groupActions = useMemo<BottomAction[]>(() => {
    return (groupsQuery.data?.clubDynamicGroups ?? []).map((g) => ({
      key: g.id,
      label: `${g.name} (${g.matchingActiveMembersCount})`,
      icon: 'filter-outline' as const,
      tone: g.id === groupId ? ('primary' as const) : ('neutral' as const),
    }));
  }, [groupsQuery.data, groupId]);

  const toggleChannel = (c: Channel) => {
    setChannels((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (trimmedTitle.length < 1) {
      Alert.alert('Champs manquants', 'Le titre est obligatoire.');
      return;
    }
    if (trimmedBody.length < 1) {
      Alert.alert('Champs manquants', 'Le corps du message est obligatoire.');
      return;
    }
    if (channels.length === 0) {
      Alert.alert('Canal manquant', 'Sélectionne au moins un canal.');
      return;
    }
    const recipientId = recipientType === 'MEMBER' ? memberId : groupId;
    if (!recipientId) {
      Alert.alert(
        'Destinataire manquant',
        recipientType === 'MEMBER'
          ? 'Sélectionne un adhérent.'
          : 'Sélectionne un groupe dynamique.',
      );
      return;
    }
    try {
      const result = await sendQuickMessage({
        variables: {
          input: {
            recipientType,
            recipientId,
            channels,
            title: trimmedTitle,
            body: trimmedBody,
          },
        },
      });
      const sent = (result.data as any)?.sendClubQuickMessage?.sent ?? 0;
      const failed = (result.data as any)?.sendClubQuickMessage?.failed ?? 0;
      Alert.alert(
        'Message envoyé',
        `${sent} succès / ${failed} échec${failed > 1 ? 's' : ''}.`,
      );
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Envoi impossible.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="MESSAGE"
        title="Message rapide"
        subtitle="Envoi flash multi-canaux"
        showBack
        compact
      />

      <View style={styles.body}>
        <Card title="Destinataire">
          <View style={styles.pillsRow}>
            <Pill
              label="Adhérent"
              icon="person-outline"
              tone={recipientType === 'MEMBER' ? 'primary' : 'neutral'}
              onPress={() => setRecipientType('MEMBER')}
            />
            <Pill
              label="Groupe dynamique"
              icon="filter-outline"
              tone={recipientType === 'DYNAMIC_GROUP' ? 'primary' : 'neutral'}
              onPress={() => setRecipientType('DYNAMIC_GROUP')}
            />
          </View>

          {recipientType === 'MEMBER' ? (
            <View style={[styles.fields, { marginTop: spacing.md }]}>
              <SearchBar
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Rechercher un membre…"
              />
              <View style={styles.tableBox}>
                <DataTable
                  data={memberRows}
                  loading={membersQuery.loading}
                  emptyTitle="Aucun membre"
                  emptySubtitle="Aucun membre actif trouvé."
                  emptyIcon="people-outline"
                  onPressRow={(id) => setMemberId(id)}
                />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: spacing.md }}>
              <Pressable
                onPress={() => setGroupPickerOpen(true)}
                style={({ pressed }) => [
                  styles.pickerBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons
                  name="filter-outline"
                  size={18}
                  color={palette.muted}
                />
                <Text style={styles.pickerValue} numberOfLines={1}>
                  {selectedGroup
                    ? `${selectedGroup.name} (${selectedGroup.matchingActiveMembersCount})`
                    : 'Choisir un groupe'}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={palette.muted}
                />
              </Pressable>
            </View>
          )}
        </Card>

        <Card title="Canaux">
          <View style={styles.pillsRow}>
            {CHANNELS.map((c) => (
              <Pill
                key={c.key}
                label={c.label}
                icon={c.icon}
                tone={channels.includes(c.key) ? 'primary' : 'neutral'}
                onPress={() => toggleChannel(c.key)}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Sélectionne un ou plusieurs canaux d'envoi.
          </Text>
        </Card>

        <Card title="Contenu">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Objet du message"
              autoCapitalize="sentences"
            />
            <TextField
              label="Message *"
              value={body}
              onChangeText={setBody}
              placeholder="Rédige ton message…"
              multiline
              numberOfLines={5}
              style={{ minHeight: 120 }}
            />
          </View>
        </Card>

        <Button
          label="Envoyer maintenant"
          variant="primary"
          icon="paper-plane-outline"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
        />
      </View>

      <BottomActionBar
        visible={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        title="Choisir un groupe"
        actions={
          groupActions.length > 0
            ? groupActions
            : [
                {
                  key: 'none',
                  label: 'Aucun groupe disponible',
                  icon: 'alert-circle-outline',
                  disabled: true,
                },
              ]
        }
        onAction={(key) => {
          if (key !== 'none') setGroupId(key);
          setGroupPickerOpen(false);
        }}
      />
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
  hint: {
    ...typography.small,
    color: palette.muted,
    marginTop: spacing.sm,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  pickerValue: {
    flex: 1,
    ...typography.body,
    color: palette.ink,
  },
  tableBox: {
    height: 280,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: palette.surface,
  },
});
