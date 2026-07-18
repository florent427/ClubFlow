import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ClubStripeConnectStatus } from '../../lib/stripe-connect-documents';
import { MandateIdentityCard } from './PaymentsSettingsPage';

/**
 * Rendu de la carte « Identité vue par vos adhérents ».
 *
 * Ce que ces tests protègent : le trésorier doit LIRE l'identité réellement
 * portée par le mandat SEPA. Une carte qui compile mais n'affiche pas le nom,
 * ou qui alerte à tort, manque entièrement son objet.
 */
describe('MandateIdentityCard', () => {
  /** Compte connecté encaissable, surchargeable par test. */
  function status(
    over: Partial<ClubStripeConnectStatus> = {},
  ): ClubStripeConnectStatus {
    return {
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardedAt: '2026-07-01T00:00:00.000Z',
      businessName: 'SKSR',
      statementDescriptor: 'SKSR.RE',
      clubName: 'QA Test Club',
      ...over,
    };
  }

  function render(s: ClubStripeConnectStatus): string {
    return renderToStaticMarkup(
      <MandateIdentityCard
        status={s}
        busy={false}
        opening={false}
        onOpenDashboard={() => {}}
      />,
    );
  }

  it('affiche la raison sociale et le libellé de relevé', () => {
    const html = render(status());
    expect(html).toContain('SKSR');
    expect(html).toContain('SKSR.RE');
  });

  it("explique que c'est ce nom qui figure sur le mandat et le relevé", () => {
    const html = render(status());
    expect(html).toContain('mandat');
    expect(html).toContain('relevé bancaire');
  });

  it('avertit quand la raison sociale diffère du nom du club', () => {
    // Cas staging : « QA Test Club » encaisse sous « SKSR ».
    const html = render(status());
    expect(html).toContain('cf-alert--warning');
    expect(html).toContain('QA Test Club');
  });

  it("n'avertit pas quand les deux noms coïncident", () => {
    const html = render(status({ businessName: 'QA Test Club' }));
    expect(html).not.toContain('cf-alert--warning');
  });

  it('reste lisible quand le KYC n’a pas encore renseigné les champs', () => {
    // Compte créé, dossier incomplet : ni crash, ni fausse alerte.
    const html = render(
      status({ businessName: null, statementDescriptor: null }),
    );
    expect(html).not.toContain('cf-alert--warning');
    expect(html).toContain('Pas encore renseignée');
  });

  it('renvoie la modification vers Stripe, jamais vers ClubFlow', () => {
    // La raison sociale est une donnée KYC : ClubFlow ne doit pas laisser
    // croire qu'elle se modifie ici.
    const html = render(status());
    expect(html).toContain('Modifier chez Stripe');
  });
});
