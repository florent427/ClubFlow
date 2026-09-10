import { describe, expect, it } from 'vitest';
import {
  INSTALL_PAUSE_DURATION_MS,
  INSTALL_PAUSE_STORAGE_KEY,
  decideEngagementStep,
  pauseInstallInvite,
  readInstallPausedUntil,
  type EngagementEnvironment,
} from './engagement-prompt';

const now = Date.UTC(2026, 8, 10, 12, 0, 0);

/** Ordinateur, navigateur capable, adhérent qui n'a encore rien décidé. */
const desktopUndecided: EngagementEnvironment = {
  pushSupported: true,
  permission: 'default',
  serverReady: true,
  standalone: false,
  ios: false,
  android: false,
  canPromptInstall: false,
};

function env(overrides: Partial<EngagementEnvironment>): EngagementEnvironment {
  return { ...desktopUndecided, ...overrides };
}

describe('decideEngagementStep', () => {
  it('propose les notifications à qui n’a pas encore tranché', () => {
    expect(decideEngagementStep(desktopUndecided, null, now)).toBe('notifications');
  });

  it('se tait une fois la décision prise, accord comme refus', () => {
    expect(decideEngagementStep(env({ permission: 'granted' }), null, now)).toBeNull();
    expect(decideEngagementStep(env({ permission: 'denied' }), null, now)).toBeNull();
  });

  it('se tait tant que l’API n’a pas dit si elle a une clé, et si elle n’en a pas', () => {
    expect(decideEngagementStep(env({ serverReady: null }), null, now)).toBeNull();
    expect(decideEngagementStep(env({ serverReady: false }), null, now)).toBeNull();
  });

  it('se tait quand le navigateur ne sait pas faire', () => {
    expect(
      decideEngagementStep(
        env({ pushSupported: false, permission: 'unsupported' }),
        null,
        now,
      ),
    ).toBeNull();
  });

  it('sur iPhone dans Safari, explique d’abord l’ajout à l’écran d’accueil, même sans Web Push', () => {
    expect(
      decideEngagementStep(
        env({ ios: true, pushSupported: false, permission: 'unsupported' }),
        null,
        now,
      ),
    ).toBe('install-ios');
  });

  it('sur iPhone déjà installé, passe directement aux notifications', () => {
    expect(
      decideEngagementStep(env({ ios: true, standalone: true }), null, now),
    ).toBe('notifications');
  });

  it('sur Android, installe d’abord quand Chrome le permet, sinon notifications', () => {
    expect(
      decideEngagementStep(env({ android: true, canPromptInstall: true }), null, now),
    ).toBe('install-android');
    expect(
      decideEngagementStep(env({ android: true, canPromptInstall: false }), null, now),
    ).toBe('notifications');
  });

  it('dans l’application installée, redemande les notifications à chaque ouverture tant que rien n’est décidé', () => {
    const installed = env({ android: true, standalone: true, canPromptInstall: true });
    // Ni la pause de l'installation ni son bouton n'ont d'effet une fois installé.
    expect(decideEngagementStep(installed, null, now)).toBe('notifications');
    expect(decideEngagementStep(installed, now + INSTALL_PAUSE_DURATION_MS, now)).toBe(
      'notifications',
    );
    expect(
      decideEngagementStep({ ...installed, permission: 'granted' }, null, now),
    ).toBeNull();
    expect(
      decideEngagementStep({ ...installed, permission: 'denied' }, null, now),
    ).toBeNull();
  });

  it('la pause ne concerne que la suggestion d’installation', () => {
    const paused = now + 1;
    // iPhone dans Safari (pas de Web Push hors installation) : on se tait.
    expect(
      decideEngagementStep(
        env({ ios: true, pushSupported: false, permission: 'unsupported' }),
        paused,
        now,
      ),
    ).toBeNull();
    // Android dans le navigateur : on passe aux notifications.
    expect(
      decideEngagementStep(env({ android: true, canPromptInstall: true }), paused, now),
    ).toBe('notifications');
    // Ordinateur : la question des notifications ne connaît pas la pause.
    expect(decideEngagementStep(desktopUndecided, paused, now)).toBe('notifications');
  });

  it('la suggestion d’installation revient à l’échéance de la pause', () => {
    expect(decideEngagementStep(env({ ios: true }), now, now)).toBe('install-ios');
    expect(
      decideEngagementStep(env({ android: true, canPromptInstall: true }), now, now),
    ).toBe('install-android');
  });
});

describe('pause de la suggestion d’installation', () => {
  function memoire(): Map<string, string> & Pick<Storage, 'getItem' | 'setItem'> {
    const m = new Map<string, string>() as Map<string, string> &
      Pick<Storage, 'getItem' | 'setItem'>;
    m.getItem = (k) => m.get(k) ?? null;
    m.setItem = (k, v) => void m.set(k, v);
    return m;
  }

  it('écrit l’échéance et la relit', () => {
    const storage = memoire();
    const until = pauseInstallInvite(storage, now);
    expect(until).toBe(now + INSTALL_PAUSE_DURATION_MS);
    expect(storage.get(INSTALL_PAUSE_STORAGE_KEY)).toBe(String(until));
    expect(readInstallPausedUntil(storage)).toBe(until);
  });

  it('ignore une valeur illisible ou absente', () => {
    const storage = memoire();
    expect(readInstallPausedUntil(storage)).toBeNull();
    storage.set(INSTALL_PAUSE_STORAGE_KEY, 'bientôt');
    expect(readInstallPausedUntil(storage)).toBeNull();
    expect(readInstallPausedUntil(null)).toBeNull();
  });

  it('survit à un stockage qui lève (navigation privée stricte)', () => {
    const casse: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(readInstallPausedUntil(casse)).toBeNull();
    expect(pauseInstallInvite(casse, now)).toBe(now + INSTALL_PAUSE_DURATION_MS);
  });
});
