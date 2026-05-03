'use client';

import { useEffect, useState } from 'react';

interface PublicComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  adminReplyBody: string | null;
  adminReplyAuthorName: string | null;
  adminReplyAt: string | null;
}

interface Props {
  clubSlug: string;
  articleSlug: string;
  /** URL GraphQL (passée depuis server component car NEXT_PUBLIC n'est pas toujours dispo). */
  apiUrl: string;
  initialComments: PublicComment[];
}

/**
 * Section de commentaires côté public pour un article vitrine.
 *
 * - Liste des commentaires APPROVED affichés immédiatement
 * - Formulaire de soumission (nom, email, texte + honeypot anti-spam)
 * - Au submit : mutation GraphQL `submitArticleComment`
 * - Message "ton commentaire est en modération" affiché post-submit
 * - Si le commentaire passe en APPROVED (polling une fois après 10s), il
 *   apparaît dans la liste
 */
export function ArticleComments({
  clubSlug,
  articleSlug,
  apiUrl,
  initialComments,
}: Props) {
  const [comments, setComments] = useState<PublicComment[]>(initialComments);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<
    { kind: 'success' | 'error'; message: string } | null
  >(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  // Refetch une fois 10 s après un submit au cas où le commentaire serait
  // automatiquement approuvé par l'IA (fallback discret sans polling continu).
  useEffect(() => {
    if (!feedback || feedback.kind !== 'success') return;
    const id = setTimeout(() => void refetch(), 10_000);
    return () => clearTimeout(id);
  }, [feedback]);

  async function refetch(): Promise<void> {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: /* GraphQL */ `
            query Refetch($clubSlug: String!, $articleSlug: String!) {
              publicVitrineArticleComments(
                clubSlug: $clubSlug
                articleSlug: $articleSlug
              ) {
                id
                authorName
                body
                createdAt
                adminReplyBody
                adminReplyAuthorName
                adminReplyAt
              }
            }
          `,
          variables: { clubSlug, articleSlug },
        }),
      });
      const json = (await res.json()) as {
        data?: { publicVitrineArticleComments?: PublicComment[] };
      };
      const fresh = json.data?.publicVitrineArticleComments;
      if (Array.isArray(fresh)) setComments(fresh);
    } catch {
      /* silent */
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: /* GraphQL */ `
            mutation SubmitComment($input: SubmitArticleCommentInput!) {
              submitArticleComment(input: $input) {
                success
                status
                message
              }
            }
          `,
          variables: {
            input: {
              clubSlug,
              articleSlug,
              authorName: name.trim(),
              authorEmail: email.trim(),
              body: body.trim(),
              websiteHoneypot: honeypot,
            },
          },
        }),
      });
      const json = (await res.json()) as {
        data?: {
          submitArticleComment?: {
            success: boolean;
            status: string;
            message: string;
          };
        };
        errors?: Array<{ message: string }>;
      };
      if (json.errors && json.errors.length > 0) {
        throw new Error(json.errors.map((e) => e.message).join(' · '));
      }
      const result = json.data?.submitArticleComment;
      if (!result) throw new Error('Réponse vide du serveur.');
      setFeedback({ kind: 'success', message: result.message });
      setLastStatus(result.status);
      setName('');
      setEmail('');
      setBody('');
    } catch (err) {
      setFeedback({
        kind: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Échec de l\u2019envoi, réessaie plus tard.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="article-comments">
      <h2>
        Commentaires{' '}
        <span className="article-comments__count">({comments.length})</span>
      </h2>

      {comments.length === 0 ? (
        <p className="article-comments__empty">
          Aucun commentaire pour l'instant. Laisse le tien ci-dessous.
        </p>
      ) : (
        <ul className="article-comments__list">
          {comments.map((c) => (
            <li key={c.id} className="article-comments__item">
              <header>
                <strong>{c.authorName}</strong>
                <span className="article-comments__date">
                  {formatDate(c.createdAt)}
                </span>
              </header>
              <p>{c.body}</p>

              {c.adminReplyBody ? (
                <div className="article-comments__reply">
                  <header>
                    <span className="article-comments__reply-badge">
                      Réponse de l'équipe
                    </span>
                    <strong>
                      {c.adminReplyAuthorName ?? 'L\u2019équipe'}
                    </strong>
                    {c.adminReplyAt ? (
                      <span className="article-comments__date">
                        {formatDate(c.adminReplyAt)}
                      </span>
                    ) : null}
                  </header>
                  <p>{c.adminReplyBody}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="article-comments__form"
      >
        <h3>Laisser un commentaire</h3>
        <p className="article-comments__form-hint">
          Ton commentaire sera modéré par IA et publié s'il est constructif
          (ou validé manuellement en cas de doute).
        </p>

        <div className="article-comments__form-grid">
          <label>
            <span>Nom *</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </label>
          <label>
            <span>Email *</span>
            <input
              type="email"
              required
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </label>
        </div>
        <label>
          <span>Commentaire *</span>
          <textarea
            required
            minLength={10}
            maxLength={3000}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={submitting}
            placeholder="Partage ton retour, ton expérience, ta question…"
          />
          <small>{body.length}/3000</small>
        </label>

        {/* Honeypot anti-spam — champ invisible que les humains ne remplissent pas */}
        <label
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        >
          <span>Ne remplissez pas ce champ</span>
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>

        {feedback ? (
          <div
            className={`article-comments__feedback article-comments__feedback--${feedback.kind}`}
            role="status"
          >
            {feedback.message}
            {lastStatus === 'NEEDS_REVIEW' ? (
              <div
                style={{ fontSize: 12, marginTop: 4, fontStyle: 'italic' }}
              >
                L'IA a signalé ton message pour relecture manuelle — il sera
                examiné par un responsable.
              </div>
            ) : null}
          </div>
        ) : null}

        <button type="submit" disabled={submitting} className="article-comments__submit">
          {submitting ? 'Envoi…' : 'Publier mon commentaire'}
        </button>
      </form>
    </section>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
