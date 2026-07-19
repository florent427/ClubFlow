# Piège — une revue adversariale qui réfute 100 % de ses constats

## Symptôme

Le rapport final d'une revue multi-agents est parfaitement propre :

```
27 constats émis · 0 confirmé · 27 écartés
bloquants : 0   majeurs : 0
```

Chaque constat porte la mention `3/3 réfutent`. Tout est vert, rien à
corriger. C'est précisément ce qui doit alerter.

## Contexte

Rencontré le 2026-07-19 sur la revue des 5 correctifs Stripe Phase 2.
Six relecteurs, 27 constats, 87 agents au total — et un taux de réfutation
de **100 %**.

Deux constats avaient été écartés à **2 voix sur 3** seulement. Relus à la
main, **les deux étaient justes** :

- ADR-0011 affirmait que `refundClubPayment` « exige un montant ». Faux :
  `amountCents` est déclaré `nullable: true`, seul le motif est obligatoire.
- La description GraphQL de la même mutation portait encore la justification
  d'avant la décision — celle qui ne vaut que pour une facture déjà soldée —
  et taisait l'abandon de créance.

Deux défauts réels, tous deux dans des textes que l'auteur de la revue avait
écrits lui-même une heure plus tôt.

## Cause root

Les réfuteurs reçoivent une consigne délibérément sévère :

```
Tu es RÉFUTEUR. Démolis ce constat, ne le confirme pas.
Considère-le FAUX tant que tu ne l'as pas vérifié toi-même.
En cas de doute non levé, réfute.
```

Cette consigne est **bonne** : sans elle, la revue produit des constats
plausibles-mais-faux qui coûtent des heures. Mais elle ne distingue pas un
constat faux d'un constat vrai et inconfortable. Le « en cas de doute,
réfute » s'applique aux deux.

Le vote majoritaire aggrave l'effet : un constat réfuté 2/3 est écarté
exactement comme un constat réfuté 3/3, alors que la voix dissidente est le
signal le plus intéressant du lot.

## Solution

**Le taux de réfutation est une métrique à lire, pas un score à célébrer.**

| Taux | Lecture |
|---|---|
| 40–70 % | régime normal — la revue trie |
| > 90 % | contrôler à la main, la consigne mord trop |
| 100 % | relire systématiquement tous les non-unanimes |

Concrètement, après chaque revue :

```bash
# Les constats écartés à 2/3 sont les plus suspects : une voix a résisté.
# C'est là qu'il faut regarder, PAS dans le compteur de confirmés.
```

Un constat écarté à 2/3 mérite une lecture humaine de trois minutes. Écarté
à 3/3, on peut faire confiance.

## Pourquoi NE PAS faire

- ❌ **Adoucir la consigne des réfuteurs** pour « équilibrer ». Elle produit
  sa valeur exactement là où elle est sévère ; l'assouplir ramène les
  constats plausibles-mais-faux, bien plus coûteux qu'une relecture.
- ❌ **Passer à l'unanimité requise pour écarter** (3/3 obligatoire). Un seul
  réfuteur mal luné suffirait alors à faire survivre n'importe quoi, et le
  rapport se remplit de bruit.
- ❌ **Se fier au compteur `confirmés: 0`** pour conclure que le code est bon.
  C'est le sens même de ce piège.

## Détection

Le signal d'alarme n'est pas dans le rapport, il est dans sa forme :

> Une revue qui ne trouve rien après avoir émis des dizaines de constats
> n'a pas prouvé que le code est propre. Elle a prouvé que ses réfuteurs
> font leur travail.

Deux questions à se poser devant un rapport 100 % vert :

1. Combien de constats ont été écartés à **2/3** ? Les relire.
2. La revue portait-elle sur du code que **j'ai écrit moi-même** ? Les
   défauts trouvés ce jour-là étaient dans des commentaires et un ADR —
   la matière que les relecteurs traitent le plus légèrement, et celle où
   l'auteur se relit le moins bien.

## Le motif de fond

C'est un cousin de
[test-verifie-la-forme-pas-le-comportement](test-verifie-la-forme-pas-le-comportement.md) :
un dispositif de vérification qui reste vert n'est rassurant que si on a
vérifié qu'il **peut** rougir. Pour un test, c'est le mutation testing. Pour
une revue adversariale, c'est la relecture des non-unanimes.

## Lié

- [test-verifie-la-forme-pas-le-comportement.md](test-verifie-la-forme-pas-le-comportement.md)
- [garantie-derriere-effet-de-bord.md](garantie-derriere-effet-de-bord.md) —
  trouvé, lui, par une revue qui confirmait
- [ADR-0011](../decisions/0011-remboursement-eteint-la-creance.md) — l'un des
  deux défauts manqués s'y trouvait
