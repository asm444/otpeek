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
        { host: 'svc.example', email: 'longo@x.com', struck: true, until: Date.now() + 36 * 3_600_000 },
        { host: 'svc.example', email: 'dias@x.com', struck: true, until: Date.now() + 72 * 3_600_000 },
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
  runtime: { reload: () => { reloads++; }, getManifest: () => ({ version: '0.9.0' }), sendMessage: async msg => { sent.push(msg); return { ok: true }; } },
};
let closed = 0;
let reloads = 0;
window.close = () => { closed++; };

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
  eq('salvar envia o site e a duração escolhida', lastSent('setDuration'), { type: 'setDuration', host: 'svc.example', durationMs: 604800000, custom: false });
  eq('outro tempo fica escondido até ser escolhido', $('custom-duration').hidden, true);
  $('duration-select').value = 'custom';
  $('duration-select').dispatchEvent(new Event('change'));
  eq('escolher outro tempo mostra o campo', $('custom-duration').hidden, false);
  $('custom-amount').value = '36';
  $('custom-unit').value = '3600000';
  $('save-duration').click();
  await settle();
  eq('outro tempo envia horas em milissegundos', lastSent('setDuration'), { type: 'setDuration', host: 'svc.example', durationMs: 36 * 3_600_000, custom: true });
  $('dismiss-duration').click();
  await settle();
  eq('agora não encerra o pedido', lastSent('dismissDuration'), { type: 'dismissDuration' });
  delete store.session.askDuration;
  await update('session', { askDuration: {} });
  eq('sem pedido a tela de duração fecha', $('duration-view').hidden, true);
}

async function siteLogins() {
  eq('ícone escondido com a função desligada', $('identity-toggle').hidden, true);
  store.local.settings.browserEnabled = true;
  store.local.settings.siteDurations = { 'svc.example': 86_400_000 };
  store.local.settings.customDurations = [36 * 3_600_000];
  await update('local', { settings: {} });
  eq('ícone aparece com a função ligada', $('identity-toggle').hidden, false);
  $('identity-toggle').click();
  await settle();
  eq('ícone abre a aba de identificação', [$('identity-view').hidden, $('list-view').hidden, $('identity-toggle').getAttribute('aria-expanded')], [false, true, 'true']);
  const rows = [...$('site-logins').querySelectorAll('.site-login')];
  eq('mostra os e-mails na ordem da lista', rows.map(r => r.querySelector('.email').textContent), ['novo@x.com', 'velho@x.com', 'longo@x.com', 'dias@x.com', 'vencido@x.com']);
  eq('só o lembrete em andamento fica riscado', rows.map(r => r.querySelector('.email').classList.contains('struck')), [false, true, true, true, false]);
  eq('checkbox segue o risco', rows.map(r => r.querySelector('input').checked), [false, true, true, true, false]);
  eq('mostra o tempo restante', rows.slice(1, 4).map(r => r.querySelector('small').textContent), ['3 h', '36 h', '3 d']);

  const seletor = $('site-logins').querySelector('[aria-label="Tempo de svc.example"]');
  eq('seletor mostra o tempo salvo', seletor.value, '86400000');
  eq('seletor oferece o tempo personalizado', [...seletor.options].some(o => o.textContent === '36 horas'), true);
  seletor.value = '604800000';
  seletor.dispatchEvent(new Event('change'));
  await settle();
  eq('editar o tempo envia ao worker', lastSent('setDuration'), { type: 'setDuration', host: 'svc.example', durationMs: 604800000 });
  seletor.value = 'custom';
  seletor.dispatchEvent(new Event('change'));
  await settle();
  eq('outro tempo pede a escolha', lastSent('askDuration'), { type: 'askDuration', host: 'svc.example' });
  const semTempo = $('site-logins').querySelector('[aria-label="Tempo de antigo.example"]');
  eq('site sem tempo pede para escolher', [semTempo.value, semTempo.options[0].textContent], ['', 'Escolher tempo']);

  const limpar = [...$('site-logins').querySelectorAll('.site-actions button')].find(b => b.textContent === 'Limpar');
  limpar.click();
  await settle();
  eq('limpar site envia o site', lastSent('forgetSite'), { type: 'forgetSite', host: 'svc.example' });
  [...$('site-logins').querySelectorAll('.site-actions button')].find(b => b.textContent === 'Bloquear').click();
  await settle();
  eq('bloquear site envia o site', lastSent('blockSite'), { type: 'blockSite', host: 'svc.example' });
  eq('sem bloqueados a lista fica escondida', $('blocked-card').hidden, true);
  store.local.settings.blockedSites = ['ruim.example'];
  await update('local', { settings: {} });
  eq('mostra os sites bloqueados', [$('blocked-card').hidden, [...$('blocked-sites').children].map(li => li.querySelector('.email').textContent)], [false, ['ruim.example']]);
  $('blocked-sites').querySelector('button').click();
  await settle();
  eq('desbloquear envia o site', lastSent('unblockSite'), { type: 'unblockSite', host: 'ruim.example' });
  store.local.settings.blockedSites = [];
  await update('local', { settings: {} });

  const marca = rows[0].querySelector('input');
  marca.checked = true;
  marca.dispatchEvent(new Event('change'));
  await settle();
  eq('marcar envia ao worker', lastSent('setAccountMark'), { type: 'setAccountMark', host: 'svc.example', email: 'novo@x.com', marked: true });
  const desmarca = rows[1].querySelector('input');
  desmarca.checked = false;
  desmarca.dispatchEvent(new Event('change'));
  await settle();
  eq('desmarcar envia ao worker', lastSent('setAccountMark'), { type: 'setAccountMark', host: 'svc.example', email: 'velho@x.com', marked: false });

  $('clear-logins').click();
  await settle();
  eq('limpar pede a remoção da lista', lastSent('clearLogins'), { type: 'clearLogins' });
  store.local.logins = { sites: {}, accounts: [] };
  await update('local', { logins: {} });
  eq('lista vazia mostra o aviso', [$('identity-empty').hidden, $('site-logins').children.length], [false, 0]);
  $('identity-toggle').click();
  await settle();
  eq('segundo clique volta para a lista', $('identity-view').hidden, true);
  store.local.settings.browserEnabled = false;
  await update('local', { settings: {} });
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

async function receivedCode() {
  const result = { id: 'r1', from: 'Predictus', subject: 'Código de verificação', date: Date.now(), isNew: false, items: [{ kind: 'code', value: '286282' }] };
  store.session.results = [result, { ...result, id: 'r2', account: 'caixa2@gmail.com', items: [{ kind: 'code', value: '777111' }] }];
  store.session.autoShow = { id: 'r1', at: Date.now() - 14_950 };
  await update('session', { autoShow: {} });
  eq('código recebido aparece em destaque', [$('auto-code').hidden, $('auto-code-value').textContent], [false, '286282']);
  eq('mostra o e-mail que recebeu e a mensagem', $('auto-code-meta').textContent, 'a@gmail.com · Predictus · Código de verificação');
  eq('avisa o worker que já mostrou', lastSent('clearAutoShow'), { type: 'clearAutoShow' });
  await new Promise(r => setTimeout(r, 120));
  eq('fecha sozinho depois do tempo', closed, 1);

  store.session.autoShow = { id: 'r2', at: Date.now() - 14_950 };
  await update('session', { autoShow: {} });
  eq('código de outra caixa mostra essa caixa', [$('auto-code-value').textContent, $('auto-code-meta').textContent.split(' · ')[0]], ['777111', 'caixa2@gmail.com']);
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  eq('interagir mantém o popup aberto', closed, 1);

  store.session.autoShow = { id: 'r1', at: Date.now() - 60_000 };
  closed = 0;
  await update('session', { autoShow: {} });
  await new Promise(r => setTimeout(r, 60));
  eq('aviso antigo não reabre nem fecha', [$('auto-code-value').textContent, closed], ['777111', 0]);
}

async function links() {
  store.session.results = [{ id: 'l1', from: 'Loja', subject: 'Confirme', date: Date.now(), isNew: false, items: [{ kind: 'link', value: 'https://loja.example/confirmar?t=1' }, { kind: 'code', value: '123456' }] }];
  await update('session', { results: {} });
  const rows = [...$('list').querySelectorAll('.value')];
  const abrir = rows[0].querySelector('a.open');
  eq('link oferece copiar e abrir em nova aba', [rows[0].querySelector('.copy').textContent, abrir?.textContent, abrir?.href, abrir?.target], ['Copiar', 'Abrir', 'https://loja.example/confirmar?t=1', '_blank']);
  eq('código não ganha botão de abrir', rows[1].querySelector('a.open'), null);
  store.session.results = [];
  await update('session', { results: {} });
}

async function footer() {
  eq('rodapé mostra a versão instalada', $('current-version').textContent, '0.9.0');
  eq('sem verificação pede para recarregar', [$('update-status').textContent, $('update-available').hidden], ['Recarregue para buscar atualizações', true]);
  eq('link de apoio', document.querySelector('.support').href, 'https://buymeacoffee.com/asm444/support-otpeek-development');
  store.local.latestRelease = { version: '0.9.0', url: 'https://github.com/asm444/otpeek/releases/tag/v0.9.0' };
  await update('local', { latestRelease: {} });
  eq('versão igual diz que é a mais recente', [$('update-status').textContent, $('update-available').hidden], ['Versão mais recente', true]);
  store.local.latestRelease = { version: '1.0.0', url: 'https://github.com/asm444/otpeek/releases/tag/v1.0.0' };
  await update('local', { latestRelease: {} });
  eq('versão nova mostra número, link e comando', [$('update-available').hidden, $('latest-link').textContent, $('latest-link').href, $('update-command').textContent], [false, 'v1.0.0', 'https://github.com/asm444/otpeek/releases/tag/v1.0.0', 'git pull']);
  eq('recarregar só depois do clique', reloads, 0);
  $('reload-extension').click();
  eq('botão recarrega a extensão', reloads, 1);
}

await run([duration, siteLogins, browserSwitch, receivedCode, links, footer]);
