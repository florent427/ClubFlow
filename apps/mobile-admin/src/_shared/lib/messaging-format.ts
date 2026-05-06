const WEEKDAYS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDays(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatBubbleTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatRoomDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const now = new Date();
  const days = diffDays(d, now);
  if (days === 0) return formatBubbleTime(d);
  if (days === 1) return 'Hier';
  if (days < 7) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function formatThreadSeparatorDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const now = new Date();
  const days = diffDays(d, now);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return WEEKDAYS[d.getDay()];
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric',
  });
}

const AUTHOR_COLORS = [
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#65a30d',
  '#16a34a',
  '#0891b2',
  '#0284c7',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#db2777',
  '#e11d48',
];

export function authorColor(authorId: string): string {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) {
    hash = (hash * 31 + authorId.charCodeAt(i)) | 0;
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (
    (parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')
  ).toUpperCase();
}
