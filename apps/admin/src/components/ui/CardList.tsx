import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

/**
 * Liste de cartes tactiles — le remplaçant des tableaux sur mobile.
 *
 * Un tableau de six colonnes sur 375px se lit en défilement horizontal,
 * cellule par cellule. Une carte donne l'essentiel en un coup d'œil (titre,
 * sous-titre, méta à droite, pastilles en pied) et s'ouvre d'un tap sur toute
 * sa surface. Les pages rendent la carte sous le point de rupture et le
 * tableau au-dessus ; les styles vivent dans `mobile.css` (`.cf-cardlist`).
 */
export function CardList({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <ul
      className={className ? `cf-cardlist ${className}` : 'cf-cardlist'}
      aria-label={ariaLabel}
    >
      {children}
    </ul>
  );
}

export function CardListItem({
  id,
  leading,
  title,
  subtitle,
  meta,
  footer,
  trailing,
  onOpen,
  className,
}: {
  id?: string;
  /** Avatar ou icône, à gauche. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Information courte alignée à droite du titre (date, montant…). */
  meta?: ReactNode;
  /** Pastilles / statuts sous le sous-titre. */
  footer?: ReactNode;
  /**
   * Zone d'actions à droite. Les clics n'y déclenchent pas `onOpen`, pour
   * qu'un bouton « message » n'ouvre pas la fiche en même temps.
   */
  trailing?: ReactNode;
  /** Ouvre l'élément (tap, Entrée, Espace). Absent = carte statique. */
  onOpen?: () => void;
  className?: string;
}) {
  const interactive = typeof onOpen === 'function';

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }

  function stopPropagation(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return (
    <li
      id={id}
      className={
        className ? `cf-cardlist__item ${className}` : 'cf-cardlist__item'
      }
    >
      <div
        className="cf-cardlist__row"
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? () => onOpen() : undefined}
        onKeyDown={onKeyDown}
      >
        {leading ? <div className="cf-cardlist__leading">{leading}</div> : null}
        <div className="cf-cardlist__main">
          <div className="cf-cardlist__head">
            <span className="cf-cardlist__title">{title}</span>
            {meta ? <span className="cf-cardlist__meta">{meta}</span> : null}
          </div>
          {subtitle ? <span className="cf-cardlist__sub">{subtitle}</span> : null}
          {footer ? <div className="cf-cardlist__foot">{footer}</div> : null}
        </div>
        {trailing ? (
          <div className="cf-cardlist__trailing" onClick={stopPropagation}>
            {trailing}
          </div>
        ) : interactive ? (
          <span
            className="material-symbols-outlined cf-cardlist__chevron"
            aria-hidden
          >
            chevron_right
          </span>
        ) : null}
      </div>
    </li>
  );
}
