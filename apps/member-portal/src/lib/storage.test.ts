// Ni jsdom ni happy-dom ne sont installés dans cette application, et en
// ajouter un pour un seul fichier serait cher (pas de workspaces npm,
// ADR-0004 : la dépendance serait à installer et à maintenir ici seule).
//
// `storage.ts` n'a besoin que de deux choses : un `localStorage` et un
// `window` capable de porter des événements. Node fournit `EventTarget` et
// `Event` en natif, donc les voici — c'est plus petit qu'un DOM complet et
// ça suffit à éprouver exactement ce qui est testé ici.
//
// LIMITE ASSUMÉE : ces doubles ne prouvent RIEN sur le comportement réel du
// navigateur. Ils vérifient QUAND l'événement part et dans quel état est la
// session à ce moment — pas qu'Apollo vide effectivement son cache.
const memoire = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => memoire.get(k) ?? null,
  setItem: (k: string, v: string) => void memoire.set(k, String(v)),
  removeItem: (k: string) => void memoire.delete(k),
  clear: () => memoire.clear(),
  key: (i: number) => [...memoire.keys()][i] ?? null,
  get length() {
    return memoire.size;
  },
} as Storage;
globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAuth,
  getClubId,
  getToken,
  SESSION_CHANGED_EVENT,
  setMemberContactSession,
  setMemberSession,
  setToken,
} from './storage';

/** Compte les événements et photographie le stockage AU MOMENT de chacun. */
function espion() {
  const instantanes: Array<{ token: string | null; clubId: string | null }> = [];
  const handler = () =>
    instantanes.push({ token: getToken(), clubId: getClubId() });
  window.addEventListener(SESSION_CHANGED_EVENT, handler);
  return {
    instantanes,
    stop: () => window.removeEventListener(SESSION_CHANGED_EVENT, handler),
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('SESSION_CHANGED_EVENT — ce qui déclenche le vidage du cache', () => {
  it('part à la CONNEXION complète', () => {
    const e = espion();
    setMemberSession('tok-a', 'club-1');
    e.stop();

    expect(e.instantanes).toHaveLength(1);
  });

  it('part à la DÉCONNEXION', () => {
    setMemberSession('tok-a', 'club-1');
    const e = espion();
    clearAuth();
    e.stop();

    expect(e.instantanes).toHaveLength(1);
    // Au moment où l'abonné vide le cache, la session est bien effacée.
    expect(e.instantanes[0]).toEqual({ token: null, clubId: null });
  });

  it('part au CHANGEMENT DE PROFIL, qui est un changement d’identité', () => {
    setMemberSession('tok-a', 'club-1');
    const e = espion();
    setMemberSession('tok-b', 'club-2');
    e.stop();

    expect(e.instantanes).toHaveLength(1);
  });

  it('part sur `setToken` seul — le chemin multi-profils de LoginPage', () => {
    const e = espion();
    setToken('tok-a');
    e.stop();

    expect(e.instantanes).toHaveLength(1);
  });

  it('part aussi pour une session CONTACT', () => {
    const e = espion();
    setMemberContactSession('tok-c', 'club-3');
    e.stop();

    expect(e.instantanes).toHaveLength(1);
  });
});

describe('l’événement ne part JAMAIS sur une session à moitié écrite', () => {
  it('le club est DÉJÀ posé quand l’abonné est réveillé', () => {
    // Le défaut que ce test ferme : `setMemberSession` déléguait à `setToken`,
    // qui notifiait aussitôt — donc l'abonné vidait le cache alors que le
    // jeton était posé mais PAS ENCORE le club. La requête suivante serait
    // partie sans `x-club-id`, et le serveur aurait répondu sur le mauvais
    // périmètre, ou refusé.
    const e = espion();
    setMemberSession('tok-a', 'club-1');
    e.stop();

    expect(e.instantanes).toEqual([{ token: 'tok-a', clubId: 'club-1' }]);
  });

  it('idem pour une session contact', () => {
    const e = espion();
    setMemberContactSession('tok-c', 'club-3');
    e.stop();

    expect(e.instantanes).toEqual([{ token: 'tok-c', clubId: 'club-3' }]);
  });

  it('n’émet qu’UNE fois, pas deux', () => {
    // Émettre deux fois viderait le cache deux fois par connexion : sans
    // conséquence fonctionnelle, mais c'est le symptôme de la notification
    // prématurée qu'on vient de supprimer. Le compte est donc la garantie.
    const e = espion();
    setMemberSession('tok-a', 'club-1');
    setMemberContactSession('tok-c', 'club-3');
    e.stop();

    expect(e.instantanes).toHaveLength(2);
  });
});

describe('témoin — le stockage fait toujours son travail', () => {
  it('écrit et relit jeton et club', () => {
    setMemberSession('tok-a', 'club-1');
    expect(getToken()).toBe('tok-a');
    expect(getClubId()).toBe('club-1');
  });

  it('n’émet rien si personne ne change la session', () => {
    setMemberSession('tok-a', 'club-1');
    const e = espion();
    getToken();
    getClubId();
    e.stop();

    expect(e.instantanes).toHaveLength(0);
  });
});
