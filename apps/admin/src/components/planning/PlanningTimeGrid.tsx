import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { addDays } from 'date-fns/addDays';
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfDay } from 'date-fns/startOfDay';
import { CourseSlotBlock } from './CourseSlotBlock';
import type { CourseSlotsQueryData } from '../../lib/types';
import {
  MS_QUARTER_HOUR,
  PLANNING_GRID_DEFAULTS,
  coachOverlapIds,
  gridRelativeYToStartDate,
  layoutOverlappingSlotsForDay,
  layoutSlotOnDay,
  slotIntersectsLocalDay,
  snapInstantToUtcQuarterHour,
} from '../../lib/planning-calendar';

type Slot = CourseSlotsQueryData['clubCourseSlots'][number];

type PlanningTimeGridProps = {
  /** Jours affichés (longueur 1 ou 7), ordre gauche → droite. */
  days: Date[];
  slots: Slot[];
  coachNameById: Map<string, string>;
  venueNameById: Map<string, string>;
  groupNameById: Map<string, string>;
  onSlotTimeChange: (
    slotId: string,
    next: { startsAt: string; endsAt: string },
  ) => void;
  /** Clic sur l'en-tête d'une colonne jour (ex. passage semaine → jour). */
  onDayHeaderClick?: (d: Date) => void;
  /** Double-clic sur un bloc créneau (fiche détail). */
  onSlotOpen?: (slotId: string) => void;
  /**
   * Double-clic sur une zone vide d'une colonne jour : ouvre la création
   * d'un créneau pré-rempli sur ce jour à l'heure calculée.
   */
  onCellClick?: (day: Date, hour: number, minute: number) => void;
};

const grid = {
  minHour: PLANNING_GRID_DEFAULTS.MIN_HOUR,
  maxHour: PLANNING_GRID_DEFAULTS.MAX_HOUR,
  pixelsPerHour: PLANNING_GRID_DEFAULTS.PIXELS_PER_HOUR,
};

function dayKey(d: Date): string {
  return format(startOfDay(d), 'yyyy-MM-dd');
}

function DayColumn({
  day,
  totalHeightPx,
  pixelsPerHour,
  minHour,
  onCellClick,
  children,
}: {
  day: Date;
  totalHeightPx: number;
  pixelsPerHour: number;
  minHour: number;
  onCellClick?: (day: Date, hour: number, minute: number) => void;
  children: React.ReactNode;
}) {
  const id = `day-${dayKey(day)}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="planning-day-col"
      style={{
        position: 'relative',
        minHeight: totalHeightPx,
        borderRadius: 8,
        background: isOver
          ? 'rgba(0, 86, 197, 0.06)'
          : 'rgba(243, 244, 245, 0.6)',
        cursor: onCellClick ? 'copy' : undefined,
      }}
      onDoubleClick={(e) => {
        if (!onCellClick) return;
        // Si le double-clic a bullé depuis un slot (qui fait stopPropagation),
        // on ne l'atteindra jamais. Ici on est donc sur la zone vide.
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hoursFromMin = Math.max(0, y / pixelsPerHour);
        const totalMinutes = Math.floor(hoursFromMin * 60);
        const snapped = Math.floor(totalMinutes / 15) * 15;
        const hour = minHour + Math.floor(snapped / 60);
        const minute = snapped % 60;
        onCellClick(day, hour, minute);
      }}
      title={onCellClick ? 'Double-clic : créer un créneau ici' : undefined}
    >
      {children}
    </div>
  );
}

function DraggableSlot({
  slot,
  layout,
  horizontal,
  hasConflict,
  coachLabel,
  venueLabel,
  groupLabel,
  timeLabel,
  onResizeCommit,
  onOpenDetails,
  draggableId,
  pointerEventsBlocked,
}: {
  slot: Slot;
  layout: { topPx: number; heightPx: number };
  horizontal: { leftPct: number; widthPct: number };
  hasConflict: boolean;
  draggableId: string;
  /** true pour les autres créneaux pendant qu'un drag est actif — laisse passer le pointeur vers la colonne. */
  pointerEventsBlocked: boolean;
  coachLabel: string;
  venueLabel?: string;
  groupLabel?: string | null;
  timeLabel: string;
  onResizeCommit: (edge: 'start' | 'end', deltaYPx: number) => void;
  onOpenDetails?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: draggableId,
      data: { slot },
    });

  const transformStyle = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
    : undefined;

  return (
    <CourseSlotBlock
      title={slot.title}
      timeLabel={timeLabel}
      coachLabel={coachLabel}
      venueLabel={venueLabel}
      groupLabel={groupLabel}
      hasConflict={hasConflict}
      topPx={layout.topPx}
      heightPx={layout.heightPx}
      leftPct={horizontal.leftPct}
      widthPct={horizontal.widthPct}
      dragListeners={listeners as Record<string, unknown>}
      dragAttributes={attributes}
      dragRef={setNodeRef}
      transformStyle={transformStyle}
      isDragging={isDragging}
      onResizeCommit={onResizeCommit}
      onOpenDetails={onOpenDetails}
      pointerEvents={pointerEventsBlocked ? 'none' : 'auto'}
    />
  );
}

export function PlanningTimeGrid({
  days,
  slots,
  coachNameById,
  venueNameById,
  groupNameById,
  onSlotTimeChange,
  onDayHeaderClick,
  onSlotOpen,
  onCellClick,
}: PlanningTimeGridProps) {
  const totalHeightPx =
    (grid.maxHour - grid.minHour) * grid.pixelsPerHour;

  /** Pendant un drag, désactive le hit-test des autres blocs pour libérer le mouvement. */
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const overlapIds = useMemo(() => coachOverlapIds(slots), [slots]);

  const horizontalByDay = useMemo(() => {
    const m = new Map<string, Map<string, { leftPct: number; widthPct: number }>>();
    for (const day of days) {
      m.set(dayKey(day), layoutOverlappingSlotsForDay(slots, day));
    }
    return m;
  }, [slots, days]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  function formatRange(startsAt: string, endsAt: string): string {
    try {
      const a = new Date(startsAt);
      const b = new Date(endsAt);
      return `${a.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — ${b.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '—';
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    const payload = active.data.current as { slot?: Slot } | undefined;
    const slot = payload?.slot;
    if (!slot || !over) return;
    const oid = over.id.toString();
    if (!oid.startsWith('day-')) return;
    const targetKey = oid.slice('day-'.length);
    const targetDay = startOfDay(
      parse(targetKey, 'yyyy-MM-dd', new Date()),
    );
    const sourceDay = startOfDay(new Date(slot.startsAt));
    const deltaDays = differenceInCalendarDays(targetDay, sourceDay);

    const translated = active.rect.current.translated;
    const colRect = over.rect;

    let newStart: Date;
    if (translated && colRect) {
      /** Bord haut du bloc = heure de début ; cohérent avec la grille même en colonnes étroites. */
      const relY = translated.top - colRect.top;
      newStart = gridRelativeYToStartDate(relY, targetDay, grid);
    } else {
      const deltaMs =
        (delta.y / grid.pixelsPerHour) * 60 * 60 * 1000;
      const movedStart = addDays(new Date(slot.startsAt), deltaDays);
      newStart = snapInstantToUtcQuarterHour(
        new Date(movedStart.getTime() + deltaMs),
      );
    }

    const duration =
      new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    if (newEnd <= newStart) return;
    onSlotTimeChange(slot.id, {
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
    });
  }

  function commitResize(
    slot: Slot,
    deltaYPx: number,
    edge: 'start' | 'end',
  ) {
    const deltaMs = (deltaYPx / grid.pixelsPerHour) * 60 * 60 * 1000;
    const start = new Date(slot.startsAt);
    const end = new Date(slot.endsAt);
    if (edge === 'end') {
      const newEnd = snapInstantToUtcQuarterHour(
        new Date(end.getTime() + deltaMs),
      );
      if (newEnd <= start) return;
      if (newEnd.getTime() - start.getTime() < MS_QUARTER_HOUR) return;
      onSlotTimeChange(slot.id, {
        startsAt: start.toISOString(),
        endsAt: newEnd.toISOString(),
      });
    } else {
      const newStart = snapInstantToUtcQuarterHour(
        new Date(start.getTime() + deltaMs),
      );
      if (newStart >= end) return;
      if (end.getTime() - newStart.getTime() < MS_QUARTER_HOUR) return;
      onSlotTimeChange(slot.id, {
        startsAt: newStart.toISOString(),
        endsAt: end.toISOString(),
      });
    }
  }

  const hours: number[] = [];
  for (let h = grid.minHour; h < grid.maxHour; h++) hours.push(h);

  const quarterPx = grid.pixelsPerHour / 4;
  const quarterLineCount = (grid.maxHour - grid.minHour) * 4;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={({ active }) => setActiveDragId(active.id.toString())}
      onDragEnd={(e) => {
        handleDragEnd(e);
        setActiveDragId(null);
      }}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="planning-time-grid-wrap">
        <div
          className="planning-time-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `64px repeat(${days.length}, minmax(80px, 1fr))`,
            gap: 4,
            minWidth: 400 + days.length * 100,
          }}
        >
          <div aria-hidden className="planning-time-grid__corner" />
          {days.map((d) => {
            const today =
              d.getFullYear() === new Date().getFullYear() &&
              d.getMonth() === new Date().getMonth() &&
              d.getDate() === new Date().getDate();
            return (
            <div
              key={dayKey(d)}
              className={`planning-time-grid__head${today ? ' planning-time-grid__head--today' : ''}`}
            >
              {onDayHeaderClick ? (
                <button
                  type="button"
                  className={`planning-time-grid__head-btn${today ? ' planning-time-grid__head-btn--today' : ''}`}
                  onClick={() => onDayHeaderClick(d)}
                  aria-current={today ? 'date' : undefined}
                >
                  <span className="planning-time-grid__dow">
                    {d
                      .toLocaleDateString('fr-FR', { weekday: 'short' })
                      .replace(/\.$/, '')
                      .toUpperCase()}
                  </span>
                  <span className="planning-time-grid__dom muted">
                    {d.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </button>
              ) : (
                <div className="planning-time-grid__head-static">
                  <span className="planning-time-grid__dow">
                    {d
                      .toLocaleDateString('fr-FR', { weekday: 'short' })
                      .replace(/\.$/, '')
                      .toUpperCase()}
                  </span>
                  <span className="planning-time-grid__dom muted">
                    {d.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              )}
            </div>
            );
          })}

          <div
            className="planning-time-grid__hours"
            style={{ minHeight: totalHeightPx }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="planning-time-grid__hour-label muted"
                style={{ height: grid.pixelsPerHour }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((day) => (
            <DayColumn
              key={dayKey(day)}
              day={day}
              totalHeightPx={totalHeightPx}
              pixelsPerHour={grid.pixelsPerHour}
              minHour={grid.minHour}
              onCellClick={onCellClick}
            >
              {Array.from({ length: quarterLineCount }, (_, i) => {
                const isHourMark = i % 4 === 0;
                return (
                  <div
                    key={i}
                    aria-hidden
                    className={
                      isHourMark
                        ? 'planning-time-grid__slot-line planning-time-grid__slot-line--hour'
                        : 'planning-time-grid__slot-line planning-time-grid__slot-line--quarter'
                    }
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: i * quarterPx,
                      height: quarterPx,
                      pointerEvents: 'none',
                    }}
                  />
                );
              })}
              {slots
                .filter((s) =>
                  slotIntersectsLocalDay(s.startsAt, s.endsAt, day),
                )
                .map((slot) => {
                  const layout = layoutSlotOnDay(
                    slot.startsAt,
                    slot.endsAt,
                    day,
                    grid,
                  );
                  if (!layout) return null;
                  const hMap = horizontalByDay.get(dayKey(day));
                  const horizontal = hMap?.get(slot.id) ?? {
                    leftPct: 0,
                    widthPct: 100,
                  };
                  const did = `slot-${slot.id}-${dayKey(day)}`;
                  return (
                    <DraggableSlot
                      key={did}
                      slot={slot}
                      layout={layout}
                      horizontal={horizontal}
                      draggableId={did}
                      pointerEventsBlocked={
                        activeDragId !== null && activeDragId !== did
                      }
                      hasConflict={overlapIds.has(slot.id)}
                      coachLabel={
                        coachNameById.get(slot.coachMemberId) ??
                        slot.coachMemberId
                      }
                      venueLabel={venueNameById.get(slot.venueId)}
                      groupLabel={
                        slot.dynamicGroupId
                          ? groupNameById.get(slot.dynamicGroupId) ?? null
                          : null
                      }
                      timeLabel={formatRange(slot.startsAt, slot.endsAt)}
                      onResizeCommit={(edge, dy) =>
                        commitResize(slot, dy, edge)
                      }
                      onOpenDetails={
                        onSlotOpen
                          ? () => onSlotOpen(slot.id)
                          : undefined
                      }
                    />
                  );
                })}
            </DayColumn>
          ))}
        </div>
      </div>
    </DndContext>
  );
}
