import { handle, captureAndRecord } from './_lib/service.js';

export default function handler(req, res) {
  return handle(req, res, { method: 'POST' }, (deps, b) => captureAndRecord(deps, { entryId: b.entryId, receiptToken: b.receiptToken, orderId: b.orderId }));
}
