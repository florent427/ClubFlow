import { useState, type CSSProperties } from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';

type CourseSlotBlockProps = {
  title: string;
  timeLabel: string;
  coachLabel: string;
  venueLabel?: string;
  groupLabel?: string | null;
  hasConflict: boolean;
  topPx: number;
  heightPx: number;
  /** Partage horizontal quand plusieurs créneaux se chevauchent (défaut : pleine largeur). */
  leftPct?: number;
  widthPct?: number;
  minHeightPx?: number;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: DraggableAttributes;
  dragRef?: (node: HTMLElement | null) => void;
  transformStyle?: CSSProperties['transform'];
  isDragging?: boolean;
  onOpenDetails?: () => void;
  /** deltaYPx depuis pointerdown : début (haut) ou fin (bas) du créneau. */
  onResizeCommit?: (edge: 'start' | 'end', deltaYPx: number) => void;
  /** none pendant le drag d'un autre créneau — évite de bloquer le mouvement au-dessus des voisins. */
  pointerEvents?: 'auto' | 'none';
};

const MIN_BLOCK_PX = 24;

export function CourseSlotBlock({
  title,
  timeLabel,
  coachLabel,
  venueLabel,
  groupLabel,
  hasConflict,
  topPx,
  heightPx,
  leftPct = 0,
  widthPct = 100,
  minHeightPx = MIN_BLOCK_PX,
  dragListeners,
  dragAttributes,
  dragRef,
  transformStyle,
  isDragging,
  onOpenDetails,
  onResizeCommit,
  pointerEvents = 'auto',
}: CourseSlotBlockProps) {
  const h = Math.max(minHeightPx, heightPx);
  const [resizePreview, setResizePreview] = useState<{
    edge: 'start' | 'end';
    dy: number;
  } | null>(null);

  const marginTop =
    resizePreview?.edge === 'start' ? resizePreview.dy : 0;
  const heightExtra =
    resizePreview?.edge === 'start'
      ? -resizePreview.dy
      : resizePreview?.edge === 'end'
        ? resizePreview.dy
        : 0;
  const visualH = Math.max(minHeightPx, h + heightExtra);

  const accent = hasConflict
    ? 'var(--cf-planning-conflict-accent, #ba1a1a)'
    : 'var(--cf-planning-accent, #0056c5)';

  function attachResizePointer(
    edge: 'start' | 'end',
    e: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (!onResizeCommit) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    setResizePreview({ edge, dy: 0 });
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      setResizePreview({ edge, dy: ev.clientY - startY });
    };
    let finished = false;
    const onEnd = (ev: PointerEvent) => {
      if (finished || ev.pointerId !== e.pointerId) return;
      finished = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const dy = ev.clientY - startY;
      setResizePreview(null);
      if (dy !== 0) onResizeCommit(edge, dy);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  return (
    <div
      ref={dragRef}
      className={`course-slot-block${isDragging ? ' course-slot-block--dragging' : ''}${hasConflict ? ' course-slot-block--conflict' : ''}`}
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        boxSizing: 'border-box',
        top: topPx,
        marginTop,
        height: visualH,
        ['--slot-h' as string]: `${Math.round(visualH)}px`,
        transform: transformStyle,
        zIndex: isDragging ? 1000 : 2,
        pointerEvents,
        touchAction: dragListeners ? 'none' : undefined,
        minHeight: minHeightPx,
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: accent,
        borderRadius: '0.75rem',
        background: hasConflict
          ? 'rgba(255, 218, 214, 0.35)'
          : 'var(--cf-surface-lowest, #ffffff)',
        boxShadow: isDragging
          ? '0 12px 32px -4px rgba(25, 28, 29, 0.12)'
          : '0 1px 3px rgba(25, 28, 29, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'stretch',
        padding: 0,
        textAlign: 'left',
        cursor: 'default',
        overflow: 'hidden',
      }}
    >
      {onResizeCommit ? (
        <button
          type="button"
          aria-label="Ajuster l’heure de début"
          className="course-slot-block__resize-handle course-slot-block__resize-handle--start"
          onPointerDown={(e) => attachResizePointer('start', e)}
        />
      ) : null}
      <div
        {...dragListeners}
        {...dragAttributes}
        role="button"
        tabIndex={0}
        className="course-slot-block__body"
        style={{
          flex: 1,
          minHeight: 0,
          cursor: 'grab',
        }}
        title={
          onOpenDetails
            ? 'Double-clic pour ouvrir la fiche — glisser pour déplacer'
            : undefined
        }
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenDetails?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onOpenDetails) {
            e.preventDefault();
            onOpenDetails();
          }
        }}
      >
        <div className="course-slot-block__head">
          <span className="course-slot-block__title" title={title}>
            {title}
          </span>
          {groupLabel ? (
            <span className="course-slot-block__chip">{groupLabel}</span>
          ) : null}
          {hasConflict ? (
            <span className="material-symbols-outlined course-slot-block__warn" aria-hidden>
              warning
            </span>
          ) : null}
        </div>
        <div className="course-slot-block__main">
          <p className="course-slot-block__meta course-slot-block__time muted" title={timeLabel}>
            {timeLabel}
          </p>
          {venueLabel ? (
            <p
              className="course-slot-block__meta course-slot-block__venue muted"
              title={venueLabel}
            >
              {venueLabel}
            </p>
          ) : null}
        </div>
        <p className="course-slot-block__coach" title={coachLabel}>
          {coachLabel}
        </p>
      </div>
      {onResizeCommit ? (
        <button
          type="button"
          aria-label="Ajuster l’heure de fin"
          className="course-slot-block__resize-handle course-slot-block__resize-handle--end"
          onPointerDown={(e) => attachResizePointer('end', e)}
        />
      ) : null}
    </div>
  );
}
