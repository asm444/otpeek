export function header(headers, name) {
  const lower = name.toLowerCase();
  return (headers || []).find(h => h.name.toLowerCase() === lower)?.value ?? '';
}

function bytesFromBase64Url(data) {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function decodeBase64Url(data, charset) {
  return decodeBytes(bytesFromBase64Url(data), charset);
}

export function decodeEncodedWords(value) {
  return value
    .replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, '$1')
    .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (whole, charset, enc, text) => {
      try {
        if (enc.toLowerCase() === 'b') {
          return decodeBytes(Uint8Array.from(atob(text), c => c.charCodeAt(0)), charset);
        }
        const bytes = [];
        const q = text.replace(/_/g, ' ');
        for (let i = 0; i < q.length; i++) {
          if (q[i] === '=' && /^[0-9a-f]{2}$/i.test(q.slice(i + 1, i + 3))) {
            bytes.push(parseInt(q.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            bytes.push(q.charCodeAt(i));
          }
        }
        return decodeBytes(Uint8Array.from(bytes), charset);
      } catch {
        return whole;
      }
    });
}

export function collectBodies(payload) {
  const out = { text: '', html: '' };
  const walk = part => {
    if (!part) return;
    if (part.parts) {
      part.parts.forEach(walk);
      return;
    }
    if (part.filename || !part.body?.data) return;
    const mime = (part.mimeType || '').toLowerCase();
    if (mime !== 'text/plain' && mime !== 'text/html') return;
    const charset = /charset="?([^";\s]+)/i.exec(header(part.headers, 'Content-Type'))?.[1];
    const body = decodeBase64Url(part.body.data, charset);
    if (mime === 'text/plain') out.text += body + '\n';
    else out.html += body + '\n';
  };
  walk(payload);
  return out;
}

export function parseMessage(msg) {
  const headers = msg.payload?.headers;
  const { text, html } = collectBodies(msg.payload);
  return {
    id: msg.id,
    from: decodeEncodedWords(header(headers, 'From')),
    subject: decodeEncodedWords(header(headers, 'Subject')),
    date: Number(msg.internalDate) || Date.now(),
    text,
    html,
  };
}

export function senderName(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(from);
  if (!m) return from.trim();
  return m[1].trim() || m[2].trim();
}

export function senderAddress(from) {
  return (/<([^>]+)>/.exec(from)?.[1] ?? from).trim();
}
