const SCOPE = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.profile';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';

export class AuthError extends Error {}

function authUrl(clientId, email, interactive) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: interactive ? 'select_account' : 'none',
  });
  if (email) params.set('login_hint', email);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// O token volta no fragmento da URL de redirecionamento. Com interactive false e prompt=none, o
// Google so devolve token quando a sessao e o consentimento ja existem; sem eles, devolve erro.
export async function authorize(clientId, { email = null, interactive }) {
  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: authUrl(clientId, email, interactive), interactive });
  } catch (e) {
    throw new AuthError(e.message || String(e));
  }
  const params = new URLSearchParams(new URL(redirect).hash.slice(1));
  if (params.get('error')) throw new AuthError(params.get('error'));
  const token = params.get('access_token');
  if (!token) throw new AuthError('O Google não devolveu o acesso.');
  return { token, expiresAt: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000 };
}

export async function profilePhoto(token) {
  try {
    const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const { picture } = await res.json();
    return typeof picture === 'string' && picture.startsWith('https://') ? picture : null;
  } catch {
    return null;
  }
}
