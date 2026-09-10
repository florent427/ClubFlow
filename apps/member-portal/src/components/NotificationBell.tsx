import { useQuery } from '@apollo/client/react';
import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  MY_UNREAD_NOTIFICATION_COUNT,
  type MyUnreadNotificationCountData,
} from '../lib/notifications-documents';

/**
 * Cloche de la barre haute : nombre de notifications non lues, rafraîchi
 * toutes les minutes et à chaque retour au premier plan (l'adhérent revient
 * souvent sur le portail depuis une notification système).
 */
export function NotificationBell() {
  const { data, refetch } = useQuery<MyUnreadNotificationCountData>(
    MY_UNREAD_NOTIFICATION_COUNT,
    {
      pollInterval: 60_000,
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  const count = data?.myUnreadNotificationCount ?? 0;
  const label =
    count > 0
      ? `Notifications (${count} non lue${count > 1 ? 's' : ''})`
      : 'Notifications';

  return (
    <NavLink
      to="/notifications"
      className="mp-icon-btn mp-bell"
      aria-label={label}
      title="Notifications"
    >
      <span className="material-symbols-outlined">notifications</span>
      {count > 0 ? (
        <span className="mp-bell__badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </NavLink>
  );
}
