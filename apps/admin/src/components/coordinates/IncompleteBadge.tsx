/** Badge « Fiche incomplète » ; la liste de ce qui manque est dans l'infobulle. */
export function IncompleteBadge({
  gaps,
  compact = false,
}: {
  gaps: string[];
  compact?: boolean;
}) {
  if (gaps.length === 0) return null;
  const tip = `Manque : ${gaps.join(', ')}`;
  return (
    <span
      className="cf-badge cf-badge--warning cf-incomplete-badge"
      title={tip}
      aria-label={`Fiche incomplète. ${tip}`}
    >
      <span className="material-symbols-outlined" aria-hidden>
        error
      </span>
      {compact ? 'Incomplète' : 'Fiche incomplète'}
    </span>
  );
}
