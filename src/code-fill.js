globalThis.otpeekFillCode = (() => {
  const CODE_HINT = /otp|one.?time|c[oó]digo|code|token|verifica|verify|pin|2fa|mfa|totp|sms/i;
  const NOT_CODE = /zip|postal|cep|promo|coupon|cupom|desconto|discount|search|busca|captcha|country|phone|telefone|e-?mail|user|senha|password/i;
  const NOT_SUBMIT = /reenvi|resend|novo c[oó]digo|new code|voltar|back|cancel/i;
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

  const submitButton = form => {
    const buttons = [...form.querySelectorAll('button, input[type=submit]')]
      .filter(b => b.type === 'submit' && !b.disabled && b.getClientRects().length > 0);
    return buttons.length === 1 && !NOT_SUBMIT.test(buttons[0].textContent || buttons[0].value) ? buttons[0] : null;
  };

  return (doc, code) => {
    const inputs = [...doc.querySelectorAll('input')].filter(usable);
    const split = splitFields(inputs, code.length);
    const field = split ? null : inputs.find(i => i.autocomplete === 'one-time-code') ?? inputs.find(isCodeField);
    if (split) [...code].forEach((char, i) => write(split[i], char));
    else if (field) write(field, code);
    else return { filled: false, submitted: false };
    const form = (field ?? split[0]).form;
    const button = form && submitButton(form);
    if (button) button.click();
    return { filled: true, submitted: Boolean(button) };
  };
})();
