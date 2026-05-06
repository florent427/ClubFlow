/** Formatage cents → € français. */
export function formatEuroCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Plage horaire (ex: "18:00 – 19:30"). */
export function formatRangeHours(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const tf = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${tf.format(s)} – ${tf.format(e)}`;
}

/** Date format français court (ex : "15 mars"). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

/** Date + heure ("15 mars · 18:00"). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  const time = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${time}`;
}

/** Bits calendrier (ex : weekday "lun.", dayNum "15"). */
export function slotCalendarBits(iso: string): {
  weekday: string;
  dayNum: string;
} {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
    dayNum: String(d.getDate()),
  };
}

/** Format relatif ("il y a 3 j", "dans 2 mois"). */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  const absDays = Math.floor(Math.abs(diffMs) / 86_400_000);

  if (absDays < 1) {
    const absHours = Math.floor(Math.abs(diffMs) / 3_600_000);
    if (absHours < 1) return diffMs < 0 ? 'à l\'instant' : 'maintenant';
    return diffMs < 0 ? `il y a ${absHours} h` : `dans ${absHours} h`;
  }
  if (absDays < 30) {
    return diffMs < 0 ? `il y a ${absDays} j` : `dans ${absDays} j`;
  }
  const absMonths = Math.floor(absDays / 30);
  if (absMonths < 12) {
    return diffMs < 0 ? `il y a ${absMonths} mois` : `dans ${absMonths} mois`;
  }
  const absYears = Math.floor(absDays / 365);
  return diffMs < 0 ? `il y a ${absYears} an${absYears > 1 ? 's' : ''}` : `dans ${absYears} an${absYears > 1 ? 's' : ''}`;
}

/** État du certificat médical à partir de la date d'expiration. */
export function medicalCertState(expiresAt: string | null | undefined): {
  ok: boolean;
  label: string;
} {
  if (!expiresAt) {
    return { ok: false, label: 'Certificat non renseigné' };
  }
  const end = new Date(expiresAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end >= today) {
    return { ok: true, label: 'Certificat médical valide' };
  }
  return { ok: false, label: 'Certificat à renouveler' };
}

/** Formate un nom complet (avec fallback pseudo). */
export function memberDisplayName(m: {
  firstName?: string | null;
  lastName?: string | null;
  pseudo?: string | null;
}): string {
  if (m.pseudo && m.pseudo.length > 0) return m.pseudo;
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || 'Sans nom';
}

/** Initiales (max 2 chars, uppercase). */
export function memberInitials(m: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const f = (m.firstName ?? '').trim()[0] ?? '';
  const l = (m.lastName ?? '').trim()[0] ?? '';
  return (f + l).toUpperCase() || '?';
}
