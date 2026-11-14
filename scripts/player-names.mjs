// Names on podiums, for "a player you follow placed" alerts. Mirrors displayNames()/playerKey() in assets/app/app.js.
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Joanne & Wilf Steckler" -> ["Joanne Steckler", "Wilf Steckler"]. Only people: a first name alone, a club or team name,
// and a one-line leaderboard ("1st Kevin Lacey · 2nd Esther Lee ...") are never players.
export function displayNames(str) {
  if (/\u00b7/.test(str) && /\b\d+(?:st|nd|rd|th)\s/i.test(str)) return [];
  let parts = String(str || '').split(/\s*(?:,|&|\/|\band\b)\s*/i).map((x) => x.replace(/^(?:consolation|winners?)\s+/i, '').trim()).filter(Boolean);
  const last = parts.length > 1 ? parts[parts.length - 1].split(/\s+/) : [];
  if (last.length > 1 && parts.slice(0, -1).every((x) => !x.includes(' '))) {
    const sur = last[last.length - 1];
    parts = parts.map((x, i) => (i < parts.length - 1 ? x + ' ' + sur : x));
  }
  return parts.filter((x) => x.indexOf(' ') > 0 && !/\d/.test(x) && !/\b(club|lbc|lawn|bowling|bowls|team)\b/i.test(x));
}

// The id a phone subscribes to for a followed player: player--gary-belk
export function playerKey(name) {
  const slug = fold(name).trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return ('player--' + slug).slice(0, 80).replace(/-+$/, '');
}

// Everyone on the top three of a result, once each, with their best place: [{ name, rank }]
export function podiumPlayers(tournament) {
  const best = new Map();
  const walk = (o) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== 'object') return;
    const rank = Number(o.rank);
    if (typeof o.names === 'string' && rank >= 1 && rank <= 3) {
      for (const n of displayNames(o.names)) {
        const k = fold(n).trim();
        if (!best.has(k) || best.get(k).rank > rank) best.set(k, { name: n, rank });
      }
    }
    Object.values(o).forEach(walk);
  };
  walk(tournament);
  return [...best.values()];
}
export const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : '3rd');
