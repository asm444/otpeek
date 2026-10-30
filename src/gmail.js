import { AuthError } from './auth.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class ApiError extends Error {
  constructor(status, body) {
    super(`Gmail API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
  }
}

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, v);
  return q.toString();
}

export function gmailClient(getToken, dropToken) {
  async function call(path, method = 'GET', retried = false) {
    const token = await getToken();
    const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && !retried) {
      await dropToken(token);
      return call(path, method, true);
    }
    if (res.status === 401) throw new AuthError('O Google recusou o acesso.');
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.status === 204 ? null : res.json();
  }
  return {
    profile: () => call('/profile'),
    list: (q, pageToken) => call(`/messages?${query({ q, maxResults: 100, pageToken })}`),
    history: (startHistoryId, pageToken) =>
      call(`/history?${query({ startHistoryId, historyTypes: 'messageAdded', labelId: 'INBOX', pageToken })}`),
    get: id => call(`/messages/${encodeURIComponent(id)}?format=full`),
    trash: id => call(`/messages/${encodeURIComponent(id)}/trash`, 'POST'),
  };
}
