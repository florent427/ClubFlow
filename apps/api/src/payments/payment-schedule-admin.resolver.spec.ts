import type { Club } from '@prisma/client';
import { PaymentScheduleAdminResolver } from './payment-schedule-admin.resolver';
import { SCHEDULER_LOCK_KEYS } from '../scheduling/scheduling.constants';
import type { SchedulerLockService } from '../scheduling/scheduler-lock.service';
import type { PaymentScheduleEngineService } from './payment-schedule-engine.service';
import type { StripeFeesService } from './stripe-fees.service';

/**
 * Déclenchement MANUEL du balayage des frais Stripe.
 *
 * Le cron horaire prend le verrou ; la mutation appelait `sweepPendingFees`
 * en direct. Deux exécutions concurrentes étaient donc triviales à provoquer
 * — double-clic du trésorier, ou déclenchement tombant pendant le passage de
 * :15 — et toutes deux interrogeaient Stripe puis écrivaient les mêmes frais.
 */

const CLUB = { id: 'club-1' } as Club;

function makeResolver(opts?: { lockHeld?: boolean }) {
  const sweep = jest
    .fn()
    .mockResolvedValue({ examined: 3, resolved: 2, abandoned: 0 });

  const withLock = jest.fn(
    async (_key: string, _leaseMs: number, fn: () => Promise<unknown>) =>
      // Contrat réel de SchedulerLockService : `null` quand le bail est déjà
      // tenu, sans exécuter la fonction.
      opts?.lockHeld ? null : fn(),
  );

  const resolver = new PaymentScheduleAdminResolver(
    { runDue: jest.fn() } as unknown as PaymentScheduleEngineService,
    { sweepPendingFees: sweep } as unknown as StripeFeesService,
    { withLock } as unknown as SchedulerLockService,
  );

  return { resolver, sweep, withLock };
}

describe('triggerStripeFeesSweep', () => {
  it('passe par le verrou PARTAGÉ avec le balayage horaire', async () => {
    // Une clé propre au déclenchement manuel ne servirait à rien : la course
    // qu'on ferme est justement celle entre le manuel et le cron.
    const { resolver, withLock } = makeResolver();

    await resolver.triggerStripeFeesSweep(CLUB);

    expect(withLock).toHaveBeenCalledWith(
      SCHEDULER_LOCK_KEYS.stripeFeesSweep,
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('N’INTERROGE PAS Stripe si un balayage est déjà en cours', async () => {
    // L'assertion qui mord : c'est l'absence d'appel qui prouve le verrou,
    // pas la présence d'un `withLock` dans le code.
    const { resolver, sweep } = makeResolver({ lockHeld: true });

    await resolver.triggerStripeFeesSweep(CLUB);

    expect(sweep).not.toHaveBeenCalled();
  });

  it('renvoie un rapport vide plutôt que d’échouer quand le verrou est tenu', async () => {
    // Le travail est de toute façon en cours : faire échouer une action
    // d'administration serait mentir sur l'état du système.
    const { resolver } = makeResolver({ lockHeld: true });

    const report = await resolver.triggerStripeFeesSweep(CLUB);

    expect(report).toEqual({ examined: 0, resolved: 0, abandoned: 0 });
  });

  it('reste scopé au club appelant', async () => {
    // Un admin ne doit jamais provoquer d'appels Stripe sur les comptes
    // connectés d'autres tenants.
    const { resolver, sweep } = makeResolver();

    await resolver.triggerStripeFeesSweep(CLUB);

    expect(sweep).toHaveBeenCalledWith({ clubId: 'club-1' });
  });

  it('rend le rapport réel quand le balayage a bien tourné', async () => {
    const { resolver } = makeResolver();

    const report = await resolver.triggerStripeFeesSweep(CLUB);

    expect(report).toEqual({ examined: 3, resolved: 2, abandoned: 0 });
  });
});
