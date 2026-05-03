export type MainTabParamList = {
  Home: undefined;
  /** Hub Activités — agrège Planning / Réservations / Événements. */
  Activites: undefined;
  Progression: undefined;
  Planning: undefined;
  Actus: undefined;
  Evenements: undefined;
  Reservations: undefined;
  Messagerie: undefined;
  Famille: undefined;
  Parametres: undefined;
  Documents: undefined;
  /** Overflow menu — modules secondaires (Documents, Actus, Profil…). */
  Plus: undefined;
};

export type ContactTabParamList = {
  Home: undefined;
  Actus: undefined;
  Evenements: undefined;
  Documents: undefined;
};

/**
 * Stack interne au tab "Documents" — flux à 3 écrans :
 *  1. liste des documents à signer
 *  2. aperçu PDF plein écran (lecture avant signature)
 *  3. écran de signature (champs + ouverture des modales de signature)
 */
export type DocumentsStackParamList = {
  DocumentsToSign: undefined;
  DocumentPreview: { documentId: string };
  DocumentSign: { documentId: string };
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyEmail: { token?: string } | undefined;
  SelectProfile: undefined;
  Main: undefined;
};
