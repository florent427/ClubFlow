import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { addWeeks } from 'date-fns/addWeeks';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { startOfDay } from 'date-fns/startOfDay';

export type PlanningView = 'month' | 'week' | 'day';

function parseView(v: string | null): PlanningView {
  if (v === 'month' || v === 'week' || v === 'day') return v;
  return 'week';
}

function parsePivotDate(s: string | null): Date {
  if (!s) return startOfDay(new Date());
  try {
    const d = parseISO(s);
    if (Number.isNaN(d.getTime())) return startOfDay(new Date());
    return startOfDay(d);
  } catch {
    return startOfDay(new Date());
  }
}

export function usePlanningCalendarSearchParams(): {
  view: PlanningView;
  pivotDate: Date;
  setView: (v: PlanningView) => void;
  setPivotDate: (d: Date) => void;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const view = parseView(searchParams.get('view'));
  const pivotDate = useMemo(
    () => parsePivotDate(searchParams.get('date')),
    [searchParams],
  );

  const apply = useCallback(
    (nextView: PlanningView, nextDate: Date) => {
      const p = new URLSearchParams(searchParams);
      p.set('view', nextView);
      p.set('date', format(startOfDay(nextDate), 'yyyy-MM-dd'));
      setSearchParams(p, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setView = useCallback(
    (v: PlanningView) => apply(v, pivotDate),
    [apply, pivotDate],
  );

  const setPivotDate = useCallback(
    (d: Date) => apply(view, d),
    [apply, view],
  );

  const goNext = useCallback(() => {
    if (view === 'month') apply(view, addMonths(pivotDate, 1));
    else if (view === 'week') apply(view, addWeeks(pivotDate, 1));
    else apply(view, addDays(pivotDate, 1));
  }, [apply, view, pivotDate]);

  const goPrev = useCallback(() => {
    if (view === 'month') apply(view, addMonths(pivotDate, -1));
    else if (view === 'week') apply(view, addWeeks(pivotDate, -1));
    else apply(view, addDays(pivotDate, -1));
  }, [apply, view, pivotDate]);

  const goToday = useCallback(() => {
    apply(view, new Date());
  }, [apply, view]);

  return {
    view,
    pivotDate,
    setView,
    setPivotDate,
    goNext,
    goPrev,
    goToday,
  };
}
