/**
 * Phase F.2 — Agrégation parent / enfants pour payloads FCM (MVP : structure + log).
 * Le parent (payeur) reçoit les alertes de tous les membres du foyer (conception §3.6).
 */
export type PushPayloadForMember = {
  memberId: string;
  title: string;
  body: string;
  channel: string;
};

export type AggregatedPushPayload = {
  targetMemberIds: string[];
  title: string;
  body: string;
  context: 'PARENT_AGGREGATED' | 'DIRECT';
};

/**
 * Si `payerMemberId` est fourni et différent de `eventMemberId`, on duplique vers le payeur.
 */
export function aggregateForParent(
  eventMemberId: string,
  payerMemberId: string | null,
  title: string,
  body: string,
): AggregatedPushPayload {
  const ids = new Set<string>([eventMemberId]);
  if (payerMemberId && payerMemberId !== eventMemberId) {
    ids.add(payerMemberId);
  }
  return {
    targetMemberIds: [...ids],
    title,
    body,
    context:
      payerMemberId && payerMemberId !== eventMemberId
        ? 'PARENT_AGGREGATED'
        : 'DIRECT',
  };
}
