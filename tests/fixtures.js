const enc = new TextEncoder();

export function b64url(str, bytes = enc.encode(str)) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function latin1(str) {
  return Uint8Array.from(str, c => c.charCodeAt(0));
}

export function message({ id, from = 'Serviço <no-reply@example.com>', subject, text, html, date = 1790000000000 }) {
  const parts = [];
  if (text !== undefined) {
    parts.push({ mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="UTF-8"' }], body: { data: b64url(text) } });
  }
  if (html !== undefined) {
    parts.push({ mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: b64url(html) } });
  }
  return {
    id,
    internalDate: String(date),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
      ],
      parts,
    },
  };
}
