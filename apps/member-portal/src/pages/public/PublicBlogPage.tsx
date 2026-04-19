import { useQuery } from '@apollo/client/react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import {
  PUBLIC_CLUB_BLOG_POST,
  PUBLIC_CLUB_BLOG_POSTS,
} from '../../lib/public-documents';
import type {
  PublicBlogPostQueryData,
  PublicBlogPostsQueryData,
} from '../../lib/public-types';

type Ctx = { slug: string; clubName: string };

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function PublicBlogListPage() {
  const { slug } = useOutletContext<Ctx>();
  const base = `/site/${slug}`;
  const { data, loading } = useQuery<PublicBlogPostsQueryData>(
    PUBLIC_CLUB_BLOG_POSTS,
    { variables: { clubSlug: slug, limit: 30 } },
  );
  const posts = data?.publicClubBlogPosts ?? [];

  return (
    <div className="ps-page">
      <h1 className="ps-page-title">Blog du club</h1>
      {loading && posts.length === 0 ? (
        <p className="ps-muted">Chargement…</p>
      ) : posts.length === 0 ? (
        <p className="ps-muted">Aucun article publié.</p>
      ) : (
        <ul className="ps-blog-list">
          {posts.map((p) => (
            <li key={p.id} className="ps-blog-card">
              <Link to={`${base}/blog/${p.slug}`} className="ps-blog-card__link">
                {p.coverImageUrl ? (
                  <img src={p.coverImageUrl} alt="" className="ps-blog-card__cover" />
                ) : null}
                <h2>{p.title}</h2>
                <p className="ps-muted">{fmtDate(p.publishedAt)}</p>
                {p.excerpt ? <p>{p.excerpt}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PublicBlogPostPage() {
  const { slug, clubName } = useOutletContext<Ctx>();
  const { postSlug = '' } = useParams<{ postSlug: string }>();
  const base = `/site/${slug}`;
  const { data, loading, error } = useQuery<PublicBlogPostQueryData>(
    PUBLIC_CLUB_BLOG_POST,
    { variables: { clubSlug: slug, postSlug } },
  );

  if (loading && !data) return <p className="ps-muted">Chargement…</p>;
  if (error || !data?.publicClubBlogPost) {
    return (
      <div className="ps-page">
        <p className="ps-muted">Article introuvable.</p>
        <Link to={`${base}/blog`} className="ps-link">← Retour au blog</Link>
      </div>
    );
  }
  const post = data.publicClubBlogPost;
  const paragraphs = post.body.split(/\n+/).filter(Boolean);

  return (
    <article className="ps-page ps-article">
      <Link to={`${base}/blog`} className="ps-link">← Retour au blog</Link>
      {post.coverImageUrl ? (
        <img src={post.coverImageUrl} alt="" className="ps-article__cover" />
      ) : null}
      <h1 className="ps-article__title">{post.title}</h1>
      <p className="ps-muted">
        {fmtDate(post.publishedAt)} · {clubName}
      </p>
      {paragraphs.map((para, i) => (
        <p key={i} className="ps-article__para">{para}</p>
      ))}
    </article>
  );
}
