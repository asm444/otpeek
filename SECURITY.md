# Segurança do OTPeek

Este documento descreve o que o OTPeek protege, por onde ele pode ser atacado, o que já o defende e o que continua em aberto. Vale para a versão 0.11.7.

## O que está em jogo

O OTPeek lida com três coisas que valem para um atacante:

- **O acesso ao Gmail.** O token do Google permite ler e mover para a lixeira os e-mails de cada conta conectada.
- **Os códigos e links de confirmação.** Quem obtém um código dentro do prazo entra na conta do site que o enviou.
- **A lista de logins.** Com **Identificar logins nos sites** ligado, o OTPeek guarda qual e-mail você usa em cada site.

## De onde vem dado que não é confiável

| Origem | Quem controla | Onde entra |
|---|---|---|
| E-mail (remetente, assunto, corpo, links) | Qualquer pessoa que saiba o seu endereço | `src/gmail.js`, `src/mime.js`, `src/extract.js` |
| Página web, com a identificação de logins ligada | O dono do site e qualquer script que rode nele | `src/login-watch.js`, `src/login-detect.js`, `src/code-fill.js` |
| Resposta da API de releases do GitHub | O GitHub e quem publica no repositório | `src/version.js` |
| `otpeek.config.json` na pasta da extensão | Quem escreve nessa pasta | `src/config-file.js` |
| Resposta do perfil do Google (foto) | O Google | `src/auth.js` |

O popup e o service worker são as únicas partes confiáveis. Tudo o que vem da tabela acima é tratado como texto, nunca como código.

## Confidencialidade

### Código de um site entregue a outro site

**Vetor.** Uma página hostil convence você a clicar num botão de um formulário com um e-mail preenchido. O OTPeek registra aquilo como login. Em seguida, o atacante pede um código no seu banco, usando o seu e-mail. Se o OTPeek colasse na aba hostil o código que chegou, a página leria o código do banco.

**Defesa.** O código só é colado quando valem todas estas condições:

1. O login foi identificado há até 5 minutos, por gesto real seu (`isTrusted` e ativação recente em `src/login-watch.js`).
2. O remetente do e-mail é do mesmo domínio do site do login (`senderMatchesHost` em `src/logins.js`). Um código de `otp@banco.example` nunca vai para uma aba de `evil.example`.
3. A aba é a mesma em que o login foi identificado, e o documento confere o próprio host antes de escrever (`src/code-fill.js`).
4. O site não está em **Sites bloqueados**, e as opções **Identificar logins nos sites** e **Colar o código na página** estão ligadas.

A colagem roda só no frame principal, no mundo isolado da extensão, e não envia o formulário.

**Em aberto.**

- A comparação de domínio usa os dois últimos rótulos do nome, ou três em sufixos como `com.br`. Ela não conhece a lista pública de sufixos. Dois sites de donos diferentes sob um mesmo domínio de hospedagem (`a.github.io` e `b.github.io`, `x.firebaseapp.com` e `y.firebaseapp.com`) contam como o mesmo site. Bloqueie sites assim se você faz login neles.
- Um site que envia códigos por um domínio diferente do seu não recebe a colagem. O código aparece no popup, e você copia.
- Depois de colado, o código fica visível para todo script da página, inclusive os de terceiros que o site carrega. Isso vale para qualquer código digitado à mão.

### Token do Gmail

**Vetor.** Vazar o token para o disco, para uma página, para um log ou para o arquivo de configuração.

**Defesa.**

- O token fica em `chrome.storage.session`: memória do navegador, apagada quando o Chrome fecha. Nunca vai para `chrome.storage.local`.
- Ele só sai no cabeçalho `Authorization` de chamadas a `gmail.googleapis.com` e ao perfil do Google.
- O arquivo de configuração é montado por uma lista fechada de campos (`src/config-file.js`) e não tem token.
- Os scripts injetados nas páginas recebem só o código e o host, nunca o token.
- Trocar o client ID apaga todos os tokens.

**Em aberto.**

- O escopo é `gmail.modify`, o menor que permite mover para a lixeira. Ele também permite ler toda a caixa e alterar marcadores. Quem tomar o token dentro de uma hora tem esse alcance.
- O fluxo é o implícito (`response_type=token`), sem `state`. O retorno é interceptado pelo próprio Chrome em `chromiumapp.org`, e nenhuma página o recebe.
- **×** ao lado da conta apaga o token local e não o revoga no Google. Ele vence sozinho em até uma hora. Para cortar o acesso na hora, remova o app em [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Outra extensão ou programa com acesso ao perfil do Chrome em execução lê a memória de sessão. O OTPeek não defende contra software malicioso no seu computador.

### Lista de logins e área de transferência

- A lista de e-mails por site fica em `chrome.storage.local`, em texto simples, só neste Chrome. Ela não vai para o arquivo de configuração. **Limpar** e **Bloquear** a apagam por site.
- O OTPeek lê só o campo de e-mail do formulário, nunca a senha.
- O código copiado fica na área de transferência até você copiar outra coisa. Gerenciadores de área de transferência guardam o histórico.
- A foto do perfil é carregada só de `https://*.googleusercontent.com`, sem enviar `Referer`.

## Integridade

### Conteúdo de e-mail no popup

**Vetor.** Um e-mail com HTML, script ou link `javascript:` tenta executar código no popup, que tem acesso ao token.

**Defesa.**

- O popup escreve tudo com `textContent`. As duas únicas escritas com `innerHTML` (`popup/popup.js`) usam texto fixo, sem dado externo.
- Só links `http:` e `https:` são extraídos (`src/extract.js`). `javascript:`, `data:` e `vbscript:` são descartados.
- O manifesto não afrouxa a política de conteúdo. Vale a padrão do Manifest V3, que proíbe script inline e código remoto.

**Em aberto.** Qualquer remetente pode fazer um link aparecer com o botão **Abrir**, e um e-mail de phishing bem-feito parece um link de confirmação. O popup mostra o nome e o endereço do remetente. Confira antes de abrir.

### Login forjado pela página

**Vetor.** A página cria cliques e envios por script para registrar um login que você não fez.

**Defesa.** Eventos criados por script têm `isTrusted` falso e são ignorados. Mensagens vindas de página só são aceitas no tipo `loginDetected`; as demais ações (bloquear site, ligar opções, excluir e-mail) só aceitam o popup. O host do login vem do endereço da aba informado pelo Chrome, não do que a página diz. Não há `externally_connectable`, então outras extensões e sites não falam com o OTPeek.

**Em aberto.** Um clique ou Enter real seu num formulário montado pela página conta como login, com o e-mail que a página preencheu. O efeito é um e-mail falso na lista **Identificação de contas** daquele site e, na segunda vez, o popup abrindo. A página não recebe código de outro site, pela regra do remetente acima.

### Link de atualização

**Vetor.** Uma resposta adulterada da API de releases aponta o link do rodapé para outro lugar.

**Defesa.** O link é normalizado e só é aceito em `https://github.com/asm444/otpeek/` (`src/version.js`). Caminhos com `..` que sobem para outro repositório são recusados. A extensão não baixa nem executa a atualização: ela mostra o comando `git pull` e você o roda.

**Em aberto.** A atualização confia no repositório. Quem comprometer a conta do GitHub entrega código novo no próximo `git pull`.

### Arquivo de configuração

**Vetor.** Alguém troca o `otpeek.config.json` para apontar o OTPeek a um client ID próprio.

**Defesa.** O arquivo só é lido quando não há client ID salvo. Cada campo passa por validação de tipo e faixa. Um client ID alheio não ganha acesso sozinho: o Google ainda exige o seu consentimento na tela de login.

**Em aberto.** Quem escreve na pasta da extensão também troca o código dela. Proteja a pasta como protege qualquer programa instalado.

## Disponibilidade

### Enxurrada de e-mails e falha da API

**Vetor.** Milhares de e-mails em pouco tempo, ou o Gmail respondendo erro, fazem o OTPeek martelar a API até estourar a cota.

**Defesa.**

- A consulta incremental para em 500 mensagens. Acima disso, o OTPeek refaz a varredura inicial, que tem teto de 100 ou 500 e-mails.
- Cada falha seguida (erro da API, rede, login vencido) dobra o intervalo entre consultas, até 5 minutos. O primeiro sucesso volta ao intervalo normal.
- Só uma consulta roda por vez.
- O corpo de cada e-mail é cortado em 256 mil caracteres antes da extração.
- Têm teto: e-mails já vistos (2000), resultados (até 50, conforme a opção), contas por site (200), sites bloqueados (500) e durações próprias (20).

**Em aberto.**

- O corpo é decodificado inteiro antes do corte. Um e-mail muito grande custa memória por um instante.
- O Chrome encerra o service worker ocioso. Um alarme o religa a cada 30 segundos, então um código pode demorar esse tempo a mais.
- O OTPeek depende do Gmail e da sua sessão no Google. Sem eles, mostra o erro e pede novo login.

### Popup aberto por e-mail

Qualquer e-mail com cara de código abre o popup. Um remetente insistente consegue abri-lo várias vezes. Desligue **Códigos** nas opções ou pause o acompanhamento se isso acontecer.

## Permissões

| Permissão | Para quê |
|---|---|
| `identity` | Login no Google |
| `storage` | Opções, lista de logins e estado da sessão |
| `alarms` | Religar a consulta quando o Chrome encerra o service worker |
| `downloads` | Salvar o arquivo de configuração |
| `scripting` | Identificar logins e colar o código |
| `gmail.googleapis.com`, perfil do Google | Ler e-mails e mostrar a foto |
| Todos os sites (opcional) | Só com **Identificar logins nos sites** ligado. Vem desligado |

O campo `key` do manifesto é uma chave pública. Ela fixa o ID da extensão e, com ele, o endereço de redirecionamento do login. Não é segredo.

## Como conferir

`bash tests/run.sh` roda as suítes. Estes casos cobrem as defesas acima:

- `código de remetente de outro site não vai para a aba do login`
- `sufixo em comum não é o mesmo site`
- `link que sobe para outro repositório é recusado`
- `history sem fim para em 5 páginas e refaz a varredura`
- `recuo tem teto de 5 minutos`

As suítes simulam a API do Chrome. O isolamento entre a página e o script injetado, e a política de conteúdo, são garantidos pelo Chrome e não são exercitados por elas.

## Relatar uma falha

Abra um aviso privado em [Security → Report a vulnerability](https://github.com/asm444/otpeek/security/advisories/new). Se a opção não estiver disponível, abra uma issue pedindo um canal privado, sem os detalhes da exploração.
