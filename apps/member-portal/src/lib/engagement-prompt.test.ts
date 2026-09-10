import { describe, expect, it } from 'vitest';
import {
  SNOOZE_DURATION_MS,
  SNOOZE_STORAGE_KEY,
  decideEngagementStep,
  readSnoozedUntil,
  snoozeEngagement,
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

  it('sur Android ouvert depuis l’écran d’accueil, ne propose plus l’installation', () => {
    expect(
      decideEngagementStep(
        env({ android: true, standalone: true, canPromptInstall: true }),
        null,
        now,
      ),
    ).toBe('notifications');
  });

  it('respecte la pause demandée, puis revient à son échéance', () => {
    expect(decideEngagementStep(desktopUndecided, now + 1, now)).toBeNull();
    expect(decideEngagementStep(desktopUndecided, now, now)).toBe('notifications');
    expect(
      decideEngagementStep(env({ ios: true }), now + SNOOZE_DURATION_MS, now),
    ).toBeNull();
  });
});

describe('pause de l’invitation', () => {
  function memoire(): Map<string, string> & Pick<Storage, 'getItem' | 'setItem'> {
    const m = new Map<string, string>() as Map<string, string> &
      Pick<Storage, 'getItem' | 'setItem'>;
    m.getItem = (k) => m.get(k) ?? null;
    m.setItem = (k, v) => void m.set(k, v);
    return m;
  }

  it('écrit l’échéance et la relit', () => {
    const storage = memoire();
    const until = snoozeEngagement(storage, now);
    expect(until).toBe(now + SNOOZE_DURATION_MS);
    expect(storage.get(SNOOZE_STORAGE_KEY)).toBe(String(until));
    expect(readSnoozedUntil(storage)).toBe(until);
  });

  it('ignore une valeur illisible ou absente', () => {
    const storage = memoire();
    expect(readSnoozedUntil(storage)).toBeNull();
    storage.set(SNOOZE_STORAGE_KEY, 'bientôt');
    expect(readSnoozedUntil(storage)).toBeNull();
    expect(readSnoozedUntil(null)).toBeNull();
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
    expect(readSnoozedUntil(casse)).toBeNull();
    expect(snoozeEngagement(casse, now)).toBe(now + SNOOZE_DURATION_MS);
  });
});
