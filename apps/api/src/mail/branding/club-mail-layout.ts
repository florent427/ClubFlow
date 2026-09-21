/**
 * Enveloppe commune à TOUS les e-mails ClubFlow.
 *
 * Les services d'envoi ne produisent que le **corps** (quelques `<p>`, une
 * table de lignes…) ; l'en-tête, le pied, les coordonnées du club et la
 * charte sont posés ici, une fois. Voir `BrandedMailTransport` : l'enveloppe
 * est appliquée au goulot, pas à chaque appel, pour qu'un nouveau point
 * d'envoi ne puisse pas y échapper par oubli.
 *
 * Contraintes clients mail : tables, styles *inline*, largeur 600 px, pas de
 * flex ni grid, pas de `<style>` fiable (Gmail le retire en partie).
 */
import type { ClubMailBranding } from './club-mail-branding';

export type ClubMailLayoutInput = {
  branding: ClubMailBranding;
  /** Corps déjà rendu par le service appelant (fragment, pas un document). */
  bodyHtml: string;
  /** Repris dans le pied des campagnes ; absent pour le transactionnel. */
  unsubscribeUrl?: string | null;
  /**
   * Première ligne lue dans la liste des messages, avant ouverture. Sans elle
   * les clients affichent le début du corps, souvent « Bonjour, ».
   */
  preheader?: string | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** true si le HTML fourni est déjà un document complet, donc non enveloppable. */
export function isFullHtmlDocument(html: string): boolean {
  return /<!DOCTYPE\s+html|<html[\s>]/i.test(html);
}

function headerBlock(b: ClubMailBranding): string {
  const name = escapeHtml(b.clubName);
  // Pastille claire derrière le logo. Un logo de club est le plus souvent
  // monochrome sombre sur fond transparent (celui de SKSR est en #040302) :
  // posé à même le bandeau `ink`, il serait noir sur noir. La pastille le
  // rend lisible quelle que soit la couleur du logo, et donne un fond franc
  // aux formats sans transparence — un PNG transparent converti en JPEG par
  // le routeur d'envoi arrive en aplat blanc.
  const inner = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${name}" width="64" height="64"
           style="display:block;margin:0 auto 12px;width:64px;height:64px;border:0;padding:8px;background:#ffffff;border-radius:50%;" />
       <div style="font-size:17px;font-weight:600;letter-spacing:.02em;color:#ffffff;">${name}</div>`
    : `<div style="font-size:21px;font-weight:600;letter-spacing:.03em;color:#ffffff;">${name}</div>`;

  return `
        <tr>
          <td style="background:${b.palette.ink};padding:28px 24px 24px;text-align:center;">
            ${inner}
            <div style="height:3px;width:44px;margin:14px auto 0;background:${b.palette.accent};"></div>
          </td>
        </tr>`;
}

function contactLines(b: ClubMailBranding): string[] {
  const lines: string[] = [];
  if (b.address) {
    // L'adresse est stockée multi-lignes, séparées par des sauts de ligne.
    lines.push(
      b.address
        .split(/\r?\n/)
        .map((l) => escapeHtml(l.trim()))
        .filter(Boolean)
        .join('<br />'),
    );
  }
  const joignable: string[] = [];
  if (b.contactPhone) {
    joignable.push(escapeHtml(b.contactPhone));
  }
  if (b.contactEmail) {
    const mail = escapeHtml(b.contactEmail);
    joignable.push(
      `<a href="mailto:${mail}" style="color:inherit;text-decoration:underline;">${mail}</a>`,
    );
  }
  if (joignable.length) {
    lines.push(joignable.join(' &nbsp;·&nbsp; '));
  }
  return lines;
}

function footerBlock(b: ClubMailBranding, unsubscribeUrl?: string | null): string {
  const contact = contactLines(b);
  const legal: string[] = [];
  if (b.legalMentions) {
    legal.push(escapeHtml(b.legalMentions));
  }
  if (b.siret) {
    legal.push(`SIRET ${escapeHtml(b.siret)}`);
  }

  const contactHtml = contact.length
    ? `<div style="font-size:13px;line-height:1.6;color:#ffffff;opacity:.85;">${contact.join(
        '<br />',
      )}</div>`
    : '';

  const legalHtml = legal.length
    ? `<div style="margin-top:14px;font-size:11px;line-height:1.55;color:#ffffff;opacity:.6;">${legal.join(
        '<br />',
      )}</div>`
    : '';

  const unsubHtml = unsubscribeUrl
    ? `<div style="margin-top:14px;font-size:11px;color:#ffffff;opacity:.6;">
         <a href="${escapeHtml(
           unsubscribeUrl,
         )}" style="color:#ffffff;text-decoration:underline;">Se désinscrire de ces envois</a>
       </div>`
    : '';

  return `
        <tr>
          <td style="background:${b.palette.ink};padding:24px;text-align:center;">
            <div style="font-size:14px;font-weight:600;color:#ffffff;margin-bottom:8px;">${escapeHtml(
              b.clubName,
            )}</div>
            ${contactHtml}
            ${legalHtml}
            ${unsubHtml}
          </td>
        </tr>`;
}

/**
 * Remplace les jetons de charte du corps par les couleurs du club.
 *
 * Permet à un bouton ou un filet d'être à la couleur du club sans que le
 * service appelant ait à charger la charte — sinon chacun le referait à sa
 * façon. Le remplacement passe par une fonction : une chaîne littérale
 * verrait `$&` et consorts interprétés.
 */
export function applyPaletteTokens(html: string, b: ClubMailBranding): string {
  return html
    .replace(/\{\{accent\}\}/g, () => b.palette.accent)
    .replace(/\{\{ink\}\}/g, () => b.palette.ink)
    .replace(/\{\{muted\}\}/g, () => b.palette.muted);
}

/** Enveloppe le corps aux couleurs et coordonnées du club. */
export function renderClubMailLayout(input: ClubMailLayoutInput): string {
  const { branding: b, unsubscribeUrl, preheader } = input;
  const bodyHtml = applyPaletteTokens(input.bodyHtml, b);

  // Texte d'aperçu : masqué à l'affichage, lu par la liste des messages.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(
        preheader,
      )}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(b.clubName)}</title>
</head>
<body style="margin:0;padding:0;background:${b.palette.paper};">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:${b.palette.paper};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:600px;border-collapse:separate;border-spacing:0;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${headerBlock(b)}
          <tr>
            <td style="background:#ffffff;padding:32px 28px;font-size:15px;line-height:1.65;color:#1f2937;">
${bodyHtml}
            </td>
          </tr>
${footerBlock(b, unsubscribeUrl)}
        </table>
        <div style="max-width:600px;margin:14px auto 0;font-size:11px;color:${b.palette.muted};text-align:center;">
          Envoyé avec ClubFlow
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Signature ajoutée à la version texte, pour que les deux disent la même chose. */
export function clubMailTextSignature(
  b: ClubMailBranding,
  unsubscribeUrl?: string | null,
): string {
  const parts = [b.clubName];
  if (b.address) {
    parts.push(b.address.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(', '));
  }
  const joignable = [b.contactPhone, b.contactEmail].filter(Boolean);
  if (joignable.length) {
    parts.push(joignable.join(' · '));
  }
  if (unsubscribeUrl) {
    parts.push(`Se désinscrire : ${unsubscribeUrl}`);
  }
  return `\n\n--\n${parts.join('\n')}`;
}
