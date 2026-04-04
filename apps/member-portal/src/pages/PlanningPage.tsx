import { useQuery } from '@apollo/client/react';
import { Navigate } from 'react-router-dom';
import { VIEWER_ME, VIEWER_UPCOMING_SLOTS } from '../lib/viewer-documents';
import type { ViewerMeData } from '../lib/viewer-types';
import type { ViewerSlot, ViewerUpcomingData } from '../lib/viewer-types';
import { formatRangeHours, slotCalendarBits } from '../lib/format';

function SlotRow({ slot }: { slot: ViewerSlot }) {
  const { weekday, dayNum } = slotCalendarBits(slot.startsAt);
  const coach = [slot.coachFirstName, slot.coachLastName]
    .filter(Boolean)
    .join(' ');
  return (
    <article className="mp-card mp-slot-row mp-slot-row-lg">
      <div className="mp-slot-cal">
        <span className="mp-slot-dow">{weekday}</span>
        <span className="mp-slot-day">{dayNum}</span>
      </div>
      <div className="mp-slot-body">
        <h2 className="mp-slot-title">{slot.title}</h2>
        <p className="mp-slot-meta">
          {formatRangeHours(slot.startsAt, slot.endsAt)} · {slot.venueName}
          {coach ? ` · Coach : ${coach}` : ''}
        </p>
      </div>
    </article>
  );
}

export function PlanningPage() {
  const { data: meData, loading: meLoading } = useQuery<ViewerMeData>(
    VIEWER_ME,
    { fetchPolicy: 'cache-first' },
  );
  const hideMemberModules =
    meData?.viewerMe?.hideMemberModules === true;

  const { data, loading, error } = useQuery<ViewerUpcomingData>(
    VIEWER_UPCOMING_SLOTS,
    { skip: meLoading || hideMemberModules, errorPolicy: 'all' },
  );

  if (meLoading) {
    return (
      <div className="mp-page">
        <h1 className="mp-page-title">Planning</h1>
        <p className="mp-hint">Chargement…</p>
      </div>
    );
  }
  if (hideMemberModules) {
    return <Navigate to="/" replace />;
  }

  const slots = data?.viewerUpcomingCourseSlots ?? [];

  return (
    <div className="mp-page">
      <h1 className="mp-page-title">Planning</h1>
      <p className="mp-lead">
        Vos prochains créneaux de cours liés à votre profil.
      </p>

      {error ? (
        <p className="mp-hint">
          Impossible d’afficher le planning (module désactivé ou droits
          insuffisants).
        </p>
      ) : loading ? (
        <p className="mp-hint">Chargement…</p>
      ) : slots.length === 0 ? (
        <p className="mp-hint">Aucun cours à venir.</p>
      ) : (
        <div className="mp-stack">
          {slots.map((s) => (
            <SlotRow key={s.id} slot={s} />
          ))}
        </div>
      )}
    </div>
  );
}
