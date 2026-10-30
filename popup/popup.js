const $ = id => document.getElementById(id);

const DEFAULTS = {
  clientId: '',
  accounts: [],
  accountEmail: null,
  enabled: true,
  intervalSec: 10,
  scope: 'recent',
  maxResults: 20,
  kinds: { codes: true, links: true },
};

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
    li.querySelector('.values').append(row);
  }
  li.querySelector('.remove').addEventListener('click', () => trashWithAnimation(li, result.id));
  return li;
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
    btn.querySelector('.avatar').textContent = email[0];
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

function pickView(status) {
  if (!settings.clientId) return 'setup';
  if (view !== 'list') return view;
  if (!settings.accountEmail || status === 'reauth') return 'login';
  return 'list';
}

async function render() {
  const st = await chrome.storage.session.get(['results', 'status', 'error', 'email', 'justConnected']);
  const results = st.results || [];
  const status = st.status || 'idle';
  for (const r of results) if (r.isNew) highlight.add(r.id);

  const active = pickView(status);
  for (const name of ['setup', 'login', 'accounts', 'list', 'settings']) $(`${name}-view`).hidden = active !== name;
  $('toggle-settings').setAttribute('aria-expanded', String(active === 'settings'));
  $('toggle-settings').title = active === 'settings' ? 'Voltar' : 'Opções';
  $('account-pill').setAttribute('aria-expanded', String(active === 'accounts'));

  const email = settings.accountEmail;
  $('account-pill').hidden = !email;
  $('account-name').textContent = email || '';
  $('account-avatar').textContent = email ? email[0] : '?';
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

  $('google-btn').addEventListener('click', () => connect('login-error', settings.accountEmail));
  $('add-account').addEventListener('click', () => connect('accounts-error'));
}

$('toggle-settings').addEventListener('click', () => {
  view = view === 'settings' ? 'list' : 'settings';
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
  if (area === 'local' || changes.results || changes.status || changes.email || changes.justConnected) render();
});

bindControls();
await loadSettings();
await render();
