import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo } from 'react';
import {
  PUSH_VAPID_PUBLIC_KEY,
  REGISTER_PUSH_SUBSCRIPTION,
  type PushVapidPublicKeyData,
} from './push-documents';
import { isPushSupported, subscribeToPush, subscriptionToPayload } from './push';

export type PushEnableOutcome =
  | { status: 'granted' }
  | { status: 'denied' }
  | { status: 'default' }
  | { status: 'error'; message: string };

/**
 * Activation des notifications sur CET appareil : demande l'autorisation au
 * navigateur (depuis un geste utilisateur, sinon la demande est ignorée sur
 * mobile), crée l'abonnement push et l'enregistre côté API.
 *
 * Partagé par la carte « Notifications » des Paramètres et par l'invitation
 * affichée à l'ouverture du portail : un seul enchaînement, un seul état.
 */
export function usePushEnable() {
  const supported = useMemo(() => isPushSupported(), []);
  const { data, loading } = useQuery<PushVapidPublicKeyData>(
    PUSH_VAPID_PUBLIC_KEY,
    { skip: !supported },
  );
  const [registerSub] = useMutation(REGISTER_PUSH_SUBSCRIPTION);

  const serverKey = data?.pushVapidPublicKey ?? null;
  /** false : navigateur ou serveur incapables ; null : on ne sait pas encore. */
  const serverReady: boolean | null = !supported
    ? false
    : loading
      ? null
      : serverKey !== null;

  async function enable(): Promise<PushEnableOutcome> {
    if (!serverKey) {
      return {
        status: 'error',
        message: 'Les notifications ne sont pas configurées sur ce serveur.',
      };
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return { status: perm };
      const sub = await subscribeToPush(serverKey);
      await registerSub({ variables: { input: subscriptionToPayload(sub) } });
      return { status: 'granted' };
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : 'Activation impossible.',
      };
    }
  }

  return { supported, keyLoading: loading, serverReady, enable };
}
