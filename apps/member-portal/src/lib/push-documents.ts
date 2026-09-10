import { gql } from '@apollo/client';

export const PUSH_VAPID_PUBLIC_KEY = gql`
  query PushVapidPublicKey {
    pushVapidPublicKey
  }
`;

export const REGISTER_PUSH_SUBSCRIPTION = gql`
  mutation RegisterPushSubscription($input: RegisterPushSubscriptionInput!) {
    registerPushSubscription(input: $input)
  }
`;

export const UNREGISTER_PUSH_SUBSCRIPTION = gql`
  mutation UnregisterPushSubscription($endpoint: String!) {
    unregisterPushSubscription(endpoint: $endpoint)
  }
`;

export const SEND_MY_PUSH_TEST = gql`
  mutation SendMyPushTest {
    sendMyPushTest
  }
`;

export type PushVapidPublicKeyData = { pushVapidPublicKey: string | null };
