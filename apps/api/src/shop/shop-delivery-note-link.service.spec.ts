import { ShopDeliveryNoteLinkService } from './shop-delivery-note-link.service';

/**
 * Le lien signé ouvre le bon de livraison sans jeton : c'est donc lui, et lui
 * seul, qui porte le droit de lecture. Chaque test altère une seule chose — le
 * club, la commande, l'échéance, la signature — et vérifie que le lien tombe.
 */

const NOW = Date.UTC(2026, 8, 13, 10, 0, 0);
const TTL_MS = ShopDeliveryNoteLinkService.TTL_SECONDS * 1000;

describe('ShopDeliveryNoteLinkService', () => {
  const svc = new ShopDeliveryNoteLinkService();
  const envAvant = process.env.API_PUBLIC_URL;

  afterEach(() => {
    if (envAvant === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = envAvant;
  });

  it('un lien fraîchement signé est valide', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(svc.verify('club-1', 'order-1', String(exp), sig, NOW)).toBe(true);
  });

  it('expire', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(
      svc.verify('club-1', 'order-1', String(exp), sig, NOW + TTL_MS + 1000),
    ).toBe(false);
  });

  it('refuse le même lien présenté pour un AUTRE club', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(svc.verify('club-2', 'order-1', String(exp), sig, NOW)).toBe(false);
  });

  it('refuse le même lien présenté pour une AUTRE commande', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(svc.verify('club-1', 'order-2', String(exp), sig, NOW)).toBe(false);
  });

  it('refuse une échéance prolongée à la main', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(
      svc.verify('club-1', 'order-1', String(exp + 3600), sig, NOW),
    ).toBe(false);
  });

  it('refuse un lien incomplet ou mal formé', () => {
    const { exp, sig } = svc.sign('club-1', 'order-1', NOW);

    expect(svc.verify(undefined, 'order-1', String(exp), sig, NOW)).toBe(false);
    expect(svc.verify('club-1', 'order-1', undefined, sig, NOW)).toBe(false);
    expect(svc.verify('club-1', 'order-1', String(exp), undefined, NOW)).toBe(false);
    expect(svc.verify('club-1', 'order-1', 'demain', sig, NOW)).toBe(false);
    expect(svc.verify('club-1', 'order-1', String(exp), `${sig}x`, NOW)).toBe(false);
  });

  it('l’URL porte le club, l’échéance et la signature, et se vérifie telle quelle', () => {
    process.env.API_PUBLIC_URL = 'https://api.test/';

    const url = new URL(svc.url('club-1', 'order-1', NOW));

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://api.test/shop/orders/order-1/delivery-note/signed.pdf',
    );
    expect(url.searchParams.get('club')).toBe('club-1');
    expect(
      svc.verify(
        url.searchParams.get('club') ?? undefined,
        'order-1',
        url.searchParams.get('exp') ?? undefined,
        url.searchParams.get('sig') ?? undefined,
        NOW,
      ),
    ).toBe(true);
  });
});
