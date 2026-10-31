export const RELEASES_API = 'https://api.github.com/repos/asm444/otpeek/releases/latest';

const parts = version => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  return m ? m.slice(1).map(Number) : null;
};

export function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function parseRelease(data) {
  const version = parts(data?.tag_name);
  const url = typeof data?.html_url === 'string' && data.html_url.startsWith('https://github.com/asm444/otpeek/') ? data.html_url : null;
  return version && url ? { version: version.join('.'), url } : null;
}
