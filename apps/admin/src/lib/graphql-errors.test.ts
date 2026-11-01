import { describe, expect, it } from 'vitest';
import { authRedirectFor } from './graphql-errors';

/** Erreur telle que l'API la renvoie pour un module coupé. */
const moduleDisabled = {
  message: 'Le module PLANNING n’est pas activé pour ce club',
  extensions: {
    code: 'FORBIDDEN',
    originalError: {
      statusCode: 403,
      reason: 'MODULE_DISABLED',
      module: 'PLANNING',
    },
  },
};

/** Refus du contexte de club (club périmé, appartenance perdue). */
const clubRefused = {
  message: 'Forbidden resource',
  extensions: {
    code: 'FORBIDDEN',
    originalError: { statusCode: 403, message: 'Forbidden' },
  },
};

describe('authRedirectFor', () => {
  it('reste sur la page quand seul un module est coupé', () => {
    expect(authRedirectFor([moduleDisabled], 'ClubCourseSlots')).toBeNull();
  });

  it('renvoie vers la sélection du club quand le club est refusé', () => {
    expect(authRedirectFor([clubRefused], 'ClubCourseSlots')).toBe('select-club');
  });

  it('renvoie vers la sélection si un refus de club accompagne un module coupé', () => {
    expect(
      authRedirectFor([moduleDisabled, clubRefused], 'Dashboard'),
    ).toBe('select-club');
  });

  it('ne boucle pas sur la page de sélection elle-même', () => {
    expect(authRedirectFor([clubRefused], 'MyAdminClubs')).toBeNull();
  });

  it('renvoie vers la connexion sur un jeton refusé, avant tout le reste', () => {
    expect(
      authRedirectFor(
        [clubRefused, { extensions: { code: 'UNAUTHENTICATED' } }],
        'Dashboard',
      ),
    ).toBe('login');
  });

  it('ignore les autres erreurs', () => {
    expect(
      authRedirectFor([{ extensions: { code: 'BAD_USER_INPUT' } }], 'X'),
    ).toBeNull();
  });
});
