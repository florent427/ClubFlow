import { describe, expect, it } from 'vitest';
import {
  memberPortalHostFromAdminHost,
  memberPortalSwitchUrl,
  pickMemberPortalProfile,
  resolveMemberPortalSession,
  type PortalProfileCandidate,
} from './member-portal-switch';

/** JWT non signé : seule la charge utile compte pour le navigateur. */
function jwtWith(payload: Record<string, unknown>): string {
  const b64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `xx.${b64url}.yy`;
}

describe('memberPortalHostFromAdminHost', () => {
  it('déduit le portail du sous-domaine de l’admin', () => {
    expect(memberPortalHostFromAdminHost('app.clubflow.topdigital.re')).toBe(
      'portail.clubflow.topdigital.re',
    );
  });

  it('garde le préfixe de l’environnement', () => {
    expect(
      memberPortalHostFromAdminHost('staging.app.clubflow.topdigital.re'),
    ).toBe('staging.portail.clubflow.topdigital.re');
  });

  it('renvoie null quand l’hôte ne suit pas ce schéma', () => {
    expect(memberPortalHostFromAdminHost('localhost')).toBeNull();
    expect(memberPortalHostFromAdminHost('sksr.re')).toBeNull();
    expect(memberPortalHostFromAdminHost('application.sksr.re')).toBeNull();
  });
});

describe('memberPortalSwitchUrl', () => {
  it('passe la session dans le fragment, seul canal entre deux origines', () => {
    expect(
      memberPortalSwitchUrl('https://portail.example.re/', 'jeton.abc', 'c1'),
    ).toBe('https://portail.example.re/#sso=jeton.abc&club=c1');
  });

  it('échappe le jeton et le club', () => {
    expect(memberPortalSwitchUrl('/membre', 'a+b/c=', 'club 2')).toBe(
      '/membre#sso=a%2Bb%2Fc%3D&club=club%202',
    );
  });

  it('ajoute à un fragment déjà présent', () => {
    expect(memberPortalSwitchUrl('/membre#deja', 'j', 'c')).toBe(
      '/membre#deja&sso=j&club=c',
    );
  });
});

// Le compte du bug de staging (2026-10-21) : profil principal dans « demo »,
// un autre profil dans « club-demo », admin positionné sur « club-demo ».
const DEMO_PRIMARY: PortalProfileCandidate = {
  memberId: 'm-demo',
  clubId: 'demo',
  isPrimaryProfile: true,
};
const CLUB_DEMO: PortalProfileCandidate = {
  memberId: 'm-club-demo',
  clubId: 'club-demo',
  isPrimaryProfile: false,
};

describe('pickMemberPortalProfile', () => {
  it('prend le profil du club courant, pas le profil principal d’un autre club', () => {
    expect(
      pickMemberPortalProfile([DEMO_PRIMARY, CLUB_DEMO], 'club-demo', 'm-demo'),
    ).toEqual({ memberId: 'm-club-demo', clubId: 'club-demo' });
  });

  it('garde le profil actif quand il est du club courant', () => {
    const enfant = { memberId: 'm-enfant', clubId: 'demo', isPrimaryProfile: false };
    expect(
      pickMemberPortalProfile([DEMO_PRIMARY, enfant], 'demo', 'm-enfant'),
    ).toEqual({ memberId: 'm-enfant', clubId: 'demo' });
  });

  it('préfère le profil principal du club courant au premier venu', () => {
    const enfant = { memberId: 'm-enfant', clubId: 'demo', isPrimaryProfile: false };
    expect(
      pickMemberPortalProfile([enfant, DEMO_PRIMARY, CLUB_DEMO], 'demo', 'm-club-demo'),
    ).toEqual({ memberId: 'm-demo', clubId: 'demo' });
  });

  it('sans profil dans le club courant, ouvre le club d’un autre profil', () => {
    expect(
      pickMemberPortalProfile([CLUB_DEMO], 'autre-club', null),
    ).toEqual({ memberId: 'm-club-demo', clubId: 'club-demo' });
  });

  it('ignore les profils sans membre et renvoie null sans profil membre', () => {
    expect(
      pickMemberPortalProfile(
        [{ memberId: null, clubId: 'club-demo', isPrimaryProfile: true }],
        'club-demo',
        null,
      ),
    ).toBeNull();
  });
});

describe('resolveMemberPortalSession', () => {
  it('émet un jeton du profil du club courant quand le profil actif est d’un autre club', async () => {
    const adminToken = jwtWith({ sub: 'u1', activeProfileMemberId: 'm-demo' });
    const selected: string[] = [];
    const session = await resolveMemberPortalSession(
      adminToken,
      'club-demo',
      [DEMO_PRIMARY, CLUB_DEMO],
      async (memberId) => {
        selected.push(memberId);
        return 'jeton-club-demo';
      },
    );
    expect(selected).toEqual(['m-club-demo']);
    expect(session).toEqual({ token: 'jeton-club-demo', clubId: 'club-demo' });
  });

  it('réutilise le jeton quand son profil actif est déjà du club courant', async () => {
    const adminToken = jwtWith({ sub: 'u1', activeProfileMemberId: 'm-club-demo' });
    let calls = 0;
    const session = await resolveMemberPortalSession(
      adminToken,
      'club-demo',
      [DEMO_PRIMARY, CLUB_DEMO],
      async () => {
        calls += 1;
        return 'inutile';
      },
    );
    expect(calls).toBe(0);
    expect(session).toEqual({ token: adminToken, clubId: 'club-demo' });
  });

  it('renvoie null sans profil membre, sans appeler la mutation', async () => {
    let calls = 0;
    const session = await resolveMemberPortalSession(
      jwtWith({ sub: 'u1' }),
      'club-demo',
      [],
      async () => {
        calls += 1;
        return 'inutile';
      },
    );
    expect(calls).toBe(0);
    expect(session).toBeNull();
  });

  it('laisse remonter l’échec de la mutation au lieu de transmettre le mauvais jeton', async () => {
    await expect(
      resolveMemberPortalSession(
        jwtWith({ activeProfileMemberId: 'm-demo' }),
        'club-demo',
        [DEMO_PRIMARY, CLUB_DEMO],
        async () => {
          throw new Error('réseau');
        },
      ),
    ).rejects.toThrow('réseau');
  });
});
