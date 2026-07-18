import { gql } from '@apollo/client';

/**
 * Stripe Connect (Express) — compte d'encaissement propre à chaque club.
 *
 * Opérations réservées au back-office (GqlJwtAuthGuard + ClubContextGuard +
 * ClubAdminRoleGuard côté API) : c'est de la configuration financière, jamais
 * exposée aux membres.
 */

/** Reflet du contrat `ClubStripeConnectStatusGraph`. */
export type ClubStripeConnectStatus = {
  /** `null` tant qu'aucun compte Stripe n'a été créé pour le club. */
  stripeAccountId: string | null;
  /** Le club peut encaisser des paiements en ligne. */
  chargesEnabled: boolean;
  /** Stripe peut reverser l'argent sur le compte bancaire du club. */
  payoutsEnabled: boolean;
  /** Le dossier Stripe a été soumis (informations légales complètes). */
  detailsSubmitted: boolean;
  /** `null` tant que le compte n'a jamais été encaissable. */
  onboardedAt: string | null;
  /**
   * Raison sociale déclarée au KYC Stripe. En direct charges, c'est ce nom
   * que l'adhérent voit sur son mandat SEPA — pas `clubName`.
   */
  businessName: string | null;
  /** Libellé du relevé bancaire du débiteur (champ Stripe distinct). */
  statementDescriptor: string | null;
  /** Nom du club dans ClubFlow, pour comparaison avec `businessName`. */
  clubName: string;
};

/** Le champ est nullable côté client tant que la query n'a pas répondu. */
export type ClubStripeConnectStatusQueryData = {
  clubStripeConnectStatus: ClubStripeConnectStatus;
};

export type StartStripeConnectOnboardingMutationData = {
  startStripeConnectOnboarding: string;
};

export type RefreshStripeConnectStatusMutationData = {
  refreshStripeConnectStatus: ClubStripeConnectStatus;
};

export type OpenStripeConnectDashboardMutationData = {
  openStripeConnectDashboard: string;
};

const STATUS_FIELDS = `
  stripeAccountId
  chargesEnabled
  payoutsEnabled
  detailsSubmitted
  onboardedAt
  businessName
  statementDescriptor
  clubName
`;

export const CLUB_STRIPE_CONNECT_STATUS = gql`
  query ClubStripeConnectStatus {
    clubStripeConnectStatus {
      ${STATUS_FIELDS}
    }
  }
`;

/** Renvoie l'URL d'onboarding Stripe à ouvrir (lien à usage unique). */
export const START_STRIPE_CONNECT_ONBOARDING = gql`
  mutation StartStripeConnectOnboarding {
    startStripeConnectOnboarding
  }
`;

/** Force une resynchronisation depuis Stripe (après retour d'onboarding). */
export const REFRESH_STRIPE_CONNECT_STATUS = gql`
  mutation RefreshStripeConnectStatus {
    refreshStripeConnectStatus {
      ${STATUS_FIELDS}
    }
  }
`;

/** Renvoie l'URL du tableau de bord Stripe Express du club. */
export const OPEN_STRIPE_CONNECT_DASHBOARD = gql`
  mutation OpenStripeConnectDashboard {
    openStripeConnectDashboard
  }
`;
