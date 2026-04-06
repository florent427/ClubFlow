export function formatEuroCents(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function formatRangeHours(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const tf = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${tf.format(s)} – ${tf.format(e)}`;
}

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

export function medicalCertState(expiresAt: string | null): {
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
