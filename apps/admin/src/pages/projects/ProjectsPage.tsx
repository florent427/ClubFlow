import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLUB_PROJECTS,
  CREATE_CLUB_PROJECT,
  DELETE_CLUB_PROJECT,
  type ClubProjectGraph,
  type ProjectStatus,
} from '../../lib/projects-documents';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, EmptyState } from '../../components/ui';
import { ProjectDetailPanel } from './ProjectDetailPanel';

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

function statusLabel(s: ProjectStatus): string {
  switch (s) {
    case 'PLANNED':
      return 'Planifié';
    case 'ACTIVE':
      return 'En cours';
    case 'CLOSED':
      return 'Clos';
    case 'ARCHIVED':
      return 'Archivé';
    default:
      return s;
  }
}

function statusClass(s: ProjectStatus): string {
  switch (s) {
    case 'PLANNED':
      return 'cf-badge cf-badge--neutral';
    case 'ACTIVE':
      return 'cf-badge cf-badge--success';
    case 'CLOSED':
      return 'cf-badge cf-badge--info';
    case 'ARCHIVED':
      return 'cf-badge cf-badge--muted';
    default:
      return 'cf-badge';
  }
}

function fromLocalInputDate(v: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export function ProjectsPage() {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useQuery<{
    clubProjects: ClubProjectGraph[];
  }>(CLUB_PROJECTS, { fetchPolicy: 'cache-and-network' });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'ALL'>(
    'ALL',
  );
  const [deleteTarget, setDeleteTarget] = useState<ClubProjectGraph | null>(
    null,
  );

  const projects = data?.clubProjects ?? [];
  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return projects;
    return projects.filter((p) => p.status === statusFilter);
  }, [projects, statusFilter]);

  // Si un projet sélectionné a disparu (supprimé), on désélectionne.
  const selected = selectedId
    ? (projects.find((p) => p.id === selectedId) ?? null)
    : null;

  const [createForm, setCreateForm] = useState({
    title: '',
    summary: '',
    startsAt: '',
    endsAt: '',
  });
  const [createProject, { loading: creating }] = useMutation(
    CREATE_CLUB_PROJECT,
    { refetchQueries: [{ query: CLUB_PROJECTS }] },
  );
  const [deleteProject] = useMutation(DELETE_CLUB_PROJECT, {
    refetchQueries: [{ query: CLUB_PROJECTS }],
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const title = createForm.title.trim();
    if (!title) {
      showToast('Le titre est requis.', 'error');
      return;
    }
    try {
      const result = await createProject({
        variables: {
          input: {
            title,
            summary: createForm.summary.trim() || null,
            startsAt: fromLocalInputDate(createForm.startsAt),
            endsAt: fromLocalInputDate(createForm.endsAt),
          },
        },
      });
      const created = (result.data as { createClubProject: ClubProjectGraph })
        .createClubProject;
      setSelectedId(created.id);
      setShowCreate(false);
      setCreateForm({ title: '', summary: '', startsAt: '', endsAt: '' });
      showToast('Projet créé.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la création',
        'error',
      );
    }
  }

  async function handleDelete(project: ClubProjectGraph) {
    try {
      await deleteProject({ variables: { id: project.id } });
      if (selectedId === project.id) setSelectedId(null);
      showToast('Projet supprimé.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la suppression',
        'error',
      );
    }
  }

  if (error) {
    return (
      <div className="cf-page">
        <h1>Projets</h1>
        <p className="cf-error">Erreur : {error.message}</p>
      </div>
    );
  }

  return (
    <div className="cf-page cf-projects">
      <header className="cf-page__header">
        <div>
          <h1>Événements / Projets</h1>
          <p className="cf-page__subtitle">
            Gala, stage, subvention, compétition régionale — pilote un projet
            de A à Z avec contributeurs, phases Live, comptes-rendus IA.
          </p>
        </div>
        <div className="cf-page__actions">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ProjectStatus | 'ALL')
            }
            className="cf-select"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="PLANNED">Planifiés</option>
            <option value="ACTIVE">En cours</option>
            <option value="CLOSED">Clos</option>
            <option value="ARCHIVED">Archivés</option>
          </select>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              add
            </span>
            Nouveau projet
          </button>
        </div>
      </header>

      {showCreate && (
        <form
          className="cf-card cf-projects__create-form"
          onSubmit={handleCreate}
        >
          <h2>Nouveau projet</h2>
          <label>
            Titre *
            <input
              type="text"
              value={createForm.title}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, title: e.target.value }))
              }
              required
              maxLength={200}
              autoFocus
            />
          </label>
          <label>
            Pitch (optionnel, 1 ligne)
            <input
              type="text"
              value={createForm.summary}
              onChange={(e) =>
                setCreateForm((f) => ({ ...f, summary: e.target.value }))
              }
              maxLength={500}
            />
          </label>
          <div className="cf-form__row">
            <label>
              Début
              <input
                type="date"
                value={createForm.startsAt}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, startsAt: e.target.value }))
                }
              />
            </label>
            <label>
              Fin
              <input
                type="date"
                value={createForm.endsAt}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, endsAt: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="cf-form__actions">
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => setShowCreate(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating}
            >
              {creating ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      <div className="cf-projects__layout">
        <aside className="cf-projects__list" aria-label="Liste des projets">
          {loading && projects.length === 0 ? (
            <p>Chargement…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="rocket_launch"
              title="Aucun projet"
              message={
                statusFilter === 'ALL'
                  ? 'Crée ton premier projet pour démarrer.'
                  : 'Aucun projet dans ce statut.'
              }
            />
          ) : (
            <ul>
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`cf-projects__list-item${
                      selectedId === p.id
                        ? ' cf-projects__list-item--active'
                        : ''
                    }`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <div className="cf-projects__list-item-thumb">
                      {p.coverImageUrl ? (
                        <img
                          src={p.coverImageUrl}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="material-symbols-outlined"
                          aria-hidden
                        >
                          rocket_launch
                        </span>
                      )}
                    </div>
                    <div className="cf-projects__list-item-content">
                      <div className="cf-projects__list-item-head">
                        <strong>{p.title}</strong>
                        <span className={statusClass(p.status)}>
                          {statusLabel(p.status)}
                        </span>
                      </div>
                      {p.summary && (
                        <p className="cf-projects__list-item-summary">
                          {p.summary}
                        </p>
                      )}
                      <div className="cf-projects__list-item-meta">
                        <span>
                          <span
                            className="material-symbols-outlined"
                            aria-hidden
                          >
                            event
                          </span>
                          {fmtDateShort(p.startsAt)}
                          {p.endsAt && ` → ${fmtDateShort(p.endsAt)}`}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="cf-projects__detail">
          {selected ? (
            <ProjectDetailPanel
              project={selected}
              onDelete={() => setDeleteTarget(selected)}
              onRefresh={() => void refetch()}
            />
          ) : (
            <div className="cf-empty-detail">
              <span className="material-symbols-outlined" aria-hidden>
                description
              </span>
              <p>Sélectionne un projet à gauche pour voir son détail.</p>
            </div>
          )}
        </section>
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Supprimer ce projet ?"
        message={
          deleteTarget
            ? `Le projet « ${deleteTarget.title} » sera supprimé avec toutes ses sections, phases, contributeurs, items live et rapports. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Supprimer"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}
