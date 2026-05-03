'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { makeEditRunner } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

interface EditModeToolbarProps {
  clubName: string;
  /** Contexte d'édition (JWT + pageId + apiUrl). Absent hors edit mode. */
  edit?: EditContext;
  /** Statut courant de la page rendue (PUBLISHED / DRAFT). */
  pageStatus?: 'PUBLISHED' | 'DRAFT';
  /** Slug de la page courante (pour affichage). */
  pageSlug?: string;
}

/**
 * Barre supérieure visible uniquement en mode édition admin.
 *
 * Expose :
 *  - Quitter l'édition (efface le cookie via API)
 *  - Rafraîchir
 *  - Publier / Dépublier la page courante
 *  - Affichage du statut (Publié / Brouillon)
 */
export function EditModeToolbar({
  clubName,
  edit,
  pageStatus,
  pageSlug,
}: EditModeToolbarProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exitEditMode(): Promise<void> {
    try {
      await fetch('/api/edit/exit', { method: 'POST' });
      router.refresh();
    } catch {
      /* no-op */
    }
  }

  async function togglePublish(): Promise<void> {
    if (!edit || !edit.editMode || !pageStatus) return;
    setBusy(true);
    setError(null);
    try {
      const runner = makeEditRunner(edit);
      const next = pageStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
      await runner<unknown>(
        /* GraphQL */ `
          mutation SetStatus($input: SetVitrinePageStatusInput!) {
            setVitrinePageStatus(input: $input) {
              id
              status
            }
          }
        `,
        {
          input: { pageId: edit.pageId, status: next },
        },
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    pageStatus === 'PUBLISHED'
      ? 'Publié'
      : pageStatus === 'DRAFT'
        ? 'Brouillon'
        : null;
  const statusColor =
    pageStatus === 'PUBLISHED' ? 'var(--accent)' : 'var(--vermillion)';

  return (
    <div className="edit-toolbar" role="region" aria-label="Mode édition">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="edit-toolbar__label">Édition</span>
        <span style={{ opacity: 0.75 }}>
          {clubName}
          {pageSlug ? ` · /${pageSlug === 'index' ? '' : pageSlug}` : ''}
        </span>
        {statusLabel ? (
          <span
            style={{
              padding: '2px 8px',
              border: `1px solid ${statusColor}`,
              color: statusColor,
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              borderRadius: 999,
            }}
          >
            {statusLabel}
          </span>
        ) : null}
        {error ? (
          <span style={{ color: 'var(--vermillion)', fontSize: 11 }}>
            {error}
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        {pageStatus ? (
          <button
            type="button"
            className="btn"
            style={{ padding: '6px 14px', fontSize: 11 }}
            disabled={busy}
            onClick={() => void togglePublish()}
          >
            {busy
              ? '…'
              : pageStatus === 'PUBLISHED'
                ? 'Dépublier'
                : 'Publier'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          style={{ padding: '6px 14px', fontSize: 11 }}
          onClick={() => router.refresh()}
        >
          Actualiser
        </button>
        <button
          type="button"
          className="btn"
          style={{ padding: '6px 14px', fontSize: 11 }}
          onClick={() => void exitEditMode()}
        >
          Quitter l’édition
        </button>
      </div>
    </div>
  );
}
