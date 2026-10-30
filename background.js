import { authorize, AuthError, profilePhoto } from './src/auth.js';
import { gmailClient, ApiError } from './src/gmail.js';
import { parseMessage, senderName } from './src/mime.js';
import { extract } from './src/extract.js';

export const DEFAULTS = {
  clientId: '',
  accounts: [],
  photos: {},
  accountEmail: null,
  enabled: true,
  intervalSec: 10,
  scope: 'recent',
  maxResults: 20,
  kinds: { codes: true, links: true },
};

const QUERIES = {
  recent: { q: 'in:inbox newer_than:1d', cap: 100 },
  all: { q: 'in:inbox', cap: 500 },
};
const SEEN_CAP = 2000;
const WATCHDOG = 'watchdog';
const FRESH = { results: [], seen: [], historyId: null, email: null };

export async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...settings, kinds: { ...DEFAULTS.kinds, ...settings.kinds } };
}

async function saveSettings(patch) {
  await chrome.storage.local.set({ settings: { ...(await getSettings()), ...patch } });
}

const STATE_KEYS = ['results', 'seen', 'historyId', 'lastRun', 'status', 'error', 'email', 'justConnected', 'tokens'];

export async function getState() {
  const s = await chrome.storage.session.get(STATE_KEYS);
  return {
    results: [], seen: [], historyId: null, lastRun: 0, status: 'idle', error: null,
    email: null, justConnected: null, tokens: {}, ...s,
  };
}

const setState = patch => chrome.storage.session.set(patch);

// Os tokens ficam em chrome.storage.session: memoria do navegador, apagada ao fechar o Chrome.
async function cacheToken(email, entry) {
  const { tokens } = await getState();
  await setState({ tokens: { ...tokens, [email]: entry } });
}

async function dropToken(email) {
  const { tokens } = await getState();
  delete tokens[email];
  await setState({ tokens });
}

async function tokenFor(clientId, email) {
  const { tokens } = await getState();
  const cached = tokens[email];
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const fresh = await authorize(clientId, { email, interactive: false });
  await cacheToken(email, fresh);
  return fresh.token;
}

const clientFor = s => gmailClient(() => tokenFor(s.clientId, s.accountEmail), () => dropToken(s.accountEmail));

async function initialScan(api, scope) {
  const { q, cap } = QUERIES[scope] || QUERIES.recent;
  const { historyId } = await api.profile();
  const ids = [];
  let pageToken;
  do {
    const r = await api.list(q, pageToken);
    for (const m of r.messages || []) ids.push(m.id);
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < cap);
  return { ids: ids.slice(0, cap), historyId };
}

async function newSince(api, startHistoryId) {
  const ids = [];
  let historyId = startHistoryId;
  let pageToken;
  do {
    const r = await api.history(startHistoryId, pageToken);
    for (const h of r.history || []) for (const a of h.messagesAdded || []) ids.push(a.message.id);
    historyId = r.historyId || historyId;
    pageToken = r.nextPageToken;
  } while (pageToken);
  return { ids, historyId };
}

function mergeResults(current, found, max) {
  const byId = new Map(current.map(r => [r.id, r]));
  for (const r of found) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.date - a.date).slice(0, max);
}

async function updateBadge(results) {
  const n = results.filter(r => r.isNew).length;
  const { justConnected } = await chrome.storage.session.get('justConnected');
  await chrome.action.setBadgeBackgroundColor({ color: n || !justConnected ? '#1a73e8' : '#188038' });
  await chrome.action.setBadgeText({ text: n ? String(n) : justConnected ? 'OK' : '' });
}

async function runTick() {
  const s = await getSettings();
  if (!s.clientId) return setState({ status: 'setup' });
  if (!s.accountEmail) return setState({ status: 'disconnected' });
  if (!s.enabled) return setState({ status: 'paused' });
  const st = await getState();
  const api = clientFor(s);
  try {
    const { ids, historyId } = st.historyId ? await newSince(api, st.historyId) : await initialScan(api, s.scope);
    const seen = new Set(st.seen);
    const found = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      let raw;
      try {
        raw = await api.get(id);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) continue;
        throw e;
      }
      const msg = parseMessage(raw);
      const items = extract(msg, s.kinds);
      if (items.length) {
        found.push({ id, from: senderName(msg.from), subject: msg.subject, date: msg.date, items, isNew: true });
      }
    }
    const results = mergeResults(st.results, found, s.maxResults);
    const patch = { results, seen: [...seen].slice(-SEEN_CAP), historyId, email: s.accountEmail, lastRun: Date.now(), status: 'ok', error: null };
    if (st.email !== s.accountEmail) patch.justConnected = s.accountEmail;
    await setState(patch);
    await updateBadge(results);
  } catch (e) {
    if (e instanceof AuthError) return setState({ status: 'reauth', error: e.message, lastRun: Date.now() });
    // historyId expirado (o Gmail guarda cerca de uma semana): zera e o proximo tick refaz a varredura.
    if (e instanceof ApiError && e.status === 404 && st.historyId) return setState({ historyId: null });
    await setState({ status: 'error', error: String(e.message || e), lastRun: Date.now() });
  }
}

let running = null;
export function tick() {
  running ??= runTick().finally(() => {
    running = null;
  });
  return running;
}

// O worker do MV3 morre ocioso e chrome.alarms nao dispara abaixo de 30 s. O setTimeout faz o
// intervalo curto enquanto o worker vive (cada tick chama a API de storage, o que renova o
// prazo de ociosidade), e o alarme de 30 s religa o loop quando o Chrome derruba o worker.
let timer = null;

const shouldPoll = s => s.clientId && s.accountEmail && s.enabled;

async function loop() {
  clearTimeout(timer);
  timer = null;
  await tick();
  const s = await getSettings();
  if (shouldPoll(s)) timer = setTimeout(loop, s.intervalSec * 1000);
}

async function resume() {
  if (timer || running) return;
  const s = await getSettings();
  if (!shouldPoll(s)) return;
  const { lastRun } = await getState();
  timer = setTimeout(loop, Math.max(0, lastRun + s.intervalSec * 1000 - Date.now()));
}

async function ensureWatchdog() {
  if (!(await chrome.alarms.get(WATCHDOG))) await chrome.alarms.create(WATCHDOG, { periodInMinutes: 0.5 });
}

async function switchTo(email, patch = {}) {
  await setState({ ...FRESH, status: 'idle', error: null });
  await updateBadge([]);
  await saveSettings({ ...patch, accountEmail: email });
  await loop();
}

async function connect({ email = null } = {}) {
  const s = await getSettings();
  if (!s.clientId) return { ok: false, error: 'Cole o client ID do Google antes de entrar.' };
  let auth;
  try {
    auth = await authorize(s.clientId, { email, interactive: true });
  } catch (e) {
    return { ok: false, error: `Login não concluído: ${e.message}` };
  }
  const { emailAddress } = await gmailClient(async () => auth.token, async () => {}).profile();
  await cacheToken(emailAddress, auth);
  const accounts = s.accounts.includes(emailAddress) ? s.accounts : [...s.accounts, emailAddress];
  const photo = await profilePhoto(auth.token);
  const photos = { ...s.photos, [emailAddress]: photo || s.photos[emailAddress] || null };
  if (emailAddress === s.accountEmail) {
    await saveSettings({ accounts, photos });
    await loop();
  } else {
    await switchTo(emailAddress, { accounts, photos });
  }
  return { ok: true, email: emailAddress };
}

async function select({ email }) {
  const s = await getSettings();
  if (!s.accounts.includes(email)) return { ok: false, error: 'Conta desconhecida.' };
  if (email !== s.accountEmail) await switchTo(email);
  return { ok: true };
}

async function forget({ email }) {
  const s = await getSettings();
  const accounts = s.accounts.filter(a => a !== email);
  const { [email]: _, ...photos } = s.photos;
  await dropToken(email);
  if (email === s.accountEmail) await switchTo(accounts[0] ?? null, { accounts, photos });
  else await saveSettings({ accounts, photos });
  return { ok: true };
}

async function trash({ id }) {
  const s = await getSettings();
  await clientFor(s).trash(id);
  const st = await getState();
  const results = st.results.filter(r => r.id !== id);
  await setState({ results });
  await updateBadge(results);
  return { ok: true };
}

async function markSeen() {
  const st = await getState();
  const results = st.results.map(r => ({ ...r, isNew: false }));
  await setState({ results, justConnected: null });
  await updateBadge(results);
  return { ok: true };
}

const handlers = {
  connect,
  select,
  forget,
  trash,
  markSeen,
  refresh: async () => {
    await loop();
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg)
    .then(sendResponse)
    .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
  return true;
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const before = changes.settings.oldValue || {};
  const after = changes.settings.newValue || {};
  if (before.accountEmail !== after.accountEmail) return;
  if (before.clientId !== after.clientId) {
    await setState({ ...FRESH, tokens: {} });
  } else if (before.scope !== after.scope) {
    await setState({ historyId: null });
  } else if (before.maxResults !== after.maxResults || JSON.stringify(before.kinds) !== JSON.stringify(after.kinds)) {
    const s = await getSettings();
    const st = await getState();
    const allowed = item => (item.kind === 'code' ? s.kinds.codes : s.kinds.links);
    const results = st.results
      .map(r => ({ ...r, items: r.items.filter(allowed) }))
      .filter(r => r.items.length)
      .slice(0, s.maxResults);
    await setState({ results });
    await updateBadge(results);
  }
  await loop();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === WATCHDOG) resume();
});

chrome.runtime.onStartup.addListener(ensureWatchdog);
chrome.runtime.onInstalled.addListener(ensureWatchdog);
ensureWatchdog();
resume();
