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

const CHANNEL_KEYS = ['EMAIL', 'TELEGRAM', 'PUSH'] as const;
type ChannelKey = (typeof CHANNEL_KEYS)[number];

const CHANNEL_OPTIONS: { value: ChannelKey; label: string }[] = [
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'PUSH', label: 'Push' },
];

function initialChannels(): Record<ChannelKey, boolean> {
  return { EMAIL: true, TELEGRAM: false, PUSH: false };
}

type Props = {
  open: boolean;
  onClose: () => void;
  recipientType: QuickMessageRecipientTypeStr;
  recipientId: string;
  recipientLabel: string;
};

export function QuickMessageModal({
  open,
  onClose,
  recipientType,
  recipientId,
  recipientLabel,
}: Props) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [channels, setChannels] = useState<Record<ChannelKey, boolean>>(
    initialChannels,
  );

  const [sendQuick, { loading }] =
    useMutation<SendClubQuickMessageMutationData>(SEND_CLUB_QUICK_MESSAGE);

  useEffect(() => {
    if (open) {
      setTitle('');
      setBody('');
      setChannels(initialChannels());
    }
  }, [open, recipientId]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  function toggleChannel(key: ChannelKey) {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function selectedChannelList(): CommunicationChannelStr[] {
    return CHANNEL_KEYS.filter((k) => channels[k]) as CommunicationChannelStr[];
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      showToast('Objet et message sont obligatoires.', 'error');
      return;
    }
    const list = selectedChannelList();
    if (list.length === 0) {
      showToast('Sélectionnez au moins un canal.', 'error');
      return;
    }
    try {
      await sendQuick({
        variables: {
          input: {
            recipientType,
            recipientId,
            channels: list,
            title: title.trim(),
            body: body.trim(),
          },
        },
      });
      const n = list.length;
      showToast(
        n === 1 ? 'Message envoyé.' : `${n} envois effectués.`,
        'success',
      );
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      showToast(msg, 'error');
    }
  }

  const node = (
    <div
      className="quick-message-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="members-family-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-message-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="members-family-modal__head">
          <h2
            className="members-family-modal__title"
            id="quick-message-modal-title"
          >
            Message rapide
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-tight"
            onClick={onClose}
            aria-label="Fermer"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="members-family-modal__hint">
          À : <strong>{recipientLabel}</strong>
        </p>
        <p className="members-family-modal__hint" style={{ marginTop: '-0.35rem' }}>
          Un envoi par canal coché (e-mail réel si domaine configuré ; autres
          canaux : journalisation MVP).
        </p>
        <form className="members-form" onSubmit={(e) => void onSubmit(e)}>
          <div className="members-field">
            <span className="members-field__label">Canaux</span>
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
          <label className="members-field">
            <span className="members-field__label">Objet</span>
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
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          <div className="members-family-modal__actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
