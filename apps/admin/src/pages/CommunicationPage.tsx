import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MESSAGE_CAMPAIGNS,
  CREATE_CLUB_MESSAGE_CAMPAIGN,
  SEND_CLUB_MESSAGE_CAMPAIGN,
} from '../lib/documents';
import type {
  DynamicGroupsQueryData,
  MessageCampaignsQueryData,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'PUSH', label: 'Push' },
];

function channelLabel(code: string): string {
  return CHANNEL_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

function statusLabel(status: string): string {
  if (status === 'DRAFT') return 'Brouillon';
  if (status === 'SENT') return 'Envoyé';
  return status;
}

function formatSentAt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function CommunicationPage() {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState('EMAIL');
  /** Chaîne vide = tous les membres (pas de `dynamicGroupId` dans la mutation). */
  const [audienceGroupId, setAudienceGroupId] = useState('');

  const { data: campaignsData, refetch: refetchCampaigns } =
    useQuery<MessageCampaignsQueryData>(CLUB_MESSAGE_CAMPAIGNS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const [createDraft, { loading: creating }] = useMutation(
    CREATE_CLUB_MESSAGE_CAMPAIGN,
  );
  const [sendCampaign, { loading: sending }] = useMutation(
    SEND_CLUB_MESSAGE_CAMPAIGN,
  );

  const groups = groupsData?.clubDynamicGroups ?? [];
  const campaigns = campaignsData?.clubMessageCampaigns ?? [];

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, g.name);
    return m;
  }, [groups]);

  function audienceLabel(dynamicGroupId: string | null): string {
    if (!dynamicGroupId) return 'Tous les membres';
    return groupNameById.get(dynamicGroupId) ?? dynamicGroupId;
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Titre et message sont obligatoires.', 'error');
      return;
    }
    try {
      await createDraft({
        variables: {
          input: {
            title: title.trim(),
            body: body.trim(),
            channel,
            dynamicGroupId: audienceGroupId || undefined,
          },
        },
      });
      showToast('Brouillon enregistré.', 'success');
      setTitle('');
      setBody('');
      setChannel('EMAIL');
      setAudienceGroupId('');
      await refetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  async function onSendNow(campaignId: string) {
    if (!window.confirm('Envoyer cette campagne maintenant ?')) return;
    try {
      await sendCampaign({ variables: { campaignId } });
      showToast('Campagne envoyée.', 'success');
      await refetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Communication</p>
        <h1 className="members-loom__title">Communication &amp; campagnes</h1>
        <p className="members-loom__lede">
          Ciblez vos envois via les groupes dynamiques (ou tous les membres).
          Les brouillons peuvent être envoyés lorsque vous êtes prêt.
        </p>
      </header>

      <div className="members-loom__grid">
        <section className="members-panel members-panel--table">
          <h2 className="members-panel__h">Campagnes</h2>
          {campaigns.length === 0 ? (
            <p className="muted">Aucune campagne pour l’instant.</p>
          ) : (
            <div className="members-table-wrap">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Titre</th>
                    <th>Canal</th>
                    <th>Audience</th>
                    <th>Statut</th>
                    <th>Date d’envoi</th>
                    <th>Destinataires</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="members-table__name">{c.title}</span>
                      </td>
                      <td>{channelLabel(c.channel)}</td>
                      <td>{audienceLabel(c.dynamicGroupId)}</td>
                      <td>{statusLabel(c.status)}</td>
                      <td>{formatSentAt(c.sentAt)}</td>
                      <td>{c.recipientCount}</td>
                      <td>
                        {c.status === 'DRAFT' ? (
                          <button
                            type="button"
                            className="members-btn members-btn--primary"
                            disabled={sending}
                            onClick={() => void onSendNow(c.id)}
                          >
                            {sending ? 'Envoi…' : 'Envoyer maintenant'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="members-panel members-panel--aside">
          <h2 className="members-panel__h">Nouveau brouillon</h2>
          <p className="members-panel__p">
            Enregistrez un brouillon, puis envoyez-le depuis le tableau.
          </p>
          <form className="members-form" onSubmit={(e) => void onSaveDraft(e)}>
            <label className="members-field">
              <span className="members-field__label">Titre</span>
              <input
                className="members-field__input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label className="members-field">
              <span className="members-field__label">Message</span>
              <textarea
                className="members-field__input"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </label>
            <label className="members-field">
              <span className="members-field__label">Canal</span>
              <select
                className="members-field__input"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="members-field">
              <span className="members-field__label">Audience</span>
              <select
                className="members-field__input"
                value={audienceGroupId}
                onChange={(e) => setAudienceGroupId(e.target.value)}
              >
                <option value="">Tous les membres</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="members-actions">
              <button
                type="submit"
                className="members-btn members-btn--primary"
                disabled={creating}
              >
                {creating ? 'Enregistrement…' : 'Enregistrer le brouillon'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
