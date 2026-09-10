import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
  MY_NOTIFICATIONS,
  type MyNotificationsData,
  type UserNotificationKind,
  type UserNotificationRow,
} from '../lib/notifications-documents';

const KIND_LABEL: Record<UserNotificationKind, string> = {
  QUICK_MESSAGE: 'Message du club',
  CAMPAIGN: 'Annonce',
  SYSTEM: 'Système',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Centre de notifications : tout ce que les clubs ont envoyé en push à ce
 * compte, tous clubs confondus (un adhérent multi-club reçoit tout sur le
 * même appareil, quel que soit le club actif ici). Une notification
 * système ouvre cette page avec `?open=<id>` : l'entrée est dépliée,
 * marquée lue et amenée à l'écran.
 */
export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openParam = searchParams.get('open');
  const [openId, setOpenId] = useState<string | null>(openParam);
  /** Ids déjà marqués lus pendant cette visite (évite les doublons de mutation). */
  const markedRef = useRef<Set<string>>(new Set());

  const { data, loading, error, refetch } = useQuery<MyNotificationsData>(
    MY_NOTIFICATIONS,
    { variables: { limit: 100 }, fetchPolicy: 'network-only' },
  );
  const [markRead] = useMutation(MARK_NOTIFICATION_READ, {
    refetchQueries: ['MyUnreadNotificationCount'],
  });
  const [markAll, { loading: markingAll }] = useMutation(
    MARK_ALL_NOTIFICATIONS_READ,
    { refetchQueries: ['MyUnreadNotificationCount'] },
  );

  const rows = data?.myNotifications ?? [];
  const unread = rows.filter((r) => !r.readAt).length;

  function markOneRead(row: UserNotificationRow) {
    if (row.readAt || markedRef.current.has(row.id)) return;
    markedRef.current.add(row.id);
    void markRead({ variables: { id: row.id } }).then(() => refetch());
  }

  // Arrivée depuis une notification système : l'entrée visée est lue et
  // amenée à l'écran dès que la liste est chargée.
  useEffect(() => {
    if (!openParam || rows.length === 0) return;
    const row = rows.find((r) => r.id === openParam);
    if (!row) return;
    markOneRead(row);
    document
      .getElementById(`notif-${row.id}`)
      ?.scrollIntoView({ block: 'center' });
    // markOneRead est stable au sens fonctionnel (garde par ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, rows.length]);

  function toggle(row: UserNotificationRow) {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    setSearchParams(next ? { open: next } : {}, { replace: true });
    if (next) markOneRead(row);
  }

  return (
    <div className="mp-page">
      <div className="mp-notif__actions">
        <div>
          <h1 className="mp-page-title">Notifications</h1>
          <p className="mp-lead mp-lead--tight">
            Les messages et annonces que vos clubs vous ont envoyés.
          </p>
        </div>
        {unread > 0 ? (
          <button
            type="button"
            className="mp-btn mp-btn-outline mp-btn-compact"
            disabled={markingAll}
            onClick={() => void markAll().then(() => refetch())}
          >
            Tout marquer comme lu ({unread})
          </button>
        ) : null}
      </div>

      {loading && rows.length === 0 ? (
        <p className="mp-hint">Chargement…</p>
      ) : error ? (
        <p className="mp-hint">Impossible de charger vos notifications : {error.message}</p>
      ) : rows.length === 0 ? (
        <div className="mp-empty-state">
          <span className="material-symbols-outlined mp-empty-state__ico" aria-hidden>
            notifications_off
          </span>
          <p className="mp-empty-state__title">Aucune notification pour le moment</p>
          <p className="mp-empty-state__msg">
            Les messages que le club vous envoie apparaîtront ici, même si vous
            n'avez pas activé les notifications sur cet appareil.
          </p>
        </div>
      ) : (
        <ul className="mp-notif-list">
          {rows.map((row) => {
            const isOpen = openId === row.id;
            const isUnread = !row.readAt;
            return (
              <li
                key={row.id}
                id={`notif-${row.id}`}
                className={`mp-notif${isUnread ? ' mp-notif--unread' : ''}${
                  isOpen ? ' mp-notif--open' : ''
                }`}
              >
                <button
                  type="button"
                  className="mp-notif__btn"
                  aria-expanded={isOpen}
                  onClick={() => toggle(row)}
                >
                  <span className="mp-notif__dot" aria-hidden />
                  <span className="mp-notif__main">
                    <span className="mp-notif__head">
                      <span className="mp-notif__title">{row.title}</span>
                      <time className="mp-notif__time" dateTime={row.createdAt}>
                        {formatWhen(row.createdAt)}
                      </time>
                    </span>
                    <span className="mp-notif__kind">
                      {KIND_LABEL[row.kind] ?? row.kind}
                      {' · '}
                      {row.clubName}
                      {isUnread ? ' · non lu' : ''}
                    </span>
                    <span className="mp-notif__body">{row.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
