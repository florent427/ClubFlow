'use client';

import { useEffect } from 'react';

/**
 * Attache un IntersectionObserver global qui ajoute la classe `in` aux
 * éléments `.reveal` quand ils entrent dans le viewport. Port fidèle du
 * comportement `shared.js` du site SKSR.
 *
 * À mettre UNE FOIS dans le layout racine.
 */
export function RevealRoot() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' },
    );
    els.forEach((e) => io.observe(e));
    // MutationObserver pour attraper les nouveaux .reveal ajoutés dynamiquement
    // (ex. navigation entre pages App Router — même root, contenu mouvant).
    const mo = new MutationObserver(() => {
      document
        .querySelectorAll<HTMLElement>('.reveal:not(.in)')
        .forEach((el) => io.observe(el));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
