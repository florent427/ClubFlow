# Piège — Confondre Cloudflare **Zone ID** et **Account ID**

## Symptôme

```
$ curl -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/<id>/dns_records" \
    -d '{"type":"A","name":"x.foo.com","content":"1.2.3.4"}'

{"success": false, "errors": [{"code": 10000, "message": "Authentication error"}]}
```

→ Erreur **`code 10000 Authentication error`** alors que `tokens/verify`
renvoie `success: true` et que les permissions sont correctes
(Zone:DNS:Edit + Zone:Read sur la bonne zone).

## Contexte

Dans Cloudflare console, l'URL de la zone DNS contient **2 UUIDs** :

```
https://dash.cloudflare.com/<ACCOUNT_ID>/<ZONE_NAME>/dns/records
```

Ex: `https://dash.cloudflare.com/414b39a309ac266f34111f8b1973df80/topdigital.re/dns/records`

→ `414b39a309ac266f34111f8b1973df80` = **Account ID** (compte CF de l'user)
→ Mais l'API zones/* exige le **Zone ID** (différent, propre à chaque zone)

Tentation : copier l'ID depuis l'URL → on tombe sur l'Account ID.

## Cause root

Cloudflare expose 2 niveaux de ressources hiérarchiques :
- `accounts/<account_id>/...` (settings du compte)
- `zones/<zone_id>/...` (settings d'une zone DNS spécifique)

Les 2 IDs sont des UUIDs lookalike. L'URL dashboard contient l'Account ID
(pas le Zone ID), parce que l'URL identifie l'utilisateur connecté + la
zone par son nom (pas par son ID).

Le token CF avec Zone:DNS:Edit n'a accès qu'au scope `zones/*`, pas
`accounts/*` → "Authentication error" si on lui passe un Account ID
comme path param zone.

## Solution

### Récupérer le **Zone ID** via API

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones" | jq -r '.result[] | {id, name}'
```

→ retourne :
```json
{"id": "159db89b3f066ba9ea329bc08f3d3f1c", "name": "topdigital.re"}
```

C'est ce `id` qu'il faut utiliser dans `zones/<ID>/dns_records`.

### Mémoriser

Pour ClubFlow :
- **Account ID** : `414b39a309ac266f34111f8b1973df80`
- **Zone ID `topdigital.re`** : `159db89b3f066ba9ea329bc08f3d3f1c`

Cf. [knowledge/contacts-ids.md](../../knowledge/contacts-ids.md) pour la
liste à jour des IDs externes.

## Détection rapide

Si erreur 10000 sur API zones/* alors que `tokens/verify` est OK :
1. Vérifier que l'ID dans l'URL est bien un Zone ID (pas Account ID)
2. Lister les zones du token : `curl /zones | jq '.result[] | {id, name}'`
3. Le `id` listé ↑ est celui à utiliser dans `zones/<id>/...`

## Pourquoi NE PAS faire

- ❌ Copier l'ID de l'URL dashboard → c'est l'Account ID
- ❌ Hardcoder l'Account ID dans les scripts (déjà fait dans `/provision`
  v1, fix dans v2)
- ❌ Donner permission `Account:DNS:Edit` au token → ça n'existe pas,
  DNS est zone-scoped

## Lié

- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md)
  (mis à jour avec le bon Zone ID)
- [knowledge/contacts-ids.md](../../knowledge/contacts-ids.md)
- Doc CF API : https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-list-dns-records
