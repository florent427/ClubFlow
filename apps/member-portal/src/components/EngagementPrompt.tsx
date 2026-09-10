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
  pauseInstallInvite,
  readInstallPausedUntil,
  wantsNotifications,
  type EngagementEnvironment,
  type EngagementStep,
} from '../lib/engagement-prompt';
import {
  canPromptInstall,
  isAndroidDevice,
  promptInstall,
  subscribeInstallability,
  wasInstalledFromHere,
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
 * navigateur, application installée qui reprend la main) : on écoute le
 * changement quand le navigateur le permet, et `readPermission` est de
 * toute façon relu à chaque rendu.
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
 *
 * Fermer sans répondre ne vaut que pour l'ouverture en cours : la question
 * des notifications revient à la suivante. Seule la suggestion
 * d'installation attend quelques jours après « Plus tard ».
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
  const installedHere = useSyncExternalStore(
    subscribeInstallability,
    wasInstalledFromHere,
  );
  const ios = useMemo(() => isIosDevice(), []);
  const android = useMemo(() => isAndroidDevice(), []);
  const pushSupported = useMemo(() => isPushSupported(), []);

  const [now] = useState(() => Date.now());
  const [installPausedUntil, setInstallPausedUntil] = useState<number | null>(
    () => readInstallPausedUntil(safeStorage()),
  );
  const [forcedStep, setForcedStep] = useState<EngagementStep | null>(null);
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
      : (forcedStep ?? decideEngagementStep(env, installPausedUntil, now));

  /**
   * Fermer sans répondre. La suggestion d'installation attend quelques
   * jours ; la question des notifications reviendra à la prochaine
   * ouverture tant que rien n'est décidé.
   */
  const dismiss = useCallback((current: EngagementStep) => {
    if (current !== 'notifications') {
      setInstallPausedUntil(pauseInstallInvite(safeStorage(), Date.now()));
    }
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
      if (event.key === 'Escape' && step) dismiss(step);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, dismiss]);

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') {
      showToast(
        'ClubFlow s’installe. Vous le trouverez parmi vos applications : il s’ouvre comme une appli à part entière.',
        'success',
      );
    }
    if (wantsNotifications(env)) {
      setForcedStep('notifications');
    } else if (outcome === 'accepted') {
      finish();
    } else {
      dismiss('install-android');
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
    // Boîte du système fermée sans répondre : on redemandera à la prochaine ouverture.
    dismiss('notifications');
  }

  if (!step) return null;

  const copy = COPY[step];
  const current = step;
  const onPrimary =
    current === 'install-android'
      ? () => void install()
      : current === 'install-ios'
        ? () => dismiss(current)
        : () => void activate();
  // Android sans bouton d'installation (navigateur qui ne l'annonce pas) :
  // on glisse le geste manuel, sans en faire une étape — sauf si une
  // installation a déjà abouti depuis ce navigateur.
  const showInstallHint =
    current === 'notifications' &&
    android &&
    !standalone &&
    !installable &&
    !installedHere;
  // Dans l'application installée, le système redemande une autorisation
  // propre à l'application, même après un accord dans le navigateur.
  const showAppPermissionNote =
    current === 'notifications' && standalone && (android || ios);

  return (
    <>
      <div
        className="mp-modal-backdrop"
        onClick={() => dismiss(current)}
        aria-hidden="true"
      />
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
          onClick={() => dismiss(current)}
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

        {current === 'install-ios' ? (
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

        {showAppPermissionNote ? (
          <p className="mp-engage__hint">
            Vous l’aviez déjà accepté dans votre navigateur ?{' '}
            {android ? 'Android' : 'iOS'} demande une autorisation propre à
            l’application ClubFlow, une seule fois.
          </p>
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
          {current !== 'install-ios' ? (
            <button
              type="button"
              className="mp-btn mp-btn--ghost"
              disabled={busy}
              onClick={() => dismiss(current)}
            >
              Plus tard
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
