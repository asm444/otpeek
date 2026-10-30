import { eq, run } from './harness.js';
import { extract, findCode, htmlToText } from '../src/extract.js';
import { b64url, latin1, message } from './fixtures.js';
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

await run([codes, links, mime, fishAudio]);
