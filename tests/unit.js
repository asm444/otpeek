import { eq, run } from './harness.js';
import { decodeEntities, extract, findCode, htmlToText } from '../src/extract.js';
import { b64url, latin1, message } from './fixtures.js';
import { applyDuration, emptyLogins, expireReminders, forgetSite, hostOf, isValidEmail, markAccount, recordLogin, unmarkAccount } from '../src/logins.js';
import '../src/login-detect.js';
import '../src/code-fill.js';
import { isNewer, parseRelease } from '../src/version.js';
import { parseMessage, senderName, decodeEncodedWords } from '../src/mime.js';

const msg = ({ subject = '', text = '', html = '' }) => ({ subject, text, html });
const values = items => items.map(i => i.value);

async function codes() {
  eq('código no meio da frase (EN)',
    findCode('Your verification code', 'Your verification code is 482913. It expires in 10 minutes.'), '482913');
  eq('código com espaço na linha seguinte (PT)',
    findCode('Acesse sua conta', 'Olá!\nUse o código abaixo para entrar:\n\n739 204\n\nEquipe'), '739204');
  eq('código alfanumérico com hífen',
    findCode('Acesso', 'Seu código de acesso: X7K-29Q'), 'X7K-29Q');
  eq('código só no assunto',
    findCode('123456 é seu código do Instagram', ''), '123456');
  eq('código em tabela HTML',
    findCode('Verificação', htmlToText('<table><tr><td>Código</td><td><b>551&nbsp;903</b></td></tr></table>')), '551903');
  eq('preço, telefone e ano não viram código',
    findCode('Confirme sua presença', 'Confirme já: ingresso por R$ 1999 em 12x.\nLigue (11) 4002-8922.\nConfirmado © 2026 Loja'), null);
  eq('número de pedido não vira código',
    findCode('Confirmação do pedido', 'Confirmação do pedido nº 12345678 recebida.'), null);
  eq('número logo após "pedido" não vira código',
    findCode('Confirmação', 'Confirmação do pedido 87654321 recebida.'), null);
  eq('número sem palavra-chave por perto é ignorado',
    findCode('Newsletter', 'Promoção 554433 imperdível\n\n\n\nfim'), null);
}

async function links() {
  const html = `<p>Clique para confirmar:</p>
    <a href="https://acct.example.com/verify?t=abc&amp;u=1">Confirmar e-mail</a>
    <a href="https://example.com/unsubscribe?u=1">Descadastrar</a>
    <img src="https://example.com/logo.png">`;
  eq('link de confirmação escolhido, descadastro ignorado',
    values(extract(msg({ subject: 'Confirme seu e-mail', html }))),
    ['https://acct.example.com/verify?t=abc&u=1']);
  eq('newsletter sem palavra-chave não gera link',
    values(extract(msg({ subject: 'Ofertas', html: '<a href="https://shop.example.com/ofertas">Ver ofertas</a>' }))), []);
  eq('link em texto puro',
    values(extract(msg({ subject: 'Sign in to Example', text: 'Click here to sign in:\nhttps://example.com/magic-login?token=xyz.\n' }))),
    ['https://example.com/magic-login?token=xyz']);
  eq('filtro de tipo: só códigos',
    extract(msg({ subject: 'Código 123456', html: '<a href="https://a.example.com/verify">Verificar</a>' }), { codes: true, links: false })
      .map(i => i.kind), ['code']);
}

async function mime() {
  const raw = message({ id: 'x', subject: '=?UTF-8?B?' + btoa(String.fromCharCode(...new TextEncoder().encode('Código de verificação'))) + '?=', text: 'Código: 908172 — válido por 5 min' });
  const parsed = parseMessage(raw);
  eq('assunto RFC 2047 decodificado', parsed.subject, 'Código de verificação');
  eq('corpo UTF-8 base64url decodificado', parsed.text.trim(), 'Código: 908172 — válido por 5 min');
  eq('extração ponta a ponta', values(extract(parsed)), ['908172']);

  const iso = {
    id: 'y', internalDate: '1',
    payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'x' }],
      parts: [{ mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=ISO-8859-1' }], body: { data: b64url('', latin1('Código: 1234')) } }] },
  };
  eq('corpo ISO-8859-1 respeita charset', parseMessage(iso).text.trim(), 'Código: 1234');
  eq('anexo é ignorado',
    parseMessage({ id: 'z', payload: { parts: [{ mimeType: 'text/plain', filename: 'a.txt', body: { data: b64url('código 111111') } }] } }).text, '');
  eq('remetente com nome', senderName('"Banco X" <alerta@banco.example>'), 'Banco X');
  eq('remetente só e-mail', senderName('<alerta@banco.example>'), 'alerta@banco.example');
  eq('Q-encoding', decodeEncodedWords('=?ISO-8859-1?Q?C=F3digo_de_acesso?='), 'Código de acesso');
}

async function fishAudio() {
  const text = 'Seu código de verificação\n\nUse este código para continuar no Fish Audio. Ele expira em 10 minutos.\n\n179542\n\nSe você não pediu este código, pode ignorar este e-mail com segurança. Nada muda na sua conta.\n\nSuporte: https://fish.audio/app/support/\nPrivacidade: https://fish.audio/privacy/\nTermos: https://fish.audio/terms/\n\n© 2026 Hanabi AI, Inc. dba Fish Audio\n1111B S Governors Ave STE 48109, Dover, DE 19904, United States';
  const html = '<div style="display:none">Seu código de verificação do Fish Audio está aqui. Ele expira em 10 minutos.</div><h1>Seu código de verificação</h1><p>Use este código para continuar no <strong>Fish Audio</strong>. Ele expira em 10 minutos.</p><table><tr><td><span class="code">179542</span></td></tr></table><p>Se você não pediu este código, pode ignorar este e-mail.</p><a href="https://fish.audio/app/support/">Suporte</a> <a href="https://fish.audio/privacy/">Privacidade</a> <a href="https://fish.audio/terms/">Termos</a><p>&copy; 2026 Hanabi AI, Inc.<br>1111B S Governors Ave STE 48109, Dover, DE 19904</p>';
  const parsed = parseMessage(message({ id: 'f', from: 'Fish Audio <noreply@fish.audio>', subject: '=?UTF-8?q?Fish_Audio:_Seu_c=C3=B3digo_de_verifica=C3=A7=C3=A3o?=', text, html }));
  eq('Fish Audio: assunto Q-encoding', parsed.subject, 'Fish Audio: Seu código de verificação');
  eq('Fish Audio: código do corpo, sem link de suporte', extract(parsed).map(i => [i.kind, i.value]), [['code', '179542']]);
  eq('Fish Audio só com HTML', values(extract({ ...parsed, text: '' })), ['179542']);
}

async function predictus() {
  const corpo = 'Reservar um horário para se reunir comigo\nDe: PREDICTUS <no-reply@predictus.com.br>\nEnviado: sexta-feira, 30 de outubro de 2026 18:32\nPara: FULANO <fulano@exemplo.com.br>\nAssunto: Código de verificação\n\nCódigo de verificação\nOlá,\n\nPara garantir a segurança no acesso à sua conta, utilize o código abaixo.\n\n286282\nEste código é exclusivo para uso pessoal, tem validade de 30 minutos e não deve ser compartilhado com ninguém.\nCaso você não tenha solicitado este e-mail, entre em contato com nossa equipe de suporte.\nPredictus © 2026 - Todos os direitos reservados';
  const subject = 'ENC: Código de verificação';
  const html = '<p>C&oacute;digo de verifica&ccedil;&atilde;o</p><p>Ol&aacute;,</p><p>Para garantir a seguran&ccedil;a no acesso &agrave; sua conta, utilize o c&oacute;digo abaixo.</p><p>286282</p><p>Este c&oacute;digo &eacute; exclusivo</p>';
  eq('Predictus: texto como colado', findCode(subject, corpo), '286282');
  eq('Predictus: HTML com acentos em entidades, sem texto', values(extract(msg({ subject: 'Acesso', html }))), ['286282']);
  eq('Predictus: texto sem o código, código só no HTML', values(extract(msg({ subject: 'Teste', text: 'Reservar um horário\nVer no navegador', html }))), ['286282']);
  eq('entidades acentuadas decodificadas', decodeEntities('C&oacute;digo &Eacute; seguran&ccedil;a &copy; &atilde;'), 'Código É segurança © ã');
  const inicio = performance.now();
  for (const hostil of ['<style>', '<a href="x" ', '<']) extract(msg({ subject: 'Código', html: hostil.repeat(1e6) }));
  eq('HTML hostil de até 12 MB termina em menos de 5 s', performance.now() - inicio < 5000, true);
  for (const [nome, hostil] of [['comentário sem fechamento', '<!--'], ['style sem fechamento', '<style '], ['<a sem >', '<a ']]) {
    const t0 = performance.now();
    extract(msg({ subject: 'Código', html: 'code ' + hostil.repeat(1e5) }));
    eq(`${nome} repetido até 256 KiB termina em menos de 500 ms`, performance.now() - t0 < 500, true);
  }
  eq('bloco sem fechamento descarta o resto', htmlToText('<p>antes</p><!-- sem fim <p>123456</p>'), 'antes');
  eq('blocos fechados somem e o texto entre eles fica',
    htmlToText('<style>a{}</style>um<!-- x -->dois<SCRIPT>y</script>tres'), 'um dois tres');
  eq('dois blocos da mesma tag somem, cada um até o próprio fechamento',
    htmlToText('<title>t</title><style>a</style>b<style>c</style>d'), 'b d');
  eq('referência numérica inválida não derruba a leitura', decodeEntities('a&#99999999;b'), 'a&#99999999;b');
}

async function formatos() {
  const aceitos = [
    ['6 dígitos com ponto', 'Código: 123.456', '123456'],
    ['6 dígitos com hífen', 'Your code is 123-456', '123456'],
    ['3 pares', 'Seu código é 12 34 56', '123456'],
    ['dígitos espaçados', 'Seu código:\n2 8 6 2 8 2', '286282'],
    ['grupo 4-4 rotulado', 'Código de acesso: 1234 5678', '12345678'],
    ['8 dígitos', 'GitHub launch code: 12345678', '12345678'],
    ['7 dígitos', 'Security code: 1234567', '1234567'],
    ['4 dígitos', 'PIN: 4821', '4821'],
    ['prefixo do Google', 'G-482913 is your Google verification code', 'G-482913'],
    ['prefixo de letras', 'Seu código: FB-48291', 'FB-48291'],
    ['alfanumérico com hífen', 'Your confirmation code:\nX7K-29Q', 'X7K-29Q'],
    ['três grupos', 'Código: AB12-CD34-EF56', 'AB12-CD34-EF56'],
    ['alfanumérico 5', 'Steam Guard code\n\nF7K2P', 'F7K2P'],
    ['grupos só de letras sozinho na linha', 'Enter this device code:\nWDJB-MJHT', 'WDJB-MJHT'],
    ['só letras rotulado', 'Seu código: XKCDQ', 'XKCDQ'],
    ['minúsculo rotulado', 'token: a1b2c3', 'a1b2c3'],
    ['palavras rotuladas', 'Your login code is: flow-river-stone', 'flow-river-stone'],
    ['cerquilha após o rótulo', 'Código #482913', '482913'],
    ['igual', 'code=482913', '482913'],
    ['aspas e negrito', 'Your code is "482913"', '482913'],
    ['código antes da frase', '482913\nÉ o seu código de acesso', '482913'],
    ['linha isolada longe do rótulo', 'Código de verificação\nOlá,\nBem-vindo!\nSegue abaixo:\n482913\nEquipe', '482913'],
    ['maiúsculas sem acento', 'CODIGO DE VERIFICACAO: 482913', '482913'],
    ['acento combinante (NFD)', 'Use o código:\n482913', '482913'],
    ['abreviação', 'Cód. de acesso: 482913', '482913'],
    ['espanhol', 'Tu código de verificación es 482913', '482913'],
    ['alemão', 'Ihr Bestätigungscode lautet 482913', '482913'],
    ['francês', 'Votre code de vérification est 482913', '482913'],
    ['italiano', 'Il tuo codice è 482913', '482913'],
    ['senha temporária', 'Sua senha temporária: Ab12Cd34', 'Ab12Cd34'],
  ];
  for (const [nome, corpo, esperado] of aceitos) eq(`formato: ${nome}`, findCode('', corpo), esperado);

  eq('formato: dígitos em células separadas',
    findCode('', htmlToText('<p>Use o código:</p><table><tr><td>2</td><td>8</td><td>6</td><td>2</td><td>8</td><td>2</td></tr></table>')), '286282');
  eq('formato: dígitos em spans',
    findCode('', htmlToText('<p>Use o código:</p><p><span>2</span><span>8</span><span>6</span><span>2</span><span>8</span><span>2</span></p>')), '286282');
  eq('formato: quebrado por negrito',
    findCode('', htmlToText('<p>Use o código:</p><p><b>286</b><b>282</b></p>')), '286282');
  eq('formato: caractere invisível no meio',
    findCode('', htmlToText('<p>Use o código:</p><p>286&zwnj;282</p>')), '286282');

  const recusados = [
    ['cupom promocional', 'Use o promo code SAVE20 hoje'],
    ['código de barras', 'Código de barras 34191790010'],
    ['código de rastreio', 'Código de rastreio: BR123456789'],
    ['código do pedido', 'Código do pedido: 482913'],
    ['lei citada', 'Conforme o Código Civil 2002'],
    ['validade não é código', 'Este código vale por 30 minutos'],
    ['OAB na assinatura', 'Código de ética\nOAB/SP 123.456'],
    ['CPF formatado', 'Confirme seu CPF 123.456.789-00'],
    ['CNPJ formatado', 'Confirme: 12.345.678/0001-90'],
    ['0800', 'Dúvidas sobre o código? 0800 123 4567'],
    ['telefone em grupos', 'Código perdido? Ligue (11) 4002 8922'],
    ['data ISO', 'Código enviado em 2026-10-30'],
    ['parâmetro de URL', 'Confirme em https://x.example/a?id=482913'],
    ['frase em maiúsculas', 'YOUR CODE IS BELOW'],
    ['frase sem código', 'Your code is below'],
    ['ano no rodapé', 'Código de acesso\nPredictus 2026'],
  ];
  for (const [nome, corpo] of recusados) eq(`recusa: ${nome}`, findCode('', corpo), null);
}

async function logins() {
  const DIA = 86_400_000;
  const login = (s, email, dur, now = 1000, host = 'a.example') => recordLogin(s, { host, email }, dur, now);
  const r1 = login(emptyLogins(), 'A@x.com');
  eq('primeiro login entra sem riscar', r1.state.accounts, [{ host: 'a.example', email: 'a@x.com', struck: false, until: null }]);
  eq('primeiro login não é troca', [r1.switched, r1.needsDuration], [false, false]);
  eq('mesmo e-mail não muda nada', login(r1.state, 'a@x.com').state === r1.state, true);

  const r2 = login(r1.state, 'b@x.com', DIA);
  eq('troca com duração risca e conta', r2.state.accounts.map(a => [a.email, a.struck, a.until]), [['b@x.com', false, null], ['a@x.com', true, 1000 + DIA]]);
  eq('troca com duração não pergunta', [r2.switched, r2.needsDuration], [true, false]);

  const r3 = login(r1.state, 'b@x.com');
  eq('troca sem duração pergunta e fica sem prazo', [r3.needsDuration, r3.state.accounts[1].until], [true, null]);
  eq('duração escolhida vale para o riscado do site', applyDuration(r3.state, 'a.example', DIA, 5).accounts[1].until, 5 + DIA);
  eq('duração não atinge outro site', applyDuration(r3.state, 'z.example', DIA, 5).accounts[1].until, null);

  const r4 = login(r2.state, 'c@x.com', DIA, 2000);
  eq('conta nova entra antes das riscadas', r4.state.accounts.map(a => a.email), ['c@x.com', 'a@x.com', 'b@x.com']);
  const volta = login(r4.state, 'a@x.com', DIA, 3000);
  eq('voltar a uma conta riscada tira o risco e não duplica', volta.state.accounts.map(a => [a.email, a.struck]), [['a@x.com', false], ['b@x.com', true], ['c@x.com', true]]);

  const outro = login(r2.state, 'b@x.com', DIA, 1000, 'b.example');
  eq('mesmo e-mail em outro site não é troca', [outro.switched, outro.state.accounts.length, outro.state.sites['b.example']], [false, 3, 'b@x.com']);

  eq('lembrete em andamento mantém o risco', expireReminders(r2.state, DIA) === r2.state, true);
  eq('lembrete vencido volta ao normal', expireReminders(r2.state, 1000 + DIA).accounts[1], { host: 'a.example', email: 'a@x.com', struck: false, until: null });
  eq('riscado sem prazo não vence', expireReminders(r3.state, 9e15) === r3.state, true);

  let cheio = emptyLogins();
  for (let i = 0; i < 205; i++) cheio = login(cheio, `u${i}@x.com`, 0, 1, `s${i}.example`).state;
  eq('lista tem teto de 200 e tira a entrada mais antiga', [cheio.accounts.length, 's0.example' in cheio.sites, 's204.example' in cheio.sites], [200, false, true]);

  const contando = login(r1.state, 'b@x.com', DIA, 1000);
  eq('novo tempo recalcula a partir do início da contagem', applyDuration(contando.state, 'a.example', 2 * DIA, 5000).accounts[1].until, 1000 + 2 * DIA);
  eq('novo tempo mantém o início', applyDuration(contando.state, 'a.example', 2 * DIA, 5000).accounts[1].since, 1000);
  eq('novo tempo não mexe em quem não conta', applyDuration(contando.state, 'a.example', 2 * DIA, 5000).accounts[0].until, null);

  const base = login(contando.state, 'c@x.com', DIA, 1000).state;
  const marcado = markAccount(base, 'a.example', 'c@x.com', DIA, 7000);
  eq('marcar risca, conta e manda para o fim', marcado.accounts.at(-1), { host: 'a.example', email: 'c@x.com', struck: true, since: 7000, until: 7000 + DIA });
  eq('marcar sem tempo risca e fica sem prazo', markAccount(base, 'a.example', 'c@x.com', undefined, 7000).accounts.at(-1), { host: 'a.example', email: 'c@x.com', struck: true, until: null });
  eq('marcar e-mail desconhecido não muda nada', markAccount(base, 'a.example', 'z@x.com', DIA, 7000) === base, true);
  const desmarcado = unmarkAccount(marcado, 'a.example', 'c@x.com');
  eq('desmarcar tira o risco, encerra e volta para antes dos riscados', [desmarcado.accounts[0].email, desmarcado.accounts[0].struck, desmarcado.accounts[0].until, 'since' in desmarcado.accounts[0]], ['c@x.com', false, null, false]);
  eq('login no e-mail ativo que foi marcado tira o risco', login(marcado, 'c@x.com', DIA, 8000).state.accounts.find(a => a.email === 'c@x.com').struck, false);

  const doisSites = login(login(emptyLogins(), 'a@x.com').state, 'b@x.com', 0, 1, 'b.example').state;
  const esquecido = forgetSite(doisSites, 'a.example');
  eq('limpar site tira só as contas dele', [esquecido.accounts.map(a => a.host), esquecido.sites], [['b.example'], { 'b.example': 'b@x.com' }]);
  eq('próximo login no site limpo não é troca', recordLogin(esquecido, { host: 'a.example', email: 'z@x.com' }, 0, 1).switched, false);

  eq('host sem www', hostOf('https://www.svc.example/login?x=1'), 'svc.example');
  eq('página interna do Chrome não tem host', hostOf('chrome://settings/'), null);
  eq('e-mail válido', isValidEmail('a@b.co'), true);
  eq('e-mail longo demais', isValidEmail(`${'a'.repeat(250)}@b.co`), false);
}

async function loginForms() {
  const detect = (html, href = 'https://x.example/conta') => {
    const form = document.createElement('form');
    form.innerHTML = html;
    for (const i of form.querySelectorAll('input[data-v]')) i.value = i.dataset.v;
    return otpeekDetectLogin(form, href);
  };
  eq('e-mail com senha', detect('<input type="email" data-v="a@x.com"><input type="password" data-v="segredo123">'), 'a@x.com');
  eq('resultado nunca traz a senha', detect('<input type="password" data-v="s@x.com"><input type="email" data-v="a@x.com">'), 'a@x.com');
  eq('só a senha parecendo e-mail não é lida', detect('<input type="password" data-v="s@x.com"><button>Entrar</button>'), null);
  eq('passo só com e-mail e botão Continuar', detect('<input type="email" data-v="a@x.com"><button>Continuar</button>'), 'a@x.com');
  eq('campo de texto chamado username', detect('<input type="text" name="username" data-v="a@x.com"><input type="password">'), 'a@x.com');
  eq('URL de login sem botão reconhecível', detect('<input type="email" data-v="a@x.com">', 'https://x.example/signin'), 'a@x.com');
  eq('newsletter não é login', detect('<input type="email" data-v="a@x.com"><button>Assinar</button>'), null);
  eq('campo de texto qualquer é ignorado', detect('<input type="text" name="busca" data-v="a@x.com"><input type="password">'), null);
  eq('campo sem e-mail válido', detect('<input type="email" data-v="abc"><input type="password">'), null);
  eq('hidden é ignorado', detect('<input type="hidden" name="email" data-v="a@x.com"><input type="password">'), null);

  const sent = [];
  globalThis.chrome = { runtime: { sendMessage: m => sent.push(m) } };
  await import('../src/login-watch.js');
  const form = document.createElement('form');
  form.innerHTML = '<input type="email" value="vitima@x.com"><input type="password" value="s"><button>Entrar</button>';
  form.addEventListener('submit', e => e.preventDefault());
  document.body.append(form);
  form.querySelector('button').click();
  form.requestSubmit();
  form.querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  form.remove();
  delete globalThis.chrome;
  eq('clique, envio e Enter disparados pela página não viram aviso de login', sent, []);
}

async function codeFields() {
  const page = (html, host = location.hostname) => {
    const box = document.createElement('div');
    box.innerHTML = html;
    document.body.append(box);
    const events = [];
    box.addEventListener('input', e => events.push(e.target.name || e.target.id));
    let clicked = 0;
    box.querySelector('[data-submit]')?.addEventListener('click', e => { e.preventDefault(); clicked++; });
    const result = otpeekFillCode(box, '482913', host);
    const values = [...box.querySelectorAll('input')].map(i => i.value);
    box.remove();
    return { result, values, events, clicked };
  };
  eq('autocomplete one-time-code recebe o código', page('<input name="q"><input autocomplete="one-time-code" name="c">').values, ['', '482913']);
  eq('campo chamado código recebe e avisa a página', [page('<label>Código de verificação <input id="v"></label>').values, page('<input name="otp">').events], [['482913'], ['otp']]);
  eq('dígitos separados recebem um caractere cada', page('<div>' + '<input maxlength="1">'.repeat(6) + '</div>').values, ['4', '8', '2', '9', '1', '3']);
  eq('sem campo de código não preenche nada', page('<input name="busca" placeholder="Buscar"><input name="email">'), { result: { filled: false }, values: ['', ''], events: [], clicked: 0 });
  eq('cupom e senha não são campo de código', page('<input name="coupon_code"><input type="password" name="pin">').result.filled, false);
  eq('campo escondido ou desabilitado é ignorado', page('<input name="otp" style="display:none"><input name="code" disabled>').result.filled, false);
  const comBotao = page('<form><input name="otp"><button data-submit>Verificar</button></form>');
  eq('com um único botão de confirmar, só cola e não envia', [comBotao.result, comBotao.values, comBotao.clicked], [{ filled: true }, ['482913'], 0]);
  eq('página em outro host que o do login não recebe o código',
    page('<input autocomplete="one-time-code">', 'login.example'), { result: { filled: false }, values: [''], events: [], clicked: 0 });
}

async function versions() {
  eq('versão maior é nova', isNewer('v0.10.0', '0.9.0'), true);
  eq('mesma versão não é nova', isNewer('v0.9.0', '0.9.0'), false);
  eq('versão menor não é nova', isNewer('0.8.5', '0.9.0'), false);
  eq('tag inválida não é nova', isNewer('latest', '0.9.0'), false);
  eq('release válida', parseRelease({ tag_name: 'v1.2.3', html_url: 'https://github.com/asm444/otpeek/releases/tag/v1.2.3' }), { version: '1.2.3', url: 'https://github.com/asm444/otpeek/releases/tag/v1.2.3' });
  eq('link fora do repositório é recusado', parseRelease({ tag_name: 'v1.2.3', html_url: 'https://evil.example/x' }), null);
  eq('resposta sem tag é recusada', parseRelease({ message: 'Not Found' }), null);
}

await run([versions, codes, links, mime, fishAudio, predictus, formatos, logins, loginForms, codeFields]);
