import type { ReactNode } from 'react';

/**
 * Remonté à chaque navigation (contrairement au layout) : la nouvelle page
 * entre en fondu au lieu d'apparaître d'un coup. L'animation ne touche que
 * l'opacité et ne persiste pas après sa fin (`motion.css`), pour ne pas
 * casser les éléments `position: fixed` de la page (galerie, modales).
 */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
