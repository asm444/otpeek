# OTPeek

[Português](#português) · [English](#english)

---

## Português

O OTPeek mostra num popup os códigos de verificação e os links de confirmação que chegam no seu Gmail. Você copia com um clique, sem abrir o Gmail.

- Lê o e-mail inteiro, inclusive os já lidos.
- **Excluir** manda o e-mail para a lixeira do Gmail.
- Acompanha a conta que você escolher, e você troca de conta pelo e-mail no topo do popup.
- Processa tudo no seu navegador. O acesso fica só na memória do Chrome e some quando você fecha o navegador.

### 1. Instalar

1. Baixe o projeto com `git clone https://github.com/asm444/otpeek`, ou use *Code → Download ZIP* e descompacte.
2. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e escolha a pasta `otpeek`.
4. Fixe o ícone do OTPeek na barra do Chrome.

### 2. Criar o client ID do Google (uma vez só)

O Google libera o Gmail só para apps registrados. Você registra o seu em poucos minutos, de graça. O popup mostra estes mesmos passos, com links e um botão que copia o endereço de redirecionamento.

1. Entre no [Google Cloud](https://console.cloud.google.com/projectcreate) e crie um projeto. Qualquer nome serve, por exemplo `otpeek`.
2. Ative a [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) nesse projeto.
3. Abra a [tela de consentimento](https://console.cloud.google.com/auth/audience):
   - Preencha nome do app e seu e-mail.
   - Em **Público**, escolha **Externo**.
   - Em **Usuários de teste**, adicione cada e-mail do Gmail que o OTPeek vai acompanhar.
4. Crie um [ID do cliente OAuth](https://console.cloud.google.com/auth/clients/create):
   - Tipo: **Aplicativo da Web**.
   - Em **URIs de redirecionamento autorizados**, cole o endereço que o popup mostra. Ele tem esta forma: `https://ebceaflpcefmmgchplhcphdipkolebik.chromiumapp.org/`
5. Copie o **ID do cliente**, que termina em `.apps.googleusercontent.com`.
6. Clique no ícone do OTPeek, cole o ID e clique em **Salvar**.

Se o Google mudar o nome dos menus, procure por *APIs e serviços → Credenciais* e *Tela de consentimento OAuth*.

### 3. Entrar

1. No popup, clique em **Entrar com Google**.
2. Escolha a conta ou entre numa nova.
3. O Google avisa que o app não foi verificado. Isso é esperado, porque o app é seu e está em teste: clique em **Continuar**.
4. Autorize o acesso ao Gmail e ao seu perfil. O perfil serve só para mostrar a sua foto no topo do popup.

O popup mostra "Conectado a voce@gmail.com" e o ícone mostra **OK** em verde. A partir daí, cada código novo aparece no popup.

### Contas

- Clique no e-mail no topo do popup para ver as contas conectadas.
- Clique numa conta para acompanhá-la, ou em **Entrar com outra conta** para adicionar uma.
- O **×** ao lado da conta desconecta essa conta do OTPeek.

### Guardar a configuração

Atualizar a extensão não apaga nada. Removê-la apaga, então guarde a configuração num arquivo:

1. Em **Opções**, clique em **Salvar**, ao lado de **Arquivo de configuração**.
2. Salve `otpeek.config.json` na pasta `otpeek`.

Ao carregar a extensão de novo, o client ID, as contas e as opções voltam sozinhos. O arquivo tem o client ID e os seus e-mails, nunca o acesso ao Gmail, e o Git o ignora. Salve de novo depois de mudar algo: o arquivo não se atualiza sozinho. Se você apagar a pasta, copie o arquivo antes.

### Identificar logins nos sites (opcional)

Os códigos e links do Gmail chegam sem isto. Em **Opções**, ligue **Identificar logins nos sites** e aceite o acesso a todos os sites. Com isso:

- O OTPeek lê só o campo de e-mail do formulário de login, nunca a senha, e guarda qual e-mail você usa em cada site.
- Quando um código chega em até 5 minutos depois do login, o popup abre sozinho. O código é procurado em todas as caixas conectadas, o que cobre e-mails encaminhados.
- Se você entrar no mesmo site com outro e-mail, o anterior fica riscado no fim da lista **Contas nos sites**, durante o tempo que você escolher para aquele site. Depois, o risco sai.

A lista fica só neste Chrome e não vai para o arquivo de configuração, que guarda apenas a duração de cada site. Logins dentro de iframes não são identificados.

### Problemas comuns

- **"Erro 400: redirect_uri_mismatch"**: o endereço de redirecionamento no Google Cloud difere do que o popup mostra. Copie de novo pelo botão **Copiar** do popup.
- **"Acesso bloqueado" ou "app em teste"**: o e-mail não está em **Usuários de teste**. Adicione e tente de novo.
- **Pede para entrar de novo depois de um tempo**: acontece se você saiu da conta Google no Chrome. Clique em **Entrar com Google** e escolha a mesma conta.

### Testes

`bash tests/run.sh` roda as suítes no Chrome sem janela. Precisa de `google-chrome` e `python3`.

---

## English

OTPeek shows, in a popup, the verification codes and confirmation links that reach your Gmail. One click copies them, with Gmail closed.

- Reads the whole email, including read ones.
- **Excluir** (Delete) moves the email to the Gmail trash.
- Watches the account you pick, and you switch accounts through the email at the top of the popup.
- Processes everything in your browser. Access lives only in Chrome's memory and goes away when you close the browser.

### 1. Install

1. Get the project with `git clone https://github.com/asm444/otpeek`, or use *Code → Download ZIP* and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**, top right.
3. Click **Load unpacked** and pick the `otpeek` folder.
4. Pin the OTPeek icon to the Chrome toolbar.

### 2. Create the Google client ID (one time)

Google only opens Gmail to registered apps. You register yours in a few minutes, for free. The popup shows these same steps, with links and a button that copies the redirect address.

1. Go to [Google Cloud](https://console.cloud.google.com/projectcreate) and create a project. Any name works, for example `otpeek`.
2. Enable the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) in that project.
3. Open the [consent screen](https://console.cloud.google.com/auth/audience):
   - Fill in the app name and your email.
   - Under **Audience**, pick **External**.
   - Under **Test users**, add every Gmail address OTPeek will watch.
4. Create an [OAuth client ID](https://console.cloud.google.com/auth/clients/create):
   - Type: **Web application**.
   - Under **Authorized redirect URIs**, paste the address the popup shows. It looks like this: `https://ebceaflpcefmmgchplhcphdipkolebik.chromiumapp.org/`
5. Copy the **Client ID**, which ends in `.apps.googleusercontent.com`.
6. Click the OTPeek icon, paste the ID and click **Salvar** (Save).

If Google renames the menus, look for *APIs & Services → Credentials* and *OAuth consent screen*.

### 3. Sign in

1. In the popup, click **Entrar com Google** (Sign in with Google).
2. Pick an account or sign in with a new one.
3. Google warns that the app is unverified. That is expected, because the app is yours and in testing: click **Continue**.
4. Allow access to Gmail and to your profile. The profile is only used to show your photo at the top of the popup.

The popup shows "Conectado a you@gmail.com" (Connected) and the icon shows a green **OK**. From then on, every new code appears in the popup.

### Accounts

- Click the email at the top of the popup to see the connected accounts.
- Click an account to watch it, or **Entrar com outra conta** (Sign in with another account) to add one.
- The **×** next to an account disconnects it from OTPeek.

### Keep your configuration

Updating the extension erases nothing. Removing it does, so keep the configuration in a file:

1. In **Opções** (Options), click **Salvar** (Save) next to **Arquivo de configuração** (Configuration file).
2. Save `otpeek.config.json` in the `otpeek` folder.

When you load the extension again, the client ID, accounts and options come back on their own. The file holds the client ID and your email addresses, never Gmail access, and Git ignores it. Save again after changing something: the file does not update itself. If you delete the folder, copy the file first.

### Identify logins on sites (optional)

Gmail codes and links arrive without this. In **Opções** (Options), turn on **Identificar logins nos sites** and accept access to all sites. Then:

- OTPeek reads only the email field of the login form, never the password, and keeps which email you use on each site.
- When a code arrives within 5 minutes of the login, the popup opens by itself. It searches every connected mailbox, which covers forwarded email.
- If you sign in to the same site with another email, the previous one is struck through at the end of the **Contas nos sites** list for the time you pick for that site. Then the strike goes away.

The list stays in this Chrome and does not go to the configuration file, which keeps only each site's duration. Logins inside iframes are not identified.

### Common problems

- **"Error 400: redirect_uri_mismatch"**: the redirect address in Google Cloud differs from the one the popup shows. Copy it again with the popup's **Copiar** (Copy) button.
- **"Access blocked" or "app in testing"**: the email is missing from **Test users**. Add it and try again.
- **Asks you to sign in again after a while**: happens when you signed out of Google in Chrome. Click **Entrar com Google** and pick the same account.

### Tests

`bash tests/run.sh` runs the suites in headless Chrome. It needs `google-chrome` and `python3`.
