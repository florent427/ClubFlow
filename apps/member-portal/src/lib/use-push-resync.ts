import { useMutation } from '@apollo/client/react';
import { useEffect } from 'react';
import { REGISTER_PUSH_SUBSCRIPTION } from './push-documents';
import { getCurrentSubscription, isPushSupported, subscriptionToPayload } from './push';
import { getToken } from './storage';

/**
 * À chaque ouverture du portail connecté, ré-enregistre l'abonnement push
 * existant côté API. Idempotent (clé = endpoint). Couvre deux cas réels :
 * l'abonnement a été renouvelé par le navigateur, ou un autre compte s'est
 * connecté sur le même appareil — la notification doit suivre le compte
 * courant, pas l'ancien.
 */
export function usePushResync(): void {
  const [registerSub] = useMutation(REGISTER_PUSH_SUBSCRIPTION);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== 'granted') return;
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      const sub = await getCurrentSubscription();
      if (!sub || cancelled) return;
      try {
        await registerSub({ variables: { input: subscriptionToPayload(sub) } });
      } catch {
        // Serveur sans clés VAPID ou réseau absent : rien à signaler ici,
        // la page Paramètres montre l'état réel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [registerSub]);
}
