# Runbook — Débannir une IP de fail2ban

> Référencé par `pitfalls/ssh-passphrase-non-tty.md` et le playbook §15 de
> CLAUDE.md.

## Symptômes

- `ssh: connect to host 89.167.79.253 port 22: Connection timed out`
- `Network is unreachable` après plusieurs tentatives échouées
- Différent de `Permission denied` (problème de clé) ou `Connection refused`
  (sshd down)

## Pourquoi

Le serveur a **fail2ban** actif sur la jail `sshd`. Default :
- 5 tentatives échouées en 10 min → ban 10 min
- Après ban : **TCP timeout** (pas refused)

## Vérifier qu'on est banni

Depuis un autre point d'accès (mobile, autre WiFi) ou la console web Hetzner :

```bash
ssh-into-prod "sudo fail2ban-client status sshd"
```

Sortie type :
```
Status for the jail: sshd
|- Filter
|  ...
`- Actions
   |- Currently banned: 1
   `- Banned IP list:    102.35.136.228
```

## Débannir manuellement

Une fois reconnecté (depuis autre IP ou console web) :

```bash
ssh-into-prod "sudo fail2ban-client unban 102.35.136.228"
```

## Si on n'a pas d'autre point d'accès → attendre

Ban dure 10 min. **Ne pas tenter de SSH pendant ce temps** sinon le compteur
repart de zéro.

## Vérifier la whitelist

L'IP `102.35.136.228` (laptop Florent) est whitelistée dans
`/etc/fail2ban/jail.d/clubflow.local`. Si elle change (mobile, VPN,
fournisseur) :

```bash
# Trouver la nouvelle IP
curl -s https://ifconfig.me

# Mettre à jour la whitelist (depuis console web ou autre IP)
ssh-into-prod "sudo nano /etc/fail2ban/jail.d/clubflow.local"
# Modifier la ligne `ignoreip = 127.0.0.1/8 ::1 102.35.136.228 NOUVELLE_IP`
ssh-into-prod "sudo systemctl restart fail2ban"
```

## Console web Hetzner (dernier recours)

URL : https://console.hetzner.com/projects/14444062/servers/128890739/console

⚠️ ATTENTION : ni `root` (pas de mdp) ni `clubflow` (pas de mdp, juste clé
SSH) ne peuvent s'y connecter via TTY direct. En pratique : la console web
est inutile pour SSH-banni → **attendre**.

Pour les vrais cas d'urgence (pas seulement SSH) : passer en single-user
mode via la console KVM Hetzner et set un mdp root temporaire. Out of
scope de ce runbook.

## Prévention

- Si Claude tente plusieurs fois SSH avec une mauvaise clé / passphrase,
  **stopper après 3 échecs** et investiguer (ssh-agent, mauvais binaire,
  etc.) au lieu de retry en boucle.
- Voir `knowledge/ssh-windows.md` pour la procédure SSH correcte.
- Voir `pitfalls/ssh-passphrase-non-tty.md` pour le cas spécifique.
