import { BadRequestException } from '@nestjs/common';
import {
  decodeStatementText,
  sortByDateStable,
  utcDate,
} from './statement-types';
import type { ParsedStatement, ParsedStatementLine } from './statement-types';

/**
 * Lecteur OFX (ADR-0014 §3), déterministe et sans IA.
 *
 * Couvre les deux dialectes : SGML (OFX 1.x, éléments non fermés, en-tête
 * `OFXHEADER:100`) et XML (OFX 2.x). Dans les deux, les agrégats
 * `<STMTTRN>…</STMTTRN>` et `<LEDGERBAL>…</LEDGERBAL>` sont fermés ; seuls
 * les éléments feuilles ne le sont pas en SGML, d'où la lecture « valeur
 * jusqu'au prochain `<` ».
 */

/** Valeur d'un élément feuille : `<TAG>valeur` (SGML) ou `<TAG>valeur</TAG>`. */
function tagValue(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  if (!m) return null;
  const v = m[1].trim();
  return v.length > 0 ? v : null;
}

/** Contenu d'un agrégat `<TAG>…</TAG>`. */
function aggregate(text: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i').exec(text);
  return m ? m[1] : null;
}

/** `YYYYMMDD…` (souvent suivi de l'heure et d'un fuseau) → minuit UTC. */
export function parseOfxDate(raw: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** `-12.50`, `1234.56`, parfois `-12,50` chez certaines banques → centimes. */
export function parseOfxAmount(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function parseOfx(buffer: Buffer): ParsedStatement {
  const head = buffer.subarray(0, 600).toString('latin1');
  const charset = /CHARSET:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? null;
  const encodingHeader = /ENCODING:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? null;
  const hint = charset && !/^none$/i.test(charset) ? charset : encodingHeader;
  const { text } = decodeStatementText(buffer, hint);
  if (!/<OFX>/i.test(text)) {
    throw new BadRequestException(
      'Fichier OFX non reconnu : balise <OFX> absente.',
    );
  }

  const warnings: string[] = [];
  const stmtrs = aggregate(text, 'STMTRS') ?? text;
  const acctFrom = aggregate(stmtrs, 'BANKACCTFROM');
  const accountId = acctFrom ? tagValue(acctFrom, 'ACCTID') : null;
  const currency = tagValue(stmtrs, 'CURDEF');
  const tranList = aggregate(stmtrs, 'BANKTRANLIST') ?? '';
  const periodStart = parseOfxDate(tagValue(tranList, 'DTSTART'));
  const periodEnd = parseOfxDate(tagValue(tranList, 'DTEND'));

  const blocks = tranList.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const lines: ParsedStatementLine[] = [];
  blocks.forEach((block, i) => {
    const bookedOn = parseOfxDate(tagValue(block, 'DTPOSTED'));
    const amountCents = parseOfxAmount(tagValue(block, 'TRNAMT'));
    if (!bookedOn || amountCents === null) {
      warnings.push(`Transaction ${i + 1} ignorée : date ou montant illisible.`);
      return;
    }
    const name = tagValue(block, 'NAME');
    const memo = tagValue(block, 'MEMO');
    const label = name ?? memo ?? '(sans libellé)';
    lines.push({
      bookedOn,
      valueOn: parseOfxDate(tagValue(block, 'DTAVAIL')),
      label,
      rawLabel:
        [name, memo].filter((x): x is string => !!x).join(' | ') || label,
      reference: tagValue(block, 'REFNUM') ?? tagValue(block, 'CHECKNUM'),
      amountCents,
      balanceAfterCents: null,
      fitId: tagValue(block, 'FITID'),
    });
  });

  const sorted = sortByDateStable(lines);
  const ledger = aggregate(stmtrs, 'LEDGERBAL');
  const closingBalanceCents = ledger
    ? parseOfxAmount(tagValue(ledger, 'BALAMT'))
    : null;
  const sum = sorted.reduce((s, l) => s + l.amountCents, 0);

  return {
    lines: sorted,
    openingBalanceCents:
      closingBalanceCents === null ? null : closingBalanceCents - sum,
    closingBalanceCents,
    periodStart: periodStart ?? sorted[0]?.bookedOn ?? null,
    periodEnd: periodEnd ?? sorted[sorted.length - 1]?.bookedOn ?? null,
    accountId,
    currency,
    warnings,
  };
}
