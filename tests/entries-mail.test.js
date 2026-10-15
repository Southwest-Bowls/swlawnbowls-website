import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sendMail, renderConfirmation, renderTdNewEntry } from '../api/entries/_lib/mailer.js';

const event = { id: 'e1', title: 'Spring <b>Pairs</b>', date: '2026-04-18', venue: 'Desert Club', amountCents: 6000, currency: 'USD' };
const entry = {
  id: 'SWD-2026-SPRING-1234', eventId: 'e1', status: 'pending_payment', method: 'check',
  players: [{ role: 'Lead', name: '<script>alert(1)</script>', club: 'A&B Club' }, { role: 'Skip', name: 'Ann', club: 'X' }],
  contact: { name: '<script>x</script>', email: 'a@b.c', phone: '1' },
  amountCents: 6000, currency: 'USD', createdAt: '2026-03-01T10:00:00Z', paidAt: null,
};

test('escapes hostile values in html', async () => {
  for (const r of [await renderConfirmation(entry, event, 'pending'), await renderTdNewEntry(entry, event)]) {
    assert.ok(!r.html.includes('<script>'));
    assert.ok(!r.html.includes('<b>Pairs'));
    assert.ok(r.html.includes('&lt;script&gt;'));
    assert.ok(!/\{\{\w+\}\}/.test(r.html));
  }
});

test('pending variant: check and cash wording, no invented claims', async () => {
  const c = await renderConfirmation(entry, event, 'pending');
  assert.match(c.subject, /payment still needed/);
  assert.match(c.text, /pay by check/);
  assert.match(c.text, /not confirmed until/);
  assert.match(c.text, /\$60/);
  const cash = await renderConfirmation({ ...entry, method: 'cash' }, event, 'pending');
  assert.match(cash.text, /pay by cash/);
  assert.doesNotMatch(c.text + c.html, /30 minutes|arrive|\bdraw\b/i);
});

test('paid variant', async () => {
  const p = await renderConfirmation({ ...entry, status: 'confirmed', method: 'paypal', paidAt: '2026-03-02T00:00:00Z' }, event, 'paid');
  assert.equal(p.subject, 'You are entered: Spring <b>Pairs</b>');
  assert.match(p.text, /confirmed/);
  assert.match(p.html, /Paid online with PayPal/);
  assert.doesNotMatch(p.text, /not confirmed until/);
  await assert.rejects(() => renderConfirmation(entry, event, 'x'));
});

test('dryrun writes outbox and routes to test recipient only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'outbox-'));
  Object.assign(process.env, { ENTRIES_OUTBOX_DIR: dir, ENTRIES_TEST_RECIPIENT: 'test@example.com' });
  delete process.env.ENTRIES_MAIL_MODE;
  const r = await sendMail({ to: 'director@example.com', subject: 's', html: '<p>h</p>', text: 't' });
  assert.deepEqual(r, { dryRun: true });
  const rec = JSON.parse((await readFile(path.join(dir, 'mail.jsonl'), 'utf8')).trim());
  assert.equal(rec.to, 'test@example.com');
  assert.equal(rec.intendedTo, 'director@example.com');
});

test('live mode refuses', async () => {
  process.env.ENTRIES_MAIL_MODE = 'live';
  await assert.rejects(() => sendMail({ to: 'a@b.c', subject: 's', html: '', text: '' }), /live mail not configured/);
  delete process.env.ENTRIES_MAIL_MODE;
});
