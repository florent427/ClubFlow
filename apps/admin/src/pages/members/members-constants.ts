export const BUILTIN_ROLE_OPTIONS = [
  { value: 'STUDENT', label: 'Adhérent (élève)' },
  { value: 'COACH', label: 'Professeur / coach' },
  { value: 'BOARD', label: 'Bureau' },
] as const;

/**
 * Libellé français d'un rôle système ; renvoie le code tel quel pour les
 * rôles personnalisés (déjà nommés par le club). Évite d'afficher
 * « STUDENT » brut dans les badges (bug QA m2).
 */
export function roleLabel(role: string): string {
  const found = BUILTIN_ROLE_OPTIONS.find((o) => o.value === role);
  return found ? found.label : role;
}
