import nodemailer from 'nodemailer';

// Without SMTP_HOST (local dev only) the link is printed instead of sent.
export function createMailer(env) {
  if (!env.SMTP_HOST) {
    return {
      async sendLoginLink(to, link) {
        console.log(`[mail] lien de connexion pour ${to} : ${link}`);
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return {
    async sendLoginLink(to, link) {
      await transport.sendMail({
        from: env.MAIL_FROM,
        to,
        subject: 'Budget vacances : votre lien de connexion',
        text:
          `Bonjour,\n\nPour ouvrir le budget des vacances, cliquez sur ce lien ` +
          `(valable 15 minutes, une seule fois) :\n\n${link}\n\n` +
          `Si vous n'avez rien demandé, ignorez ce message.`,
        html:
          `<p>Bonjour,</p><p>Pour ouvrir le budget des vacances, cliquez sur ce lien ` +
          `(valable 15 minutes, une seule fois) :</p>` +
          `<p><a href="${link}">Ouvrir le budget</a></p>` +
          `<p>Si vous n'avez rien demandé, ignorez ce message.</p>`,
      });
    },
  };
}
