# Piège — Record A parasite OVH `185.158.133.1` (welcome page)

## Symptôme

```
$ dig +short A sksr.re @1.1.1.1
185.158.133.1
89.167.79.253
```

→ DNS retourne **2 IPs** au lieu d'une seule. ~50% du trafic part sur
la welcome page OVH au lieu du serveur ClubFlow.

## Symptôme côté utilisateur

```
$ curl https://sksr.re/
# Tantôt → contenu vitrine SKSR
# Tantôt → page "Bienvenue chez OVH" en HTML brut
```

Round-robin DNS aléatoire entre les 2 IPs.

## Cause root

À l'achat d'un domaine OVH, OVH crée **automatiquement** un record A
`@` et `www` pointant vers `185.158.133.1` (welcome page de l'hébergeur
OVH). Personne ne te le dit, c'est dans la zone DNS par défaut.

Quand on ajoute notre propre A `89.167.79.253`, OVH **n'écrase pas**
l'existant — il **ajoute** une 2e ligne. Round-robin DNS à 50/50.

## Solution

Aller dans OVH manager :
1. https://manager.eu.ovhcloud.com → Web → Domaines → `sksr.re` → Zone DNS
2. ⚠️ Vérifier **toutes les pages** (paginé : 25 records par page).
   La ligne `@ A 185.158.133.1` peut être en page 2, 3 ou 4.
3. Cocher la ligne, "Supprimer l'entrée"
4. Idem pour `www A 185.158.133.1`
5. Confirmer

Vérification :

```bash
dig +short A sksr.re @1.1.1.1
# → 89.167.79.253 (UNE SEULE IP)
```

## Records OVH à supprimer systématiquement

Pour tout nouveau domaine OVH ajouté à ClubFlow :

| Type | Name | Content | Action |
|---|---|---|---|
| A | @ | 185.158.133.1 | **Supprimer** |
| A | www | 185.158.133.1 | **Supprimer** |
| AAAA | @ | (2001:41d0:...) | Supprimer si pas le nôtre |
| MX | @ | (mxN.mail.ovh.net) | **Garder** si OVH gère le mail |

## Détection automatique

Pour vérifier en 1 commande qu'aucun domaine OVH n'a de parasite :

```bash
for h in sksr.re www.sksr.re un-temps-pour-soi.re www.un-temps-pour-soi.re; do
  ips=$(dig +short A $h @1.1.1.1)
  if echo "$ips" | grep -q "185.158.133.1"; then
    echo "❌ $h a un A parasite OVH"
  fi
done
```

## Lié

- [knowledge/infra-network.md](../../knowledge/infra-network.md)
- [runbooks/add-new-club.md](../../runbooks/add-new-club.md)
