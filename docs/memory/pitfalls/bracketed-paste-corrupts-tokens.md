# Piège — Bracketed paste corrompt les tokens collés via `read -s`

## Symptôme

Tu colles un token Cloudflare/Brevo/etc. dans un `read -s` (saisie masquée).
Le token est stocké dans `/etc/clubflow/secrets.env` mais l'API rejette :

```
$ curl -H "Authorization: Bearer $CF_API_TOKEN" \
    https://api.cloudflare.com/client/v4/user/tokens/verify
{"success": false, "errors": [{"code": 1000, "message": "Invalid API Token"}]}
```

→ Vérification du fichier secrets.env :

```bash
$ sudo cat /etc/clubflow/secrets.env
CF_API_TOKEN=[200~AbCdEfGh...XyZ[201~
                ^^^^^                ^^^^^
                escapes parasites injectés par le terminal
```

Les séquences `[200~` (début paste) et `[201~` (fin paste) ont été
**incluses dans le token** au lieu d'être interprétées par le terminal.

## Contexte

**Bracketed paste mode** est une feature des terminaux modernes (xterm,
gnome-terminal, Windows Terminal, PowerShell ISE, etc.) :
- Le terminal active le mode via `\e[?2004h` (= séquence ANSI)
- Quand tu colles, le terminal **encadre** le texte par `\e[200~` et `\e[201~`
- Une appli interactive (vim, bash readline) sait reconnaître ces marqueurs
  et les **strip** avant de traiter le contenu
- Mais `read -s` du shell bash **ne strip pas** : tout le contenu (y compris
  les marqueurs) finit dans la variable

Conséquence : le token paste contient des escape sequences invisibles à
l'œil nu mais bien là côté API → "Invalid token".

## Cause root

Sur le serveur, le shell bash interactif (TTY allocué via `ssh -t`) a
bracketed paste activé par défaut sur Ubuntu 24.04. Si `read -s` est
utilisé sans précaution, les marqueurs entrent dans la variable.

Sur Windows aussi : PowerShell + Windows Terminal envoient les mêmes
séquences quand on colle dans une session SSH interactive.

## Solution

### Stratégie 1 — Désactiver bracketed paste avant `read -s`

Dans le script qui demande le token :

```bash
# Désactive bracketed paste avant le read
printf '\e[?2004l' > /dev/tty 2>/dev/null || true
read -r -s -p "Coller le token : " token
echo ""
# Réactive (politesse pour le shell parent)
printf '\e[?2004h' > /dev/tty 2>/dev/null || true
```

→ Le terminal ne va plus encadrer le paste, donc pas de marqueurs.

### Stratégie 2 — Strip défensif post-`read`

Au cas où la stratégie 1 ne marche pas (autre type de terminal),
nettoyer la variable après lecture :

```bash
# Strip CR/TAB + escape sequences ANSI bracketed paste + literal [200~/[201~
token=$(printf '%s' "$token" \
  | tr -d '\r\t' \
  | sed -E 's/\x1b\[200~//g; s/\x1b\[201~//g; s/^\[200~//; s/\[201~$//; s/^[[:space:]]+//; s/[[:space:]]+$//')
```

→ Couvre les cas :
- ESC + `[200~` (séquence ANSI complète)
- `[200~` litéral (si l'ESC a déjà été interprété)
- Espaces/tabs/CR autour
- Au début OU à la fin de la string

### Stratégie 3 — Combiner les 2 (defense in depth)

C'est ce que fait `bin/provision-setup-tokens.sh` v3 :
1. Désactive bracketed paste avant le `read`
2. Strip défensif après, au cas où

```bash
prompt_token() {
  local var_name="$1"
  # ... (autres args)

  # Désactive bracketed paste mode pour éviter les [200~ / [201~ injectés
  printf '\e[?2004l' > /dev/tty 2>/dev/null || true
  read -r -s -p "Coller le token (saisie masquée, Enter pour skip) : " token
  echo ""
  # Réactive (politesse pour le shell parent)
  printf '\e[?2004h' > /dev/tty 2>/dev/null || true

  # Strip défensif (CR/tab/escape sequences bracketed paste)
  token=$(printf '%s' "$token" \
    | tr -d '\r\t' \
    | sed -E 's/\x1b\[200~//g; s/\x1b\[201~//g; s/^\[200~//; s/\[201~$//; s/^[[:space:]]+//; s/[[:space:]]+$//')

  # ... (write to secrets file)
}
```

## Détection rapide

Si une API rejette un token "valide" :

```bash
# Inspect bytes du token (cat -A montre les escape sequences)
sudo cat -A /etc/clubflow/secrets.env | grep CF_API_TOKEN
# Si tu vois ^[[200~ ou [200~ ou [201~ → bracketed paste corruption

# Cleanup direct via sed
sudo sed -i -E 's/\[200~//g; s/\[201~//g' /etc/clubflow/secrets.env
sudo sed -i -E 's/\x1b\[200~//g; s/\x1b\[201~//g' /etc/clubflow/secrets.env

# Re-test
sudo bash -c 'source /etc/clubflow/secrets.env && \
  curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify | jq .success'
```

## Pourquoi NE PAS faire

- ❌ Faire confiance à `read -s` brut sur un terminal moderne → toujours
  strip ou désactiver bracketed paste
- ❌ Tester le token via `echo "$TOKEN"` (l'écran n'affiche PAS les
  escapes sequences même si elles sont là) → utiliser `cat -A` ou
  `od -c`
- ❌ Hardcoder le token dans un script (résoud le problème mais introduit
  un risque secret-in-git)

## Cas observés

- 2026-05-04 (provision skill v1) : CF_API_TOKEN avec `[200~...[201~`
  → "Invalid API Token" alors que le token Cloudflare était bon.
  Fix v3 du script + sed cleanup direct sur le serveur.

## Lié

- [bin/provision-setup-tokens.sh](../../../bin/provision-setup-tokens.sh) — script v3 avec fix
- [.claude/skills/provision/SKILL.md](../../../.claude/skills/provision/SKILL.md)
- [pitfalls/cloudflare-zone-id-vs-account-id.md](cloudflare-zone-id-vs-account-id.md)
- Doc référence : https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Bracketed-Paste-Mode
