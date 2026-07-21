# Ce qui était public ne s'affiche plus après un durcissement : cherche l'oubli du rattrapage

## Symptôme

Quelque chose de **public** — une image sur la vitrine, un fichier téléchargeable
sans compte — cesse de s'afficher (404 / accès refusé) **après** un changement
qui a resserré un contrôle d'accès. Le reste du même type de contenu, lui,
s'affiche encore.

Exemple vécu : après la refonte média « le privé l'emporte » (colonne
`MediaAsset.visibility`, défaut `PRIVATE`), les images d'événement de la vitrine
sont passées en 404. Le logo du club, les couvertures d'article et les photos
produit, eux, s'affichaient toujours.

## Cause

Un durcissement de sécurité fait basculer le défaut vers le **fermé** (ici
`PRIVATE`), puis **un rattrapage** (backfill) rouvre explicitement ce qui doit
rester public. Le piège n'est pas dans le durcissement : il est dans le
rattrapage **incomplet**. Une source de contenu public a été oubliée dans la
liste, et elle seule casse.

Dans le cas média, `isPublic` reconnaît « public » de deux façons :

1. **par relation Prisma** — l'asset est référencé comme photo de galerie,
   couverture d'article, poster de projet… (`_count` sur ces relations) ;
2. **par la colonne `visibility`** — pour les références qui ne sont PAS des
   relations Prisma mais de simples chaînes : `Club.logoUrl`,
   `BlogPost.coverImageUrl`, `ShopProduct.imageUrl`… et
   `ClubEvent.coverMediaAssetId`.

La couverture d'événement relève du cas 2 (chaîne, pas de relation → invisible
au `_count`). Le rattrapage de visibilité listait logo/blog/produit mais **pas
les événements**, et l'attache ne posait pas `PUBLIC`. Résultat : couverture
d'événement éternellement `PRIVATE`, donc 404 pour la vitrine anonyme.

## Pourquoi on ne le trouve pas en lisant le code du durcissement

Le durcissement est correct. Le bug est une **absence** dans une liste
ailleurs — le backfill, ou le point d'attache qui aurait dû poser `PUBLIC`.
Chercher dans `isPublic` ne montre rien de faux ; il faut chercher ce qui **n'y
est pas**.

## La règle

Quand tu resserres un défaut de sécurité vers le fermé, la question n'est pas
« mon nouveau contrôle est-il correct ? » mais **« ai-je énuméré TOUTES les
sources qui doivent rester ouvertes ? »**. Concrètement :

- inventorie toute référence à la ressource, **relations Prisma ET colonnes
  chaînes** (`grep` le nom de la colonne/clé étrangère à travers le schéma) ;
- pose l'ouverture **à la source qui crée le lien** (ici : à l'attache de la
  couverture, une écriture conditionnelle qui pose `visibility = PUBLIC`), pas
  seulement dans un script de rattrapage ponctuel — sinon le prochain élément
  créé retombe dans le trou ;
- le rattrapage répare l'existant ; l'écriture-à-la-source empêche la récidive.
  Il faut **les deux**.

## Diagnostic express

Quelque chose de public casse après un durcissement d'accès ?

```bash
# 1. la donnée est-elle réellement fermée, ou est-ce l'affichage ?
#    -> regarde la BASE, pas l'UI (ex. visibility de l'asset concerné)
# 2. compare avec un contenu du MÊME type qui marche encore
#    -> la différence te donne la source oubliée
# 3. grep la clé de la source cassée dans le script de rattrapage
grep -n "coverMediaAssetId" apps/api/scripts/backfill-*.ts   # absente = trouvé
```

## Rencontré

2026-07-21, images d'événement en 404 sur la vitrine prod. 2 assets basculés en
`PUBLIC` (réparation), correctif à l'attache + événements ajoutés au rattrapage
(récidive). Séquelle de la refonte média [ADR/pitfall « le privé l'emporte »].

## Lié

- [echec-silencieux-chemin-erreur.md](echec-silencieux-chemin-erreur.md) — cousin :
  là c'est une erreur avalée, ici une donnée oubliée ; dans les deux cas le
  symptôme est « rien », et la cause est une **absence** qu'aucun `grep` d'erreur
  ne révèle.
