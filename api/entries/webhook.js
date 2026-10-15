import { handle, handleWebhook } from './_lib/service.js';

export default function handler(req, res) {
  return handle(req, res, { method: 'POST' }, (deps, b, r) => handleWebhook(deps, { headers: r.headers, body: b }));
}
