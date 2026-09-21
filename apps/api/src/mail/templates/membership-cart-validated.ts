import type { SubscriptionBillingRhythm } from '@prisma/client';

export type MembershipCartEmailItem = {
  memberFullName: string;
  productLabel: string | null;
  billingRhythm: SubscriptionBillingRhythm;
  lineTotalCents: number;
  hasExistingLicense: boolean;
  existingLicenseNumber: string | null;
};

export type MembershipCartEmailInput = {
  clubName: string;
  seasonLabel: string;
  payerName: string;
  invoiceId: string;
  totalCents: number;
  items: MembershipCartEmailItem[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  });
}

export function renderMembershipCartValidatedEmail(
  input: MembershipCartEmailInput,
): { subject: string; html: string; text: string } {
  const { clubName, seasonLabel, payerName, invoiceId, totalCents, items } =
    input;
  const subject = `${clubName} — Projet d’adhésion ${seasonLabel} validé`;
  const safeClub = escapeHtml(clubName);
  const safeSeason = escapeHtml(seasonLabel);
  const safePayer = escapeHtml(payerName);
  const portalOrigin =
    process.env.MEMBER_PORTAL_ORIGIN?.split(',')[0]?.trim() ||
    'http://localhost:5174';
  const invoiceUrl = `${portalOrigin}/billing/${invoiceId}`;

  const rows = items
    .map((item) => {
      const rhythm =
        item.billingRhythm === 'ANNUAL' ? 'Annuel' : 'Mensuel';
      const license = item.hasExistingLicense
        ? `<br/><small style="color:#64748b;">Licence existante : ${escapeHtml(
            item.existingLicenseNumber ?? '',
          )}</small>`
        : '';
      return `
        <tr>
          <td style="padding:12px 16px;border-top:1px solid #e2e8f0;">
            <strong>${escapeHtml(item.memberFullName)}</strong><br/>
            <span style="color:#334155;">${escapeHtml(
              item.productLabel ?? '—',
            )} (${rhythm})</span>${license}
          </td>
          <td style="padding:12px 16px;border-top:1px solid #e2e8f0;text-align:right;font-variant-numeric:tabular-nums;">
            ${formatCents(item.lineTotalCents)}
          </td>
        </tr>
      `;
    })
    .join('');

  // Fragment : l'en-tete, le pied et la charte du club viennent de
  // `renderClubMailLayout`. Les jetons {{accent}} sont remplaces par la
  // couleur du club au moment de l'envoi.
  const html = `
<h1 style="margin:0 0 20px;font-size:20px;line-height:1.3;font-weight:600;color:{{ink}};">Projet d’adhésion ${safeSeason} validé</h1>
<p style="margin:0 0 16px;">Bonjour ${safePayer},</p>
<p style="margin:0 0 24px;">Votre projet d’adhésion pour la saison <strong>${safeSeason}</strong> a été validé auprès de ${safeClub}. La facture correspondante vient d’être émise et le paiement peut désormais être initié depuis votre espace membre.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin:0 0 24px;">
  <thead>
    <tr style="background:#f1f5f9;">
      <th align="left" style="padding:12px 16px;color:#475569;font-weight:600;">Bénéficiaire</th>
      <th align="right" style="padding:12px 16px;color:#475569;font-weight:600;">Montant</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr>
      <td style="padding:14px 16px;border-top:2px solid {{accent}};font-weight:600;">TOTAL TTC</td>
      <td style="padding:14px 16px;border-top:2px solid {{accent}};text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${formatCents(totalCents)}</td>
    </tr>
  </tbody>
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
  <tr><td style="background:{{accent}};border-radius:6px;">
    <a href="${invoiceUrl}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Voir ma facture &amp; payer</a>
  </td></tr>
</table>
<p style="margin:0 0 8px;font-size:13px;color:#64748b;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br /><span style="word-break:break-all;">${escapeHtml(invoiceUrl)}</span></p>
<p style="margin:16px 0 0;">Merci pour votre confiance !</p>`.trim();

  const lines = items.map(
    (item) =>
      `- ${item.memberFullName} — ${item.productLabel ?? '—'} (${item.billingRhythm === 'ANNUAL' ? 'Annuel' : 'Mensuel'}) : ${formatCents(item.lineTotalCents)}`,
  );
  const text = [
    `Bonjour ${payerName},`,
    '',
    `Votre projet d’adhésion pour la saison ${seasonLabel} a été validé.`,
    '',
    'Détail :',
    ...lines,
    '',
    `TOTAL TTC : ${formatCents(totalCents)}`,
    '',
    `Facture et paiement : ${invoiceUrl}`,
    '',
    `— ${clubName}`,
  ].join('\n');

  return { subject, html, text };
}
