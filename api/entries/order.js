import { handle, startPayment } from './_lib/service.js';

export default function handler(req, res) {
  return handle(req, res, { method: 'POST' }, (deps, b) => startPayment(deps, { entryId: b.entryId, receiptToken: b.receiptToken }));
}
