/* Team page shell + live-data tabs: overview, roster, depth chart, contracts, stats, schedule */
const TAB_LIST = [
  ['overview', 'Overview'], ['picture', 'Standings & Playoffs'], ['schedule', 'Schedule & Results'], ['stats', 'Stats'], ['roster', 'Roster'], ['depth', 'Depth Chart'], ['contracts', 'Contracts'],
  ['coaches', 'Coaches'], ['history', 'History'], ['legends', 'Legends'], ['stadium', 'Stadium'], ['shop', 'Shop'],
];
const yearLabel = (t, y) => (t.league === 'nba' ? `${y - 1}–${String(y).slice(2)}` : String(y));

async function viewTeam({ parts, q, mount, alive }) {
  const key = parts[1], t = TEAMS[key], tab = TAB_LIST.some(x => x[0] === parts[2]) ? parts[2] : 'overview';
  const tot = H.totals(key);
  const existing = $('#teamHead')?.dataset.team === key && $('#tabBody');
  if (existing) {
    $$('#tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#/team/${key}/${tab}`));
    $('#tabBody').style.minHeight = '70vh'; $('#tabBody').innerHTML = spinner();
    const y = $('#tabs').getBoundingClientRect().top + window.scrollY - (innerWidth <= 960 ? 8 : 62);
    if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
  }
  if (!existing) mount.innerHTML = `
    <div class="team-head" id="teamHead" data-team="${key}">
      <img class="logo" src="${teamLogoOn(t)}" alt="${esc(t.name)}">
      <div class="meta"><div class="small muted" style="letter-spacing:.12em;text-transform:uppercase">${t.sportName} · Est. ${t.since}</div><h1>${esc(t.name)}</h1>
        <div class="row small muted"><span>🏆 ${tot.titles} titles</span><span>🏅 ${tot.finals + tot.titles} finals</span><span>📈 ${tot.w}-${tot.l}${tot.t ? '-' + tot.t : ''} all-time</span></div></div>
      <div class="stats" id="headStats"></div>
    </div>
    <div class="tabs" id="tabs">${TAB_LIST.map(([k, l]) => `${k === 'coaches' ? '<span class="tabsep">Club &amp; history</span>' : ''}<a href="#/team/${key}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>
    <div id="tabBody">${spinner()}</div>`;
  safe(API.team(t)).then(info => {
    if (!alive() || !info) return;
    const has = info.w + info.l + info.tie > 0;
    $('#headStats').innerHTML = `<div class="big-stat"><div class="v">${has ? esc(info.summary) : '—'}</div><div class="l">Record</div></div>
      <div class="big-stat"><div class="v" style="font-size:1.4rem;padding-top:6px">${esc(info.standingSummary || '—')}</div><div class="l">Standing</div></div>`;
  });
  const fn = { overview: tabOverview, picture: tabPicture, roster: tabRoster, depth: tabDepth, contracts: tabContracts, stats: tabStats, schedule: tabSchedule, coaches: tabCoaches, history: tabHistory, legends: tabLegends, stadium: tabStadium, shop: tabShop }[tab];
  await fn(t, { mount: $('#tabBody'), q, alive, key });
  if (alive()) $('#tabBody').style.minHeight = '';
  if (alive()) $('#tabBody').style.minHeight = '';
}

/* ---------- Overview ---------- */
function resultDots(games) {
  return games.map(g => `<span class="badge ${g.result === 'W' ? 'good' : g.result === 'L' ? 'bad' : ''}" title="${esc(g.opp.name)} ${g.ourScore}-${g.oppScore}">${g.result}</span>`).join(' ');
}
function standingsTable(std, t) {
  if (!std?.ours) return errBox('Standings unavailable.');
  const cols = [
    { key: 'name', label: std.ours.name, fmt: e => `<div class="pname"><img src="${esc(e.logo)}" style="border-radius:0;background:none;width:24px;height:24px;object-fit:contain" alt="">${esc(e.name)}</div>`, sortVal: e => e.name },
    { key: 'w', label: 'W', num: true }, { key: 'l', label: 'L', num: true },
    ...(t.recordFmt === 'wlt' ? [{ key: 't', label: 'T', num: true }] : []),
    { key: 'pct', label: 'PCT', num: true, fmt: e => esc(typeof e.pct === 'number' ? fmtPct(e.pct) : e.pct) },
    { key: 'gb', label: t.league === 'nfl' ? '' : 'GB', num: true, fmt: e => esc(e.gb ?? '') },
    { key: 'diff', label: 'DIFF', num: true, fmt: e => esc(e.diff ?? '') },
    { key: 'streak', label: 'STRK', num: true },
  ].filter(c => c.label !== '');
  return renderTable(`std-${t.key}`, cols, std.ours.entries, { rowClass: e => (e.us ? 'us hl' : '') });
}

async function tabOverview(t, { mount, alive }) {
  mount.innerHTML = `<div class="split"><div class="stack">
      <div class="card" id="ovGames">${spinner()}</div>
      <div class="card"><h3>Standings</h3><div id="ovStd">${spinner()}</div></div>
      <div class="card"><h3>Team leaders</h3><div id="ovLead">${spinner()}</div></div>
      <div class="card"><h3>Latest news</h3><div id="ovNews">${spinner()}</div></div>
    </div><div class="stack">
      <div class="card" id="ovPicture">${spinner('Loading playoff picture…')}</div>
      <div class="card" id="ovOutlook">${spinner('Building outlook…')}</div>
      <div class="card" id="ovCoach"></div>
      <div class="card"><h3>Franchise at a glance</h3>${glanceHtml(t)}</div>
      <div class="card"><h3>Did you know?</h3>${CUR.teamFacts[t.key].map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div>
    </div></div>`;
  const infoP = safe(API.team(t)), gsP = safe(API.gameStatus(t)), rosterP = safe(API.roster(t)), stdP = safe(API.standings(t)), leadP = (t.league === 'nba' ? API.nbaTable().then(tb => API.leaders(t, tb.fallback ? tb.year : null)) : API.leaders(t)).catch(() => []), newsP = safe(API.news(t, 6), []);

  safe(API.picture(t), null).then(pic => { if (alive()) $('#ovPicture').innerHTML = pic ? pictureCardHtml(pic, t) : '<h3>Playoff picture</h3><div class="muted small">Standings are not available right now.</div>'; });
  const drawGames = async () => {
    const gs = await gsP; if (!alive() || !gs) { if (alive()) $('#ovGames').innerHTML = errBox('Schedule data unavailable.'); return; }
    const played = gs.games.filter(g => g.state === 'post' && (g.stype !== 1 || gs.games.every(x => x.stype === 1)));
    const upcoming = gs.games.filter(g => g.state === 'pre' && g.stype !== 1).slice(0, 5);
    $('#ovGames').innerHTML = `<h3>Game center</h3><div class="grid g2">${gs.live ? gameBox(t, gs.live, 'LIVE') : gameBox(t, gs.next, 'NEXT')}${gameBox(t, gs.last, 'LAST')}</div>
      ${played.length ? `<div class="row" style="margin-top:14px"><span class="small muted">Recent form</span>${resultDots(played.slice(-8))}</div>` : ''}
      ${upcoming.length ? `<h4 style="margin-top:16px">Coming up</h4><div class="stack" style="gap:6px">${upcoming.map(g => `<div class="row between small"><span class="row" style="gap:8px"><img src="${esc(g.opp.logo)}" width="22" height="22" alt="" onerror="this.style.visibility='hidden'"> ${g.home ? 'vs' : '@'} ${esc(g.opp.name)}</span><span class="muted">${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))}${g.tv ? ' · ' + esc(g.tv) : ''}</span></div>`).join('')}</div>` : ''}
      <a class="btn small" style="margin-top:14px" href="#/team/${t.key}/schedule">Full schedule &amp; results →</a>`;
  };
  drawGames();
  App.every(() => alive() && drawGames(), 45000);

  stdP.then(s => { if (alive()) $('#ovStd').innerHTML = standingsTable(s, t); });
  leadP.then(l => {
    if (!alive()) return;
    $('#ovLead').innerHTML = l?.length ? `<div class="stars">${l.map(x => leaderTileHtml(t, x)).join('')}</div><p class="small dim" style="margin-top:8px">${t.league === 'nba' && l[0]?.year != null ? 'Last season. ' : ''}Tap a tile for the full leaderboard.</p>` : `<div class="muted small">Season leaders will appear once games have been played.</div>`;
  });
  newsP.then(n => { if (alive()) $('#ovNews').innerHTML = n?.length ? n.map(a => `<a class="news" href="${esc(a.link)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<div><div class="t">${esc(a.title)}</div><div class="small muted">${ago(a.date)}</div></div></a>`).join('') : errBox('No headlines right now.'); });

  const [info, gs, roster, std] = await Promise.all([infoP, gsP, rosterP, stdP]);
  if (!alive()) return;
  $('#ovOutlook').innerHTML = outlookHtml(t, info, gs, roster, std);
  const hc = roster?.coach;
  $('#ovCoach').innerHTML = `<h3>${t.league === 'mlb' ? 'Manager' : 'Head coach'}</h3>` + (t.league === 'mlb' ? '<div class="muted small">Loading…</div>' : hc ? `<div style="font-size:1.3rem;font-weight:700">${esc(hc.firstName)} ${esc(hc.lastName)}</div><div class="muted small">${hc.experience ? hc.experience + ' seasons as a head coach' : ''}</div><a class="btn small" style="margin-top:10px" href="#/team/${t.key}/coaches">Coaching history →</a>` : '<div class="muted small">Not available.</div>');
  if (t.league === 'mlb') { const st = await safe(API.mlbStaff(t), []); const m = st.find(x => /manager/i.test(x.job)); if (alive()) $('#ovCoach').innerHTML = `<h3>Manager</h3>${m ? `<div style="font-size:1.3rem;font-weight:700">${esc(m.name)}</div><div class="muted small">${esc(m.job)}</div>` : '<div class="muted small">Not available.</div>'}<a class="btn small" style="margin-top:10px" href="#/team/${t.key}/coaches">Staff &amp; managerial history →</a>`; }
}

function glanceHtml(t) {
  const x = H.totals(t.key), last = H.seasons(t.key).slice(-1)[0], best = H.bestSeasons(t.key, 1)[0];
  return `<dl class="kv"><dt>All-time record</dt><dd>${x.w}-${x.l}${x.t ? '-' + x.t : ''} (${fmtPct(x.pct)})</dd><dt>Seasons</dt><dd>${x.seasons} (${t.since}–${last.year})</dd><dt>Championships</dt><dd>${x.titles}</dd><dt>Finals trips</dt><dd>${x.titles + x.finals}</dd><dt>Playoff seasons</dt><dd>${x.playoffs}</dd><dt>Division titles</dt><dd>${x.divTitles}</dd><dt>Best season</dt><dd><a href="#/season/${t.key}/${best.year}">${esc(H.label(t, best))}</a> (${H.record(t, best)})</dd></dl>`;
}

function outlookHtml(t, info, gs, roster, std) {
  const rows = [];
  const played = (info?.w || 0) + (info?.l || 0) + (info?.tie || 0);
  const lastS = H.seasons(t.key).slice(-1)[0];
  if (played > 0) {
    const p = pct(info.w, info.l, info.tie), proj = Math.round(p * t.gamesInSeason);
    rows.push(['Current pace', `${info.summary} (${fmtPct(p)}) — on pace for ≈ <b>${proj}</b> wins in ${t.gamesInSeason} games`]);
  } else rows.push(['Current pace', 'Season has not started — no games played yet.']);
  if (info?.standingSummary) rows.push(['Standing', esc(info.standingSummary)]);
  rows.push([`Last completed season (${H.label(t, lastS)})`, `${H.record(t, lastS)} · ${esc(H.outcome(lastS))}`]);
  const recent = H.seasons(t.key).slice(-5);
  rows.push(['Last five seasons', `${sum(recent, s => s.w)}-${sum(recent, s => s.l)}${t.recordFmt === 'wlt' ? '-' + sum(recent, s => s.t) : ''}, ${recent.filter(s => s.result !== 'none').length} postseason trips, ${recent.filter(s => s.result === 'champion').length} title(s)`]);
  if (roster?.players?.length) {
    const ps = roster.players, ages = ps.map(p => p.age).filter(Boolean), avg = ages.length ? (sum(ages) / ages.length).toFixed(1) : null;
    if (avg) rows.push(['Roster age', `${avg} avg · ${ps.filter(p => p.age >= 31).length} players 31+`]);
    const inj = ps.filter(p => p.injuries.length);
    rows.push(['Health report', inj.length ? `${inj.length} on the injury report: ${inj.slice(0, 5).map(p => `<a href="javascript:void(0)" data-player="${p.id}" data-team="${t.key}">${esc(p.name)}</a> (${esc(p.injuries[0].status)})`).join(', ')}${inj.length > 5 ? '…' : ''}` : 'No players currently listed as injured']);
    const paid = ps.filter(p => p.salary).sort((a, b) => b.salary - a.salary);
    if (paid.length) { const total = sum(paid, p => p.salary); rows.push(['Payroll concentration', `${money(total)} tracked · top 3 (${paid.slice(0, 3).map(p => esc(p.last || p.name)).join(', ')}) = ${(sum(paid.slice(0, 3), p => p.salary) / total * 100).toFixed(0)}%`]); }
  }
  if (gs?.next) rows.push(['Next up', `${gs.next.home ? 'vs' : '@'} ${esc(gs.next.opp.name)} — ${esc(fmtDay(gs.next.date))}`]);
  return `<h3>Outlook</h3><dl class="kv" style="grid-template-columns:110px 1fr">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p class="disc">Auto-generated snapshot from live and historical data. It is context, not a prediction.</p>`;
}

/* ---------- Roster ---------- */
async function tabRoster(t, { mount, alive }) {
  const r = await API.roster(t); if (!alive()) return;
  App.rosters[t.key] = Promise.resolve(r);
  const players = r.players;
  const groups = uniq(players.map(p => p.group)).filter(Boolean);
  const state = { group: 'All', text: '', view: 'cards' };
  mount.innerHTML = `<div class="filters"><div class="chips" id="grpChips">${['All', ...groups].map(g => `<button class="chip ${g === 'All' ? 'on' : ''}" data-g="${esc(g)}">${esc(g)} <span class="dim">${g === 'All' ? players.length : players.filter(p => p.group === g).length}</span></button>`).join('')}</div>
    <label class="f">Search<input type="search" id="rsearch" placeholder="Name, position, college…"></label>
    <div class="seg" id="viewSeg" style="margin-left:auto"><button data-v="cards" class="on">▦ By position</button><button data-v="table">☰ Table</button></div>
    <span class="muted small" id="rcount"></span></div><div id="rtable"></div>
    <p class="disc">Live roster from ESPN (updated frequently). Click a player for bio, contract structure and career stats. Season ${esc(r.season?.displayName || '')}.</p>`;
  const cols = [
    { key: 'jersey', label: '#', num: true, sortVal: p => (p.jersey === '' ? 999 : +p.jersey), fmt: p => `<span class="jersey">${esc(p.jersey)}</span>` },
    { key: 'name', label: 'Player', fmt: p => `<div class="pname"><img src="${esc(p.headshot)}" loading="lazy" alt="" onerror="this.style.visibility='hidden'"><span>${esc(p.name)}</span></div>` },
    { key: 'pos', label: 'Pos' }, { key: 'group', label: 'Unit', cls: 'muted' },
    { key: 'age', label: 'Age', num: true }, { key: 'height', label: 'Ht', num: true, sortVal: p => parseFloat((p.height || '').replace(/\D+/g, '.')) || 0 }, { key: 'weight', label: 'Wt', num: true, sortVal: p => parseInt(p.weight) || 0 },
    { key: 'exp', label: 'Exp', num: true, fmt: p => (p.exp == null ? '' : p.exp === 0 ? 'R' : p.exp) }, { key: 'college', label: 'College', cls: 'muted' },
    ...(t.league !== 'mlb' ? [{ key: 'salary', label: 'Salary', num: true, fmt: p => (p.salary ? money(p.salary) : '—') }, { key: 'through', label: 'Thru', num: true, fmt: p => p.through || (p.contracts.length ? Math.max(...p.contracts.filter(c => c.salary > 0).map(c => c.year), 0) || '' : '') }] : []),
    { key: 'status', label: 'Status', fmt: p => (p.injuries.length ? `<span class="badge bad">${esc(p.injuries[0].status)}</span>` : p.status !== 'Active' ? `<span class="badge">${esc(p.status)}</span>` : '') },
  ];
  const draw = () => {
    const tx = state.text.toLowerCase();
    const rows = players.filter(p => (state.group === 'All' || p.group === state.group) && (!tx || `${p.name} ${p.pos} ${p.college} ${p.jersey}`.toLowerCase().includes(tx)));
    if (state.view === 'cards') {
      $('#rtable').innerHTML = groupedRosterHtml(t, rows);

    } else $('#rtable').innerHTML = renderTable(`roster-${t.key}`, cols, rows, { sortKey: 'jersey', rowClass: () => 'click', rowAttr: p => `data-player="${p.id}" data-team="${t.key}" data-name="${esc(p.name)}"` });
    $('#rcount').textContent = `${rows.length} players`;
  };
  $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; state.view = b.dataset.v; $$('#viewSeg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#grpChips').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; state.group = b.dataset.g; $$('#grpChips .chip').forEach(c => c.classList.toggle('on', c === b)); draw(); });
  $('#rsearch').addEventListener('input', debounce(e => { state.text = e.target.value; draw(); }, 120));
  draw();
}

/* ---------- Depth chart ---------- */
async function tabDepth(t, { mount, alive }) {
  const [d, r] = await Promise.all([API.depth(t), safe(API.roster(t))]); if (!alive()) return;
  const byId = new Map((r?.players || []).map(p => [String(p.id), p]));
  if (!d.charts.length) { mount.innerHTML = errBox('No depth chart is published right now.'); return; }
  let lines = null, idx = 0;
  const lineFor = p => lines ? (lines.lines.get(String(p.id)) || lines.byName.get(normName(p.name)) || '') : null;
  const draw = () => {
    const ch = d.charts[idx];
    $('#depthBody').innerHTML = `<div class="depth-grid wide">${ch.rows.map(row => `<div class="depth-pos"><h4><span>${esc(row.abbr)}</span><span class="dim small" style="text-transform:none;letter-spacing:0;font-family:var(--font)">${esc(row.label)}</span></h4><ol>${row.players.map((p, i) => {
      const pl = byId.get(String(p.id)), ln = lineFor(p);
      const meta = [pl?.jersey ? `#${pl.jersey}` : '', pl?.age ? `Age ${pl.age}` : '', pl?.exp != null ? (pl.exp === 0 ? 'Rookie' : `${pl.exp} yr${pl.exp === 1 ? '' : 's'}`) : '', pl?.height || ''].filter(Boolean).join(' · ');
      return `<li data-player="${p.id}" data-team="${t.key}" data-name="${esc(p.name)}" class="${i === 0 ? 'starter' : ''}"><span class="rank">${i + 1}</span><img src="${headshot(t, p.id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div class="dp"><div class="dn">${esc(p.name)}${pl?.injuries?.length ? ` <span class="badge bad">${esc(pl.injuries[0].status)}</span>` : ''}</div><div class="dm">${esc(meta)}</div>${ln === null ? '<div class="ds dim">Loading stats…</div>' : ln ? `<div class="ds">${esc(ln)}</div>` : `<div class="ds dim">${esc(lines.empty || 'No stats yet this season')}</div>`}</div></li>`;
    }).join('')}</ol></div>`).join('')}</div>`;
  };
  mount.innerHTML = `<div class="filters"><div class="seg" id="dchips">${d.charts.map((c, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}">${esc(c.name)}</button>`).join('')}</div><span class="muted small" id="dlabel"></span></div><div id="depthBody"></div>
    <p class="disc">Depth chart from ESPN (1 = starter, highlighted). Each player shows jersey, age, experience and their season stat line. Tap a player for the full profile.</p>`;
  $('#dchips').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; $$('#dchips button').forEach(c => c.classList.toggle('on', c === b)); idx = +b.dataset.i; draw(); });
  draw();
  lines = await safe(API.depthLines(t), { lines: new Map(), byName: new Map(), label: '' }); if (!alive()) return;
  $('#dlabel').textContent = lines.label ? `Stats: ${lines.label}` : ''; draw();
}

/* ---------- Contracts ---------- */
async function tabContracts(t, { mount, alive }) {
  if (t.league === 'mlb') return tabContractsMlb(t, { mount, alive });
  const r = await API.roster(t); if (!alive()) return;
  const ps = r.players.filter(p => p.salary != null || p.contracts.length);
  if (!ps.length) { mount.innerHTML = errBox('No contract data is published right now.'); return; }
  const cur = mode(ps.map(p => p.salaryYear).filter(Boolean)) || new Date().getFullYear();
  const paid = ps.filter(p => p.salary).sort((a, b) => b.salary - a.salary);
  const total = sum(paid, p => p.salary), avg = total / (paid.length || 1);
  const years = [0, 1, 2, 3, 4, 5].map(i => cur + i);
  const hasFuture = ps.some(p => p.contracts.some(c => c.year > cur && c.salary > 0));
  const commit = years.map(y => ({ label: yearLabel(t, y), value: sum(ps, p => p.contracts.find(c => c.year === y)?.salary || 0) }));
  const thru = p => p.through || (p.yearsRemaining != null && p.salary ? cur + p.yearsRemaining : null);
  const expYears = uniq(ps.map(thru).filter(Boolean)).sort();
  const remainTotal = sum(ps, p => p.salaryRemaining || 0), useMoney = remainTotal > 0;
  const expiry = expYears.filter(y => y >= cur).map(y => ({ label: yearLabel(t, y), value: sum(ps.filter(p => thru(p) === y), p => (useMoney ? p.salaryRemaining : p.salary) || 0), count: ps.filter(p => thru(p) === y).length }));
  const future = hasFuture ? sum(commit.slice(1), c => c.value) : useMoney ? remainTotal : sum(ps.filter(p => (p.yearsRemaining || 0) > 0), p => p.salary || 0);
  const chartCard = hasFuture
    ? `<div class="card"><h3>Future commitments by year</h3>${Charts.bars(commit, { fmt: money, w: 700, h: 240, hi: 0 })}<p class="small muted">Sum of contract years already on the books for players on the roster (excludes future free-agent signings).</p></div>`
    : `<div class="card"><h3>Contract expirations</h3>${Charts.bars(expiry.map(x => ({ label: x.label, value: x.value, title: `${x.count} player(s) signed through ${x.label}: ${money(x.value)}` })), { fmt: money, w: 700, h: 240 })}<p class="small muted">${useMoney ? 'Dollars still owed to players' : `${yearLabel(t, cur)} salary of players`}, grouped by the year their contract runs through. Player counts: ${expiry.map(x => `${x.label}: ${x.count}`).join(' · ')}.</p></div>`;
  mount.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      <div class="stat-tile"><div class="v">${money(total)}</div><div class="l">${yearLabel(t, cur)} salaries tracked</div></div>
      <div class="stat-tile"><div class="v">${esc(paid[0]?.last || '')} ${money(paid[0]?.salary)}</div><div class="l">Highest paid</div></div>
      <div class="stat-tile"><div class="v">${money(avg)}</div><div class="l">Average salary</div></div>
      <div class="stat-tile"><div class="v">${money(future)}</div><div class="l">${hasFuture ? `Committed beyond ${yearLabel(t, cur)}` : useMoney ? 'Total remaining on contracts' : `${yearLabel(t, cur)} salary of players signed beyond it`}</div></div>
    </div>
    <div class="split">${chartCard}
    <div class="card"><h3>Top 10 salaries · ${yearLabel(t, cur)}</h3>${Charts.hbars(paid.slice(0, 10).map(p => ({ label: p.name, html: `<a href="javascript:void(0)" data-player="${p.id}" data-team="${t.key}">${esc(p.name)}</a>`, value: p.salary })), { fmt: money })}</div></div>
    <div class="section"><h2>Contract structure</h2><div id="ctable"></div><p class="disc">Data via ESPN. Salary figures are what ESPN reports for each contract year and can differ from official cap hits${hasFuture ? '' : '; ESPN publishes future years only as a total ("remaining") and a signed-through year'}. For full breakdowns (signing bonus, guarantees, dead money) see <a href="${t.spotrac}" target="_blank" rel="noopener">Spotrac</a>${t.league === 'nfl' ? ` or <a href="${t.otc}" target="_blank" rel="noopener">OverTheCap</a>` : ` or <a href="${t.otc}" target="_blank" rel="noopener">Basketball-Reference</a>`}.</p></div>`;
  const yc = (hasFuture ? years.slice(0, 5) : [cur]).map(y => ({ key: 'y' + y, label: yearLabel(t, y), num: true, sortVal: p => p.contracts.find(c => c.year === y)?.salary ?? p.salary ?? -1, fmt: p => { const c = p.contracts.find(c => c.year === y); const v = c?.salary || (y === cur ? p.salary : 0); return v ? `<span style="${y === cur ? 'font-weight:700' : ''}">${money(v)}</span>` : '<span class="dim">—</span>'; } }));
  const cols = [
    { key: 'name', label: 'Player', fmt: p => `<div class="pname"><img src="${esc(p.headshot)}" loading="lazy" alt="" onerror="this.style.visibility='hidden'"><span>${esc(p.name)}</span></div>` },
    { key: 'pos', label: 'Pos' }, { key: 'age', label: 'Age', num: true }, ...yc,
    { key: 'yearsRemaining', label: 'Yrs left', num: true, fmt: p => p.yearsRemaining ?? '' },
    { key: 'thru', label: 'Through', num: true, sortVal: p => thru(p) ?? 0, fmt: p => (thru(p) ? yearLabel(t, thru(p)) : '') },
    { key: 'salaryRemaining', label: 'Remaining $', num: true, fmt: p => (p.salaryRemaining ? money(p.salaryRemaining) : '') },
    { key: 'avgLeft', label: 'Avg / yr left', num: true, sortVal: p => (p.salaryRemaining && p.yearsRemaining ? p.salaryRemaining / p.yearsRemaining : 0), fmt: p => (p.salaryRemaining && p.yearsRemaining ? money(p.salaryRemaining / p.yearsRemaining) : '') },
  ];
  $('#ctable').innerHTML = renderTable(`contracts-${t.key}`, cols, ps.map(p => ({ ...p })), { sortKey: 'y' + cur, sortDir: -1, rowClass: () => 'click', rowAttr: p => `data-player="${p.id}" data-team="${t.key}"` });
}
function mode(a) { const m = {}; a.forEach(x => (m[x] = (m[x] || 0) + 1)); return +Object.keys(m).sort((x, y) => m[y] - m[x])[0]; }

async function tabContractsMlb(t, { mount, alive }) {
  mount.innerHTML = `<div class="card"><h3>Major contracts</h3>
    <p class="muted">Major League Baseball does not publish player salaries through any free public data feed, so live payroll figures are not available on this site. Below is a hand-maintained reference for the club's largest commitments. Please verify current numbers before relying on them.</p>
    ${renderTable('mlb-contracts', [
    { key: 'name', label: 'Player' }, { key: 'pos', label: 'Pos' }, { key: 'term', label: 'Contract' }, { key: 'years', label: 'Years' },
    { key: 'aav', label: 'Avg / year', num: true, fmt: c => `$${c.aav.toFixed(1)}M` },
  ], CUR.mlbContracts, { sortKey: 'aav', sortDir: -1 })}
    <div class="row" style="margin-top:16px"><a class="btn" href="${t.spotrac}" target="_blank" rel="noopener">Full payroll on Spotrac ↗</a><a class="btn" href="${t.otc}" target="_blank" rel="noopener">Cot's Contracts ↗</a></div>
    <p class="disc">Snapshot compiled from public reports; it may be out of date after recent extensions, trades or free-agent signings.</p></div>
    <div class="section"><h2>Average annual value</h2><div class="card">${Charts.hbars(CUR.mlbContracts.map(c => ({ label: c.name, value: c.aav })), { fmt: v => `$${v.toFixed(1)}M` })}</div></div>`;
}

/* ---------- Stats ---------- */
async function tabStats(t, { mount, alive }) {
  const isMlb = !!t.mlbId;
  const [s, roster, nbaTbl] = await Promise.all([safe(API.teamStats(t)), safe(API.roster(t)), t.league === 'nba' ? safe(API.nbaTable()) : Promise.resolve(null)]); if (!alive()) return;
  const rmap = new Map((roster?.players || []).map(p => [normName(p.name), p.id]));
  const nbaStart = nbaTbl ? (nbaTbl.fallback ? nbaTbl.year : nbaTbl.year) : null;
  const seasons = isMlb ? [] : t.league === 'nba' ? [[nbaStart, `${nbaStart}–${String(nbaStart + 1).slice(2)}${nbaTbl?.fallback ? ' (last season)' : ''}`], [nbaStart - 1, `${nbaStart - 1}–${String(nbaStart).slice(2)}`]] : [[null, `${nowYear()} season`], [nowYear() - 1, `${nowYear() - 1}`]];
  mount.innerHTML = `
    <div class="section" style="margin-top:0"><h2>${isMlb ? 'Player performance' : 'Player stats'}</h2><p class="section-sub">${isMlb ? 'Every hitter and pitcher graded against the league, with who is hot and who is struggling.' : 'Click any player for career stats, contract and bio.'}</p>
      ${isMlb ? '<div id="pstats"></div>' : `<div class="filters" style="padding:10px 14px"><div class="seg" id="ysSeg">${seasons.map(([y, l], i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>${nbaTbl?.fallback ? `<span class="muted small">The new NBA season hasn't started, so this is last season.</span>` : ''}${t.league !== 'mlb' ? `<span class="muted small">Shows the team's season leaders and the players who played for the team that year; players with very few games can be missing.</span>` : ''}</div><div class="card" id="pstats"></div>`}</div>
    ${isMlb ? '' : `<div class="section"><h2>${t.nick} in the league's top 10</h2><div id="rankBox">${spinner()}</div></div><div class="section"><h2>Stars of the season</h2><div id="starsBox">${spinner()}</div></div>`}
    <div class="section"><h2>Team statistics</h2>
    ${s?.cats?.length ? `<div class="filters"><div class="chips" id="sideChips"><button class="chip on" data-s="team">${esc(t.nick)}</button><button class="chip" data-s="opp">Opponents</button></div><span class="muted small">${esc(s.season?.displayName || '')} ${esc(s.season?.name || '')}</span></div><div id="statBody"></div>` : errBox('Team statistics are not available yet for this season.')}</div>`;
  if (isMlb) mlbProStatsView(t, $('#pstats'), alive, rmap);
  else {
    const refresh = async year => {
      playerStatsPanel(t, year, $('#pstats'));
      starsHtml(t, year).then(h => alive() && ($('#starsBox').innerHTML = h));
      $('#rankBox').innerHTML = spinner();
      const groups = await safe(API.leagueLeaders(t.league, year), []); if (!alive()) return;
      const mine = (groups || []).flatMap(g => g.lists.map(l => l.rows.filter(r => r.philly).map(r => ({ ...r, cat: l.label, main: l.main, lbKey: l.key, start: l.start })))).flat();
      $('#rankBox').innerHTML = mine.length ? `<div class="stars">${mine.map(r => `<button class="star" data-lb="${t.league}|${r.lbKey}|${r.start ?? ''}"><img src="${esc(r.head || '')}" alt="" onerror="this.style.visibility='hidden'"><div><div class="v">#${r.rank} · ${esc(r.value)}</div><div class="c">${esc(r.cat)}</div><div class="n">${esc(r.name)}</div></div><span class="go">›</span></button>`).join('')}</div>` : `<div class="muted small">No ${t.nick} players in the league's top 10 of the major categories.</div>`;


    };
    $('#ysSeg').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; $$('#ysSeg button').forEach(x => x.classList.toggle('on', x === b)); refresh(seasons[+b.dataset.i][0]); });
    refresh(seasons[0][0]);
  }
  if (!s?.cats?.length) return;
  const draw = side => {
    const cats = side === 'team' ? s.cats : s.opp;
    $('#statBody').innerHTML = cats.filter(c => c.stats.length).map((c, i) => `<details class="acc" ${i < 3 ? 'open' : ''}><summary>${esc(c.name)}</summary><div class="inner"><div class="stat-list">${c.stats.map(x => `<div class="s"><span>${esc(x.label)}</span><span><b>${esc(x.value)}</b>${x.rank ? ` <span class="dim small">${esc(x.rank)}</span>` : ''}</span></div>`).join('')}</div></div></details>`).join('');
  };
  $('#sideChips').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; $$('#sideChips .chip').forEach(c => c.classList.toggle('on', c === b)); draw(b.dataset.s); });
  draw('team');
}

/* ---------- Schedule & results ---------- */
async function tabSchedule(t, { mount, alive, q }) {
  const yrs = H.seasons(t.key).map(s => s.year).reverse();
  const curYear = new Date().getFullYear();
  mount.innerHTML = `<div class="filters"><label class="f">Season<select id="schedYear"><option value="cur">Current season</option>${yrs.map(y => `<option value="${y}" ${String(q.y) === String(y) ? 'selected' : ''}>${esc(seasonLabel(t, y))}</option>`).join('')}</select></label>
    <div class="chips" id="schedF">${['All', 'Home', 'Away', 'Wins', 'Losses', 'Postseason'].map((f, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div></div><div id="schedBody">${spinner()}</div>`;
  let games = [], filter = 'All', season = null;
  const paint = () => {
    const f = games.filter(g => filter === 'All' || (filter === 'Home' && g.home) || (filter === 'Away' && !g.home) || (filter === 'Wins' && g.result === 'W') || (filter === 'Losses' && g.result === 'L') || (filter === 'Postseason' && g.stype === 3));
    let w = 0, l = 0, tie = 0; const recMap = new Map();
    games.forEach(g => { if (g.result === 'W') w++; else if (g.result === 'L') l++; else if (g.result === 'T') tie++; if (g.state === 'post') recMap.set(g.id, g.stype === 3 ? '' : (t.recordFmt === 'wlt' && tie ? `${w}-${l}-${tie}` : `${w}-${l}`)); });
    const done = games.filter(g => g.state === 'post' && g.ourScore != null);
    const reg = games.filter(g => g.stype === 2 || g.stype === 1 && games.every(x => x.stype === 1));
    const regGames = reg.filter(g => g.state === 'post'), rw = regGames.filter(g => g.result === 'W').length, rl = regGames.filter(g => g.result === 'L').length;
    const partial = season != null && season < curYear && !t.mlbId && games.filter(g => g.stype === 2).length < t.gamesInSeason - 1;
    const margins = done.map(g => ({ label: '', value: g.ourScore - g.oppScore, color: g.result === 'W' ? 'var(--good)' : g.result === 'L' ? 'var(--bad)' : 'var(--warn)', title: `${fmtDate(g.date)} ${g.home ? 'vs' : '@'} ${g.opp.name}: ${g.ourScore}-${g.oppScore}` }));
    const cols = [
      { key: 'ts', label: 'Date', sortVal: g => g.ts, fmt: g => `<span>${esc(fmtDate(g.date, { month: 'short', day: 'numeric', year: 'numeric' }))}</span>` },
      { key: 'label', label: 'Round', cls: 'muted', fmt: g => esc(g.label) },
      { key: 'opp', label: 'Opponent', sortVal: g => g.opp.name, fmt: g => `<div class="pname"><span class="dim" style="min-width:22px">${g.home ? 'vs' : '@'}</span><img src="${esc(g.opp.logo)}" style="border-radius:0;background:none;width:24px;height:24px;object-fit:contain" alt="" loading="lazy" onerror="this.style.visibility='hidden'">${esc(g.opp.name)}</div>` },
      { key: 'result', label: 'Result', fmt: g => (g.state === 'post' ? `<a href="${esc(g.link)}" target="_blank" rel="noopener">${resultChip(g)}</a>` : g.state === 'in' ? `<span class="badge live">${esc(g.detail)}</span> ${g.ourScore ?? 0}–${g.oppScore ?? 0}` : `<span class="muted">${esc(fmtTime(g.date))}</span>`) },
      { key: 'rec', label: 'Record', num: true, sortVal: g => g.ts, fmt: g => esc(recMap.get(g.id) || '') },
      { key: 'tv', label: 'TV', cls: 'muted', fmt: g => esc(g.tv || '') },
      { key: 'venue', label: 'Venue', cls: 'muted', fmt: g => esc(g.venue || '') },
    ];
    $('#schedBody').innerHTML = `${games.length ? `<div class="grid g3" style="margin-bottom:14px"><div class="stat-tile"><div class="v">${rw}-${rl}${t.recordFmt === 'wlt' && regGames.some(g => g.result === 'T') ? '-' + regGames.filter(g => g.result === 'T').length : ''}</div><div class="l">Regular season · ${esc(seasonLabel(t, season ?? curYear))}</div></div><div class="stat-tile"><div class="v">${sum(done, g => g.ourScore)}–${sum(done, g => g.oppScore)}</div><div class="l">Scored – allowed</div></div><div class="stat-tile"><div class="v">${games.filter(g => g.stype === 3).length ? games.filter(g => g.stype === 3 && g.result === 'W').length + '-' + games.filter(g => g.stype === 3 && g.result === 'L').length : '—'}</div><div class="l">Postseason</div></div></div>
      ${margins.length ? `<div class="card" style="margin-bottom:14px"><h3>Margin by game</h3>${Charts.bars(margins, { w: 900, h: 170, fmt: v => v, pad: { l: 40, r: 6, t: 10, b: 8 } })}<div class="legend"><span><i style="background:var(--good)"></i>Win</span><span><i style="background:var(--bad)"></i>Loss</span><span>Bar height = final margin (${t.mlbId ? 'runs' : 'points'})</span></div></div>` : ''}
      ${partial ? `<div class="errbox" style="margin-bottom:12px">ESPN's archive has only ${games.filter(g => g.stype === 2).length} of ${t.gamesInSeason} regular-season games for this season. Season totals are on the <a href="#/season/${t.key}/${season}">season page</a>.</div>` : ''}
      ${renderTable('sched', cols, f, { sortKey: 'ts', rowClass: g => (g.state === 'in' ? 'hl' : g.result === 'W' ? '' : '') })}` : errBox('No games found for this season.')}`;
  };
  const load = async v => {
    $('#schedBody').innerHTML = spinner();
    const yr = v === 'cur' ? null : +v;
    const r = await safe(API.schedule(t, yr), null); if (!alive()) return;
    if (!r) { $('#schedBody').innerHTML = errBox('Schedule unavailable.'); return; }
    games = r.games; season = yr; if (renderTable.state.sched) renderTable.state.sched.key = 'ts'; paint();
  };
  $('#schedYear').addEventListener('change', e => load(e.target.value));
  $('#schedF').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; $$('#schedF .chip').forEach(c => c.classList.toggle('on', c === b)); paint(); });
  load(q.y || 'cur');
}
