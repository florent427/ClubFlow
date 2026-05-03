# Runbook — Ajouter un nouveau club (multi-tenant)

> Procédure pour onboarder un nouveau club avec son propre domaine vitrine.

## Prérequis du club

- Domaine acheté (ex: `clubX.fr`) — peu importe le registrar
- Accès admin au DNS du domaine (ou délégation NS vers Cloudflare)
- Email de contact pour Let's Encrypt (sera utilisé en fallback)

## 1. Créer le club en DB (via admin)

Connecté comme superadmin sur https://clubflow.topdigital.re :

1. Settings → Clubs → "Nouveau club"
2. Renseigner :
   - Nom (ex: `Club X`)
   - Slug (ex: `club-x`) — utilisé dans les URLs et `VITRINE_DEFAULT_CLUB_SLUG`
   - Domaine vitrine (ex: `clubx.fr`)
   - Email contact
   - Modules activés (cf. interface)
3. Récupérer le `clubId` UUID généré (visible dans la fiche club ou via
   GraphQL : `query { clubs { id slug name } }`)

## 2. Créer le compte admin du club

1. Settings → Membres → "Inviter admin"
2. Email + rôle `CLUB_ADMIN` + scope `clubId` du club
3. Le client reçoit un mail d'invitation (ou si SMTP off, copier le lien
   d'activation depuis les logs API)

## 3. Configurer DNS du domaine

### Option A : DNS chez Cloudflare (recommandé)

1. Le client délègue les NS chez Cloudflare (ou ajoute le domaine à
   l'account ClubFlow Cloudflare s'il accepte)
2. Cloudflare console → DNS → Add records :

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | @ | 89.167.79.253 | ⚠️ **DNS only** (gris) |
| AAAA | @ | 2a01:4f9:c010:99d3::1 | DNS only |
| A | www | 89.167.79.253 | DNS only |
| AAAA | www | 2a01:4f9:c010:99d3::1 | DNS only |

⚠️ **Proxy = OFF** sinon Caddy ne peut pas obtenir le cert Let's Encrypt
(challenge HTTP-01). Cf. `pitfalls/cloudflare-proxy-breaks-letsencrypt.md`.

### Option B : DNS chez n'importe quel registrar

Mêmes records (A + AAAA sur `@` et `www`) côté registrar du client.

⚠️ Si OVH : vérifier qu'il n'y a pas de **A parasite vers 185.158.133.1**
(welcome page OVH). Cf. `pitfalls/ovh-a-parasite-185-158.md`.

### Vérifier la propagation

```bash
for h in clubx.fr www.clubx.fr; do
  dig +short A $h @1.1.1.1
  dig +short AAAA $h @1.1.1.1
done
```

→ Doit renvoyer `89.167.79.253` et `2a01:4f9:c010:99d3::1` uniquement.

## 4. Ajouter le vhost Caddy

```bash
ssh-into-prod "sudo nano /etc/caddy/Caddyfile"
```

Ajouter à la fin :

```caddy
clubx.fr {
    encode zstd gzip
    reverse_proxy localhost:5175
    log { output file /var/log/caddy/clubx.log { roll_size 10mb roll_keep 5 } }
}

www.clubx.fr {
    redir https://clubx.fr{uri} permanent
}
```

```bash
ssh-into-prod "sudo touch /var/log/caddy/clubx.log && sudo chown caddy:caddy /var/log/caddy/clubx.log"
ssh-into-prod "sudo caddy validate --config /etc/caddy/Caddyfile"
ssh-into-prod "sudo systemctl reload caddy"
```

→ Caddy obtient automatiquement le cert Let's Encrypt en ~10s.

## 5. Mettre à jour la vitrine SSR pour gérer le nouveau domaine

La vitrine Next.js détermine le club à servir via le `Host` header.
Le code est dans `apps/vitrine/src/lib/club.ts` (à vérifier — sinon
multi-tenant n'est pas implémenté côté vitrine et il faut ajouter le
mapping).

Si nécessaire :
1. Coder un middleware `Host → clubSlug` (table de mapping en DB ou env)
2. Update `VITRINE_DEFAULT_CLUB_SLUG` n'est PAS suffisant si plusieurs
   clubs partagent la même app vitrine

## 6. Créer le contenu vitrine (admin)

Connecté comme admin du club :

1. Vitrine → Pages → créer (Accueil, Stages, Tarifs, Contact, etc.)
2. Vitrine → Articles de blog → créer
3. Tester en visitant `https://clubx.fr` → la home doit s'afficher avec
   le contenu du nouveau club

## 7. Mail prod (Brevo)

Si le club veut envoyer des mails depuis `noreply@clubx.fr` :

1. Brevo console → Sender domains → Add `clubx.fr`
2. Brevo donne 3 records DNS à ajouter :
   - DKIM : `brevo._domainkey.clubx.fr` CNAME `<...brevo>`
   - SPF : `clubx.fr` TXT `v=spf1 include:spf.brevosend.com ~all`
   - DMARC : `_dmarc.clubx.fr` TXT `v=DMARC1; p=none; rua=mailto:dmarc@clubx.fr`
3. Une fois Brevo a vérifié → déclarer le sender domain via API
   `ClubSendingDomainService` (admin → Settings → Mail)

## 8. Smoke test final

```bash
echo "$(curl -s -o /dev/null -w '%{http_code}' https://clubx.fr/) clubx.fr"
echo "$(curl -s -o /dev/null -w '%{http_code} ' -L -o /dev/null https://www.clubx.fr/) → www→@"
```

Tous → `200`.

## 9. Documenter

- Ajouter le club dans `knowledge/contacts-ids.md` § "URLs publiques live"
- Si DNS hébergé chez Cloudflare → noter dans `knowledge/infra-network.md`

## Coût additionnel

- 0 € (mutualisation sur la même VPS CX33 jusqu'à 5-10 clubs)
- Brevo gratuit jusqu'à 300 mails/jour total (tous clubs cumulés)
- Au-delà : passer à CCX13 (~16 €/mois) ou plan Brevo payant
