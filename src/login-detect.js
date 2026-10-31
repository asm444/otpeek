globalThis.otpeekDetectLogin = (() => {
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]+$/;
  const FIELD_HINT = /e-?mail|user(name)?|login|identifier/i;
  const LOGIN_HINT = /log-?in|sign-?in|entrar|acessar|autentic|auth|continu/i;

  const isEmailField = input => input.type === 'email'
    || (input.type === 'text' && FIELD_HINT.test(`${input.name} ${input.id} ${input.autocomplete}`));

  const describes = (scope, href) => [
    href,
    scope.getAttribute?.('action') ?? '',
    ...[...scope.querySelectorAll('button, input[type=submit], [role=button]')].map(b => b.textContent || b.getAttribute('value') || ''),
  ].join(' ');

  return (scope, href) => {
    const inputs = [...scope.querySelectorAll('input')];
    const field = inputs.find(i => isEmailField(i) && EMAIL.test(i.value.trim()));
    if (!field) return null;
    const hasPassword = inputs.some(i => i.type === 'password');
    return hasPassword || LOGIN_HINT.test(describes(scope, href)) ? field.value.trim() : null;
  };
})();
