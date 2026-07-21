const ALLOWED_TAGS = new Set(['a', 'br', 'p', 'strong', 'em', 'ul', 'ol', 'li']);

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractHref(attrs: string): string | null {
  const m = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i);
  if (!m) return null;
  const href = (m[1] ?? m[2] ?? m[3] ?? '').trim();
  return /^https?:\/\//i.test(href) ? href : null;
}

function sanitizeTag(raw: string): string {
  const inner = raw.slice(1, -1).trim();
  if (inner.startsWith('/')) {
    const tag = inner.slice(1).trim().toLowerCase().split(/\s/)[0];
    return ALLOWED_TAGS.has(tag) && tag !== 'br' ? `</${tag}>` : '';
  }
  const spaceIdx = inner.search(/\s/);
  const tag = (spaceIdx === -1 ? inner : inner.slice(0, spaceIdx)).toLowerCase();
  const attrs = spaceIdx === -1 ? '' : inner.slice(spaceIdx);
  if (!ALLOWED_TAGS.has(tag)) return '';
  if (tag === 'br') return '<br>';
  if (tag === 'a') {
    const href = extractHref(attrs);
    if (!href) return '';
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">`;
  }
  return `<${tag}>`;
}

function parseHtml(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) {
        out += '&lt;';
        i++;
        continue;
      }
      out += sanitizeTag(html.slice(i, end + 1));
      i = end + 1;
    } else {
      const next = html.indexOf('<', i);
      const chunk = next === -1 ? html.slice(i) : html.slice(i, next);
      // Text may already have HTML entities from Google — don't double-encode &
      out += chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      i = next === -1 ? html.length : next;
    }
  }
  return out;
}

const BARE_URL_RE = /(?<![="'`])https?:\/\/[^\s<>"']+/g;

function autoLink(html: string): string {
  // Only replace URLs that are NOT already inside an href attribute
  return html.replace(BARE_URL_RE, (url) => {
    // Strip trailing punctuation that's unlikely to be part of the URL
    const stripped = url.replace(/[.,;:!?)]+$/, '');
    const tail = url.slice(stripped.length);
    return `<a href="${stripped}" rel="noopener noreferrer" target="_blank">${escapeText(stripped)}</a>${tail}`;
  });
}

export function sanitizeEventHtml(raw: string | undefined | null): string {
  if (!raw) return '';
  const sanitized = parseHtml(raw);
  return autoLink(sanitized);
}
