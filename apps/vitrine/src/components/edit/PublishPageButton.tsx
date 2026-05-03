'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { makeEditRunner } from './edit-api';
import type { EditContext } from '@/lib/edit-context';

interface Props {
  edit: Extract<EditContext, { editMode: true }>;
  pageStatus: 'PUBLISHED' | 'DRAFT';
  pageSlug: string;
}

/**
 * Bouton flottant « Publier / Dépublier » cette page — visible uniquement
 * en mode édition, positionné en bas à gauche (en miroir de UndoRedoBar).
 */
export function PublishPageButton({ edit, pageStatus, pageSlug }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(): Promise<void> {
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
        { input: { pageId: edit.pageId, status: next } },
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec');
    } finally {
      setBusy(false);
    }
  }

  const isPublished = pageStatus === 'PUBLISHED';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-start',
        zIndex: 1001,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: isPublished ? 'var(--accent)' : 'var(--vermillion)',
          fontFamily: 'var(--sans)',
          background: 'var(--ink)',
          padding: '4px 10px',
          border: `1px solid ${isPublished ? 'var(--accent)' : 'var(--vermillion)'}`,
          borderRadius: 999,
        }}
      >
        /{pageSlug === 'index' ? '' : pageSlug} ·{' '}
        {isPublished ? 'Publié' : 'Brouillon'}
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        style={{
          padding: '8px 16px',
          background: 'var(--ink)',
          color: isPublished ? 'var(--vermillion)' : 'var(--accent)',
          border: `1px solid ${isPublished ? 'var(--vermillion)' : 'var(--accent)'}`,
          borderRadius: 999,
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
          fontFamily: 'var(--sans)',
          fontWeight: 600,
        }}
      >
        {busy ? '…' : isPublished ? 'Dépublier cette page' : 'Publier cette page'}
      </button>
      {error ? (
        <span style={{ color: 'var(--vermillion)', fontSize: 11 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
