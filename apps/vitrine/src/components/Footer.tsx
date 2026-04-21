import Link from 'next/link';

export interface FooterContent {
  tagline?: string; // kanji
  brandLine?: string; // ex. "Shotokan Karaté Sud Réunion"
  description?: string;
  socialLinks?: Array<{ href: string; label: string; icon?: string }>;
  columns?: Array<{
    title: string;
    links: Array<{ href: string; label: string; external?: boolean }>;
  }>;
  contact?: {
    address?: string; // lignes séparées par \n
    phone?: string;
    email?: string;
  };
  copyright?: string;
  legalBottomRight?: string; // ex. "Affilié FFKDA · Ligue..."
}

interface FooterProps {
  clubName: string;
  content: FooterContent;
}

export function Footer({ clubName, content }: FooterProps) {
  const brand = content.brandLine ?? clubName;
  return (
    <footer className="footer">
      <div className="footer__kanji">空</div>
      <div className="footer__grid">
        <div className="footer__col">
          {content.tagline ? (
            <div className="footer__tagline">{content.tagline}</div>
          ) : null}
          <div
            className="footer__brand-line"
            dangerouslySetInnerHTML={{
              __html: brand.replace(/\n/g, '<br />'),
            }}
          />
          {content.description ? (
            <p
              style={{
                maxWidth: 280,
                fontStyle: 'italic',
                fontFamily: 'var(--serif)',
              }}
            >
              {content.description}
            </p>
          ) : null}
          {content.socialLinks && content.socialLinks.length > 0 ? (
            <div className="social-links" style={{ marginTop: 18 }}>
              {content.socialLinks.map((sl) => (
                <a
                  key={sl.href}
                  href={sl.href}
                  target="_blank"
                  rel="noopener"
                  aria-label={sl.label}
                >
                  {sl.icon ? (
                    <span dangerouslySetInnerHTML={{ __html: sl.icon }} />
                  ) : (
                    <span>{sl.label.slice(0, 2)}</span>
                  )}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        {(content.columns ?? []).map((col) => (
          <div key={col.title} className="footer__col">
            <h4>{col.title}</h4>
            {col.links.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener"
                  style={
                    link.href.includes('helloasso')
                      ? { color: 'var(--accent)' }
                      : undefined
                  }
                >
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ),
            )}
          </div>
        ))}
        {content.contact ? (
          <div className="footer__col">
            <h4>Dojo</h4>
            {content.contact.address ? (
              <p
                dangerouslySetInnerHTML={{
                  __html: content.contact.address.replace(/\n/g, '<br />'),
                }}
              />
            ) : null}
            {content.contact.phone || content.contact.email ? (
              <p style={{ marginTop: 16 }}>
                {content.contact.phone}
                {content.contact.phone && content.contact.email ? <br /> : null}
                {content.contact.email}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="footer__bottom">
        <div>
          © {new Date().getFullYear()}{' '}
          {content.copyright ?? clubName}
        </div>
        {content.legalBottomRight ? <div>{content.legalBottomRight}</div> : null}
      </div>
    </footer>
  );
}
