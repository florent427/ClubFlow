# Spécification — Planning : calendrier Mois / Semaine / Jour avec DnD (pas 15 min)

**Date :** 2026-04-04  
**Statut :** validée par le demandeur (brainstorming sections 1 à 3)  
**Périmètre :** `apps/admin` — route `/planning` (module **PLANNING**) ; évolution de l’écran actuellement basé formulaire + liste vers une **vue calendrier** interactive pour les **créneaux cours** (`CourseSlot`).  
**Références conception :** `design stitch/DESIGN.md` (Athletic Editorial), `design stitch/code.html` (grille semaine, cartes créneau, état conflit visuel)

---

## 1. Objectif

Offrir un **calendrier complet** en admin permettant de :

- afficher trois **vues** : **mois**, **semaine**, **jour** ;
- en **semaine** et **jour** uniquement : **déplacer** et **redimensionner** les créneaux (pas de palette de modèles réutilisables en v1) ;
- appliquer un **pas de 15 minutes** pour le positionnement et la durée après interaction ;
- conserver le **CRUD détaillé** (lieu, professeur, groupe dynamique, titre) via le flux formulaire existant, complété par le calendrier pour l’**horaire** (`startsAt` / `endsAt`).

La **source de vérité** reste l’API (`listCourseSlots`, `updateCourseSlot`, règles métier existantes sur les chevauchements professeur).

---

## 2. Comportement par vue

### 2.1 Mois

- Grille mensuelle type calendrier ; **pas** de drag-and-drop ni de resize.
- Les créneaux sont affichés en **aperçu** (pastilles, compteur par jour, ou liste compacte — détail laissé au plan d’implémentation tant que l’information reste lisible).
- **Clic sur un jour** : navigation vers la vue **semaine** centrée sur cette date (mise à jour des paramètres d’URL, voir §4).

### 2.2 Semaine

- Grille **temps × jours** (7 colonnes), alignée visuellement sur `design stitch/code.html` (en-têtes jour/date, colonne heures à gauche).
- **Drag** : déplacement d’un créneau ; le déplacement **horizontal** change le **jour** (et donc `startsAt` / `endsAt` en conservant la durée) ; le **vertical** change l’heure de début (même durée sauf si contrainte de borne, voir §3).
- **Resize** : poignée(s) verticale(s) ; la durée change par **crans de 15 minutes** (minimum une durée d’un cran).

### 2.3 Jour

- Même moteur de grille que la semaine avec **une seule colonne** jour (largeur confortable).
- Mêmes interactions DnD et resize qu’en semaine.

### 2.4 Navigation entre vues

- L’utilisateur peut basculer **Mois / Semaine / Jour** via un contrôle explicite (tabs ou segmented control).
- **Descente par clic** : depuis le mois, clic sur un jour → **semaine** ; depuis la semaine, action sur un **jour** (ex. clic sur l’en-tête de colonne) → **jour**. Le comportement exact des zones cliquables est laissé au plan d’implémentation tant qu’il reste cohérent et accessible (libellés ou `aria-label`).

---

## 3. Pas de 15 minutes et bornes de grille

- La grille définit une plage horaire affichée (ex. 08:00–22:00) — **bornes** à fixer dans l’implémentation (constantes ou paramètres club ultérieurs ; par défaut raisonnable pour un club).
- **Hauteur d’une heure** en pixels fixe pour le rendu (référence visuelle : `h-24` / 96px dans la maquette statique) ; chaque heure est découpée en **4 intervalles de 15 minutes** de hauteur égale.
- Pendant le drag et le resize, l’aperçu (fantôme) **s’aligne** sur le multiple de 15 minutes le plus proche pour éviter les oscillations entre deux crans.
- **Après** l’interaction : conversion **pixels → `startsAt` / `endsAt`** (timezone locale du navigateur pour l’affichage ; sérialisation ISO pour l’API).
- **Durée minimale** : 15 minutes. **Durée maximale** : limitée par la plage affichée (un créneau ne s’étend pas au-delà de `maxTime` sans changer de jour ; comportement du jour suivant hors grille = hors scope sauf évolution ultérieure).

### 3.1 Validation serveur (recommandée)

- Ajouter une validation optionnelle mais **recommandée** dans `PlanningService` : `startsAt` et `endsAt` alignés sur des minutes **0, 15, 30, 45** pour `create` et `update`, afin d’aligner le client et toute autre consommatrice de l’API. En cas de rejet : erreur HTTP/GraphQL explicite côté client (toast).

---

## 4. URL et état

- Paramètres suggérés : `?view=month|week|day&date=YYYY-MM-DD` (date pivot : jour affiché en vue jour ; premier jour de la semaine ou jour central selon convention choisie en vue semaine — à documenter dans le plan pour éviter les ambiguïtés de fuseau).
- Objectif : **partage de lien** et rechargement stable sans perdre la vue.

---

## 5. Données et mutations

- **Lecture** : requête existante listant les créneaux du club ; **filtrage côté client** sur l’intervalle `[début vue, fin vue]` pour limiter le rendu (les listes complètes restent acceptables en v1 si le volume est faible ; optimisation ultérieure possible).
- **Écriture après DnD** : mutation **`updateCourseSlot`** avec au minimum `id`, `startsAt`, `endsAt` ; les autres champs inchangés ne sont pas envoyés ou sont repris tels quels côté serveur (comportement actuel du resolver).
- **Déplacement horizontal** : ne modifie **pas** implicitement le `venueId` tant qu’aucune dimension « lieu par colonne » n’existe ; le lieu se change uniquement via le **formulaire détail**. Si une évolution ultérieure mappe colonnes → lieux, ce sera un spec séparé.

---

## 6. Règles métier et erreurs (existant + UI)

- Le serveur applique déjà **`assertNoCoachOverlap`** : un même professeur ne peut pas avoir deux créneaux qui se chevauchent.
- En cas d’échec de `updateCourseSlot` : **message utilisateur** (toast) reprenant l’erreur serveur ; **rollback** de la position/durée affichée (pas d’état fantôme incohérent).
- **Mise à jour optimiste** du cache Apollo (ou état local) pour la fluidité ; en cas d’erreur, retour à l’état précédent pour le créneau concerné.

### 6.1 Signal visuel « conflit » (client)

- Après chargement des créneaux visibles, le client peut **calculer** les paires qui se chevauchent pour le **même `coachMemberId`** et appliquer un style **alerte** cohérent avec `design stitch/code.html` (fond `error-container`, accent `error`, icône avertissement) sur les blocs concernés.
- **Conflit de lieu** : **pas** de règle serveur aujourd’hui ; **pas** d’indicateur lieu obligatoire en v1.

---

## 7. Design UI (design stitch)

- Respecter les principes **Athletic Editorial** : hiérarchie des surfaces, **ombre diffusée** sur l’élément en cours de déplacement (token ombre ambiante du design system), **pas** de bordures 1px dures pour structurer la grille (transitions tonales, `outline-variant` faible opacité si nécessaire).
- Cartes créneau : **bordure gauche** colorée (accent), typographie et chips comme la maquette ; avatar / nom coach si données disponibles dans les jointures déjà exposées côté admin (sinon initiales ou libellé minimal — détail au plan si extension de query nécessaire).

---

## 8. Accessibilité

- **Poignées de resize** : zone cliquable d’au moins **24px** de cible.
- **Clavier (v1 minimale)** : focus sur un créneau et **Entrée** pour ouvrir le panneau / formulaire de détail (création/édition existante). **Déplacement au clavier** créneau par créneau (flèches par pas de 15 min) : **hors scope v1** ; peut être planifié en phase 2.

---

## 9. Découpage composants (admin)

| Unité | Rôle |
|--------|------|
| `PlanningPage` | Container : sync URL, toolbar, orchestration des vues |
| `PlanningMonthView` | Mois sans DnD ; sélection jour → URL `view=week` |
| `PlanningTimeGrid` | Grille partagée semaine/jour (`days: Date[]` de longueur 1 ou 7) |
| `CourseSlotBlock` | Rendu d’un créneau + états drag / conflit |
| Hook / utilitaires | Filtrage par plage ; `snapToQuarterHour`, conversions pixel ↔ date |

---

## 10. Tests

- **Unitaires** : fonctions de snap et conversion (cas limites : minuit, changement de jour, durée min 15 min).
- **Intégration** : au moins un scénario « mutation appelée avec bons ISO après drop » (mock Apollo) ou test du hook de filtrage.
- **API** : si validation quart d’heure ajoutée, tests service sur `updateCourseSlot` avec minutes invalides.

---

## 11. Hors périmètre (v1)

- Palette de **modèles** glissés depuis une barre latérale.
- Drag-and-drop sur la **vue mois**.
- Vue **ressource** (colonnes par salle / dojo).
- Verrouillage multi-utilisateur ou résolution de conflit autre que « dernier écrit gagne ».

---

## 12. Critères d’acceptation

- Les trois vues sont accessibles et l’URL reflète `view` et `date`.
- En semaine et jour, un créneau peut être déplacé et redimensionné ; les horaires envoyés respectent le **pas de 15 minutes** ; échec serveur → rollback + message.
- Le mois permet la navigation vers la semaine par clic sur un jour **sans** DnD sur le mois.
- Le formulaire / panneau de détail permet toujours de gérer titre, lieu, prof, groupe.
- L’apparence globale reste alignée sur **design stitch** (y compris état conflit prof côté client lorsque détecté).
