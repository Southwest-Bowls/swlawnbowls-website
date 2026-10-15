// Entry store. createMemoryStore is the tested reference; createSupabaseStore is a DRAFT mapping to
// docs/entries/02-schema.sql and has never been executed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { feeToCents } from './fee.js';

const clone = (v) => (v === undefined || v === null ? v : structuredClone(v));

// ---------------------------------------------------------------- event loading
const FORMAT_ROLES = {
  singles: ['Player'],
  pairs: ['Skip', 'Lead'],
  triples: ['Skip', 'Vice', 'Lead'],
  fours: ['Skip', 'Vice', 'Second', 'Lead'],
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Last day of the event as a UTC Date (end of that day), or null when the text has no usable date.
export function parseEventEndDate(text) {
  if (typeof text !== 'string') return null;
  const ym = text.match(/\b(20\d{2})\b/);
  if (!ym) return null;
  const year = Number(ym[1]);
  let best = null;
  const re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?/gi;
  let m;
  while ((m = re.exec(text))) {
    const mon = MONTHS.indexOf(m[1].toLowerCase());
    const day = Number(m[3] || m[2]);
    const d = new Date(Date.UTC(year, mon, day, 23, 59, 59));
    if (d.getUTCMonth() === mon && (!best || d > best)) best = d;
  }
  return best;
}

export function eventRoles(raw) {
  const labels = raw?.paypal?.playerLabels;
  if (Array.isArray(labels) && labels.length) return labels.map(String);
  return [...(FORMAT_ROLES[raw?.format] || [])]; // 2+2, rinks, blank: [] (needs a human rule)
}

// ---- date parsing that mirrors assets/app/app.js (parseDates / deadlineDate), read-only copy ----
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE_SRC = '(' + MONTH_NAMES.join('|') + '|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\\.?\\s+(\\d{1,2})(?:\\s*[\\u2013\\u2014-]\\s*(\\d{1,2})\\b(?!\\s*:))?';
const pad2 = (n) => String(n).padStart(2, '0');

// "Saturday–Sunday, July 18–19, 2026" -> { start: '2026-07-18', end: '2026-07-19' } or null
export function parseDates(text) {
  const s = String(text || '');
  const y = s.match(/\b(20\d{2})\b/);
  if (!y) return null;
  const year = Number(y[1]);
  const re = new RegExp(MONTH_RE_SRC, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(s))) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi < 0) continue;
    hits.push(`${year}-${pad2(mi + 1)}-${pad2(Number(m[2]))}`);
    if (m[3]) hits.push(`${year}-${pad2(mi + 1)}-${pad2(Number(m[3]))}`);
  }
  if (!hits.length) return null;
  hits.sort();
  return { start: hits[0], end: hits[hits.length - 1] };
}

// The entry deadline as 'YYYY-MM-DD', only when the text really states one (same rules as the app).
export function deadlineDate(raw) {
  let t = String(raw?.deadline || '');
  const dates = parseDates(raw?.date);
  if (!t || !dates) return null;
  const key = /(deadline|last date|received by|close[sd]?\b|no later than|\bby\b)/i.exec(t);
  if (key) t = t.slice(key.index);
  else if (/\b(open|opens|limited|capped)\b/i.test(t)) return null;
  if (!/\b20\d{2}\b/.test(t)) t += ' ' + dates.start.slice(0, 4);
  const d = parseDates(t);
  return d ? d.start : null;
}

// Entries close at the end of the deadline day, California time (taken as UTC-8, so up to 1 hour late in summer).
export function deadlineClosesAt(raw) {
  const d = deadlineDate(raw);
  if (!d) return null;
  const [y, mo, da] = d.split('-').map(Number);
  const ms = Date.UTC(y, mo - 1, da, 23, 59, 59) + 8 * 3600 * 1000;
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function normalizeEvent(raw, now = new Date()) {
  const roles = eventRoles(raw);
  const teamSize = roles.length || null;
  const explicitUnit = raw.feeUnit || null;
  const amountCents = feeToCents(raw.fee, explicitUnit, teamSize);
  const end = parseEventEndDate(raw.date);
  const cancelled =
    raw.status === 'cancelled' ||
    /cancel/i.test(`${raw.title || ''} ${raw.alertLabel || ''} ${raw.alert || ''}`);
  const upcoming = !!end && end >= now;
  const closesAt = deadlineClosesAt(raw);
  // Like the app: a passed deadline closes entries unless the event is explicitly marked entriesStatus "open".
  const deadlinePassed = !!closesAt && now > closesAt && raw.entriesStatus !== 'open';
  // A free event takes entries only when the data explicitly says freeEntry: true.
  const free = amountCents === 0 && raw.freeEntry === true;
  const feeOk = (Number.isInteger(amountCents) && amountCents > 0) || free;
  const status = cancelled ? 'cancelled' : !upcoming ? 'completed' : deadlinePassed ? 'closed' : 'entries_open';
  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    venue: raw.club?.name || null,
    feeText: raw.fee || '',
    amountCents,
    free,
    unit: explicitUnit,
    format: raw.format || '',
    roles,
    deadlineAt: closesAt && raw.entriesStatus !== 'open' ? closesAt.toISOString() : null,
    // open: upcoming, not cancelled, deadline not passed, a usable fee, and a known set of roles
    open: upcoming && !cancelled && !deadlinePassed && feeOk && roles.length > 0,
    status,
  };
}

const DEFAULT_EVENTS_PATH = fileURLToPath(new URL('../../../events-data.json', import.meta.url));

export function loadEvents({ path = DEFAULT_EVENTS_PATH, now = new Date(), raw } = {}) {
  const data = raw || JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(data) ? data : data.events || [];
  return list.map((e) => normalizeEvent(e, now));
}

// Events straight from events-data.json, normalized against the current time on every lookup
// (so a long-lived function instance never serves a stale "open" flag).
export function createStaticEvents({ path = DEFAULT_EVENTS_PATH, now = () => Date.now(), raw } = {}) {
  let list = null;
  const load = () => {
    if (!list) {
      const data = raw || JSON.parse(readFileSync(path, 'utf8'));
      list = Array.isArray(data) ? data : data.events || [];
    }
    return list;
  };
  return {
    async getEvent(id) {
      const r = load().find((e) => e.id === id);
      return r ? normalizeEvent(r, new Date(now())) : null;
    },
  };
}

// ---------------------------------------------------------------- store contract
// Both stores implement (all async):
//   getEvent(id) -> event | null
//   createEntry(e) -> entry                     (throws if the id exists)
//   getEntry(id) -> entry | null
//   updateEntry(id, patch) -> entry             (unconditional; a `notes` array is appended note by note)
//   transitionEntry(id, fromStatus, patch, {note}) -> entry | null
//        conditional update: applies patch (and appends `note`) ONLY if the entry's status is currently
//        `fromStatus`; returns null when nothing changed. This is the confirm-once guard.
//   appendNote(id, note) -> {added, entry}      (a note that already exists is not added twice)
//   addPayment(p) -> row                        idempotent: the same paypalCaptureId returns the existing row;
//        a capture for an order whose 'created' row has no capture yet fills in that row (payments.paypal_order_id is UNIQUE)
//   updatePayment(captureId, patch) -> row | null
//   listPayments(entryId?) -> rows
//   recordOrphanPayment(rec) -> {recorded}      a verified capture that matches no entry (idempotent on capture id)
//   listOrphanPayments() -> rows
//   findEntryByOrderId, listEntries(eventId), hasProcessedWebhook(id), markWebhookProcessed(id)

// ---------------------------------------------------------------- memory store
export function createMemoryStore(seed = {}, { eventSource = null } = {}) {
  const events = new Map((seed.events || []).map((e) => [e.id, clone(e)]));
  const entries = new Map((seed.entries || []).map((e) => [e.id, clone(e)]));
  const payments = [...(seed.payments || [])].map(clone);
  const orphans = [...(seed.orphans || [])].map(clone);
  const webhooks = new Set(seed.webhooks || []);
  let paySeq = payments.length;

  const touch = (cur, patch) => {
    const { id: _ignore, createdAt: _c, notes: _n, ...rest } = clone(patch || {});
    return { ...cur, ...rest, updatedAt: new Date().toISOString() };
  };

  const api = {
    async getEvent(id) {
      const e = clone(events.get(id));
      if (e) return e;
      return eventSource ? eventSource.getEvent(id) : null;
    },
    async createEntry(e) {
      if (!e || !e.id) throw new Error('entry id required');
      if (entries.has(e.id)) throw new Error(`entry ${e.id} already exists`);
      const now = new Date().toISOString();
      const row = { notes: [], paidAt: null, paypalOrderId: null, ...clone(e) };
      row.createdAt = row.createdAt || now;
      row.updatedAt = row.updatedAt || now;
      entries.set(row.id, row);
      return clone(row);
    },
    async getEntry(id) {
      return clone(entries.get(id)) || null;
    },
    async updateEntry(id, patch) {
      const cur = entries.get(id);
      if (!cur) throw new Error(`entry ${id} not found`);
      const next = touch(cur, patch);
      if (Array.isArray(patch?.notes)) {
        next.notes = [...(cur.notes || [])];
        for (const n of patch.notes) if (!next.notes.includes(n)) next.notes.push(n);
      }
      entries.set(id, next);
      return clone(next);
    },
    // No await between the check and the write: atomic within one process.
    async transitionEntry(id, fromStatus, patch, { note } = {}) {
      const cur = entries.get(id);
      if (!cur || cur.status !== fromStatus) return null;
      const next = touch(cur, patch);
      next.notes = [...(cur.notes || [])];
      if (note && !next.notes.includes(note)) next.notes.push(note);
      entries.set(id, next);
      return clone(next);
    },
    async appendNote(id, note) {
      const cur = entries.get(id);
      if (!cur) throw new Error(`entry ${id} not found`);
      const notes = cur.notes || [];
      if (notes.includes(note)) return { added: false, entry: clone(cur) };
      const next = { ...cur, notes: [...notes, note], updatedAt: new Date().toISOString() };
      entries.set(id, next);
      return { added: true, entry: clone(next) };
    },
    async addPayment(p) {
      if (p.paypalCaptureId) {
        const same = payments.find((x) => x.paypalCaptureId === p.paypalCaptureId);
        if (same) return clone(same);
      }
      if (p.paypalOrderId) {
        const byOrder = payments.find((x) => x.paypalOrderId === p.paypalOrderId);
        if (byOrder) {
          if (!p.paypalCaptureId) return clone(byOrder);
          if (!byOrder.paypalCaptureId) {
            Object.assign(byOrder, clone(p));
            return clone(byOrder);
          }
          // A second, different capture on one order (payments.paypal_order_id is UNIQUE): keep it as an orphan record.
          await api.recordOrphanPayment({ paypalCaptureId: p.paypalCaptureId, paypalOrderId: p.paypalOrderId, customId: p.entryId, amountCents: p.amountCents, currency: p.currency });
          return { ...clone(p), id: null, orphan: true };
        }
      }
      const row = { id: `pay_${++paySeq}`, createdAt: new Date().toISOString(), ...clone(p) };
      payments.push(row);
      return clone(row);
    },
    async updatePayment(captureId, patch) {
      const row = payments.find((x) => x.paypalCaptureId === captureId);
      if (!row) return null;
      const { id: _i, entryId: _e, paypalCaptureId: _c, ...rest } = clone(patch || {});
      Object.assign(row, rest);
      return clone(row);
    },
    async recordOrphanPayment(rec) {
      if (rec.paypalCaptureId && orphans.some((o) => o.paypalCaptureId === rec.paypalCaptureId)) return { recorded: false };
      orphans.push({ createdAt: new Date().toISOString(), ...clone(rec) });
      return { recorded: true };
    },
    async findEntryByOrderId(orderId) {
      if (!orderId) return null;
      for (const e of entries.values()) if (e.paypalOrderId === orderId) return clone(e);
      return null;
    },
    async listEntries(eventId) {
      return [...entries.values()]
        .filter((e) => e.eventId === eventId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(clone);
    },
    async hasProcessedWebhook(id) {
      return webhooks.has(id);
    },
    // returns true if newly marked, false if it was already marked
    async markWebhookProcessed(id) {
      if (webhooks.has(id)) return false;
      webhooks.add(id);
      return true;
    },
    async listPayments(entryId) {
      return payments.filter((p) => !entryId || p.entryId === entryId).map(clone);
    },
    async listOrphanPayments() {
      return orphans.map(clone);
    },
  };
  return api;
}

// ---------------------------------------------------------------- supabase store (DRAFT, NEVER RUN)
// `client` is a @supabase/supabase-js client using the service role (server only).
// SCHEMA GAPS vs 02-schema.sql (must be resolved before this can run; see docs/entries/08-backend-notes.md):
//   * entries.id is a uuid and has no human ref; this draft assumes an added column entries.public_ref text UNIQUE
//     (the SWD-2026-... id), plus receipt_token, paid_at, paypal_order_id, currency, method (payment_choice), players via entry_players.
//   * a webhook de-dup table: public.entry_webhook_events(event_id text PRIMARY KEY, processed_at timestamptz).
//   * a notes table: public.entry_notes(id bigserial, entry_id uuid REFERENCES entries, note text, created_at, UNIQUE (entry_id, note)).
//     Idempotency markers (capture:<id>) and needs_review flags live here; the unique constraint is the dedupe.
//   * an orphan table: public.entry_orphan_payments(paypal_capture_id text UNIQUE, paypal_order_id, custom_id, amount_cents, currency, raw jsonb, created_at).
//   * payments.status is the enum created|paid|failed|...; the service's captured/flagged are mapped (see PAY_OUT) and the
//     service status is kept in payments.note as 'svc:<status>'.
//   * entries.submitted_by is NOT NULL referencing auth.users; the draft needs a submitter id (entry.submittedBy).
const POSITIONS = ['skip', 'vice', 'lead', 'second', 'player'];
const PAY_OUT = { created: 'created', captured: 'created', paid: 'paid', flagged: 'paid' };
const UNIQUE_VIOLATION = '23505';

export function createSupabaseStore(client, { eventSource = null } = {}) {
  const must = ({ data, error }) => {
    if (error) throw new Error(error.message || 'supabase error');
    return data;
  };
  const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

  // The enum stores lowercase positions; give the caller back the event's own label ("Skip", not "skip").
  const roleLabel = (position, eventRoles) => {
    if (!position) return '';
    return (eventRoles || []).find((r) => String(r).toLowerCase() === position) || titleCase(position);
  };
  const toEntry = (r, players = [], notes = [], roles = []) =>
    r && {
      id: r.public_ref,
      eventId: r.event_id,
      status: r.status,
      method: r.payment_choice,
      players: players.map((p) => ({ role: roleLabel(p.position, roles), name: p.full_name, club: p.club_name })),
      contact: { name: r.contact_name, email: r.contact_email, phone: r.contact_phone },
      amountCents: r.amount_due_cents,
      currency: r.currency || 'USD',
      receiptToken: r.receipt_token,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      paidAt: r.paid_at || r.confirmed_at || null,
      paypalOrderId: r.paypal_order_id || null,
      notes: notes.map((n) => n.note),
    };
  const toPayment = (r) =>
    r && {
      id: r.id,
      entryId: r.entry_ref || r.entry_id,
      method: r.method,
      status: /^svc:/.test(r.note || '') ? r.note.slice(4) : r.status,
      amountCents: r.amount_cents,
      currency: r.currency,
      paypalOrderId: r.paypal_order_id || null,
      paypalCaptureId: r.paypal_capture_id || null,
      createdAt: r.created_at,
    };

  const store = {
    async getEvent(id) {
      if (eventSource) {
        const e = await eventSource.getEvent(id);
        if (e) return e;
      }
      const r = must(await client.from('events').select('*').eq('id', id).maybeSingle());
      if (!r) return null;
      const roles = eventRoles({ format: r.format });
      return {
        id: r.id,
        title: r.title,
        date: r.start_date,
        venue: r.club_name,
        feeText: '',
        amountCents: r.fee_cents,
        unit: r.fee_unit,
        format: r.format,
        roles,
        open: r.status === 'entries_open' && Number.isInteger(r.fee_cents) && r.fee_cents > 0 && roles.length > 0,
        status: r.status,
      };
    },
  };
  const byRef = async (ref) =>
    must(await client.from('entries').select('*').eq('public_ref', ref).maybeSingle());
  const withPlayers = async (row) => {
    if (!row) return null;
    const pl = must(await client.from('entry_players').select('*').eq('entry_id', row.id).order('seat'));
    const notes = must(await client.from('entry_notes').select('*').eq('entry_id', row.id).order('id'));
    const ev = await store.getEvent(row.event_id).catch(() => null);
    return toEntry(row, pl, notes, ev?.roles);
  };
  const insertNote = async (entryUuid, note) => {
    const { error } = await client.from('entry_notes').insert({ entry_id: entryUuid, note });
    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new Error(error.message || 'supabase error');
  };
  const ENTRY_MAP = {
    status: 'status',
    method: 'payment_choice',
    amountCents: 'amount_due_cents',
    paypalOrderId: 'paypal_order_id',
    paidAt: 'paid_at',
  };
  const entryUpdate = (patch) => {
    const upd = { updated_at: new Date().toISOString() };
    for (const [k, col] of Object.entries(ENTRY_MAP)) if (k in patch) upd[col] = patch[k];
    return upd;
  };
  const paymentRow = (entryUuid, p) => ({
    entry_id: entryUuid,
    method: p.method,
    status: PAY_OUT[p.status] || 'created',
    note: `svc:${p.status || 'created'}`,
    amount_cents: p.amountCents,
    currency: p.currency || 'USD',
    paypal_order_id: p.paypalOrderId || null,
    paypal_capture_id: p.paypalCaptureId || null,
    reference: p.reference || null,
    received_at: p.receivedAt || null,
    raw_provider_event: p.raw || null,
  });
  const payBy = async (col, val) => {
    const r = must(await client.from('payments').select('*').eq(col, val).maybeSingle());
    return r;
  };

  return Object.assign(store, {
    async createEntry(e) {
      const row = must(
        await client
          .from('entries')
          .insert({
            public_ref: e.id,
            event_id: e.eventId,
            entry_no: e.entryNo,
            status: e.status,
            payment_choice: e.method,
            submitted_by: e.submittedBy,
            contact_name: e.contact?.name,
            contact_email: e.contact?.email,
            contact_phone: e.contact?.phone || null,
            amount_due_cents: e.amountCents,
            currency: e.currency || 'USD',
            receipt_token: e.receiptToken,
            paypal_order_id: e.paypalOrderId || null,
            paid_at: e.paidAt || null,
          })
          .select()
          .single(),
      );
      const players = (e.players || []).map((p, i) => {
        const pos = p.role ? String(p.role).toLowerCase() : '';
        return {
          entry_id: row.id,
          seat: i + 1,
          full_name: p.name,
          club_name: p.club || null,
          position: POSITIONS.includes(pos) ? pos : null,
        };
      });
      if (players.length) must(await client.from('entry_players').insert(players));
      for (const n of e.notes || []) await insertNote(row.id, n);
      return withPlayers(row);
    },
    async getEntry(id) {
      return withPlayers(await byRef(id));
    },
    async updateEntry(id, patch) {
      const row = must(await client.from('entries').update(entryUpdate(patch)).eq('public_ref', id).select().single());
      for (const n of Array.isArray(patch.notes) ? patch.notes : []) await insertNote(row.id, n);
      return withPlayers(row);
    },
    async transitionEntry(id, fromStatus, patch, { note } = {}) {
      const rows = must(
        await client.from('entries').update(entryUpdate(patch)).eq('public_ref', id).eq('status', fromStatus).select(),
      );
      if (!rows || rows.length === 0) return null;
      if (note) await insertNote(rows[0].id, note);
      return withPlayers(rows[0]);
    },
    async appendNote(id, note) {
      const row = await byRef(id);
      if (!row) throw new Error(`entry ${id} not found`);
      const added = await insertNote(row.id, note);
      return { added, entry: await withPlayers(row) };
    },
    async addPayment(p) {
      const entry = await byRef(p.entryId);
      if (!entry) throw new Error(`entry ${p.entryId} not found`);
      const ref = (r) => r && { ...r, entry_ref: p.entryId };
      if (p.paypalCaptureId) {
        const same = await payBy('paypal_capture_id', p.paypalCaptureId);
        if (same) return toPayment(ref(same));
      }
      if (p.paypalOrderId) {
        const byOrder = await payBy('paypal_order_id', p.paypalOrderId);
        if (byOrder) {
          if (!p.paypalCaptureId) return toPayment(ref(byOrder));
          if (!byOrder.paypal_capture_id) {
            const rows = must(
              await client.from('payments').update(paymentRow(entry.id, p)).eq('id', byOrder.id).select(),
            );
            return toPayment(ref(rows[0]));
          }
          await store.recordOrphanPayment({ paypalCaptureId: p.paypalCaptureId, paypalOrderId: p.paypalOrderId, customId: p.entryId, amountCents: p.amountCents, currency: p.currency });
          return { id: null, entryId: p.entryId, status: p.status, amountCents: p.amountCents, paypalOrderId: p.paypalOrderId, paypalCaptureId: p.paypalCaptureId, orphan: true };
        }
      }
      const { data, error } = await client.from('payments').insert(paymentRow(entry.id, p)).select().single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          // Lost a race: the other writer's row is the one that counts.
          const again = (p.paypalCaptureId && (await payBy('paypal_capture_id', p.paypalCaptureId))) ||
            (p.paypalOrderId && (await payBy('paypal_order_id', p.paypalOrderId)));
          if (again) return toPayment(ref(again));
        }
        throw new Error(error.message || 'supabase error');
      }
      return toPayment(ref(data));
    },
    async updatePayment(captureId, patch) {
      const upd = {};
      if (patch.status) { upd.status = PAY_OUT[patch.status] || 'created'; upd.note = `svc:${patch.status}`; }
      if ('amountCents' in patch) upd.amount_cents = patch.amountCents;
      if (!Object.keys(upd).length) return null;
      const rows = must(await client.from('payments').update(upd).eq('paypal_capture_id', captureId).select());
      return rows && rows[0] ? toPayment(rows[0]) : null;
    },
    async listPayments(entryId) {
      const entry = entryId ? await byRef(entryId) : null;
      if (entryId && !entry) return [];
      let q = client.from('payments').select('*');
      if (entry) q = q.eq('entry_id', entry.id);
      const rows = must(await q.order('created_at'));
      return rows.map((r) => toPayment({ ...r, entry_ref: entryId || r.entry_id }));
    },
    async recordOrphanPayment(rec) {
      const { error } = await client.from('entry_orphan_payments').insert({
        paypal_capture_id: rec.paypalCaptureId || null,
        paypal_order_id: rec.paypalOrderId || null,
        custom_id: rec.customId || null,
        amount_cents: rec.amountCents ?? null,
        currency: rec.currency || null,
        raw: rec.raw || null,
      });
      if (!error) return { recorded: true };
      if (error.code === UNIQUE_VIOLATION) return { recorded: false };
      throw new Error(error.message || 'supabase error');
    },
    async listOrphanPayments() {
      return must(await client.from('entry_orphan_payments').select('*')).map((r) => ({
        paypalCaptureId: r.paypal_capture_id, paypalOrderId: r.paypal_order_id, customId: r.custom_id,
      }));
    },
    async findEntryByOrderId(orderId) {
      const row = must(await client.from('entries').select('*').eq('paypal_order_id', orderId).maybeSingle());
      return withPlayers(row);
    },
    async listEntries(eventId) {
      const rows = must(await client.from('entries').select('*').eq('event_id', eventId).order('created_at'));
      return Promise.all(rows.map(withPlayers));
    },
    async hasProcessedWebhook(id) {
      const r = must(await client.from('entry_webhook_events').select('event_id').eq('event_id', id).maybeSingle());
      return !!r;
    },
    async markWebhookProcessed(id) {
      const { error } = await client.from('entry_webhook_events').insert({ event_id: id });
      if (!error) return true;
      if (error.code === UNIQUE_VIOLATION) return false; // unique violation: already marked
      throw new Error(error.message || 'supabase error');
    },
  });
}
