import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Tiroir de navigation des écrans étroits (< 900 px).
 *
 * Sous 900 px la barre latérale est masquée et la barre du bas ne porte que
 * quelques raccourcis : sans ce tiroir, les autres entrées (Mes projets,
 * Événements, Boutique…) n'étaient atteignables par aucun lien sur téléphone.
 * Le tiroir réaffiche la barre latérale elle-même, pour qu'il n'existe qu'une
 * seule liste d'entrées à tenir à jour.
 *
 * Se referme à chaque changement de page et sur Échap.
 */
export function useNavDrawer() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);

  return { open, toggle, close };
}
