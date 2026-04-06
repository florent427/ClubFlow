import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MESSAGE_CAMPAIGNS,
  CREATE_CLUB_MESSAGE_CAMPAIGN,
  DELETE_CLUB_MESSAGE_CAMPAIGN,
  SEND_CLUB_MESSAGE_CAMPAIGN,
  UPDATE_CLUB_MESSAGE_CAMPAIGN,
} from '../lib/documents';
import type {
  DynamicGroupsQueryData,
  MessageCampaignsQueryData,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';

const CHANNEL_KEYS = ['EMAIL', 'TELEGRAM', 'PUSH'] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];

const CHANNEL_OPTIONS: { value: ChannelKey; label: string }[] = [
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

function initialChannels(): Record<ChannelKey, boolean> {
  return { EMAIL: true, TELEGRAM: false, PUSH: false };
}

export function CommunicationPage() {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** Un brouillon est créé par canal coché (le backend ne stocke qu’un canal par campagne). */
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>(
    initialChannels,
  );
  /** En édition d’un brouillon existant : canal unique (select). */
  const [editChannel, setEditChannel] = useState<ChannelKey>('EMAIL');
  /** Chaîne vide = tous les membres (pas de `dynamicGroupId` dans la mutation). */
  const [audienceGroupId, setAudienceGroupId] = useState('');
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(
    null,
  );

  const { data: campaignsData, refetch: refetchCampaigns } =
    useQuery<MessageCampaignsQueryData>(CLUB_MESSAGE_CAMPAIGNS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(
    CLUB_DYNAMIC_GROUPS,
  );

  const [createDraft, { loading: creating }] = useMutation(
    CREATE_CLUB_MESSAGE_CAMPAIGN,
  );
  const [updateDraft, { loading: updating }] = useMutation(
    UPDATE_CLUB_MESSAGE_CAMPAIGN,
  );
  const [deleteDraft, { loading: deleting }] = useMutation(
    DELETE_CLUB_MESSAGE_CAMPAIGN,
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

  const isEditing = editingCampaignId !== null;

  function audienceLabel(dynamicGroupId: string | null): string {
    if (!dynamicGroupId) return 'Tous les membres';
    return groupNameById.get(dynamicGroupId) ?? dynamicGroupId;
  }

  function selectedChannelList(): ChannelKey[] {
    return CHANNEL_KEYS.filter((k) => channels[k]);
  }

  function toggleChannel(key: ChannelKey) {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function startEdit(c: MessageCampaignsQueryData['clubMessageCampaigns'][number]) {
    setEditingCampaignId(c.id);
    setTitle(c.title);
    setBody(c.body);
    setAudienceGroupId(c.dynamicGroupId ?? '');
    setEditChannel(c.channel as ChannelKey);
    document.getElementById('campaign-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  function cancelEdit() {
    setEditingCampaignId(null);
    setTitle('');
    setBody('');
    setChannels(initialChannels());
    setEditChannel('EMAIL');
    setAudienceGroupId('');
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Titre et message sont obligatoires.', 'error');
      return;
    }
    const inputBase = {
      title: title.trim(),
      body: body.trim(),
      dynamicGroupId: audienceGroupId || undefined,
    };
    try {
      if (isEditing && editingCampaignId) {
        await updateDraft({
          variables: {
            input: {
              campaignId: editingCampaignId,
              ...inputBase,
              channel: editChannel,
            },
          },
        });
        showToast('Brouillon mis à jour.', 'success');
        cancelEdit();
        await refetchCampaigns();
        return;
      }
      const toCreate = selectedChannelList();
      if (toCreate.length === 0) {
        showToast('Sélectionnez au moins un canal de communication.', 'error');
        return;
      }
      for (const channel of toCreate) {
        await createDraft({
          variables: {
            input: { ...inputBase, channel },
          },
        });
      }
      const labels = toCreate.map((k) => channelLabel(k)).join(', ');
      showToast(
        toCreate.length === 1
          ? 'Brouillon enregistré.'
          : `${toCreate.length} brouillons enregistrés (${labels}).`,
        'success',
      );
      setTitle('');
      setBody('');
      setChannels(initialChannels());
      setAudienceGroupId('');
      await refetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  async function onDeleteCampaign(campaignId: string) {
    if (!window.confirm('Supprimer ce brouillon ? Cette action est définitive.')) {
      return;
    }
    try {
      await deleteDraft({ variables: { campaignId } });
      showToast('Brouillon supprimé.', 'success');
      if (editingCampaignId === campaignId) {
        cancelEdit();
      }
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

  const saving = creating || updating;

  return (
    <div className="members-loom">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Communication</p>
        <h1 className="members-loom__title">Communication &amp; campagnes</h1>
        <p className="members-loom__lede">
          Ciblez vos envois via les groupes dynamiques (ou tous les membres).
          Cochez un ou plusieurs canaux : un brouillon distinct est créé par
          canal (même texte et même audience). Envoyez chaque ligne depuis le
          tableau lorsque vous êtes prêt.
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
                    <th>Actions</th>
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
                          <div className="planning-slot-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              onClick={() => startEdit(c)}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-tight"
                              disabled={deleting}
                              onClick={() => void onDeleteCampaign(c.id)}
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              className="members-btn members-btn--primary"
                              disabled={sending}
                              onClick={() => void onSendNow(c.id)}
                            >
                              {sending ? 'Envoi…' : 'Envoyer'}
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside
          className="members-panel members-panel--aside"
          id="campaign-form"
        >
          <h2 className="members-panel__h">
            {isEditing ? 'Modifier le brouillon' : 'Nouveau brouillon'}
          </h2>
          <p className="members-panel__p">
            {isEditing
              ? 'Ajustez le texte, le canal ou l’audience, puis enregistrez.'
              : 'Enregistrez un ou plusieurs brouillons (un par canal coché), puis envoyez chaque campagne depuis le tableau.'}
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
            {isEditing ? (
              <label className="members-field">
                <span className="members-field__label">Canal</span>
                <select
                  className="members-field__input"
                  value={editChannel}
                  onChange={(e) =>
                    setEditChannel(e.target.value as ChannelKey)
                  }
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="members-field">
                <span className="members-field__label">Canaux</span>
                <p
                  className="members-panel__p"
                  style={{ margin: '0 0 0.5rem' }}
                >
                  Cochez tous les canaux pour lesquels vous souhaitez un
                  brouillon avec ce message.
                </p>
                <div
                  className="members-checkbox-grid"
                  role="group"
                  aria-label="Canaux de communication"
                >
                  {CHANNEL_OPTIONS.map((o) => (
                    <label key={o.value} className="members-checkbox">
                      <input
                        type="checkbox"
                        checked={channels[o.value]}
                        onChange={() => toggleChannel(o.value)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
              {isEditing ? (
                <button
                  type="button"
                  className="members-btn"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Annuler
                </button>
              ) : null}
              <button
                type="submit"
                className="members-btn members-btn--primary"
                disabled={saving}
              >
                {saving
                  ? 'Enregistrement…'
                  : isEditing
                    ? 'Enregistrer les modifications'
                    : 'Enregistrer le brouillon'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
