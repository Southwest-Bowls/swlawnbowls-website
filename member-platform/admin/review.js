// review.js — admin roster review screen (local only).
(function () {
  'use strict';
  var KIND = {
    repeated_name: { tab: 'names', title: 'Repeated name', why: 'Same first and last name. Could be two people — never merged automatically.' },
    shared_email: { tab: 'emails', title: 'Shared email', why: 'Several records use one inbox (often a household). Sharing an email gives no one access to the others.' },
    begnov_format_review: { tab: 'data', title: 'Novice date format', why: '“begnov” isn’t in YYYY/MM form. The raw value is kept; confirm its meaning.' },
    email_syntax_review: { tab: 'data', title: 'Email looks malformed', why: 'A simple syntax check only — not proof the address works.' },
    missing_email: { tab: 'data', title: 'No email', why: 'Kept as a member; organizer-assisted entry stays possible.' },
    multiple_or_ambiguous_club_codes: { tab: 'data', title: 'Unclear club code', why: 'The cell holds several or unusual codes. Never split or discarded silently.' }
  };
  var LABEL = {
    keep_separate: 'Keep separate', same_person_pending_approval: 'Same person (approve later)', shared_household_contact: 'Shared household contact',
    value_confirmed: 'Value is correct', needs_info: 'Needs info', reopen: 'Reopen'
  };
  var TABS = [['names', 'Repeated names', ['repeated_name']], ['emails', 'Shared emails', ['shared_email']],
    ['clubs', 'Club mapping', null], ['data', 'Data flags', ['begnov_format_review', 'email_syntax_review', 'missing_email', 'multiple_or_ambiguous_club_codes']]];
  var tab = 'names', status = 'open', S = null;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var raw = function (v) { return v === '' || v == null ? '<span class="raw raw--blank">blank</span>' : '<span class="raw">' + esc(v) + '</span>'; };
  var api = function (url, body) {
    return fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-swd-admin': '1' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Failed'); return j; }); });
  };
  var say = function (t) { var a = $('#announce'); a.textContent = ''; setTimeout(function () { a.textContent = t; }, 30); };
  var fmtDate = function (d) { return d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };

  function loadSummary() {
    return api('/api/summary').then(function (s) {
      S = s;
      if (!s.batch) { $('#stats').innerHTML = '<p>No roster staged yet. Run <code>npm run import</code>.</p>'; return; }
      var b = s.batch;
      $('#batch-label').textContent = 'Admin · ' + b.source_file + (b.snapshot_date ? ' (snapshot ' + new Date(String(b.snapshot_date).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ')' : '');
      var open = s.kinds.reduce(function (n, k) { return n + k.open; }, 0), total = s.kinds.reduce(function (n, k) { return n + k.items; }, 0);
      $('#stats').innerHTML =
        stat('blue', b.row_count.toLocaleString(), 'source rows staged as received') +
        stat('orange', open + ' / ' + total, 'review items still open') +
        stat('blush', s.clubs.pending + ' / ' + s.clubs.total, 'club mappings to approve') +
        stat('', s.created.members + ' · ' + s.created.accounts + ' · ' + s.created.invitations, 'members · accounts · invitations created') +
        stat('', s.created.decisions, 'decisions recorded (by ' + esc(s.operator) + ')');
      var counts = {};
      s.kinds.forEach(function (k) { var t = KIND[k.kind].tab; counts[t] = counts[t] || { open: 0, all: 0 }; counts[t].open += k.open; counts[t].all += k.items; });
      counts.clubs = { open: s.clubs.pending, all: s.clubs.total };
      $('#tabs').innerHTML = TABS.map(function (t) {
        var c = counts[t[0]] || { open: 0, all: 0 };
        return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '" tabindex="' + (t[0] === tab ? 0 : -1) + '">' + t[1] + ' <span>(' + c.open + ')</span></button>';
      }).join('');
    });
  }
  function stat(c, n, l) { return '<div class="stat' + (c ? ' stat--' + c : '') + '"><b>' + n + '</b><span>' + l + '</span></div>'; }

  function loadList() {
    $('#list').innerHTML = '<div class="skel" role="status"><span class="sr-only">Loading…</span><span class="skel__b"></span><span class="skel__b"></span></div>';
    if (tab === 'clubs') return loadClubs();
    var kinds = TABS.filter(function (t) { return t[0] === tab; })[0][2];
    return api('/api/issues?kind=' + kinds.join(',') + (status ? '&status=' + status : '')).then(function (items) {
      $('#list').innerHTML = items.length ? items.map(itemHtml).join('') : '<div class="empty"><b>Nothing ' + (status ? 'open ' : '') + 'here.</b><p>All items in this group have a decision.</p></div>';
    }).catch(function (e) { $('#list').innerHTML = '<div class="error"><b>Couldn’t load the review items.</b><p>' + esc(e.message) + '</p></div>'; });
  }

  function itemHtml(it) {
    var k = KIND[it.kind], rows = it.rows;
    var nums = rows.map(function (r) { return r.sourceRow; });
    var d = it.lastDecision;
    return '<article class="item" data-id="' + it.id + '" aria-labelledby="t-' + it.id + '">' +
      '<div class="item__head"><h2 class="item__title" id="t-' + it.id + '">' + k.title + ' · source row' + (nums.length > 1 ? 's ' : ' ') + nums.join(', ') + '</h2>' +
      '<span class="chip chip--' + it.status + '">' + (it.status === 'open' ? 'Open' : 'Resolved') + '</span></div>' +
      '<p class="why">' + k.why + '</p>' +
      '<div class="tablewrap--admin" role="region" aria-label="Records" tabindex="0"><table class="recs"><thead><tr>' +
      '<th scope="col">Row</th><th scope="col">Name</th><th scope="col">Home club · codes</th><th scope="col">Dues SW/US (raw)</th><th scope="col">Novice · begnov</th><th scope="col">Email · phone</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + r.sourceRow + '</td><td>' + esc(r.firstName) + ' ' + esc(r.lastName) + (r.city ? '<br><span class="why">' + esc(r.city) + '</span>' : '') + '</td>' +
          '<td>' + esc(r.homeClub) + '<br>' + raw(r.club1) + ' ' + raw(r.club2) + ' ' + raw(r.club3) + '</td>' +
          '<td>' + raw(r.dues.swMan) + raw(r.dues.swWoman) + ' / ' + raw(r.dues.usMan) + raw(r.dues.usWoman) + '</td>' +
          '<td>' + raw(r.novice) + ' · ' + raw(r.begnov) + '</td>' +
          '<td data-contact="' + r.sourceRow + '">' + (r.email ? esc(r.email) : '<span class="raw raw--blank">no email</span>') + '<br>' + esc(r.phone) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<button class="textlink" type="button" data-reveal="' + it.id + '">Show contact details<span class="sr-only"> for these records</span></button>' +
      (d ? '<p class="decided"><b>' + esc(LABEL[d.decision]) + '</b> — “' + esc(d.reason) + '” · ' + esc(d.decided_by) + ', ' + fmtDate(d.decided_at) + '</p>' : '') +
      '<form class="decide" data-decide="' + it.id + '"><fieldset style="border:0;padding:0;margin:0"><legend class="why">Decision</legend>' +
      '<div class="choices" role="radiogroup" aria-label="Decision for ' + k.title + ' rows ' + nums.join(' and ') + '">' +
      it.choices.concat(it.status === 'resolved' ? ['reopen'] : []).map(function (c, i) {
        return '<button type="button" role="radio" data-choice="' + c + '" aria-checked="false" tabindex="' + (i ? -1 : 0) + '">' + LABEL[c] + '</button>';
      }).join('') + '</div></fieldset>' +
      '<label class="sr-only" for="why-' + it.id + '">Reason</label><textarea id="why-' + it.id + '" placeholder="Reason (required) — e.g. different birth years confirmed by club"></textarea>' +
      '<div class="decide__row"><button class="btn" type="submit">Record decision</button><span class="err" role="alert"></span></div></form></article>';
  }

  function loadClubs() {
    return api('/api/clubs').then(function (d) {
      var opts = function (sel) { return '<option value="">Choose the club…</option>' + d.clubs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''); };
      var list = d.map.filter(function (m) { return !status || m.status === 'pending' || m.status === 'needs_info'; });
      $('#list').innerHTML = list.length ? list.map(function (m) {
        var flags = [];
        if (/\([A-Z]+\)\s*$/.test(m.home_club_raw)) flags.push('Division suffix in label');
        if (m.code_conflict) flags.push('Code ' + m.club1_raw + ' usually means ' + m.code_conflict);
        if (!m.suggested_club_id) flags.push('No matching website club');
        return '<article class="item" aria-labelledby="c-' + m.id + '"><div class="item__head"><h2 class="item__title" id="c-' + m.id + '">' + esc(m.home_club_raw) + ' + <span class="raw">' + esc(m.club1_raw) + '</span></h2>' +
          '<span class="chip chip--' + (m.status === 'approved' || m.status === 'no_match' ? 'resolved' : 'open') + '">' + esc({ pending: 'To approve', approved: 'Approved', no_match: 'No match', needs_info: 'Needs info' }[m.status]) + '</span></div>' +
          '<p class="why">' + m.record_count + ' record' + (m.record_count === 1 ? '' : 's') + (m.suggested_club_id ? ' · suggestion: ' + esc((d.clubs.filter(function (c) { return c.id === m.suggested_club_id; })[0] || {}).name) + ' (not applied until approved)' : '') + '</p>' +
          (flags.length ? '<p>' + flags.map(function (f) { return '<span class="flagtag">' + esc(f) + '</span>'; }).join('') + '</p>' : '') +
          (m.decided_by ? '<p class="decided"><b>' + esc(m.status) + '</b> — “' + esc(m.reason) + '” · ' + esc(m.decided_by) + ', ' + fmtDate(m.decided_at) + '</p>' : '') +
          '<form class="decide clubrow" data-club="' + m.id + '"><label class="sr-only" for="sel-' + m.id + '">Club for ' + esc(m.home_club_raw) + ' ' + esc(m.club1_raw) + '</label>' +
          '<select id="sel-' + m.id + '">' + opts(m.approved_club_id || m.suggested_club_id) + '</select>' +
          '<label class="sr-only" for="cw-' + m.id + '">Reason</label><textarea id="cw-' + m.id + '" placeholder="Reason (required)"></textarea>' +
          '<div class="decide__row"><button class="btn" type="submit" data-st="approved">Approve mapping</button><button class="btn btn--ghost" type="submit" data-st="no_match">No matching club</button>' +
          '<button class="btn btn--ghost" type="submit" data-st="needs_info">Needs info</button><span class="err" role="alert"></span></div></form></article>';
      }).join('') : '<div class="empty"><b>All club mappings decided.</b></div>';
    });
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-tab]');
    if (t) { tab = t.getAttribute('data-tab'); loadSummary(); loadList(); return; }
    var st = ev.target.closest('[data-status]');
    if (st) { status = st.getAttribute('data-status'); document.querySelectorAll('[data-status]').forEach(function (b) { b.setAttribute('aria-checked', b === st); b.tabIndex = b === st ? 0 : -1; }); loadList(); return; }
    var c = ev.target.closest('[data-choice]');
    if (c) { c.parentNode.querySelectorAll('[data-choice]').forEach(function (b) { b.setAttribute('aria-checked', b === c); b.tabIndex = b === c ? 0 : -1; }); return; }
    var rv = ev.target.closest('[data-reveal]');
    if (rv) {
      api('/api/issues/' + rv.getAttribute('data-reveal') + '/contacts', {}).then(function (rows) {
        rows.forEach(function (r) { var td = $('[data-contact="' + r.source_row + '"]', rv.closest('.item')); if (td) td.innerHTML = (r.email ? esc(r.email) : '<span class="raw raw--blank">no email</span>') + '<br>' + esc(r.phone || ''); });
        rv.remove(); say('Contact details shown. This view was logged.');
      });
    }
    var sb = ev.target.closest('[data-st]'); if (sb) sb.closest('form').dataset.pick = sb.getAttribute('data-st');
  });
  document.addEventListener('keydown', function (ev) {
    var r = ev.target.closest && ev.target.closest('[role="radio"],[role="tab"]');
    if (!r || ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].indexOf(ev.key) < 0) return;
    ev.preventDefault();
    var all = Array.prototype.slice.call(r.parentNode.querySelectorAll('[role="' + r.getAttribute('role') + '"]'));
    var n = all[(all.indexOf(r) + (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
    n.focus(); n.click();
  });
  document.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target, err = $('.err', f);
    if (f.dataset.decide) {
      var pick = $('[data-choice][aria-checked="true"]', f);
      var reason = $('textarea', f).value.trim();
      if (!pick) { err.textContent = 'Choose a decision.'; return; }
      if (reason.length < 3) { err.textContent = 'Please give a short reason.'; $('textarea', f).focus(); return; }
      api('/api/issues/' + f.dataset.decide + '/decisions', { decision: pick.getAttribute('data-choice'), reason: reason })
        .then(function () { say('Decision recorded: ' + pick.textContent + '.'); loadSummary(); loadList(); })
        .catch(function (e) { err.textContent = e.message; });
    } else if (f.dataset.club) {
      var s = f.dataset.pick || 'approved', r2 = $('textarea', f).value.trim();
      if (r2.length < 3) { err.textContent = 'Please give a short reason.'; $('textarea', f).focus(); return; }
      api('/api/clubs/' + f.dataset.club, { status: s, clubId: $('select', f).value, reason: r2 })
        .then(function () { say('Club mapping recorded.'); loadSummary(); loadList(); })
        .catch(function (e) { err.textContent = e.message; });
    }
  });
  loadSummary().then(loadList);
})();
