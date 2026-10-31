import { eq, run } from './harness.js';
import { message } from './fixtures.js';
import { parseConfig, serializeConfig } from '../src/config-file.js';

const REDIRECT = 'https://ebceaflpcefmmgchplhcphdipkolebik.chromiumapp.org/';
const store = { local: {}, session: {} };
const listeners = { message: [] };
const downloads = [];
const perms = { granted: false, added: [], removed: [] };
const scripts = [];
let popupsOpened = 0;
let popupRefused = false;
const windowsCreated = [];
const badge = { text: '' };
const calls = [];
const authCalls = [];
const responses = new Map();
let authAnswer = () => { throw new Error('The user did not approve access.'); };

const area = name => ({
  get: async keys => {
    const all = store[name];
    if (typeof keys === 'string') keys = [keys];
    return Object.fromEntries(keys.filter(k => k in all).map(k => [k, structuredClone(all[k])]));
  },
  set: async obj => Object.assign(store[name], structuredClone(obj)),
});
const event = list => ({ addListener: fn => list && list.push(fn) });

globalThis.chrome = {
  storage: { local: area('local'), session: area('session'), onChanged: event() },
  identity: {
    getRedirectURL: () => REDIRECT,
    launchWebAuthFlow: async ({ url, interactive }) => {
      const params = new URL(url).searchParams;
      authCalls.push({ interactive, prompt: params.get('prompt'), hint: params.get('login_hint'), params });
      return authAnswer(params);
    },
  },
  alarms: { get: async () => null, create: async () => {}, onAlarm: event() },
  downloads: { download: async opts => { downloads.push(opts); return 1; } },
  runtime: { getURL: path => `http://extensao.test/${path}`, onMessage: event(listeners.message), onStartup: event(), onInstalled: event() },
  permissions: {
    contains: async () => perms.granted,
    onAdded: { addListener: fn => perms.added.push(fn) },
    onRemoved: { addListener: fn => perms.removed.push(fn) },
  },
  scripting: {
    getRegisteredContentScripts: async () => scripts.slice(),
    registerContentScripts: async list => { scripts.push(...list); },
    unregisterContentScripts: async () => { scripts.length = 0; },
  },
  windows: { create: async opts => { windowsCreated.push(opts); } },
  action: { openPopup: async () => { if (popupRefused) throw new Error('Could not find an active browser window.'); popupsOpened++; }, setBadgeText: async ({ text }) => { badge.text = text; }, setBadgeBackgroundColor: async () => {} },
};

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const key = `${init.method || 'GET'} ${u.pathname.replace('/gmail/v1/users/me', '')}`;
  calls.push({ key, auth: init.headers?.Authorization, query: u.search });
  const r = responses.get(key);
  if (!r) return new Response('not found', { status: 404 });
  const { status = 200, body = {} } = typeof r === 'function' ? r(init) : r;
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
};

const grant = token => () => `${REDIRECT}#access_token=${token}&token_type=Bearer&expires_in=3599`;
const PHOTO_A = 'https://lh3.googleusercontent.com/a/foto-a=s96-c';
const photoFor = photos => init => {
  const picture = photos[init.headers.Authorization.replace('Bearer ', '')];
  return picture ? { body: { sub: '1', picture } } : { status: 401, body: {} };
};
const profileFor = tokens => init => {
  const email = tokens[init.headers.Authorization.replace('Bearer ', '')];
  return email ? { body: { emailAddress: email, historyId: '100' } } : { status: 401, body: {} };
};

store.local.settings = { intervalSec: 600 };
const bg = await import('../background.js');

const dispatch = msg => new Promise(resolve => listeners.message[0](msg, {}, resolve));
const count = key => calls.filter(c => c.key === key).length;
const settings = () => store.local.settings;

async function setup() {
  await bg.tick();
  eq('sem client ID pede configuração', (await bg.getState()).status, 'setup');
  const r = await dispatch({ type: 'connect' });
  eq('entrar sem client ID explica o que falta', [r.ok, r.error.includes('client ID')], [false, true]);
  store.local.settings = { ...settings(), clientId: '123-abc.apps.googleusercontent.com' };
  await bg.tick();
  eq('com client ID e sem conta pede login', (await bg.getState()).status, 'disconnected');
}

async function connectFirst() {
  const recusado = await dispatch({ type: 'connect' });
  eq('login recusado não conecta', [recusado.ok, settings().accountEmail ?? null], [false, null]);

  authAnswer = grant('tok-a');
  responses.set('GET /profile', profileFor({ 'tok-a': 'a@gmail.com' }));
  responses.set('GET /oauth2/v3/userinfo', photoFor({ 'tok-a': PHOTO_A }));
  responses.set('GET /messages', { body: { messages: [{ id: 'm1' }, { id: 'm2' }] } });
  responses.set('GET /messages/m1', { body: message({ id: 'm1', from: 'Fish Audio <noreply@fish.audio>', subject: 'Seu código', text: 'Use este código para continuar.\n\n179542\n', date: 2000 }) });
  responses.set('GET /messages/m2', { body: message({ id: 'm2', subject: 'Ofertas', text: 'Promoções', date: 1000 }) });
  const r = await dispatch({ type: 'connect' });
  const auth = authCalls.at(-1);
  eq('login abre o seletor de contas do Google', [auth.interactive, auth.prompt], [true, 'select_account']);
  eq('pedido de acesso usa client ID, escopo e redirecionamento certos',
    [auth.params.get('client_id'), auth.params.get('scope'), auth.params.get('redirect_uri'), auth.params.get('response_type')],
    ['123-abc.apps.googleusercontent.com', 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.profile', REDIRECT, 'token']);
  eq('guarda a foto de perfil do Google da conta', settings().photos, { 'a@gmail.com': PHOTO_A });
  eq('login conecta a conta escolhida', [r.ok, r.email, settings().accounts, settings().accountEmail], [true, 'a@gmail.com', ['a@gmail.com'], 'a@gmail.com']);
  const st = await bg.getState();
  eq('primeira leitura usa as últimas 24 h', decodeURIComponent(calls.find(c => c.key === 'GET /messages').query).includes('newer_than:1d'), true);
  eq('lê o corpo do e-mail e acha o código', st.results.map(r => [r.id, r.from, r.items[0].value]), [['m1', 'Fish Audio', '179542']]);
  eq('aviso de conectado e badge com o novo', [st.justConnected, badge.text], ['a@gmail.com', '1']);
  eq('token guardado só na sessão', Object.keys(st.tokens), ['a@gmail.com']);
}

async function incremental() {
  responses.set('GET /history', { body: { historyId: '105', history: [{ messagesAdded: [{ message: { id: 'm3' } }, { message: { id: 'm1' } }] }] } });
  responses.set('GET /messages/m3', { body: message({ id: 'm3', subject: 'Confirme seu e-mail', html: '<a href="https://x.example/verify?t=1">Confirmar</a>', date: 3000 }) });
  await bg.tick();
  const st = await bg.getState();
  eq('history parte do historyId anterior', calls.filter(c => c.key === 'GET /history').at(-1).query.includes('startHistoryId=100'), true);
  eq('e-mail já visto não é buscado de novo', count('GET /messages/m1'), 1);
  eq('mais novo no topo', st.results.map(r => r.id), ['m3', 'm1']);
}

async function silentRenewal() {
  store.session.tokens['a@gmail.com'].expiresAt = Date.now() - 1;
  authAnswer = grant('tok-a2');
  responses.set('GET /history', { body: { historyId: '106' } });
  await bg.tick();
  const auth = authCalls.at(-1);
  eq('token vencido renova sem janela, com a conta certa', [auth.interactive, auth.prompt, auth.hint], [false, 'none', 'a@gmail.com']);
  eq('chamada seguinte usa o token novo', calls.at(-1).auth, 'Bearer tok-a2');

  responses.set('GET /history', init => (init.headers.Authorization === 'Bearer tok-a2' ? { status: 401, body: {} } : { body: { historyId: '107' } }));
  authAnswer = grant('tok-a3');
  await bg.tick();
  eq('401 descarta o token, renova e repete', calls.slice(-2).map(c => c.auth), ['Bearer tok-a2', 'Bearer tok-a3']);

  store.session.tokens['a@gmail.com'].expiresAt = Date.now() - 1;
  authAnswer = () => `${REDIRECT}#error=interaction_required`;
  await bg.tick();
  eq('renovação recusada pede novo login', (await bg.getState()).status, 'reauth');

  authAnswer = grant('tok-a4');
  responses.set('GET /profile', profileFor({ 'tok-a4': 'a@gmail.com', 'tok-b': 'b@gmail.com' }));
  responses.set('GET /history', { body: { historyId: '108' } });
  await dispatch({ type: 'connect', email: 'a@gmail.com' });
  eq('entrar de novo sugere a mesma conta', authCalls.at(-1).hint, 'a@gmail.com');
  const st = await bg.getState();
  eq('volta a monitorar sem perder a lista', [st.status, st.results.length], ['ok', 2]);
}

async function trash() {
  responses.set('POST /messages/m3/trash', { body: { id: 'm3' } });
  eq('excluir responde ok', await dispatch({ type: 'trash', id: 'm3' }), { ok: true });
  eq('excluir manda para a lixeira do Gmail', count('POST /messages/m3/trash'), 1);
  eq('excluído sai da lista', (await bg.getState()).results.map(r => r.id), ['m1']);
  responses.set('POST /messages/m1/trash', { status: 500, body: {} });
  const fail = await dispatch({ type: 'trash', id: 'm1' });
  eq('falha na lixeira mantém o resultado', [fail.ok, (await bg.getState()).results.length], [false, 1]);
}

async function secondAccount() {
  authAnswer = grant('tok-b');
  responses.set('GET /messages', { body: { messages: [] } });
  const r = await dispatch({ type: 'connect' });
  eq('segunda conta entra na lista e vira a atual', [r.email, settings().accounts, settings().accountEmail], ['b@gmail.com', ['a@gmail.com', 'b@gmail.com'], 'b@gmail.com']);
  eq('sem foto disponível a conta entra mesmo assim, sem foto', settings().photos, { 'a@gmail.com': PHOTO_A, 'b@gmail.com': null });
  eq('trocar de conta limpa a lista anterior', (await bg.getState()).results, []);

  const before = authCalls.length;
  await dispatch({ type: 'select', email: 'a@gmail.com' });
  eq('voltar para a conta A usa o token guardado, sem janela', [authCalls.length, settings().accountEmail], [before, 'a@gmail.com']);

  await dispatch({ type: 'forget', email: 'a@gmail.com' });
  eq('desconectar a conta atual passa para a outra', [settings().accounts, settings().accountEmail], [['b@gmail.com'], 'b@gmail.com']);
  eq('token da conta desconectada sai da memória', Object.keys((await bg.getState()).tokens), ['b@gmail.com']);
  eq('foto da conta desconectada sai junto', settings().photos, { 'b@gmail.com': null });
}

async function expiredHistory() {
  responses.delete('GET /history');
  await bg.tick();
  await bg.tick();
  eq('history expirado zera e refaz a primeira leitura', (await bg.getState()).historyId, '100');
}

async function configFile() {
  const r = await dispatch({ type: 'saveConfig' });
  const saved = downloads.at(-1);
  const content = decodeURIComponent(saved.url.split(',').slice(1).join(','));
  eq('salvar abre o diálogo com o nome do arquivo', [r.ok, saved.filename, saved.saveAs], [true, 'otpeek.config.json', true]);
  eq('arquivo salvo traz a configuração', JSON.parse(content).clientId, '123-abc.apps.googleusercontent.com');
  eq('arquivo salvo não traz token nem e-mails lidos', /tok-|results|tokens/.test(content), false);

  const atual = settings();
  responses.set('GET /otpeek.config.json', { body: { clientId: 'outro.apps.googleusercontent.com' } });
  eq('não sobrescreve configuração existente', [await bg.restoreFromFile(), settings().clientId], [false, atual.clientId]);

  store.local.settings = {};
  responses.delete('GET /otpeek.config.json');
  eq('sem arquivo segue pedindo configuração', [await bg.restoreFromFile(), settings().clientId ?? ''], [false, '']);

  const leitura = (async () => {
    responses.set('GET /otpeek.config.json', { body: JSON.parse(content) });
    return bg.restoreFromFile();
  })();
  eq('reinstalação restaura do arquivo', await leitura, true);
  eq('restaura client ID e contas', [settings().clientId, settings().accounts, settings().accountEmail],
    ['123-abc.apps.googleusercontent.com', ['b@gmail.com'], 'b@gmail.com']);
  eq('volta a monitorar sem novo login', (await bg.getState()).status, 'ok');
}

async function configParsing() {
  const clientId = 'x.apps.googleusercontent.com';
  eq('JSON inválido é ignorado', parseConfig('{quebrado'), null);
  eq('sem client ID válido é ignorado', parseConfig(JSON.stringify({ clientId: 'abc' })), null);
  eq('campo inválido cai no padrão', parseConfig(JSON.stringify({ clientId, intervalSec: 1, scope: 'x', enabled: 'sim' })), { clientId, accounts: [], accountEmail: null });
  eq('foto fora de https é descartada', 'photos' in parseConfig(JSON.stringify({ clientId, photos: { 'a@b.c': 'javascript:alert(1)' } })), false);
  eq('conta atual fora da lista passa para a primeira', parseConfig(JSON.stringify({ clientId, accounts: ['a@b.c'], accountEmail: 'z@b.c' })).accountEmail, 'a@b.c');
  eq('ida e volta preserva', parseConfig(serializeConfig({ clientId, accounts: ['a@b.c'], accountEmail: 'a@b.c', maxResults: 5 })), { clientId, accounts: ['a@b.c'], accountEmail: 'a@b.c', maxResults: 5 });
}

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setTimeout(r)); };
const fromSite = url => ({ tab: { url } });
const send = (msg, sender) => new Promise(resolve => {
  if (listeners.message[0](msg, sender, resolve) === false) resolve('recusado');
});
const SITES = ['http://*/*', 'https://*/*'];

async function browserWatch() {
  store.local.settings = { ...settings(), browserEnabled: false, siteDurations: {} };
  delete store.local.logins;
  await flush();
  eq('desligado, login detectado é ignorado', (await send({ type: 'loginDetected', email: 'x@y.com' }, fromSite('https://svc.example/login'))).ok, false);
  eq('desligado, nada entra na lista', store.local.logins, undefined);
  eq('desligado, nenhum script nas páginas', scripts.length, 0);

  perms.granted = true;
  perms.added[0]({ origins: SITES });
  await flush();
  eq('conceder o acesso liga e registra o script', [settings().browserEnabled, scripts[0]?.id, scripts[0]?.js], [true, 'login-watch', ['src/login-detect.js', 'src/login-watch.js']]);

  eq('página não aciona outras ações', await send({ type: 'trash', id: 'm1' }, fromSite('https://svc.example/')), 'recusado');
  eq('página da própria extensão aberta em aba é aceita', await send({ type: 'dismissDuration' }, { tab: { url: 'http://extensao.test/popup/popup.html' }, url: 'http://extensao.test/popup/popup.html' }), { ok: true });
  eq('e-mail inválido é recusado', (await send({ type: 'loginDetected', email: 'nada' }, fromSite('https://svc.example/login'))).ok, false);

  eq('login identificado registra', (await send({ type: 'loginDetected', email: 'A@y.com' }, fromSite('https://www.svc.example/login'))).ok, true);
  eq('guarda o e-mail em uso no site', store.local.logins.sites, { 'svc.example': 'a@y.com' });
  eq('primeiro login não pede duração', (await bg.getState()).askDuration, null);

  const antes = popupsOpened;
  await send({ type: 'loginDetected', email: 'b@y.com' }, fromSite('https://svc.example/login'));
  eq('troca risca o e-mail anterior e o manda para o fim', store.local.logins.accounts.map(a => [a.email, a.struck, a.until]), [['b@y.com', false, null], ['a@y.com', true, null]]);
  eq('primeira troca pede a duração e abre o popup', [(await bg.getState()).askDuration, popupsOpened - antes], [{ host: 'svc.example' }, 1]);

  const t0 = Date.now();
  await dispatch({ type: 'setDuration', host: 'svc.example', durationMs: 86_400_000 });
  const riscado = store.local.logins.accounts.at(-1);
  eq('duração salva para o site e aplicada', [settings().siteDurations, riscado.until >= t0 + 86_400_000], [{ 'svc.example': 86_400_000 }, true]);
  eq('duração salva encerra o pedido', (await bg.getState()).askDuration, null);

  await send({ type: 'loginDetected', email: 'c@y.com' }, fromSite('https://svc.example/login'));
  eq('próxima troca usa a duração salva, sem perguntar', [(await bg.getState()).askDuration, store.local.logins.accounts.at(-1).until > 0], [null, true]);

  eq('duração é salva no arquivo de configuração', JSON.parse(serializeConfig(settings())).siteDurations, { 'svc.example': 86_400_000 });
  eq('estado de ligado não vai para o arquivo', 'browserEnabled' in JSON.parse(serializeConfig(settings())), false);
}

async function codeOpensPopup() {
  responses.set('GET /history', { body: { historyId: '200' } });
  store.session.pendingLogin = null;
  await send({ type: 'loginDetected', email: 'd@y.com' }, fromSite('https://outro.example/login'));
  const at = store.session.pendingLogin.at;

  responses.set('GET /history', { body: { historyId: '201', history: [{ messagesAdded: [{ message: { id: 'p1' } }] }] } });
  responses.set('GET /messages/p1', { body: message({ id: 'p1', subject: 'Ofertas', text: 'Promoções', date: at + 1000 }) });
  let abertos = popupsOpened;
  await bg.tick();
  eq('e-mail sem código não abre o popup', popupsOpened, abertos);
  eq('login segue pendente', store.session.pendingLogin?.at, at);

  responses.set('GET /history', { body: { historyId: '202', history: [{ messagesAdded: [{ message: { id: 'p2' } }] }] } });
  responses.set('GET /messages/p2', { body: message({ id: 'p2', subject: 'Código', text: 'Seu código: 445566', date: at + 2000 }) });
  await bg.tick();
  eq('código depois do login abre o popup', popupsOpened, abertos + 1);
  eq('login pendente é consumido', store.session.pendingLogin, null);

  abertos = popupsOpened;
  responses.set('GET /history', { body: { historyId: '203', history: [{ messagesAdded: [{ message: { id: 'p3' } }] }] } });
  responses.set('GET /messages/p3', { body: message({ id: 'p3', subject: 'Código', text: 'Seu código: 778899', date: at + 3000 }) });
  await bg.tick();
  eq('código sem login recente só entra na lista', [popupsOpened, (await bg.getState()).results.some(r => r.id === 'p3')], [abertos, true]);

  store.session.pendingLogin = { at: Date.now() - 6 * 60_000, host: 'outro.example', email: 'd@y.com' };
  responses.set('GET /history', { body: { historyId: '204', history: [{ messagesAdded: [{ message: { id: 'p4' } }] }] } });
  responses.set('GET /messages/p4', { body: message({ id: 'p4', subject: 'Código', text: 'Seu código: 112233', date: Date.now() }) });
  await bg.tick();
  eq('login de mais de 5 minutos não abre o popup', [popupsOpened, store.session.pendingLogin], [abertos, null]);
}

async function otherBoxes() {
  const s = settings();
  store.local.settings = { ...s, accounts: ['b@gmail.com', 'c@gmail.com'], accountEmail: 'b@gmail.com' };
  store.session.tokens['c@gmail.com'] = { token: 'tok-c', expiresAt: Date.now() + 3_600_000 };
  await send({ type: 'loginDetected', email: 'fora@empresa.example' }, fromSite('https://terceiro.example/login'));
  const at = store.session.pendingLogin.at;
  responses.set('GET /history', { body: { historyId: '300' } });
  responses.set('GET /messages', init => (init.headers.Authorization === 'Bearer tok-c' ? { body: { messages: [{ id: 'q1' }] } } : { body: {} }));
  responses.set('GET /messages/q1', { body: message({ id: 'q1', subject: 'ENC: Código', text: 'Seu código: 286282', date: at + 1000 }) });
  const abertos = popupsOpened;
  await bg.tick();
  const achado = (await bg.getState()).results.find(r => r.id === 'q1');
  eq('código encaminhado é achado em outra caixa conectada', [achado?.items[0].value, achado?.account, popupsOpened - abertos], ['286282', 'c@gmail.com', 1]);

  responses.set('POST /messages/q1/trash', init => (init.headers.Authorization === 'Bearer tok-c' ? { body: {} } : { status: 403, body: {} }));
  eq('excluir usa a caixa de onde o e-mail veio', (await dispatch({ type: 'trash', id: 'q1' })).ok, true);
}

async function popupFallback() {
  popupRefused = true;
  await send({ type: 'loginDetected', email: 'e1@y.com' }, fromSite('https://janela.example/login'));
  await send({ type: 'loginDetected', email: 'e2@y.com' }, fromSite('https://janela.example/login'));
  popupRefused = false;
  eq('sem janela ativa, abre o popup numa janela própria', windowsCreated.map(w => [w.url, w.type]), [['http://extensao.test/popup/popup.html', 'popup']]);
  await dispatch({ type: 'dismissDuration' });
  eq('agora não encerra o pedido', (await bg.getState()).askDuration, null);
}

async function identity() {
  const site = 'marca.example';
  store.local.logins = { sites: { [site]: 'um@y.com' }, accounts: [{ host: site, email: 'um@y.com', struck: false, until: null }] };
  store.session.askDuration = null;
  eq('marcar em site sem tempo pede o tempo', [(await dispatch({ type: 'setAccountMark', host: site, email: 'um@y.com', marked: true })).ok, (await bg.getState()).askDuration], [true, { host: site }]);
  eq('marcar em site sem tempo risca sem prazo', store.local.logins.accounts[0].until, null);

  const dia = 86_400_000;
  const t0 = Date.now();
  await dispatch({ type: 'setDuration', host: site, durationMs: 90 * 60_000, custom: true });
  eq('tempo fora da lista fica salvo para todos os sites', settings().customDurations, [90 * 60_000]);
  await dispatch({ type: 'setDuration', host: site, durationMs: 90 * 60_000, custom: true });
  eq('tempo repetido não duplica', settings().customDurations, [90 * 60_000]);
  const inicio = store.local.logins.accounts[0].since;
  eq('contagem começa ao salvar o tempo', inicio >= t0, true);

  await dispatch({ type: 'setDuration', host: site, durationMs: 2 * dia });
  eq('editar o tempo recalcula a contagem em andamento', store.local.logins.accounts[0].until, inicio + 2 * dia);
  eq('tempo da lista não vira opção personalizada', settings().customDurations, [90 * 60_000]);

  store.local.logins.accounts[0].since = Date.now() - 3 * dia;
  await dispatch({ type: 'setDuration', host: site, durationMs: dia });
  eq('tempo novo já vencido encerra a contagem', store.local.logins.accounts[0].struck, false);

  store.local.logins.accounts[0] = { host: site, email: 'um@y.com', struck: true, since: Date.now() - 2 * dia, until: Date.now() - 1000 };
  await dispatch({ type: 'setDuration', host: site, durationMs: 7 * dia });
  eq('editar o tempo não revive contagem já vencida', [store.local.logins.accounts[0].struck, store.local.logins.accounts[0].until], [false, null]);

  eq('tempo inválido é recusado', (await dispatch({ type: 'setDuration', host: site, durationMs: NaN })).ok, false);
  eq('tempo acima do teto é recusado', (await dispatch({ type: 'setDuration', host: site, durationMs: 367 * dia })).ok, false);
  eq('tempo recusado não muda o salvo', settings().siteDurations[site], 7 * dia);

  await dispatch({ type: 'setAccountMark', host: site, email: 'um@y.com', marked: true });
  eq('marcar com tempo salvo conta e não pergunta', [store.local.logins.accounts[0].struck, store.local.logins.accounts[0].until > Date.now(), (await bg.getState()).askDuration], [true, true, null]);
  await dispatch({ type: 'setAccountMark', host: site, email: 'um@y.com', marked: false });
  eq('desmarcar encerra a contagem', [store.local.logins.accounts[0].struck, store.local.logins.accounts[0].until], [false, null]);
  eq('página não marca conta', await send({ type: 'setAccountMark', host: site, email: 'um@y.com', marked: true }, fromSite('https://x.example/')), 'recusado');
  await dispatch({ type: 'askDuration', host: site });
  eq('outro tempo abre a escolha de duração', (await bg.getState()).askDuration, { host: site });
  await dispatch({ type: 'dismissDuration' });
  eq('tempos personalizados vão para o arquivo', JSON.parse(serializeConfig(settings())).customDurations, [90 * 60_000]);
}

async function browserToggle() {
  await dispatch({ type: 'setBrowserEnabled', enabled: false });
  eq('desligar para o script e mantém a permissão', [settings().browserEnabled, scripts.length, perms.granted], [false, 0, true]);
  await dispatch({ type: 'setBrowserEnabled', enabled: true });
  eq('religar com a permissão já concedida registra de novo', [settings().browserEnabled, scripts.length], [true, 1]);
}

async function browserOff() {
  perms.granted = false;
  perms.removed[0]({ origins: SITES });
  await flush();
  eq('retirar o acesso desliga e tira o script', [settings().browserEnabled, scripts.length], [false, 0]);
  await dispatch({ type: 'clearLogins' });
  eq('limpar apaga a lista', store.local.logins, { sites: {}, accounts: [] });
}

await run([setup, connectFirst, incremental, silentRenewal, trash, secondAccount, expiredHistory, configFile, configParsing, browserWatch, codeOpensPopup, otherBoxes, popupFallback, identity, browserToggle, browserOff]);
