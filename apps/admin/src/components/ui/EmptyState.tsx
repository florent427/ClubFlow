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
    <div className="cf-empty-state" role="status">
      {icon ? (
        <span className="material-symbols-outlined cf-empty-state__ico" aria-hidden>
          {icon}
        </span>
      ) : null}
      <h3 className="cf-empty-state__title">{title}</h3>
      {message ? <p className="cf-empty-state__msg">{message}</p> : null}
      {action ? <div className="cf-empty-state__action">{action}</div> : null}
    </div>
  );
}
