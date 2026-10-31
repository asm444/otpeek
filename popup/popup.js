import { isNewer } from '../src/version.js';

const $ = id => document.getElementById(id);

const DEFAULTS = {
  clientId: '',
  accounts: [],
  photos: {},
  accountEmail: null,
  enabled: true,
  intervalSec: 10,
  scope: 'recent',
  maxResults: 20,
  kinds: { codes: true, links: true },
  browserEnabled: false,
  fillCode: true,
  siteDurations: {},
  customDurations: [],
  blockedSites: [],
};

const BASE_DURATIONS = [12 * 3_600_000, 86_400_000, 3 * 86_400_000, 7 * 86_400_000, 30 * 86_400_000];
const DEFAULT_DURATION = 86_400_000;
const AUTO_SHOW_MS = 15_000;
const SITE_ORIGINS = ['http://*/*', 'https://*/*'];

const STATUS_TEXT = {
  ok: 'Monitorando',
  paused: 'Pausado',
  setup: 'Falta o client ID do Google',
  disconnected: 'Nenhuma conta conectada',
  reauth: 'Entre de novo na conta',
  error: 'Falha na última verificação',
  idle: 'Iniciando',
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const highlight = new Set();
const shown = new Set();
let settings = { ...DEFAULTS };
let view = 'list';
let connectedBanner = null;
let autoShownId = null;
let autoCloseTimer = null;
let touched = false;

const send = msg => chrome.runtime.sendMessage(msg);

async function loadSettings() {
  const { settings: s = {} } = await chrome.storage.local.get('settings');
  settings = { ...DEFAULTS, ...s, kinds: { ...DEFAULTS.kinds, ...s.kinds } };
}

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
}

function showMessage(id, message) {
  $(id).hidden = !message;
  $(id).textContent = message || '';
}

function formatTime(ms) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function copy(row, button, value) {
  await navigator.clipboard.writeText(value);
  button.textContent = 'Copiado';
  button.classList.add('copied');
  row.classList.remove('copied');
  void row.offsetWidth;
  row.classList.add('copied');
  setTimeout(() => {
    button.textContent = 'Copiar';
    button.classList.remove('copied');
  }, 1400);
}

async function trashWithAnimation(li, id) {
  li.style.maxHeight = `${li.offsetHeight}px`;
  requestAnimationFrame(() => li.classList.add('leaving'));
  await new Promise(r => setTimeout(r, reducedMotion ? 0 : 230));
  const r = await send({ type: 'trash', id });
  if (!r?.ok) {
    li.classList.remove('leaving');
    li.style.maxHeight = '';
    const subject = li.querySelector('.subject');
    subject.textContent = 'Não deu para mover para a lixeira. Tente de novo.';
    subject.classList.add('failed');
  }
}

function renderItem(result) {
  const li = $('item-tpl').content.firstElementChild.cloneNode(true);
  li.classList.toggle('new', highlight.has(result.id));
  li.classList.toggle('enter', !shown.has(result.id));
  shown.add(result.id);
  li.querySelector('.from').textContent = result.from;
  li.querySelector('.from').title = result.from;
  li.querySelector('time').textContent = formatTime(result.date);
  li.querySelector('.subject').textContent = result.subject;
  li.querySelector('.subject').title = result.subject;
  for (const item of result.items) {
    const row = document.createElement('div');
    row.className = `value ${item.kind}`;
    const code = document.createElement('code');
    code.textContent = item.value;
    code.title = 'Clique para copiar';
    const btn = document.createElement('button');
    btn.className = 'copy';
    btn.textContent = 'Copiar';
    btn.addEventListener('click', () => copy(row, btn, item.value));
    code.addEventListener('click', () => copy(row, btn, item.value));
    row.append(code, btn);
    if (item.kind === 'link') {
      row.append(Object.assign(document.createElement('a'), { className: 'open', href: item.value, target: '_blank', rel: 'noopener noreferrer', textContent: 'Abrir' }));
    }
    li.querySelector('.values').append(row);
  }
  li.querySelector('.remove').addEventListener('click', () => trashWithAnimation(li, result.id));
  return li;
}

function paintAvatar(el, email) {
  const photo = email && settings.photos[email];
  el.classList.toggle('photo', Boolean(photo));
  if (!photo) {
    el.textContent = email ? email[0] : '?';
    return;
  }
  if (el.firstElementChild?.src === photo) return;
  const img = document.createElement('img');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.src = photo;
  img.addEventListener('error', () => {
    el.classList.remove('photo');
    el.textContent = email[0];
  });
  el.replaceChildren(img);
}

function renderAccounts() {
  $('accounts').replaceChildren(...settings.accounts.map((email, i) => {
    const li = document.createElement('li');
    li.className = 'account-row';
    const btn = document.createElement('button');
    btn.className = 'account';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(email === settings.accountEmail));
    btn.style.animationDelay = `${i * 40}ms`;
    btn.innerHTML = '<span class="avatar"></span><span class="email"></span><svg class="check" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    paintAvatar(btn.querySelector('.avatar'), email);
    btn.querySelector('.email').textContent = email;
    btn.addEventListener('click', async () => {
      await send({ type: 'select', email });
      view = 'list';
    });
    const forget = document.createElement('button');
    forget.className = 'forget';
    forget.title = `Desconectar ${email}`;
    forget.setAttribute('aria-label', `Desconectar ${email}`);
    forget.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.7 2.88 18.3 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.29-6.3z"/></svg>';
    forget.addEventListener('click', () => send({ type: 'forget', email }));
    li.append(btn, forget);
    return li;
  }));
}

function formatRemaining(ms) {
  const hours = Math.ceil(ms / 3_600_000);
  return hours <= 48 ? `${hours} h` : `${Math.ceil(hours / 24)} d`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function formatDuration(ms) {
  const minutes = ms / 60_000;
  if (minutes % 10_080 === 0) return plural(minutes / 10_080, 'semana', 'semanas');
  if (minutes % 1_440 === 0) return plural(minutes / 1_440, 'dia', 'dias');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hora', 'horas');
  return plural(minutes, 'minuto', 'minutos');
}

function fillDurations(select, selected, placeholder) {
  const values = [...new Set([...BASE_DURATIONS, ...settings.customDurations, ...(selected ? [selected] : [])])].sort((a, b) => a - b);
  const option = (value, text) => Object.assign(document.createElement('option'), { value, text });
  select.replaceChildren(
    ...(placeholder ? [option('', placeholder)] : []),
    ...values.map(v => option(v, formatDuration(v))),
    option('custom', 'Outro tempo…'),
  );
  select.value = selected ?? (placeholder ? '' : DEFAULT_DURATION);
}

let identitySignature = null;

function renderAccountRow(account, now) {
  const struck = account.struck && (account.until === null || account.until > now);
  const li = document.createElement('li');
  li.className = 'site-login';
  const label = document.createElement('label');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = struck;
  check.setAttribute('aria-label', `Contar o tempo de ${account.email}`);
  check.addEventListener('change', () => send({ type: 'setAccountMark', host: account.host, email: account.email, marked: check.checked }));
  const email = document.createElement('span');
  email.className = struck ? 'email struck' : 'email';
  email.textContent = account.email;
  label.append(check, email);
  const info = document.createElement('small');
  info.textContent = !struck ? '' : account.until ? formatRemaining(account.until - now) : 'sem tempo';
  li.append(label, info);
  return li;
}

function renderSiteGroup(host, accounts, now) {
  const li = document.createElement('li');
  li.className = 'site-group';
  const head = document.createElement('div');
  head.className = 'site-head';
  const name = document.createElement('strong');
  name.textContent = host;
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Tempo de ${host}`);
  const saved = settings.siteDurations[host];
  fillDurations(select, saved, saved ? null : 'Escolher tempo');
  select.addEventListener('change', () => {
    if (select.value === 'custom') {
      fillDurations(select, saved, saved ? null : 'Escolher tempo');
      send({ type: 'askDuration', host });
    } else {
      send({ type: 'setDuration', host, durationMs: Number(select.value) });
    }
  });
  const actions = document.createElement('div');
  actions.className = 'site-actions';
  const action = (text, type) => {
    const button = Object.assign(document.createElement('button'), { className: 'ghost-btn', textContent: text });
    button.addEventListener('click', () => send({ type, host }));
    return button;
  };
  actions.append(select, action('Limpar', 'forgetSite'), action('Bloquear', 'blockSite'));
  head.append(name, actions);
  const rows = document.createElement('ul');
  rows.append(...accounts.map(a => renderAccountRow(a, now)));
  li.append(head, rows);
  return li;
}

async function renderIdentity() {
  const { logins } = await chrome.storage.local.get('logins');
  const accounts = logins?.accounts ?? [];
  const now = Date.now();
  const signature = JSON.stringify([accounts, settings.siteDurations, settings.customDurations, settings.blockedSites, Math.floor(now / 60_000)]);
  if (signature === identitySignature) return;
  identitySignature = signature;
  $('identity-empty').hidden = accounts.length > 0;
  const hosts = new Map();
  for (const a of accounts) hosts.set(a.host, [...(hosts.get(a.host) ?? []), a]);
  $('blocked-card').hidden = settings.blockedSites.length === 0;
  $('blocked-sites').replaceChildren(...settings.blockedSites.map(host => {
    const li = document.createElement('li');
    li.className = 'site-login';
    const name = Object.assign(document.createElement('span'), { className: 'email', textContent: host });
    const button = Object.assign(document.createElement('button'), { className: 'ghost-btn', textContent: 'Desbloquear' });
    button.addEventListener('click', () => send({ type: 'unblockSite', host }));
    li.append(name, button);
    return li;
  }));
  $('site-logins').replaceChildren(...[...hosts].map(([host, list]) => renderSiteGroup(host, list, now)));
}

let durationSignature = null;

function renderDuration(host) {
  $('duration-host').textContent = host;
  const signature = JSON.stringify([host, settings.customDurations]);
  if (signature === durationSignature) return;
  durationSignature = signature;
  fillDurations($('duration-select'), settings.siteDurations[host]);
  $('custom-duration').hidden = true;
  $('custom-amount').value = '';
  showMessage('duration-error', '');
}

function setRange(id, value) {
  const input = $(id);
  input.value = value;
  paintRange(input);
}

function paintRange(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
  const unit = input.id === 'intervalSec' ? ' s' : '';
  $(`${input.id}-out`).textContent = `${input.value}${unit}`;
}

function pickView(status, askDuration) {
  if (askDuration) return 'duration';
  if (!settings.clientId) return 'setup';
  if (view !== 'list') return view;
  if (!settings.accountEmail || status === 'reauth') return 'login';
  return 'list';
}

function showReceived(autoShow, results) {
  const result = results.find(r => r.id === autoShow.id);
  const code = result?.items.find(i => i.kind === 'code');
  if (!code) return;
  autoShownId = autoShow.id;
  view = 'list';
  touched = false;
  $('auto-code').hidden = false;
  $('auto-code-value').textContent = code.value;
  $('auto-code-meta').textContent = `${result.account ?? settings.accountEmail} · ${result.from} · ${result.subject}`;
  $('auto-code-copy').onclick = () => copy($('auto-code'), $('auto-code-copy'), code.value);
  send({ type: 'clearAutoShow' });
  clearTimeout(autoCloseTimer);
  autoCloseTimer = setTimeout(() => {
    if (!touched) window.close();
  }, Math.max(0, autoShow.at + AUTO_SHOW_MS - Date.now()));
}

async function renderVersion() {
  const current = chrome.runtime.getManifest().version;
  const { latestRelease } = await chrome.storage.local.get('latestRelease');
  const newer = latestRelease && isNewer(latestRelease.version, current);
  $('current-version').textContent = current;
  $('update-available').hidden = !newer;
  $('update-status').textContent = !latestRelease ? 'Recarregue para buscar atualizações' : newer ? '' : 'Versão mais recente';
  if (newer) {
    $('latest-link').textContent = `v${latestRelease.version}`;
    $('latest-link').href = latestRelease.url;
  }
}

async function render() {
  const st = await chrome.storage.session.get(['results', 'status', 'error', 'email', 'justConnected', 'askDuration', 'autoShow']);
  const results = st.results || [];
  const status = st.status || 'idle';
  for (const r of results) if (r.isNew) highlight.add(r.id);

  await renderVersion();
  if (st.autoShow && st.autoShow.id !== autoShownId && Date.now() < st.autoShow.at + AUTO_SHOW_MS) showReceived(st.autoShow, results);
  const active = pickView(status, st.askDuration);
  for (const name of ['duration', 'identity', 'setup', 'login', 'accounts', 'list', 'settings']) $(`${name}-view`).hidden = active !== name;
  $('toggle-settings').setAttribute('aria-expanded', String(active === 'settings'));
  $('toggle-settings').title = active === 'settings' ? 'Voltar' : 'Opções';
  $('account-pill').setAttribute('aria-expanded', String(active === 'accounts'));

  const email = settings.accountEmail;
  $('account-pill').hidden = !email;
  $('account-name').textContent = email || '';
  paintAvatar($('account-avatar'), email);
  $('account-pill').title = email ? `${email}. Clique para trocar de conta.` : '';
  $('refresh').hidden = !email;

  $('status').className = `dot ${status}`;
  $('status').title = STATUS_TEXT[status] || status;

  $('redirect-url').textContent = chrome.identity.getRedirectURL();
  $('login-text').textContent = status === 'reauth' && email
    ? `O acesso a ${email} expirou. Entre de novo para continuar.`
    : 'Entre com a conta do Gmail que o OTPeek deve acompanhar.';

  $('list').replaceChildren(...results.map(renderItem));
  $('empty').hidden = results.length > 0;
  if (st.justConnected) connectedBanner = st.justConnected;
  $('connected').hidden = !connectedBanner || status !== 'ok';
  $('connected-email').textContent = connectedBanner || '';

  if (active === 'accounts') renderAccounts();
  if (active === 'identity') await renderIdentity();
  if (st.askDuration) renderDuration(st.askDuration.host);
  else durationSignature = null;
  $('identity-toggle').hidden = !settings.browserEnabled;
  $('identity-toggle').setAttribute('aria-expanded', String(active === 'identity'));
  $('browser-enabled').checked = settings.browserEnabled;
  $('fill-code').checked = settings.fillCode;
  $('fill-code').disabled = !settings.browserEnabled;

  $('account-label').textContent = email || 'Nenhuma conta conectada';
  $('client-id-label').textContent = settings.clientId ? `${settings.clientId.slice(0, 18)}…` : '';
  $('enabled').checked = settings.enabled;
  $('kind-codes').checked = settings.kinds.codes;
  $('kind-links').checked = settings.kinds.links;
  for (const chip of $('scope').children) chip.setAttribute('aria-checked', String(chip.dataset.value === settings.scope));
  if (document.activeElement !== $('intervalSec')) setRange('intervalSec', settings.intervalSec);
  if (document.activeElement !== $('maxResults')) setRange('maxResults', settings.maxResults);
  if (status === 'error') showMessage('error', st.error);

  if (results.some(r => r.isNew) || st.justConnected) send({ type: 'markSeen' });
}

async function connect(errorId, email = null) {
  showMessage(errorId, '');
  const r = await send({ type: 'connect', email });
  if (!r?.ok) showMessage(errorId, r?.error || 'Não deu para entrar.');
  else view = 'list';
  render();
}

function bindControls() {
  for (const id of ['intervalSec', 'maxResults']) {
    $(id).addEventListener('input', e => paintRange(e.target));
    $(id).addEventListener('change', e => saveSettings({ [id]: Number(e.target.value) }));
  }
  $('enabled').addEventListener('change', e => saveSettings({ enabled: e.target.checked }));
  $('fill-code').addEventListener('change', e => saveSettings({ fillCode: e.target.checked }));
  const kinds = () => ({ codes: $('kind-codes').checked, links: $('kind-links').checked });
  $('kind-codes').addEventListener('change', () => saveSettings({ kinds: kinds() }));
  $('kind-links').addEventListener('change', () => saveSettings({ kinds: kinds() }));
  $('scope').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) saveSettings({ scope: chip.dataset.value });
  });

  $('copy-redirect').addEventListener('click', e => copy(e.target.parentElement, e.target, chrome.identity.getRedirectURL()));
  $('save-client-id').addEventListener('click', async () => {
    const clientId = $('client-id-input').value.trim();
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      showMessage('setup-error', 'Esse não parece um client ID. Ele termina em .apps.googleusercontent.com.');
      return;
    }
    showMessage('setup-error', '');
    view = 'list';
    await saveSettings({ clientId });
  });
  $('change-client-id').addEventListener('click', async () => {
    $('client-id-input').value = settings.clientId;
    view = 'list';
    await saveSettings({ clientId: '' });
  });

  $('browser-enabled').addEventListener('change', async e => {
    if (e.target.checked) e.target.checked = await chrome.permissions.request({ origins: SITE_ORIGINS });
    await send({ type: 'setBrowserEnabled', enabled: e.target.checked });
  });
  $('duration-select').addEventListener('change', e => {
    $('custom-duration').hidden = e.target.value !== 'custom';
  });
  $('save-duration').addEventListener('click', async () => {
    const { askDuration } = await chrome.storage.session.get('askDuration');
    const custom = $('duration-select').value === 'custom';
    const durationMs = custom ? Number($('custom-amount').value) * Number($('custom-unit').value) : Number($('duration-select').value);
    const r = await send({ type: 'setDuration', host: askDuration.host, durationMs, custom });
    showMessage('duration-error', r?.ok ? '' : r?.error);
  });
  $('reload-extension').addEventListener('click', () => chrome.runtime.reload());
  $('copy-update').addEventListener('click', e => copy(e.target.parentElement, e.target, 'git pull'));
  $('dismiss-duration').addEventListener('click', () => send({ type: 'dismissDuration' }));
  $('clear-logins').addEventListener('click', () => send({ type: 'clearLogins' }));

  $('save-config').addEventListener('click', async () => {
    const r = await send({ type: 'saveConfig' });
    showMessage('error', r?.ok ? '' : 'O arquivo não foi salvo.');
  });

  $('google-btn').addEventListener('click', () => connect('login-error', settings.accountEmail));
  $('add-account').addEventListener('click', () => connect('accounts-error'));
}

$('toggle-settings').addEventListener('click', () => {
  view = view === 'settings' ? 'list' : 'settings';
  render();
});

$('identity-toggle').addEventListener('click', () => {
  view = view === 'identity' ? 'list' : 'identity';
  render();
});

$('account-pill').addEventListener('click', () => {
  view = view === 'accounts' ? 'list' : 'accounts';
  render();
});

$('refresh').addEventListener('click', () => {
  const btn = $('refresh');
  btn.classList.remove('spin');
  void btn.offsetWidth;
  btn.classList.add('spin');
  send({ type: 'refresh' });
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.settings) await loadSettings();
  if (area === 'local' || changes.results || changes.status || changes.email || changes.justConnected || changes.askDuration || changes.autoShow) render();
});

for (const type of ['pointerdown', 'keydown', 'wheel']) document.addEventListener(type, () => { touched = true; }, true);

bindControls();
await loadSettings();
await render();
