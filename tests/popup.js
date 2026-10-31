import { eq, run } from './harness.js';

const html = await (await fetch('../popup/popup.html')).text();
const page = new DOMParser().parseFromString(html, 'text/html');
document.body.append(...page.body.children);

const store = {
  local: {
    settings: { clientId: '1.apps.googleusercontent.com', accounts: ['a@gmail.com'], accountEmail: 'a@gmail.com', browserEnabled: false },
    logins: {
      accounts: [
        { host: 'svc.example', email: 'novo@x.com', struck: false, until: null },
        { host: 'svc.example', email: 'velho@x.com', struck: true, until: Date.now() + 3 * 3_600_000 },
        { host: 'antigo.example', email: 'vencido@x.com', struck: true, until: Date.now() - 1000 },
      ],
    },
  },
  session: { status: 'ok', results: [], askDuration: { host: 'svc.example' } },
};
const sent = [];
const requested = [];
let grant = true;
const changed = [];
const area = name => ({
  get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(k => k in store[name]).map(k => [k, structuredClone(store[name][k])])),
});

globalThis.chrome = {
  storage: { local: area('local'), session: area('session'), onChanged: { addListener: fn => changed.push(fn) } },
  identity: { getRedirectURL: () => 'https://ext.chromiumapp.org/' },
  permissions: { request: async p => { requested.push(p); return grant; } },
  runtime: { sendMessage: async msg => { sent.push(msg); return { ok: true }; } },
};

await import('../popup/popup.js');

const $ = id => document.getElementById(id);
const settle = () => new Promise(r => setTimeout(r, 20));
const update = async (area, changes) => {
  for (const fn of changed) await fn(changes, area);
  await settle();
};
const lastSent = type => sent.filter(m => m.type === type).at(-1);

async function duration() {
  await settle();
  eq('pedido de duração abre a tela menor', [$('duration-view').hidden, $('list-view').hidden, $('duration-host').textContent], [false, true, 'svc.example']);
  eq('a lista oferece um dia e uma semana', [...$('duration-select').options].map(o => o.textContent).filter(t => ['1 dia', '1 semana'].includes(t)), ['1 dia', '1 semana']);
  $('duration-select').value = '604800000';
  $('save-duration').click();
  await settle();
  eq('salvar envia o site e a duração escolhida', lastSent('setDuration'), { type: 'setDuration', host: 'svc.example', durationMs: 604800000 });
  $('dismiss-duration').click();
  await settle();
  eq('agora não encerra o pedido', lastSent('dismissDuration'), { type: 'dismissDuration' });
  delete store.session.askDuration;
  await update('session', { askDuration: {} });
  eq('sem pedido a tela de duração fecha', $('duration-view').hidden, true);
}

async function siteLogins() {
  $('account-pill').click();
  await settle();
  const rows = [...$('site-logins').children];
  eq('mostra os e-mails na ordem da lista', rows.map(r => r.querySelector('.email').textContent), ['novo@x.com', 'velho@x.com', 'vencido@x.com']);
  eq('só o lembrete em andamento fica riscado', rows.map(r => r.querySelector('.email').classList.contains('struck')), [false, true, false]);
  eq('mostra o tempo restante', rows[1].querySelector('small').textContent, 'svc.example · 3 h');
  $('clear-logins').click();
  await settle();
  eq('limpar pede a remoção da lista', lastSent('clearLogins'), { type: 'clearLogins' });
  store.local.logins = { sites: {}, accounts: [] };
  await update('local', { logins: {} });
  eq('lista vazia esconde o cartão', $('site-logins-card').hidden, true);
}

async function browserSwitch() {
  const toggle = $('browser-enabled');
  eq('função vem desligada', toggle.checked, false);
  eq('nada pede acesso antes de ligar', requested.length, 0);
  grant = false;
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  await settle();
  eq('acesso recusado mantém desligado', [toggle.checked, lastSent('setBrowserEnabled').enabled], [false, false]);
  grant = true;
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  await settle();
  eq('ligar pede acesso a todos os sites', requested.at(-1), { origins: ['http://*/*', 'https://*/*'] });
  eq('acesso concedido liga', [toggle.checked, lastSent('setBrowserEnabled').enabled], [true, true]);
  store.local.settings.browserEnabled = true;
  toggle.checked = false;
  await update('local', { settings: {} });
  eq('chave reflete a função ligada ao abrir', toggle.checked, true);
  const pedidos = requested.length;
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change'));
  await settle();
  eq('desligar não pede acesso e avisa o worker', [requested.length, lastSent('setBrowserEnabled').enabled], [pedidos, false]);
}

await run([duration, siteLogins, browserSwitch]);
