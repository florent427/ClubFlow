import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CLUB_STRIPE_CONNECT_STATUS,
  OPEN_STRIPE_CONNECT_DASHBOARD,
  REFRESH_STRIPE_CONNECT_STATUS,
  START_STRIPE_CONNECT_ONBOARDING,
  type ClubStripeConnectStatus,
  type ClubStripeConnectStatusQueryData,
  type OpenStripeConnectDashboardMutationData,
  type RefreshStripeConnectStatusMutationData,
  type StartStripeConnectOnboardingMutationData,
} from '../../lib/stripe-connect-documents';
import { hasMandateNameMismatch } from '../../lib/stripe-mandate-identity';
import { QueryError } from '../../components/QueryError';
import { useToast } from '../../components/ToastProvider';
import { frenchError } from '../../lib/errors';

/**
 * Paramètres → Paiements (Stripe Connect).
 *
 * Route : /settings/payments — c'est l'URL de retour utilisée par
 * l'API après l'onboarding Stripe (`?stripe=return`, ou `?stripe=refresh`
 * quand le lien à usage unique a expiré).
 *
 * Trois situations distinctes selon l'état du compte :
 *  1. aucun compte connecté        → invitation à connecter Stripe
 *  2. compte créé mais pas actif   → dossier Stripe à finaliser
 *  3. encaissement activé          → accès au tableau de bord Stripe
 */
export function PaymentsSettingsPage() {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // On mémorise le motif de retour puis on nettoie l'URL : un simple
  // rechargement de page ne doit pas rejouer l'actualisation automatique.
  const [returnFlag] = useState<string | null>(() => searchParams.get('stripe'));
  const handledReturn = useRef(false);

  const { data, loading, error, refetch } =
    useQuery<ClubStripeConnectStatusQueryData>(CLUB_STRIPE_CONNECT_STATUS, {
      fetchPolicy: 'cache-and-network',
    });

  const [refreshStatus, { loading: refreshing }] =
    useMutation<RefreshStripeConnectStatusMutationData>(
      REFRESH_STRIPE_CONNECT_STATUS,
      {
        refetchQueries: [{ query: CLUB_STRIPE_CONNECT_STATUS }],
        awaitRefetchQueries: true,
      },
    );

  const [startOnboarding, { loading: starting }] =
    useMutation<StartStripeConnectOnboardingMutationData>(
      START_STRIPE_CONNECT_ONBOARDING,
    );

  const [openDashboard, { loading: opening }] =
    useMutation<OpenStripeConnectDashboardMutationData>(
      OPEN_STRIPE_CONNECT_DASHBOARD,
    );

  // Retour d'onboarding : l'état Stripe vient de changer, on resynchronise.
  useEffect(() => {
    if (searchParams.get('stripe') == null) return;
    // Nettoyage de l'URL (le motif reste disponible via `returnFlag`).
    const next = new URLSearchParams(searchParams);
    next.delete('stripe');
    setSearchParams(next, { replace: true });

    if (returnFlag !== 'return' || handledReturn.current) return;
    handledReturn.current = true;
    void refreshStatus().catch((err: unknown) => {
      showToast(frenchError(err), 'error');
    });
  }, [searchParams, setSearchParams, returnFlag, refreshStatus, showToast]);

  const status = data?.clubStripeConnectStatus;
  const busy = starting || opening || refreshing;

  /** Ouvre le parcours Stripe (création ou reprise du dossier). */
  async function handleConnect(): Promise<void> {
    try {
      const res = await startOnboarding();
      const url = res.data?.startStripeConnectOnboarding;
      if (!url) throw new Error("Stripe n'a pas renvoyé de lien d'inscription.");
      window.location.href = url;
    } catch (err) {
      showToast(frenchError(err), 'error');
    }
  }

  /** Ouvre le tableau de bord Stripe du club. */
  async function handleOpenDashboard(): Promise<void> {
    try {
      const res = await openDashboard();
      const url = res.data?.openStripeConnectDashboard;
      if (!url) throw new Error("Stripe n'a pas renvoyé de lien d'accès.");
      window.location.href = url;
    } catch (err) {
      showToast(frenchError(err), 'error');
    }
  }

  /** Resynchronise l'état depuis Stripe. */
  async function handleRefresh(): Promise<void> {
    try {
      await refreshStatus();
      showToast('État du compte Stripe actualisé.', 'success');
    } catch (err) {
      showToast(frenchError(err), 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <p className="members-loom__eyebrow">
          <Link to="/settings">← Paramètres</Link>
        </p>
        <h1 className="members-loom__title">Paiements en ligne</h1>
        <p className="members-loom__lede">
          Pour encaisser des paiements par carte (cotisations, boutique,
          billetterie), votre club doit relier son propre compte Stripe. Tant
          que ce n'est pas fait, le paiement en ligne reste indisponible.
        </p>
      </header>

      {/* Lien d'inscription expiré : Stripe nous renvoie sans rien avoir fait */}
      {returnFlag === 'refresh' ? (
        <div className="cf-alert cf-alert--warning" role="alert">
          <span className="material-symbols-outlined" aria-hidden>
            schedule
          </span>
          <div className="cf-alert__content">
            <strong>Le lien Stripe a expiré</strong>
            <span>
              Les liens d'inscription Stripe ne sont valables que quelques
              minutes. Relancez la démarche ci-dessous, rien n'est perdu.
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : loading && !status ? (
        <p className="cf-loading-state">
          <span className="cf-loading-state__spinner" aria-hidden />
          Chargement de l'état du compte…
        </p>
      ) : status ? (
        <section className="cf-stripe-connect">
          <StripeConnectPanel
            status={status}
            busy={busy}
            starting={starting}
            opening={opening}
            onConnect={() => void handleConnect()}
            onOpenDashboard={() => void handleOpenDashboard()}
          />

          {/* L'identité KYC n'existe qu'à partir du moment où un compte est
              créé — avant, il n'y a rien à vérifier. */}
          {status.stripeAccountId ? (
            <MandateIdentityCard
              status={status}
              busy={busy}
              opening={opening}
              onOpenDashboard={() => void handleOpenDashboard()}
            />
          ) : null}

          <div className="cf-stripe-connect__footer">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => void handleRefresh()}
              disabled={busy}
            >
              <span className="material-symbols-outlined" aria-hidden>
                refresh
              </span>
              {refreshing ? 'Actualisation…' : 'Actualiser'}
            </button>
            <span className="cf-stripe-connect__hint">
              Après une modification chez Stripe, l'état peut mettre quelques
              instants à se mettre à jour ici.
            </span>
          </div>
        </section>
      ) : null}
    </>
  );
}

/** Rend la carte correspondant à l'une des trois situations possibles. */
function StripeConnectPanel({
  status,
  busy,
  starting,
  opening,
  onConnect,
  onOpenDashboard,
}: {
  status: ClubStripeConnectStatus;
  busy: boolean;
  starting: boolean;
  opening: boolean;
  onConnect: () => void;
  onOpenDashboard: () => void;
}) {
  // Situation 1 — aucun compte Stripe rattaché au club.
  if (!status.stripeAccountId) {
    return (
      <div className="cf-card">
        <h2>
          Aucun compte Stripe connecté{' '}
          <span className="cf-pill cf-pill--danger">Encaissement inactif</span>
        </h2>
        <p className="muted">
          Stripe est le prestataire qui encaisse les paiements par carte pour
          votre club. L'argent est versé directement sur le compte bancaire de
          l'association — ClubFlow n'y a jamais accès.
        </p>
        <p className="muted">
          La création du compte se fait sur le site de Stripe, en quelques
          minutes : coordonnées de l'association, du responsable légal, et
          l'IBAN sur lequel recevoir les virements.
        </p>
        <div className="cf-stripe-connect__actions">
          <button
            type="button"
            className="cf-btn cf-btn--gradient"
            onClick={onConnect}
            disabled={busy}
          >
            {starting ? 'Ouverture de Stripe…' : 'Connecter mon compte Stripe'}
          </button>
        </div>
      </div>
    );
  }

  // Situation 2 — compte créé mais Stripe n'autorise pas encore l'encaissement.
  if (!status.chargesEnabled) {
    return (
      <div className="cf-card">
        <h2>
          Dossier Stripe à finaliser{' '}
          <span className="cf-pill cf-pill--warn">Encaissement inactif</span>
        </h2>
        <p className="muted">
          Votre compte Stripe existe, mais il manque des informations pour que
          Stripe autorise l'encaissement. C'est très courant : il reste souvent
          une pièce justificative ou un IBAN à renseigner.
        </p>
        <StatusChecklist status={status} />
        <div className="cf-stripe-connect__actions">
          <button
            type="button"
            className="cf-btn cf-btn--gradient"
            onClick={onConnect}
            disabled={busy}
          >
            {starting ? 'Ouverture de Stripe…' : "Terminer l'inscription"}
          </button>
        </div>
      </div>
    );
  }

  // Situation 3 — le club peut encaisser.
  return (
    <div className="cf-card">
      <h2>
        Paiement en ligne actif{' '}
        <span className="cf-pill cf-pill--ok">Encaissement activé</span>
      </h2>
      <p className="muted">
        Votre club peut encaisser des paiements par carte. Le détail des
        transactions et des virements est consultable chez Stripe.
      </p>
      <StatusChecklist status={status} />
      <div className="cf-stripe-connect__actions">
        <button
          type="button"
          className="cf-btn cf-btn--secondary"
          onClick={onOpenDashboard}
          disabled={busy}
        >
          {opening ? 'Ouverture…' : 'Ouvrir mon tableau de bord Stripe'}
        </button>
      </div>
    </div>
  );
}

/**
 * Identité déclarée au KYC Stripe — ce que l'adhérent verra réellement.
 *
 * En direct charges (ADR-0008), le club est marchand de référence : le mandat
 * SEPA et le libellé du relevé bancaire portent l'identité du compte connecté,
 * jamais `Club.name`. Un adhérent qui ne reconnaît pas ce nom peut contester
 * le prélèvement — le SEPA lui en laisse le droit 8 semaines sans motif.
 *
 * Affichage seul : la raison sociale est une donnée KYC, elle ne se modifie
 * que depuis le dashboard Express du club, jamais depuis ClubFlow.
 */
export function MandateIdentityCard({
  status,
  busy,
  opening,
  onOpenDashboard,
}: {
  status: ClubStripeConnectStatus;
  busy: boolean;
  opening: boolean;
  onOpenDashboard: () => void;
}) {
  const { businessName, statementDescriptor, clubName } = status;
  const mismatch = hasMandateNameMismatch(businessName, clubName);

  return (
    <div className="cf-card">
      <h2>Identité vue par vos adhérents</h2>
      <p className="muted">
        Vos adhérents ne voient pas le nom du club tel qu'il est saisi dans
        ClubFlow, mais l'identité déclarée à Stripe lors de votre inscription.
        C'est ce nom qui figure sur le mandat de prélèvement qu'ils signent et
        sur leur relevé bancaire.
      </p>

      <dl className="cf-stripe-connect__identity">
        <div>
          <dt>Raison sociale déclarée à Stripe</dt>
          <dd>
            {businessName ?? (
              <span className="muted">
                Pas encore renseignée dans votre dossier Stripe.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Libellé sur le relevé bancaire</dt>
          <dd>
            {statementDescriptor ?? (
              <span className="muted">
                Pas encore défini — Stripe le dérivera de votre raison sociale.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Nom du club dans ClubFlow</dt>
          <dd>{clubName}</dd>
        </div>
      </dl>

      {mismatch ? (
        <div className="cf-alert cf-alert--warning" role="alert">
          <span className="material-symbols-outlined" aria-hidden>
            report
          </span>
          <div className="cf-alert__content">
            <strong>
              Ce nom ne correspond pas à celui de votre club dans ClubFlow
            </strong>
            <span>
              Vos adhérents verront «&nbsp;{businessName}&nbsp;» sur leur mandat
              et leur relevé, alors qu'ils vous connaissent sous
              «&nbsp;{clubName}&nbsp;». Un adhérent qui ne reconnaît pas un
              prélèvement peut le faire annuler par sa banque pendant huit
              semaines, sans avoir à se justifier. Nous vous recommandons
              d'aligner les deux noms.
            </span>
          </div>
        </div>
      ) : null}

      <p className="cf-stripe-connect__hint">
        Cette identité provient de votre dossier Stripe : elle ne peut être
        modifiée que depuis votre tableau de bord Stripe, par le club lui-même.
      </p>
      <div className="cf-stripe-connect__actions">
        <button
          type="button"
          className="cf-btn cf-btn--secondary"
          onClick={onOpenDashboard}
          disabled={busy}
        >
          {opening ? 'Ouverture…' : 'Modifier chez Stripe'}
        </button>
      </div>
    </div>
  );
}

/** Détail lisible de l'état du compte, sans jargon Stripe. */
function StatusChecklist({ status }: { status: ClubStripeConnectStatus }) {
  const lines: Array<{ ok: boolean; label: string; hint: string }> = [
    {
      ok: status.detailsSubmitted,
      label: 'Dossier Stripe transmis',
      hint: status.detailsSubmitted
        ? 'Les informations de votre association ont bien été envoyées à Stripe.'
        : 'Des informations sur votre association restent à compléter chez Stripe.',
    },
    {
      ok: status.chargesEnabled,
      label: 'Encaissement autorisé',
      hint: status.chargesEnabled
        ? 'Vos adhérents peuvent payer par carte.'
        : "Stripe n'autorise pas encore les paiements sur ce compte.",
    },
    {
      ok: status.payoutsEnabled,
      label: 'Virements vers votre banque',
      hint: status.payoutsEnabled
        ? 'Stripe reverse automatiquement les sommes encaissées sur votre compte bancaire.'
        : "Le compte bancaire de réception n'est pas encore validé par Stripe.",
    },
  ];

  return (
    <>
      <ul className="cf-stripe-connect__checklist">
        {lines.map((line) => (
          <li
            key={line.label}
            className={
              line.ok
                ? 'cf-stripe-connect__check cf-stripe-connect__check--ok'
                : 'cf-stripe-connect__check cf-stripe-connect__check--todo'
            }
          >
            <span className="material-symbols-outlined" aria-hidden>
              {line.ok ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <span className="cf-stripe-connect__check-body">
              <strong>{line.label}</strong>
              <span>{line.hint}</span>
            </span>
          </li>
        ))}
      </ul>
      {status.onboardedAt ? (
        <p className="cf-stripe-connect__hint">
          Compte opérationnel depuis le{' '}
          {new Date(status.onboardedAt).toLocaleDateString('fr-FR')}.
        </p>
      ) : null}
    </>
  );
}

export default PaymentsSettingsPage;
