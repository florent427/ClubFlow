import { useState } from 'react';
import type { ClubProjectGraph } from '../../lib/projects-documents';
import { ProjectDashboardTab } from './ProjectDashboardTab';
import { ProjectContributorsTab } from './ProjectContributorsTab';
import { ProjectLiveTab } from './ProjectLiveTab';
import { ProjectReportsTab } from './ProjectReportsTab';
import { ProjectSectionsTab } from './ProjectSectionsTab';
import { ProjectSettingsTab } from './ProjectSettingsTab';

type Tab =
  | 'dashboard'
  | 'sections'
  | 'contributors'
  | 'live'
  | 'reports'
  | 'settings';

export function ProjectDetailPanel({
  project,
  onDelete,
  onRefresh,
}: {
  project: ClubProjectGraph;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="cf-project-detail">
      {project.coverImageUrl && (
        <div className="cf-project-detail__cover">
          <img
            src={project.coverImageUrl}
            alt={`Miniature ${project.title}`}
          />
        </div>
      )}
      <header className="cf-project-detail__header">
        <div>
          <h2>{project.title}</h2>
          {project.summary && (
            <p className="cf-project-detail__summary">{project.summary}</p>
          )}
        </div>
        <button
          type="button"
          className="cf-btn cf-btn--danger cf-btn--ghost"
          onClick={onDelete}
          title="Supprimer le projet"
        >
          <span className="material-symbols-outlined" aria-hidden>
            delete
          </span>
        </button>
      </header>

      <nav className="cf-project-detail__tabs" role="tablist">
        {(
          [
            ['dashboard', 'Tableau de bord', 'dashboard'],
            ['sections', 'Sections', 'view_agenda'],
            ['contributors', 'Contributeurs', 'group'],
            ['live', 'Live', 'photo_camera'],
            ['reports', 'Comptes-rendus', 'description'],
            ['settings', 'Paramètres', 'settings'],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`cf-project-detail__tab${
              tab === id ? ' cf-project-detail__tab--active' : ''
            }`}
            onClick={() => setTab(id)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <div className="cf-project-detail__body">
        {tab === 'dashboard' && <ProjectDashboardTab project={project} />}
        {tab === 'sections' && <ProjectSectionsTab project={project} />}
        {tab === 'contributors' && (
          <ProjectContributorsTab project={project} />
        )}
        {tab === 'live' && <ProjectLiveTab project={project} />}
        {tab === 'reports' && <ProjectReportsTab project={project} />}
        {tab === 'settings' && (
          <ProjectSettingsTab project={project} onChange={onRefresh} />
        )}
      </div>
    </div>
  );
}
