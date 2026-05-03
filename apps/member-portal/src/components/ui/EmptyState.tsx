import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mp-empty-state" role="status">
      {icon ? (
        <span className="material-symbols-outlined mp-empty-state__ico" aria-hidden>
          {icon}
        </span>
      ) : null}
      <h3 className="mp-empty-state__title">{title}</h3>
      {message ? <p className="mp-empty-state__msg">{message}</p> : null}
      {action ? <div className="mp-empty-state__action">{action}</div> : null}
    </div>
  );
}
