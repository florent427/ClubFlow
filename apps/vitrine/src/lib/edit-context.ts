/**
 * Contexte d'édition transmis du server vers les client components.
 *
 * - `editMode=false` : la vitrine rend normalement (server-only), aucun code
 *   d'édition n'est chargé côté client → perf optimale.
 * - `editMode=true` : le cookie admin est détecté ; on attache le JWT et
 *   l'ID de la page pour que `EditableText` puisse sauvegarder à chaque
 *   modification.
 */
export type EditContext =
  | { editMode: false }
  | {
      editMode: true;
      editJwt: string;
      pageId: string;
      apiUrl: string;
    };
