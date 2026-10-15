// Fee text -> integer cents. Never guesses: ambiguous or unparseable text returns null.
//   "$60/team", "$30 per person"  -> explicit unit
//   "$60" (bare)                  -> uses the `unit` argument; else only OK for singles (teamSize 1)
// Only the FIRST dollar amount is read ("$450 per team ($150 per player)" -> 45000).

const AMOUNT = /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/;

function normUnit(u) {
  const s = String(u || '').toLowerCase().replace(/^per[_\s-]+/, '');
  if (s === 'team') return 'team';
  if (s === 'player' || s === 'person') return 'player';
  return null;
}

export function feeToCents(text, unit = null, teamSize = null) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  if (/^free\b/i.test(t)) return 0;
  const m = AMOUNT.exec(t);
  if (!m) return null;
  const dollars = parseInt(m[1].replace(/,/g, ''), 10);
  const frac = (m[2] || '').padEnd(2, '0');
  const cents = dollars * 100 + (frac ? parseInt(frac, 10) : 0);
  const size = Number.isInteger(teamSize) && teamSize > 0 ? teamSize : null;

  const after = t.slice(m.index + m[0].length);
  const um = /^\s*(?:\/|per\b|a\b|each\b)\s*(team|player|person)\b/i.exec(after);
  const eff = um ? normUnit(um[1]) : normUnit(unit);
  if (eff === 'team') return cents;
  if (eff === 'player') return size ? cents * size : null;
  // bare amount, no unit known: only unambiguous for singles
  return size === 1 ? cents : null;
}
