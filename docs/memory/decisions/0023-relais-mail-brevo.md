# ADR-0023 — Le mail sortant passe par le relais SMTP de Brevo

## Statut

✅ **Accepté** — en production depuis le 2026-05 ; écrit le 2026-09-18, après
l'audit du 2026-09-14, qui a relevé qu'aucune décision ne tracait ce choix.

## Contexte

ClubFlow envoie deux familles de messages :

- **transactionnels** : vérification d'adresse, réinitialisation de mot de
  passe, factures, rappels, reçus. Un seul destinataire, attendu, et leur perte
  bloque un parcours ;
- **campagnes** : annonces d'un club à ses adhérents. Beaucoup de
  destinataires, non sollicités individuellement.

Le premier montage, décrit par
[runbooks/smtp-relay-production.md](../../runbooks/smtp-relay-production.md),
était un **Postfix auto-hébergé** sur le serveur. Il a été abandonné :

- l'IP d'un petit VPS n'a aucune réputation, et Gmail comme Outlook classent
  ses messages en indésirables, quand ils ne les rejettent pas ;
- DKIM, SPF et DMARC étaient à tenir à la main, par club et par domaine ;
- rien ne dit si un message est arrivé : ni rebond exploitable, ni plainte.

## Décision

**Le transport sortant est le relais SMTP de Brevo** (ex-Sendinblue), en
STARTTLS sur le port 587, avec une clé SMTP dédiée.

Ce qui en découle :

1. **L'API reste générique.** `SmtpMailTransport` ne connaît que
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` : changer de relais est
   un changement de variables, pas de code. Le montage Postfix reste donc
   applicable si la décision est revue.
2. **Chaque club a ses domaines d'envoi**, portés par `ClubSendingDomain`, avec
   un usage : `TRANSACTIONAL`, `CAMPAIGN` ou `BOTH`. Un club qui perd la
   réputation de son domaine de campagnes n'entraîne pas ses mails de
   vérification.
3. **L'authentification du domaine chez Brevo est faite par l'équipe
   ClubFlow**, pas depuis l'admin. Le bouton « Vérifier » de l'admin ne change
   donc pas le statut quand le serveur ne sait pas contrôler (cf. le point 1.4
   de l'audit) : un domaine marqué prêt sans être authentifié voit ses mails
   rejetés en silence.
4. **Les campagnes portent `List-Unsubscribe`** (un clic, RFC 8058) : sans
   bouton « Se désabonner », le lecteur lassé clique « Spam », et la
   réputation du domaine partagé tombe pour tout le monde, mails de
   vérification compris.

## Conséquences

- **Coût** : gratuit jusqu'à 300 messages par jour, tous clubs confondus
  (cf. [infra-prod.md](../../knowledge/infra-prod.md)). Au-delà, plan payant.
  Ce plafond est partagé : une grosse campagne d'un club peut manger la
  journée d'un autre.
- **Dépendance** : un incident chez Brevo coupe tous les envois. Aucun repli
  automatique n'est en place.
- **Rebonds et plaintes** : Brevo les connaît, ClubFlow non. La liste de
  suppression (`EmailSuppression`) existe et est respectée à l'envoi, mais
  seule la désinscription la remplit. Le webhook Brevo qui la remplirait
  demande une clé d'API que le serveur de prod n'a pas encore (la clé
  actuelle est refusée : « API Key is not enabled »).
- **Vérification réelle d'un domaine** : bloquée par la même clé.

## Lié

- [runbooks/add-new-club.md](../../runbooks/add-new-club.md) — déclarer le
  domaine d'un nouveau club chez Brevo.
- [runbooks/provision-third-party-secrets.md](../../runbooks/provision-third-party-secrets.md)
  — clés et domaines par API.
- [runbooks/rotate-secrets.md](../../runbooks/rotate-secrets.md) — rotation de
  la clé Brevo.
- [runbooks/smtp-relay-production.md](../../runbooks/smtp-relay-production.md)
  — le montage Postfix remplacé.
- [knowledge/stack.md](../../knowledge/stack.md)
