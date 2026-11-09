  let lastEmail = null;
  let lastAt = 0;

  const report = target => {
    const scope = target.closest?.('form') || document;
    const email = globalThis.otpeekDetectLogin(scope, location.href);
    if (!email || (email === lastEmail && Date.now() - lastAt < 5000)) return;
    lastEmail = email;
    lastAt = Date.now();
    chrome.runtime.sendMessage({ type: 'loginDetected', email });
  };

  // Só o gesto real do usuário conta, senão a página forjaria um login e receberia o código
  // colado. Clique e tecla criados pela página têm isTrusted false; o submit de requestSubmit()
  // chega com isTrusted true, e para ele o sinal é a ativação recente por gesto real.
  document.addEventListener('submit', e => navigator.userActivation.isActive && report(e.target), true);
  document.addEventListener('click', e => {
    const button = e.isTrusted && e.target.closest('button, input[type=submit], [role=button]');
    if (button) report(button);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.isTrusted && e.key === 'Enter' && e.target.matches('input')) report(e.target);
  }, true);
