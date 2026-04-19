export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="mp-loading-state" role="status" aria-live="polite">
      <span className="mp-loading-state__spinner" aria-hidden />
      <span className="mp-loading-state__label">{label}</span>
    </div>
  );
}

export function Skeleton({
  width,
  height = 16,
  rounded = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  rounded?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className="mp-skeleton"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: `${rounded}px`,
        ...style,
      }}
      aria-hidden
    />
  );
}
