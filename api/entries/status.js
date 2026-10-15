import { handle, getStatus, receiptTokenFrom } from './_lib/service.js';

// The receipt token is read from the X-Receipt-Token header first, then from ?token= (kept for the receipt page).
export default function handler(req, res) {
  return handle(req, res, { method: 'GET' }, (deps, q, r) => getStatus(deps, { entryId: q.id, receiptToken: receiptTokenFrom(r, q) }));
}
