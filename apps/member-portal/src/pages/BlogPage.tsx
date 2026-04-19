import { useQuery } from '@apollo/client/react';
import { Link, useParams } from 'react-router-dom';
import {
  VIEWER_CLUB_BLOG_POST,
  VIEWER_CLUB_BLOG_POSTS,
} from '../lib/viewer-documents';
import type {
  ViewerClubBlogPostData,
  ViewerClubBlogPostsData,
} from '../lib/viewer-types';

function fmt(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      dateStyle: 'long',
    });
  } catch {
    return '';
  }
}

export function BlogListPage() {
  const { data, loading } = useQuery<ViewerClubBlogPostsData>(
    VIEWER_CLUB_BLOG_POSTS,
    { fetchPolicy: 'cache-and-network' },
  );
  const posts = data?.viewerClubBlogPosts ?? [];

  return (
    <div className="mp-page">
      <header className="mp-page-header">
        <h1 className="mp-page-title">Blog du club</h1>
        <p className="mp-page-subtitle">
          Retrouvez toutes les actualités et articles du club.
        </p>
      </header>

      {loading && posts.length === 0 ? (
        <p className="mp-muted">Chargement…</p>
      ) : posts.length === 0 ? (
        <p className="mp-muted">Aucun article publié pour l’instant.</p>
      ) : (
        <ul className="mp-blog-list">
          {posts.map((p) => (
            <li key={p.id} className="mp-blog-card">
              {p.coverImageUrl ? (
                <img
                  src={p.coverImageUrl}
                  alt=""
                  className="mp-blog-card__cover"
                />
              ) : null}
              <div className="mp-blog-card__body">
                <h2 className="mp-blog-card__title">
                  <Link to={`/blog/${p.slug}`}>{p.title}</Link>
                </h2>
                {p.publishedAt ? (
                  <p className="mp-blog-card__date">{fmt(p.publishedAt)}</p>
                ) : null}
                {p.excerpt ? (
                  <p className="mp-blog-card__excerpt">{p.excerpt}</p>
                ) : null}
                <Link to={`/blog/${p.slug}`} className="mp-link">
                  Lire l’article →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, loading } = useQuery<ViewerClubBlogPostData>(
    VIEWER_CLUB_BLOG_POST,
    {
      variables: { slug: slug ?? '' },
      skip: !slug,
      fetchPolicy: 'cache-and-network',
    },
  );
  const post = data?.viewerClubBlogPost ?? null;

  if (loading && !post) {
    return (
      <div className="mp-page">
        <p className="mp-muted">Chargement…</p>
      </div>
    );
  }
  if (!post) {
    return (
      <div className="mp-page">
        <p className="mp-muted">Article introuvable.</p>
        <Link to="/blog" className="mp-link">
          ← Retour au blog
        </Link>
      </div>
    );
  }
  return (
    <article className="mp-page mp-blog-article">
      <Link to="/blog" className="mp-link">
        ← Retour au blog
      </Link>
      <h1 className="mp-page-title">{post.title}</h1>
      {post.publishedAt ? (
        <p className="mp-muted">{fmt(post.publishedAt)}</p>
      ) : null}
      {post.coverImageUrl ? (
        <img
          src={post.coverImageUrl}
          alt=""
          className="mp-blog-article__cover"
        />
      ) : null}
      {post.excerpt ? (
        <p className="mp-blog-article__excerpt">{post.excerpt}</p>
      ) : null}
      <div className="mp-blog-article__body">
        {post.body.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </article>
  );
}
