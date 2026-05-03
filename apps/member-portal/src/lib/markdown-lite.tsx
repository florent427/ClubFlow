import type { ReactNode } from 'react';

/**
 * Rend un sous-ensemble sûr de Markdown sans HTML brut ni dépendance externe :
 * titres #/##/###, paragraphes, listes à puces (-/*), gras **x**, italique _x_, liens [t](url).
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let buf = '';
  let keyIdx = 0;
  const pushBuf = () => {
    if (buf) {
      nodes.push(buf);
      buf = '';
    }
  };
  while (i < text.length) {
    const ch = text[i];
    // link [text](url)
    if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close !== -1 && text[close + 1] === '(') {
        const urlEnd = text.indexOf(')', close + 2);
        if (urlEnd !== -1) {
          const label = text.slice(i + 1, close);
          const url = text.slice(close + 2, urlEnd);
          const safe = /^https?:\/\//.test(url) || url.startsWith('mailto:');
          pushBuf();
          if (safe) {
            nodes.push(
              <a
                key={`${keyBase}-l-${keyIdx++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {label}
              </a>,
            );
          } else {
            nodes.push(label);
          }
          i = urlEnd + 1;
          continue;
        }
      }
    }
    // bold **text**
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        pushBuf();
        nodes.push(
          <strong key={`${keyBase}-b-${keyIdx++}`}>
            {text.slice(i + 2, end)}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }
    // italic _text_
    if (ch === '_') {
      const end = text.indexOf('_', i + 1);
      if (end !== -1 && end !== i + 1) {
        pushBuf();
        nodes.push(
          <em key={`${keyBase}-i-${keyIdx++}`}>{text.slice(i + 1, end)}</em>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  pushBuf();
  return nodes;
}

export function renderMarkdownLite(source: string): ReactNode[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let keyIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Heading ###, ##, #
    const h = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      const content = renderInline(h[2], `h${keyIdx}`);
      if (level === 1)
        out.push(<h1 key={`md-${keyIdx++}`}>{content}</h1>);
      else if (level === 2)
        out.push(<h2 key={`md-${keyIdx++}`}>{content}</h2>);
      else out.push(<h3 key={`md-${keyIdx++}`}>{content}</h3>);
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const t = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push(
          <li key={`md-${keyIdx}-li-${items.length}`}>
            {renderInline(t, `md-${keyIdx}-li-${items.length}`)}
          </li>,
        );
        i++;
      }
      out.push(<ul key={`md-${keyIdx++}`}>{items}</ul>);
      continue;
    }

    // Paragraph (concat consecutive non-empty, non-special lines)
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const joined = paraLines.join(' ');
    out.push(
      <p key={`md-${keyIdx}`}>{renderInline(joined, `md-${keyIdx++}-p`)}</p>,
    );
  }

  return out;
}
