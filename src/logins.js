const MAX_ACCOUNTS = 200;

export const emptyLogins = () => ({ sites: {}, accounts: [] });

export function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function recordLogin(state, { host, email }, durationMs, now) {
  const address = email.toLowerCase();
  const current = state.sites[host];
  if (current === address) return { state, switched: false, needsDuration: false };

  const isTarget = a => a.host === host && (a.email === address || a.email === current);
  const accounts = state.accounts.filter(a => !isTarget(a));
  const firstStruck = accounts.findIndex(a => a.struck);
  const entry = { host, email: address, struck: false, until: null };
  accounts.splice(firstStruck < 0 ? accounts.length : firstStruck, 0, entry);

  const switched = Boolean(current) && current !== address;
  if (switched) accounts.push({ host, email: current, struck: true, until: durationMs ? now + durationMs : null });

  const sites = { ...state.sites, [host]: address };
  for (const dropped of accounts.splice(0, Math.max(0, accounts.length - MAX_ACCOUNTS))) {
    if (sites[dropped.host] === dropped.email) delete sites[dropped.host];
  }
  return { state: { sites, accounts }, switched, needsDuration: switched && !durationMs };
}

export function applyDuration(state, host, durationMs, now) {
  return {
    ...state,
    accounts: state.accounts.map(a => (a.host === host && a.struck && a.until === null ? { ...a, until: now + durationMs } : a)),
  };
}

export function expireReminders(state, now) {
  if (!state.accounts.some(a => a.struck && a.until !== null && a.until <= now)) return state;
  return {
    ...state,
    accounts: state.accounts.map(a => (a.struck && a.until !== null && a.until <= now ? { ...a, struck: false, until: null } : a)),
  };
}
