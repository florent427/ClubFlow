# Workflow — Onboarder un nouveau club multi-tenant

> Vue d'ensemble du parcours complet, du devis à la mise en ligne du club.

## Phases

```
[Devis] → [Création DB] → [DNS] → [Caddy] → [Brevo] → [Contenu] → [Smoke] → [Live]
   1h        5min        10min     5min     30min      2-4h        5min       ✅
```

## 1. Devis et infos client

À collecter du club :
- **Nom officiel** (ex: "Sport Karaté SKSR")
- **Slug souhaité** (ex: `sksr` — utilisé dans URLs)
- **Domaine** (acheté par le club ou par toi avec refacturation)
- **Email contact admin**
- **Modules activés** (cf. liste : Members, Adhésions, Comms, Vitrine, etc.)
- **Charte graphique** (logo SVG, couleurs primaires/secondaires)
- **Pages vitrine voulues** (Accueil, Stages, Tarifs, Contact, etc.)

## 2. Création du club en DB (admin web)

Cf. [runbooks/add-new-club.md](../../runbooks/add-new-club.md) §1-2.

Output : `clubId` UUID + compte admin invité.

## 3. DNS

Le club ajoute chez son registrar :
- A `@` → 89.167.79.253
- AAAA `@` → 2a01:4f9:c010:99d3::1
- A `www` → 89.167.79.253
- AAAA `www` → 2a01:4f9:c010:99d3::1

⚠️ Si registrar = **OVH** : vérifier qu'il n'y a pas de record parasite
`185.158.133.1` (cf. [pitfalls/ovh-a-parasite-185-158.md](../pitfalls/ovh-a-parasite-185-158.md)).

⚠️ Si DNS via **Cloudflare** : tous les records en **DNS only** (cf.
[ADR-0002](../decisions/0002-cloudflare-dns-only.md)).

Vérifier propagation :

```bash
dig +short A clubX.fr @1.1.1.1
# → 89.167.79.253 uniquement
```

## 4. Caddy vhost + cert TLS

Cf. [runbooks/add-new-club.md](../../runbooks/add-new-club.md) §4.

Caddy obtient automatiquement le cert Let's Encrypt en ~10s après reload.

## 5. Brevo (sender domain)

Cf. [runbooks/add-new-club.md](../../runbooks/add-new-club.md) §7.

Étapes :
- Add sender domain dans Brevo console
- Ajouter 3 records DNS (DKIM/SPF/DMARC) chez le registrar du club
- Vérifier dans Brevo (clic sur "Verify")
- Déclarer le sending domain via API admin (`ClubSendingDomainService`)

⚠️ Compter ~24h pour la propagation DNS DKIM. Pas bloquant pour le
lancement vitrine (juste pour les emails sortants).

## 6. Contenu vitrine

Cf. [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md).

Connecté admin du club :
- Créer pages : `/`, `/stages`, `/tarifs`, `/contact`, `/mentions-legales`
- Ajouter blocs (texte riche, images, formulaires)
- Charger logo + bannière
- Configurer charte (couleurs primaires)
- Si articles de blog : créer 3-5 articles "evergreen"

⚠️ **Flush cache Next.js** après création :

```bash
ssh-into-prod "cd /home/clubflow/clubflow/apps/vitrine && rm -rf .next/cache .next && npm run build && sudo systemctl restart clubflow-vitrine"
```

## 7. Smoke test final

```bash
# Vitrine
for path in '/' '/stages' '/tarifs' '/contact'; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' https://clubX.fr$path) $path"
done

# Mail (depuis admin web → Settings → "Tester SMTP")
```

Tous → `200`.

## 8. Mise en main au client

Documenter pour le client :
- URL admin : https://clubflow.topdigital.re
- Credentials admin (transmis en sécurité)
- URL portail membres : https://portail.clubflow.topdigital.re
- URL vitrine : https://clubX.fr
- Procédure ajout d'un membre (vidéo / PDF)
- Contact support

## 9. Documenter l'ajout

- `knowledge/contacts-ids.md` § "URLs publiques" → ajouter le club
- Si patterns nouveaux découverts → `memory/pitfalls/`

## Coût additionnel par club

- **0 €/mois** (mutualisation sur la même infra jusqu'à 5-10 clubs)
- Brevo : gratuit jusqu'à 300 mails/jour total tous clubs
- Au-delà : passer à CCX13 (~16 €/mois) ou plan Brevo payant

## Temps total estimé

- Setup technique : ~1h (DNS + Caddy + Brevo)
- Contenu vitrine : 2-4h selon richesse
- Total : ~3-5h pour un club nouveau

## Lié

- [runbooks/add-new-club.md](../../runbooks/add-new-club.md)
- [runbooks/seed-vitrine-pages.md](../../runbooks/seed-vitrine-pages.md)
- [knowledge/infra-network.md](../../knowledge/infra-network.md)
