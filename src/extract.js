const KEYWORD = /c[oó]dig|\bcode|\botp\b|\bpin\b|verifica|verify|confirma|confirm|\bsenha|password|passcode|token|one[- ]time|\b2fa\b|autentica|authenticat|seguran[cç]a|security|\blogin\b|sign[- ]?in/i;

const NOT_CODE_BEFORE = /(pedido|order|n[ºo°]\.?|#|protocolo|invoice|fatura|nota fiscal|cpf|cnpj|cep|tel\.?|fone|phone|r\$|us\$|\$|€|£|ref\.?)\s*:?\s*$/i;

const DATE_CONTEXT = /\b(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[a-zç]*\b|©|copyright/i;

const NUMERIC = /(?<![\w\-\/.,$])(\d{3}[ -]\d{3}|\d{4,8})(?![\w\-\/%]|[.,]\d)/g;

const ALNUM = /(?<![\w\-])([A-Z0-9]{3,6}-[A-Z0-9]{3,6}|[A-Z0-9]{5,10})(?![\w\-])/g;

const LINK_HINT = /verif|confirm|activat|ativa|valida|\bauth|login|log-in|sign-?in|magic|token|reset|redefin|recupera|approve|aprova/i;

const LINK_BLOCK = /unsubscribe|descadastr|cancelar[- ]inscri|opt-?out|preferenc|privacy|privacidade|\bterms\b|termos|\bhelp\b|ajuda|suporte|support|\.(png|jpe?g|gif|svg)(\?|$)/i;

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name) => {
    const lower = name.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return whole;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|td|th|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ​‌͏]+/g, ' ')
    .replace(/ *\n[\s\n]*/g, '\n')
    .trim();
}

function isLikelyYear(value, line) {
  return /^(19|20)\d\d$/.test(value) && DATE_CONTEXT.test(line);
}

function candidatesIn(line) {
  const found = [];
  for (const m of line.matchAll(NUMERIC)) {
    const value = m[1].replace(/[ -]/g, '');
    if (NOT_CODE_BEFORE.test(line.slice(0, m.index))) continue;
    if (isLikelyYear(value, line)) continue;
    found.push({ value, index: m.index, numeric: true });
  }
  for (const m of line.matchAll(ALNUM)) {
    const raw = m[1];
    if (!/\d/.test(raw) || !/[A-Z]/.test(raw)) continue;
    if (NOT_CODE_BEFORE.test(line.slice(0, m.index))) continue;
    found.push({ value: raw, index: m.index, numeric: false });
  }
  return found;
}

export function findCode(subject, body) {
  const lines = [subject, ...body.split('\n')].map(l => l.trim()).filter(Boolean);
  let best = null;
  lines.forEach((line, i) => {
    let score = 0;
    if (KEYWORD.test(line)) score = 3;
    else if (i > 0 && KEYWORD.test(lines[i - 1])) score = 2;
    else if (i > 1 && KEYWORD.test(lines[i - 2])) score = 1;
    if (!score) return;
    for (const c of candidatesIn(line)) {
      const rank = score * 10 + (c.numeric ? 2 : 0) + (c.value.length === 6 ? 1 : 0);
      if (!best || rank > best.rank) best = { ...c, rank };
    }
  });
  return best?.value ?? null;
}

function linkCandidates(html, text) {
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
    links.push({ url: decodeEntities(m[2]).trim(), label: htmlToText(m[3]) });
  }
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      links.push({ url: m[0].replace(/[.,;]+$/, ''), label: line.replace(m[0], '').trim() });
    }
  }
  return links;
}

export function findLink(subject, html, text) {
  if (!KEYWORD.test(subject) && !KEYWORD.test(text) && !KEYWORD.test(htmlToText(html))) return null;
  let best = null;
  for (const { url, label } of linkCandidates(html, text)) {
    if (!/^https?:\/\//i.test(url)) continue;
    if (LINK_BLOCK.test(url) || LINK_BLOCK.test(label)) continue;
    const rank = (LINK_HINT.test(label) ? 2 : 0) + (LINK_HINT.test(url) ? 1 : 0);
    if (rank && (!best || rank > best.rank)) best = { url, label, rank };
  }
  return best && { url: best.url, label: best.label };
}

export function extract(msg, kinds = { codes: true, links: true }) {
  const body = msg.text.trim() ? msg.text : htmlToText(msg.html);
  const items = [];
  if (kinds.codes) {
    const code = findCode(msg.subject, body);
    if (code) items.push({ kind: 'code', value: code });
  }
  if (kinds.links) {
    const link = findLink(msg.subject, msg.html, msg.text);
    if (link) items.push({ kind: 'link', value: link.url, label: link.label });
  }
  return items;
}
