import { useMutation, useQuery } from '@apollo/client/react';
import {
  Button,
  Card,
  Pill,
  ScreenContainer,
  ScreenHero,
  formatDateTime,
  palette,
  spacing,
  typography,
} from '@clubflow/mobile-shared';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  CLUB_MESSAGE_CAMPAIGNS,
  SEND_CAMPAIGN,
} from '../../lib/documents/communication';

type Campaign = {
  id: string;
  label: string;
  type: string;
  status: string;
  recipientCount: number;
  subject: string | null;
  body: string | null;
  createdAt: string;
  sentAt: string | null;
};

type Data = { clubMessageCampaigns: Campaign[] };

type RouteParams = { CampaignDetail: { campaignId: string } };

const TYPE_LABEL: Record<string, string> = {
  EMAIL: 'Email',
  PUSH: 'Push',
  TELEGRAM: 'Telegram',
  SMS: 'SMS',
};

const STATUS_TONE: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  DRAFT: { label: 'Brouillon', tone: 'neutral' },
  SCHEDULED: { label: 'Programmée', tone: 'warning' },
  SENT: { label: 'Envoyée', tone: 'success' },
};

export function CampaignDetailScreen() {
  const route = useRoute<RouteProp<RouteParams, 'CampaignDetail'>>();
  const nav = useNavigation();
  const { campaignId } = route.params;

  const { data, loading, refetch } = useQuery<Data>(CLUB_MESSAGE_CAMPAIGNS, {
    errorPolicy: 'all',
  });
  const [sendCampaign, { loading: sending }] = useMutation(SEND_CAMPAIGN);

  const campaign = data?.clubMessageCampaigns?.find((c) => c.id === campaignId);

  const handleSend = async () => {
    try {
      await sendCampaign({ variables: { id: campaignId } });
      await refetch();
      Alert.alert('Campagne envoyée', 'La diffusion a démarré.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Envoi impossible');
    }
  };

  const status = campaign ? STATUS_TONE[campaign.status] : undefined;

  return (
    <ScreenContainer
      scroll
      padding={0}
      onRefresh={() => void refetch()}
      refreshing={loading}
    >
      <ScreenHero
        eyebrow="CAMPAGNE"
        title={campaign?.label ?? 'Détail'}
        subtitle={
          campaign
            ? `${TYPE_LABEL[campaign.type] ?? campaign.type} · ${campaign.recipientCount} destinataire${campaign.recipientCount > 1 ? 's' : ''}`
            : 'Chargement…'
        }
        compact
        showBack
      />

      <View style={styles.body}>
        {campaign ? (
          <>
            <Card title="Statut">
              <View style={styles.row}>
                {status ? (
                  <Pill label={status.label} tone={status.tone} />
                ) : (
                  <Text style={styles.value}>{campaign.status}</Text>
                )}
              </View>
              <View style={styles.kvList}>
                <KV label="Créée le" value={formatDateTime(campaign.createdAt)} />
                <KV
                  label="Envoyée le"
                  value={
                    campaign.sentAt ? formatDateTime(campaign.sentAt) : '—'
                  }
                />
                <KV
                  label="Type"
                  value={TYPE_LABEL[campaign.type] ?? campaign.type}
                />
                <KV
                  label="Destinataires"
                  value={String(campaign.recipientCount)}
                />
              </View>
            </Card>

            {campaign.subject ? (
              <Card title="Objet">
                <Text style={styles.value}>{campaign.subject}</Text>
              </Card>
            ) : null}

            <Card title="Contenu">
              <Text style={styles.value}>
                {campaign.body && campaign.body.trim().length > 0
                  ? campaign.body
                  : 'Aucun contenu.'}
              </Text>
            </Card>

            {campaign.status === 'DRAFT' ? (
              <Button
                label="Envoyer maintenant"
                icon="paper-plane-outline"
                onPress={handleSend}
                loading={sending}
                fullWidth
              />
            ) : null}
          </>
        ) : !loading ? (
          <Card>
            <Text style={styles.value}>Campagne introuvable.</Text>
          </Card>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kvList: { marginTop: spacing.md, gap: spacing.sm },
  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  kvLabel: { ...typography.small, color: palette.muted },
  kvValue: { ...typography.smallStrong, color: palette.ink },
  value: { ...typography.body, color: palette.body },
});
