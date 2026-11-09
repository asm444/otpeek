globalThis.otpeekFillCode = (() => {
  const CODE_HINT = /otp|one.?time|c[oó]digo|code|token|verifica|verify|pin|2fa|mfa|totp|sms/i;
  const NOT_CODE = /zip|postal|cep|promo|coupon|cupom|desconto|discount|search|busca|captcha|country|phone|telefone|e-?mail|user|senha|password/i;
  const FILLABLE = new Set(['', 'text', 'tel', 'number']);

  const usable = input => FILLABLE.has(input.getAttribute('type')?.toLowerCase() ?? '')
    && !input.disabled && !input.readOnly && input.getClientRects().length > 0;

  const describe = input => [
    input.name, input.id, input.placeholder, input.autocomplete,
    input.getAttribute('aria-label'), ...[...(input.labels ?? [])].map(l => l.textContent),
  ].join(' ');

  const isCodeField = input => CODE_HINT.test(describe(input)) && !NOT_CODE.test(describe(input));

  const write = (input, value) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const splitFields = (inputs, length) => {
    const single = inputs.filter(i => i.maxLength === 1);
    const groups = new Map();
    for (const input of single) groups.set(input.parentElement, [...(groups.get(input.parentElement) ?? []), input]);
    for (const group of groups.values()) if (group.length === length) return group;
    return single.length === length ? single : null;
  };

  // A conferência do host roda no próprio documento que recebe o código, então uma navegação
  // da aba entre o aviso de login e a colagem não leva o código para outro site.
  return (doc, code, host) => {
    if (location.hostname.replace(/^www\./, '') !== host) return { filled: false };
    const inputs = [...doc.querySelectorAll('input')].filter(usable);
    const split = splitFields(inputs, code.length);
    const field = split ? null : inputs.find(i => i.autocomplete === 'one-time-code') ?? inputs.find(isCodeField);
    if (split) [...code].forEach((char, i) => write(split[i], char));
    else if (field) write(field, code);
    return { filled: Boolean(split || field) };
  };
})();
