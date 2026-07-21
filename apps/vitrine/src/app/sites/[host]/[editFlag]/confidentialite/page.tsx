import type { Metadata } from 'next';
import { resolveCurrentClub } from '@/lib/club-resolution';
import { fetchClubBranding } from '@/lib/club-branding';

/**
 * Politique de confidentialité — page légale statique (non éditable par le
 * club, contrairement aux pages DB-driven via VitrinePageShell).
 *
 * Le contenu s'adapte au tenant : nom du club résolu via le host, e-mail de
 * contact du club récupéré depuis son branding (fallback plateforme sinon).
 * Les sous-traitants et l'hébergeur sont ceux réellement utilisés par la
 * plateforme ClubFlow.
 *
 * ⚠️ `LAST_UPDATED` est la date de dernière révision du TEXTE — à mettre à
 * jour manuellement quand la politique change, PAS à la date du jour (sinon
 * elle changerait à chaque rendu, ce qui est trompeur).
 */
const LAST_UPDATED = '15 juillet 2026';

/** Contact du responsable de traitement (éditeur de la plateforme). */
const PLATFORM_CONTACT_EMAIL = 'florent.morel427@gmail.com';

interface RouteParams {
  params: Promise<{ host: string; editFlag: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Politique de confidentialité',
    description:
      'Comment vos données personnelles sont collectées, utilisées et protégées, conformément au RGPD.',
    robots: { index: true, follow: true },
  };
}

export default async function ConfidentialitePage({ params }: RouteParams) {
  const { host } = await params;
  let clubName = 'le club';
  let clubEmail: string | null = null;
  try {
    const club = await resolveCurrentClub(host);
    clubName = club.name;
    const branding = await fetchClubBranding(club.slug, club.name);
    // contact.email vaut '' (chaîne vide) quand non configuré → || null pour
    // basculer sur le fallback « page Contact ».
    clubEmail = branding.footer.contact.email || null;
  } catch {
    // Résolution impossible (host inconnu) : on garde les libellés neutres.
  }

  return (
    <>
      <header className="page-hero">
        <div className="page-hero__kanji" aria-hidden>
          個
        </div>
        <p className="page-hero__label">Confidentialité</p>
        <h1 className="page-hero__title">
          Politique de <em>confidentialité</em>
        </h1>
        <p className="page-hero__sub">
          Protection de vos données personnelles — {clubName}.
        </p>
      </header>

      <section className="container legal">
        <p className="legal__updated">
          Dernière mise à jour&nbsp;: {LAST_UPDATED}
        </p>

        <p>
          {clubName} accorde une grande importance à la protection de votre vie
          privée. La présente politique explique quelles données personnelles
          sont collectées lorsque vous utilisez ce site et les services
          associés, dans quel but, sur quelle base légale, avec qui elles sont
          partagées et comment exercer vos droits, conformément au Règlement
          général sur la protection des données (RGPD — Règlement UE 2016/679)
          et à la loi française « Informatique et Libertés ».
        </p>

        <h2>1. Responsable du traitement</h2>
        <p>
          Le responsable du traitement de vos données est {clubName}, en sa
          qualité d&rsquo;association ou de club utilisateur de la plateforme
          ClubFlow. Pour toute question relative à vos données ou pour exercer
          vos droits, vous pouvez contacter le club
          {clubEmail ? (
            <>
              {' '}à l&rsquo;adresse{' '}
              <a href={`mailto:${clubEmail}`}>{clubEmail}</a>
            </>
          ) : (
            <> par les coordonnées indiquées sur la page Contact</>
          )}
          .
        </p>
        <p>
          La solution technique qui héberge et fait fonctionner ce site est
          éditée par <strong>ClubFlow</strong> — Florent Morel,
          auto-entrepreneur (France), agissant en tant que sous-traitant au sens
          de l&rsquo;article 28 du RGPD. Contact&nbsp;:{' '}
          <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>
            {PLATFORM_CONTACT_EMAIL}
          </a>
          .
        </p>

        <h2>2. Données que nous collectons</h2>
        <p>Selon votre utilisation du site et des services, nous pouvons collecter&nbsp;:</p>
        <ul>
          <li>
            <strong>Formulaire de contact</strong>&nbsp;: prénom, nom, adresse
            e-mail, numéro de téléphone (facultatif) et contenu de votre
            message.
          </li>
          <li>
            <strong>Inscription et adhésion</strong> (via l&rsquo;espace
            membre)&nbsp;: identité, coordonnées, date de naissance, et — pour
            les activités sportives concernées — informations relatives au
            certificat médical. Ces données sont fournies volontairement lors de
            votre adhésion.
          </li>
          <li>
            <strong>Paiements</strong>&nbsp;: lorsque vous réglez une cotisation
            en ligne, les données de paiement sont traitées directement par
            notre prestataire de paiement sécurisé et ne transitent pas en clair
            par nos serveurs.
          </li>
          <li>
            <strong>Données techniques</strong>&nbsp;: données strictement
            nécessaires au bon fonctionnement du site (session
            d&rsquo;authentification, préférences). Nous n&rsquo;utilisons aucun
            cookie de publicité ni de traçage.
          </li>
        </ul>

        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>
            <strong>Répondre à vos demandes</strong> envoyées via le formulaire
            de contact — base légale&nbsp;: votre consentement / notre intérêt
            légitime à vous répondre.
          </li>
          <li>
            <strong>Gérer les adhésions</strong>, cotisations et la vie du club
            — base légale&nbsp;: l&rsquo;exécution du contrat
            d&rsquo;adhésion.
          </li>
          <li>
            <strong>Communiquer</strong> avec ses membres (informations,
            événements) — base légale&nbsp;: intérêt légitime ou consentement
            selon le canal.
          </li>
          <li>
            <strong>Respecter nos obligations légales et comptables</strong> —
            base légale&nbsp;: obligation légale.
          </li>
          <li>
            <strong>Assurer la sécurité</strong> du site (protection anti-robot
            lors des inscriptions) — base légale&nbsp;: intérêt légitime.
          </li>
        </ul>

        <h2>4. Destinataires et sous-traitants</h2>
        <p>
          Vos données ne sont jamais vendues. Elles sont accessibles au personnel
          habilité du club et aux prestataires techniques suivants, agissant
          comme sous-traitants encadrés par contrat&nbsp;:
        </p>
        <ul>
          <li>
            <strong>Hetzner Online GmbH</strong> — hébergement des serveurs
            (Industriestr. 25, 91710 Gunzenhausen, Allemagne&nbsp;; datacenter
            situé en Finlande, Union européenne).
          </li>
          <li>
            <strong>Brevo</strong> (Sendinblue SAS, France) — envoi des e-mails
            transactionnels (confirmation, réinitialisation de mot de passe,
            notifications).
          </li>
          <li>
            <strong>Stripe</strong> — traitement sécurisé des paiements en ligne,
            lorsque cette option est activée par le club.
          </li>
          <li>
            <strong>hCaptcha</strong> (Intuition Machines, Inc.) — protection
            anti-robot des formulaires d&rsquo;inscription.
          </li>
          <li>
            <strong>Telegram</strong> — uniquement si vous choisissez, de façon
            facultative et sur votre initiative, de relier votre compte pour
            recevoir des notifications.
          </li>
        </ul>

        <h2>5. Transferts hors de l&rsquo;Union européenne</h2>
        <p>
          Vos données sont hébergées et traitées au sein de l&rsquo;Union
          européenne. Lorsqu&rsquo;un prestataire est susceptible de traiter des
          données en dehors de l&rsquo;UE, ce transfert est encadré par les
          garanties appropriées prévues par le RGPD (clauses contractuelles
          types de la Commission européenne).
        </p>

        <h2>6. Durée de conservation</h2>
        <p>
          Les données sont conservées pour la durée nécessaire aux finalités
          décrites&nbsp;: les messages de contact sont conservés le temps de
          traiter votre demande, les données d&rsquo;adhésion pendant la durée de
          votre adhésion puis archivées conformément aux obligations légales et
          comptables (généralement jusqu&rsquo;à 5&nbsp;ans pour les pièces
          comptables). Au-delà, elles sont supprimées ou anonymisées.
        </p>

        <h2>7. Sécurité</h2>
        <p>
          Nous mettons en œuvre des mesures techniques et organisationnelles
          appropriées pour protéger vos données&nbsp;: chiffrement des échanges
          (HTTPS), contrôle des accès, hébergement dans des datacenters
          européens sécurisés, et cloisonnement des données entre clubs.
        </p>

        <h2>8. Cookies</h2>
        <p>
          Ce site n&rsquo;utilise <strong>aucun cookie publicitaire ni de
          traçage</strong>. Seuls des cookies strictement techniques sont
          déposés lorsqu&rsquo;ils sont nécessaires au fonctionnement du service
          (par exemple, la session d&rsquo;authentification dans l&rsquo;espace
          membre). Ces cookies ne requièrent pas votre consentement préalable.
        </p>

        <h2>9. Vos droits</h2>
        <p>
          Conformément au RGPD, vous disposez des droits suivants sur vos
          données&nbsp;:
        </p>
        <ul>
          <li>droit d&rsquo;<strong>accès</strong> et de copie&nbsp;;</li>
          <li>droit de <strong>rectification</strong> des données inexactes&nbsp;;</li>
          <li>
            droit à l&rsquo;<strong>effacement</strong> (« droit à
            l&rsquo;oubli »)&nbsp;;
          </li>
          <li>
            droit à la <strong>limitation</strong> et à l&rsquo;
            <strong>opposition</strong> au traitement&nbsp;;
          </li>
          <li>droit à la <strong>portabilité</strong> de vos données&nbsp;;</li>
          <li>
            droit de définir des directives relatives au sort de vos données
            après votre décès.
          </li>
        </ul>
        <p>
          Pour exercer ces droits, contactez le club
          {clubEmail ? (
            <>
              {' '}à{' '}
              <a href={`mailto:${clubEmail}`}>{clubEmail}</a>
            </>
          ) : (
            <> via la page Contact</>
          )}
          . Vous disposez également du droit d&rsquo;introduire une réclamation
          auprès de la Commission Nationale de l&rsquo;Informatique et des
          Libertés (CNIL)&nbsp;:{' '}
          <a href="https://www.cnil.fr" target="_blank" rel="noopener">
            www.cnil.fr
          </a>
          .
        </p>

        <h2>10. Modifications de cette politique</h2>
        <p>
          Cette politique de confidentialité peut être mise à jour pour refléter
          des évolutions légales ou techniques. La date de dernière mise à jour
          figure en haut de cette page. Nous vous invitons à la consulter
          régulièrement.
        </p>
      </section>

      <style>{`
        .legal {
          padding: 64px 48px 96px;
          max-width: 760px;
        }
        .legal__updated {
          font-family: var(--sans);
          font-size: 13px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .legal h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: clamp(22px, 2.4vw, 28px);
          letter-spacing: -0.01em;
          margin: 48px 0 16px;
          color: var(--fg);
        }
        .legal p,
        .legal li {
          font-family: var(--sans);
          font-size: 16px;
          line-height: 1.75;
          color: color-mix(in oklab, var(--fg) 82%, transparent);
        }
        .legal p {
          margin-bottom: 16px;
        }
        .legal ul {
          margin: 0 0 20px;
          padding-left: 22px;
        }
        .legal li {
          margin-bottom: 10px;
        }
        .legal a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .legal a:hover {
          text-decoration: none;
        }
        .legal strong {
          color: var(--fg);
          font-weight: 600;
        }
        @media (max-width: 768px) {
          .legal {
            padding: 40px 20px 64px;
          }
        }
      `}</style>
    </>
  );
}
