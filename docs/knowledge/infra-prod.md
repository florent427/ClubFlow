# Infrastructure production ClubFlow

## Serveur Hetzner

```
Provider     : Hetzner Cloud
Type         : CX33 (4 vCPU x86 Intel/AMD shared, 8 GB RAM, 80 GB NVMe)
Datacenter   : Helsinki (eu-central) — RGPD ok, ping ~245 ms depuis Paris
Public IPv4  : 89.167.79.253
Public IPv6  : 2a01:4f9:c010:99d3::/64 (utilisée : ::1)
Hostname     : clubflow-prod
OS           : Ubuntu 24.04 LTS
Coût         : 6,99 €/mois HT (server + IPv4)
Console web  : https://console.hetzner.com/projects/14444062/servers/128890739/overview
```

## Storage Box (backups)

```
Type         : BX11 (1 TB)
Datacenter   : Helsinki (HEL1-BX470)
Hostname     : u587664.your-storagebox.de
Subaccount   : u587664-sub1.your-storagebox.de (chrooté /backups/)
SSH/SFTP port: 23 (PAS 22 !)
Console web  : https://console.hetzner.com/projects/14444062/storage-boxes/570065/overview
Coût         : 3,20 €/mois HT
```

## Services systemd actifs

| Unit | Port | Source | Logs |
|---|---|---|---|
| `clubflow-api.service` | 3000 | `/home/clubflow/clubflow/apps/api/dist/main.js` | `/var/log/clubflow-api.log` |
| `clubflow-vitrine.service` | 5175 | `cd apps/vitrine && npm run start` | `/var/log/clubflow-vitrine.log` |
| `clubflow-landing.service` 🆕 Phase 1 | 5176 | `cd apps/landing && npm run start` | `/var/log/clubflow-landing.log` |

```bash
# Status / restart
sudo systemctl status clubflow-api clubflow-vitrine clubflow-landing
sudo systemctl restart clubflow-api
sudo systemctl restart clubflow-vitrine
sudo systemctl restart clubflow-landing

# Logs en live
sudo tail -f /var/log/clubflow-api.log
sudo tail -f /var/log/clubflow-vitrine.log
sudo tail -f /var/log/clubflow-landing.log
```

L'admin et le portail membre sont servis en static par Caddy depuis
`/home/clubflow/clubflow/apps/{admin,member-portal}/dist/` (pas de service
systemd dédié, c'est Caddy qui sert les fichiers).

## Services système

| Service | Port | Statut |
|---|---|---|
| sshd | 22 | `sudo systemctl status ssh` |
| http (Caddy) | 80 | redirect → https |
| https (Caddy) | 443 | TLS auto Let's Encrypt |
| PostgreSQL 16 | 5432 (local only) | `sudo systemctl status postgresql` |
| Redis | 6379 (local only) | `redis-cli ping` |
| ufw firewall | — | `sudo ufw status verbose` |
| fail2ban | — | `sudo fail2ban-client status sshd` |

## Tuning PostgreSQL (8 GB RAM)

Dans `/etc/postgresql/16/main/postgresql.conf` :
```
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 256MB
wal_buffers = 16MB
```

## Compte admin initial

- **Email** : `admin@clubflow.local`
- **Password** : `ClubFlowAdmin2026!` (à changer après 1er login)
- **CLUB_ID header** : `a8a1041c-ec1e-4e4d-a1cc-cd58247cf982`
- **URL admin** : https://app.clubflow.topdigital.re *(Phase 1 — était `clubflow.topdigital.re`)*

## URLs publiques (cible Phase 1+)

```
https://clubflow.topdigital.re          → landing marketing (Next.js, port 5176)
https://app.clubflow.topdigital.re      → admin multi-tenant (Vite static)
                                          URL pattern : /<club-slug>/... (cf. ADR-0006)
https://api.clubflow.topdigital.re      → API + WS /chat (port 3000)
https://portail.clubflow.topdigital.re  → portail membre (Vite static)
https://*.clubflow.topdigital.re        → vitrine fallback Phase 2 (wildcard)
https://sksr.re                         → vitrine SKSR (+ www → 301, custom domain)
```

⚠️ Avant Phase 1 : `https://clubflow.topdigital.re` = admin (à migrer vers `app.`).
Voir CLAUDE.md → Map de la mémoire pour les ADR concernées.

## Stockage médias

Disque local `/home/clubflow/clubflow/apps/api/uploads` (par défaut).
Quand on dépasse 60 GB → ajouter un Storage Box additionnel (cf.
runbooks/add-storage-box.md).

## Variables d'env

Cf. `docs/knowledge/auth-secrets.md` pour la liste exhaustive.
Procédure de restore en cas de perte : `docs/runbooks/restore-env.md`.

## Coûts mensuels (récap, France TTC)

| Poste | TTC/mois |
|---|---|
| Hetzner CX33 + IPv4 | 8,39 € |
| Hetzner Storage Box BX11 | 3,84 € |
| Brevo (gratuit 300 mails/j) | 0 € |
| Domaine `.fr` (Gandi/OVH ~12 €/an) | ~1 € |
| **Total** | **~13,23 €** |

À upgrader quand :
- Plus de 1 club → CCX13 (vCPU dédiés AMD, ~15-16 €/mois TTC)
- Plus de 9000 mails/mois → Brevo payant (25 € pour 20k)
- Disque saturé → Storage Box BX21 (5 TB, ~13 €/mois)
