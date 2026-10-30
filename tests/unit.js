import { eq, run } from './harness.js';
import { decodeEntities, extract, findCode, htmlToText } from '../src/extract.js';
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

await run([codes, links, mime, fishAudio, predictus, formatos]);
