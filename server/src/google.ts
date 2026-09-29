import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const SCOPES = ['openid', 'profile', 'email'];

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthUrl(state: string): string {
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  return client.generateAuthUrl({ access_type: 'online', scope: SCOPES, state });
}

export async function exchangeCode(code: string): Promise<string> {
  // Test seam: never touches Google's servers when stubbed.
  if (process.env.GOOGLE_TEST_SUB) return 'test-id-token';
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error('Google did not return an identity token.');
  return tokens.id_token;
}

export async function verifyIdentity(idToken: string): Promise<GoogleIdentity> {
  // Test seam: deterministic verified identity for the sandbox suite.
  if (process.env.GOOGLE_TEST_SUB) {
    return {
      sub: process.env.GOOGLE_TEST_SUB,
      email: process.env.GOOGLE_TEST_EMAIL ?? 'test.student@example.com',
      emailVerified: true,
      name: process.env.GOOGLE_TEST_NAME ?? 'Test Student'
    };
  }
  const cfg = googleConfig();
  if (!cfg) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const ticket = await client.verifyIdToken({ idToken, audience: cfg.clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('Google identity is incomplete.');
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    name: payload.name ?? ''
  };
}
