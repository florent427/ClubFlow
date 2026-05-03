import type { ReactNode } from 'react';

export function ErrorState({
  title = 'Une erreur est survenue',
  message,
  action,
}: {
  title?: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cf-error-state" role="alert">
      <span className="material-symbols-outlined cf-error-state__ico" aria-hidden>
        error
      </span>
      <div className="cf-error-state__body">
        <h3 className="cf-error-state__title">{title}</h3>
        {message ? <p className="cf-error-state__msg">{message}</p> : null}
        {action ? <div className="cf-error-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
