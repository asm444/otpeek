export const CONFIG_FILE = 'otpeek.config.json';

const isEmail = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+$/.test(v);
const inRange = (min, max) => v => Number.isInteger(v) && v >= min && v <= max;

const VALID = {
  clientId: v => typeof v === 'string' && /^[\w-]+\.apps\.googleusercontent\.com$/.test(v),
  accounts: v => Array.isArray(v) && v.every(isEmail),
  photos: v => v && typeof v === 'object' && !Array.isArray(v)
    && Object.entries(v).every(([email, url]) => isEmail(email) && (url === null || (typeof url === 'string' && url.startsWith('https://')))),
  accountEmail: v => v === null || isEmail(v),
  enabled: v => typeof v === 'boolean',
  intervalSec: inRange(5, 120),
  scope: v => v === 'recent' || v === 'all',
  maxResults: inRange(5, 50),
  kinds: v => v && typeof v.codes === 'boolean' && typeof v.links === 'boolean',
  customDurations: v => Array.isArray(v) && v.every(inRange(60_000, 366 * 86_400_000)),
  siteDurations: v => v && typeof v === 'object' && !Array.isArray(v)
    && Object.values(v).every(inRange(1, 366 * 86_400_000)),
};

export function serializeConfig(settings) {
  const saved = Object.fromEntries(Object.keys(VALID).map(k => [k, settings[k]]));
  return JSON.stringify(saved, null, 2) + '\n';
}

export function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || !VALID.clientId(data.clientId)) return null;
  const patch = Object.fromEntries(Object.keys(VALID).filter(k => VALID[k](data[k])).map(k => [k, data[k]]));
  patch.accounts ??= [];
  if (!patch.accounts.includes(patch.accountEmail)) patch.accountEmail = patch.accounts[0] ?? null;
  return patch;
}
