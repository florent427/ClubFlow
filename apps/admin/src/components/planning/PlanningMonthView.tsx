import { eachDayOfInterval } from 'date-fns/eachDayOfInterval';
import { endOfMonth } from 'date-fns/endOfMonth';
import { endOfWeek } from 'date-fns/endOfWeek';
import { format } from 'date-fns/format';
import { startOfMonth } from 'date-fns/startOfMonth';
import { startOfWeek } from 'date-fns/startOfWeek';
import type { CourseSlotsQueryData } from '../../lib/types';
import { slotIntersectsLocalDay } from '../../lib/planning-calendar';

type Slot = CourseSlotsQueryData['clubCourseSlots'][number];

function isSameMonthLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  );
}

type PlanningMonthViewProps = {
  /** N'importe quel jour du mois affiché (sera normalisé au mois). */
  monthPivot: Date;
  slots: Slot[];
  onSelectDay: (d: Date) => void;
};

export function PlanningMonthView({
  monthPivot,
  slots,
  onSelectDay,
}: PlanningMonthViewProps) {
  const monthStart = startOfMonth(monthPivot);
  const monthEnd = endOfMonth(monthPivot);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weekdayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  function countForDay(d: Date): number {
    return slots.filter((s) =>
      slotIntersectsLocalDay(s.startsAt, s.endsAt, d),
    ).length;
  }

  return (
    <div className="planning-month">
      <div className="planning-month__weekdays">
        {weekdayLabels.map((w) => (
          <div key={w} className="planning-month__weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="planning-month__grid">
        {days.map((d: Date) => {
          const inMonth = isSameMonthLocal(d, monthStart);
          const n = countForDay(d);
          return (
            <button
              key={d.toISOString()}
              type="button"
              className={`planning-month__cell${inMonth ? '' : ' planning-month__cell--muted'}`}
              onClick={() => onSelectDay(d)}
            >
              <span className="planning-month__daynum">
                {format(d, 'd')}
              </span>
              {n > 0 ? (
                <span className="planning-month__badge" title={`${n} créneau(x)`}>
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="planning-month__hint muted">
        {monthStart.toLocaleDateString('fr-FR', {
          month: 'long',
          year: 'numeric',
        })}{' '}
        — cliquez un jour pour ouvrir la semaine.
      </p>
    </div>
  );
}
