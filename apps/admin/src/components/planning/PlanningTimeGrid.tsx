import { useMemo } from 'react';
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
  PLANNING_GRID_DEFAULTS,
  coachOverlapIds,
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
  children,
}: {
  day: Date;
  totalHeightPx: number;
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
      }}
    >
      {children}
    </div>
  );
}

function DraggableSlot({
  slot,
  day,
  layout,
  hasConflict,
  coachLabel,
  venueLabel,
  groupLabel,
  timeLabel,
  onResizeCommit,
  onOpenDetails,
}: {
  slot: Slot;
  day: Date;
  layout: { topPx: number; heightPx: number };
  hasConflict: boolean;
  coachLabel: string;
  venueLabel?: string;
  groupLabel?: string | null;
  timeLabel: string;
  onResizeCommit: (deltaYPx: number) => void;
  onOpenDetails?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `slot-${slot.id}-${dayKey(day)}`,
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
      dragListeners={listeners as Record<string, unknown>}
      dragAttributes={attributes}
      dragRef={setNodeRef}
      transformStyle={transformStyle}
      isDragging={isDragging}
      onResizeCommit={onResizeCommit}
      onOpenDetails={onOpenDetails}
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
}: PlanningTimeGridProps) {
  const totalHeightPx =
    (grid.maxHour - grid.minHour) * grid.pixelsPerHour;

  const overlapIds = useMemo(() => coachOverlapIds(slots), [slots]);

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
    const deltaMs =
      (delta.y / grid.pixelsPerHour) * 60 * 60 * 1000;
    const movedStart = addDays(new Date(slot.startsAt), deltaDays);
    const newStart = snapInstantToUtcQuarterHour(
      new Date(movedStart.getTime() + deltaMs),
    );
    const duration =
      new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime();
    const newEnd = new Date(newStart.getTime() + duration);
    if (newEnd <= newStart) return;
    onSlotTimeChange(slot.id, {
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
    });
  }

  function commitResize(slot: Slot, deltaYPx: number) {
    const deltaMs = (deltaYPx / grid.pixelsPerHour) * 60 * 60 * 1000;
    const start = new Date(slot.startsAt);
    const end = new Date(slot.endsAt);
    const newEnd = snapInstantToUtcQuarterHour(new Date(end.getTime() + deltaMs));
    if (newEnd <= start) return;
    onSlotTimeChange(slot.id, {
      startsAt: start.toISOString(),
      endsAt: newEnd.toISOString(),
    });
  }

  const hours: number[] = [];
  for (let h = grid.minHour; h < grid.maxHour; h++) hours.push(h);

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
          {days.map((d) => (
            <div key={dayKey(d)} className="planning-time-grid__head">
              {onDayHeaderClick ? (
                <button
                  type="button"
                  className="planning-time-grid__head-btn"
                  onClick={() => onDayHeaderClick(d)}
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
          ))}

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
            <DayColumn key={dayKey(day)} day={day} totalHeightPx={totalHeightPx}>
              {hours.map((h) => (
                <div
                  key={h}
                  aria-hidden
                  className="planning-time-grid__slot-line"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (h - grid.minHour) * grid.pixelsPerHour,
                    height: grid.pixelsPerHour,
                    borderBottom: '1px solid rgba(198, 197, 212, 0.2)',
                    pointerEvents: 'none',
                  }}
                />
              ))}
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
                  return (
                    <DraggableSlot
                      key={`${slot.id}-${dayKey(day)}`}
                      slot={slot}
                      day={day}
                      layout={layout}
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
                      onResizeCommit={(dy) => commitResize(slot, dy)}
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
