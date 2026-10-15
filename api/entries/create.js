import { handle, createEntry, clientIp } from './_lib/service.js';

export default function handler(req, res) {
  return handle(req, res, { method: 'POST' }, (deps, body, r) => createEntry(deps, body, { ip: clientIp(r) }));
}
