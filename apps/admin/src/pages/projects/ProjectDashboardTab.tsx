import { useQuery } from '@apollo/client/react';
import {
  CLUB_PROJECT_LIVE_PHASES,
  PROJECT_CONTRIBUTORS,
  PROJECT_LIVE_ITEMS,
  type ClubProjectGraph,
  type ProjectContributorGraph,
  type ProjectLiveItemGraph,
  type ProjectLivePhaseGraph,
} from '../../lib/projects-documents';

function fmtEuro(cents: number | null): string {
  if (cents == null) return '—';
  return `${(cents / 100).toFixed(0)} €`;
}

export function ProjectDashboardTab({
  project,
}: {
  project: ClubProjectGraph;
}) {
  const { data: phasesData } = useQuery<{
    clubProjectLivePhases: ProjectLivePhaseGraph[];
  }>(CLUB_PROJECT_LIVE_PHASES, {
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
  });
  const { data: contribData } = useQuery<{
    projectContributors: ProjectContributorGraph[];
  }>(PROJECT_CONTRIBUTORS, {
    variables: { projectId: project.id, includeRevoked: false },
    fetchPolicy: 'cache-and-network',
  });
  const { data: itemsData } = useQuery<{
    projectLiveItems: ProjectLiveItemGraph[];
  }>(PROJECT_LIVE_ITEMS, {
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
  });

  const phases = phasesData?.clubProjectLivePhases ?? [];
  const contributors = contribData?.projectContributors ?? [];
  const items = itemsData?.projectLiveItems ?? [];

  const activePhase = phases.find((p) => p.state === 'LIVE');
  const approved = items.filter((i) => i.humanDecision === 'APPROVED').length;
  const pending = items.filter((i) => i.humanDecision === 'PENDING').length;

  return (
    <div className="cf-project-dashboard">
      <div className="cf-kpi-grid">
        <div className="cf-kpi">
          <span className="cf-kpi__label">Contributeurs actifs</span>
          <span className="cf-kpi__value">{contributors.length}</span>
        </div>
        <div className="cf-kpi">
          <span className="cf-kpi__label">Items validés</span>
          <span className="cf-kpi__value">{approved}</span>
        </div>
        <div className="cf-kpi">
          <span className="cf-kpi__label">Items en attente</span>
          <span className="cf-kpi__value">{pending}</span>
        </div>
        <div className="cf-kpi">
          <span className="cf-kpi__label">Budget prévisionnel</span>
          <span className="cf-kpi__value">
            {fmtEuro(project.budgetPlannedCents)}
          </span>
        </div>
      </div>

      {activePhase ? (
        <div className="cf-card cf-project-dashboard__phase">
          <h3>
            <span className="material-symbols-outlined" aria-hidden>
              sensors
            </span>
            Phase LIVE en cours
          </h3>
          <p>
            <strong>{activePhase.label}</strong> — jusqu’au{' '}
            {new Date(activePhase.endsAt).toLocaleString('fr-FR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
          <p className="cf-text-muted">
            Les contributeurs peuvent uploader des photos et vidéos dans leur
            espace personnel. Quota par contributeur :{' '}
            {project.maxPhotosPerContributorPerPhase} photos +{' '}
            {project.maxVideosPerContributorPerPhase} vidéos par phase.
          </p>
        </div>
      ) : (
        <div className="cf-card cf-project-dashboard__phase cf-project-dashboard__phase--idle">
          <h3>
            <span className="material-symbols-outlined" aria-hidden>
              radio_button_unchecked
            </span>
            Aucune phase LIVE active
          </h3>
          <p className="cf-text-muted">
            Rendez-vous dans l’onglet <strong>Live</strong> pour créer et
            ouvrir une phase quand l’événement démarre.
          </p>
        </div>
      )}

      <div className="cf-card">
        <h3>Derniers items reçus</h3>
        {items.length === 0 ? (
          <p className="cf-text-muted">
            Aucun item n’a encore été soumis sur ce projet.
          </p>
        ) : (
          <ul className="cf-project-dashboard__recent">
            {items.slice(0, 6).map((i) => (
              <li key={i.id}>
                {i.mediaAsset?.publicUrl &&
                i.mediaAsset.mimeType.startsWith('image/') ? (
                  <img src={i.mediaAsset.publicUrl} alt="" loading="lazy" />
                ) : (
                  <div className="cf-project-dashboard__recent-icon">
                    <span className="material-symbols-outlined" aria-hidden>
                      {i.kind === 'VIDEO' ? 'videocam' : 'image'}
                    </span>
                  </div>
                )}
                <div>
                  <span
                    className={`cf-badge cf-badge--${decisionColor(i.humanDecision)}`}
                  >
                    {decisionLabel(i.humanDecision)}
                  </span>
                  <small>
                    {new Date(i.submittedAt).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function decisionLabel(
  d: ProjectLiveItemGraph['humanDecision'],
): string {
  if (d === 'APPROVED') return 'Validé';
  if (d === 'REJECTED') return 'Rejeté';
  return 'En attente';
}

function decisionColor(
  d: ProjectLiveItemGraph['humanDecision'],
): string {
  if (d === 'APPROVED') return 'success';
  if (d === 'REJECTED') return 'danger';
  return 'warning';
}
