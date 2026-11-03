/* Injury report: every player on the team's report, grouped by severity, with the latest note and a flag for starters.
   Source is ESPN's league injuries feed (status + notes), topped up from the roster for players the feed misses. */

const INJ_GROUPS = [
  ['out', 'Out & injured reserve', 'bad'],
  ['doubtful', 'Doubtful', 'bad'],
  ['questionable', 'Questionable', 'warn'],
  ['dtd', 'Day-to-day & other', ''],
];
const injGroup = s => /doubtful/i.test(s) ? 'doubtful' : /questionable/i.test(s) ? 'questionable' : /\bout\b|reserve|\bir\b|\bil\b|injured|pup|nfi|suspen|inactive/i.test(s) ? 'out' : 'dtd';
const injShort = (s, n = 190) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s; };

Object.assign(API, {
  /** Full injury list for one team, newest first within each status. */
  async injuries(t) {
    const [feed, roster] = await Promise.all([safe(getJSON(`${ESPN.site(t)}/injuries`, 300), null), safe(API.roster(t), null)]);
    const mine = (feed?.injuries || []).find(x => String(x.id) === String(t.espnId));
    const byId = new Map(), byName = new Map();
    (roster?.players || []).forEach(p => { byId.set(String(p.id), p); byName.set(normName(p.name), p); });
    const list = [];
    (mine?.injuries || []).forEach(i => {
      const a = i.athlete || {};
      if (!a.displayName || /^Active$/i.test(i.status || '')) return;
      const id = (a.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || (a.headshot?.href || '').match(/full\/(\d+)/)?.[1] || byName.get(normName(a.displayName))?.id;
      const p = byId.get(String(id)) || byName.get(normName(a.displayName));
      list.push({ id: p?.id || id, name: a.displayName, pos: a.position?.abbreviation || p?.pos || '', jersey: p?.jersey || '', headshot: a.headshot?.href || p?.headshot || headshot(t, id), status: i.status, date: i.date, note: i.shortComment || '', long: i.longComment || '' });
    });
    const seen = new Set(list.map(x => String(x.id)));
    (roster?.players || []).forEach(p => {
      if (seen.has(String(p.id))) return;
      const inj = p.injuries[0];
      const st = inj?.status || (p.status && !/^(Active|Practice Squad)$/i.test(p.status) ? p.status : '') || (/injured reserve/i.test(p.group) ? 'Injured Reserve' : '');
      if (!st) return;
      list.push({ id: p.id, name: p.name, pos: p.pos, jersey: p.jersey, headshot: p.headshot, status: st, date: inj?.date || '', note: inj?.detail || '', long: '' });
    });
    list.forEach(x => (x.group = injGroup(x.status)));
    list.sort((a, b) => INJ_GROUPS.findIndex(g => g[0] === a.group) - INJ_GROUPS.findIndex(g => g[0] === b.group) || String(b.date).localeCompare(String(a.date)));
    return { list, rosterSize: roster?.players?.length || 0, fromFeed: !!mine };
  },
});

const injCount = (list, g) => list.filter(x => x.group === g).length;
const injStamp = d => (d ? `Updated ${fmtDate(d, { month: 'short', day: 'numeric' })}` : '');

/** Ids of players listed first on any depth chart, so the report can flag who is actually a starter. */
async function injStarters(t) {
  const d = await safe(API.depth(t), null), ids = new Set();
  (d?.charts || []).forEach(c => c.rows.forEach(r => { const p = r.players[0]; if (p) ids.add(String(p.id)); }));
  return ids;
}

function injRowHtml(t, x, starters) {
  const g = INJ_GROUPS.find(y => y[0] === x.group);
  const flat = s => String(s || '').toLowerCase().replace(/\W/g, ''), noise = s => !s || flat(s) === flat(x.status) || flat(s).length < 4;
  x = { ...x, note: noise(x.note) ? '' : x.note, long: noise(x.long) ? '' : x.long };
  const lead = x.note || injShort(x.long), more = x.long && x.long !== lead && x.long.length > lead.length;
  const body = more ? `<details class="inj-more"><summary>${esc(injShort(lead))}</summary><p>${esc(x.long)}</p></details>` : lead ? `<div class="inj-note">${esc(lead)}</div>` : '';
  return `<div class="inj-row" ${x.id ? `data-player="${esc(x.id)}" data-team="${t.key}" data-name="${esc(x.name)}"` : ''}>
    <img src="${esc(x.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="inj-main"><div class="inj-top"><b>${esc(x.name)}</b><span class="dim small">${esc([x.pos, x.jersey ? '#' + x.jersey : ''].filter(Boolean).join(' · '))}</span>${starters?.has(String(x.id)) ? '<span class="badge">Starter</span>' : ''}</div>${body}</div>
    <div class="inj-side"><span class="badge ${g?.[2] || ''}">${esc(x.status)}</span><span class="dim small">${esc(injStamp(x.date))}</span></div></div>`;
}

async function tabInjuries(t, { mount, alive }) {
  const [r, starters] = await Promise.all([API.injuries(t), injStarters(t)]); if (!alive()) return;
  const { list } = r;
  if (!list.length) { mount.innerHTML = `<div class="card center"><h3>${t.college ? 'No injuries listed' : 'Clean bill of health'}</h3><p class="muted">${t.college ? `ESPN doesn’t get a weekly injury report for ${esc(t.nick)}, since college programs aren’t required to publish one, so nobody is flagged here. Check ${esc(t.nick)} news for the latest on key players.` : `No players are listed on the ${esc(t.nick)} injury report right now.`}</p>${t.college ? `<a class="btn small" href="#/team/${t.key}/overview">Latest news ›</a>` : ''}</div>`; return; }
  const st = { g: 'all', starters: false };
  mount.innerHTML = `<div class="inj-sum">${INJ_GROUPS.map(([k, l, c]) => `<button class="inj-tile ${c}" data-g="${k}"><b>${injCount(list, k)}</b><span>${l}</span></button>`).join('')}</div>
    <div class="row between small muted" style="margin:-4px 2px 14px"><span id="injHint">Tap a box to filter the list.</span>${starters.size ? '<label class="f" style="flex-direction:row;align-items:center;gap:6px;"><input type="checkbox" id="injStart"> Starters only</label>' : ''}</div>
    <div id="injList"></div>
    <p class="disc">${list.length} player${list.length === 1 ? '' : 's'} on the ${esc(t.nick)} report${r.rosterSize ? ` (${r.rosterSize} on the roster)` : ''}. ${r.fromFeed ? 'Statuses and notes from ESPN' : 'Statuses from the ESPN roster'}, refreshed every few minutes. Tap a player for the full profile.</p>`;
  const draw = () => {
    const rows = list.filter(x => (st.g === 'all' || x.group === st.g) && (!st.starters || starters.has(String(x.id))));
    $('#injList').innerHTML = rows.length ? INJ_GROUPS.map(([k, l]) => { const rs = rows.filter(x => x.group === k); return rs.length ? `<div class="card inj-card"><h3>${l} <span class="dim">${rs.length}</span></h3>${rs.map(x => injRowHtml(t, x, starters)).join('')}</div>` : ''; }).join('') : '<div class="card center muted">Nobody matches that filter.</div>';
  };
  const pick = g => { st.g = g; $$('.inj-tile').forEach(c => c.classList.toggle('on', c.dataset.g === g)); $('#injHint').textContent = g === 'all' ? 'Tap a box to filter the list.' : 'Filtered — tap the box again to show everyone.'; draw(); };
  mount.querySelector('.inj-sum').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) pick(st.g === b.dataset.g ? 'all' : b.dataset.g); });
  $('#injStart')?.addEventListener('change', e => { st.starters = e.target.checked; draw(); });
  draw();
}

/** Compact card for the team Overview: counts plus the first few names, linking to the full tab. */
async function overviewInjuries(t, el, alive) {
  const r = await safe(API.injuries(t), null); if (!alive() || !r) { if (el && alive()) el.innerHTML = ''; return; }
  const { list } = r, tabHref = `#/team/${t.key}/injuries`;
  if (!list.length) { el.innerHTML = `<h3>Injury report</h3><div class="muted small">Nobody is listed as injured right now.</div>`; return; }
  const bits = INJ_GROUPS.map(([k, l]) => [injCount(list, k), l]).filter(x => x[0]).map(([n, l]) => `<span><b>${n}</b> ${l.toLowerCase()}</span>`).join('');
  el.innerHTML = `<div class="row between"><h3 style="margin:0">Injury report <span class="dim">${list.length}</span></h3><a class="small" href="${tabHref}">All injuries ›</a></div>
    <div class="inj-bits small muted">${bits}</div>
    ${list.slice(0, 6).map(x => `<div class="pvrow" ${x.id ? `data-player="${esc(x.id)}" data-team="${t.key}" data-name="${esc(x.name)}" style="cursor:pointer"` : ''}><span><b>${esc(x.name)}</b> <span class="dim small">${esc(x.pos)}</span></span><span class="badge ${INJ_GROUPS.find(g => g[0] === x.group)?.[2] || ''}">${esc(x.status)}</span></div>`).join('')}
    ${list.length > 6 ? `<a class="btn small" style="margin-top:10px" href="${tabHref}">See all ${list.length} →</a>` : ''}`;
}
