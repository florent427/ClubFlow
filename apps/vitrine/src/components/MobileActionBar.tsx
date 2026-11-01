'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  /** Lien `tel:` du club ; sans numéro, seul l'essai gratuit reste. */
  phoneHref: string;
}

/**
 * Barre d'actions fixée en bas de l'écran sur mobile : les deux gestes
 * qu'un parent fait le plus souvent, réserver un essai et appeler le dojo,
 * toujours à portée de pouce. Masquée sur ordinateur (CSS) et sur la page
 * Contact, qui porte déjà le formulaire.
 */
export function MobileActionBar({ phoneHref }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith('/contact')) return null;
  return (
    <div className="mobile-bar" role="navigation" aria-label="Actions rapides">
      <Link href="/contact" className="mobile-bar__primary">
        Essai gratuit
      </Link>
      {phoneHref ? (
        <a href={phoneHref} className="mobile-bar__secondary">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          Appeler
        </a>
      ) : null}
    </div>
  );
}
