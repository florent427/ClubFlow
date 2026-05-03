import { useMutation, useQuery } from '@apollo/client/react';
import {
  BottomActionBar,
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  TextField,
  palette,
  spacing,
  typography,
  type BottomAction,
} from '@clubflow/mobile-shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_MESSAGE_CAMPAIGNS,
  CREATE_CLUB_MESSAGE_CAMPAIGN,
} from '../../lib/documents/communication';
import { CLUB_DYNAMIC_GROUPS } from '../../lib/documents/members';
import type { CommunicationStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CommunicationStackParamList, 'NewCampaign'>;

type Channel = 'EMAIL' | 'PUSH' | 'TELEGRAM';

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

export function NewCampaignScreen() {
  const navigation = useNavigation<Nav>();

  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [groupId, setGroupId] = useState<string | null>(null); // null = "Tous"
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const groupsQuery = useQuery<GroupsData>(CLUB_DYNAMIC_GROUPS, {
    errorPolicy: 'all',
  });

  const [createCampaign, { loading }] = useMutation(
    CREATE_CLUB_MESSAGE_CAMPAIGN,
    { refetchQueries: [{ query: CLUB_MESSAGE_CAMPAIGNS }] },
  );

  const selectedGroup = useMemo(
    () =>
      groupsQuery.data?.clubDynamicGroups?.find((g) => g.id === groupId) ??
      null,
    [groupsQuery.data, groupId],
  );

  const groupActions = useMemo<BottomAction[]>(() => {
    const groups = groupsQuery.data?.clubDynamicGroups ?? [];
    return [
      {
        key: '__all',
        label: 'Tous les membres',
        icon: 'people-outline' as const,
        tone: groupId == null ? ('primary' as const) : ('neutral' as const),
      },
      ...groups.map((g) => ({
        key: g.id,
        label: `${g.name} (${g.matchingActiveMembersCount})`,
        icon: 'filter-outline' as const,
        tone: g.id === groupId ? ('primary' as const) : ('neutral' as const),
      })),
    ];
  }, [groupsQuery.data, groupId]);

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
    try {
      await createCampaign({
        variables: {
          input: {
            title: trimmedTitle,
            body: trimmedBody,
            channel,
            dynamicGroupId: groupId ?? undefined,
          },
        },
      });
      Alert.alert('Campagne créée', 'La campagne a bien été enregistrée.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de créer la campagne.');
    }
  };

  return (
    <ScreenContainer padding={0} keyboardAvoiding>
      <ScreenHero
        eyebrow="NOUVELLE"
        title="Nouvelle campagne"
        subtitle="Email, push ou Telegram"
        showBack
        compact
      />

      <View style={styles.body}>
        <Card title="Canal">
          <View style={styles.pillsRow}>
            {CHANNELS.map((c) => (
              <Pill
                key={c.key}
                label={c.label}
                icon={c.icon}
                tone={channel === c.key ? 'primary' : 'neutral'}
                onPress={() => setChannel(c.key)}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Sélectionne le canal d'envoi pour cette campagne.
          </Text>
        </Card>

        <Card title="Audience">
          <Pressable
            onPress={() => setGroupPickerOpen(true)}
            style={({ pressed }) => [
              styles.pickerBtn,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Choisir un groupe"
          >
            <Ionicons
              name={selectedGroup ? 'filter-outline' : 'people-outline'}
              size={18}
              color={palette.muted}
            />
            <Text style={styles.pickerValue} numberOfLines={1}>
              {selectedGroup
                ? `${selectedGroup.name} (${selectedGroup.matchingActiveMembersCount})`
                : 'Tous les membres'}
            </Text>
            <Ionicons name="chevron-down" size={18} color={palette.muted} />
          </Pressable>
          <Text style={styles.hint}>
            Tu peux cibler un groupe dynamique précis ou diffuser à tous les
            membres actifs.
          </Text>
        </Card>

        <Card title="Contenu">
          <View style={styles.fields}>
            <TextField
              label="Titre *"
              value={title}
              onChangeText={setTitle}
              placeholder="Objet de la campagne"
              autoCapitalize="sentences"
            />
            <TextField
              label="Message *"
              value={body}
              onChangeText={setBody}
              placeholder="Rédige ton message…"
              multiline
              numberOfLines={6}
              style={{ minHeight: 140 }}
            />
          </View>
        </Card>

        <Button
          label="Créer la campagne"
          variant="primary"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={loading}
          fullWidth
        />
      </View>

      <BottomActionBar
        visible={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        title="Cibler une audience"
        actions={groupActions}
        onAction={(key) => {
          setGroupId(key === '__all' ? null : key);
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
});
