# `atob()` ne décode ni l'UTF-8 ni le base64url : mojibake visible, déconnexions invisibles

## Symptôme

Deux symptômes très différents, une seule cause.

**Le visible** : `Admin dÃ©mo` dans la barre du haut, `PrÃ©nom`,
`AdhÃ©rent` — du mojibake sur tout accent provenant d'un JWT.

**L'invisible, bien plus grave** : des sessions membres parfaitement
valides sont déconnectées **par intermittence**, sans message. Rien dans
les logs. L'utilisateur dit juste « ça m'a déconnecté ».

## Cause

Le décodage du payload JWT était fait ainsi :

```ts
// ❌ deux bugs en une ligne
const payload = JSON.parse(atob(token.split('.')[1]));
```

1. **`atob()` rend des octets Latin-1.** Chaque octet UTF-8 devient un
   caractère : `é` (0xC3 0xA9) ressort en `Ã©`. D'où le mojibake.

2. **`atob()` lève sur le base64url.** Les JWT utilisent l'alphabet
   base64**url** (`-` et `_` au lieu de `+` et `/`, padding `=` souvent
   omis). `atob` attend du base64 standard et jette un
   `InvalidCharacterError` dès qu'un token contient un `-` ou un `_` —
   ce qui dépend entièrement du contenu encodé, donc **de façon
   apparemment aléatoire d'un token à l'autre**.

L'exception était avalée par un `catch` qui traitait l'échec comme « token
illisible » → session considérée invalide → déconnexion. C'est ce
`catch` muet qui a rendu le bug si difficile à voir : un token sur *n*
échouait, sans laisser de trace.

## Correctif

```ts
function decodeJwtPayload(token: string): unknown {
  const part = token.split('.')[1];
  // base64url → base64, puis padding
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
```

`TextDecoder` fait la lecture UTF-8 correcte ; la normalisation d'alphabet
et le padding suppriment la classe d'échec aléatoire.

Ce helper est **volontairement dupliqué** dans `apps/admin/src/lib/jwt.ts`
et `apps/member-portal/src/lib/jwt.ts` : pas de workspaces npm sur ce repo
(cf. [ADR-0004](../decisions/0004-no-monorepo-workspaces.md)). Corriger
l'un sans l'autre laisse la moitié du bug en place — c'est arrivé.

## Ce qu'il faut retenir

Un bug **cosmétique** signalé par l'utilisateur (« la gestion des
caractères à peaufiner ») cachait une **panne fonctionnelle** bien plus
sérieuse. Quand un décodage est faux, demander : *que se passe-t-il quand
il ne se contente pas d'être faux, mais qu'il lève ?*

## Rencontré

2026-07-20. Le mojibake a été signalé ; les déconnexions intermittentes,
elles, n'ont été comprises qu'en corrigeant le décodage.

## Lié

- [echec-silencieux-chemin-erreur.md](echec-silencieux-chemin-erreur.md)
- [ADR-0004 — pas de workspaces npm](../decisions/0004-no-monorepo-workspaces.md)
