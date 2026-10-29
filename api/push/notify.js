import { google } from 'googleapis';
import { notify, secretOk } from './_lib/notify.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const env = process.env;
  if (!env.NOTIFY_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { res.status(503).json({ error: 'alerts are not set up' }); return; }
  if (!secretOk(req.headers['x-notify-secret'], env.NOTIFY_SECRET)) { res.status(401).json({ error: 'not allowed' }); return; }
  try {
    const accessToken = async () => {
      const key = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      const jwt = new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
      return (await jwt.getAccessToken()).token;
    };
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const out = await notify(body && body.notifications, { env: { ...env, FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID }, fetch, accessToken });
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: 'could not send alerts' });
  }
}
