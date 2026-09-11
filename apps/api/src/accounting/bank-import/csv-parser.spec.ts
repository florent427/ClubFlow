import { formatIsoDate } from '../accounting-fiscal-year.service';
import {
  detectCsv,
  detectDelimiter,
  parseCsv,
  parseCsvDate,
  parseCsvNumber,
  splitCsvText,
} from './csv-parser';

/**
 * Trois exports réels, anonymisés : débit/crédit séparés avec solde et
 * virgule décimale (BFCOI, Crédit Agricole) ; montant signé sans solde
 * (Banque Postale) ; export anglo-saxon virgule + point décimal en ordre
 * décroissant (Qonto, Shine).
 */
const BFCOI = [
  'Date;Date valeur;Libellé;Débit;Crédit;Solde',
  '01/09/2026;01/09/2026;VIR SEPA DUPONT MARIE COTISATION LEA;;250,00;1 484,56',
  '03/09/2026;03/09/2026;"PRLV SEPA EDF; ECHEANCE 09/2026";45,10;;1 439,46',
  '10/09/2026;10/09/2026;REMISE CHEQUES R-2026-0001;;120,00;1 559,46',
].join('\r\n');

const POSTALE = [
  'Date;Libellé;Montant(EUROS)',
  '10/09/2026;REMISE CHEQUES R-2026-0001;120,00',
  '03/09/2026;PRLV SEPA EDF;-45,10',
  '01/09/2026;VIR SEPA DUPONT MARIE;250,00',
].join('\n');

const QONTO = [
  'Transaction date,Value date,Counterparty name,Label,Amount,Balance,Reference',
  '2026-09-10,2026-09-10,"Banque","Remise de chèques R-2026-0001",120.00,1559.46,R-2026-0001',
  '2026-09-03,2026-09-03,"EDF","Prélèvement EDF",-45.10,1439.46,',
  '2026-09-01,2026-09-01,"Marie Dupont","Cotisation Léa",250.00,1484.56,COTIS-LEA',
].join('\n');

describe('csv-parser — briques', () => {
  it('splitCsvText : guillemets doublés et séparateur entre guillemets', () => {
    expect(splitCsvText('a;"b;c";"d ""e"""\n1;2;3', ';')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('detectDelimiter : point-virgule, virgule, tabulation', () => {
    expect(detectDelimiter(BFCOI)).toBe(';');
    expect(detectDelimiter(QONTO)).toBe(',');
    expect(detectDelimiter('Date\tLibellé\tMontant\n01/09/2026\tX\t1,00')).toBe('\t');
  });

  it('parseCsvNumber : formats bancaires français et anglo-saxons', () => {
    expect(parseCsvNumber('1 234,56', ',')).toBe(123456);
    expect(parseCsvNumber('-45,10', ',')).toBe(-4510);
    expect(parseCsvNumber('12,5 €', ',')).toBe(1250);
    expect(parseCsvNumber('1,234.56', '.')).toBe(123456);
    expect(parseCsvNumber('(12,00)', ',')).toBe(-1200);
    expect(parseCsvNumber('45,10-', ',')).toBe(-4510);
    expect(parseCsvNumber('', ',')).toBeNull();
    expect(parseCsvNumber('abc', ',')).toBeNull();
  });

  it('parseCsvDate : DMY, YMD, MDY, années sur deux chiffres', () => {
    expect(formatIsoDate(parseCsvDate('03/09/2026', 'DMY')!)).toBe('2026-09-03');
    expect(formatIsoDate(parseCsvDate('03/09/26', 'DMY')!)).toBe('2026-09-03');
    expect(formatIsoDate(parseCsvDate('2026-09-03', 'YMD')!)).toBe('2026-09-03');
    expect(formatIsoDate(parseCsvDate('09/03/2026', 'MDY')!)).toBe('2026-09-03');
    expect(parseCsvDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseCsvDate('n/a', 'DMY')).toBeNull();
  });
});

describe('detectCsv + parseCsv', () => {
  it('BFCOI : débit/crédit séparés, solde, virgule décimale, en-tête', () => {
    const buf = Buffer.from(BFCOI, 'utf8');
    const d = detectCsv(buf);
    expect(d.delimiter).toBe(';');
    expect(d.hasHeader).toBe(true);
    expect(d.mapping).toMatchObject({
      dateCol: 0,
      valueDateCol: 1,
      labelCol: 2,
      debitCol: 3,
      creditCol: 4,
      balanceCol: 5,
      amountCol: null,
      dateFormat: 'DMY',
      decimalSeparator: ',',
    });
    const s = parseCsv(buf, d.mapping);
    expect(s.warnings).toEqual([]);
    expect(s.lines.map((l) => l.amountCents)).toEqual([25000, -4510, 12000]);
    expect(s.lines[1].label).toBe('PRLV SEPA EDF; ECHEANCE 09/2026');
    expect(s.openingBalanceCents).toBe(123456);
    expect(s.closingBalanceCents).toBe(155946);
    expect(formatIsoDate(s.periodStart!)).toBe('2026-09-01');
    expect(formatIsoDate(s.periodEnd!)).toBe('2026-09-10');
  });

  it('Banque Postale : montant signé, pas de solde → ordre par date, soldes à saisir', () => {
    const buf = Buffer.from(POSTALE, 'latin1');
    const d = detectCsv(buf);
    expect(d.mapping).toMatchObject({ dateCol: 0, labelCol: 1, amountCol: 2, balanceCol: null });
    const s = parseCsv(buf, d.mapping);
    expect(s.lines.map((l) => formatIsoDate(l.bookedOn))).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-10',
    ]);
    expect(s.lines.map((l) => l.amountCents)).toEqual([25000, -4510, 12000]);
    expect(s.openingBalanceCents).toBeNull();
    expect(s.closingBalanceCents).toBeNull();
  });

  it('Qonto : virgule, point décimal, ordre décroissant redressé par la colonne solde', () => {
    const buf = Buffer.from(QONTO, 'utf8');
    const d = detectCsv(buf);
    expect(d.mapping).toMatchObject({
      delimiter: ',',
      dateCol: 0,
      valueDateCol: 1,
      amountCol: 4,
      balanceCol: 5,
      referenceCol: 6,
      dateFormat: 'YMD',
      decimalSeparator: '.',
    });
    const s = parseCsv(buf, d.mapping);
    expect(s.lines.map((l) => formatIsoDate(l.bookedOn))).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-10',
    ]);
    expect(s.lines[0].reference).toBe('COTIS-LEA');
    expect(s.openingBalanceCents).toBe(123456);
    expect(s.closingBalanceCents).toBe(155946);
  });

  it('une ligne à la date illisible est signalée et écartée, pas inventée', () => {
    const buf = Buffer.from(`${POSTALE}\nTotal;;324,90`, 'latin1');
    const s = parseCsv(buf, detectCsv(buf).mapping);
    expect(s.lines).toHaveLength(3);
    expect(s.warnings).toHaveLength(1);
  });
});
