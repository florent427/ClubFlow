export type RequestUser = {
  userId: string;
  email: string;
  /** Profil membre actif (sélection type Netflix, Phase C). */
  activeProfileMemberId: string | null;
  /** Payeur contact sans fiche adhérent (exclusif avec `activeProfileMemberId` côté portail). */
  activeProfileContactId: string | null;
};
