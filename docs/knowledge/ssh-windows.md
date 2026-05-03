# SSH vers le serveur — CRITIQUE pour Claude

> Le piège qu'il ne faut **JAMAIS** re-débugger.

## Le problème en 1 phrase

L'utilisateur tourne **Windows + Git Bash**. Sa clé SSH `~/.ssh/id_ed25519`
est **protégée par passphrase**. Le shell de Claude est **non-interactif**
(pas de TTY) → impossible de saisir la passphrase à la volée.

## La solution : binaire Windows OpenSSH + service ssh-agent Windows

### Côté utilisateur (à faire 1 fois par boot)

PowerShell admin :
```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
# tape la passphrase une fois
```

### Côté Claude — TOUJOURS utiliser ce binaire

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "commande"
```

❌ **NE PAS** utiliser `ssh ...` direct → résout vers `/usr/bin/ssh` de Git
Bash qui ne voit PAS l'ssh-agent Windows → "Permission denied" même clé bonne.

## User à utiliser : `clubflow` (pas `root`)

- Root SSH désactivé (cf. `/etc/ssh/sshd_config.d/99-hardening.conf`)
- `clubflow` a `sudo NOPASSWD:ALL`
- Sa clé SSH = la même que le user laptop (copiée dans `~/.ssh/authorized_keys`)
- **Une 2e clé** (sans passphrase, dédiée GHA) est aussi dans
  `~/.ssh/authorized_keys` pour les déploiements automatisés CI/CD

## fail2ban — éviter de se faire bannir

Le serveur a **fail2ban actif** sur la jail `sshd`. Default :
- 5 tentatives échouées en 10 min → ban 10 min
- Après ban, **TCP timeout** sur port 22 (pas "refused")

L'IP de l'utilisateur (`102.35.136.228`) est whitelistée dans
`/etc/fail2ban/jail.d/clubflow.local`. Si elle change (mobile/VPN), il faut
mettre à jour. Pour vérifier l'IP actuelle :
```bash
curl -s https://ifconfig.me
```

Si banni quand même → `runbooks/unban-ip.md`.

## Test rapide de connectivité

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "uname -a && hostnamectl --static"
```

Doit afficher `Linux clubflow-prod ...` + `clubflow-prod`.

## Pitfall associé

Voir `docs/memory/pitfalls/ssh-passphrase-non-tty.md` pour le détail historique
et les fausses bonnes idées à éviter.
