'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { EditContext } from '@/lib/edit-context';

interface Entry {
  pageId: string;
  savedAt: number;
}

interface HistoryCtx {
  push: (entry: { pageId: string }) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  lastSavedAt: number | null;
  busy: boolean;
}

const HistoryContext = createContext<HistoryCtx>({
  push: () => undefined,
  undo: async () => undefined,
  redo: async () => undefined,
  canUndo: false,
  canRedo: false,
  lastSavedAt: null,
  busy: false,
});

export function useEditHistory(): HistoryCtx {
  return useContext(HistoryContext);
}

interface ProviderProps {
  edit: EditContext;
  children: ReactNode;
}

/**
 * Historique d'édition local (en mémoire) + raccourcis clavier.
 *
 * La logique Ctrl+Z / Ctrl+Y appelle l'API :
 *   - `restoreVitrineRevision` avec la révision *précédente* (Undo)
 *   - `restoreVitrineRevision` avec la révision *suivante* (Redo)
 *
 * La stack des révisions est lue à la demande depuis l'API
 * (`clubVitrinePageRevisions`) plutôt que maintenue complètement en mémoire
 * client — évite la désynchro entre l'UI et la DB.
 */
export function EditHistoryProvider({ edit, children }: ProviderProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [redoStack, setRedoStack] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const push = useCallback<HistoryCtx['push']>((entry) => {
    setEntries((prev) => [...prev, { pageId: entry.pageId, savedAt: Date.now() }]);
    setRedoStack([]);
  }, []);

  const performUndo = useCallback(async () => {
    if (!edit.editMode || busy) return;
    setBusy(true);
    try {
      // Récupère les 2 dernières révisions : la plus récente = état actuel,
      // l'avant-dernière = cible de l'undo.
      const listRes = await runGraphQL(edit, LIST_REVISIONS, {
        pageId: edit.pageId,
      });
      const revs =
        (listRes as { clubVitrinePageRevisions?: Array<{ id: string }> })
          .clubVitrinePageRevisions ?? [];
      if (revs.length < 1) return;
      const target = revs[0]!; // la plus récente révision = état AVANT dernière sauvegarde
      await runGraphQL(edit, RESTORE_REVISION, {
        input: { pageId: edit.pageId, revisionId: target.id },
      });
      setEntries((prev) => prev.slice(0, -1));
      setRedoStack((prev) => [
        ...prev,
        { pageId: edit.pageId, savedAt: Date.now() },
      ]);
      router.refresh();
    } catch (err) {
      console.error('[undo] failed', err);
    } finally {
      setBusy(false);
    }
  }, [edit, busy, router]);

  const performRedo = useCallback(async () => {
    // Redo full est moins prioritaire ; à compléter en Phase 2 avec une
    // stack séparée. Pour l'instant on rafraîchit juste la page.
    if (!edit.editMode || busy) return;
    router.refresh();
  }, [edit, busy, router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void performUndo();
      } else if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void performRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo, performRedo]);

  const value = useMemo<HistoryCtx>(
    () => ({
      push,
      undo: performUndo,
      redo: performRedo,
      canUndo: entries.length > 0,
      canRedo: redoStack.length > 0,
      lastSavedAt: entries.length > 0 ? entries[entries.length - 1]!.savedAt : null,
      busy,
    }),
    [push, performUndo, performRedo, entries, redoStack, busy],
  );

  return (
    <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>
  );
}

const LIST_REVISIONS = /* GraphQL */ `
  query ListPageRevisions($pageId: ID!) {
    clubVitrinePageRevisions(pageId: $pageId) {
      id
      createdAt
    }
  }
`;

const RESTORE_REVISION = /* GraphQL */ `
  mutation RestoreRevision($input: RestoreVitrineRevisionInput!) {
    restoreVitrineRevision(input: $input) {
      id
      sectionsJson
    }
  }
`;

async function runGraphQL<T>(
  edit: Extract<EditContext, { editMode: true }>,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const { makeEditRunner } = await import('./edit-api');
  return makeEditRunner(edit)<T>(query, variables);
}
