export type MainTabParamList = {
  Home: undefined;
  Progression: undefined;
  Planning: undefined;
  Actus: undefined;
  Evenements: undefined;
  Reservations: undefined;
  Messagerie: undefined;
  Famille: undefined;
  Parametres: undefined;
  Documents: undefined;
};

export type ContactTabParamList = {
  Home: undefined;
  Actus: undefined;
  Evenements: undefined;
  Documents: undefined;
};

/**
 * Stack interne au tab "Documents" — liste puis écran de signature
 * d'un document précis.
 */
export type DocumentsStackParamList = {
  DocumentsToSign: undefined;
  DocumentSign: { documentId: string };
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyEmail: { token?: string } | undefined;
  SelectProfile: undefined;
  Main: undefined;
};
