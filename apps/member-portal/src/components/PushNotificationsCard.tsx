import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import {
  PUSH_VAPID_PUBLIC_KEY,
  REGISTER_PUSH_SUBSCRIPTION,
  SEND_MY_PUSH_TEST,
  UNREGISTER_PUSH_SUBSCRIPTION,
  type PushVapidPublicKeyData,
} from '../lib/push-documents';
import {
  getCurrentSubscription,
  isIosDevice,
  isPushSupported,
  isStandalone,
  subscribeToPush,
  subscriptionToPayload,
} from '../lib/push';
import { useToast } from './ToastProvider';

/**
 * Carte « Notifications » de la page Paramètres : active ou coupe les
 * notifications Web Push pour CET appareil, et permet d'en envoyer une de
 * test. L'autorisation navigateur est demandée depuis le clic (obligatoire
 * sur mobile : hors geste utilisateur, la demande est ignorée).
 */
export function PushNotificationsCard() {
  const { showToast } = useToast();
  const supported = useMemo(() => isPushSupported(), []);
  // Safari iOS n'expose PushManager que dans un portail ajouté à l'écran
  // d'accueil : sans cela, « non pris en charge » serait un faux diagnostic.
  const iosNeedsInstall = useMemo(
    () => isIosDevice() && !isStandalone() && !supported,
    [supported],
  );

  const { data: keyData, loading: keyLoading } = useQuery<PushVapidPublicKeyData>(
    PUSH_VAPID_PUBLIC_KEY,
    { skip: !supported },
  );
  const [registerSub] = useMutation(REGISTER_PUSH_SUBSCRIPTION);
  const [unregisterSub] = useMutation(UNREGISTER_PUSH_SUBSCRIPTION);
  const [sendTest] = useMutation<{ sendMyPushTest: boolean }>(SEND_MY_PUSH_TEST);

  const [permission, setPermission] = useState<NotificationPermission>(() =>
    supported ? Notification.permission : 'default',
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void getCurrentSubscription().then((s) => {
      if (!cancelled) setSubscribed(Boolean(s));
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const serverKey = keyData?.pushVapidPublicKey ?? null;
  const serverReady = !keyLoading && serverKey !== null;

  async function enable() {
    if (!serverKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showToast(
          perm === 'denied'
            ? 'Le navigateur bloque les notifications pour ce site. Réautorisez-les dans ses réglages.'
            : 'Autorisation non accordée.',
          'info',
        );
        return;
      }
      const sub = await subscribeToPush(serverKey);
      await registerSub({ variables: { input: subscriptionToPayload(sub) } });
      setSubscribed(true);
      showToast('Notifications activées sur cet appareil.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Activation impossible.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await getCurrentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await unregisterSub({ variables: { endpoint } });
      }
      setSubscribed(false);
      showToast('Notifications désactivées sur cet appareil.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Désactivation impossible.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const r = await sendTest();
      if (r.data?.sendMyPushTest) {
        showToast('Notification de test envoyée.', 'success');
      } else {
        showToast('Aucun appareil abonné : activez d’abord les notifications.', 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Envoi impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mp-form-card" aria-labelledby="push-section-title">
      <h2 id="push-section-title" className="mp-section-title">
        Notifications
      </h2>
      <p className="mp-hint" style={{ marginBottom: 12 }}>
        Recevez les nouveaux messages de la messagerie et les annonces du
        club sur cet appareil, même quand le portail est fermé. Le réglage est
        propre à chaque appareil et navigateur.
      </p>

      {iosNeedsInstall ? (
        <p className="mp-hint">
          Sur iPhone et iPad, les notifications ne fonctionnent qu'une fois le
          portail ajouté à l'écran d'accueil : dans Safari, touchez
          « Partager » puis « Sur l'écran d'accueil », ouvrez ClubFlow depuis
          l'icône et revenez ici.
        </p>
      ) : !supported ? (
        <p className="mp-hint">
          Ce navigateur ne prend pas en charge les notifications.
        </p>
      ) : keyLoading ? (
        <p className="mp-hint">Vérification…</p>
      ) : !serverReady ? (
        <p className="mp-hint">
          Les notifications ne sont pas configurées sur ce serveur.
        </p>
      ) : permission === 'denied' ? (
        <p className="mp-hint">
          Le navigateur bloque les notifications pour ce site. Réautorisez-les
          dans ses réglages (icône de cadenas dans la barre d'adresse), puis
          rechargez la page.
        </p>
      ) : subscribed ? (
        <>
          <p className="mp-hint">
            <span className="mp-pill mp-pill-ok">Activées sur cet appareil</span>
          </p>
          <div className="mp-form-actions">
            <button
              type="button"
              className="mp-btn mp-btn-outline"
              disabled={busy}
              onClick={() => void test()}
            >
              Envoyer une notification de test
            </button>
            <button
              type="button"
              className="mp-btn mp-btn-secondary"
              disabled={busy}
              onClick={() => void disable()}
            >
              Désactiver sur cet appareil
            </button>
          </div>
        </>
      ) : (
        <div className="mp-form-actions">
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            disabled={busy || subscribed === null}
            onClick={() => void enable()}
          >
            Activer les notifications
          </button>
        </div>
      )}
    </section>
  );
}
