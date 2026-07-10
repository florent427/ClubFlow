import { frenchError } from '../lib/errors';

/**
 * Affichage d'erreur de query standardisé : message traduit en français
 * (cf. lib/errors.ts) + bouton "Réessayer" optionnel branché sur refetch.
 *
 * Cf. bug QA M2 : `{error.message}` brut affiché à l'utilisateur.
 */
export function QueryError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <p className="form-error" role="alert">
      {frenchError(error)}
      {onRetry ? (
        <>
          {' '}
          <button type="button" className="btn-ghost btn-tight" onClick={onRetry}>
            Réessayer
          </button>
        </>
      ) : null}
    </p>
  );
}
