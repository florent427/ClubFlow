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

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#134e4a 100%);padding:28px 24px;text-align:center;color:#ffffff;">
              <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.85);">ClubFlow</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;font-weight:600;">${safeClub}</h1>
              <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.8);">Projet d’adhésion ${safeSeason} validé</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;color:#1e293b;font-size:16px;line-height:1.6;">
              <p style="margin:0 0 16px;">Bonjour ${safePayer},</p>
              <p style="margin:0 0 16px;">Votre projet d’adhésion pour la saison <strong>${safeSeason}</strong> a été validé. La facture correspondante vient d’être émise et le paiement peut désormais être initié depuis votre espace membre.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:system-ui,-apple-system,sans-serif;font-size:14px;">
                <thead>
                  <tr style="background:#f1f5f9;">
                    <th align="left" style="padding:12px 16px;color:#475569;font-weight:600;">Bénéficiaire</th>
                    <th align="right" style="padding:12px 16px;color:#475569;font-weight:600;">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  <tr>
                    <td style="padding:14px 16px;border-top:2px solid #0f766e;font-weight:600;color:#0f766e;">TOTAL TTC</td>
                    <td style="padding:14px 16px;border-top:2px solid #0f766e;text-align:right;font-weight:700;color:#0f766e;font-variant-numeric:tabular-nums;">
                      ${formatCents(totalCents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 24px 28px;">
              <a href="${invoiceUrl}" style="display:inline-block;padding:14px 28px;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;border-radius:999px;font-family:system-ui,-apple-system,sans-serif;">Voir ma facture &amp; payer</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;color:#64748b;font-size:13px;line-height:1.5;border-top:1px solid #e2e8f0;">
              <p style="margin:16px 0 8px;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/><span style="word-break:break-all;color:#0f766e;">${escapeHtml(invoiceUrl)}</span></p>
              <p style="margin:0;">Merci pour votre confiance&nbsp;!<br/>L’équipe ${safeClub}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

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
