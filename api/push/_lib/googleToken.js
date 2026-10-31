// Keyless Google sign-in for the alert sender: no service-account key file exists anywhere.
// Vercel gives each function call a short-lived identity token (OIDC). Google trusts it through a Workload Identity
// Pool (see docs/alerts-keyless-setup.md), swaps it for a short-lived token, and lets us act as the Firebase
// service account only to send notifications.
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export function keylessConfig(env) {
  const num = env.GCP_PROJECT_NUMBER, pool = env.GCP_WIF_POOL, provider = env.GCP_WIF_PROVIDER, sa = env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (!num || !pool || !provider || !sa) return null;
  return { num, pool, provider, sa };
}

// deps: { fetch }
export async function keylessAccessToken(oidcToken, env, deps) {
  const cfg = keylessConfig(env);
  if (!cfg) throw new Error('keyless sign-in is not configured');
  if (!oidcToken) throw new Error('no Vercel identity token');
  const f = deps.fetch;
  const sts = await f('https://sts.googleapis.com/v1/token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: `//iam.googleapis.com/projects/${cfg.num}/locations/global/workloadIdentityPools/${cfg.pool}/providers/${cfg.provider}`,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectToken: oidcToken,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    }),
  });
  if (!sts.ok) throw new Error('Google token exchange failed: HTTP ' + sts.status);
  const federated = (await sts.json()).access_token;
  const imp = await f(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(cfg.sa)}:generateAccessToken`, {
    method: 'POST', headers: { authorization: `Bearer ${federated}`, 'content-type': 'application/json' },
    body: JSON.stringify({ scope: [SCOPE] }),
  });
  if (!imp.ok) throw new Error('Google service-account access failed: HTTP ' + imp.status);
  return (await imp.json()).accessToken;
}
