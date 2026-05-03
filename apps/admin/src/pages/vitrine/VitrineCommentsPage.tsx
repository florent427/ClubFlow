import { useMutation, useQuery } from '@apollo/client/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLUB_VITRINE_COMMENTS,
  DELETE_VITRINE_COMMENT,
  GENERATE_VITRINE_COMMENT_REPLY,
  SET_VITRINE_COMMENT_REPLY,
  SET_VITRINE_COMMENT_STATUS,
  type AdminVitrineComment,
  type ClubVitrineCommentsData,
  type VitrineCommentStatus,
} from '../../lib/vitrine-documents';
import { useToast } from '../../components/ToastProvider';

type FilterStatus = VitrineCommentStatus | 'ALL';

/**
 * Modération des commentaires vitrine.
 *
 * Les commentaires arrivent en PENDING, sont triés par IA en background :
 *   - APPROVED → visibles sur le site
 *   - NEEDS_REVIEW → admin doit trancher (onglet principal par défaut)
 *   - REJECTED → non visibles
 *   - SPAM → non visibles + score IA bas
 *
 * Admin peut override chaque décision.
 */
export function VitrineCommentsPage() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<FilterStatus>('NEEDS_REVIEW');

  // Polling 5s si on a des PENDING (modération IA en cours)
  const { data, loading, error, startPolling, stopPolling } =
    useQuery<ClubVitrineCommentsData>(CLUB_VITRINE_COMMENTS, {
      fetchPolicy: 'cache-and-network',
    });
  const hasPending = useMemo(
    () =>
      (data?.clubVitrineComments ?? []).some((c) => c.status === 'PENDING'),
    [data],
  );
  useMemo(() => {
    if (hasPending) startPolling(5000);
    else stopPolling();
  }, [hasPending, startPolling, stopPolling]);

  const [setStatus] = useMutation(SET_VITRINE_COMMENT_STATUS, {
    refetchQueries: [{ query: CLUB_VITRINE_COMMENTS }],
  });
  const [remove] = useMutation(DELETE_VITRINE_COMMENT, {
    refetchQueries: [{ query: CLUB_VITRINE_COMMENTS }],
  });
  const [generateReply] = useMutation<{
    generateVitrineCommentReply: string;
  }>(GENERATE_VITRINE_COMMENT_REPLY);
  const [setReply] = useMutation(SET_VITRINE_COMMENT_REPLY, {
    refetchQueries: [{ query: CLUB_VITRINE_COMMENTS }],
  });

  const all = data?.clubVitrineComments ?? [];
  const filtered = filter === 'ALL' ? all : all.filter((c) => c.status === filter);

  const counts: Record<VitrineCommentStatus, number> = {
    PENDING: 0,
    APPROVED: 0,
    NEEDS_REVIEW: 0,
    REJECTED: 0,
    SPAM: 0,
  };
  all.forEach((c) => {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  });

  async function changeStatus(
    id: string,
    status: VitrineCommentStatus,
  ): Promise<void> {
    try {
      await setStatus({ variables: { input: { id, status } } });
      showToast(`Commentaire ${statusLabel(status).toLowerCase()}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Échec', 'error');
    }
  }

  return (
    <>
      <header className="members-loom__hero members-loom__hero--nested">
        <div className="members-hero__actions">
          <div>
            <p className="members-loom__eyebrow">
              <Link to="/vitrine">← Site vitrine</Link>
            </p>
            <h1 className="members-loom__title">
              Commentaires{' '}
              <span className="muted">({all.length})</span>
            </h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Modération des commentaires soumis par les visiteurs. L'IA
              pré-trie ; tu valides manuellement les cas ambigus.
            </p>
          </div>
        </div>
      </header>

      {/* Filtres par statut */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <FilterChip
          label={`À modérer (${counts.NEEDS_REVIEW})`}
          active={filter === 'NEEDS_REVIEW'}
          onClick={() => setFilter('NEEDS_REVIEW')}
          highlight={counts.NEEDS_REVIEW > 0}
        />
        <FilterChip
          label={`En attente IA (${counts.PENDING})`}
          active={filter === 'PENDING'}
          onClick={() => setFilter('PENDING')}
        />
        <FilterChip
          label={`Approuvés (${counts.APPROVED})`}
          active={filter === 'APPROVED'}
          onClick={() => setFilter('APPROVED')}
        />
        <FilterChip
          label={`Rejetés (${counts.REJECTED})`}
          active={filter === 'REJECTED'}
          onClick={() => setFilter('REJECTED')}
        />
        <FilterChip
          label={`Spam (${counts.SPAM})`}
          active={filter === 'SPAM'}
          onClick={() => setFilter('SPAM')}
        />
        <FilterChip
          label={`Tous (${all.length})`}
          active={filter === 'ALL'}
          onClick={() => setFilter('ALL')}
        />
      </div>

      {error ? (
        <p className="form-error">{error.message}</p>
      ) : loading && all.length === 0 ? (
        <p className="muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
          Aucun commentaire dans cette catégorie.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onApprove={() => void changeStatus(c.id, 'APPROVED')}
              onReject={() => void changeStatus(c.id, 'REJECTED')}
              onSpam={() => void changeStatus(c.id, 'SPAM')}
              onDelete={() => {
                if (window.confirm('Supprimer ce commentaire définitivement ?')) {
                  void remove({ variables: { id: c.id } });
                }
              }}
              onGenerateReply={async (replyAuthorName) => {
                const res = await generateReply({
                  variables: {
                    input: { commentId: c.id, replyAuthorName },
                  },
                });
                return res.data?.generateVitrineCommentReply ?? '';
              }}
              onSaveReply={async (body, authorName) => {
                await setReply({
                  variables: {
                    input: {
                      id: c.id,
                      replyBody: body,
                      replyAuthorName: authorName,
                    },
                  },
                });
                showToast(
                  body ? 'Réponse publiée.' : 'Réponse retirée.',
                  'success',
                );
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CommentCard({
  comment,
  onApprove,
  onReject,
  onSpam,
  onDelete,
  onGenerateReply,
  onSaveReply,
}: {
  comment: AdminVitrineComment;
  onApprove: () => void;
  onReject: () => void;
  onSpam: () => void;
  onDelete: () => void;
  onGenerateReply: (replyAuthorName: string | null) => Promise<string>;
  onSaveReply: (
    body: string | null,
    authorName: string | null,
  ) => Promise<void>;
}) {
  const [showReplyEditor, setShowReplyEditor] = useState(
    !!comment.adminReplyBody,
  );
  const [replyDraft, setReplyDraft] = useState(comment.adminReplyBody ?? '');
  const [replyAuthor, setReplyAuthor] = useState(
    comment.adminReplyAuthorName ?? '',
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    try {
      const generated = await onGenerateReply(replyAuthor.trim() || null);
      setReplyDraft(generated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Échec');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveReply(): Promise<void> {
    setSaving(true);
    try {
      await onSaveReply(replyDraft.trim() || null, replyAuthor.trim() || null);
    } finally {
      setSaving(false);
    }
  }
  const aiBadge =
    comment.aiScore != null
      ? {
          label:
            comment.aiCategory ??
            (comment.aiScore > 0.7
              ? 'positif'
              : comment.aiScore > 0.4
                ? 'ambigu'
                : 'négatif'),
          color:
            comment.aiScore > 0.7
              ? '#059669'
              : comment.aiScore > 0.4
                ? '#d97706'
                : '#dc2626',
        }
      : null;

  return (
    <article
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 16,
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <strong>{comment.authorName}</strong>{' '}
          <span className="muted" style={{ fontSize: 12 }}>
            &lt;{comment.authorEmail}&gt;
          </span>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            sur{' '}
            <Link
              to={`/vitrine/articles`}
              style={{ color: '#2563eb' }}
              title={comment.articleTitle}
            >
              {comment.articleTitle || comment.articleSlug}
            </Link>{' '}
            · {new Date(comment.createdAt).toLocaleString('fr-FR')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <StatusChip status={comment.status} />
          {aiBadge ? (
            <span
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 999,
                background: `${aiBadge.color}15`,
                color: aiBadge.color,
                fontWeight: 600,
              }}
              title={`Score IA : ${comment.aiScore?.toFixed(2)}`}
            >
              IA : {aiBadge.label} ({comment.aiScore?.toFixed(2)})
            </span>
          ) : null}
        </div>
      </div>

      <blockquote
        style={{
          background: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '10px 14px',
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: '#334155',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {comment.body}
      </blockquote>

      {comment.aiReason ? (
        <p
          style={{
            fontSize: 12,
            color: '#64748b',
            fontStyle: 'italic',
            margin: 0,
          }}
        >
          💡 {comment.aiReason}
        </p>
      ) : null}

      {/* Bloc réponse admin (IA ou manuelle) */}
      {showReplyEditor ? (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            padding: 12,
            display: 'grid',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <strong style={{ fontSize: 13, color: '#1e40af' }}>
              🤖 Réponse de l'équipe
            </strong>
            <button
              type="button"
              className="btn btn-tight btn-ghost"
              onClick={() => setShowReplyEditor(false)}
              style={{ fontSize: 11 }}
            >
              Masquer
            </button>
          </div>
          <input
            type="text"
            value={replyAuthor}
            onChange={(e) => setReplyAuthor(e.target.value)}
            placeholder="Nom pour signer (ex. L'équipe SKSR, Sensei Tanaka)"
            style={{
              padding: 6,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: 13,
            }}
          />
          <textarea
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.target.value)}
            rows={5}
            placeholder="Rédige une réponse ou clique sur 'Générer avec IA' pour qu'elle soit créée automatiquement avec remerciement + enrichissement SEO."
            style={{
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => void handleGenerate()}
                disabled={generating}
                style={{ background: '#7c3aed', color: '#fff' }}
              >
                {generating
                  ? 'Génération IA…'
                  : replyDraft.trim()
                    ? '✨ Régénérer avec IA'
                    : '✨ Générer avec IA'}
              </button>
              <button
                type="button"
                className="btn btn-tight"
                onClick={() => void handleSaveReply()}
                disabled={saving || !replyDraft.trim()}
              >
                {saving
                  ? 'Enregistrement…'
                  : comment.adminReplyBody
                    ? 'Mettre à jour'
                    : 'Publier la réponse'}
              </button>
            </div>
            {comment.adminReplyBody ? (
              <button
                type="button"
                className="btn btn-tight btn-ghost"
                onClick={() => {
                  if (window.confirm('Retirer la réponse publiée ?')) {
                    void onSaveReply(null, null);
                    setReplyDraft('');
                  }
                }}
                style={{ color: '#b91c1c' }}
              >
                Retirer
              </button>
            ) : null}
          </div>
          {comment.adminReplyAt ? (
            <p
              style={{
                fontSize: 11,
                color: '#64748b',
                margin: 0,
                fontStyle: 'italic',
              }}
            >
              Publiée le{' '}
              {new Date(comment.adminReplyAt).toLocaleDateString('fr-FR')} par{' '}
              {comment.adminReplyAuthorName ?? 'L\u2019équipe'}
            </p>
          ) : null}
        </div>
      ) : comment.status === 'APPROVED' ? (
        <button
          type="button"
          className="btn btn-tight btn-ghost"
          onClick={() => setShowReplyEditor(true)}
          style={{ alignSelf: 'flex-start', fontSize: 12 }}
        >
          💬 {comment.adminReplyBody ? 'Modifier la réponse' : 'Répondre (IA ou manuel)'}
        </button>
      ) : null}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {comment.status !== 'APPROVED' ? (
          <button type="button" className="btn btn-tight" onClick={onApprove}>
            ✓ Approuver
          </button>
        ) : null}
        {comment.status !== 'REJECTED' ? (
          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={onReject}
          >
            ✕ Rejeter
          </button>
        ) : null}
        {comment.status !== 'SPAM' ? (
          <button
            type="button"
            className="btn btn-tight btn-ghost"
            onClick={onSpam}
          >
            Marquer spam
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-tight btn-ghost"
          onClick={onDelete}
          style={{ color: '#b91c1c' }}
        >
          Supprimer
        </button>
      </div>
    </article>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  highlight,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'filter-chip filter-chip--active' : 'filter-chip'}
      style={
        highlight && !active
          ? {
              background: '#fee2e2',
              color: '#991b1b',
              fontWeight: 600,
            }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function StatusChip({ status }: { status: VitrineCommentStatus }) {
  const cfg: Record<
    VitrineCommentStatus,
    { label: string; bg: string; fg: string }
  > = {
    PENDING: { label: 'Modération IA…', bg: '#dbeafe', fg: '#1e40af' },
    NEEDS_REVIEW: { label: 'À modérer', bg: '#fef3c7', fg: '#92400e' },
    APPROVED: { label: 'Approuvé', bg: '#d1fae5', fg: '#065f46' },
    REJECTED: { label: 'Rejeté', bg: '#fee2e2', fg: '#991b1b' },
    SPAM: { label: 'Spam', bg: '#e5e7eb', fg: '#4b5563' },
  };
  const c = cfg[status];
  return (
    <span
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
      }}
    >
      {c.label}
    </span>
  );
}

function statusLabel(status: VitrineCommentStatus): string {
  return {
    PENDING: 'en attente',
    NEEDS_REVIEW: 'à modérer',
    APPROVED: 'approuvé',
    REJECTED: 'rejeté',
    SPAM: 'marqué spam',
  }[status];
}
