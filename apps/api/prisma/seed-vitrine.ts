/*
 * Seed du site vitrine pour le club démo — contenu verbatim du template SKSR
 * (Shotokan Karaté Sud Réunion, L'Étang-Salé, La Réunion).
 *
 * Crée 10 `VitrinePage` (index, club, cours, dojo, tarifs, equipe, galerie,
 * actualites, competitions, contact) utilisant les blocs `sksr*` fidèles au
 * design d'origine. Tout le contenu reste éditable via le back-office.
 *
 * Usage :
 *   DATABASE_URL=... npx tsx prisma/seed-vitrine.ts [clubSlug]
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

type Section = { id: string; type: string; props: Record<string, unknown> };

function sec(type: string, props: Record<string, unknown>): Section {
  return { id: randomUUID(), type, props };
}

// ---------------------------------------------------------------------------
// INDEX — Accueil
// ---------------------------------------------------------------------------
const INDEX_SECTIONS: Section[] = [
  sec('sksrHero', {
    label: '極真の道 · Depuis 2009',
    titleTop: 'La voie',
    titleG1: 'tracée',
    titleG2: 'la main',
    titleR: "et l'esprit.",
    subtitle:
      "Shotokan Karaté Sud Réunion — l'école de karaté traditionnel de L'Étang-Salé. Enfants, ados, adultes et seniors — dans un cadre convivial et familial.",
    ctaPrimary: { label: 'Découvrir les cours', href: '/cours' },
    ctaSecondary: { label: 'Essai gratuit', href: '/contact' },
    metaItems: [
      { value: 17, label: "Années d'enseignement" },
      { value: 120, label: 'Karatékas actifs' },
      { value: 15, label: 'Ceintures noires' },
    ],
    kanjiBg: '空手',
    logoUrl: '/sksr/logo-sksr.svg',
  }),
  sec('sksrManifesto', {
    kanji: '道',
    kanjiSub: 'Dō · La voie',
    lead:
      "Le karaté n'est pas un sport — c'est une voie. Une voie qui se parcourt à pieds nus, dans le silence du dojo, entre le respect du passé et la précision du geste.",
    sub:
      "Depuis 2009, notre école transmet l'enseignement traditionnel du Shotokan tel qu'il fut fondé par Maître Funakoshi Gichin — sans compromis sur l'exigence, sans rigidité sur l'accueil.",
    signature: '— Sensei Florent Morel, 4ᵉ Dan FFKDA',
  }),
  sec('sksrVoie', {
    label: 'Dōjō-kun · 道場訓',
    title: 'Les cinq préceptes',
    titleEm: 'du dojo.',
    intro:
      'Récités à la fin de chaque cours, les cinq préceptes rédigés par Maître Funakoshi guident la pratique et la vie du karatéka.',
    items: [
      {
        num: '01',
        kanji: '人格',
        name: 'Chercher la perfection du caractère',
        nameJp: 'Jinkaku kansei ni tsutomuru koto',
        desc:
          "Le karaté commence et finit par la rigueur morale. L'art martial forge l'homme avant le combattant.",
      },
      {
        num: '02',
        kanji: '誠',
        name: 'Soyez fidèles',
        nameJp: 'Makoto no michi wo mamoru koto',
        desc:
          'La sincérité dans le geste et dans la parole. Un coup juste est un coup vrai — sans ornement ni tricherie.',
      },
      {
        num: '03',
        kanji: '努力',
        name: "Soyez constants dans l'effort",
        nameJp: 'Doryōku no seishin wo yashinau koto',
        desc:
          'Le talent ne suffit pas. Seul le travail quotidien, silencieux, patient, forge le karatéka.',
      },
      {
        num: '04',
        kanji: '礼儀',
        name: 'Respecter les autres',
        nameJp: 'Reigi wo omonzuru koto',
        desc:
          'Le salut ouvre et ferme chaque cours. Le respect envers le maître, les partenaires, le dojo — et soi-même.',
      },
      {
        num: '05',
        kanji: '血気',
        name: 'Retenez toute conduite violente',
        nameJp: 'Kekki no yū wo imashimuru koto',
        desc:
          "La maîtrise de soi. Un karatéka qui perd son sang-froid perd son art. Le courage n'est pas l'emportement.",
      },
    ],
  }),
  sec('sksrCoursPreview', {
    label: 'Keiko · 稽古',
    title: 'Quatre groupes.',
    titleEm: 'Une même exigence.',
    kanjiBg: '稽',
    cards: [
      {
        age: '4',
        ageRange: '−5',
        ageUnit: 'ans · Baby Karaté',
        name: 'Éveil',
        desc:
          'Découverte ludique, motricité, premiers saluts. Séances courtes axées sur la coordination et le respect.',
      },
      {
        age: '6',
        ageRange: '−12',
        ageUnit: 'ans · Enfants',
        name: 'Formation complète',
        desc:
          'Débutants, intermédiaires, avancés (Vert et +). Apprentissage des katas fondamentaux (Heian) et kihon structuré.',
      },
      {
        age: '13',
        ageRange: '−17',
        ageUnit: 'ans · Adolescents',
        name: 'Tous niveaux',
        desc:
          'Technique avancée, kumite contrôlé, préparation aux compétitions régionales du Sud de La Réunion.',
      },
      {
        age: '18',
        ageRange: '+',
        ageUnit: 'ans · Adultes & Cross Training',
        name: 'Traditionnel & moderne',
        desc:
          'Karaté traditionnel et moderne (tous niveaux / avancés) et Cross Training — entraînement fonctionnel tous les jours.',
      },
    ],
  }),
  sec('sksrDojoSplit', {
    imageUrl: null,
    stamp: '道場',
    label: 'Le Dojo',
    title: 'Un lieu.',
    titleEm: 'Une atmosphère.',
    lead:
      "L'Étang-Salé — un dojo privé et traditionnel. Un lieu convivial pensé pour la pratique sérieuse du karaté Shotokan, enfants comme adultes.",
    items: [
      { key: 'Type', val: 'Dojo privé' },
      { key: 'Tatamis', val: 'Homologués FFKDA' },
      { key: 'Équipement', val: 'Cross Training inclus' },
      { key: 'Accès', val: "Rue du stade · L'Étang-Salé" },
      { key: 'Ouverture', val: 'Lun – Sam · Dim fermé' },
    ],
    ctaLabel: 'Visiter le dojo',
    ctaHref: '/dojo',
  }),
  sec('sksrActuPreview', {
    label: 'Journal · 記録',
    title: 'Dernières',
    titleEm: 'nouvelles.',
    seeAllLabel: 'Toutes les actualités',
    seeAllHref: '/actualites',
    articles: [
      {
        slug: 'championnat-regional-titres',
        title:
          'Championnat régional : trois titres pour le club et six médailles au total',
        date: '15 · 03 · 2026',
        tag: 'Compétition',
        kanji: '競',
        featured: true,
      },
      {
        slug: 'stage-printemps',
        title: "Stage de printemps — exemple d'actualité",
        date: '02 · 03 · 2026',
        tag: 'Stage',
        kanji: '稽',
      },
      {
        slug: 'nouvelles-ceintures-noires',
        title: 'Douze nouvelles ceintures noires — exemple',
        date: '28 · 02 · 2026',
        tag: 'Passage',
        kanji: '段',
      },
    ],
  }),
  sec('sksrCtaBand', {
    kanjiBg: '礼',
    label: '礼に始まり · 礼に終わる',
    titleLineA: 'Commencer par le',
    titleLineAEm: 'salut.',
    titleLineB: 'Finir par le',
    titleLineBEm: 'salut.',
    sub: "Première séance d'essai offerte — tous âges, tous niveaux.",
    primary: { label: 'Réserver ma séance', href: '/contact' },
    secondary: { label: 'Voir les tarifs', href: '/tarifs' },
  }),
];

// ---------------------------------------------------------------------------
// CLUB
// ---------------------------------------------------------------------------
const CLUB_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '流',
    label: "Ryū · 流 · L'école",
    title: 'Le',
    titleEm: 'Club.',
    subtitle:
      "Depuis 2009, le Shotokan Karaté Sud Réunion accueille enfants, ados, adultes et seniors dans un cadre convivial et familial à L'Étang-Salé.",
  }),
  sec('sksrTimeline', {
    label: 'Histoire · 歴史',
    title: 'Une lignée',
    titleEm: 'ininterrompue.',
    items: [
      {
        year: '09',
        title: 'Fondation',
        desc:
          "Création du club à L'Étang-Salé pour apporter le karaté Shotokan traditionnel dans le Sud de La Réunion.",
      },
      {
        year: '12',
        title: 'Sections jeunes',
        desc:
          'Développement des cours enfants et Baby Karaté pour accueillir les plus jeunes dès 4 ans.',
      },
      {
        year: '16',
        title: 'Section compétition',
        desc:
          'Ouverture des créneaux dédiés Kata et Combat, premiers podiums régionaux.',
      },
      {
        year: '20',
        title: 'Cross Training',
        desc:
          'Introduction du Cross Training — entraînement fonctionnel complémentaire au karaté.',
      },
      {
        year: '23',
        title: 'Reconnaissance',
        desc:
          'Club reconnu localement, Sensei principal rejoint le comité directeur de la Ligue de Karaté de La Réunion.',
      },
      {
        year: '26',
        title: "Aujourd'hui",
        desc:
          '29 créneaux hebdomadaires, du Baby Karaté aux adultes, compétition et Cross Training — toutes générations réunies.',
      },
    ],
  }),
  sec('sksrTwoCol', {
    label: 'Notre école',
    title: 'Une voie exigeante',
    titleEm1: 'ouvert.',
    paragraphs: [
      "Le Shotokan-ryū, né au début du XXᵉ siècle sous l'impulsion de Maître Gichin Funakoshi, est l'un des grands styles traditionnels du karaté-dō japonais. Il se distingue par ses positions basses, ses techniques franches et son cadre moral rigoureux.",
      "Notre club perpétue cet enseignement sans compromis, tout en ouvrant ses portes à tous les profils — du tout-petit curieux au pratiquant chevronné, du compétiteur au simple chercheur d'équilibre.",
    ],
    quote:
      "Ne pas perdre de vue qu'on n'a rien compris tant qu'on croit avoir tout compris.",
    quoteAuthor: 'Gichin Funakoshi',
    imageUrl: null,
    stamp: '伝統',
  }),
  sec('sksrStatsBand', {
    items: [
      { value: 17, label: "Années d'enseignement" },
      { value: 29, label: 'Créneaux / semaine' },
      { value: 3, label: 'Senseis diplômés' },
      { value: 12, label: 'Titres régionaux' },
    ],
  }),
  sec('sksrValues', {
    label: 'Valeurs · 価値観',
    title: 'Ce qui nous tient',
    titleEm: 'debout.',
    items: [
      {
        kanji: '礼',
        name: 'Respect',
        desc:
          "Envers le maître, les partenaires, le dojo, et soi-même. Le salut n'est pas un geste — c'est une attitude permanente.",
      },
      {
        kanji: '忍',
        name: 'Persévérance',
        desc:
          'Mille jours de pratique pour forger la technique, dix mille pour la polir. Le karatéka ne se mesure pas à ses victoires mais à son assiduité.',
      },
      {
        kanji: '和',
        name: 'Harmonie',
        desc:
          "Le dojo est une communauté. On y progresse ensemble, on s'y soutient, on y transmet. L'individu sert le groupe autant que l'inverse.",
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// COURS
// ---------------------------------------------------------------------------
const COURS_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '稽',
    label: 'Keiko · 稽古 · La pratique',
    title: 'Les',
    titleEm: 'cours.',
    subtitle:
      '29 créneaux hebdomadaires sur six jours — Baby Karaté, Enfants, Ados, Adultes, Cross Training et sections compétition.',
  }),
  sec('sksrPlanning', {
    label: 'Planning · 時間割',
    title: 'Horaires de la',
    titleEm: 'saison 2025–26.',
    slots: [
      { day: 0, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
      { day: 1, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
      { day: 2, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
      { day: 3, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
      { day: 4, hourIdx: 0, span: 3, type: 'cross', name: 'Cross Training', meta: '8h15 – 9h' },
      { day: 5, hourIdx: 0, span: 5, type: 'athle', name: 'Athlétisme', meta: '8h15 – 9h30' },
      { day: 2, hourIdx: 7, span: 8, type: 'comp', name: 'Compétition Kata', meta: '14h – 16h' },
      { day: 5, hourIdx: 7, span: 8, type: 'comp', name: 'Compétition Kata', meta: '14h – 16h' },
      { day: 2, hourIdx: 15, span: 4, type: 'junior', name: 'Enfants interm.', meta: '16h – 17h' },
      { day: 3, hourIdx: 16, span: 3, type: 'mini', name: 'Baby Karaté', meta: '16h15 – 17h · 4–5 ans' },
      { day: 0, hourIdx: 17, span: 4, type: 'junior', name: 'Enfants 6–8 ans', meta: '16h30 – 17h30' },
      { day: 4, hourIdx: 17, span: 4, type: 'junior', name: 'Enfants 6–8 ans', meta: '16h30 – 17h30' },
      { day: 1, hourIdx: 19, span: 4, type: 'teens', name: 'Ados 13–17', meta: '17h – 18h' },
      { day: 3, hourIdx: 19, span: 4, type: 'teens', name: 'Ados 13–17', meta: '17h – 18h' },
      { day: 2, hourIdx: 19, span: 6, type: 'junior', name: 'Enfants avancés', meta: '17h – 18h30 · Vert+' },
      { day: 0, hourIdx: 21, span: 4, type: 'junior', name: 'Enfants interm.', meta: '17h30 – 18h30' },
      { day: 4, hourIdx: 21, span: 4, type: 'junior', name: 'Enfants avancés', meta: '17h30 – 18h30 · Vert+' },
      { day: 0, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
      { day: 2, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
      { day: 4, hourIdx: 21, span: 3, type: 'cross', name: 'Cross Training', meta: '17h30 – 18h15' },
      { day: 1, hourIdx: 23, span: 4, type: 'comp', name: 'Cours Combat', meta: '18h – 19h' },
      { day: 1, hourIdx: 25, span: 1, type: 'cross', name: 'Cross Training', meta: '18h30 – 18h45' },
      { day: 0, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
      { day: 2, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
      { day: 4, hourIdx: 25, span: 4, type: 'adults', name: 'Adultes', meta: '18h30 – 19h30' },
      { day: 0, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
      { day: 2, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
      { day: 4, hourIdx: 29, span: 4, type: 'masters', name: 'Adultes avancés', meta: '19h30 – 20h30' },
    ],
  }),
  sec('sksrDisciplines', {
    label: 'Disciplines · 種目',
    title: 'Les quatre piliers',
    titleEm: 'du Shotokan.',
    items: [
      {
        kanji: '基本',
        name: 'Kihon',
        nameSub: 'Les fondamentaux',
        desc:
          "Le socle du karaté. Positions, déplacements, blocages, attaques — répétés jusqu'à ce que le geste devienne second. Sans kihon, pas de technique.",
        level: 'Tous niveaux',
      },
      {
        kanji: '型',
        name: 'Kata',
        nameSub: 'Les formes codifiées',
        desc:
          "Combats imaginaires fixés par la tradition. Vingt-six katas au programme Shotokan — des cinq Heian jusqu'au Kanku-dai et au redoutable Unsu. Chaque kata est une bibliothèque.",
        level: 'Ceinture blanche → 5ᵉ dan',
      },
      {
        kanji: '組手',
        name: 'Kumite',
        nameSub: 'Le combat conventionnel',
        desc:
          "Du gohon-kumite à cinq pas au jiyū-kumite libre. Contrôle, distance, timing — le kumite met à l'épreuve ce que le kata a construit.",
        level: 'Orange et supérieurs',
      },
      {
        kanji: '分解',
        name: 'Bunkai',
        nameSub: "L'analyse des katas",
        desc:
          "Décomposition et application réelle des mouvements du kata. Comprendre pourquoi derrière chaque geste — là où le karaté cesse d'être une chorégraphie.",
        level: 'Marron et dan',
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// DOJO
// ---------------------------------------------------------------------------
const DOJO_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '道場',
    label: 'Dōjō · 道場 · Le lieu de la voie',
    title: 'Le',
    titleEm: 'dojo.',
    subtitle:
      'Un lieu silencieux, sobre, dédié à la pratique. Notre dojo à L\'Étang-Salé où se joue, chaque soir, le quotidien patient du karatéka.',
  }),
  sec('sksrDojoIntro', {
    imageUrl: null,
    stamp: '礼',
    label: "L'espace",
    title: 'Un lieu conçu pour',
    titleEm: 'la pratique sérieuse.',
    paragraphs: [
      "Dans la tradition japonaise, le dojo n'est pas une salle de sport. C'est un lieu sacré — dō-jō, littéralement « le lieu de la voie ». On y laisse ses chaussures à l'entrée, son bruit, ses soucis extérieurs.",
      'Notre dojo a été conçu dans cet esprit. Parquet sous tatamis traditionnels, mur de miroirs sur toute la longueur, estrade du sensei surélevée, niche shomen ornée de la calligraphie 空手道, sacs de frappe et makiwaras en bois du Japon.',
      "Tout y est sobre. Rien n'y est superflu.",
    ],
  }),
  sec('sksrSpec', {
    label: 'Fiche technique · 仕様',
    title: 'Les chiffres',
    titleEm: 'du dojo.',
    cards: [
      {
        icon: '畳',
        value: 'Tatamis',
        valueUnit: 'homologués',
        label: 'FFKDA',
        desc:
          "Un dojo privé à L'Étang-Salé, équipé pour la pratique traditionnelle.",
      },
      {
        icon: '人',
        value: 'Du lundi',
        valueUnit: 'au samedi',
        label: '6 jours',
        desc:
          'Dimanche fermé. Planning modulable du matin au soir selon les sections.',
      },
      {
        icon: '時',
        value: 'Créneaux',
        valueUnit: 'hebdo',
        label: '29 / sem.',
        desc:
          'Baby Karaté, Enfants, Ados, Adultes, Cross Training et sections compétition.',
      },
      {
        icon: '具',
        value: 'Équipements',
        valueUnit: 'complet',
        label: 'Complet',
        desc:
          'Sacs de frappe, pao, makiwaras, miroirs et matériel de préparation physique.',
      },
    ],
  }),
  sec('sksrEquipment', {
    label: 'Équipements · 道具',
    title: 'Les outils',
    titleEm: 'de la voie.',
    items: [
      {
        kanjiBg: '巻藁',
        tag: 'Makiwara',
        name: "Poteaux d'entraînement",
        desc:
          "Makiwaras en bois pour travailler la précision du poing et l'endurcissement des surfaces de frappe.",
      },
      {
        kanjiBg: '鏡',
        tag: 'Kagami',
        name: 'Mur de miroirs',
        desc:
          'Miroirs pour le travail individuel du kata et la correction des postures.',
      },
      {
        kanjiBg: '瞑想',
        tag: 'Meisō',
        name: 'Espace de concentration',
        desc:
          'Un coin calme pour la préparation avant les passages de grade et les stages.',
      },
    ],
  }),
  sec('sksrEtiquette', {
    label: 'Étiquette · 礼儀作法',
    title: 'Les règles',
    titleEm: 'du dojo.',
    rules: [
      {
        num: '01',
        text:
          "On salue en entrant et en sortant du dojo. Le salut n'est pas une formalité — c'est la reconnaissance du lieu.",
      },
      {
        num: '02',
        text:
          'Le karatégi est propre et repassé. Ceinture nouée correctement. Ongles coupés. Aucun bijou.',
      },
      {
        num: '03',
        text:
          "On arrive à l'heure. En cas de retard, on attend le signe du sensei avant de s'échauffer en silence sur le côté.",
      },
      {
        num: '04',
        text:
          'Pendant le cours, on ne parle pas. On écoute, on observe, on pratique. Les questions viennent après.',
      },
      {
        num: '05',
        text:
          "Aucune chaussure sur les tatamis. Les pieds sont propres. Les zoris s'alignent à l'entrée, parallèles au tatami.",
      },
      {
        num: '06',
        text:
          'On salue son partenaire avant et après chaque exercice. Les blessures se respectent — on ajuste son intensité.',
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// TARIFS
// ---------------------------------------------------------------------------
const TARIFS_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '会費',
    label: 'Kaihi · 会費 · Cotisation',
    title: 'Tarifs &',
    titleEm: 'inscription.',
    subtitle:
      'Tarifs mensuels accessibles, remise famille −10 %, paiement en 4× sans frais. Adhésion sécurisée via HelloAsso.',
  }),
  sec('sksrTarifs', {
    label: 'Cotisations · Saison 2025–26',
    title: 'Des tarifs clairs.',
    titleEm: 'Pour toutes les envies.',
    cards: [
      {
        kanji: '幼',
        age: '4–5 ans',
        name: 'Baby Karaté',
        priceMonthly: 25,
        priceAnnual: 300,
        features: [
          'Créneau Baby Karaté (Éveil)',
          '+ 60 € licence & inscription / an',
          'Approche ludique et psychomotrice',
          'Remise famille −10 %',
        ],
        ctaLabel: 'Adhérer (HelloAsso)',
        ctaHref: '/contact',
      },
      {
        kanji: '少',
        age: '6–17 ans',
        name: 'Enfants & Ados',
        priceMonthly: 30,
        priceAnnual: 360,
        features: [
          'Accès aux cours enfants / ados',
          '+ 60 € licence & inscription / an',
          'Débutants, intermédiaires, avancés (Vert +)',
          'Passages de grade & compétitions',
          'Remise famille −10 %',
        ],
        ctaLabel: 'Adhérer (HelloAsso)',
        ctaHref: '/contact',
        featured: true,
      },
      {
        kanji: '大',
        age: '18 ans +',
        name: 'Adultes',
        priceMonthly: 35,
        priceAnnual: 420,
        features: [
          'Cours adultes tous niveaux',
          'Cours avancés inclus',
          '+ 60 € licence & inscription / an',
          'Karaté traditionnel et moderne',
          'Remise famille −10 %',
        ],
        ctaLabel: 'Adhérer (HelloAsso)',
        ctaHref: '/contact',
      },
      {
        kanji: '鍛',
        age: 'Combo / Seul',
        name: 'Cross Training',
        priceMonthly: 49,
        priceAnnual: 588,
        features: [
          'Combo Cross + Karaté : 49 €/mois',
          'Cross Training seul : 69 €/mois',
          'Entraînement fonctionnel quotidien 8h15',
          '+ 60 € licence & inscription / an',
        ],
        ctaLabel: 'Adhérer (HelloAsso)',
        ctaHref: '/contact',
      },
    ],
  }),
  sec('sksrInfoBand', {
    items: [
      {
        title: 'Remise famille',
        text:
          "−10 % dès le deuxième membre d'une même famille inscrit au club. Parent et enfant, frères et sœurs, conjoints — tous bénéficient de la remise.",
      },
      {
        title: 'Paiement en 4× sans frais',
        text:
          'Règlement possible en 4 fois sans frais via HelloAsso. Adhésion 100 % en ligne, sécurisée, pour la saison 2025–2026.',
      },
      {
        title: "Séance d'essai gratuite",
        text:
          "Une séance d'essai offerte avant tout engagement. Apportez une tenue de sport souple — le kimono n'est exigé qu'à partir de l'inscription.",
      },
    ],
  }),
  sec('sksrInscription', {
    label: 'Inscription · 入門',
    title: 'Entrer au',
    titleEm: 'dojo.',
    steps: [
      {
        num: '01',
        title: "Séance d'essai",
        desc:
          "Réservez une séance gratuite dans le groupe d'âge correspondant. Aucun prérequis.",
      },
      {
        num: '02',
        title: 'Dossier',
        desc:
          "Remplissez le formulaire d'inscription + certificat médical de non contre-indication à la pratique du karaté.",
      },
      {
        num: '03',
        title: 'Cotisation',
        desc:
          'Règlement annuel, en 3 fois, ou mensuel. La licence fédérale est incluse.',
      },
      {
        num: '04',
        title: 'Premier salut',
        desc:
          "Bienvenue dans le dojo. L'aventure commence par le salut : onegaishimasu.",
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// EQUIPE
// ---------------------------------------------------------------------------
const EQUIPE_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '師',
    label: 'Shihan · 師範 · Les maîtres',
    title: "L'",
    titleEm: 'équipe.',
    subtitle:
      'Trois senseis diplômés FFKDA et un bureau engagé au service des karatékas du club.',
  }),
  sec('sksrSensei', {
    imageUrl: null,
    stamp: '師',
    rank: '4ᵉ Dan FFKDA · Yondan · 四段',
    nameFirst: 'Florent',
    nameLast: 'Morel',
    title: 'Sensei Principal',
    bioParagraphs: [
      "Sensei principal du club, Florent Morel enseigne le karaté Shotokan traditionnel et moderne à L'Étang-Salé. Titulaire du DIF (Diplôme d'Instructeur Fédéral) et du CQP (Certificat de Qualification Professionnelle), il encadre l'ensemble des niveaux, du Baby Karaté aux adultes avancés.",
      'Membre du comité directeur de la Ligue de Karaté de La Réunion, également thérapeute et coach, il allie la rigueur du karaté traditionnel à une pédagogie bienveillante et accessible.',
    ],
    meta: [
      { val: '4', lbl: 'Dan FFKDA' },
      { val: 'DIF', lbl: 'Diplôme Fédéral' },
      { val: 'CQP', lbl: 'Qualif. Pro' },
    ],
  }),
  sec('sksrTeachers', {
    groupLabel: 'Assistants · 助手',
    groupTitle: 'Les senseis',
    groupTitleEm: 'assistants.',
    groupLead:
      'Deux enseignants diplômés FFKDA qui accompagnent Sensei Florent sur les différents créneaux du club.',
    teachers: [
      {
        rankLabel: '2ᵉ Dan FFKDA',
        kanjiBg: '弐',
        name: 'Sensei Damien Barège',
        role: 'Compétiteur multi-médaillé',
        bio:
          '2ᵉ Dan FFKDA, titulaire du DIF. Compétiteur reconnu au niveau régional et national, il intervient sur les cours généraux et encadre la section compétition aux côtés de Sensei Florent.',
      },
      {
        rankLabel: '1ᵉʳ Dan FFKDA',
        kanjiBg: '壱',
        name: 'Sensei Jean-Marie Ethève',
        role: 'Enseignement général',
        bio:
          '1ᵉʳ Dan FFKDA, titulaire du DIF. Agriculteur et pratiquant engagé, il partage son expérience et sa persévérance à travers les cours enfants et adultes du club.',
      },
    ],
  }),
  sec('sksrTeachers', {
    groupLabel: 'Bureau · 事務局',
    groupTitle: "L'équipe",
    groupTitleEm: 'administrative.',
    groupLead:
      "Bénévoles engagés qui assurent la vie administrative de l'association au service des adhérents.",
    teachers: [
      {
        rankLabel: 'Présidente',
        kanjiBg: '会長',
        name: 'Nelly Morel',
        role: 'Présidente',
        bio:
          "Présidente de l'association SKSR, engagée aux côtés de Sensei Florent depuis les débuts du club.",
      },
      {
        rankLabel: 'Vice-présidente',
        kanjiBg: '副',
        name: 'Nathalie Trebel',
        role: 'Vice-présidente',
        bio:
          "Membre active du bureau, elle seconde la présidence dans la gestion et l'animation de l'association.",
      },
      {
        rankLabel: 'Vice-trésorière',
        kanjiBg: '会計',
        name: 'Marie-Annick Barège',
        role: 'Vice-trésorière',
        bio:
          "Assure le suivi comptable et financier de l'association aux côtés du bureau.",
      },
      {
        rankLabel: 'Secrétaire',
        kanjiBg: '書記',
        name: 'Althérésa Icoute Révolte',
        role: 'Secrétaire',
        bio:
          "Assure la coordination administrative de l'association — inscriptions, communication, dossiers fédéraux.",
      },
    ],
  }),
  sec('sksrLineage', {
    label: 'Lignée · 系譜',
    title: 'Notre',
    titleEm: 'filiation.',
    lead:
      'Une école rattachée au courant Shotokan historique, dans la lignée de Funakoshi et Kase, via la FFKDA.',
    nodes: [
      { name: 'Gichin Funakoshi', dates: '1868–1957', rank: '開祖 Fondateur' },
      { name: 'Taiji Kase', dates: '1929–2004', rank: '9ᵉ Dan' },
      { name: 'FFKDA', dates: '1975–', rank: 'Fédération' },
      { name: 'SKSR', dates: '2009–', rank: "L'Étang-Salé · 道場" },
    ],
  }),
];

// ---------------------------------------------------------------------------
// GALERIE
// ---------------------------------------------------------------------------
function svgPlaceholder(kanji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a1410"/><stop offset="50%" stop-color="#2a1f18"/><stop offset="100%" stop-color="#1a1410"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g stroke="#c9a96a" stroke-opacity="0.08" stroke-width="1" fill="none"><line x1="0" y1="200" x2="800" y2="200"/><line x1="0" y1="400" x2="800" y2="400"/><line x1="266" y1="0" x2="266" y2="600"/><line x1="533" y1="0" x2="533" y2="600"/></g><text x="400" y="390" text-anchor="middle" font-family="serif" font-size="280" fill="#c9a96a" fill-opacity="0.5">${kanji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const GALERIE_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '写真',
    label: 'Shashin · 写真 · Images',
    title: '',
    titleEm: 'Galerie.',
    subtitle:
      'Instants saisis au dojo, en stage, en compétition. La pratique du SKSR, en images.',
  }),
  sec('sksrGallery', {
    label: 'Archives · 記録',
    title: 'Mémoire',
    titleEm: 'du dojo.',
    filters: [
      { id: 'all', label: 'Tout' },
      { id: 'dojo', label: 'Dojo' },
      { id: 'kata', label: 'Kata' },
      { id: 'kumite', label: 'Kumite' },
      { id: 'compet', label: 'Compétition' },
      { id: 'stage', label: 'Stages' },
    ],
    photos: [
      { url: svgPlaceholder('型'), size: 2, tag: 'kata', title: 'Kata Heian Shodan', label: 'École junior' },
      { url: svgPlaceholder('組'), size: 1, tag: 'compet', title: 'Finale kumite', label: 'Championnat régional' },
      { url: svgPlaceholder('礼'), size: 3, tag: 'dojo', title: "Salut d'ouverture", label: 'Cours adultes' },
      { url: svgPlaceholder('稽'), size: 4, tag: 'stage', title: 'Stage technique', label: 'Section avancée' },
      { url: svgPlaceholder('師'), size: 5, tag: 'dojo', title: 'Sensei Florent Morel', label: 'Cours adultes avancés' },
      { url: svgPlaceholder('拳'), size: 1, tag: 'kumite', title: 'Jiyū-kumite', label: 'Section ados' },
      { url: svgPlaceholder('道'), size: 4, tag: 'kata', title: 'Bassaï-daï', label: 'Démonstration' },
      { url: svgPlaceholder('金'), size: 1, tag: 'compet', title: 'Podium kata équipes', label: 'Coupe de La Réunion' },
      { url: svgPlaceholder('山'), size: 3, tag: 'stage', title: "Stage d'été", label: 'Section compétition' },
      { url: svgPlaceholder('段'), size: 1, tag: 'dojo', title: 'Passage de grade', label: 'Ceinture marron' },
      { url: svgPlaceholder('空'), size: 6, tag: 'kata', title: 'Baby Karaté', label: 'Premier kata · 4–5 ans' },
      { url: svgPlaceholder('基'), size: 1, tag: 'kumite', title: 'Kihon-kumite', label: 'Enfants débutants' },
    ],
  }),
];

// ---------------------------------------------------------------------------
// ACTUALITES
// ---------------------------------------------------------------------------
const ACTUALITES_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '記録',
    label: 'Kiroku · 記録 · Le journal',
    title: '',
    titleEm: 'Actualités',
    subtitle:
      'Les nouvelles du dojo : compétitions, stages, passages de grade, événements. Pour le détail et les photos, rendez-vous sur notre page Facebook.',
  }),
  sec('sksrNews', {
    featured: {
      date: 'Exemple · Article type',
      title: 'Résultats de compétition à la Ligue de Karaté de La Réunion',
      excerpt:
        'Les compétiteurs du SKSR défendent régulièrement les couleurs du club lors des championnats régionaux et coupes organisés par la Ligue. Retrouvez les photos, classements et compte-rendus de chaque événement sur notre page Facebook officielle.',
      tag: 'À la une',
      kanjiBg: '競',
      href: 'https://www.facebook.com/sksr974',
    },
    cards: [
      {
        date: 'Actualité type',
        tag: 'Stage',
        title: 'Stages techniques au dojo',
        excerpt:
          'Des stages ponctuels sont organisés tout au long de la saison, ouverts selon les niveaux.',
        kanjiBg: '稽',
        href: 'https://www.facebook.com/sksr974',
      },
      {
        date: 'Actualité type',
        tag: 'Passage',
        title: 'Passages de grade kyū et dan',
        excerpt:
          'Les passages de grades sont organisés en lien avec la Ligue de Karaté de La Réunion.',
        kanjiBg: '段',
        href: 'https://www.facebook.com/sksr974',
      },
      {
        date: 'Actualité type',
        tag: 'Dojo',
        title: 'Actualités du dojo',
        excerpt:
          'Informations pratiques : créneaux, adhésions, rentrées. Voir Facebook pour les dernières annonces.',
        kanjiBg: '道',
        href: 'https://www.facebook.com/sksr974',
      },
      {
        date: 'Actualité type',
        tag: 'Compétition',
        title: 'Résultats en compétition',
        excerpt:
          'Les sections Kata et Combat participent régulièrement aux événements régionaux.',
        kanjiBg: '試',
        href: 'https://www.facebook.com/sksr974',
      },
      {
        date: 'Actualité type',
        tag: 'Club',
        title: 'Vie du club',
        excerpt:
          'Événements internes, démonstrations, soutiens de la Ligue et de la FFKDA.',
        kanjiBg: '会',
        href: 'https://www.facebook.com/sksr974',
      },
      {
        date: 'Actualité type',
        tag: 'Jeunes',
        title: 'Section Baby Karaté & Enfants',
        excerpt:
          'Inscriptions ouvertes toute l\'année pour les 4–5 ans (Baby) et 6–12 ans (Enfants).',
        kanjiBg: '幼',
        href: 'https://www.facebook.com/sksr974',
      },
    ],
  }),
  sec('sksrCalendar', {
    label: 'Agenda · 予定',
    title: 'À venir',
    titleEm: 'au dojo.',
    events: [
      {
        day: 'Print.',
        month: '2026',
        title: 'Championnats régionaux',
        meta: 'Ligue de Karaté de La Réunion',
        desc:
          'Sections Kata et Combat du SKSR sur les tatamis de la Ligue.',
        tag: 'Compétition',
      },
      {
        day: 'Print.',
        month: '2026',
        title: 'Passages de grade kyū & dan',
        meta: 'Dojo SKSR',
        desc:
          'Passages organisés en lien avec la FFKDA et la Ligue régionale.',
        tag: 'Passage',
      },
      {
        day: 'Fin',
        month: 'saison',
        title: "Démonstration de fin d'année",
        meta: "L'Étang-Salé",
        desc:
          'Démonstration publique : kata, kumite, Baby Karaté. Ouverte aux familles.',
        tag: 'Événement',
      },
      {
        day: 'Été',
        month: '2026',
        title: "Stage d'été",
        meta: 'Planning à confirmer',
        desc: 'Stage intensif ouvert sur inscription.',
        tag: 'Stage',
      },
    ],
  }),
];

// ---------------------------------------------------------------------------
// COMPETITIONS
// ---------------------------------------------------------------------------
const COMPETITIONS_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '試合',
    label: 'Shiai · 試合 · La compétition',
    title: '',
    titleEm: 'Compétitions.',
    subtitle:
      'Sections Compétition Kata et Combat encadrées au dojo. Parce que le karaté se forge aussi dans l\'épreuve du combat.',
  }),
  sec('sksrPalmares', {
    label: 'Palmarès · 戦績',
    title: 'Médailles toutes saisons',
    titleEm: 'confondues.',
    gold: { kanji: '金', count: 38, label: 'Titres · Or' },
    silver: { kanji: '銀', count: 52, label: 'Médailles · Argent' },
    bronze: { kanji: '銅', count: 84, label: 'Médailles · Bronze' },
  }),
  sec('sksrResults', {
    label: 'Derniers résultats · exemples',
    title: 'Saison',
    titleEm: '2025–26.',
    note:
      'Résultats donnés à titre d\'exemple — mis à jour au fil des compétitions.',
    rows: [
      { year: '2026', name: 'Maëlys Técher', event: 'Championnat régional · Kata junior', cat: '-14 ans', place: '1ᵉʳ', placeClass: 'gold' },
      { year: '2026', name: 'Lucas Boyer', event: 'Championnat régional · Kumite', cat: '-60 kg', place: '1ᵉʳ', placeClass: 'gold' },
      { year: '2026', name: 'Équipe SKSR', event: 'Championnat régional · Kumite équipes', cat: 'Senior', place: '1ᵉʳ', placeClass: 'gold' },
      { year: '2026', name: 'Noa Lebon', event: 'Coupe de La Réunion · Kata', cat: 'Cadet', place: '2ᵉ', placeClass: 'silver' },
      { year: '2026', name: 'Inès Hoarau', event: 'Championnat régional · Kumite', cat: '-55 kg féminin', place: '2ᵉ', placeClass: 'silver' },
      { year: '2026', name: 'Mathéo Grondin', event: 'Coupe de La Réunion · Kata', cat: 'Minime', place: '3ᵉ', placeClass: 'bronze' },
      { year: '2025', name: 'Équipe SKSR', event: 'Championnat régional · Kata équipes', cat: 'Junior', place: '1ᵉʳ', placeClass: 'gold' },
      { year: '2025', name: 'Jérémy Técher', event: 'Championnat de France · Kumite', cat: 'Junior -70 kg', place: '3ᵉ', placeClass: 'bronze' },
    ],
  }),
  sec('sksrChampsBand', {
    label: 'Section compétition',
    titleLines: [
      'La compétition comme épreuve,',
      'jamais comme fin.',
    ],
    paragraphs: [
      "La compétition reste, dans l'esprit traditionnel, un outil de progression — une façon de se mesurer à soi-même à travers l'autre. Le SKSR entraîne ses compétiteurs dans cet esprit : l'important n'est pas le podium, mais l'honneur de la préparation et la dignité du combat.",
      'Section Compétition Kata le mercredi et samedi après-midi (14h–16h). Section Compétition Combat le mardi et jeudi soir (18h30–20h). Ouvert sur sélection, à partir de la ceinture orange.',
    ],
  }),
];

// ---------------------------------------------------------------------------
// CONTACT
// ---------------------------------------------------------------------------
const CONTACT_SECTIONS: Section[] = [
  sec('pageHero', {
    kanji: '連絡',
    label: 'Renraku · 連絡 · Nous joindre',
    title: '',
    titleEm: 'Contact.',
    subtitle:
      'Une question, une inscription, une séance d\'essai — nous vous répondons sous 24 heures.',
  }),
  sec('sksrContact', {
    label: 'Coordonnées',
    title: 'Venez pousser la',
    titleEm: 'porte du dojo.',
    lead:
      "Le dojo est ouvert du lundi au samedi. L'accueil se fait sur rendez-vous pour une visite, ou directement lors d'un cours d'essai.",
    items: [
      {
        key: '住所 · Adresse',
        value: '13 bis rue du stade',
        sub: "97427 L'Étang-Salé · La Réunion · Océan Indien",
      },
      {
        key: '電話 · Téléphone',
        value: '0692 93 42 46',
        sub: 'Du lundi au samedi selon planning',
        href: 'tel:+262692934246',
      },
      {
        key: '連絡 · Email',
        value: 'sksr.club@yahoo.fr',
        sub: 'Réponse sous 24h ouvrées',
        href: 'mailto:sksr.club@yahoo.fr',
      },
      {
        key: '時間 · Horaires',
        value: 'Du lundi au samedi selon planning',
        sub: 'Dimanche : fermé · Planning détaillé sur la page Cours',
      },
      {
        key: 'ソーシャル · Réseaux',
        value: 'Facebook · Instagram',
        sub: 'sksr974 · sksr.974',
        href: 'https://www.facebook.com/sksr974',
      },
    ],
    formTitle: 'Nous écrire',
    formSub:
      'Remplissez le formulaire — un instructeur vous contactera rapidement.',
  }),
  sec('sksrMap', {
    mapEmbedUrl:
      'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d7129.0!2d55.2850!3d-21.2690!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sfr!2sfr!4v1711111111111',
    addr: "13 bis rue du stade · 97427 L'Étang-Salé · La Réunion",
    stamp: '地図',
    links: [
      { label: 'Itinéraire Google Maps', href: 'https://maps.google.com/?q=L%27%C3%89tang-Sal%C3%A9+13+bis+rue+du+stade' },
      { label: 'Adhérer via HelloAsso', href: 'https://www.helloasso.com/' },
    ],
  }),
];

// ---------------------------------------------------------------------------
const PAGES: Array<{
  slug: string;
  seoTitle: string;
  seoDescription: string;
  sections: Section[];
}> = [
  {
    slug: 'index',
    seoTitle: 'SKSR — Shotokan Karaté Sud Réunion',
    seoDescription:
      "L'école Shotokan du sud de La Réunion. Karaté traditionnel depuis 2009 à L'Étang-Salé.",
    sections: INDEX_SECTIONS,
  },
  {
    slug: 'club',
    seoTitle: 'Le Club — SKSR',
    seoDescription:
      "Histoire, valeurs et lignée du Shotokan Karaté Sud Réunion depuis 2009.",
    sections: CLUB_SECTIONS,
  },
  {
    slug: 'cours',
    seoTitle: 'Cours — SKSR',
    seoDescription:
      '29 créneaux hebdomadaires au SKSR : Baby Karaté, Enfants, Ados, Adultes, Cross Training et sections compétition Kata & Combat.',
    sections: COURS_SECTIONS,
  },
  {
    slug: 'dojo',
    seoTitle: 'Le Dojo — SKSR',
    seoDescription:
      "Un dojo privé à L'Étang-Salé, équipé selon la tradition : tatamis, makiwara, miroirs, sacs de frappe.",
    sections: DOJO_SECTIONS,
  },
  {
    slug: 'tarifs',
    seoTitle: 'Tarifs & inscription — SKSR',
    seoDescription:
      'Tarifs mensuels accessibles, remise famille −10 %, paiement en 4× sans frais. Adhésion sécurisée via HelloAsso.',
    sections: TARIFS_SECTIONS,
  },
  {
    slug: 'equipe',
    seoTitle: "L'équipe — SKSR",
    seoDescription:
      "Trois senseis diplômés FFKDA et un bureau engagé au service des karatékas du club.",
    sections: EQUIPE_SECTIONS,
  },
  {
    slug: 'galerie',
    seoTitle: 'Galerie — SKSR',
    seoDescription:
      "Galerie photo du SKSR à L'Étang-Salé : dojo, kata, kumite, compétition et stages.",
    sections: GALERIE_SECTIONS,
  },
  {
    slug: 'actualites',
    seoTitle: 'Actualités — SKSR',
    seoDescription:
      'Les nouvelles du dojo : compétitions, stages, passages de grade, événements.',
    sections: ACTUALITES_SECTIONS,
  },
  {
    slug: 'competitions',
    seoTitle: 'Compétitions — SKSR',
    seoDescription:
      'Sections Compétition Kata et Combat du Shotokan Karaté Sud Réunion — palmarès et derniers résultats.',
    sections: COMPETITIONS_SECTIONS,
  },
  {
    slug: 'contact',
    seoTitle: 'Contact — SKSR',
    seoDescription:
      "13 bis rue du stade · L'Étang-Salé · La Réunion. Téléphone, email et formulaire de contact du dojo.",
    sections: CONTACT_SECTIONS,
  },
];

async function main() {
  const clubSlug = process.argv[2] ?? 'club-demo';
  const club = await prisma.club.findUnique({ where: { slug: clubSlug } });
  if (!club) {
    console.error(`Club '${clubSlug}' introuvable — run seed:default first.`);
    process.exit(1);
  }
  console.log(`Seed vitrine SKSR pour club ${club.name} (${club.id}) …`);

  for (const page of PAGES) {
    const existing = await prisma.vitrinePage.findUnique({
      where: { clubId_slug: { clubId: club.id, slug: page.slug } },
    });
    const data = {
      clubId: club.id,
      slug: page.slug,
      templateKey: 'sksr-v1',
      status: 'PUBLISHED' as const,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      sectionsJson: page.sections as unknown as object,
    };
    if (existing) {
      await prisma.vitrinePage.update({ where: { id: existing.id }, data });
      console.log(`  ✓ ${page.slug} mis à jour (${page.sections.length} sections)`);
    } else {
      await prisma.vitrinePage.create({ data });
      console.log(`  + ${page.slug} créé (${page.sections.length} sections)`);
    }
  }

  await prisma.club.update({
    where: { id: club.id },
    data: { vitrinePublished: true },
  });
  console.log('Vitrine publiée ✔︎');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
