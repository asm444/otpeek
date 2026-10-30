const MAX_BODY_CHARS = 256 * 1024;

const KEYWORD = /c[oó]dig|\bc[oó]d\b|code\b|\bcode|\b(?:t?otp|mfa|2fa|pin)\b|v[eé]rifi|verify|confirm|best[aä]tig|\bsenha|password|passcode|passwort|contrase[nñ]a|mot de passe|\bclave\b|codice|\bkod\b|token|one[- ]time|uso [uú]nico|autentica|authenticat|authentifi|seguran[cç]a|seguridad|security|sicherheit|\blogin\b|sign[- ]?in|anmeld/i;

const STRONG = /c[oó]dig|\bc[oó]d\b|code\b|\bcode|\b(?:t?otp|mfa|2fa|pin)\b|passcode|\bclave\b|codice|\bkod\b|token|one[- ]time|uso [uú]nico/i;

const NOT_KEYWORD = /\b(?:bar|zip|post(?:al)?|promo(?:tion(?:al)?)?|discount|coupon|gift|referral|tracking|qr|country|area|source)[ -]?codes?\b|\b(?:unicode|vscode|encode|decode)\b|c[oó]digos? (?:de barras|postal|promocional|de desconto|do cupom|de rastreio|de rastreamento|de indica[cç][aã]o|do produto|do cliente|do pedido|fonte|aberto|civil|penal|tribut[aá]rio|de processo|de defesa|de [eé]tica|de conduta)/gi;

const NOT_CODE_BEFORE = /(\b(?:pedido|order|n[ºo°]\.?|protocolo|invoice|fatura|nota fiscal|cpf|cnpj|cep|tel\.?|fone|phone|ref\.?|oab(?:\/\w{2})?|ramal|apto?\.?|sala|ag[eê]ncia|conta|processo|boleto|matr[ií]cula|chamado|ticket|cupom|coupon)|[#$€£]|n[º°]\.?)\s*:?\s*$/i;

const DATE_CONTEXT = /\b(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[a-zç]*\b|©|copyright/i;

const NUMERIC = /(?<![\w\-\/.,$])(?<!\d )(\d{3}[ .-]\d{3}|\d{2} \d{2} \d{2}|\d(?: \d){3,7}|\d{6,8}|\d{4,5}(?! \d))(?![\w\-\/%]|[.,]\d)/g;

const ALNUM = /(?<![\w\-])([A-Z]{1,4}-\d{4,8}|[A-Z0-9]{3,6}(?:-[A-Z0-9]{3,6}){1,3}|[A-Z0-9]{5,10})(?![\w\-])/g;

const LABELLED = new RegExp(`(?:${STRONG.source}|\\bsenha\\b|password|passwort|contrase[nñ]a)[^.!?]{0,40}?(?:[:=#]|\\s(?:is|é|foi|ist|est|es|son)\\s)\\s*[*"'“«(\\[]*(\\d{4} \\d{4}|[A-Za-z0-9]+(?:-[A-Za-z0-9]+){0,3})(?![\\w-])`, 'gi');

const LINK_HINT = /verif|confirm|activat|ativa|valida|\bauth|login|log-in|sign-?in|magic|token|reset|redefin|recupera|approve|aprova/i;

const LINK_BLOCK = /unsubscribe|descadastr|cancelar[- ]inscri|opt-?out|preferenc|privacy|privacidade|\bterms\b|termos|\bhelp\b|ajuda|suporte|support|\.(png|jpe?g|gif|svg)(\?|$)/i;

const ENTITIES = {
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  zwnj: '', zwj: '', shy: '', copy: '©', reg: '®', trade: '™', deg: '°', ordm: 'º', ordf: 'ª',
  ndash: '–', mdash: '—', middot: '·', bull: '•', hellip: '…', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', euro: '€', pound: '£', szlig: 'ß',
};
const ACCENT_MARKS = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧', ring: '̊' };
for (const [name, mark] of Object.entries(ACCENT_MARKS)) {
  for (const letter of 'aeiouycnAEIOUYCN') {
    const composed = (letter + mark).normalize('NFC');
    if (composed.length === 1) ENTITIES[letter + name] = composed;
  }
}

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name in ENTITIES) return ENTITIES[name];
    const lower = name.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (!lower.startsWith('#')) return whole;
    const point = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  });
}

function normalizeText(s) {
  return s
    .normalize('NFC')
    .replace(/[­͏​-‍⁠﻿]/g, '')
    .replace(/[  -   　]/g, ' ');
}

export function htmlToText(html) {
  return normalizeText(decodeEntities(
    html
      .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|tr|td|th|li|h[1-6]|table|section)>/gi, '\n')
      .replace(/<[^<>]{1,8192}>/g, ' ')
  ))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n\s*/g, '\n')
    .trim();
}

const withoutFalseKeywords = line => line.replace(NOT_KEYWORD, ' ');
const hasKeyword = line => KEYWORD.test(withoutFalseKeywords(line));
const hasStrong = line => STRONG.test(withoutFalseKeywords(line));

function isLikelyYear(value, line, standalone) {
  return /^(19|20)\d\d$/.test(value) && (!standalone || DATE_CONTEXT.test(line));
}

function acceptsLabelled(value, line) {
  if (value.length < 4 || value.length > 24 || /^\d{4}-\d\d/.test(value)) return false;
  if (/\d/.test(value)) return true;
  if (/^[a-z]+(?:-[a-z]+){2,}$/.test(value)) return true;
  return /^[A-Z-]+$/.test(value) && line !== line.toUpperCase();
}

function candidatesIn(rawLine) {
  const line = rawLine.replace(/https?:\/\/\S+/gi, ' ');
  const isAlone = m => line.replace(m[1], '').replace(/[\s*"'“”«»()[\]:.,]/g, '') === '';
  const found = [];
  for (const m of withoutFalseKeywords(line).matchAll(LABELLED)) {
    if (acceptsLabelled(m[1], line)) {
      const numeric = /^\d[\d -]*$/.test(m[1]);
      found.push({ value: numeric ? m[1].replace(/[ -]/g, '') : m[1], numeric, labelled: true });
    }
  }
  for (const m of line.matchAll(NUMERIC)) {
    const value = m[1].replace(/[ .-]/g, '');
    const standalone = isAlone(m);
    if (NOT_CODE_BEFORE.test(line.slice(0, m.index))) continue;
    if (isLikelyYear(value, line, standalone)) continue;
    found.push({ value, numeric: true, standalone });
  }
  for (const m of line.matchAll(ALNUM)) {
    const raw = m[1];
    const standalone = isAlone(m);
    const lettersOnlyGroups = standalone && /^[A-Z]{3,6}(?:-[A-Z]{3,6})+$/.test(raw);
    if (!lettersOnlyGroups && (!/\d/.test(raw) || !/[A-Z]/.test(raw))) continue;
    if (NOT_CODE_BEFORE.test(line.slice(0, m.index))) continue;
    found.push({ value: raw, numeric: false, standalone });
  }
  return found;
}

function joinSplitCharacters(lines) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 4) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const line of lines) {
    if (/^[A-Za-z0-9]$/.test(line)) {
      run.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out;
}

export function findCode(subject, body) {
  const lines = joinSplitCharacters(
    [subject, ...normalizeText(body).split('\n')].map(l => normalizeText(l).trim()).filter(Boolean)
  );
  const messageHasStrong = lines.some(hasStrong);
  let best = null;
  lines.forEach((line, i) => {
    let near = 0;
    if (hasKeyword(line)) near = 3;
    else if (i > 0 && hasKeyword(lines[i - 1])) near = 2;
    else if (i > 1 && hasKeyword(lines[i - 2])) near = 1;
    for (const c of candidatesIn(line)) {
      let score = near;
      if (c.labelled) score = 4;
      else if (c.standalone) {
        if (i + 1 < lines.length && hasKeyword(lines[i + 1])) score = Math.max(score, 2);
        score = score ? Math.min(score + 1, 3) : messageHasStrong ? 1 : 0;
      }
      if (!score) continue;
      const rank = score * 10 + (c.numeric ? 2 : 0) + (c.value.length === 6 ? 1 : 0);
      if (!best || rank > best.rank) best = { ...c, rank };
    }
  });
  return best?.value ?? null;
}

function linkCandidates(html, text) {
  const links = [];
  for (const m of html.matchAll(/<a\b[^>]{0,8192}>/gi)) {
    const href = /\bhref\s{0,8}=\s{0,8}(["'])(.*?)\1/i.exec(m[0]);
    if (!href) continue;
    const start = m.index + m[0].length;
    const inner = html.slice(start, start + 8192);
    const close = inner.search(/<\/a>/i);
    if (close >= 0) links.push({ url: decodeEntities(href[2]).trim(), label: htmlToText(inner.slice(0, close)) });
  }
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
      links.push({ url: m[0].replace(/[.,;]+$/, ''), label: line.replace(m[0], '').trim() });
    }
  }
  return links;
}

export function findLink(subject, html, text) {
  if (!hasKeyword(subject) && !hasKeyword(text) && !hasKeyword(htmlToText(html))) return null;
  let best = null;
  for (const { url, label } of linkCandidates(html, text)) {
    if (!/^https?:\/\//i.test(url)) continue;
    if (LINK_BLOCK.test(url) || LINK_BLOCK.test(label)) continue;
    const rank = (LINK_HINT.test(label) ? 2 : 0) + (LINK_HINT.test(url) ? 1 : 0);
    if (rank && (!best || rank > best.rank)) best = { url, label, rank };
  }
  return best && { url: best.url, label: best.label };
}

export function extract(message, kinds = { codes: true, links: true }) {
  const msg = { ...message, text: message.text.slice(0, MAX_BODY_CHARS), html: message.html.slice(0, MAX_BODY_CHARS) };
  const items = [];
  if (kinds.codes) {
    const code = findCode(msg.subject, msg.text) ?? findCode(msg.subject, htmlToText(msg.html));
    if (code) items.push({ kind: 'code', value: code });
  }
  if (kinds.links) {
    const link = findLink(msg.subject, msg.html, msg.text);
    if (link) items.push({ kind: 'link', value: link.url, label: link.label });
  }
  return items;
}
