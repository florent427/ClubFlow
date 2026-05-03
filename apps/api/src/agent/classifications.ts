/**
 * Registre central de classification des mutations/queries pour l'agent
 * conversationnel.
 *
 * Chaque entrée du registre définit :
 *  - la catégorie de risque (FORBIDDEN | DESTRUCTIVE | GUARDED | SAFE)
 *  - le label FR affiché dans l'UI
 *  - le rôle minimum requis (héritage RBAC existant)
 *
 * Toute mutation ABSENTE de ce registre est considérée comme FORBIDDEN
 * par défaut (fail-close). C'est intentionnel : si on ajoute une nouvelle
 * mutation, elle n'est pas exposée à l'agent tant qu'on ne l'a pas classée.
 */

import { AgentRiskLevel } from '@prisma/client';

export type AgentRole = 'CLUB_ADMIN' | 'BOARD' | 'TREASURER' | 'COMM_MANAGER' | 'MEMBER';

export interface AgentToolClassification {
  /** Nom exact dans le schema GraphQL. */
  name: string;
  /** 'query' ou 'mutation'. */
  kind: 'query' | 'mutation';
  risk: AgentRiskLevel;
  /** Description FR qui sera envoyée au LLM comme tool description. */
  description: string;
  /** Rôles autorisés à déclencher ce tool via l'agent. MEMBER = tout le monde connecté. */
  allowedRoles: AgentRole[];
  /**
   * Sélection GraphQL à appliquer sur le retour (sans accolades).
   * Ex: "id firstName lastName". Laisser undefined pour les retours scalars
   * (Boolean, ID, Int, etc.).
   */
  returnSelection?: string;
}

export const AGENT_CLASSIFICATIONS: AgentToolClassification[] = [
  // ==========================================================================
  // QUERIES — essentiellement SAFE (lecture seule)
  // ==========================================================================
  { name: 'clubMembers', kind: 'query', risk: 'SAFE', description: 'Liste tous les membres du club. Aucun paramètre.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER', 'COMM_MANAGER'] },
  { name: 'clubContacts', kind: 'query', risk: 'SAFE', description: 'Liste les contacts (prospects, anciens) du club. Aucun paramètre.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'clubFamilies', kind: 'query', risk: 'SAFE', description: 'Liste les foyers familiaux du club.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubEvents', kind: 'query', risk: 'SAFE', description: 'Liste les événements du club (passés et à venir).', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER', 'MEMBER'] },
  { name: 'clubAnnouncements', kind: 'query', risk: 'SAFE', description: 'Liste les annonces publiées dans la vie du club.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER', 'MEMBER'] },
  { name: 'clubSurveys', kind: 'query', risk: 'SAFE', description: 'Liste les sondages internes.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'clubBlogPosts', kind: 'query', risk: 'SAFE', description: 'Liste les articles de blog internes.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'clubInvoices', kind: 'query', risk: 'SAFE', description: 'Liste les factures du club.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'clubAccountingEntries', kind: 'query', risk: 'SAFE', description: 'Liste les écritures comptables.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'clubDashboard', kind: 'query', risk: 'SAFE', description: "Tableau de bord global du club : KPIs adhésions, finances, événements.", allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubSeasons', kind: 'query', risk: 'SAFE', description: 'Liste les saisons sportives.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubMembershipProducts', kind: 'query', risk: 'SAFE', description: 'Liste les formules d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'clubGradeLevels', kind: 'query', risk: 'SAFE', description: 'Liste les grades/niveaux.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubDynamicGroups', kind: 'query', risk: 'SAFE', description: 'Liste les groupes dynamiques de membres.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'clubVenues', kind: 'query', risk: 'SAFE', description: 'Liste les lieux/salles.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubCourseSlots', kind: 'query', risk: 'SAFE', description: 'Liste les créneaux de cours.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'MEMBER'] },
  { name: 'clubSponsorshipDeals', kind: 'query', risk: 'SAFE', description: 'Liste les accords de sponsoring.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubGrantApplications', kind: 'query', risk: 'SAFE', description: 'Liste les dossiers de subventions.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubMessageCampaigns', kind: 'query', risk: 'SAFE', description: 'Liste les campagnes de communication.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrinePages', kind: 'query', risk: 'SAFE', description: 'Liste les pages du site vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineArticles', kind: 'query', risk: 'SAFE', description: 'Liste les articles du site vitrine (avec statut génération IA, catégories, SEO).', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineCategories', kind: 'query', risk: 'SAFE', description: "Liste les catégories d'articles vitrine (nom, slug, couleur, nombre d'articles).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineComments', kind: 'query', risk: 'SAFE', description: "Liste les commentaires publics reçus (filtrable par statut : PENDING, NEEDS_REVIEW, APPROVED, REJECTED, SPAM). Utile pour identifier ceux à modérer.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineAnnouncements', kind: 'query', risk: 'SAFE', description: 'Liste les annonces du site vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineSettings', kind: 'query', risk: 'SAFE', description: 'Paramètres généraux du site vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'clubVitrineBranding', kind: 'query', risk: 'SAFE', description: "Branding du site vitrine (tagline, palette, fonts, footer).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'memberCustomFieldDefinitions', kind: 'query', risk: 'SAFE', description: 'Liste les champs personnalisés sur les membres.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubMemberCatalogFieldSettings', kind: 'query', risk: 'SAFE', description: "Paramètres d'affichage du catalogue membres.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubAiSettings', kind: 'query', risk: 'SAFE', description: "Paramètres IA du club : modèle texte, modèle image, statut clé API (masquée), compteurs tokens.", allowedRoles: ['CLUB_ADMIN'] },
  { name: 'clubAiUsageLogs', kind: 'query', risk: 'SAFE', description: "Historique récent des appels IA (texte, images, agent) avec tokens et coûts.", allowedRoles: ['CLUB_ADMIN'] },

  // ==========================================================================
  // SAFE — créations de drafts, petites updates réversibles
  // ==========================================================================
  { name: 'createClubMember', kind: 'mutation', risk: 'SAFE', description: 'Crée un nouveau membre. Réversible via suppression.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubFamily', kind: 'mutation', risk: 'SAFE', description: 'Crée un nouveau foyer familial.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubAnnouncement', kind: 'mutation', risk: 'SAFE', description: "Crée une annonce interne (statut DRAFT par défaut, non visible).", allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'createClubBlogPost', kind: 'mutation', risk: 'SAFE', description: "Crée un article de blog interne (statut DRAFT par défaut).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'createClubEvent', kind: 'mutation', risk: 'SAFE', description: "Crée un événement (statut DRAFT par défaut, non publié).", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubSurvey', kind: 'mutation', risk: 'SAFE', description: "Crée un sondage (fermé par défaut jusqu'à openClubSurvey).", allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'createVitrineArticle', kind: 'mutation', risk: 'SAFE', description: "Crée un article vitrine VIDE à remplir manuellement (statut DRAFT). Pour un article généré par IA avec images + SEO automatiques, préfère startVitrineArticleGeneration.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'startVitrineArticleGeneration', kind: 'mutation', risk: 'SAFE', description: "MOYEN RECOMMANDÉ pour générer un article vitrine complet par IA. Lance en arrière-plan la pipeline : texte SEO 2026 (titre, meta, H1/H2, paragraphes, FAQ, mots-clés), image de couverture + images inline, le tout en DRAFT non publié. Args : sourceText (brief/idée, 20-8000 chars), tone (ex. 'informatif expert', 'inspirant'), useWebSearch (true pour faits/chiffres récents, +0.02$), useAiImages (true=génère images IA, false=placeholders gratuits), inlineImageCount (0-6), generateFeaturedImage (bool). Retourne articleId immédiatement, l'article apparaît dans la liste avec badge 'En cours'.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  // Note : updateVitrineArticle / setVitrineArticleStatus / deleteVitrineArticle
  // sont déjà déclarés plus bas avec un risk GUARDED/DESTRUCTIVE (plus sûr).
  { name: 'createVitrineCategory', kind: 'mutation', risk: 'SAFE', description: "Crée une catégorie d'articles vitrine (nom, description, couleur hex).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrineCategory', kind: 'mutation', risk: 'SAFE', description: "Modifie une catégorie d'articles vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteVitrineCategory', kind: 'mutation', risk: 'GUARDED', description: "Supprime une catégorie (les articles sont conservés, juste retirés de la catégorie).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'setVitrineArticleCategories', kind: 'mutation', risk: 'SAFE', description: "Remplace la liste des catégories d'un article (categoryIds = tableau).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'setVitrineCommentStatus', kind: 'mutation', risk: 'SAFE', description: "Modère un commentaire public : APPROVED (visible) / REJECTED / SPAM / NEEDS_REVIEW.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'generateVitrineCommentReply', kind: 'mutation', risk: 'SAFE', description: "Génère par IA une réponse à un commentaire (remerciement + valeur SEO). Retourne juste le texte draft, ne publie pas. Utilise ensuite setVitrineCommentReply.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'setVitrineCommentReply', kind: 'mutation', risk: 'SAFE', description: "Publie (ou retire) une réponse admin sous un commentaire. Visible publiquement sous le commentaire original.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteVitrineComment', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Supprime définitivement un commentaire.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'createVitrineAnnouncement', kind: 'mutation', risk: 'SAFE', description: 'Crée une annonce vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'createClubVenue', kind: 'mutation', risk: 'SAFE', description: 'Crée un lieu/salle.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubDynamicGroup', kind: 'mutation', risk: 'SAFE', description: 'Crée un groupe dynamique de membres.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubCourseSlot', kind: 'mutation', risk: 'SAFE', description: 'Crée un créneau de cours.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubGradeLevel', kind: 'mutation', risk: 'SAFE', description: 'Crée un grade/niveau.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createMemberCustomFieldDefinition', kind: 'mutation', risk: 'SAFE', description: 'Crée un champ personnalisé membre.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'createClubRoleDefinition', kind: 'mutation', risk: 'SAFE', description: "Crée un rôle personnalisé au sein du club.", allowedRoles: ['CLUB_ADMIN'] },
  { name: 'createClubSponsorshipDeal', kind: 'mutation', risk: 'SAFE', description: 'Crée un accord de sponsoring (brouillon).', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'createClubGrantApplication', kind: 'mutation', risk: 'SAFE', description: 'Crée un dossier de subvention (brouillon).', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'createClubMessageCampaign', kind: 'mutation', risk: 'SAFE', description: 'Crée une campagne de communication (DRAFT, non envoyée).', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'upsertVitrinePage', kind: 'mutation', risk: 'SAFE', description: 'Crée ou met à jour une page vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrinePageSection', kind: 'mutation', risk: 'SAFE', description: "Modifie le contenu d'une section d'une page vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrinePageSeo', kind: 'mutation', risk: 'SAFE', description: 'Met à jour les métadonnées SEO d\'une page vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'reorderVitrinePageSections', kind: 'mutation', risk: 'SAFE', description: "Réordonne les sections d'une page vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'addSectionListItem', kind: 'mutation', risk: 'SAFE', description: "Ajoute un item dans une liste d'une section vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateSectionListItem', kind: 'mutation', risk: 'SAFE', description: "Modifie un item d'une liste dans une section vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'reorderSectionListItems', kind: 'mutation', risk: 'SAFE', description: "Réordonne les items d'une liste dans une section vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'addVitrineGalleryPhoto', kind: 'mutation', risk: 'SAFE', description: 'Ajoute une photo à la galerie vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrineGalleryPhoto', kind: 'mutation', risk: 'SAFE', description: 'Modifie la légende/catégorie/ordre d\'une photo de la galerie.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'restoreVitrineRevision', kind: 'mutation', risk: 'SAFE', description: "Restaure une révision antérieure d'une page vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'createHouseholdGroup', kind: 'mutation', risk: 'SAFE', description: "Crée un groupe de foyer (ex. 'famille Dupont').", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'attachClubContactToFamilyAsMember', kind: 'mutation', risk: 'SAFE', description: 'Promeut un contact en membre et l\'attache à un foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'promoteContactToMember', kind: 'mutation', risk: 'SAFE', description: 'Promeut un contact prospect en membre du club.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'transferClubMemberToFamily', kind: 'mutation', risk: 'SAFE', description: 'Transfère un membre vers un autre foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'setMemberDynamicGroups', kind: 'mutation', risk: 'SAFE', description: 'Assigne des groupes dynamiques à un membre.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'setFamilyHouseholdGroup', kind: 'mutation', risk: 'SAFE', description: "Assigne une famille à un groupe de foyer.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'setHouseholdGroupCarrierFamily', kind: 'mutation', risk: 'SAFE', description: "Définit la famille porteuse principale d'un groupe de foyer.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubOpenMembershipCart', kind: 'mutation', risk: 'SAFE', description: 'Ouvre un panier d\'adhésion pour un foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubCreateAdditionalMembershipCart', kind: 'mutation', risk: 'SAFE', description: 'Crée un panier d\'adhésion supplémentaire pour un foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubUpdateCartItem', kind: 'mutation', risk: 'SAFE', description: 'Met à jour une ligne de panier d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubToggleCartItemLicense', kind: 'mutation', risk: 'SAFE', description: 'Active/désactive la licence fédérale sur une ligne de panier.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'clubApplyCartItemExceptionalDiscount', kind: 'mutation', risk: 'SAFE', description: 'Applique une remise exceptionnelle sur une ligne de panier.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'clubRemoveCartItem', kind: 'mutation', risk: 'SAFE', description: 'Retire une ligne du panier d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'adminRegisterMemberToEvent', kind: 'mutation', risk: 'SAFE', description: 'Inscrit un membre à un événement (admin).', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'openClubSurvey', kind: 'mutation', risk: 'SAFE', description: 'Ouvre un sondage aux réponses.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'createClubSeason', kind: 'mutation', risk: 'SAFE', description: 'Crée une saison sportive.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'createMembershipOneTimeFee', kind: 'mutation', risk: 'SAFE', description: 'Crée un frais ponctuel d\'adhésion (ex. licence).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'createMembershipProduct', kind: 'mutation', risk: 'SAFE', description: 'Crée une formule d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'createShopProduct', kind: 'mutation', risk: 'SAFE', description: 'Crée un produit de la boutique.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'upsertClubMemberCatalogFieldSettings', kind: 'mutation', risk: 'SAFE', description: "Configure les champs affichés dans le catalogue membres.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },

  // ==========================================================================
  // GUARDED — updates qui impactent membres/finances/public (confirmation soft)
  // ==========================================================================
  { name: 'updateClubMember', kind: 'mutation', risk: 'GUARDED', description: "Modifie les données d'un membre (identité, coordonnées, statut).", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubContact', kind: 'mutation', risk: 'GUARDED', description: "Modifie un contact (prospect).", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubFamily', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un foyer familial.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubBranding', kind: 'mutation', risk: 'GUARDED', description: "Modifie l'identité visuelle du club (logo, SIRET, adresse).", allowedRoles: ['CLUB_ADMIN'] },
  { name: 'updateClubSeason', kind: 'mutation', risk: 'GUARDED', description: "Modifie une saison sportive (dates, statut).", allowedRoles: ['CLUB_ADMIN'] },
  { name: 'updateClubEvent', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un événement (lieu, dates, capacité).', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubAnnouncement', kind: 'mutation', risk: 'GUARDED', description: 'Modifie une annonce interne.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'updateClubBlogPost', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un article de blog interne.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrineArticle', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un article vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateVitrineAnnouncement', kind: 'mutation', risk: 'GUARDED', description: 'Modifie une annonce vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateClubVitrineBranding', kind: 'mutation', risk: 'GUARDED', description: 'Modifie le branding du site vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateClubVenue', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un lieu/salle.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubCourseSlot', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un créneau de cours.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubDynamicGroup', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un groupe dynamique.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubGradeLevel', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un grade/niveau.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubSponsorshipDeal', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un accord de sponsoring.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'updateClubGrantApplication', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un dossier de subvention.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'updateClubMessageCampaign', kind: 'mutation', risk: 'GUARDED', description: 'Modifie une campagne de communication (avant envoi).', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'updateClubRoleDefinition', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un rôle personnalisé.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'updateMemberCustomFieldDefinition', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un champ personnalisé membre.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateMembershipOneTimeFee', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un frais ponctuel d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'updateMembershipProduct', kind: 'mutation', risk: 'GUARDED', description: 'Modifie une formule d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'updateShopProduct', kind: 'mutation', risk: 'GUARDED', description: 'Modifie un produit de la boutique.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'upsertClubPricingRule', kind: 'mutation', risk: 'GUARDED', description: 'Crée ou modifie une règle de tarification (remise/majoration).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'updateClubVitrineSettings', kind: 'mutation', risk: 'GUARDED', description: 'Modifie les paramètres généraux du site vitrine (domaine, publication).', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'setVitrineArticleStatus', kind: 'mutation', risk: 'GUARDED', description: "Publie ou dépublie un article vitrine.", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'setVitrinePageStatus', kind: 'mutation', risk: 'GUARDED', description: 'Publie ou dépublie une page vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'publishClubAnnouncement', kind: 'mutation', risk: 'GUARDED', description: 'Publie une annonce interne (visible par les membres).', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'publishClubBlogPost', kind: 'mutation', risk: 'GUARDED', description: 'Publie un article de blog interne.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'publishClubEvent', kind: 'mutation', risk: 'GUARDED', description: 'Publie un événement (visible et inscriptions ouvertes).', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'closeClubSurvey', kind: 'mutation', risk: 'GUARDED', description: 'Ferme un sondage aux nouvelles réponses.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'createClubAccountingEntry', kind: 'mutation', risk: 'GUARDED', description: 'Crée une écriture comptable.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'createClubInvoice', kind: 'mutation', risk: 'GUARDED', description: 'Crée une facture (brouillon).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'createMembershipInvoiceDraft', kind: 'mutation', risk: 'GUARDED', description: 'Crée un brouillon de facture d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'setClubFamilyPayer', kind: 'mutation', risk: 'GUARDED', description: 'Définit le payeur principal d\'un foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'setClubFamilyPayerContact', kind: 'mutation', risk: 'GUARDED', description: 'Définit un contact payeur pour un foyer.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'submitClubGrantApplication', kind: 'mutation', risk: 'GUARDED', description: 'Soumet un dossier de subvention.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'archiveClubGrantApplication', kind: 'mutation', risk: 'GUARDED', description: 'Archive un dossier de subvention.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'archiveClubBlogPost', kind: 'mutation', risk: 'GUARDED', description: 'Archive un article de blog (non visible).', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'archiveMembershipOneTimeFee', kind: 'mutation', risk: 'GUARDED', description: 'Archive un frais ponctuel.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'archiveMemberCustomFieldDefinition', kind: 'mutation', risk: 'GUARDED', description: 'Archive un champ personnalisé membre.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'updateClubAiSettings', kind: 'mutation', risk: 'GUARDED', description: "Modifie les paramètres IA du club : modèle texte (anthropic/claude-sonnet-4-5, openai/gpt-4o, google/gemini-2.5-pro, z-ai/glm-4.6, minimax/minimax-m2…), modèle image (google/gemini-2.5-flash-image-preview, openai/dall-e-3…), et optionnellement la clé API OpenRouter. Champs input : { apiKey?: string, clearApiKey?: boolean, textModel?: string, imageModel?: string }. Ne JAMAIS fournir une clé API que l'utilisateur n'a pas explicitement tapée dans le chat.", allowedRoles: ['CLUB_ADMIN'] },

  // ==========================================================================
  // DESTRUCTIVE — delete, cancel, mass email, paiements (bouton rouge)
  // ==========================================================================
  { name: 'deleteClubMember', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Supprime définitivement un membre et ses données.", allowedRoles: ['CLUB_ADMIN'] },
  { name: 'deleteClubContact', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime définitivement un contact.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'deleteClubFamily', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un foyer familial.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'deleteClubEvent', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Supprime un événement et annule les inscriptions.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'deleteClubAnnouncement', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une annonce.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'deleteClubBlogPost', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un article de blog.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteClubSurvey', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un sondage et ses réponses.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'deleteVitrineArticle', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un article vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteVitrineAnnouncement', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une annonce vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteVitrineGalleryPhoto', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une photo de la galerie vitrine.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteClubCourseSlot', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un créneau de cours.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'deleteClubDynamicGroup', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un groupe dynamique.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'deleteClubGradeLevel', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un grade/niveau.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'deleteClubRoleDefinition', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un rôle personnalisé.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'deleteClubSponsorshipDeal', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un accord de sponsoring.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'TREASURER'] },
  { name: 'deleteClubGrantApplication', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un dossier de subvention.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'deleteClubMessageCampaign', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une campagne de communication.', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'deleteClubAccountingEntry', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une écriture comptable.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'deleteMembershipProduct', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime une formule d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'deleteMembershipOneTimeFee', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un frais ponctuel.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'deleteShopProduct', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un produit de la boutique.', allowedRoles: ['CLUB_ADMIN'] },
  { name: 'cancelClubEvent', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Annule un événement (inscrits notifiés).', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'cancelShopOrder', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Annule une commande boutique.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'adminCancelEventRegistration', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Annule l'inscription d'un membre à un événement.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'voidClubInvoice', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Annule une facture (passe en statut VOID, impact comptable).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'issueClubInvoice', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Émet officiellement une facture (numéro séquentiel, envoyée au payeur).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'createClubCreditNote', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Crée un avoir sur une facture (remboursement comptable).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'finalizeMembershipInvoice', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Finalise une facture d'adhésion (numérotée, non modifiable).", allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'recordClubManualPayment', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Enregistre un paiement manuel (chèque, virement, espèces).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'setClubMemberStatus', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Change le statut d'un membre (actif/inactif/archivé).", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'removeClubMemberFromFamily', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Retire un membre d'un foyer familial.", allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'removeClubFamilyLink', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Supprime un lien familial.', allowedRoles: ['CLUB_ADMIN', 'BOARD'] },
  { name: 'clubCancelMembershipCart', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Annule un panier d\'adhésion.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'clubValidateMembershipCart', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Valide définitivement un panier d\'adhésion (génère factures).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'sendClubMessageCampaign', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Envoie une campagne de communication (mass email).', allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'sendClubQuickMessage', kind: 'mutation', risk: 'DESTRUCTIVE', description: "Envoie un message rapide à une audience (email/SMS/Telegram).", allowedRoles: ['CLUB_ADMIN', 'COMM_MANAGER'] },
  { name: 'sendClubEventConvocation', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Envoie une convocation à tous les inscrits d\'un événement.', allowedRoles: ['CLUB_ADMIN', 'BOARD', 'COMM_MANAGER'] },
  { name: 'sendInvoiceReminder', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Envoie un rappel de paiement pour une facture.', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
  { name: 'markShopOrderPaid', kind: 'mutation', risk: 'DESTRUCTIVE', description: 'Marque une commande boutique comme payée (impact comptable).', allowedRoles: ['CLUB_ADMIN', 'TREASURER'] },
];

/** Fail-close : si la mutation n'est pas dans le registre, elle est FORBIDDEN. */
export function getClassification(
  opName: string,
  kind: 'query' | 'mutation',
): AgentToolClassification | null {
  return (
    AGENT_CLASSIFICATIONS.find((c) => c.name === opName && c.kind === kind) ?? null
  );
}

/** Catalogue filtré par rôles et queries/mutations authorisées. */
export function buildCatalogForRoles(
  userRoles: AgentRole[],
): AgentToolClassification[] {
  return AGENT_CLASSIFICATIONS.filter((c) =>
    c.allowedRoles.some((r) => userRoles.includes(r)),
  );
}
