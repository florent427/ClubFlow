import { useMutation, useQuery } from '@apollo/client/react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BottomActionBar,
  ConfirmSheet,
  DataTable,
  FilterChipBar,
  ScreenContainer,
  ScreenHero,
  SearchBar,
  palette,
  spacing,
  useDebounced,
  type DataTableRow,
} from '@clubflow/mobile-shared';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import {
  CLUB_MESSAGE_CAMPAIGNS,
  DELETE_CAMPAIGN,
  SEND_CAMPAIGN,
} from '../../lib/documents/communication';

type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENT' | string;

type Campaign = {
  id: string;
  label: string;
  type: string;
  status: CampaignStatus;
  recipientCount: number;
  subject: string | null;
  body: string | null;
  createdAt: string;
  sentAt: string | null;
};

type Data = { clubMessageCampaigns: Campaign[] };

const STATUS_BADGE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  DRAFT: { label: 'Brouillon', color: palette.muted, bg: palette.bgAlt },
  SCHEDULED: {
    label: 'Programmée',
    color: palette.warningText,
    bg: palette.warningBg,
  },
  SENT: { label: 'Envoyée', color: palette.successText, bg: palette.successBg },
};

const TYPE_LABEL: Record<string, string> = {
  EMAIL: 'Email',
  PUSH: 'Push',
  TELEGRAM: 'Telegram',
  SMS: 'SMS',
};

export function CampaignsScreen() {
  const nav = useNavigation();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 200);
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, loading, refetch } = useQuery<Data>(CLUB_MESSAGE_CAMPAIGNS, {
    errorPolicy: 'all',
  });

  const [sendCampaign, { loading: sending }] = useMutation(SEND_CAMPAIGN);
  const [deleteCampaign, { loading: deleting }] = useMutation(DELETE_CAMPAIGN);

  const campaigns = data?.clubMessageCampaigns ?? [];
  const target = campaigns.find((c) => c.id === actionTargetId) ?? null;

  const rows = useMemo<DataTableRow[]>(() => {
    const q = debounced.trim().toLowerCase();
    return campaigns
      .filter((c) => statusFilter == null || c.status === statusFilter)
      .filter((c) => q.length === 0 || c.label.toLowerCase().includes(q))
      .map((c) => ({
        key: c.id,
        title: c.label,
        subtitle: `${TYPE_LABEL[c.type] ?? c.type} · ${c.recipientCount} destinataire${c.recipientCount > 1 ? 's' : ''}`,
        badge: STATUS_BADGE[c.status] ?? null,
      }));
  }, [campaigns, statusFilter, debounced]);

  const handleSend = async (id: string) => {
    try {
      await sendCampaign({ variables: { id } });
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Envoi impossible');
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteCampaign({ variables: { id: confirmDeleteId } });
      setConfirmDeleteId(null);
      await refetch();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Suppression impossible');
    }
  };

  return (
    <ScreenContainer padding={0} scroll={false}>
      <ScreenHero
        eyebrow="COMMUNICATION"
        title="Campagnes"
        subtitle={`${campaigns.length} campagne${campaigns.length > 1 ? 's' : ''}`}
        compact
      />
      <View style={styles.searchBar}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher une campagne…"
        />
      </View>
      <FilterChipBar
        chips={[
          { key: 'DRAFT', label: 'Brouillons' },
          { key: 'SCHEDULED', label: 'Programmées' },
          { key: 'SENT', label: 'Envoyées' },
        ]}
        activeKey={statusFilter}
        onSelect={setStatusFilter}
      />
      <DataTable
        data={rows}
        loading={loading}
        onRefresh={refetch}
        refreshing={loading}
        emptyTitle="Aucune campagne"
        emptySubtitle="Créez une nouvelle campagne pour vos membres."
        emptyIcon="megaphone-outline"
        onPressRow={(id) =>
          (nav as any).navigate('CampaignDetail', { campaignId: id })
        }
        onLongPressRow={(id) => {
          const c = campaigns.find((x) => x.id === id);
          if (c?.status === 'DRAFT') setActionTargetId(id);
        }}
      />
      <Pressable
        onPress={() => (nav as any).navigate('NewCampaign')}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel="Nouvelle campagne"
      >
        <Ionicons name="add" size={28} color={palette.surface} />
      </Pressable>

      <BottomActionBar
        visible={actionTargetId != null && target?.status === 'DRAFT'}
        onClose={() => setActionTargetId(null)}
        title={target?.label}
        actions={[
          {
            key: 'send',
            label: 'Envoyer maintenant',
            icon: 'paper-plane-outline',
            tone: 'primary',
            disabled: sending,
          },
          {
            key: 'delete',
            label: 'Supprimer',
            icon: 'trash-outline',
            tone: 'danger',
          },
        ]}
        onAction={(key) => {
          const id = actionTargetId;
          setActionTargetId(null);
          if (!id) return;
          if (key === 'send') void handleSend(id);
          if (key === 'delete') setConfirmDeleteId(id);
        }}
      />
      <ConfirmSheet
        visible={confirmDeleteId != null}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Supprimer la campagne ?"
        message="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        loading={deleting}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchBar: {
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
