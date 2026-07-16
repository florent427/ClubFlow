import type { Metadata } from 'next';
import Link from 'next/link';
import { resolveCurrentClub } from '@/lib/club-resolution';
import {
  fetchPublicEvents,
  type PublicClubEvent,
} from '@/lib/public-events';
import { PageHero } from '@/blocks/PageHero';
import { buildPageMetadata } from '@/lib/seo';

// Fuseau d'affichage des horaires — les dates sont stockées en UTC ;
// sans timeZone explicite, le SSR (serveur UTC) affichait 05:00 au lieu
// de 09:00 (bug QA JPO). TODO Phase 2 : champ timezone par club.
const VITRINE_TZ = process.env.VITRINE_TZ ?? 'Indian/Reunion';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata({
    pageSlug: 'evenements',
    fallbackTitle: 'Événements',
    fallbackDescription:
      'Journées portes ouvertes, stages et événements publics du club.',
  });
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

/**
 * Page publique des événements (JPO, stages, tournois ouverts…).
 *
 * Liste les événements marqués `isPublic` par le club, à venir. Chaque
 * carte pointe vers sa landing d'inscription `/evenements/[slug]`.
 */
export default async function EvenementsPage() {
  const club = await resolveCurrentClub();
  const events = await fetchPublicEvents(club.slug);

  return (
    <article>
      <PageHero
        label="Événements"
        kanji="祭"
        title="Nos"
        titleEm="événements"
        subtitle="Portes ouvertes, stages et rendez-vous ouverts à tous."
      />

      <section className="section">
        <div className="container">
          {events.length === 0 ? (
            <p
              className="muted"
              style={{ textAlign: 'center', padding: '48px 0' }}
            >
              Aucun événement public à venir — revenez bientôt&nbsp;!
            </p>
          ) : (
            <div className="evt-grid">
              {events.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          )}
        </div>
      </section>

      <style>{`
        .evt-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 28px;
        }
        .evt-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 26px 24px 24px;
          background: var(--ink-2);
          border: 1px solid var(--line);
          border-radius: 4px;
          color: var(--fg);
          transition: border-color 0.2s, transform 0.2s;
        }
        .evt-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
        }
        .evt-card__date {
          font-family: var(--serif);
          font-style: italic;
          font-size: 13px;
          color: var(--accent);
          letter-spacing: 0.04em;
        }
        .evt-card__title {
          font-family: var(--serif);
          font-size: 24px;
          font-weight: 400;
          line-height: 1.25;
          margin: 0;
          color: var(--fg);
        }
        .evt-card__headline {
          font-size: 14px;
          line-height: 1.6;
          color: var(--muted);
          margin: 0;
          flex: 1;
        }
        .evt-card__location {
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .evt-card__badge {
          align-self: flex-start;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--vermillion);
          border: 1px solid var(--vermillion);
          padding: 4px 10px;
        }
        .evt-card__cta {
          font-family: var(--serif);
          font-style: italic;
          color: var(--accent);
          font-size: 14px;
          align-self: flex-start;
          transition: letter-spacing 0.2s;
        }
        .evt-card:hover .evt-card__cta {
          letter-spacing: 0.05em;
        }
      `}</style>
    </article>
  );
}

function EventCard({ event }: { event: PublicClubEvent }) {
  const full = event.remainingSpots === 0;
  return (
    <Link href={`/evenements/${event.publicSlug}`} className="evt-card">
      <div className="evt-card__date">{formatEventDate(event.startsAt)}</div>
      <h3 className="evt-card__title">{event.title}</h3>
      {event.publicHeadline ? (
        <p className="evt-card__headline">{event.publicHeadline}</p>
      ) : null}
      {event.location ? (
        <div className="evt-card__location">{event.location}</div>
      ) : null}
      {full ? (
        <span className="evt-card__badge">Complet</span>
      ) : (
        <span className="evt-card__cta">Découvrir &amp; s’inscrire →</span>
      )}
    </Link>
  );
}
