import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  decideEngagementStep,
  readSnoozedUntil,
  snoozeEngagement,
  wantsNotifications,
  type EngagementEnvironment,
  type EngagementStep,
} from '../lib/engagement-prompt';
import {
  canPromptInstall,
  isAndroidDevice,
  promptInstall,
  subscribeInstallability,
} from '../lib/install-prompt';
import { isIosDevice, isPushSupported, isStandalone } from '../lib/push';
import { usePushEnable } from '../lib/use-push-enable';
import { useToast } from './ToastProvider';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission;
}

/**
 * L'autorisation peut changer sans nous (carte Paramètres, réglages du
 * navigateur) : on écoute le changement quand le navigateur le permet, et
 * `readPermission` est de toute façon relu à chaque rendu.
 */
function subscribePermission(onChange: () => void): () => void {
  let status: PermissionStatus | null = null;
  const permissions =
    typeof navigator !== 'undefined' ? navigator.permissions : undefined;
  if (permissions && typeof permissions.query === 'function') {
    permissions
      .query({ name: 'notifications' })
      .then((s) => {
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => {
        // Navigateur sans cette requête : la relecture au rendu suffit.
      });
  }
  return () => {
    status?.removeEventListener('change', onChange);
  };
}

const COPY: Record<
  EngagementStep,
  { icon: string; title: string; text: string; primary: string; busy: string }
> = {
  'install-android': {
    icon: 'add_to_home_screen',
    title: 'Ajoutez ClubFlow à votre écran d’accueil',
    text: 'Retrouvez votre espace en un geste, comme une application, et ne manquez aucun message ni annonce du club.',
    primary: 'Installer l’application',
    busy: 'Installation…',
  },
  'install-ios': {
    icon: 'ios_share',
    title: 'Ajoutez ClubFlow à votre écran d’accueil',
    text: 'Sur iPhone et iPad, c’est indispensable pour recevoir les notifications du club. Trois gestes suffisent :',
    primary: 'J’ai compris',
    busy: 'J’ai compris',
  },
  notifications: {
    icon: 'notifications_active',
    title: 'Ne manquez aucune information du club',
    text: 'Recevez les messages de la messagerie et les annonces du club sur cet appareil, même quand le portail est fermé.',
    primary: 'Activer les notifications',
    busy: 'Activation…',
  },
};

/**
 * Invitation affichée à l'ouverture de l'espace connecté : ajouter le portail
 * à l'écran d'accueil (téléphones et tablettes), puis autoriser les
 * notifications tant que l'adhérent n'a pas tranché. La décision vit dans
 * `lib/engagement-prompt.ts` ; ici, l'affichage et les gestes.
 */
export function EngagementPrompt() {
  const { pathname } = useLocation();
  const { showToast } = useToast();
  const { supported, serverReady, enable } = usePushEnable();

  const permission = useSyncExternalStore(subscribePermission, readPermission);
  // Chrome annonce l'installabilité quand il veut, et une installation ou
  // un passage en plein écran changent la donne : on suit le module.
  const installable = useSyncExternalStore(subscribeInstallability, canPromptInstall);
  const standalone = useSyncExternalStore(subscribeInstallability, isStandalone);
  const ios = useMemo(() => isIosDevice(), []);
  const android = useMemo(() => isAndroidDevice(), []);
  const pushSupported = useMemo(() => isPushSupported(), []);

  const [now] = useState(() => Date.now());
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() =>
    readSnoozedUntil(safeStorage()),
  );
  const [forcedStep, setForcedStep] = useState<EngagementStep | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const env: EngagementEnvironment = {
    pushSupported: supported && pushSupported,
    permission,
    serverReady,
    standalone,
    ios,
    android,
    canPromptInstall: installable,
  };
  // La page Paramètres porte déjà la carte « Notifications » : pas de doublon.
  const onSettingsPage = pathname.startsWith('/parametres');
  const step: EngagementStep | null =
    closed || onSettingsPage
      ? null
      : (forcedStep ?? decideEngagementStep(env, snoozedUntil, now));

  /** « Plus tard » : on se tait quelques jours sur cet appareil. */
  const later = useCallback(() => {
    setSnoozedUntil(snoozeEngagement(safeStorage(), Date.now()));
    setForcedStep(null);
    setClosed(true);
  }, []);

  /** Fermeture après une décision : l'état du navigateur suffit à ne pas revenir. */
  const finish = useCallback(() => {
    setForcedStep(null);
    setClosed(true);
  }, []);

  useEffect(() => {
    if (!step) return;
    primaryRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') later();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, later]);

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') {
      setJustInstalled(true);
      showToast(
        'ClubFlow s’installe : retrouvez-le sur votre écran d’accueil.',
        'success',
      );
    }
    if (wantsNotifications(env)) {
      setForcedStep('notifications');
    } else if (outcome === 'accepted') {
      finish();
    } else {
      later();
    }
  }

  async function activate() {
    setBusy(true);
    const result = await enable();
    setBusy(false);
    if (result.status === 'error') {
      showToast(result.message, 'error');
      return;
    }
    if (result.status === 'granted') {
      showToast('Notifications activées sur cet appareil.', 'success');
      finish();
      return;
    }
    if (result.status === 'denied') {
      showToast(
        'Notifications refusées. Vous pourrez changer d’avis dans les réglages du navigateur.',
        'info',
      );
      finish();
      return;
    }
    // Boîte du navigateur fermée sans répondre : on reviendra plus tard.
    later();
  }

  if (!step) return null;

  const copy = COPY[step];
  const onPrimary =
    step === 'install-android'
      ? () => void install()
      : step === 'install-ios'
        ? later
        : () => void activate();
  // Android sans bouton d'installation (déjà installé, ou navigateur qui ne
  // l'annonce pas) : on glisse le geste manuel, sans en faire une étape.
  const showInstallHint =
    step === 'notifications' &&
    android &&
    !standalone &&
    !installable &&
    !justInstalled;

  return (
    <>
      <div className="mp-modal-backdrop" onClick={later} aria-hidden="true" />
      <div
        className="mp-engage"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mp-engage-title"
      >
        <button
          type="button"
          className="mp-engage__close"
          aria-label="Plus tard"
          onClick={later}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            close
          </span>
        </button>
        <div className="mp-engage__icon" aria-hidden="true">
          <span className="material-symbols-outlined">{copy.icon}</span>
        </div>
        <h2 id="mp-engage-title" className="mp-engage__title">
          {copy.title}
        </h2>
        <p className="mp-engage__text">{copy.text}</p>

        {step === 'install-ios' ? (
          <ol className="mp-engage__steps">
            <li>
              Touchez le bouton Partager{' '}
              <span
                className="material-symbols-outlined"
                role="img"
                aria-label="icône Partager"
              >
                ios_share
              </span>{' '}
              de votre navigateur (en bas de l’écran dans Safari).
            </li>
            <li>Choisissez « Sur l’écran d’accueil », puis « Ajouter ».</li>
            <li>
              Ouvrez ClubFlow depuis sa nouvelle icône et activez les
              notifications.
            </li>
          </ol>
        ) : null}

        {showInstallHint ? (
          <p className="mp-engage__hint">
            Astuce : ajoutez aussi ClubFlow à votre écran d’accueil depuis le
            menu de votre navigateur pour l’ouvrir comme une application.
          </p>
        ) : null}

        <div className="mp-engage__actions">
          <button
            ref={primaryRef}
            type="button"
            className="mp-btn mp-btn--primary"
            disabled={busy}
            onClick={onPrimary}
          >
            {busy ? copy.busy : copy.primary}
          </button>
          {step !== 'install-ios' ? (
            <button
              type="button"
              className="mp-btn mp-btn--ghost"
              disabled={busy}
              onClick={later}
            >
              Plus tard
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
