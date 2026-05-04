# Piège — PowerShell terminal convertit auto les URLs en markdown littéral

## Symptôme

Tu colles dans un terminal Windows PowerShell un texte qui contient un
nom d'hôte (`mail.clubflow.topdigital.re`) :

```powershell
PS> $sql = @"
UPDATE "ClubSendingDomain" SET fqdn = 'mail.clubflow.topdigital.re' ...
"@
```

Le terminal affiche **et stocke** :
```
UPDATE "ClubSendingDomain" SET fqdn = '[mail.clubflow.topdigital.re](http://mail.clubflow.topdigital.re)' ...
```

Si tu envoies ce SQL au serveur, le `fqdn` en DB devient le markdown
**littéral** : `[mail.clubflow.topdigital.re](http://mail.clubflow.topdigital.re)`.

## Contexte

Certains terminaux Windows (Windows Terminal, PowerShell ISE selon
config, certains plugins) **détectent les URLs et les remplacent au
collage par leur représentation markdown link**. C'est utile pour copier
vers Slack/Github, mais catastrophique pour du SQL/code.

Le `@"..."@` (here-string) PowerShell **n'échappe pas** les remplacements
faits côté terminal : la conversion a déjà eu lieu avant que la chaîne
arrive à PowerShell.

## Cause root

Behavior introduit par certains terminaux ou clipboard managers
Windows. Pas un bug PowerShell mais une "feature" niveau OS / terminal.

## Solution

### Option 1 — Saisie clavier directe (pas de copy/paste)

Tape les hostnames à la main quand tu es dans une heredoc PS. Lourd
mais sûr.

### Option 2 — Écrire le SQL côté serveur direct via `cat <<EOF`

```bash
"/c/Windows/System32/OpenSSH/ssh.exe" clubflow@89.167.79.253 \
  "sudo -u postgres psql clubflow -c \"UPDATE \\\"X\\\" SET col = 'value' WHERE id = 1;\""
```

Le SQL ne passe pas par le clipboard PowerShell — pas de conversion.
Inconvénient : escapes hell.

### Option 3 — Écrire un fichier `.sql` localement avec un éditeur (VSCode), puis scp

```powershell
# fix.sql créé via VSCode (pas de conversion clipboard)
& "C:\Windows\System32\OpenSSH\scp.exe" fix.sql clubflow@HOST:/tmp/
& "C:\Windows\System32\OpenSSH\ssh.exe" clubflow@HOST "sudo -u postgres psql clubflow -f /tmp/fix.sql"
```

⚠️ **MAIS** : si tu fais `Out-File -Encoding utf8 -NoNewline` dans PS
en ayant collé le contenu dans une variable, la conversion s'est déjà
produite en amont. **Edite le fichier directement dans VSCode**, ne
passe pas par une variable PS contenant le contenu collé.

### Option 4 — Détecter + cleanup post-coup

Si la corruption est déjà en DB, fix avec sed côté serveur (l'env bash
n'a pas la conversion) :

```bash
sudo -u postgres psql clubflow -c \
  "UPDATE \"X\" SET col = REPLACE(REPLACE(col, ']', ''), '[', '') WHERE col LIKE '%[%';"
```

Ou un UPDATE explicite avec la bonne valeur, depuis le serveur (pas
depuis PS).

## Détection rapide

Avant d'envoyer le SQL :
```powershell
echo $sql
# Si tu vois `[hostname.tld](http://hostname.tld)` → arrête, c'est corrompu
```

Côté DB après UPDATE suspect :
```sql
SELECT col FROM table WHERE col LIKE '%[%' OR col LIKE '%](http%';
```

## Cas observés

- 2026-05-04 (debug forgot password Brevo) : UPDATE SQL pour repointer
  le fqdn `ClubSendingDomain` → corrompu en
  `[mail.clubflow.topdigital.re](http://mail.clubflow.topdigital.re)`.
  Re-run depuis bash côté serveur a corrigé.

## Pourquoi NE PAS faire

- ❌ Coller du SQL contenant des hostnames dans PS sans vérifier
  visuellement avant exécution
- ❌ Croire qu'`Out-File` "préserve" le contenu — la corruption est
  dans la variable AVANT, pas dans le format de sortie
- ❌ Désactiver le markdown autoconvert dans le terminal sans
  comprendre quel composant le fait — peut casser d'autres workflows

## Lié

- [pitfalls/windows-scp-crlf-bash-script.md](windows-scp-crlf-bash-script.md) — autre piège Windows / Linux pour les scripts
- [knowledge/ssh-windows.md](../../knowledge/ssh-windows.md) — environnement SSH Windows
