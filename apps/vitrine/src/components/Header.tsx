'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface HeaderProps {
  clubName: string;
  kanjiTagline?: string;
  logoUrl?: string | null;
  /** Slug du club résolu via Host header — pré-remplit `?club=` du portail. */
  clubSlug?: string;
}

const LINKS: Array<{ href: string; label: string; id: string; cta?: boolean }> =
  [
    { href: '/', label: 'Accueil', id: 'home' },
    { href: '/club', label: 'Le Club', id: 'club' },
    { href: '/cours', label: 'Cours', id: 'cours' },
    { href: '/equipe', label: 'Équipe', id: 'equipe' },
    { href: '/tarifs', label: 'Tarifs', id: 'tarifs' },
    { href: '/galerie', label: 'Galerie', id: 'galerie' },
    { href: '/actualites', label: 'Actualités', id: 'actu' },
    { href: '/blog', label: 'Blog', id: 'blog' },
    { href: '/contact', label: 'Contact', id: 'contact' },
  ];

/**
 * URL du portail membre. Côté Next, on lit `NEXT_PUBLIC_PORTAL_URL`
 * injecté au build. Fallback prod : portail.clubflow.topdigital.re.
 */
const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://portail.clubflow.topdigital.re';

/**
 * Nav SKSR — port fidèle du markup de `partials.js`.
 * - Logo + branding (2 lignes, nom club + kanji tagline petit)
 * - Liens horizontaux desktop, drawer mobile avec backdrop
 * - Classe `scrolled` appliquée après 20px de scroll
 * - Bouton CTA visuellement distinct (Contact)
 */
export function Header({
  clubName,
  kanjiTagline,
  logoUrl,
  clubSlug,
}: HeaderProps) {
  // Lien "S'inscrire" pré-paramétré avec le slug du club courant. Le
  // portail lit `?club=<slug>`, résout le club via la query publique
  // `clubBySlug`, et affiche un en-tête "Vous rejoignez X" sur le
  // formulaire d'inscription.
  const registerUrl = clubSlug
    ? `${PORTAL_URL}/register?club=${encodeURIComponent(clubSlug)}`
    : `${PORTAL_URL}/register`;
  const loginUrl = clubSlug
    ? `${PORTAL_URL}/login?club=${encodeURIComponent(clubSlug)}`
    : `${PORTAL_URL}/login`;
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const close = () => setOpen(false);
  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
      <Link href="/" className="nav__brand" onClick={close}>
        {logoUrl ? (
          <img src={logoUrl} className="nav__logo" alt={clubName} />
        ) : (
          <span className="nav__logo" aria-hidden="true" />
        )}
        <div className="nav__brand-text">
          <span>{clubName}</span>
          {kanjiTagline ? <small>{kanjiTagline}</small> : null}
        </div>
      </Link>

      <button
        className={`nav__burger${open ? ' open' : ''}`}
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      <div
        className={`nav__backdrop${open ? ' open' : ''}`}
        aria-hidden="true"
        onClick={close}
      />

      <div className={`nav__links${open ? ' open' : ''}`}>
        <button className="nav__close" aria-label="Fermer le menu" onClick={close}>
          ×
        </button>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${link.cta ? 'nav__cta' : ''}${
              isActive(link.href) ? ' active' : ''
            }`}
            onClick={close}
          >
            {link.label}
          </Link>
        ))}
        {/* "Connexion" + "S'inscrire" — externes vers portail membre,
            pré-remplis avec le slug du club courant. Visibles en
            permanence dans la nav pour discoverability. */}
        <a
          href={loginUrl}
          onClick={close}
          rel="noopener"
        >
          Connexion
        </a>
        <a
          href={registerUrl}
          className="nav__cta"
          onClick={close}
          rel="noopener"
        >
          S&rsquo;inscrire
        </a>
      </div>
    </nav>
  );
}
