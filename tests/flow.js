import { eq, run } from './harness.js';
import { message } from './fixtures.js';

const REDIRECT = 'https://ebceaflpcefmmgchplhcphdipkolebik.chromiumapp.org/';
const store = { local: {}, session: {} };
const listeners = { message: [] };
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
  runtime: { onMessage: event(listeners.message), onStartup: event(), onInstalled: event() },
  action: { setBadgeText: async ({ text }) => { badge.text = text; }, setBadgeBackgroundColor: async () => {} },
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

await run([setup, connectFirst, incremental, silentRenewal, trash, secondAccount, expiredHistory]);
