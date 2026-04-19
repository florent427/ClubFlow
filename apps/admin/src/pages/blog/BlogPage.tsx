import { useMutation, useQuery } from '@apollo/client/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ARCHIVE_CLUB_BLOG_POST,
  CLUB_BLOG_POSTS,
  CREATE_CLUB_BLOG_POST,
  DELETE_CLUB_BLOG_POST,
  PUBLISH_CLUB_BLOG_POST,
  UPDATE_CLUB_BLOG_POST,
} from '../../lib/documents';
import type { BlogPost, ClubBlogPostsQueryData } from '../../lib/types';
import { useToast } from '../../components/ToastProvider';
import { ConfirmModal, Drawer, EmptyState } from '../../components/ui';

function fmt(iso: string | null): string {
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

function statusLabel(s: BlogPost['status']): {
  label: string;
  cls: 'ok' | 'warn' | 'muted';
} {
  if (s === 'PUBLISHED') return { label: 'Publié', cls: 'ok' };
  if (s === 'ARCHIVED') return { label: 'Archivé', cls: 'muted' };
  return { label: 'Brouillon', cls: 'warn' };
}

export function BlogPage() {
  const { showToast } = useToast();
  const { data, refetch, loading } = useQuery<ClubBlogPostsQueryData>(
    CLUB_BLOG_POSTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const [create, { loading: creating }] = useMutation(CREATE_CLUB_BLOG_POST);
  const [update, { loading: updating }] = useMutation(UPDATE_CLUB_BLOG_POST);
  const [publish] = useMutation(PUBLISH_CLUB_BLOG_POST);
  const [archive] = useMutation(ARCHIVE_CLUB_BLOG_POST);
  const [remove] = useMutation(DELETE_CLUB_BLOG_POST);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BlogPost | null>(null);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [publishNow, setPublishNow] = useState(false);

  const posts = data?.clubBlogPosts ?? [];

  function openCreate() {
    setEditing(null);
    setTitle('');
    setSlug('');
    setExcerpt('');
    setBody('');
    setCoverImageUrl('');
    setPublishNow(false);
    setDrawerOpen(true);
  }

  function openEdit(p: BlogPost) {
    setEditing(p);
    setTitle(p.title);
    setSlug(p.slug);
    setExcerpt(p.excerpt ?? '');
    setBody(p.body);
    setCoverImageUrl(p.coverImageUrl ?? '');
    setPublishNow(false);
    setDrawerOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    try {
      if (editing) {
        await update({
          variables: {
            input: {
              id: editing.id,
              title: title.trim(),
              slug: slug.trim() || undefined,
              excerpt: excerpt.trim() || undefined,
              body: body.trim(),
              coverImageUrl: coverImageUrl.trim() || undefined,
            },
          },
        });
        showToast('Article mis à jour', 'success');
      } else {
        await create({
          variables: {
            input: {
              title: title.trim(),
              slug: slug.trim() || undefined,
              excerpt: excerpt.trim() || undefined,
              body: body.trim(),
              coverImageUrl: coverImageUrl.trim() || undefined,
              publishNow,
            },
          },
        });
        showToast(
          publishNow ? 'Article publié' : 'Brouillon enregistré',
          'success',
        );
      }
      setDrawerOpen(false);
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur lors de l’enregistrement',
        'error',
      );
    }
  }

  async function onPublish(p: BlogPost) {
    try {
      await publish({ variables: { id: p.id } });
      showToast('Article publié', 'success');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur de publication',
        'error',
      );
    }
  }

  async function onArchive(p: BlogPost) {
    try {
      await archive({ variables: { id: p.id } });
      showToast('Article archivé', 'success');
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur d’archivage',
        'error',
      );
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await remove({ variables: { id: confirmDelete.id } });
      showToast('Article supprimé', 'success');
      setConfirmDelete(null);
      await refetch();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Erreur de suppression',
        'error',
      );
    }
  }

  return (
    <div className="cf-page">
      <header className="cf-page-header">
        <div>
          <h1 className="cf-page-title">Blog</h1>
          <p className="cf-page-subtitle">
            Rédigez et publiez des articles lus par vos membres et le public.
          </p>
        </div>
        <button
          type="button"
          className="cf-btn cf-btn--primary"
          onClick={openCreate}
        >
          <span className="material-symbols-outlined" aria-hidden>
            add
          </span>
          Nouvel article
        </button>
      </header>

      {loading && posts.length === 0 ? (
        <p className="cf-muted">Chargement…</p>
      ) : posts.length === 0 ? (
        <EmptyState
          icon="article"
          title="Aucun article"
          message="Commencez par rédiger le premier article de votre club."
          action={
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={openCreate}
            >
              Nouvel article
            </button>
          }
        />
      ) : (
        <ul className="cf-blog-list">
          {posts.map((p) => {
            const st = statusLabel(p.status);
            return (
              <li key={p.id} className="cf-blog-card">
                <div className="cf-blog-card__head">
                  <div className="cf-blog-card__title-wrap">
                    <h3 className="cf-blog-card__title">{p.title}</h3>
                    <span className={`cf-pill cf-pill--${st.cls}`}>{st.label}</span>
                  </div>
                  <code className="cf-blog-card__slug">/{p.slug}</code>
                </div>
                {p.excerpt ? (
                  <p className="cf-blog-card__excerpt">{p.excerpt}</p>
                ) : null}
                <div className="cf-blog-card__meta">
                  <span>Mise à jour : {fmt(p.updatedAt)}</span>
                  {p.publishedAt ? (
                    <span>Publié : {fmt(p.publishedAt)}</span>
                  ) : null}
                </div>
                <div className="cf-blog-card__actions">
                  {p.status !== 'PUBLISHED' ? (
                    <button
                      type="button"
                      className="cf-btn cf-btn--primary"
                      onClick={() => void onPublish(p)}
                    >
                      Publier
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cf-btn"
                    onClick={() => openEdit(p)}
                  >
                    Modifier
                  </button>
                  {p.status === 'PUBLISHED' ? (
                    <button
                      type="button"
                      className="cf-btn"
                      onClick={() => void onArchive(p)}
                    >
                      Archiver
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cf-btn cf-btn--danger"
                    onClick={() => setConfirmDelete(p)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Drawer
        open={drawerOpen}
        title={editing ? 'Modifier l’article' : 'Nouvel article'}
        onClose={() => setDrawerOpen(false)}
        width={720}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="cf-form">
          <label className="cf-field">
            <span className="cf-field__label">Titre</span>
            <input
              type="text"
              className="cf-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">
              Slug (laisser vide pour auto)
            </span>
            <input
              type="text"
              className="cf-input"
              value={slug}
              onChange={(e) =>
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]+/g, '-')
                    .replace(/^-+|-+$/g, ''),
                )
              }
              placeholder="mon-article"
              maxLength={160}
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Extrait</span>
            <textarea
              className="cf-input cf-textarea"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Chapô affiché dans la liste."
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Image de couverture (URL)</span>
            <input
              type="url"
              className="cf-input"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="cf-field">
            <span className="cf-field__label">Contenu</span>
            <textarea
              className="cf-input cf-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={14}
              maxLength={100000}
            />
            <span className="cf-field__hint">
              Markdown léger accepté : # Titre, ## Sous-titre, **gras**, _italique_, - liste, [lien](https://…).
            </span>
          </label>
          {!editing ? (
            <label className="cf-checkbox">
              <input
                type="checkbox"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
              />
              <span>Publier immédiatement</span>
            </label>
          ) : null}
          <div className="cf-form-actions">
            <button
              type="button"
              className="cf-btn"
              onClick={() => setDrawerOpen(false)}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="cf-btn cf-btn--primary"
              disabled={creating || updating}
            >
              {editing
                ? 'Enregistrer'
                : publishNow
                  ? 'Publier'
                  : 'Enregistrer le brouillon'}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer l’article ?"
        message={`« ${confirmDelete?.title ?? ''} » sera définitivement supprimé.`}
        confirmLabel="Supprimer"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
