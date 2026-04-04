import { useQuery } from '@apollo/client/react';
import { Navigate } from 'react-router-dom';
import { VIEWER_ME } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';

/**
 * Recommandation UX #12 — Enrichissement de la page Progression
 * Affiche le grade actuel avec une représentation visuelle de la
 * hiérarchie des grades (timeline) et des informations utiles plutôt
 * qu'un simple placeholder "Bientôt disponible".
 */

const GRADE_HIERARCHY = [
  { label: 'Ceinture blanche', color: '#ffffff', border: '#ccc' },
  { label: 'Ceinture jaune', color: '#fdd835', border: '#f9a825' },
  { label: 'Ceinture orange', color: '#ff9800', border: '#e65100' },
  { label: 'Ceinture verte', color: '#4caf50', border: '#2e7d32' },
  { label: 'Ceinture bleue', color: '#2196f3', border: '#1565c0' },
  { label: 'Ceinture marron', color: '#795548', border: '#4e342e' },
  { label: 'Ceinture noire 1er Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 2e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 3e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 4e Dan', color: '#212121', border: '#000' },
  { label: 'Ceinture noire 5e Dan', color: '#212121', border: '#000' },
];

function findGradeIndex(gradeLabel: string | null | undefined): number {
  if (!gradeLabel) return -1;
  const lower = gradeLabel.toLowerCase();
  return GRADE_HIERARCHY.findIndex((g) => lower.includes(g.label.toLowerCase().replace('ceinture ', '')));
}

export function ProgressionPage() {
  const { data, loading } = useQuery<ViewerMeData>(VIEWER_ME, {
    fetchPolicy: 'cache-first',
  });

  const me = data?.viewerMe;

  if (loading) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Ma progression</h1>
        <p className="mp-hint">Chargement…</p>
      </div>
    );
  }
  if (me?.hideMemberModules === true) {
    return <Navigate to="/" replace />;
  }

  const currentGradeLabel = me?.gradeLevelLabel ?? null;
  const currentIndex = findGradeIndex(currentGradeLabel);

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Ma progression</h1>
      <p className="mp-lead">
        Votre parcours au sein du club. Les jalons et ressources pédagogiques
        seront enrichis progressivement.
      </p>

      <div className="mp-progression-current">
        <div className="mp-progression-badge">
          <span
            className="mp-progression-belt"
            style={{
              background: currentIndex >= 0 ? GRADE_HIERARCHY[currentIndex].color : '#e0e0e0',
              borderColor: currentIndex >= 0 ? GRADE_HIERARCHY[currentIndex].border : '#bbb',
            }}
          />
          <div>
            <h2 className="mp-progression-grade">
              {currentGradeLabel ?? 'Niveau à confirmer'}
            </h2>
            <p className="mp-hint">
              Votre grade actuel tel que renseigné par le club.
            </p>
          </div>
        </div>
      </div>

      <h3 className="mp-subtitle" style={{ marginTop: '1.5rem' }}>
        Hiérarchie des grades
      </h3>
      <div className="mp-timeline">
        {GRADE_HIERARCHY.map((grade, i) => {
          const isPast = currentIndex >= 0 && i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = currentIndex >= 0 && i > currentIndex;
          const unknownCurrent = currentIndex < 0;

          let statusClass = '';
          if (isCurrent) statusClass = 'mp-timeline-item-active';
          else if (isPast) statusClass = 'mp-timeline-item-done';
          else if (isFuture) statusClass = 'mp-timeline-item-future';
          else if (unknownCurrent) statusClass = 'mp-timeline-item-future';

          return (
            <div key={grade.label} className={`mp-timeline-item ${statusClass}`}>
              <span
                className="mp-timeline-belt-dot"
                style={{
                  background: grade.color,
                  borderColor: grade.border,
                }}
              />
              <div>
                <h2 className="mp-timeline-title">{grade.label}</h2>
                {isCurrent ? (
                  <p className="mp-hint mp-timeline-current-label">
                    Votre grade actuel
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
