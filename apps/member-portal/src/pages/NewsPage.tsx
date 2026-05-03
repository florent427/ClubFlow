import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import {
  VIEWER_CLUB_ANNOUNCEMENTS,
  VIEWER_CLUB_SURVEYS,
  VIEWER_RESPOND_TO_CLUB_SURVEY,
} from '../lib/viewer-documents';
import type {
  ViewerClubAnnouncementsData,
  ViewerClubSurvey,
  ViewerClubSurveysData,
  ViewerRespondToClubSurveyData,
} from '../lib/viewer-types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function SurveyCard({
  survey,
  onSubmitted,
}: {
  survey: ViewerClubSurvey;
  onSubmitted: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    survey.viewerSelectedOptionIds,
  );
  const [respond, { loading }] = useMutation<ViewerRespondToClubSurveyData>(
    VIEWER_RESPOND_TO_CLUB_SURVEY,
  );
  const [error, setError] = useState<string | null>(null);

  const alreadyVoted = survey.viewerSelectedOptionIds.length > 0;
  const closed = survey.status === 'CLOSED';

  function toggleOption(id: string) {
    if (closed) return;
    setSelected((prev) => {
      if (survey.multipleChoice) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      }
      return [id];
    });
  }

  async function submit() {
    if (selected.length === 0) return;
    setError(null);
    try {
      await respond({
        variables: { input: { surveyId: survey.id, optionIds: selected } },
      });
      onSubmitted();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erreur lors de l’envoi',
      );
    }
  }

  const showResults = closed || alreadyVoted;
  const total = survey.totalResponses;

  return (
    <article className="mp-news-card mp-news-card--survey">
      <header className="mp-news-card__head">
        <span
          className={`mp-pill ${closed ? 'mp-pill-muted' : 'mp-pill-ok'}`}
        >
          Sondage {closed ? 'clôturé' : 'ouvert'}
        </span>
        <h3 className="mp-news-card__title">{survey.title}</h3>
      </header>
      {survey.description ? (
        <p className="mp-news-card__body">{survey.description}</p>
      ) : null}
      <ul className="mp-survey-options">
        {survey.options.map((opt) => {
          const isSelected = selected.includes(opt.id);
          const pct =
            total > 0 ? Math.round((opt.responseCount / total) * 100) : 0;
          return (
            <li key={opt.id}>
              <button
                type="button"
                disabled={closed}
                className={`mp-survey-option${
                  isSelected ? ' mp-survey-option--selected' : ''
                }${closed ? ' mp-survey-option--disabled' : ''}`}
                onClick={() => toggleOption(opt.id)}
              >
                <div className="mp-survey-option__label">
                  {survey.multipleChoice ? (
                    <span
                      className={`mp-checkbox-visual${
                        isSelected ? ' mp-checkbox-visual--on' : ''
                      }`}
                      aria-hidden
                    />
                  ) : (
                    <span
                      className={`mp-radio-visual${
                        isSelected ? ' mp-radio-visual--on' : ''
                      }`}
                      aria-hidden
                    />
                  )}
                  <span>{opt.label}</span>
                </div>
                {showResults ? (
                  <div className="mp-survey-option__meta">
                    <span className="mp-survey-option__count">
                      {opt.responseCount} · {pct}%
                    </span>
                  </div>
                ) : null}
              </button>
              {showResults ? (
                <div className="mp-survey-option__bar">
                  <div
                    className="mp-survey-option__bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <footer className="mp-news-card__foot">
        <span className="mp-news-card__meta">
          {total} réponse{total > 1 ? 's' : ''}
          {survey.closesAt
            ? ` · Clôture ${formatDate(survey.closesAt)}`
            : ''}
        </span>
        {!closed ? (
          <button
            type="button"
            className="mp-btn-primary"
            disabled={loading || selected.length === 0}
            onClick={() => void submit()}
          >
            {alreadyVoted ? 'Mettre à jour' : 'Voter'}
          </button>
        ) : null}
      </footer>
      {error ? <p className="mp-error">{error}</p> : null}
    </article>
  );
}

export function NewsPage() {
  const { data: annData, loading: annLoading } =
    useQuery<ViewerClubAnnouncementsData>(VIEWER_CLUB_ANNOUNCEMENTS, {
      fetchPolicy: 'cache-and-network',
    });
  const { data: surveysData, refetch: refetchSurveys, loading: surveysLoading } =
    useQuery<ViewerClubSurveysData>(VIEWER_CLUB_SURVEYS, {
      fetchPolicy: 'cache-and-network',
    });

  const announcements = annData?.viewerClubAnnouncements ?? [];
  const surveys = surveysData?.viewerClubSurveys ?? [];

  const isLoading = annLoading || surveysLoading;
  const isEmpty =
    !isLoading && announcements.length === 0 && surveys.length === 0;

  return (
    <section className="mp-news">
      <header className="mp-page-head">
        <h1 className="mp-page-title">Vie du club</h1>
        <p className="mp-page-subtitle">
          Annonces, sondages et actualités du club.
        </p>
      </header>

      {isEmpty ? (
        <div className="mp-empty">
          <span
            className="material-symbols-outlined mp-empty__icon"
            aria-hidden
          >
            campaign
          </span>
          <p>Rien de neuf pour l’instant.</p>
        </div>
      ) : null}

      {surveys.length > 0 ? (
        <>
          <h2 className="mp-section-title">Sondages</h2>
          <div className="mp-news-list">
            {surveys.map((s) => (
              <SurveyCard
                key={s.id}
                survey={s}
                onSubmitted={() => void refetchSurveys()}
              />
            ))}
          </div>
        </>
      ) : null}

      {announcements.length > 0 ? (
        <>
          <h2 className="mp-section-title">Annonces</h2>
          <div className="mp-news-list">
            {announcements.map((a) => (
              <article
                key={a.id}
                className={`mp-news-card${
                  a.pinned ? ' mp-news-card--pinned' : ''
                }`}
              >
                <header className="mp-news-card__head">
                  {a.pinned ? (
                    <span className="mp-pill mp-pill-warn">Épinglée</span>
                  ) : null}
                  <h3 className="mp-news-card__title">{a.title}</h3>
                </header>
                <p className="mp-news-card__body">{a.body}</p>
                <footer className="mp-news-card__foot">
                  <span className="mp-news-card__meta">
                    {formatDate(a.publishedAt)}
                  </span>
                </footer>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
