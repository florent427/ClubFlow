import { BadRequestException } from '@nestjs/common';
import { formatIsoDate } from '../accounting-fiscal-year.service';
import { parseOfx } from './ofx-parser';

/**
 * Deux dialectes réels, anonymisés : SGML à la Crédit Agricole (en-tête
 * `OFXHEADER:100`, éléments non fermés, CHARSET 1252, dates avec fuseau) et
 * XML OFX 2.x (éléments fermés). Le lecteur doit rendre le même relevé.
 */
const SGML = [
  'OFXHEADER:100',
  'DATA:OFXSGML',
  'VERSION:102',
  'SECURITY:NONE',
  'ENCODING:USASCII',
  'CHARSET:1252',
  'COMPRESSION:NONE',
  'OLDFILEUID:NONE',
  'NEWFILEUID:NONE',
  '',
  '<OFX>',
  '<BANKMSGSRSV1><STMTTRNRS><TRNUID>0<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
  '<STMTRS><CURDEF>EUR',
  '<BANKACCTFROM><BANKID>18306<BRANCHID>00001<ACCTID>FR7618306000010000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>',
  '<BANKTRANLIST><DTSTART>20260901<DTEND>20260930',
  '<STMTTRN><TRNTYPE>XFER<DTPOSTED>20260903120000[+4:RET]<TRNAMT>-45.10<FITID>2026090300001<NAME>PRLV SEPA EDF<MEMO>ECHEANCE 09/2026</STMTTRN>',
  '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260901<TRNAMT>250.00<FITID>2026090100002<NAME>VIR SEPA DUPONT MARIE<MEMO>COTISATION LEA</STMTTRN>',
  '<STMTTRN><TRNTYPE>DEP<DTPOSTED>20260910<TRNAMT>120,00<FITID>2026091000003<NAME>REMISE CHEQUES R-2026-0001<CHECKNUM>R-2026-0001</STMTTRN>',
  '</BANKTRANLIST>',
  '<LEDGERBAL><BALAMT>1559.46<DTASOF>20260930</LEDGERBAL>',
  '</STMTRS></STMTTRNRS></BANKMSGSRSV1>',
  '</OFX>',
].join('\r\n');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR</CURDEF>
<BANKACCTFROM><ACCTID>FR7618306000010000123456789</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901</DTSTART><DTEND>20260930</DTEND>
<STMTTRN><TRNTYPE>XFER</TRNTYPE><DTPOSTED>20260903</DTPOSTED><TRNAMT>-45.10</TRNAMT><FITID>2026090300001</FITID><NAME>PRLV SEPA EDF</NAME><MEMO>ECHEANCE 09/2026</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260901</DTPOSTED><TRNAMT>250.00</TRNAMT><FITID>2026090100002</FITID><NAME>VIR SEPA DUPONT MARIE</NAME><MEMO>COTISATION LEA</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>DEP</TRNTYPE><DTPOSTED>20260910</DTPOSTED><TRNAMT>120.00</TRNAMT><FITID>2026091000003</FITID><NAME>REMISE CHEQUES R-2026-0001</NAME><CHECKNUM>R-2026-0001</CHECKNUM></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1559.46</BALAMT><DTASOF>20260930</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('parseOfx', () => {
  it.each([
    ['SGML (OFX 1.x)', Buffer.from(SGML, 'latin1')],
    ['XML (OFX 2.x)', Buffer.from(XML, 'utf8')],
  ])('%s : lignes triées par date, soldes, période, compte', (_name, buf) => {
    const s = parseOfx(buf);
    expect(s.warnings).toEqual([]);
    expect(s.accountId).toBe('FR7618306000010000123456789');
    expect(s.currency).toBe('EUR');
    expect(formatIsoDate(s.periodStart!)).toBe('2026-09-01');
    expect(formatIsoDate(s.periodEnd!)).toBe('2026-09-30');
    expect(s.lines.map((l) => formatIsoDate(l.bookedOn))).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-10',
    ]);
    expect(s.lines.map((l) => l.amountCents)).toEqual([25000, -4510, 12000]);
    expect(s.lines[0].label).toBe('VIR SEPA DUPONT MARIE');
    expect(s.lines[0].rawLabel).toBe('VIR SEPA DUPONT MARIE | COTISATION LEA');
    expect(s.lines[0].fitId).toBe('2026090100002');
    expect(s.lines[2].reference).toBe('R-2026-0001');
    expect(s.closingBalanceCents).toBe(155946);
    // début = fin − Σ = 1559,46 − (250 − 45,10 + 120) = 1234,56
    expect(s.openingBalanceCents).toBe(123456);
  });

  it('accents Windows-1252 annoncés par l’en-tête, lus correctement', () => {
    const body = SGML.replace('PRLV SEPA EDF', 'PRLV SEPA ÉLECTRICITÉ');
    const buf = Buffer.from(body, 'latin1');
    const s = parseOfx(buf);
    expect(s.lines[1].label).toBe('PRLV SEPA ÉLECTRICITÉ');
  });

  it('une transaction sans montant lisible est signalée, pas inventée', () => {
    const body = SGML.replace('<TRNAMT>-45.10', '<TRNAMT>abc');
    const s = parseOfx(Buffer.from(body, 'latin1'));
    expect(s.lines).toHaveLength(2);
    expect(s.warnings).toHaveLength(1);
  });

  it('refuse un fichier qui n’est pas un OFX', () => {
    expect(() => parseOfx(Buffer.from('Date;Libellé;Montant\n01/09/2026;X;1,00'))).toThrow(
      BadRequestException,
    );
  });
});
