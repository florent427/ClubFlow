import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Fragment, type ReactElement } from 'react';
import { resolveCurrentClub } from '@/lib/club-resolution';
import {
  fetchPublicEvent,
  type PublicClubEvent,
} from '@/lib/public-events';
import { PageHero } from '@/blocks/PageHero';
import { RegistrationForm } from '@/components/events/RegistrationForm';

// Fuseau d'affichage des horaires — les dates sont stockées en UTC ;
// sans timeZone explicite, le SSR (serveur UTC) affichait 05:00 au lieu
// de 09:00 (bug QA JPO). TODO Phase 2 : champ timezone par club.
const VITRINE_TZ = process.env.VITRINE_TZ ?? 'Indian/Reunion';

interface RouteParams {
  params: Promise<{ host: string; editFlag: string; slug: string }>;
}

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { host, slug } = await params;
  try {
    const club = await resolveCurrentClub(host);
    const event = await fetchPublicEvent(club.slug, slug);
    if (!event) return { title: 'Événement introuvable' };
    return {
      title: event.title,
      description: event.publicHeadline ?? undefined,
      openGraph: {
        title: event.title,
        description: event.publicHeadline ?? undefined,
        type: 'website',
        siteName: club.name,
        ...(event.coverImageUrl ? { images: [event.coverImageUrl] } : {}),
      },
    };
  } catch {
    return { title: 'Événement introuvable' };
  }
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', {
    timeZone: VITRINE_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('fr-FR', {
    timeZone: VITRINE_TZ,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} à ${time}`;
}

function formatPrice(cents: number): string {
  const euros = (cents / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${euros} €`;
}

function formatSpots(remaining: number): string {
  return remaining === 1 ? '1 place restante' : `${remaining} places restantes`;
}

/** Rendu texte libre : \n\n → paragraphes, \n simple → <br/>. */
function renderParagraphs(text: string): ReactElement[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => (
      <p key={i}>
        {block.split('\n').map((line, j, lines) => (
          <Fragment key={j}>
            {line}
            {j < lines.length - 1 ? <br /> : null}
          </Fragment>
        ))}
      </p>
    ));
}

/**
 * Landing publique d'un événement (JPO, stage…) : présentation,
 * programme en timeline, et formulaire d'inscription visiteur.
 */
export default async function EvenementDetailPage({ params }: RouteParams) {
  const { host, slug } = await params;
  const club = await resolveCurrentClub(host);
  const event = await fetchPublicEvent(club.slug, slug);
  if (!event) notFound();

  const eyebrow = event.location
    ? `${formatEventDate(event.startsAt)} — ${event.location}`
    : formatEventDate(event.startsAt);
  const bookableSlots = event.programItems
    .filter((item) => item.bookable)
    .map((item) => ({
      id: item.id,
      timeLabel: item.timeLabel,
      title: item.title,
      remainingSpots: item.remainingSpots,
    }));

  return (
    <article>
      <PageHero
        label={eyebrow}
        kanji="祭"
        title={event.title}
        subtitle={event.publicHeadline ?? undefined}
      />

      {event.coverImageUrl ? (
        <div className="container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="evt-detail__cover"
            src={event.coverImageUrl}
            alt={event.title}
            loading="eager"
          />
        </div>
      ) : null}

      <section className="container evt-detail">
        {event.publicDescription ? (
          <div className="evt-detail__intro">
            {renderParagraphs(event.publicDescription)}
          </div>
        ) : null}
        <p className="evt-detail__price">
          {event.priceCents && event.priceCents > 0 ? (
            <>
              Participation&nbsp;:{' '}
              <strong>{formatPrice(event.priceCents)}</strong>
            </>
          ) : (
            <strong>Gratuit</strong>
          )}
        </p>

        {event.programItems.length > 0 ? (
          <ProgramTimeline event={event} />
        ) : null}

        <div className="evt-detail__register" id="inscription">
          <h2>Inscription</h2>
          <RegistrationForm
            eventSlug={event.publicSlug}
            ctaLabel={event.publicCtaLabel}
            registrationOpen={event.registrationOpen}
            slots={bookableSlots}
          />
        </div>

        <nav className="evt-detail__back">
          <a href="/evenements">← Retour aux événements</a>
        </nav>
      </section>

      <style>{`
        .evt-detail__cover {
          display: block;
          width: 100%;
          max-width: 820px;
          /* aspect-ratio réserve la hauteur dès le layout (avant décodage
             de l'image) → pas de layout-shift/CLS sur connexion lente. */
          aspect-ratio: 820 / 380;
          height: auto;
          margin: 40px auto 0;
          object-fit: cover;
          border: 1px solid var(--line);
          border-radius: 4px;
        }
        .evt-detail {
          padding: 64px 48px 96px;
          max-width: 820px;
        }
        .evt-detail__intro p {
          font-family: var(--sans);
          font-size: 17px;
          line-height: 1.8;
          color: color-mix(in oklab, var(--fg) 82%, transparent);
          margin-bottom: 18px;
        }
        .evt-detail__price {
          font-family: var(--serif);
          font-style: italic;
          font-size: 18px;
          color: var(--muted);
          margin: 28px 0 0;
          padding-top: 20px;
          border-top: 1px solid var(--line);
        }
        .evt-detail__price strong {
          color: var(--accent);
          font-weight: 600;
          font-style: normal;
        }
        .evt-detail h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: clamp(24px, 2.6vw, 32px);
          letter-spacing: -0.01em;
          margin: 64px 0 28px;
          color: var(--fg);
          position: relative;
          padding-top: 0.4em;
        }
        .evt-detail h2::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 44px;
          height: 1px;
          background: var(--accent);
        }

        /* ---- Timeline programme ---- */
        .evt-timeline {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .evt-timeline__item {
          display: grid;
          grid-template-columns: 130px 1fr;
          gap: 24px;
          position: relative;
          padding: 0 0 32px 0;
        }
        .evt-timeline__item::before {
          content: '';
          position: absolute;
          left: 130px;
          top: 8px;
          bottom: 0;
          width: 1px;
          background: var(--line);
          transform: translateX(11px);
        }
        .evt-timeline__item:last-child::before {
          display: none;
        }
        .evt-timeline__time {
          font-family: var(--serif);
          font-style: italic;
          font-size: 16px;
          color: var(--accent);
          text-align: right;
          padding-top: 2px;
        }
        .evt-timeline__body {
          position: relative;
          padding-left: 24px;
        }
        .evt-timeline__body::before {
          content: '';
          position: absolute;
          left: 8px;
          top: 8px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
        }
        .evt-timeline__body h3 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 21px;
          margin: 0 0 6px;
          color: var(--fg);
        }
        .evt-timeline__body p {
          font-size: 15px;
          line-height: 1.7;
          color: var(--muted);
          margin: 0 0 10px;
        }
        .evt-timeline__meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .evt-timeline__badge {
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
          border: 1px solid var(--line-strong);
          padding: 3px 9px;
        }
        .evt-timeline__spots {
          font-size: 13px;
          color: var(--muted);
        }
        .evt-timeline__full {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--vermillion);
        }

        .evt-detail__back {
          margin-top: 56px;
        }
        .evt-detail__back a {
          font-family: var(--serif);
          font-style: italic;
          color: var(--accent);
          font-size: 15px;
        }

        @media (max-width: 640px) {
          .evt-detail {
            padding: 40px 20px 64px;
          }
          .evt-timeline__item {
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .evt-timeline__item::before {
            display: none;
          }
          .evt-timeline__time {
            text-align: left;
            padding-left: 24px;
          }
          .evt-timeline__item {
            padding-bottom: 26px;
          }
        }
      `}</style>
    </article>
  );
}

function ProgramTimeline({ event }: { event: PublicClubEvent }) {
  return (
    <div className="evt-detail__program">
      <h2>Programme</h2>
      <ol className="evt-timeline">
        {event.programItems.map((item) => (
          <li key={item.id} className="evt-timeline__item">
            <div className="evt-timeline__time">{item.timeLabel}</div>
            <div className="evt-timeline__body">
              <h3>{item.title}</h3>
              {item.description ? <p>{item.description}</p> : null}
              {item.bookable ? (
                <div className="evt-timeline__meta">
                  <span className="evt-timeline__badge">Sur inscription</span>
                  {item.remainingSpots === 0 ? (
                    <span className="evt-timeline__full">Complet</span>
                  ) : item.remainingSpots !== null ? (
                    <span className="evt-timeline__spots">
                      {formatSpots(item.remainingSpots)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
