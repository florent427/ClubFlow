/**
 * Sérialise une cellule CSV (RFC 4180) en échappant les guillemets et en
 * entourant la valeur de guillemets si elle contient `"`, `,`, `;`, `\n` ou `\r`.
 */
function escapeCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Construit une chaîne CSV à partir d'un tableau d'en-têtes et de lignes.
 * Utilise `;` comme séparateur pour compatibilité Excel FR.
 */
export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const head = headers.map(escapeCell).join(';');
  const body = rows.map((row) => row.map(escapeCell).join(';')).join('\n');
  return head + '\n' + body;
}

/**
 * Déclenche un téléchargement CSV dans le navigateur (avec BOM UTF-8 pour Excel).
 */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
