# Piège — SSH `Permission denied` quand la clé a une passphrase

## Symptôme

```
$ ssh clubflow@89.167.79.253
clubflow@89.167.79.253: Permission denied (publickey).
```

Ou pire :

```
$ ssh clubflow@89.167.79.253 "echo ok"
ssh: connect to host 89.167.79.253 port 22: Connection timed out
```

(le second message = l'IP a été bannie par fail2ban après plusieurs essais ratés)

## Contexte

- OS utilisateur : Windows 11
- Shell utilisé : Git Bash
- Clé : `~/.ssh/id_ed25519` **protégée par passphrase**
- Claude tourne avec un shell Bash **non-interactif** (pas de TTY)
  → impossible de saisir la passphrase à la volée

Quand Claude lance `ssh ...` direct, il invoque `/usr/bin/ssh` (le ssh
livré avec Git Bash) qui :
1. Demande la passphrase → pas de TTY → échec immédiat
2. Ne sait PAS parler au service Windows ssh-agent

## Cause root

Le binaire `/usr/bin/ssh` de Git Bash et le binaire
`C:\Windows\System32\OpenSSH\ssh.exe` de Windows utilisent des
**stockages d'identités différents**. Le service Windows ssh-agent
(qui mémorise la passphrase pour la session) n'est lisible que par
le binaire OpenSSH Windows.

## Solution

### Côté utilisateur (PowerShell admin, 1 fois par boot)

```powershell
Set-Service ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
# tape la passphrase une seule fois
```

### Côté Claude — TOUJOURS utiliser ce binaire

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 "commande"
```

Pour simplifier : créer un alias bash dans `~/.bashrc` :

```bash
alias ssh-into-prod='"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253'
```

→ tous les runbooks utilisent `ssh-into-prod "..."`.

## Pourquoi NE PAS faire

- ❌ `ssh -i ~/.ssh/id_ed25519 ...` direct — résout vers le mauvais binaire
- ❌ Stocker la passphrase en clair dans un fichier
- ❌ Retirer la passphrase de la clé (sécurité dégradée)
- ❌ Re-tenter `ssh` en boucle quand ça échoue (fail2ban va bannir)

## Détection

Pour vérifier que ssh-agent Windows a bien la clé :

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" -G -o "BatchMode=yes" clubflow@89.167.79.253 2>&1 | head -3
"/c/Windows/System32/OpenSSH/ssh-add.exe" -l
```

Si `ssh-add -l` renvoie "The agent has no identities" → le service tourne
mais la clé n'est pas chargée (faire `ssh-add` en PowerShell).

## Si on est banni

Cf. `runbooks/unban-ip.md`. **Stopper toute tentative SSH** pendant 10 min.

## Lié

- [knowledge/ssh-windows.md](../../knowledge/ssh-windows.md)
- [runbooks/unban-ip.md](../../runbooks/unban-ip.md)
- CLAUDE.md §7 et §15
