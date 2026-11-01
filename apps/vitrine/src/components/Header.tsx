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

interface NavLink {
  href: string;
  label: string;
  /** Sous-pages regroupées sous cette entrée (menu déroulant). */
  children?: Array<{ href: string; label: string }>;
}

/**
 * Cinq entrées au lieu de dix : les pages voisines sont regroupées dans
 * un menu déroulant (desktop) ou listées en retrait (tiroir mobile).
 * L'accueil reste accessible par le logo.
 */
const LINKS: NavLink[] = [
  {
    href: '/club',
    label: 'Le club',
    children: [
      { href: '/club', label: 'Notre histoire' },
      { href: '/equipe', label: 'L’équipe' },
      { href: '/dojo', label: 'Le dojo' },
    ],
  },
  {
    href: '/cours',
    label: 'Cours & tarifs',
    children: [
      { href: '/cours', label: 'Cours & horaires' },
      { href: '/tarifs', label: 'Tarifs' },
    ],
  },
  {
    href: '/actualites',
    label: 'Actualités',
    children: [
      { href: '/actualites', label: 'Actualités' },
      { href: '/blog', label: 'Blog' },
      { href: '/evenements', label: 'Événements' },
      { href: '/competitions', label: 'Compétitions' },
    ],
  },
  { href: '/galerie', label: 'Galerie' },
  { href: '/contact', label: 'Contact' },
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
  const isGroupActive = (link: NavLink): boolean =>
    isActive(link.href) || (link.children ?? []).some((c) => isActive(c.href));

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
        {LINKS.map((link) =>
          link.children ? (
            <div key={link.href} className="nav__group">
              <Link
                href={link.href}
                className={`nav__group-link${isGroupActive(link) ? ' active' : ''}`}
                aria-haspopup="true"
                onClick={close}
              >
                {link.label}
              </Link>
              <div className="nav__sub">
                {link.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    className={isActive(child.href) ? 'active' : undefined}
                    aria-current={isActive(child.href) ? 'page' : undefined}
                    onClick={close}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? 'active' : undefined}
              aria-current={isActive(link.href) ? 'page' : undefined}
              onClick={close}
            >
              {link.label}
            </Link>
          ),
        )}
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
