import { useQuery } from '@apollo/client/react';
import { Link } from 'react-router-dom';
import {
  MY_PROJECT_CONTRIBUTIONS,
  type MyProjectGraph,
} from '../lib/projects-documents';

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function statusLabel(s: MyProjectGraph['status']): string {
  switch (s) {
    case 'PLANNED':
      return 'Planifié';
    case 'ACTIVE':
      return 'En cours';
    case 'CLOSED':
      return 'Clos';
    case 'ARCHIVED':
      return 'Archivé';
  }
}

export function MyProjectsPage() {
  const { data, loading, error } = useQuery<{
    myProjectContributions: MyProjectGraph[];
  }>(MY_PROJECT_CONTRIBUTIONS, { fetchPolicy: 'cache-and-network' });

  const projects = data?.myProjectContributions ?? [];

  return (
    <div className="mp-page">
      <header className="mp-page__header">
        <h1>Mes projets</h1>
        <p className="mp-page__subtitle">
          Les projets sur lesquels tu es contributeur·ice. Pendant une phase
          Live, tu peux y déposer tes photos et vidéos courtes.
        </p>
      </header>

      {loading && projects.length === 0 ? (
        <p>Chargement…</p>
      ) : error ? (
        <p className="mp-error">Erreur : {error.message}</p>
      ) : projects.length === 0 ? (
        <div className="mp-empty">
          <span className="material-symbols-outlined" aria-hidden>
            rocket_launch
          </span>
          <p>
            Tu n’es inscrit·e sur aucun projet pour le moment. Un administrateur
            du club peut t’ajouter comme contributeur depuis son espace.
          </p>
        </div>
      ) : (
        <ul className="mp-projects">
          {projects.map((p) => (
            <li key={p.id} className="mp-projects__item">
              <Link to={`/mes-projets/${p.id}`}>
                <div className="mp-projects__thumb">
                  {p.coverImageUrl ? (
                    <img src={p.coverImageUrl} alt="" loading="lazy" />
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                    >
                      rocket_launch
                    </span>
                  )}
                </div>
                <div className="mp-projects__body">
                  <div className="mp-projects__head">
                    <strong>{p.title}</strong>
                    <span
                      className={`mp-badge mp-badge--${statusClass(p.status)}`}
                    >
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  {p.summary && <p>{p.summary}</p>}
                  <small>
                    {fmtDateShort(p.startsAt)}
                    {p.endsAt && ` → ${fmtDateShort(p.endsAt)}`}
                  </small>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusClass(s: MyProjectGraph['status']): string {
  switch (s) {
    case 'ACTIVE':
      return 'success';
    case 'PLANNED':
      return 'neutral';
    case 'CLOSED':
      return 'info';
    case 'ARCHIVED':
      return 'muted';
  }
}
