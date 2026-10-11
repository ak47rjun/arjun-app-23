/** Google OAuth 2.0 / OIDC (authorization code + PKCE + nonce). No third-party auth SDK needed. */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env, googleAuthConfigured } from '../env';
import { randomToken, sha256Hex } from '../crypto';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export const GOOGLE_STATE_COOKIE = 'arjun_oauth_state';
export const GOOGLE_NONCE_COOKIE = 'arjun_oauth_nonce';
export const GOOGLE_VERIFIER_COOKIE = 'arjun_oauth_verifier';

export function isGoogleConfigured(): boolean {
  return googleAuthConfigured;
}

export function buildGoogleAuthUrl(redirectUri: string) {
  const state = randomToken(24);
  const nonce = randomToken(24);
  const verifier = randomToken(48);
  const challenge = Buffer.from(sha256Hex(verifier), 'hex').toString('base64url');

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });

  const cookies = [
    `${GOOGLE_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    `${GOOGLE_NONCE_COOKIE}=${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
    `${GOOGLE_VERIFIER_COOKIE}=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  ];

  return { url: `${AUTH_URL}?${params.toString()}`, cookies };
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function exchangeGoogleCode(code: string, redirectUri: string, verifier: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const tokens = await res.json();
  if (!tokens.id_token) throw new Error('Google did not return an id_token');

  const JWKS = createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID,
  });

  return {
    sub: payload.sub as string,
    email: payload.email as string,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name as string | undefined,
    picture: payload.picture as string | undefined,
  };
}
