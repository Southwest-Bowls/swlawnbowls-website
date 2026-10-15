// Mailer (dryrun only) and renderers for entry emails. No network access.
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TPL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates');
const DEFAULT_PUBLIC_URL = 'https://swlawnbowls-website.vercel.app';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatMoney(cents, currency = 'USD') {
  if (!Number.isInteger(cents) || cents < 0) return '';
  const d = cents / 100;
  const s = cents % 100 === 0 ? String(d) : d.toFixed(2);
  return (currency === 'USD' ? '$' : currency + ' ') + s;
}

function publicUrl() {
  return (process.env.ENTRIES_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, '');
}

function teamLinesHtml(entry) {
  return (entry.players || [])
    .map((p) => esc([p.role, p.name].filter(Boolean).join(': ') + (p.club ? ` (${p.club})` : '')))
    .join('<br>');
}

function teamLinesText(entry) {
  return (entry.players || [])
    .map((p) => [p.role, p.name].filter(Boolean).join(': ') + (p.club ? ` (${p.club})` : ''))
    .join('\n');
}

function dateLabel(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return String(d);
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function paymentLabel(entry, variant) {
  if (variant === 'paid') return entry.method === 'paypal' ? 'Paid online with PayPal' : `Paid by ${entry.method}, received`;
  if (entry.method === 'cash') return 'Pay by cash: payment still needed';
  if (entry.method === 'check') return 'Pay by check: payment still needed';
  return 'Payment still needed';
}

function fill(tpl, map) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : ''));
}

async function loadTpl(name) {
  return readFile(path.join(TPL_DIR, name), 'utf8');
}

// renderConfirmation(entry, event, variant) -> { subject, html, text }
export async function renderConfirmation(entry, event, variant) {
  if (variant !== 'paid' && variant !== 'pending') throw new Error('variant must be paid or pending');
  const paid = variant === 'paid';
  const title = event?.title || '';
  const fee = formatMoney(entry.amountCents, entry.currency);
  const date = dateLabel(event?.date);
  const method = entry.method === 'cash' ? 'cash' : entry.method === 'check' ? 'check' : '';
  const issued = dateLabel(entry.paidAt && paid ? entry.paidAt : entry.createdAt);

  const intro = paid
    ? 'your entry is confirmed.'
    : 'we have your entry. Your place is held, but it is not confirmed until your payment is received.';
  const nextLines = [];
  if (!paid) {
    nextLines.push(method
      ? `You chose to pay by ${method}. The director will mark your entry as paid when your ${method} payment is received, and you will then be emailed a confirmation.`
      : 'The director will mark your entry as paid when your payment is received, and you will then be emailed a confirmation.');
  }
  nextLines.push('See the event page for the schedule and start time.');
  nextLines.push('If you need to withdraw, open your receipt in the app and tap Request withdrawal.');

  const receiptUrl = publicUrl();
  const map = {
    status_bg: paid ? '#e3f4e8' : '#fdf1d6',
    status_fg: paid ? '#14532d' : '#7a4a00',
    status_label: esc(paid ? 'Confirmed' : 'Payment pending'),
    event_title: esc(title),
    contact_name: esc(entry.contact?.name),
    intro_line: esc(intro),
    event_date: esc(date),
    venue: esc(event?.venue),
    team_lines: teamLinesHtml(entry),
    fee: esc(fee),
    payment_line: esc(paymentLabel(entry, variant)),
    receipt_number: esc(entry.id),
    issued_date: esc(issued),
    next_steps_html: nextLines.map((l) => `<p style="margin:0 0 8px;">${esc(l)}</p>`).join(''),
    receipt_url: esc(receiptUrl),
  };
  const html = fill(await loadTpl('entry-confirmation.html'), map);

  const rows = [
    ['Date', date], ['Venue', event?.venue], ['Entry fee', fee],
    ['Payment', paymentLabel(entry, variant)], ['Receipt number', entry.id],
  ].filter(([, v]) => v);
  const text = [
    `Hello ${entry.contact?.name || ''},`, '',
    intro.charAt(0).toUpperCase() + intro.slice(1), '',
    title, ...rows.map(([k, v]) => `${k}: ${v}`),
    'Team:', teamLinesText(entry), '',
    ...nextLines, '',
    `Receipt: ${receiptUrl}`, '',
    'Southwest Bowls Division of Bowls USA',
  ].join('\n');

  const subject = paid ? `You are entered: ${title}` : `Entry received for ${title}: payment still needed`;
  return { subject, html, text };
}

// renderTdNewEntry(entry, event) -> { subject, html, text }
export async function renderTdNewEntry(entry, event) {
  const title = event?.title || '';
  const pending = entry.status === 'pending_payment';
  const fee = formatMoney(entry.amountCents, entry.currency);
  const heading = pending ? 'New entry, payment pending' : 'New entry';
  const intro = pending
    ? `${entry.contact?.name || 'A player'} entered ${title} and chose to pay by ${entry.method === 'cash' ? 'cash' : 'check'}. The place is held as pending payment.`
    : `${entry.contact?.name || 'A player'} entered ${title}.`;
  const action = pending
    ? 'When the payment arrives, mark the entry as paid. The player is then emailed a confirmation.'
    : 'You do not need to do anything.';
  const payment = pending ? paymentLabel(entry, 'pending') : paymentLabel(entry, 'paid');
  const subject = pending ? `New entry, payment pending: ${title}` : `New entry: ${title}`;
  const html = fill(await loadTpl('td-new-entry.html'), {
    subject: esc(subject), heading: esc(heading), intro_line: esc(intro),
    event_title: esc(title), team_lines: teamLinesHtml(entry),
    contact_name: esc(entry.contact?.name), contact_email: esc(entry.contact?.email),
    fee: esc(fee), payment_line: esc(payment), entry_id: esc(entry.id), action_line: esc(action),
  });
  const text = [
    `${heading}: ${title}`, '', intro, '',
    'Entry:', teamLinesText(entry),
    `Submitted by: ${entry.contact?.name || ''}, ${entry.contact?.email || ''}`,
    `Amount: ${fee}`, `Payment: ${payment}`, `Entry number: ${entry.id}`, '', action,
  ].join('\n');
  return { subject, html, text };
}

// sendMail: dryrun appends to .outbox/mail.jsonl; live mode is not configured.
// While testing, every message is delivered ONLY to ENTRIES_TEST_RECIPIENT; the
// originally intended recipient is recorded as intendedTo but never used.
export async function sendMail({ to, subject, html, text }) {
  const mode = process.env.ENTRIES_MAIL_MODE || 'dryrun';
  if (mode !== 'dryrun') throw new Error('live mail not configured');
  const dir = process.env.ENTRIES_OUTBOX_DIR || path.join(process.cwd(), '.outbox');
  await mkdir(dir, { recursive: true });
  const record = {
    at: new Date().toISOString(),
    to: process.env.ENTRIES_TEST_RECIPIENT || null,
    intendedTo: to ?? null,
    subject, html, text,
  };
  await appendFile(path.join(dir, 'mail.jsonl'), JSON.stringify(record) + '\n');
  return { dryRun: true };
}
