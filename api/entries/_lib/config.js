// Env helpers. All take an optional env object so tests never touch process.env.

export const DEFAULT_PUBLIC_URL = 'https://swlawnbowls-website.vercel.app';

// PayPal sandbox only when HUB_PAYPAL_ENV is exactly "sandbox". Anything else is NOT sandbox
// (and callers must refuse to talk to PayPal at all unless this is true).
export function isSandbox(env = process.env) {
  return env.HUB_PAYPAL_ENV === 'sandbox';
}

// "live" only when ENTRIES_MAIL_MODE is exactly "live"; everything else is dryrun.
export function mailMode(env = process.env) {
  return env.ENTRIES_MAIL_MODE === 'live' ? 'live' : 'dryrun';
}

export function publicUrl(env = process.env) {
  const v = (env.ENTRIES_PUBLIC_URL || '').trim();
  return (v || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');
}

// During testing every notification goes only here. null when unset.
export function testRecipient(env = process.env) {
  const v = (env.ENTRIES_TEST_RECIPIENT || '').trim();
  return v || null;
}
