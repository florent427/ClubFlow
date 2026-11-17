import { describe, expect, it } from 'vitest';
import {
  MAX_INVOICE_LINES,
  actionsLabel,
  countActions,
  documentsSection,
  infosSection,
  paymentsSection,
  type SummaryInvoice,
} from './status-summary';
import type {
  PaymentScheduleInstallmentStatus,
  ViewerPaymentSchedule,
} from './viewer-types';

/** Intl sépare les milliers et l'euro par des espaces insécables. */
const texte = (s: string | undefined) => (s ?? '').replace(/\s/g, ' ');

const TODAY = new Date('2026-11-17T10:00:00');

function invoice(over: Partial<SummaryInvoice> = {}): SummaryInvoice {
  return {
    id: 'inv-1',
    label: 'Cotisation 2026-2027',
    dueAt: null,
    totalPaidCents: 0,
    balanceCents: 30_000,
    coveredBySchedule: false,
    awaitingCardSetup: false,
    ...over,
  };
}

function schedule(
  statuses: PaymentScheduleInstallmentStatus[],
  over: Partial<ViewerPaymentSchedule> = {},
): ViewerPaymentSchedule {
  return {
    id: 'sch-1',
    invoiceId: 'inv-1',
    method: 'CARD',
    status: 'ACTIVE',
    totalCents: statuses.length * 10_000,
    installmentCount: statuses.length,
    transfer: null,
    installments: statuses.map((status, i) => {
      // 10 oct. 2026, 10 nov., 10 déc., 10 janv. 2027…
      const month = 9 + i;
      const year = 2026 + Math.floor(month / 12);
      return {
        id: `inst-${i + 1}`,
        seq: i + 1,
        dueOn: `${year}-${String((month % 12) + 1).padStart(2, '0')}-10`,
        amountCents: 10_000,
        status,
      };
    }),
    ...over,
  };
}

function payments(
  invoices: SummaryInvoice[],
  schedules: Record<string, ViewerPaymentSchedule | null> = {},
) {
  return paymentsSection({
    billing: { isPayerView: true, invoices },
    schedules,
    cart: null,
    today: TODAY,
  });
}

describe('paymentsSection', () => {
  it('ne dit rien tant que la facturation n’est pas connue', () => {
    const s = paymentsSection({
      billing: null,
      schedules: {},
      cart: null,
      today: TODAY,
    });
    expect(s.items).toEqual([]);
    expect(s.figures).toEqual([]);
  });

  it('un profil non payeur n’a ni montant ni action', () => {
    const s = paymentsSection({
      billing: { isPayerView: false, invoices: [invoice()] },
      schedules: {},
      cart: null,
      today: TODAY,
    });
    expect(s.figures).toEqual([]);
    expect(s.items.map((i) => i.tone)).toEqual(['info']);
    expect(countActions([s])).toBe(0);
  });

  it('additionne reste à payer et déjà réglé sur toutes les factures', () => {
    const s = payments([
      invoice({ id: 'a', balanceCents: 12_000, totalPaidCents: 8_000 }),
      invoice({ id: 'b', balanceCents: 0, totalPaidCents: 5_000 }),
    ]);
    expect(s.figures.map((f) => [f.label, texte(f.value)])).toEqual([
      ['Reste à payer', '120,00 €'],
      ['Déjà réglé', '130,00 €'],
    ]);
    // La facture soldée n'a pas de ligne.
    expect(s.items.map((i) => i.id)).toEqual(['invoice-a']);
  });

  it('une facture simple est à payer, avec un lien qui la déplie', () => {
    const [item] = payments([invoice({ dueAt: '2026-12-01' })]).items;
    expect(item?.tone).toBe('todo');
    expect(item?.to).toBe('/factures?facture=inv-1');
    expect(texte(item?.amount)).toBe('300,00 €');
    expect(item?.detail).toContain('avant le');
  });

  it('une échéance dépassée passe en alerte', () => {
    const [item] = payments([invoice({ dueAt: '2026-11-16' })]).items;
    expect(item?.tone).toBe('alert');
    expect(item?.detail).toContain('dépassée');
  });

  it('une facture due aujourd’hui n’est pas encore en retard', () => {
    const [item] = payments([invoice({ dueAt: '2026-11-17' })]).items;
    expect(item?.tone).toBe('todo');
  });

  it('un échéancier sans carte enregistrée est une alerte', () => {
    const [item] = payments([
      invoice({ coveredBySchedule: true, awaitingCardSetup: true }),
    ]).items;
    expect(item?.tone).toBe('alert');
    expect(item?.cta).toBe('Enregistrer ma carte');
  });

  it('un échéancier sain annonce l’avancement et le prochain versement', () => {
    const [item] = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', 'PAID', 'SCHEDULED', 'SCHEDULED']),
    }).items;
    expect(item?.tone).toBe('ok');
    const detail = texte(item?.detail);
    expect(detail).toContain('2 versements réglés sur 4');
    expect(detail).toContain('100,00 € le 10 déc. 2026');
    expect(detail).toContain('prélevé sur votre carte');
    expect(countActions([payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', 'SCHEDULED']),
    })])).toBe(0);
  });

  it('les échéances annulées ne comptent pas dans l’avancement', () => {
    const [item] = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', 'CANCELLED', 'SCHEDULED']),
    }).items;
    expect(texte(item?.detail)).toContain('1 versement réglé sur 2');
  });

  it.each([
    ['FAILED_FINAL', 'Régulariser'],
    ['REQUIRES_ACTION', 'Confirmer'],
    ['FAILED_RETRYABLE', 'Vérifier'],
  ] as const)('un versement %s est une alerte', (status, cta) => {
    const [item] = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', status, 'SCHEDULED']),
    }).items;
    expect(item?.tone).toBe('alert');
    expect(item?.cta).toBe(cta);
  });

  it('le cas le plus grave l’emporte quand plusieurs versements posent problème', () => {
    const [item] = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['FAILED_RETRYABLE', 'FAILED_FINAL']),
    }).items;
    expect(item?.cta).toBe('Régulariser');
  });

  it('un virement mensuel en retard est à faire, pas un virement à venir', () => {
    const late = payments([invoice({ coveredBySchedule: true })], {
      // 10 nov. passé, toujours attendu.
      'inv-1': schedule(['PAID', 'SCHEDULED'], { method: 'MANUAL_TRANSFER' }),
    }).items[0];
    expect(late?.tone).toBe('todo');
    expect(late?.cta).toBe('Voir le RIB');

    const upcoming = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', 'PAID', 'SCHEDULED'], {
        method: 'MANUAL_TRANSFER',
      }),
    }).items[0];
    expect(upcoming?.tone).toBe('ok');
    expect(upcoming?.detail).toContain('par virement');
  });

  it('un prélèvement carte en retard d’un jour n’est pas réclamé à l’adhérent', () => {
    const [item] = payments([invoice({ coveredBySchedule: true })], {
      'inv-1': schedule(['PAID', 'SCHEDULED']),
    }).items;
    expect(item?.tone).toBe('ok');
  });

  it('sans échéancier chargé, la facture couverte reste neutre', () => {
    const [item] = payments([invoice({ coveredBySchedule: true })]).items;
    expect(item?.tone).toBe('info');
  });

  it('tout réglé : une seule ligne verte', () => {
    const s = payments([invoice({ balanceCents: 0, totalPaidCents: 30_000 })]);
    expect(s.items.map((i) => [i.id, i.tone])).toEqual([['all-paid', 'ok']]);
  });

  it('aucune facture : ligne neutre, pas de « tout est réglé »', () => {
    const s = payments([]);
    expect(s.items.map((i) => [i.id, i.tone])).toEqual([['no-invoice', 'info']]);
  });

  it('regroupe les factures au-delà de la limite', () => {
    const many = Array.from({ length: MAX_INVOICE_LINES + 2 }, (_, i) =>
      invoice({ id: `inv-${i}` }),
    );
    const s = payments(many);
    expect(s.items).toHaveLength(MAX_INVOICE_LINES + 1);
    expect(s.items.at(-1)?.title).toBe('2 autres factures ouvertes');
    // La ligne de regroupement n'est pas une action de plus.
    expect(countActions([s])).toBe(MAX_INVOICE_LINES);
  });

  it('le panier en cours s’affiche même sans facturation', () => {
    const s = paymentsSection({
      billing: null,
      schedules: {},
      cart: { itemsCount: 2, totalCents: 45_000, canValidate: false },
      today: TODAY,
    });
    expect(s.items.map((i) => [i.id, i.tone, i.cta])).toEqual([
      ['cart', 'todo', 'Compléter'],
    ]);
  });

  it('un panier vide n’est pas une action', () => {
    const s = paymentsSection({
      billing: null,
      schedules: {},
      cart: { itemsCount: 0, totalCents: 0, canValidate: false },
      today: TODAY,
    });
    expect(s.items).toEqual([]);
  });
});

describe('documentsSection', () => {
  const none = { documentsToSign: null, medicalCert: null, today: TODAY };

  it('ne dit rien quand le module documents ne répond pas', () => {
    expect(documentsSection(none).items).toEqual([]);
  });

  it('liste les documents, obligatoires en tête', () => {
    const s = documentsSection({
      ...none,
      documentsToSign: [
        { id: 'd1', name: 'Droit à l’image', isRequired: false },
        { id: 'd2', name: 'Règlement intérieur', isRequired: true },
      ],
    });
    expect(s.items.map((i) => [i.title, i.tone])).toEqual([
      ['Règlement intérieur', 'todo'],
      ['Droit à l’image', 'info'],
    ]);
    // Seul l'obligatoire compte comme action.
    expect(countActions([s])).toBe(1);
  });

  it('liste vide : rien en attente', () => {
    const s = documentsSection({ ...none, documentsToSign: [] });
    expect(s.items.map((i) => [i.id, i.tone])).toEqual([['docs-none', 'ok']]);
  });

  it('certificat valide', () => {
    const [item] = documentsSection({
      ...none,
      medicalCert: { expiresAt: '2027-09-01', required: true },
    }).items;
    expect(item?.tone).toBe('ok');
    expect(item?.detail).toContain('2027');
  });

  it('certificat absent : réclamé seulement si le club l’exige', () => {
    expect(
      documentsSection({
        ...none,
        medicalCert: { expiresAt: null, required: true },
      }).items.map((i) => i.tone),
    ).toEqual(['todo']);
    expect(
      documentsSection({
        ...none,
        medicalCert: { expiresAt: null, required: false },
      }).items,
    ).toEqual([]);
  });

  it('certificat expiré : alerte seulement si le club l’exige', () => {
    expect(
      documentsSection({
        ...none,
        medicalCert: { expiresAt: '2026-11-16', required: true },
      }).items.map((i) => i.tone),
    ).toEqual(['alert']);
    expect(
      documentsSection({
        ...none,
        medicalCert: { expiresAt: '2026-11-16', required: false },
      }).items,
    ).toEqual([]);
  });

  it('certificat qui expire aujourd’hui est encore valide, mais à renouveler', () => {
    const [item] = documentsSection({
      ...none,
      medicalCert: { expiresAt: '2026-11-17', required: true },
    }).items;
    expect(item?.tone).toBe('todo');
  });

  it('certificat à plus de 30 jours : aucun rappel', () => {
    const [item] = documentsSection({
      ...none,
      medicalCert: { expiresAt: '2026-12-18', required: true },
    }).items;
    expect(item?.tone).toBe('ok');
  });
});

describe('infosSection', () => {
  it('ne dit rien sans aucune source', () => {
    expect(
      infosSection({ coordinateGaps: null, missingRequiredFields: null }).items,
    ).toEqual([]);
  });

  it('coordonnées complètes : une ligne verte', () => {
    const s = infosSection({ coordinateGaps: [], missingRequiredFields: [] });
    expect(s.items.map((i) => [i.id, i.tone])).toEqual([['infos-ok', 'ok']]);
  });

  it('n’affirme pas « complet » sans le statut des coordonnées', () => {
    const s = infosSection({ coordinateGaps: null, missingRequiredFields: [] });
    expect(s.items).toEqual([]);
  });

  it('une ligne par coordonnée manquante du compte, vers les paramètres', () => {
    const s = infosSection({
      coordinateGaps: [
        {
          target: 'ACCOUNT',
          targetId: null,
          displayName: 'Camille Dupont',
          missing: ['PHONE', 'ADDRESS'],
        },
      ],
      missingRequiredFields: [],
    });
    expect(s.items.map((i) => [i.id, i.to])).toEqual([
      ['account-PHONE', '/parametres'],
      ['account-ADDRESS', '/parametres'],
    ]);
    expect(countActions([s])).toBe(2);
  });

  it('les coordonnées d’un proche renvoient au panier', () => {
    const [item] = infosSection({
      coordinateGaps: [
        {
          target: 'MEMBER',
          targetId: 'm-2',
          displayName: 'Léa Dupont',
          missing: ['BIRTH_PLACE', 'PHONE'],
        },
      ],
      missingRequiredFields: [],
    }).items;
    expect(item?.title).toBe('Coordonnées de Léa Dupont à compléter');
    expect(item?.detail).toBe('Manque : lieu de naissance, téléphone.');
    expect(item?.to).toBe('/adhesion');
  });

  it('ne répète pas un champ obligatoire déjà signalé par les coordonnées', () => {
    const s = infosSection({
      coordinateGaps: [
        {
          target: 'ACCOUNT',
          targetId: null,
          displayName: 'Camille Dupont',
          missing: ['ADDRESS'],
        },
      ],
      missingRequiredFields: [
        { key: 'CITY', label: 'Ville' },
        { key: 'POSTAL_CODE', label: 'Code postal' },
        { key: 'BIRTH_DATE', label: 'Date de naissance' },
      ],
    });
    expect(s.items.map((i) => i.id)).toEqual([
      'account-ADDRESS',
      'field-BIRTH_DATE',
    ]);
  });

  it('signale un champ obligatoire vide que les coordonnées ne couvrent pas', () => {
    const s = infosSection({
      coordinateGaps: [],
      missingRequiredFields: [{ key: 'PHONE', label: 'Téléphone' }],
    });
    expect(s.items.map((i) => [i.id, i.title])).toEqual([
      ['field-PHONE', 'Téléphone à renseigner'],
    ]);
  });
});

describe('actionsLabel', () => {
  it('accorde le libellé', () => {
    expect(actionsLabel(0)).toBe('Tout est en ordre');
    expect(actionsLabel(1)).toBe('1 action à faire');
    expect(actionsLabel(3)).toBe('3 actions à faire');
  });
});
