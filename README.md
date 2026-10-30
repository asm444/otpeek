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
4. Autorize o acesso ao Gmail.

O popup mostra "Conectado a voce@gmail.com" e o ícone mostra **OK** em verde. A partir daí, cada código novo aparece no popup.

### Contas

- Clique no e-mail no topo do popup para ver as contas conectadas.
- Clique numa conta para acompanhá-la, ou em **Entrar com outra conta** para adicionar uma.
- O **×** ao lado da conta desconecta essa conta do OTPeek.

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
4. Allow access to Gmail.

The popup shows "Conectado a you@gmail.com" (Connected) and the icon shows a green **OK**. From then on, every new code appears in the popup.

### Accounts

- Click the email at the top of the popup to see the connected accounts.
- Click an account to watch it, or **Entrar com outra conta** (Sign in with another account) to add one.
- The **×** next to an account disconnects it from OTPeek.

### Common problems

- **"Error 400: redirect_uri_mismatch"**: the redirect address in Google Cloud differs from the one the popup shows. Copy it again with the popup's **Copiar** (Copy) button.
- **"Access blocked" or "app in testing"**: the email is missing from **Test users**. Add it and try again.
- **Asks you to sign in again after a while**: happens when you signed out of Google in Chrome. Click **Entrar com Google** and pick the same account.

### Tests

`bash tests/run.sh` runs the suites in headless Chrome. It needs `google-chrome` and `python3`.
