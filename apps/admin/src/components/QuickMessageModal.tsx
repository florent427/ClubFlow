import { useMutation } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { SEND_CLUB_QUICK_MESSAGE } from '../lib/documents';
import type {
  CommunicationChannelStr,
  QuickMessageRecipientTypeStr,
  SendClubQuickMessageMutationData,
} from '../lib/types';
import { useToast } from './ToastProvider';

/**
 * Canaux du message ponctuel. Telegram n'est plus proposé : le club ne
 * l'utilise pas, et la messagerie interne + le push le remplacent.
 */
const CHANNEL_KEYS = ['EMAIL', 'PUSH'] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];

const TITLE_MAX = 200;
const BODY_MAX = 20_000;

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return `${first}${second}`.toUpperCase() || '?';
}

type Props = {
  open: boolean;
  onClose: () => void;
  recipientType: QuickMessageRecipientTypeStr;
  recipientId: string;
  recipientLabel: string;
  /** Adresse de la fiche ; absente ou vide = canal e-mail indisponible. */
  recipientEmail?: string | null;
};

/**
 * Message ponctuel (e-mail et/ou notification push) à un membre ou un
 * contact, depuis l'annuaire et les fiches. Rendu dans un portail, en
 * feuille basse sur mobile (cf. mobile.css).
 *
 * Le formulaire vit dans `QuickMessageDialog`, monté seulement quand la
 * modale est ouverte : chaque ouverture repart d'un formulaire vide sans
 * effet de réinitialisation.
 */
export function QuickMessageModal(props: Props) {
  if (!props.open || typeof document === 'undefined') {
    return null;
  }
  return createPortal(<QuickMessageDialog {...props} />, document.body);
}

function QuickMessageDialog({
  onClose,
  recipientType,
  recipientId,
  recipientLabel,
  recipientEmail,
}: Props) {
  const { showToast } = useToast();
  const email = recipientEmail?.trim() ?? '';
  const hasEmail = email.includes('@');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>({
    EMAIL: hasEmail,
    PUSH: false,
  });

  const [sendQuick, { loading }] =
    useMutation<SendClubQuickMessageMutationData>(SEND_CLUB_QUICK_MESSAGE);

  // Échap referme. La modale est dans un portail : le tiroir derrière ne
  // reçoit pas cette touche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  function toggleChannel(key: ChannelKey) {
    if (key === 'EMAIL' && !hasEmail) return;
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const selected = CHANNEL_KEYS.filter(
    (k) => channels[k],
  ) as CommunicationChannelStr[];
  const canSend =
    !loading &&
    selected.length > 0 &&
    title.trim().length > 0 &&
    body.trim().length > 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Objet et message sont obligatoires.', 'error');
      return;
    }
    if (selected.length === 0) {
      showToast('Choisissez au moins un canal.', 'error');
      return;
    }
    try {
      const res = await sendQuick({
        variables: {
          input: {
            recipientType,
            recipientId,
            channels: selected,
            title: title.trim(),
            body: body.trim(),
          },
        },
      });
      const delivered = res.data?.sendClubQuickMessage.pushDelivered ?? null;
      const parts: string[] = [];
      if (channels.EMAIL) parts.push('e-mail envoyé');
      if (channels.PUSH) {
        parts.push(
          delivered && delivered > 0
            ? `déposé dans son espace et notifié sur ${delivered} appareil${delivered > 1 ? 's' : ''}`
            : 'déposé dans son espace (aucun appareil abonné aux notifications)',
        );
      }
      showToast(`${recipientLabel} : ${parts.join(', ')}.`, 'success');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  return (
    <div
      className="quick-message-modal-backdrop"
      role="presentation"
      onClick={() => !loading && onClose()}
    >
      <div
        className="members-family-modal qm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-message-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qm__head">
          <div className="qm__head-text">
            <h2 className="qm__title" id="quick-message-modal-title">
              Message rapide
            </h2>
            <p className="qm__to">
              <span className="qm__avatar" aria-hidden>
                {initialsOf(recipientLabel)}
              </span>
              <span className="qm__to-text">
                <strong>{recipientLabel}</strong>
                {hasEmail ? (
                  <span className="qm__email">{email}</span>
                ) : (
                  <span className="qm__email qm__email--none">
                    Aucune adresse e-mail sur la fiche
                  </span>
                )}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="qm__close"
            onClick={onClose}
            aria-label="Fermer"
            disabled={loading}
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </div>

        <form className="qm__form" onSubmit={(e) => void onSubmit(e)}>
          <fieldset className="qm__channels">
            <legend className="cf-field__label">
              Envoyer par (un ou plusieurs canaux)
            </legend>
            <label
              className={`qm__channel${channels.EMAIL ? ' qm__channel--on' : ''}${
                hasEmail ? '' : ' qm__channel--off'
              }`}
            >
              <input
                type="checkbox"
                checked={channels.EMAIL}
                disabled={!hasEmail}
                onChange={() => toggleChannel('EMAIL')}
              />
              <span className="material-symbols-outlined" aria-hidden>
                mail
              </span>
              <span className="qm__channel-text">
                <strong>E-mail</strong>
                <small>{hasEmail ? email : 'Pas d’adresse sur la fiche'}</small>
              </span>
              <span className="qm__check" aria-hidden>
                <span className="material-symbols-outlined">check</span>
              </span>
            </label>
            <label
              className={`qm__channel${channels.PUSH ? ' qm__channel--on' : ''}`}
            >
              <input
                type="checkbox"
                checked={channels.PUSH}
                onChange={() => toggleChannel('PUSH')}
              />
              <span className="material-symbols-outlined" aria-hidden>
                notifications
              </span>
              <span className="qm__channel-text">
                <strong>Notification push</strong>
                <small>Si l’adhérent l’a activée sur le portail</small>
              </span>
              <span className="qm__check" aria-hidden>
                <span className="material-symbols-outlined">check</span>
              </span>
            </label>
            <p className="qm__channels-hint">
              {selected.length === 0
                ? 'Touchez un canal pour le sélectionner.'
                : selected.length === 2
                  ? 'Le message partira par e-mail et en notification.'
                  : channels.EMAIL
                    ? 'Le message partira par e-mail.'
                    : 'Le message partira en notification sur le portail.'}
            </p>
          </fieldset>

          <label className="cf-field">
            <span className="cf-field__label">Objet</span>
            <input
              className="cf-input"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="Ex. Rappel : cours de samedi avancé à 9 h"
              maxLength={TITLE_MAX}
              autoFocus
              required
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Message</span>
            <textarea
              className="cf-input cf-textarea"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
              placeholder="Votre message…"
              maxLength={BODY_MAX}
              required
            />
            <span className="cf-field__hint">
              L’e-mail part depuis l’adresse du club ; la notification reprend
              l’objet et le début du message.
            </span>
          </label>

          <div className="cf-form-actions qm__actions">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={!canSend}
            >
              <span className="material-symbols-outlined" aria-hidden>
                send
              </span>
              {loading
                ? 'Envoi…'
                : selected.length === 0
                  ? 'Choisir un canal'
                  : selected.length === 2
                    ? 'Envoyer par e-mail et push'
                    : channels.EMAIL
                      ? 'Envoyer par e-mail'
                      : 'Envoyer la notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
