// Entry handlers: pure service functions + a tiny HTTP wrapper.
//
// Dependencies are injected: { store, paypal, mailer, now, random, ... }
//   store   - see store.js (getEvent, createEntry, getEntry, updateEntry, addPayment,
//             findEntryByOrderId, hasProcessedWebhook, markWebhookProcessed)
//   paypal  - { createOrder({entryId, amountCents, currency, description, requestId}) -> {id},
//               captureOrder(orderId, requestId) -> PayPal order JSON,
//               getOrder(orderId) -> PayPal order JSON,
//               verifyWebhook({headers, body}) -> {ok} }
//   mailer  - { sendMail({to,subject,html,text}) }
//   now()   - Date.now-like millis; random(n) -> Buffer of n random bytes
//   testRecipient - ENTRIES_TEST_RECIPIENT. Every notification goes ONLY there.
//   renderConfirmation(entry, event, variant) - optional; plain fallback used otherwise
//   feeToCents(text, unit, teamSize) - optional fallback when event.amountCents is missing
//   rateLimiter - optional { hit(key) -> {ok, retryAfterSec} }
// Store contract (appendNote, transitionEntry, idempotent addPayment, ...) is documented in store.js.
// event.amountCents is the total fee for one entry (already team-size aware, from feeToCents).
import crypto from 'node:crypto';

export class ServiceError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const METHODS = ['paypal', 'check', 'cash'];
const CURRENCY = 'USD';
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createRateLimiter({ limit = 10, windowMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map();
  return {
    hit(key) {
      const t = now();
      const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (t - recent[0])) / 1000) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}

// "60.00" -> 6000; anything else -> null
export function valueToCents(v) {
  if (typeof v === 'number') v = v.toFixed(2);
  if (typeof v !== 'string' || !/^\d{1,9}(\.\d{1,2})?$/.test(v.trim())) return null;
  const [w, f = ''] = v.trim().split('.');
  return parseInt(w, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
}

export function computeAmountCents(event, playerCount, feeToCents) {
  const unit = event.unit ? String(event.unit).toLowerCase() : null;
  if (Number.isInteger(event.amountCents) && event.amountCents > 0) return event.amountCents;
  if (typeof feeToCents === 'function' && event.feeText) {
    const c = feeToCents(event.feeText, unit, playerCount);
    if (Number.isInteger(c) && c > 0) return c;
  }
  return null;
}

// Open = flagged open, not cancelled/closed, and (when the event carries one) the entry deadline has not passed.
const isOpen = (event, deps) =>
  !!event &&
  event.open === true &&
  !['cancelled', 'closed'].includes(event.status) &&
  !(event.deadlineAt && deps.now() > Date.parse(event.deadlineAt));

// ---------- PayPal call wrapper ----------
// Every PayPal failure leaves here as a ServiceError: timeout -> 504 paypal_timeout, anything else -> 502 paypal_error.
// The PayPal issue names (ORDER_ALREADY_CAPTURED, ...) ride along on e.paypalIssues. No raw PayPal text reaches the browser.
export function paypalIssues(e) {
  return [...(e?.issues || []), ...(e?.paypal?.issues || []), e?.paypal?.name].filter(Boolean).map(String);
}
async function ppCall(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    if (e?.code === 'paypal_timeout' || e?.name === 'TimeoutError' || e?.name === 'AbortError' || e?.status === 504) {
      throw new ServiceError(504, 'paypal_timeout', 'PayPal did not answer in time, please try again');
    }
    const se = new ServiceError(502, 'paypal_error', 'PayPal could not complete the request');
    se.paypalIssues = paypalIssues(e);
    se.paypalStatus = e?.status;
    throw se;
  }
}

function requireToken(entry, token) {
  // Same error whether the entry is missing or the token is wrong.
  if (!entry || !safeEqual(entry.receiptToken, String(token ?? ''))) {
    throw new ServiceError(404, 'not_found', 'Entry not found');
  }
}

const iso = (deps) => new Date(deps.now()).toISOString();
const hasNote = (entry, prefix) => (entry.notes || []).some((n) => String(n).startsWith(prefix));
// Atomic append in the store (an identical note is never added twice).
async function addNote(deps, entry, note) {
  await deps.store.appendNote(entry.id, note);
}

// ---------- mail (all to the test recipient only) ----------

async function notify(deps, entry, { subject, html, text }) {
  if (!deps.testRecipient) return { skipped: true };
  try {
    await deps.mailer.sendMail({ to: deps.testRecipient, subject, html, text });
    return { sent: true };
  } catch {
    return { failed: true };
  }
}

async function renderEntryMail(deps, entry, event, variant) {
  if (typeof deps.renderConfirmation === 'function') {
    const r = await deps.renderConfirmation(entry, event, variant);
    if (typeof r === 'string') return { html: r, text: '' };
    if (r) return r;
  }
  const amount = `$${(entry.amountCents / 100).toFixed(2)}`;
  const names = entry.players.map((p) => esc(p.name)).join(', ');
  const body =
    variant === 'paid'
      ? `Your entry is confirmed.`
      : `Your spot is not confirmed until payment is received.`;
  return {
    html: `<p>${esc(event.title)}</p><p>Entry ${esc(entry.id)}: ${names}</p><p>Amount: ${esc(amount)}</p><p>${body}</p>`,
    text: `${event.title}\nEntry ${entry.id}\nAmount: ${amount}\n${body}`,
  };
}

async function sendPlayerMail(deps, entry, event, variant) {
  const m = await renderEntryMail(deps, entry, event, variant);
  const subject = m.subject || (variant === 'paid' ? `Entry confirmed ${entry.id}` : `Entry received ${entry.id}`);
  return notify(deps, entry, { subject, html: m.html, text: m.text });
}

async function sendDirectorNotice(deps, entry, event) {
  if (typeof deps.renderTdNewEntry === 'function') {
    const m = await deps.renderTdNewEntry(entry, event);
    if (m?.html) return notify(deps, entry, { subject: m.subject || `Pending ${entry.method} entry ${entry.id}`, html: m.html, text: m.text });
  }
  const amount = `$${(entry.amountCents / 100).toFixed(2)}`;
  const names = entry.players.map((p) => p.name).join(', ');
  return notify(deps, entry, {
    subject: `Pending ${entry.method} entry ${entry.id}`,
    html: `<p>New ${esc(entry.method)} entry for ${esc(event.title)}.</p><p>Entry ${esc(entry.id)}: ${esc(names)}</p><p>Amount due: ${esc(amount)}</p>`,
    text: `New ${entry.method} entry for ${event.title}.\nEntry ${entry.id}: ${names}\nAmount due: ${amount}`,
  });
}

// ---------- createEntry ----------

function validate(body, event) {
  const b = body && typeof body === 'object' ? body : {};
  const method = String(b.method || '');
  if (!METHODS.includes(method)) throw new ServiceError(422, 'bad_method', 'Choose paypal, check or cash');
  if (!Array.isArray(b.players) || b.players.length < 1 || b.players.length > 8) {
    throw new ServiceError(422, 'bad_players', 'Players are required');
  }
  const players = b.players.map((p) => {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (name.length < 2 || name.length > 100) throw new ServiceError(422, 'bad_name', 'Each player needs a name');
    return {
      role: typeof p.role === 'string' ? p.role.trim().slice(0, 40) : '',
      name,
      club: typeof p.club === 'string' ? p.club.trim().slice(0, 100) : '',
    };
  });
  const roles = Array.isArray(event.roles) ? event.roles.map(String) : [];
  // No roles = we do not know what a valid entry looks like (blank format, 2+2, rinks): not enterable online.
  if (!roles.length) throw new ServiceError(409, 'event_closed', 'Online entry is not available for this event');
  if (players.length !== roles.length) throw new ServiceError(422, 'bad_roles', 'Wrong number of players for this event');
  const want = [...roles].sort().join('|');
  const got = players.map((p) => p.role).sort().join('|');
  if (want !== got) throw new ServiceError(422, 'bad_roles', 'Player roles do not match this event');
  const c = b.contact || {};
  const contact = {
    name: typeof c.name === 'string' ? c.name.trim().slice(0, 100) : '',
    email: typeof c.email === 'string' ? c.email.trim().slice(0, 200) : '',
    phone: typeof c.phone === 'string' ? c.phone.trim().slice(0, 40) : '',
  };
  if (contact.name.length < 2) throw new ServiceError(422, 'bad_contact', 'Contact name is required');
  if (!EMAIL_RE.test(contact.email)) throw new ServiceError(422, 'bad_email', 'A valid email is required');
  return { method, players, contact };
}

const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const fingerprint = (method, contact, players) =>
  [method, contact.email.toLowerCase(), ...players.map((p) => p.name.toLowerCase().replace(/\s+/g, ' ')).sort()].join('|');

// A double submit (same event, method, contact email and player names, still unpaid, within 30 minutes)
// returns the existing entry instead of making a second one.
async function findDuplicate(deps, event, method, contact, players) {
  if (typeof deps.store.listEntries !== 'function') return null;
  const fp = fingerprint(method, contact, players);
  const since = deps.now() - DUPLICATE_WINDOW_MS;
  const list = await deps.store.listEntries(event.id);
  return (
    list.find((e) => {
      const live = e.status === 'pending_payment' || (event.free === true && e.status === 'confirmed');
      return live && Date.parse(e.createdAt) >= since && fingerprint(e.method, e.contact || { email: '' }, e.players || []) === fp;
    }) || null
  );
}

export async function createEntry(deps, body, { ip = 'unknown' } = {}) {
  if (deps.rateLimiter) {
    const r = deps.rateLimiter.hit(`create:${ip}`);
    if (!r.ok) {
      const e = new ServiceError(429, 'rate_limited', 'Too many entries, try again later');
      e.retryAfterSec = r.retryAfterSec;
      throw e;
    }
  }
  const eventId = typeof body?.eventId === 'string' ? body.eventId : '';
  const event = eventId ? await deps.store.getEvent(eventId) : null;
  if (!event) throw new ServiceError(404, 'event_not_found', 'Event not found');
  if (!isOpen(event, deps)) throw new ServiceError(409, 'event_closed', 'Entries are closed for this event');
  const { method, players, contact } = validate(body, event);
  // Any amount the browser sent is ignored. A free entry exists only when the event explicitly allows it.
  const free = event.free === true && event.amountCents === 0;
  const amountCents = free ? 0 : computeAmountCents(event, players.length, deps.feeToCents);
  if (amountCents == null) throw new ServiceError(422, 'fee_unavailable', 'The entry fee for this event is not set yet');

  const dup = await findDuplicate(deps, event, method, contact, players);
  if (dup) {
    return { id: dup.id, receiptToken: dup.receiptToken, status: dup.status, amountCents: dup.amountCents, currency: dup.currency || CURRENCY, duplicate: true };
  }

  const slug = String(event.id).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14) || 'EVENT';
  const year = new Date(deps.now()).getUTCFullYear();
  let id = null;
  for (let i = 0; i < 20 && !id; i++) {
    const n = deps.random(2).readUInt16BE(0) % 10000;
    const cand = `SWD-${year}-${slug}-${String(n).padStart(4, '0')}`;
    if (!(await deps.store.getEntry(cand))) id = cand;
  }
  if (!id) throw new ServiceError(503, 'id_unavailable', 'Try again');

  const ts = iso(deps);
  const entry = {
    id,
    eventId: event.id,
    status: free ? 'confirmed' : 'pending_payment',
    method,
    players,
    contact,
    amountCents,
    currency: CURRENCY,
    receiptToken: deps.random(24).toString('hex'),
    createdAt: ts,
    updatedAt: ts,
    paidAt: free ? ts : null,
    paypalOrderId: null,
    notes: free ? ['free_entry'] : [],
  };
  await deps.store.createEntry(entry);

  let mail = null;
  if (free) {
    mail = { player: await sendPlayerMail(deps, entry, event, 'paid') };
  } else if (method === 'check' || method === 'cash') {
    const a = await sendPlayerMail(deps, entry, event, 'pending');
    const b = await sendDirectorNotice(deps, entry, event);
    mail = { player: a, director: b };
  }
  return { id, receiptToken: entry.receiptToken, status: entry.status, amountCents, currency: CURRENCY, ...(mail ? { mail } : {}) };
}

// ---------- startPayment (PayPal order) ----------

export async function startPayment(deps, { entryId, receiptToken }) {
  const entry = await deps.store.getEntry(String(entryId || ''));
  requireToken(entry, receiptToken);
  if (entry.method !== 'paypal') throw new ServiceError(409, 'not_paypal', 'This entry is not paid by PayPal');
  if (entry.status !== 'pending_payment') throw new ServiceError(409, `entry_${entry.status}`, 'This entry cannot be paid now');
  const event = await deps.store.getEvent(entry.eventId);
  if (!isOpen(event, deps)) throw new ServiceError(409, 'event_closed', 'Entries are closed for this event');
  const amountCents = computeAmountCents(event, entry.players.length, deps.feeToCents);
  if (amountCents == null) throw new ServiceError(422, 'fee_unavailable', 'The entry fee is not set');

  if (entry.paypalOrderId && entry.amountCents === amountCents) {
    return { orderId: entry.paypalOrderId, amountCents, currency: CURRENCY, reused: true };
  }
  // Fee changed since the entry was made: re-price from our data and make a fresh order.
  // The request id includes the amount, so a re-priced order is never answered with the old one.
  const order = await ppCall(() =>
    deps.paypal.createOrder({
      entryId: entry.id,
      amountCents,
      currency: CURRENCY,
      description: String(event.title || 'Entry fee').slice(0, 120),
      requestId: `${entry.id}-${amountCents}`,
    }, { entry, event }),
  );
  if (!order?.id) throw new ServiceError(502, 'paypal_error', 'Could not start PayPal checkout');
  await deps.store.updateEntry(entry.id, { paypalOrderId: order.id, amountCents });
  await deps.store.addPayment({
    entryId: entry.id,
    paypalOrderId: order.id,
    paypalCaptureId: null,
    status: 'created',
    amountCents,
    currency: CURRENCY,
    method: 'paypal',
  });
  return { orderId: order.id, amountCents, currency: CURRENCY };
}

// ---------- verified capture -> entry ----------

function captureFromOrder(order) {
  const unit = order?.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  if (!cap) return null;
  return {
    id: cap.id,
    status: cap.status,
    amountCents: valueToCents(cap.amount?.value),
    currency: cap.amount?.currency_code,
    customId: cap.custom_id || unit.custom_id || null,
    orderId: order.id,
  };
}

// Records a capture. Confirms ONLY when status COMPLETED, exact amount+currency, and the
// entry is a pending PayPal entry. Callers must have verified the source with PayPal
// (signature-checked webhook, or a server-side getOrder read).
//
// Concurrency: the webhook, the status reconcile and the capture request can all arrive together.
//   * the entry is re-read here, never trusted from the caller;
//   * the payment row is idempotent on the capture id;
//   * pending_payment -> confirmed is a conditional update, so exactly one caller wins; only the
//     winner sends the paid email. A loser re-reads: our own `capture:` marker means "already done",
//     anything else means a different payment got there first and this one is flagged for review.
async function applyVerifiedCapture(deps, entryIn, cap, source) {
  if (!cap?.id) return { outcome: 'no_capture', entry: entryIn };
  if (cap.status !== 'COMPLETED') return { outcome: 'not_completed', entry: entryIn };
  let entry = (await deps.store.getEntry(entryIn.id)) || entryIn;
  if (hasNote(entry, `capture:${cap.id}`)) return { outcome: 'duplicate', entry };

  const exact = cap.amountCents === entry.amountCents && cap.currency === (entry.currency || CURRENCY);
  const sameOrder = !entry.paypalOrderId || !cap.orderId || entry.paypalOrderId === cap.orderId;
  let flag = null;
  if (!exact) flag = 'amount_mismatch';
  else if (!sameOrder) flag = 'order_mismatch';
  else if (entry.method !== 'paypal') flag = 'not_a_paypal_entry';
  else if (entry.status === 'confirmed') flag = 'duplicate_payment';
  else if (entry.status !== 'pending_payment') flag = `paid_after_${entry.status}`;

  // The capture request may already have written the payment row for this capture; this returns it.
  await deps.store.addPayment({
    entryId: entry.id,
    paypalOrderId: cap.orderId || null,
    paypalCaptureId: cap.id,
    status: flag ? 'flagged' : 'captured',
    amountCents: cap.amountCents,
    currency: cap.currency || null,
    method: 'paypal',
    source,
  });

  const flagIt = async (why, current) => {
    await deps.store.updatePayment(cap.id, { status: 'flagged' });
    await addNote(deps, current, `capture:${cap.id}`);
    await addNote(deps, current, `needs_review: ${why} (capture ${cap.id})`);
    return { outcome: 'flagged', flag: why, entry: (await deps.store.getEntry(entry.id)) || current };
  };
  if (flag) return flagIt(flag, entry);

  const paidAt = iso(deps);
  const won = await deps.store.transitionEntry(entry.id, 'pending_payment', { status: 'confirmed', paidAt }, { note: `capture:${cap.id}` });
  if (!won) {
    entry = (await deps.store.getEntry(entry.id)) || entry;
    if (hasNote(entry, `capture:${cap.id}`)) return { outcome: 'duplicate', entry };
    return flagIt(entry.status === 'confirmed' ? 'duplicate_payment' : `paid_after_${entry.status}`, entry);
  }
  await deps.store.updatePayment(cap.id, { status: 'paid' });
  // Paid email: only for the caller whose update changed the row, so it is sent once.
  const event = await deps.store.getEvent(won.eventId);
  if (event) await sendPlayerMail(deps, won, event, 'paid');
  return { outcome: 'confirmed', entry: won };
}

// ---------- captureAndRecord (browser asks; server never confirms here) ----------

export async function captureAndRecord(deps, { entryId, receiptToken, orderId }) {
  const entry = await deps.store.getEntry(String(entryId || ''));
  requireToken(entry, receiptToken);
  if (!entry.paypalOrderId || entry.paypalOrderId !== orderId) {
    throw new ServiceError(409, 'order_mismatch', 'Order does not belong to this entry');
  }
  if (entry.status === 'confirmed') return { status: 'confirmed', message: 'Already confirmed' };
  if (entry.status !== 'pending_payment') {
    throw new ServiceError(409, `entry_${entry.status}`, 'This entry cannot be paid now');
  }
  let order;
  try {
    order = await ppCall(() => deps.paypal.captureOrder(orderId, `${entry.id}-capture-${orderId}`));
  } catch (e) {
    const issues = e.paypalIssues || [];
    if (issues.includes('ORDER_ALREADY_CAPTURED')) {
      // Captured already (double click, or the webhook was first). Nothing to record here; the
      // receipt page's status check reads the order from PayPal and confirms from that.
      return { status: 'checking', message: 'This payment was already captured. We are checking it' };
    }
    if (issues.includes('INSTRUMENT_DECLINED')) {
      throw new ServiceError(422, 'payment_declined', 'PayPal declined this payment. Please choose another way to pay');
    }
    throw e;
  }
  const cap = captureFromOrder(order);
  // The entry may have changed while PayPal was working (webhook): look again before deciding anything.
  const cur = (await deps.store.getEntry(entry.id)) || entry;
  if (cap && cap.status === 'COMPLETED' && !hasNote(cur, `capture:${cap.id}`)) {
    const exact = cap.amountCents === cur.amountCents && cap.currency === (cur.currency || CURRENCY);
    // Idempotent on the capture id: if the webhook already wrote the row this returns it unchanged.
    await deps.store.addPayment({
      entryId: cur.id,
      paypalOrderId: orderId,
      paypalCaptureId: cap.id,
      status: exact ? 'captured' : 'flagged',
      amountCents: cap.amountCents,
      currency: cap.currency || null,
      method: 'paypal',
      source: 'capture',
    });
    if (!exact) await addNote(deps, cur, `needs_review: amount_mismatch (capture ${cap.id})`);
  }
  const fresh = await deps.store.getEntry(entry.id);
  // Never confirmed here: the webhook (or a status reconcile) does that.
  return { status: fresh.status === 'confirmed' ? 'confirmed' : 'checking', message: 'We are checking your payment' };
}

// ---------- reconcile ----------

export async function reconcileOrder(deps, entryOrId) {
  const entry = typeof entryOrId === 'string' ? await deps.store.getEntry(entryOrId) : entryOrId;
  if (!entry || !entry.paypalOrderId) return entry;
  const order = await ppCall(() => deps.paypal.getOrder(entry.paypalOrderId));
  const unitCustom = order?.purchase_units?.[0]?.custom_id;
  if (order?.id !== entry.paypalOrderId || (unitCustom && unitCustom !== entry.id)) return entry;
  const cap = captureFromOrder(order);
  if (cap && (!cap.customId || cap.customId === entry.id)) {
    await applyVerifiedCapture(deps, entry, { ...cap, customId: entry.id }, 'reconcile');
  }
  return deps.store.getEntry(entry.id);
}

// ---------- webhook ----------

export async function handleWebhook(deps, { headers = {}, body }) {
  let verdict;
  try {
    verdict = await deps.paypal.verifyWebhook({ headers, body });
  } catch {
    return { httpStatus: 500, body: { ok: false } };
  }
  if (!verdict?.ok) return { httpStatus: 400, body: { ok: false, error: 'bad_signature' } };

  const transmissionId = String(headers['paypal-transmission-id'] || body?.id || '');
  if (!transmissionId) return { httpStatus: 400, body: { ok: false, error: 'no_event_id' } };
  if (await deps.store.hasProcessedWebhook(transmissionId)) {
    return { httpStatus: 200, body: { ok: true, duplicate: true } };
  }
  try {
    if (body?.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const r = body.resource || {};
      const cap = {
        id: r.id,
        status: r.status,
        amountCents: valueToCents(r.amount?.value),
        currency: r.amount?.currency_code,
        orderId: r.supplementary_data?.related_ids?.order_id || null,
        customId: r.custom_id || null,
      };
      let entry = cap.customId ? await deps.store.getEntry(cap.customId) : null;
      if (!entry && !cap.customId && cap.orderId) entry = await deps.store.findEntryByOrderId(cap.orderId);
      if (entry) {
        await applyVerifiedCapture(deps, entry, cap, 'webhook');
      } else if (cap.status === 'COMPLETED' && cap.id) {
        // Money was captured for something we cannot match. Keep a record of it and answer 500 WITHOUT marking
        // the delivery processed, so PayPal retries and the payment is not silently lost. Someone must look.
        await deps.store.recordOrphanPayment({
          paypalCaptureId: cap.id,
          paypalOrderId: cap.orderId,
          customId: cap.customId,
          amountCents: cap.amountCents,
          currency: cap.currency || null,
          raw: { event_id: body.id || null, event_type: body.event_type },
        });
        return { httpStatus: 500, body: { ok: false, error: 'entry_not_found' } };
      }
    }
    await deps.store.markWebhookProcessed(transmissionId);
  } catch {
    return { httpStatus: 500, body: { ok: false } }; // not marked processed: PayPal retries
  }
  return { httpStatus: 200, body: { ok: true } };
}

// ---------- status ----------

// The receipt token should travel in the X-Receipt-Token header (URLs end up in logs, history and Referer headers).
// The ?token= query form still works for the receipt page for now; the header wins when both are present.
export function receiptTokenFrom(req, query) {
  const h = req?.headers?.['x-receipt-token'];
  const v = Array.isArray(h) ? h[0] : h;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return query?.token;
}

export async function getStatus(deps, { entryId, receiptToken }) {
  let entry = await deps.store.getEntry(String(entryId || ''));
  requireToken(entry, receiptToken);
  if (entry.status === 'pending_payment' && entry.method === 'paypal' && entry.paypalOrderId) {
    try {
      entry = await reconcileOrder(deps, entry);
    } catch {
      /* PayPal unreachable: report what we know */
    }
  }
  const event = await deps.store.getEvent(entry.eventId);
  return {
    id: entry.id,
    eventId: entry.eventId,
    eventTitle: event?.title || null,
    status: entry.status,
    method: entry.method,
    amountCents: entry.amountCents,
    currency: entry.currency,
    createdAt: entry.createdAt,
    paidAt: entry.paidAt || null,
    players: entry.players.map((p) => ({ role: p.role, name: p.name, club: p.club })),
  };
}

// ---------- HTTP glue ----------

let sharedStore = null;
let sharedLimiter = null;
export function resetSharedForTests() {
  sharedStore = null;
  sharedLimiter = null;
}

// Adapts the PayPal client to the service's paypal interface. requestId is passed through, so the
// PayPal-Request-Id header follows the amount (entry id + amountCents).
export function makePayPalAdapter(c) {
  return {
    createOrder: ({ entryId, amountCents, currency, requestId }, ctx) =>
      c.createOrder({ entry: { ...ctx.entry, id: entryId, amountCents, currency }, event: ctx.event, requestId }),
    captureOrder: (id) => c.captureOrder(id),
    getOrder: (id) => c.getOrder(id),
    verifyWebhook: async (a) => ({ ok: (await c.verifyWebhookSignature(a)) === true }),
  };
}

// Deployed (VERCEL or NODE_ENV=production) without Supabase config: refuse, unless ENTRIES_ALLOW_MEMORY_STORE=1.
// A per-instance memory store in a serverless deployment would lose entries and payments between calls.
export function memoryStoreAllowed(env) {
  const deployed = !!env.VERCEL || env.NODE_ENV === 'production';
  return !deployed || env.ENTRIES_ALLOW_MEMORY_STORE === '1';
}

export async function buildDeps(env = process.env, { now = () => Date.now() } = {}) {
  const [{ createMemoryStore, createSupabaseStore, createStaticEvents }, mailerMod] = await Promise.all([
    import('./store.js'),
    import('./mailer.js'),
  ]);
  if (!sharedStore) {
    // Events come from the website's own events-data.json, read fresh against the clock on every lookup.
    const eventSource = createStaticEvents({ now });
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      sharedStore = createSupabaseStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), { eventSource });
    } else if (memoryStoreAllowed(env)) {
      sharedStore = createMemoryStore({}, { eventSource });
    } else {
      throw new ServiceError(503, 'store_unavailable', 'Entries are temporarily unavailable');
    }
  }
  sharedLimiter ||= createRateLimiter();
  let paypal = null;
  // Sandbox only. Anything but the exact string "sandbox" means no PayPal at all.
  if (env.HUB_PAYPAL_ENV === 'sandbox') {
    const { createPayPalClient } = await import('./paypal.js');
    paypal = makePayPalAdapter(createPayPalClient({ env, fetch: globalThis.fetch }));
  }
  let renderConfirmation = mailerMod.renderConfirmation;
  let feeToCents;
  try {
    feeToCents = (await import('./fee.js')).feeToCents;
  } catch {
    /* optional */
  }
  return {
    store: sharedStore,
    paypal: paypal || {
      async createOrder() { throw new ServiceError(503, 'paypal_unavailable', 'PayPal is not available'); },
      async captureOrder() { throw new ServiceError(503, 'paypal_unavailable', 'PayPal is not available'); },
      async getOrder() { throw new ServiceError(503, 'paypal_unavailable', 'PayPal is not available'); },
      async verifyWebhook() { return { ok: false }; },
    },
    mailer: { sendMail: mailerMod.sendMail },
    renderConfirmation,
    renderTdNewEntry: mailerMod.renderTdNewEntry,
    feeToCents,
    rateLimiter: sharedLimiter,
    testRecipient: env.ENTRIES_TEST_RECIPIENT || '',
    now,
    random: (n) => crypto.randomBytes(n),
  };
}

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try {
    return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : b || '{}');
  } catch {
    throw new ServiceError(400, 'bad_json', 'Invalid JSON');
  }
}

// run(deps, body, req) -> JSON-able result | { httpStatus, body }
export async function handle(req, res, { method = 'POST', parse = true } = {}, run) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== method) {
      res.setHeader('Allow', method);
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const body = parse ? (method === 'GET' ? req.query || {} : parseBody(req)) : req.body;
    const deps = await buildDeps();
    const out = await run(deps, body, req);
    if (out && out.httpStatus) return res.status(out.httpStatus).json(out.body);
    return res.status(200).json(out);
  } catch (e) {
    if (e instanceof ServiceError) {
      if (e.retryAfterSec) res.setHeader('Retry-After', String(e.retryAfterSec));
      return res.status(e.status).json({ error: e.code, message: e.message });
    }
    return res.status(500).json({ error: 'server_error' }); // no details, no stack
  }
}

export const clientIp = (req) =>
  String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
