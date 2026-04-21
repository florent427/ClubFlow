'use client';

import { useEditHistory } from './EditHistoryProvider';

/**
 * Barre flottante Ctrl+Z / Ctrl+Y.
 *
 * Visible uniquement après la première édition (stack non vide).
 */
export function UndoRedoBar() {
  const { canUndo, canRedo, undo, redo, busy, lastSavedAt } = useEditHistory();
  if (!canUndo && !canRedo) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: 'var(--ink)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        borderRadius: 999,
        zIndex: 1001,
        fontFamily: 'var(--sans)',
        fontSize: 12,
        color: 'var(--paper)',
      }}
      role="region"
      aria-label="Historique d'édition"
    >
      <button
        type="button"
        disabled={!canUndo || busy}
        onClick={() => void undo()}
        style={barButtonStyle(canUndo && !busy)}
        title="Annuler la dernière modification (Ctrl+Z)"
      >
        ↶ Annuler
      </button>
      <button
        type="button"
        disabled={!canRedo || busy}
        onClick={() => void redo()}
        style={barButtonStyle(canRedo && !busy)}
        title="Rétablir (Ctrl+Y)"
      >
        Rétablir ↷
      </button>
      {lastSavedAt ? (
        <span
          style={{
            fontSize: 10,
            color: 'var(--muted)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Enregistré
        </span>
      ) : null}
    </div>
  );
}

function barButtonStyle(enabled: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid ' + (enabled ? 'var(--accent)' : 'var(--line)'),
    color: enabled ? 'var(--accent)' : 'var(--muted)',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    cursor: enabled ? 'pointer' : 'not-allowed',
  };
}
