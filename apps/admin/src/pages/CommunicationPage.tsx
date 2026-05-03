import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AudienceBuilder } from '../components/AudienceBuilder';
import {
  CLUB_DYNAMIC_GROUPS,
  CLUB_MESSAGE_CAMPAIGNS,
  CREATE_CLUB_MESSAGE_CAMPAIGN,
  DELETE_CLUB_MESSAGE_CAMPAIGN,
  SEND_CLUB_MESSAGE_CAMPAIGN,
  UPDATE_CLUB_MESSAGE_CAMPAIGN,
} from '../lib/documents';
import type {
  AudienceFilterInputData,
  CommunicationChannelStr,
  DynamicGroupsQueryData,
  MessageCampaignsQueryData,
} from '../lib/types';
import { useToast } from '../components/ToastProvider';

/**
 * Canaux disponibles côté UI. Telegram **retiré** (déprécié : remplacé par
 * la messagerie interne). On garde MESSAGING (broadcast intra-app), EMAIL
 * (campagne transactionnelle) et PUSH (stub V1, prévu V2).
 */
const CHANNEL_OPTIONS: {
  value: CommunicationChannelStr;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'EMAIL',
    label: 'E-mail',
    description: 'Domaine vérifié, diffusion classique.',
    icon: 'mail',
  },
  {
    value: 'MESSAGING',
    label: 'Messagerie interne',
    description: 'Posté dans les salons « broadcast » de l’app.',
    icon: 'forum',
  },
  {
    value: 'PUSH',
    label: 'Notification push',
    description: 'Aperçu mobile (V2 — actuellement journalisé).',
    icon: 'notifications',
  },
];

function channelLabel(code: string): string {
  return CHANNEL_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

function channelIcon(code: string): string {
  return CHANNEL_OPTIONS.find((c) => c.value === code)?.icon ?? 'campaign';
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

function parseAudienceJson(json: string | null): AudienceFilterInputData | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as AudienceFilterInputData;
  } catch {
    return null;
  }
}

/** Audience par défaut quand on ouvre un nouveau brouillon. */
function defaultAudience(): AudienceFilterInputData {
  return { includeAllMembers: true };
}

export function CommunicationPage() {
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  /** Multi-canal : un même brouillon peut diffuser via plusieurs canaux. */
  const [selectedChannels, setSelectedChannels] = useState<CommunicationChannelStr[]>([
    'EMAIL',
  ]);
  const [audience, setAudience] = useState<AudienceFilterInputData>(defaultAudience());
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  const { data: campaignsData, refetch: refetchCampaigns } =
    useQuery<MessageCampaignsQueryData>(CLUB_MESSAGE_CAMPAIGNS);
  const { data: groupsData } = useQuery<DynamicGroupsQueryData>(CLUB_DYNAMIC_GROUPS);

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
  const saving = creating || updating;

  /* ---------------------------------------------------------------- */
  /* Helpers d'affichage                                              */
  /* ---------------------------------------------------------------- */

  /** Libellé (court) pour la colonne « Audience » du tableau. */
  function audienceSummary(
    dynamicGroupId: string | null,
    audienceJson: string | null,
  ): string {
    const aud = parseAudienceJson(audienceJson);
    if (aud) {
      if (aud.includeAllMembers) return 'Tous les membres actifs';
      const parts: string[] = [];
      if (aud.dynamicGroupIds?.length) {
        parts.push(
          `${aud.dynamicGroupIds.length} groupe${
            aud.dynamicGroupIds.length > 1 ? 's' : ''
          }`,
        );
      }
      if (aud.membershipRoles?.length) parts.push(`${aud.membershipRoles.length} rôle(s)`);
      if (aud.clubMemberRoles?.length)
        parts.push(`${aud.clubMemberRoles.length} rôle(s) club`);
      if (aud.memberIds?.length) parts.push(`${aud.memberIds.length} membre(s)`);
      if (aud.ageFilter && aud.ageFilter !== 'ALL')
        parts.push(aud.ageFilter === 'ADULTS' ? 'adultes' : 'mineurs');
      if (parts.length === 0) return 'Aucun critère';
      return parts.join(' · ');
    }
    if (!dynamicGroupId) return 'Tous les membres';
    return groupNameById.get(dynamicGroupId) ?? dynamicGroupId;
  }

  function channelsSummary(
    legacyChannel: string,
    channels: CommunicationChannelStr[],
  ): CommunicationChannelStr[] {
    if (channels && channels.length > 0) return channels;
    return [legacyChannel as CommunicationChannelStr];
  }

  /* ---------------------------------------------------------------- */
  /* Form actions                                                     */
  /* ---------------------------------------------------------------- */

  function toggleChannel(channel: CommunicationChannelStr) {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  }

  function startEdit(c: MessageCampaignsQueryData['clubMessageCampaigns'][number]) {
    setEditingCampaignId(c.id);
    setTitle(c.title);
    setBody(c.body);
    const fromMulti = c.channels && c.channels.length > 0
      ? c.channels
      : [c.channel];
    setSelectedChannels(fromMulti);
    const parsed = parseAudienceJson(c.audienceFilterJson);
    if (parsed) {
      setAudience(parsed);
    } else if (c.dynamicGroupId) {
      // Migration douce : un ancien brouillon avec dynamicGroupId
      // est ouvert avec ce groupe seul.
      setAudience({
        includeAllMembers: false,
        dynamicGroupIds: [c.dynamicGroupId],
      });
    } else {
      setAudience(defaultAudience());
    }
    document.getElementById('campaign-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  function cancelEdit() {
    setEditingCampaignId(null);
    setTitle('');
    setBody('');
    setSelectedChannels(['EMAIL']);
    setAudience(defaultAudience());
  }

  /** Normalise l'audience pour le payload backend (drop des clés vides). */
  function normalizeAudienceForApi(
    f: AudienceFilterInputData,
  ): AudienceFilterInputData | null {
    if (f.includeAllMembers) return { includeAllMembers: true };
    const out: AudienceFilterInputData = { includeAllMembers: false };
    if (f.dynamicGroupIds && f.dynamicGroupIds.length > 0)
      out.dynamicGroupIds = f.dynamicGroupIds;
    if (f.membershipRoles && f.membershipRoles.length > 0)
      out.membershipRoles = f.membershipRoles;
    if (f.clubMemberRoles && f.clubMemberRoles.length > 0)
      out.clubMemberRoles = f.clubMemberRoles;
    if (f.memberIds && f.memberIds.length > 0) out.memberIds = f.memberIds;
    if (f.ageFilter && f.ageFilter !== 'ALL') out.ageFilter = f.ageFilter;
    // Si rien n'est sélectionné → tomber en "tous les actifs" pour éviter
    // une campagne sans audience (sinon l'utilisateur s'attend à 0 envoi).
    if (
      !out.dynamicGroupIds &&
      !out.membershipRoles &&
      !out.clubMemberRoles &&
      !out.memberIds &&
      !out.ageFilter
    ) {
      return { includeAllMembers: true };
    }
    return out;
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Titre et message sont obligatoires.', 'error');
      return;
    }
    if (selectedChannels.length === 0) {
      showToast('Sélectionnez au moins un canal de diffusion.', 'error');
      return;
    }
    const audiencePayload = normalizeAudienceForApi(audience);
    try {
      if (isEditing && editingCampaignId) {
        await updateDraft({
          variables: {
            input: {
              campaignId: editingCampaignId,
              title: title.trim(),
              body: body.trim(),
              channels: selectedChannels,
              audience: audiencePayload,
            },
          },
        });
        showToast('Brouillon mis à jour.', 'success');
        cancelEdit();
        await refetchCampaigns();
        return;
      }
      await createDraft({
        variables: {
          input: {
            title: title.trim(),
            body: body.trim(),
            channels: selectedChannels,
            audience: audiencePayload,
          },
        },
      });
      showToast(
        selectedChannels.length === 1
          ? 'Brouillon enregistré sur 1 canal.'
          : `Brouillon enregistré sur ${selectedChannels.length} canaux.`,
        'success',
      );
      setTitle('');
      setBody('');
      setSelectedChannels(['EMAIL']);
      setAudience(defaultAudience());
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
      if (editingCampaignId === campaignId) cancelEdit();
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

  /* ---------------------------------------------------------------- */
  /* Effects                                                          */
  /* ---------------------------------------------------------------- */

  // Si on a chargé en édition une campagne dont les channels[] sont vides
  // (très ancienne), on retombe sur le legacy `channel` au moment du init.
  useEffect(() => {
    if (selectedChannels.length === 0) setSelectedChannels(['EMAIL']);
  }, [selectedChannels.length]);

  /* ---------------------------------------------------------------- */
  /* KPIs                                                             */
  /* ---------------------------------------------------------------- */

  const kpiDrafts = campaigns.filter((c) => c.status === 'DRAFT').length;
  const kpiSent = campaigns.filter((c) => c.status === 'SENT').length;
  const kpiTotalRecipients = campaigns
    .filter((c) => c.status === 'SENT')
    .reduce((sum, c) => sum + (c.recipientCount ?? 0), 0);

  return (
    <div className="members-loom comms-page">
      <header className="members-loom__hero">
        <p className="members-loom__eyebrow">Module Communication</p>
        <h1 className="members-loom__title">Campagnes &amp; communication</h1>
        <p className="members-loom__lede">
          Composez un message une seule fois et diffusez-le sur plusieurs canaux
          (e-mail, messagerie interne, push) à une audience finement ciblée
          (groupes, rôles, âge, membres individuels).
        </p>

        <div className="comms-kpis" role="list">
          <div className="comms-kpi" role="listitem">
            <span className="comms-kpi__num">{kpiDrafts}</span>
            <span className="comms-kpi__label">Brouillons</span>
          </div>
          <div className="comms-kpi" role="listitem">
            <span className="comms-kpi__num">{kpiSent}</span>
            <span className="comms-kpi__label">Campagnes envoyées</span>
          </div>
          <div className="comms-kpi" role="listitem">
            <span className="comms-kpi__num">{kpiTotalRecipients}</span>
            <span className="comms-kpi__label">Destinataires touchés</span>
          </div>
        </div>
      </header>

      <div className="members-loom__grid comms-grid">
        {/* === FORM (large) === */}
        <section
          className="members-panel comms-form-panel"
          id="campaign-form"
          aria-labelledby="comms-form-heading"
        >
          <header className="comms-form-head">
            <h2 className="members-panel__h" id="comms-form-heading">
              {isEditing ? 'Modifier le brouillon' : 'Composer une campagne'}
            </h2>
            {isEditing ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={cancelEdit}
                disabled={saving}
              >
                Annuler l’édition
              </button>
            ) : null}
          </header>

          <form
            className="members-form comms-form"
            onSubmit={(e) => void onSaveDraft(e)}
          >
            {/* --- Étape 1 : contenu --- */}
            <fieldset className="comms-step">
              <legend className="comms-step__legend">
                <span className="comms-step__num">1</span>
                <span className="comms-step__title">Contenu du message</span>
              </legend>
              <label className="members-field">
                <span className="members-field__label">Titre</span>
                <input
                  className="members-field__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Ex. Tournoi annuel — appel à inscription"
                />
              </label>
              <label className="members-field">
                <span className="members-field__label">Message</span>
                <textarea
                  className="members-field__input"
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  placeholder={'Bonjour à toutes et tous,\n\n…'}
                />
                <span className="members-field__hint">
                  {body.length} caractère{body.length > 1 ? 's' : ''}
                </span>
              </label>
            </fieldset>

            {/* --- Étape 2 : canaux --- */}
            <fieldset className="comms-step">
              <legend className="comms-step__legend">
                <span className="comms-step__num">2</span>
                <span className="comms-step__title">Canaux de diffusion</span>
              </legend>
              <p className="comms-step__hint">
                Sélectionnez un ou plusieurs canaux. La même campagne sera
                délivrée via tous les canaux cochés.
              </p>
              <div className="channel-grid" role="group" aria-label="Canaux">
                {CHANNEL_OPTIONS.map((c) => {
                  const active = selectedChannels.includes(c.value);
                  return (
                    <button
                      type="button"
                      key={c.value}
                      className={`channel-card ${active ? 'channel-card--active' : ''}`}
                      onClick={() => toggleChannel(c.value)}
                      aria-pressed={active ? 'true' : 'false'}
                    >
                      <span className="channel-card__icon material-symbols-outlined">
                        {c.icon}
                      </span>
                      <span className="channel-card__label">{c.label}</span>
                      <span className="channel-card__hint">{c.description}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* --- Étape 3 : audience --- */}
            <fieldset className="comms-step">
              <legend className="comms-step__legend">
                <span className="comms-step__num">3</span>
                <span className="comms-step__title">Audience</span>
              </legend>
              <AudienceBuilder
                value={audience}
                onChange={setAudience}
                disabled={saving}
              />
            </fieldset>

            <div className="members-actions comms-actions">
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
        </section>

        {/* === LISTE === */}
        <section className="members-panel comms-list-panel">
          <h2 className="members-panel__h">Vos campagnes</h2>
          {campaigns.length === 0 ? (
            <p className="muted">
              Aucune campagne pour l’instant. Composez votre première dans le
              formulaire ci-contre.
            </p>
          ) : (
            <ul className="comms-list">
              {campaigns.map((c) => {
                const channels = channelsSummary(c.channel, c.channels);
                return (
                  <li key={c.id} className={`comms-card comms-card--${c.status.toLowerCase()}`}>
                    <header className="comms-card__head">
                      <div className="comms-card__title-block">
                        <span className={`comms-card__status comms-card__status--${c.status.toLowerCase()}`}>
                          {statusLabel(c.status)}
                        </span>
                        <h3 className="comms-card__title">{c.title}</h3>
                      </div>
                      <div className="comms-card__channels" aria-label="Canaux">
                        {channels.map((ch) => (
                          <span key={ch} className="comms-card__channel-pill">
                            <span className="material-symbols-outlined">
                              {channelIcon(ch)}
                            </span>
                            {channelLabel(ch)}
                          </span>
                        ))}
                      </div>
                    </header>
                    <p className="comms-card__body">
                      {c.body.length > 220 ? `${c.body.slice(0, 220)}…` : c.body}
                    </p>
                    <dl className="comms-card__meta">
                      <div>
                        <dt>Audience</dt>
                        <dd>{audienceSummary(c.dynamicGroupId, c.audienceFilterJson)}</dd>
                      </div>
                      <div>
                        <dt>Date d’envoi</dt>
                        <dd>{formatSentAt(c.sentAt)}</dd>
                      </div>
                      <div>
                        <dt>Destinataires</dt>
                        <dd>{c.recipientCount}</dd>
                      </div>
                    </dl>
                    {c.status === 'DRAFT' ? (
                      <div className="comms-card__actions">
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
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
