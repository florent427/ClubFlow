# Suivi de build EAS : un flag invalide rend le statut illisible, et le monitor tourne dans le vide

## Symptôme

Une boucle de surveillance d'un build EAS tourne **des heures** en
rapportant un statut inconnu — alors que le build est terminé depuis
longtemps côté serveur.

Cas réel : monitor lancé le soir, encore actif au matin. Le build, lui,
avait fini **en une heure**.

## Cause

`eas build:view` **n'accepte pas `--non-interactive`**. Le flag existe sur
`eas build` (le lancement), pas sur la consultation. Passé quand même, la
commande sort en erreur au lieu de rendre un statut.

La boucle interprétait alors chaque itération comme « statut indéterminé,
on réessaie » — indéfiniment. **Un échec de l'outil de mesure lu comme une
absence de résultat**, jamais comme une panne.

## Solution

Interroger la liste, en JSON, sans flag interactif :

```bash
eas build:list --limit 1 --json --non-interactive | \
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
    const b=JSON.parse(s)[0];console.log(b.status, b.completedAt ?? '(en cours)');})"
```

Et **borner toute boucle d'attente** : un nombre maximal d'itérations, plus
une sortie explicite en cas de statut illisible plusieurs fois de suite. Un
monitor qui ne peut pas conclure doit le dire, pas continuer.

## La règle, au-delà d'EAS

Deux réflexes que cet incident a coûté cher à apprendre :

1. **Distinguer « pas encore fini » de « je n'arrive pas à savoir ».** Une
   boucle qui confond les deux ne s'arrête jamais. Le second cas doit
   remonter à l'utilisateur immédiatement.

2. **Ne pas annoncer une durée qu'on n'a pas vérifiée.** J'ai promis
   « quinze minutes » plusieurs fois de suite pour des builds qui prennent
   1 à 4 h. L'historique est à une commande :

   ```bash
   eas build:list --limit 5
   ```

## Rencontré

2026-07-20/21, builds du dev-client mobile. Le symptôme a été signalé par
Florent — « ??? ça fait une nuit que ça tourne ? » — et non détecté par
moi, ce qui est précisément le problème : la boucle était conçue pour ne
jamais se plaindre.

## Lié

- [module-natif-ne-passe-pas-par-metro.md](module-natif-ne-passe-pas-par-metro.md)
  — la raison pour laquelle on reconstruit un dev-client.
- [echec-silencieux-chemin-erreur.md](echec-silencieux-chemin-erreur.md)
