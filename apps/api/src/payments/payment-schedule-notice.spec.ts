import {
  PaymentScheduleInstallmentStatus as S,
  PaymentScheduleMethod,
} from '@prisma/client';
import {
  buildSetupNotice,
  CUSTOM_TEXT_MAX,
  type NoticeInstallment,
} from './payment-schedule-notice';

const CLUB = 'QA Test Club';

function inst(
  seq: number,
  amountCents: number,
  status: NoticeInstallment['status'] = S.SCHEDULED,
): NoticeInstallment {
  // 20/07/2026, 20/08/2026, 20/09/2026…
  return {
    amountCents,
    dueOn: new Date(Date.UTC(2026, 6 + (seq - 1), 20)),
    status,
  };
}

const sepa = (installments: NoticeInstallment[]) =>
  buildSetupNotice({
    clubName: CLUB,
    method: PaymentScheduleMethod.SEPA_DEBIT,
    installments,
  });

describe('buildSetupNotice', () => {
  it('chiffre l’engagement SEPA : nombre, total et première date', () => {
    const text = sepa([inst(1, 3000), inst(2, 3000), inst(3, 3000)])!;

    expect(text).toContain('3 prélèvements');
    expect(text).toContain('90,00 €');
    expect(text).toContain('20/07/2026');
    expect(text).toContain(CLUB);
  });

  it('prévient que le mandat peut porter la raison sociale du club', () => {
    // C’est la raison d’être de cette mention : le mandat Stripe nomme
    // l’identité KYC du compte connecté, pas le nom ClubFlow.
    const text = sepa([inst(1, 3000), inst(2, 3000)])!;

    expect(text).toContain('raison sociale');
    expect(text).toContain('relevé bancaire');
  });

  it('n’annonce QUE ce qui reste dû après un mandat révoqué puis resigné', () => {
    // Scénario réel : applyMandateUpdated a repassé l’échéancier en
    // PENDING_SETUP alors que la 1re échéance était déjà encaissée.
    const text = sepa([
      inst(1, 3000, S.PAID),
      inst(2, 3000),
      inst(3, 3000),
    ])!;

    expect(text).toContain('2 prélèvements');
    expect(text).toContain('60,00 €');
    // La date de la 1re échéance payée ne doit plus être annoncée.
    expect(text).toContain('20/08/2026');
    expect(text).not.toContain('20/07/2026');
    expect(text).not.toContain('90,00 €');
  });

  it('exclut les échéances qui ne seront jamais redébitées', () => {
    const text = sepa([
      inst(1, 3000, S.CANCELLED),
      inst(2, 3000, S.FAILED_FINAL),
      inst(3, 3000),
    ])!;

    expect(text).toContain('1 prélèvement');
    expect(text).toContain('30,00 €');
  });

  it('inclut une échéance en échec encore rejouable', () => {
    // FAILED_RETRYABLE sera réclamée par le moteur : la taire reviendrait à
    // sous-annoncer ce que le débiteur va réellement payer.
    const text = sepa([inst(1, 3000, S.FAILED_RETRYABLE), inst(2, 3000)])!;

    expect(text).toContain('2 prélèvements');
    expect(text).toContain('60,00 €');
  });

  it('accorde le singulier sur une échéance unique', () => {
    const text = sepa([inst(1, 3000)])!;

    expect(text).toContain('1 prélèvement pour');
    expect(text).not.toContain('prélèvements');
  });

  it('renvoie null quand plus rien n’est prélevable', () => {
    // Pas de mention plutôt qu’une mention vide ou à 0,00 €.
    expect(sepa([inst(1, 3000, S.PAID), inst(2, 3000, S.PAID)])).toBeNull();
    expect(sepa([])).toBeNull();
  });

  it('annonce la première échéance par DATE, pas par ordre du tableau', () => {
    const text = sepa([inst(3, 3000), inst(1, 3000), inst(2, 3000)])!;

    expect(text).toContain('le premier le 20/07/2026');
  });

  it('formate la date en UTC, sans glissement de fuseau', () => {
    // dueOn est un @db.Date à minuit UTC : un formatage en fuseau négatif
    // reculerait la date annoncée d’un jour.
    const text = sepa([
      { amountCents: 3000, dueOn: new Date('2026-07-20T00:00:00Z'), status: S.SCHEDULED },
    ])!;

    expect(text).toContain('20/07/2026');
    expect(text).not.toContain('19/07/2026');
  });

  it('précise pour la carte qu’aucun montant n’est débité à la signature', () => {
    const text = buildSetupNotice({
      clubName: CLUB,
      method: PaymentScheduleMethod.CARD,
      installments: [inst(1, 10000), inst(2, 10000)],
    })!;

    expect(text).toContain('2 débits');
    expect(text).toContain('200,00 €');
    expect(text).toContain("Aucun montant n'est débité maintenant");
    // Le vocabulaire SEPA n’a rien à faire dans une mention carte.
    expect(text).not.toContain('mandat');
  });

  it('reste sous la limite Stripe même avec un nom de club à rallonge', () => {
    const text = buildSetupNotice({
      clubName: 'A'.repeat(600),
      method: PaymentScheduleMethod.SEPA_DEBIT,
      installments: [inst(1, 3000), inst(2, 3000)],
    })!;

    expect(text.length).toBeLessThanOrEqual(CUSTOM_TEXT_MAX);
  });
});
