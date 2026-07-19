/**
 * Fuseau de référence des tâches planifiées.
 *
 * Les clubs sont à La Réunion (UTC+4) et le serveur tourne en UTC. Sans
 * fuseau explicite, « prélever à 8h » se déclencherait à 4h du matin heure
 * locale — et les dates d'échéance calculées côté serveur pourraient basculer
 * d'un jour.
 *
 * Toute expression cron du projet DOIT passer ce fuseau à `@Cron`.
 */
export const SCHEDULING_TIMEZONE = 'Indian/Reunion';

/** Clés de verrou des tâches planifiées (cf. SchedulerLockService). */
export const SCHEDULER_LOCK_KEYS = {
  /** Run quotidien de prélèvement des échéances dues (ADR-0009, lot 3). */
  paymentScheduleRun: 'payment-schedule-run',
  /**
   * Balayage des frais Stripe restant à récupérer (Phase 2).
   *
   * Verrou DISTINCT de celui du prélèvement, volontairement : un balayage de
   * frais qui traîne ne doit jamais retarder un prélèvement dû, et le
   * prélèvement tient son verrou jusqu'à 15 minutes.
   */
  stripeFeesSweep: 'stripe-fees-sweep',
  /**
   * Rapprochement des remboursements Stripe non enregistrés (Phase 2).
   * Verrou distinct : un rapprochement lent ne doit retarder ni le
   * prélèvement, ni la récupération des frais.
   */
  stripeRefundReconcile: 'stripe-refund-reconcile',
} as const;
