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
};

export type ContactTabParamList = {
  Home: undefined;
  Actus: undefined;
  Evenements: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyEmail: { token?: string } | undefined;
  SelectProfile: undefined;
  Main: undefined;
};
