import { gql } from '@apollo/client';

export type UserNotificationKind = 'QUICK_MESSAGE' | 'CAMPAIGN' | 'SYSTEM';

export type UserNotificationRow = {
  id: string;
  kind: UserNotificationKind;
  /** Club émetteur : la boîte est celle du compte, tous clubs confondus. */
  clubName: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

export type MyNotificationsData = { myNotifications: UserNotificationRow[] };
export type MyUnreadNotificationCountData = { myUnreadNotificationCount: number };

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($limit: Int) {
    myNotifications(limit: $limit) {
      id
      kind
      clubName
      title
      body
      url
      readAt
      createdAt
    }
  }
`;

export const MY_UNREAD_NOTIFICATION_COUNT = gql`
  query MyUnreadNotificationCount {
    myUnreadNotificationCount
  }
`;

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;
