# Piège — `scp` Windows transfère les `.sh` avec line endings CRLF

## Symptôme

Bash refuse d'exécuter le script copié depuis Windows :

```
$ sudo bash /usr/local/bin/bootstrap-multitenant.sh
/usr/local/bin/bootstrap-multitenant.sh: line 33: $'\r': command not found
: invalid option name: line 34: set: pipefail
```

## Contexte

Sur Windows, git checkout par défaut convertit les line endings en CRLF
(via `core.autocrlf=true`). Quand on `scp` un `.sh` vers un serveur
Linux, les `\r\n` restent.

Bash interprète `\r` comme un caractère parasite (pas comme le séparateur
de ligne) → erreurs "$'\r': command not found" sur chaque ligne.

## Cause root

Git for Windows config par défaut :
```
core.autocrlf = true   # checkout LF→CRLF, commit CRLF→LF
```

Donc le fichier sur disque (et donc copié via scp) est en CRLF, alors
que bash sur Linux attend LF.

## Solution

### Option 1 — Strip CR sur le serveur après copie (rapide)

```bash
sudo sed -i 's/\r$//' /usr/local/bin/bootstrap-multitenant.sh
sudo bash /usr/local/bin/bootstrap-multitenant.sh
```

### Option 2 — Force LF côté Git (durable)

Ajouter `.gitattributes` au repo :
```
*.sh text eol=lf
*.sql text eol=lf
```

Puis re-checkout :
```bash
git rm --cached -r .
git checkout .
```

### Option 3 — `dos2unix` côté serveur si installé

```bash
sudo apt install dos2unix
sudo dos2unix /usr/local/bin/bootstrap-multitenant.sh
```

## Détection rapide

```bash
file /usr/local/bin/bootstrap-multitenant.sh
# Affiche "ASCII text, with CRLF line terminators" si le bug est là

head -1 /usr/local/bin/bootstrap-multitenant.sh | xxd | head -1
# Affiche 0d 0a au lieu de juste 0a
```

## Cas observés

- 2026-05-04 (bootstrap multi-tenant Phase 1) : `bin/bootstrap-multitenant.sh`
  scp depuis worktree Windows → `$'\r': command not found`. Fix par sed
  côté serveur.

## Pourquoi NE PAS faire

- ❌ Désactiver `core.autocrlf` sans `.gitattributes` → casse les
  `.bat`/`.cmd` Windows qui ATTENDENT CRLF
- ❌ Copier les scripts manuellement par copy-paste → caractères
  invisibles

## Lié

- [bin/bootstrap-multitenant.sh](../../../bin/bootstrap-multitenant.sh)
- [docs/knowledge/ssh-windows.md](../../knowledge/ssh-windows.md)
