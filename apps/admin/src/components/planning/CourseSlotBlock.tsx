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
  minHeightPx?: number;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: DraggableAttributes;
  dragRef?: (node: HTMLElement | null) => void;
  transformStyle?: CSSProperties['transform'];
  isDragging?: boolean;
  onOpenDetails?: () => void;
  onResizeCommit?: (deltaYPx: number) => void;
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
  minHeightPx = MIN_BLOCK_PX,
  dragListeners,
  dragAttributes,
  dragRef,
  transformStyle,
  isDragging,
  onOpenDetails,
  onResizeCommit,
}: CourseSlotBlockProps) {
  const h = Math.max(minHeightPx, heightPx);
  const [previewDy, setPreviewDy] = useState(0);

  const accent = hasConflict
    ? 'var(--cf-planning-conflict-accent, #ba1a1a)'
    : 'var(--cf-planning-accent, #0056c5)';

  return (
    <div
      ref={dragRef}
      className={`course-slot-block${isDragging ? ' course-slot-block--dragging' : ''}${hasConflict ? ' course-slot-block--conflict' : ''}`}
      style={{
        position: 'absolute',
        left: 4,
        right: 4,
        top: topPx,
        height: h + previewDy,
        transform: transformStyle,
        zIndex: isDragging ? 20 : 2,
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
        justifyContent: 'space-between',
        padding: '0.35rem 0.5rem',
        fontSize: '0.7rem',
        textAlign: 'left',
        cursor: 'grab',
        overflow: 'hidden',
      }}
    >
      <div
        {...dragListeners}
        {...dragAttributes}
        role="button"
        tabIndex={0}
        className="course-slot-block__body"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onOpenDetails) {
            e.preventDefault();
            onOpenDetails();
          }
        }}
      >
        <div className="course-slot-block__head">
          <span className="course-slot-block__title">{title}</span>
          {groupLabel ? (
            <span className="course-slot-block__chip">{groupLabel}</span>
          ) : null}
          {hasConflict ? (
            <span className="material-symbols-outlined course-slot-block__warn" aria-hidden>
              warning
            </span>
          ) : null}
        </div>
        <p className="course-slot-block__meta muted">{timeLabel}</p>
        {venueLabel ? (
          <p className="course-slot-block__meta muted">{venueLabel}</p>
        ) : null}
        <p className="course-slot-block__coach">{coachLabel}</p>
      </div>
      {onResizeCommit ? (
        <button
          type="button"
          aria-label="Redimensionner la durée"
          className="course-slot-block__resize"
          style={{
            minHeight: 24,
            height: 24,
            marginTop: 'auto',
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            cursor: 'ns-resize',
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startY = e.clientY;
            const onMove = (ev: PointerEvent) =>
              setPreviewDy(ev.clientY - startY);
            const onUp = (ev: PointerEvent) => {
              window.removeEventListener('pointermove', onMove);
              const dy = ev.clientY - startY;
              setPreviewDy(0);
              if (dy !== 0) onResizeCommit(dy);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp, { once: true });
          }}
        />
      ) : null}
    </div>
  );
}
