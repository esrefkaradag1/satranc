/** Lichess OAuth PKCE (Authorization Code + S256) — tarayıcı tarafı yardımcıları */

export const LICHESS_OAUTH_SCOPES = 'puzzle:read';
export const LICHESS_PKCE_STORAGE_KEY = 'netchess_lichess_pkce_v1';

export type LichessPkceSession = {
  codeVerifier: string;
  studentId: string;
  returnPath: string;
  createdAt: number;
};

const DEFAULT_CLIENT_ID = 'netchess-academy';

export function getLichessOAuthClientId(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LICHESS_OAUTH_CLIENT_ID;
  return (fromEnv ?? DEFAULT_CLIENT_ID).trim() || DEFAULT_CLIENT_ID;
}

export function getLichessOAuthRedirectUri(): string {
  const fromEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_LICHESS_OAUTH_REDIRECT_URI;
  if (fromEnv?.trim()) return fromEnv.trim();
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/lichess-oauth-callback.html`;
  }
  return '/lichess-oauth-callback.html';
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function generateCodeVerifier(): string {
  return randomString(64);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function savePkceSession(session: LichessPkceSession): void {
  sessionStorage.setItem(LICHESS_PKCE_STORAGE_KEY, JSON.stringify(session));
}

export function loadPkceSession(): LichessPkceSession | null {
  try {
    const raw = sessionStorage.getItem(LICHESS_PKCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LichessPkceSession;
    if (!parsed?.codeVerifier || !parsed?.studentId) return null;
    if (Date.now() - (parsed.createdAt ?? 0) > 15 * 60 * 1000) {
      sessionStorage.removeItem(LICHESS_PKCE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPkceSession(): void {
  sessionStorage.removeItem(LICHESS_PKCE_STORAGE_KEY);
}

export function buildLichessAuthorizeUrl(params: {
  codeChallenge: string;
  state: string;
  scope?: string;
}): string {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: getLichessOAuthClientId(),
    redirect_uri: getLichessOAuthRedirectUri(),
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    scope: params.scope ?? LICHESS_OAUTH_SCOPES,
    state: params.state,
  });
  return `https://lichess.org/oauth?${qs.toString()}`;
}

export async function startLichessOAuthFlow(studentId: string, returnPath = '#/ogrenci'): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = btoa(JSON.stringify({ studentId, t: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  savePkceSession({
    codeVerifier: verifier,
    studentId,
    returnPath,
    createdAt: Date.now(),
  });
  window.location.href = buildLichessAuthorizeUrl({ codeChallenge: challenge, state });
}
