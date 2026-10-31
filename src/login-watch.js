(() => {
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

  document.addEventListener('submit', e => report(e.target), true);
  document.addEventListener('click', e => {
    const button = e.target.closest?.('button, input[type=submit], [role=button]');
    if (button) report(button);
  }, true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches?.('input')) report(e.target);
  }, true);
})();
