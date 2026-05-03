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
    <div className="mp-error-state" role="alert">
      <span className="material-symbols-outlined mp-error-state__ico" aria-hidden>
        error
      </span>
      <div className="mp-error-state__body">
        <h3 className="mp-error-state__title">{title}</h3>
        {message ? <p className="mp-error-state__msg">{message}</p> : null}
        {action ? <div className="mp-error-state__action">{action}</div> : null}
      </div>
    </div>
  );
}
