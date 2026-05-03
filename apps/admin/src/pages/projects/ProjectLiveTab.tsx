import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CLOSE_PROJECT_LIVE_PHASE,
  CLUB_PROJECT_LIVE_PHASES,
  CREATE_PROJECT_LIVE_PHASE,
  DECIDE_PROJECT_LIVE_ITEM,
  DELETE_PROJECT_LIVE_PHASE,
  OPEN_PROJECT_LIVE_PHASE,
  PROJECT_LIVE_ITEMS,
  PUBLISH_PROJECT_LIVE_ITEM,
  type ClubProjectGraph,
  type ProjectLiveItemGraph,
  type ProjectLiveItemHumanDecision,
  type ProjectLiveItemPublication,
  type ProjectLivePhaseGraph,
} from '../../lib/projects-documents';
import { useToast } from '../../components/ToastProvider';

function fmtShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

type FilterTab =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'AI_PENDING'
  | 'AI_REJECTED';

export function ProjectLiveTab({ project }: { project: ClubProjectGraph }) {
  const { showToast } = useToast();
  const phasesQuery = useQuery<{
    clubProjectLivePhases: ProjectLivePhaseGraph[];
  }>(CLUB_PROJECT_LIVE_PHASES, {
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
  });
  const itemsQuery = useQuery<{
    projectLiveItems: ProjectLiveItemGraph[];
  }>(PROJECT_LIVE_ITEMS, {
    variables: { projectId: project.id },
    fetchPolicy: 'cache-and-network',
    pollInterval: 10_000, // refresh léger pour voir les nouveaux uploads
  });

  const [createPhase, { loading: creatingPhase }] = useMutation(
    CREATE_PROJECT_LIVE_PHASE,
    {
      refetchQueries: [
        {
          query: CLUB_PROJECT_LIVE_PHASES,
          variables: { projectId: project.id },
        },
      ],
    },
  );
  const [openPhase] = useMutation(OPEN_PROJECT_LIVE_PHASE, {
    refetchQueries: [
      {
        query: CLUB_PROJECT_LIVE_PHASES,
        variables: { projectId: project.id },
      },
    ],
  });
  const [closePhase] = useMutation(CLOSE_PROJECT_LIVE_PHASE, {
    refetchQueries: [
      {
        query: CLUB_PROJECT_LIVE_PHASES,
        variables: { projectId: project.id },
      },
    ],
  });
  const [deletePhase] = useMutation(DELETE_PROJECT_LIVE_PHASE, {
    refetchQueries: [
      {
        query: CLUB_PROJECT_LIVE_PHASES,
        variables: { projectId: project.id },
      },
    ],
  });
  const [decide] = useMutation(DECIDE_PROJECT_LIVE_ITEM, {
    refetchQueries: [
      {
        query: PROJECT_LIVE_ITEMS,
        variables: { projectId: project.id },
      },
    ],
  });
  const [publish] = useMutation(PUBLISH_PROJECT_LIVE_ITEM, {
    refetchQueries: [
      {
        query: PROJECT_LIVE_ITEMS,
        variables: { projectId: project.id },
      },
    ],
  });

  const [showCreatePhase, setShowCreatePhase] = useState(false);
  const [phaseForm, setPhaseForm] = useState({
    label: '',
    startsAt: '',
    endsAt: '',
  });
  const [tab, setTab] = useState<FilterTab>('PENDING');

  const phases = phasesQuery.data?.clubProjectLivePhases ?? [];
  const items = itemsQuery.data?.projectLiveItems ?? [];

  const counts = useMemo(() => {
    return {
      PENDING: items.filter(
        (i) => i.humanDecision === 'PENDING' && i.aiDecision !== 'REJECTED',
      ).length,
      APPROVED: items.filter((i) => i.humanDecision === 'APPROVED').length,
      REJECTED: items.filter((i) => i.humanDecision === 'REJECTED').length,
      AI_PENDING: items.filter(
        (i) => i.aiDecision === 'PENDING' || i.aiDecision === 'ERROR',
      ).length,
      AI_REJECTED: items.filter(
        (i) => i.aiDecision === 'REJECTED' && i.humanDecision === 'PENDING',
      ).length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    switch (tab) {
      case 'PENDING':
        return items.filter(
          (i) =>
            i.humanDecision === 'PENDING' && i.aiDecision !== 'REJECTED',
        );
      case 'APPROVED':
        return items.filter((i) => i.humanDecision === 'APPROVED');
      case 'REJECTED':
        return items.filter((i) => i.humanDecision === 'REJECTED');
      case 'AI_PENDING':
        return items.filter(
          (i) => i.aiDecision === 'PENDING' || i.aiDecision === 'ERROR',
        );
      case 'AI_REJECTED':
        return items.filter(
          (i) =>
            i.aiDecision === 'REJECTED' && i.humanDecision === 'PENDING',
        );
    }
  }, [items, tab]);

  async function handleCreatePhase(e: FormEvent) {
    e.preventDefault();
    const label = phaseForm.label.trim();
    if (!label || !phaseForm.startsAt || !phaseForm.endsAt) {
      showToast('Label + début + fin sont requis.', 'error');
      return;
    }
    try {
      await createPhase({
        variables: {
          input: {
            projectId: project.id,
            label,
            startsAt: new Date(phaseForm.startsAt),
            endsAt: new Date(phaseForm.endsAt),
          },
        },
      });
      setShowCreatePhase(false);
      setPhaseForm({ label: '', startsAt: '', endsAt: '' });
      showToast('Phase créée.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la création',
        'error',
      );
    }
  }

  async function handleOpenPhase(id: string) {
    try {
      await openPhase({ variables: { id } });
      showToast('Phase ouverte. Notifications envoyées.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de l’ouverture',
        'error',
      );
    }
  }

  async function handleClosePhase(id: string) {
    try {
      await closePhase({ variables: { id } });
      showToast('Phase clôturée.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la clôture',
        'error',
      );
    }
  }

  async function handleDecide(
    itemId: string,
    decision: ProjectLiveItemHumanDecision,
  ) {
    try {
      await decide({ variables: { input: { id: itemId, decision } } });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la décision',
        'error',
      );
    }
  }

  async function handlePublish(
    itemId: string,
    target: ProjectLiveItemPublication,
  ) {
    try {
      await publish({ variables: { input: { id: itemId, target } } });
      showToast('Item marqué comme publié.', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Échec de la publication',
        'error',
      );
    }
  }

  return (
    <div className="cf-project-live">
      {/* Phases */}
      <section>
        <div className="cf-project-live__toolbar">
          <h3>Phases LIVE</h3>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={() => setShowCreatePhase((v) => !v)}
          >
            <span className="material-symbols-outlined" aria-hidden>
              add
            </span>
            Nouvelle phase
          </button>
        </div>

        {showCreatePhase && (
          <form
            onSubmit={handleCreatePhase}
            className="cf-card cf-project-live__phase-form"
          >
            <label>
              Libellé
              <input
                type="text"
                value={phaseForm.label}
                onChange={(e) =>
                  setPhaseForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="Ex. Jour J, Jour 1, Finales…"
                maxLength={100}
                autoFocus
              />
            </label>
            <div className="cf-form__row">
              <label>
                Début
                <input
                  type="datetime-local"
                  value={phaseForm.startsAt}
                  onChange={(e) =>
                    setPhaseForm((f) => ({ ...f, startsAt: e.target.value }))
                  }
                />
              </label>
              <label>
                Fin
                <input
                  type="datetime-local"
                  value={phaseForm.endsAt}
                  onChange={(e) =>
                    setPhaseForm((f) => ({ ...f, endsAt: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="cf-form__actions">
              <button
                type="button"
                className="cf-btn cf-btn--ghost"
                onClick={() => setShowCreatePhase(false)}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="cf-btn cf-btn--primary"
                disabled={creatingPhase}
              >
                Créer
              </button>
            </div>
          </form>
        )}

        {phases.length === 0 ? (
          <p className="cf-text-muted">
            Aucune phase. Crée une phase pour que tes contributeurs puissent
            uploader.
          </p>
        ) : (
          <ul className="cf-project-live__phases">
            {phases.map((ph) => (
              <li
                key={ph.id}
                className={`cf-project-live__phase cf-project-live__phase--${ph.state.toLowerCase()}`}
              >
                <div>
                  <strong>{ph.label}</strong>
                  <small>
                    {fmtShort(ph.startsAt)} → {fmtShort(ph.endsAt)}
                  </small>
                  <span
                    className={`cf-badge cf-badge--${ph.state === 'LIVE' ? 'success' : ph.state === 'CLOSED' ? 'info' : 'neutral'}`}
                  >
                    {ph.state}
                  </span>
                </div>
                <div className="cf-project-live__phase-actions">
                  {ph.state === 'UPCOMING' && (
                    <>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--primary"
                        onClick={() => handleOpenPhase(ph.id)}
                      >
                        Ouvrir
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--sm cf-btn--ghost"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Supprimer cette phase ? Les items déjà soumis resteront mais ne seront plus rattachés.',
                            )
                          ) {
                            void deletePhase({
                              variables: { id: ph.id },
                            }).catch((err) =>
                              showToast(
                                err instanceof Error
                                  ? err.message
                                  : 'Erreur',
                                'error',
                              ),
                            );
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                  {ph.state === 'LIVE' && (
                    <button
                      type="button"
                      className="cf-btn cf-btn--sm"
                      onClick={() => handleClosePhase(ph.id)}
                    >
                      Clôturer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Items modération */}
      <section>
        <h3>Modération des items</h3>
        <div className="cf-tabs">
          {(
            [
              ['PENDING', `À revoir (${counts.PENDING})`],
              ['APPROVED', `Validés (${counts.APPROVED})`],
              ['REJECTED', `Rejetés (${counts.REJECTED})`],
              ['AI_REJECTED', `IA a rejeté (${counts.AI_REJECTED})`],
              ['AI_PENDING', `IA en attente (${counts.AI_PENDING})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`cf-tab${tab === id ? ' cf-tab--active' : ''}`}
              onClick={() => setTab(id as FilterTab)}
            >
              {label}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <p className="cf-text-muted">Aucun item dans cette catégorie.</p>
        ) : (
          <ul className="cf-project-live__items">
            {filteredItems.map((i) => (
              <LiveItemCard
                key={i.id}
                item={i}
                onDecide={(d) => handleDecide(i.id, d)}
                onPublish={(t) => handlePublish(i.id, t)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LiveItemCard({
  item,
  onDecide,
  onPublish,
}: {
  item: ProjectLiveItemGraph;
  onDecide: (d: ProjectLiveItemHumanDecision) => void;
  onPublish: (target: ProjectLiveItemPublication) => void;
}) {
  const [publishing, setPublishing] = useState(false);
  return (
    <li className="cf-project-live__item">
      <div className="cf-project-live__item-media">
        {item.kind === 'TEXT' ? (
          <div className="cf-project-live__item-text">
            <span
              className="material-symbols-outlined cf-project-live__item-text-icon"
              aria-hidden
            >
              format_quote
            </span>
            <blockquote>
              {item.textContent ?? <em>(texte vide)</em>}
            </blockquote>
          </div>
        ) : item.mediaAsset?.publicUrl &&
          item.mediaAsset.mimeType.startsWith('image/') ? (
          <img
            src={item.mediaAsset.publicUrl}
            alt=""
            loading="lazy"
            onClick={() =>
              window.open(item.mediaAsset?.publicUrl ?? '', '_blank')
            }
            style={{ cursor: 'zoom-in' }}
          />
        ) : item.mediaAsset?.publicUrl ? (
          <video
            src={item.mediaAsset.publicUrl}
            controls
            preload="metadata"
          />
        ) : (
          <div className="cf-project-live__item-placeholder">
            <span className="material-symbols-outlined" aria-hidden>
              broken_image
            </span>
          </div>
        )}
      </div>
      <div className="cf-project-live__item-body">
        <div className="cf-project-live__item-meta">
          <span
            className={`cf-badge cf-badge--${
              item.kind === 'PHOTO'
                ? 'info'
                : item.kind === 'TEXT'
                  ? 'success'
                  : 'neutral'
            }`}
          >
            {item.kind}
          </span>
          {!item.submittedDuringLive && (
            <span className="cf-badge cf-badge--warning">Ajout tardif</span>
          )}
          <small>{fmtShort(item.submittedAt)}</small>
        </div>

        <div className="cf-project-live__item-decisions">
          <span>
            <strong>IA :</strong>{' '}
            <span
              className={`cf-badge cf-badge--${aiColor(item.aiDecision)}`}
            >
              {item.aiDecision}
            </span>
            {item.aiReason && <em> — {item.aiReason}</em>}
            {item.aiScore != null && (
              <small> (score {item.aiScore.toFixed(2)})</small>
            )}
          </span>
          <span>
            <strong>Humain :</strong>{' '}
            <span
              className={`cf-badge cf-badge--${humanColor(item.humanDecision)}`}
            >
              {item.humanDecision}
            </span>
          </span>
          <span>
            <strong>Publication :</strong>{' '}
            <span className="cf-badge cf-badge--neutral">
              {item.publishedTo}
            </span>
          </span>
        </div>

        <div className="cf-project-live__item-actions">
          {item.humanDecision !== 'APPROVED' && (
            <button
              type="button"
              className="cf-btn cf-btn--sm cf-btn--success"
              onClick={() => onDecide('APPROVED')}
            >
              Valider
            </button>
          )}
          {item.humanDecision !== 'REJECTED' && (
            <button
              type="button"
              className="cf-btn cf-btn--sm cf-btn--danger cf-btn--ghost"
              onClick={() => onDecide('REJECTED')}
            >
              Rejeter
            </button>
          )}
          {item.humanDecision === 'APPROVED' &&
            item.publishedTo === 'NONE' && (
              <>
                <button
                  type="button"
                  className="cf-btn cf-btn--sm"
                  disabled={publishing}
                  onClick={() => {
                    setPublishing(true);
                    onPublish('VITRINE_NEWS');
                    setPublishing(false);
                  }}
                >
                  Publier → Actus
                </button>
                <button
                  type="button"
                  className="cf-btn cf-btn--sm"
                  disabled={publishing}
                  onClick={() => {
                    setPublishing(true);
                    onPublish('MEMBER_ANNOUNCEMENT');
                    setPublishing(false);
                  }}
                >
                  Publier → Annonce membre
                </button>
              </>
            )}
        </div>
      </div>
    </li>
  );
}

function aiColor(d: ProjectLiveItemGraph['aiDecision']): string {
  if (d === 'APPROVED') return 'success';
  if (d === 'REJECTED') return 'danger';
  if (d === 'ERROR') return 'warning';
  return 'neutral';
}
function humanColor(d: ProjectLiveItemGraph['humanDecision']): string {
  if (d === 'APPROVED') return 'success';
  if (d === 'REJECTED') return 'danger';
  return 'warning';
}
