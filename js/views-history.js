/* History (timeline + table), Year explorer, Season detail */
const TEAM_COL = TEAM_HEX;

async function liveSeasonRow(t) {
  const info = await safe(API.team(t)); if (!info) return null;
  const games = info.w + info.l + info.tie; if (!games) return null;
  const now = new Date(), year = t.league === 'nba' ? (now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1) : now.getFullYear();
  if (H.find(t.key, year)) return null;
  return { team: t.key, year, label: t.league === 'nba' ? `${year}–${String(year + 1).slice(2)}` : String(year), w: info.w, l: info.l, t: info.tie, pct: pct(info.w, info.l, info.tie), finish: info.standingSummary, coaches: [], post: [], awards: [], result: 'none', live: true };
}

/* ---------- History: Timeline / Table ---------- */
async function historyExplorer({ mount, alive, q, teams, fixedTeam }) {
  const yr = H.years();
  const st = { view: q.view === 'table' ? 'table' : 'timeline', teams: new Set(q.team ? q.team.split(',').filter(k => TEAMS[k]) : teams), result: q.result || 'all', decade: q.decade ? +q.decade : null, text: q.text || '' };
  if (q.text) st.view = 'table';
  const live = (await Promise.all(TEAM_KEYS.map(k => liveSeasonRow(TEAMS[k])))).filter(Boolean);
  if (!alive()) return;
  const decades = uniq([...Array(Math.floor((yr.max - yr.min) / 10) + 1)].map((_, i) => Math.floor(yr.min / 10) * 10 + i * 10));

  mount.innerHTML = `
    <div class="row between" style="margin-bottom:16px;gap:14px">
      ${fixedTeam ? '<div></div>' : `<div class="chips" id="hTeams">${TEAM_KEYS.map(k => `<button class="chip ${st.teams.has(k) ? 'on' : ''}" data-k="${k}"><i class="dot" style="background:${TEAM_HEX[k]}"></i>${TEAMS[k].nick}</button>`).join('')}</div>`}
      <div class="seg" id="hView"><button data-v="timeline" class="${st.view === 'timeline' ? 'on' : ''}">◔ Timeline</button><button data-v="table" class="${st.view === 'table' ? 'on' : ''}">☰ Table</button></div>
    </div>
    <div id="hTimeline"></div>
    <div id="hTableBox">
      <div class="filters" id="hFilt">
        <div><div class="small muted" style="margin-bottom:4px;font-weight:800;letter-spacing:.07em;font-size:.7rem;text-transform:uppercase">Show</div><div class="seg" id="hRes">${[['all', 'All seasons'], ['champion', 'Champions'], ['finals', 'Finals'], ['playoffs', 'Playoffs']].map(([v, l]) => `<button data-v="${v}" class="${st.result === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <label class="f">Decade<select id="hDec"><option value="">All years</option>${decades.map(d => `<option value="${d}" ${st.decade === d ? 'selected' : ''}>${d}s</option>`).join('')}</select></label>
        <label class="f grow">Search coach or award<input type="search" id="hText" placeholder="e.g. Andy Reid, MVP…" value="${esc(st.text)}"></label>
        <span class="muted small" id="hCount" style="align-self:center"></span>
      </div>
      <div id="hTable"></div>
    </div>`;

  const paintTimeline = () => {
    const keys = TEAM_KEYS.filter(k => st.teams.has(k));
    $('#hTimeline').innerHTML = keys.map(k => `<div style="margin-bottom:18px">${timelineCardHtml(k)}</div>`).join('');
    wireTimelines($('#hTimeline'));
  };
  const rows = () => {
    let r = TEAM_KEYS.filter(k => st.teams.has(k)).flatMap(k => H.seasons(k).map(s => ({ ...s, team: k, teamName: TEAMS[k].nick, pctV: H.pctOf(s), coach: s.coaches.join(' / '), outcome: H.outcome(s), decade: H.decadeOf(s.year) })));
    const lv = live.filter(x => st.teams.has(x.team)).map(x => ({ ...x, teamName: TEAMS[x.team].nick, pctV: x.pct, coach: '', outcome: 'In progress' }));
    if (st.result === 'all' && !st.decade && !st.text) r = [...lv, ...r];
    if (st.decade) r = r.filter(x => x.decade === st.decade);
    if (st.result === 'champion') r = r.filter(x => x.result === 'champion');
    else if (st.result === 'finals') r = r.filter(x => x.result === 'champion' || x.result === 'finalist');
    else if (st.result === 'playoffs') r = r.filter(x => x.result !== 'none');
    const tx = st.text.trim().toLowerCase();
    if (tx) r = r.filter(x => `${x.coach} ${x.awards.join(' ')} ${x.post.join(' ')}`.toLowerCase().includes(tx));
    return r;
  };
  const paintTable = () => {
    const r = rows(), multi = st.teams.size > 1;
    $('#hCount').textContent = `${fmtInt(r.length)} seasons · ${r.filter(x => x.result === 'champion').length} titles`;
    const cols = [
      { key: 'year', label: 'Season', sortVal: x => x.year, fmt: x => `<a href="#/season/${x.team}/${x.year}"><b>${esc(x.label)}</b></a>${x.live ? ' <span class="badge live">live</span>' : ''}` },
      ...(multi ? [{ key: 'teamName', label: 'Team', fmt: x => `<div class="pname"><img src="${teamLogo(TEAMS[x.team])}" style="border-radius:0;background:none;border:0;width:24px;height:24px;object-fit:contain" alt="">${esc(x.teamName)}</div>` }] : []),
      { key: 'w', label: 'Record', num: true, sortVal: x => x.w, fmt: x => `<b>${esc(H.record(TEAMS[x.team], x))}</b>` },
      { key: 'outcome', label: 'Result', fmt: x => (x.result === 'champion' ? `<span class="badge gold">🏆 Champions</span>` : x.result === 'finalist' ? `<span class="badge" style="background:#fff1e6;color:#8a4b12">${esc(x.outcome)}</span>` : x.result === 'playoffs' ? `<span class="badge good">${esc(x.outcome)}</span>` : `<span class="dim">${x.live ? 'In progress' : 'Missed playoffs'}</span>`) },
      { key: 'coach', label: 'Coach / Manager', cls: 'muted', fmt: x => esc(x.coach) },
    ];
    $('#hTable').innerHTML = renderTable('hist-' + (fixedTeam || 'all'), cols, r, { sortKey: 'year', sortDir: -1, rowClass: x => (x.result === 'champion' ? 'hl click' : 'click'), rowAttr: x => `onclick="location.hash='#/season/${x.team}/${x.year}'"` });
  };
  const show = () => { $('#hTimeline').style.display = st.view === 'timeline' ? '' : 'none'; $('#hTableBox').style.display = st.view === 'table' ? '' : 'none'; if (st.view === 'timeline') paintTimeline(); else paintTable(); };

  $('#hView').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; $$('#hView button').forEach(x => x.classList.toggle('on', x === b)); show(); });
  $('#hRes').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.result = b.dataset.v; $$('#hRes button').forEach(x => x.classList.toggle('on', x === b)); paintTable(); });
  $('#hDec').addEventListener('change', e => { st.decade = e.target.value ? +e.target.value : null; paintTable(); });
  $('#hText').addEventListener('input', debounce(e => { st.text = e.target.value; paintTable(); }, 150));
  $('#hTeams')?.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    if (st.teams.has(b.dataset.k) && st.teams.size === 1) return;
    st.teams.has(b.dataset.k) ? st.teams.delete(b.dataset.k) : st.teams.add(b.dataset.k);
    $$('#hTeams .chip').forEach(c => c.classList.toggle('on', st.teams.has(c.dataset.k))); show();
  });
  show();
}

/* ---------- History hub ---------- */
async function viewHistoryHub({ q, mount, alive }) {
  const yr = H.years(), tot = TEAM_KEYS.map(k => ({ k, ...H.totals(k) }));
  mount.innerHTML = `<div class="hero slim"><div class="tri"><span></span><span></span><span></span></div><h1>Franchise overview</h1><p class="lede" style="margin:0">Every season since ${yr.min}. Use the <b>Timeline</b> to see the big years and click any of them, or switch to the <b>Table</b> to filter and sort.</p></div>
    <div class="section"><h2>The three franchises</h2><div class="grid g3">${tot.map(x => `<a class="card" href="#/team/${x.k}/history" style="border-top:5px solid ${TEAM_HEX[x.k]}"><div class="row" style="gap:12px;margin-bottom:10px"><img src="${teamLogo(TEAMS[x.k])}" width="46" height="46" alt=""><div><h3 style="margin:0">${TEAMS[x.k].nick}</h3><div class="muted small">${fmtInt(x.seasons)} seasons since ${TEAMS[x.k].since}</div></div></div>
      <div class="row" style="gap:22px"><div><div style="font-family:var(--display);font-size:2rem;font-weight:700;line-height:1;color:var(--gold)">${x.titles}</div><div class="muted small">titles</div></div><div><div style="font-family:var(--display);font-size:2rem;font-weight:700;line-height:1">${x.titles + x.finals}</div><div class="muted small">finals trips</div></div><div><div style="font-family:var(--display);font-size:2rem;font-weight:700;line-height:1">${fmtInt(x.playoffs)}</div><div class="muted small">playoff seasons</div></div></div></a>`).join('')}</div></div>
    <div class="section"><h2>Season by season</h2><div id="hx"></div></div>`;
  await historyExplorer({ mount: $('#hx'), alive, q, teams: TEAM_KEYS });
}

/* ---------- Year explorer ---------- */
function leagueChampStrip(t, year) {
  const c = H.champ(t, year);
  if (!c) return `<div class="stat-tile"><div class="l">${CHAMP_TITLES[t.champKey][1]}</div><div class="muted small" style="margin-top:6px">No league championship recorded.</div></div>`;
  const philWin = /Philadelphia (Eagles|Phillies|76ers)|Syracuse Nationals/.test(c.winner);
  return `<div class="stat-tile" style="${philWin ? 'border:2px solid var(--gold);background:#fdf3d3' : ''}"><div class="l">${esc(c.game)} · ${CHAMP_TITLES[t.champKey][1]} ${t.league === 'nba' ? seasonLabel(t, year) : year} season</div><div class="v" style="font-size:1.35rem;margin-top:6px;${philWin ? 'color:#4a3500' : ''}">${philWin ? '🏆 ' : ''}${esc(c.winner)}</div><div class="small muted">def. ${esc(c.loser)} ${esc(c.score)}${c.mvp ? ` · MVP ${esc(c.mvp)}` : ''}</div></div>`;
}

function yearTeamSection(k, s, year) {
  const t = TEAMS[k], n = H.notes(k, s.year), c = H.champ(t, s.year);
  return `<section class="ysec" id="ys-${k}" style="--c1:${t.primary}">
    <div class="yhd"><img src="${teamLogoOn(t)}" alt=""><div><h3>${esc(H.label(t, s))} ${esc(t.nick)}</h3><div class="small" style="opacity:.9">${s.result === 'champion' ? `🏆 ${esc(c?.game || 'Champions')}` : esc(H.outcome(s))}${s.finish ? ' · ' + esc(s.finish) + (s.div ? ' ' + esc(s.div) : '') : ''}</div></div>
      <div class="rc">${H.record(t, s)}<small>${t.league === 'mlb' ? 'Manager' : 'Coach'}: ${esc(s.coaches.join(' & ') || '—')}</small></div></div>
    <div class="ybd">
      <div class="ycol">
        <h4>What happened</h4>
        ${n ? `<p style="font-weight:700;font-size:1.05rem;margin-bottom:4px">${esc(n.t)}</p><p class="story">${esc(n.s)}</p>${(n.f || []).map(f => `<div class="fact">${esc(f)}</div>`).join('')}` : `<p class="story">${H.autoStory(t, s)}</p>`}
        ${s.post.length ? `<h4>Postseason path</h4>${H.path(s).map(p => `<div class="pathrow">${esc(p)}</div>`).join('')}` : ''}
        ${s.awards.length ? `<h4>Awards</h4><p style="margin:0">${s.awards.map(esc).join('<br>')}</p>` : ''}
        <h4>Big moments from the game log</h4><div id="hl-${k}" class="muted small">Loading…</div>
        <a class="btn small" style="margin-top:14px" href="#/season/${k}/${s.year}">Full season page →</a>
      </div>
      <div class="ycol">
        <h4>Stars of the season</h4><div id="stars-${k}">${spinner('Loading players…')}</div>
        <h4>Player stats</h4><div id="ps-${k}"></div>
      </div>
    </div></section>`;
}

async function viewYear({ parts, q, mount, alive }) {
  const yr = H.years(), cur = new Date().getFullYear();
  let year = Math.min(Math.max(+parts[1] || yr.max, yr.min), cur + 1);
  const sel = new Set(q.teams ? q.teams.split(',').filter(k => TEAMS[k]) : TEAM_KEYS);
  const cards = TEAM_KEYS.filter(k => sel.has(k)).map(k => ({ k, s: H.find(k, year) })), have = cards.filter(c => c.s);
  const champs = have.filter(c => c.s.result === 'champion').map(c => TEAMS[c.k].nick);
  const madeAll = TEAM_KEYS.every(k => H.find(k, year) && H.find(k, year).result !== 'none');
  const headline = champs.length ? `${year}: the ${champs.join(' and ')} won it all.` : madeAll ? `${year}: all three Philadelphia teams reached the playoffs.` : have.length ? `${year} in Philadelphia sports` : `No Philadelphia team from this list played in ${year}.`;
  const nearby = TEAM_KEYS.flatMap(k => Object.entries(CUR.notes[k] || {}).filter(([y]) => Math.abs(y - year) <= 4 && +y !== year).map(([y, n]) => ({ k, y: +y, n }))).sort((a, b) => Math.abs(a.y - year) - Math.abs(b.y - year)).slice(0, 8);
  mount.innerHTML = `
    <div class="card" style="margin-bottom:18px"><div class="year-pick"><div class="yr">${year}</div>
      <button class="btn" id="yPrev">◀ ${year - 1}</button><button class="btn" id="yNext">${year + 1} ▶</button>
      <input type="range" id="yRange" min="${yr.min}" max="${cur}" value="${year}" aria-label="Year"><input type="number" id="yNum" value="${year}" min="${yr.min}" max="${cur + 1}" style="width:96px"></div>
      <div class="filters" style="margin:16px 0 0;background:none;border:0;padding:0"><div class="chips" id="yTeams">${TEAM_KEYS.map(k => `<button class="chip ${sel.has(k) ? 'on' : ''}" data-k="${k}"><i class="dot" style="background:${TEAM_HEX[k]}"></i>${TEAMS[k].nick}</button>`).join('')}</div>
      <div class="chips">${[1948, 1960, 1967, 1980, 1983, 1993, 2008, 2017, 2024].map(y => `<a class="chip ${y === year ? 'on' : ''}" href="#/year/${y}">${y}</a>`).join('')}</div></div></div>
    <h2 style="text-transform:none;font-family:var(--font);font-size:1.5rem;font-weight:800;margin-bottom:4px">${esc(headline)}</h2>
    <p class="muted" style="margin:0 0 14px">${year >= cur ? 'The current season' : `${cur - year} years ago`}${have.length > 1 ? ' · Jump to: ' + have.map(c => `<a href="javascript:void(0)" data-jump="ys-${c.k}">${TEAMS[c.k].nick}</a>`).join(' · ') : ''} · <a href="javascript:void(0)" data-jump="ctx-sec">Where it sits in Philly history ↓</a></p>
    <div class="grid g3" style="margin-bottom:22px">${TEAM_KEYS.filter(k => sel.has(k)).map(k => leagueChampStrip(TEAMS[k], year)).join('')}</div>
    <div>${cards.map(({ k, s }) => s ? yearTeamSection(k, s, year) : `<div class="card" style="margin-bottom:18px"><h3>${TEAMS[k].nick}</h3><p class="muted" style="margin:0">${year < TEAMS[k].since ? `The franchise didn't exist yet (founded ${TEAMS[k].since}).` : `No completed season on file for ${year}${year >= cur ? ' — the current season is in progress. <a href="#/team/' + k + '">Open the live team page →</a>' : '.'}`}</p></div>`).join('')}</div>
    <div class="section" id="ctx-sec"><h2>Where ${year} sits in history</h2><div class="card">${yearContextHtml(year)}</div></div>
    ${nearby.length ? `<div class="section"><h2>Nearby in Philly history</h2><p class="section-sub">Click a moment to read the story.</p><div class="moment-list">${nearby.map(({ k, y, n }) => `<button class="moment" data-moment data-team="${k}" data-year="${y}" style="border-top:4px solid ${TEAM_HEX[k]}"><div class="y">${y} ${esc(TEAMS[k].nick)}</div><div class="t">${esc(n.t)}</div><div class="s">${esc(n.s)}</div></button>`).join('')}</div></div>` : ''}`;
  const go = y => { y = Math.min(Math.max(+y || year, yr.min), cur + 1); const tq = sel.size === 3 ? '' : `?teams=${[...sel].join(',')}`; location.hash = `#/year/${y}${tq}`; };
  $('#yPrev').onclick = () => go(year - 1); $('#yNext').onclick = () => go(year + 1);
  $('#yRange').addEventListener('change', e => go(e.target.value)); $('#yNum').addEventListener('change', e => go(e.target.value));
  $('#yTeams').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; if (sel.has(b.dataset.k) && sel.size === 1) return; sel.has(b.dataset.k) ? sel.delete(b.dataset.k) : sel.add(b.dataset.k); go(year); });

  // async fill: highlights, stars, player stats (each team in parallel)
  have.forEach(({ k, s }) => {
    const t = TEAMS[k];
    API.schedule(t, s.year).then(r => { if (!alive()) return; const hl = seasonHighlights(t, r.games); $(`#hl-${k}`).innerHTML = hl.length ? `<ul class="hl-list">${hl.map(([a, b]) => `<li><b>${esc(a)}</b>${esc(b)}</li>`).join('')}</ul>` : '<span>No game-by-game data is archived for this season.</span>'; }).catch(() => alive() && ($(`#hl-${k}`).innerHTML = '<span>Game log unavailable.</span>'));
    starsHtml(t, s.year).then(h => alive() && ($(`#stars-${k}`).innerHTML = h));
    playerStatsPanel(t, s.year, $(`#ps-${k}`));
  });
}

/* ---------- Season detail ---------- */
async function viewSeason({ parts, mount, alive }) {
  const key = parts[1], t = TEAMS[key], year = +parts[2];
  const s = H.find(key, year), cur = new Date().getFullYear();
  if (!s) {
    mount.innerHTML = `<div class="card center"><h2>${esc(t.nick)} · ${esc(seasonLabel(t, year))}</h2><p class="muted">${year >= cur ? 'This season is in progress and not in the archive yet.' : 'No season on file.'}</p><div class="row" style="justify-content:center"><a class="btn primary" href="#/team/${key}/schedule${year >= cur ? '' : '?y=' + year}">Schedule &amp; results</a><a class="btn" href="#/team/${key}/history">Franchise history</a></div></div>`; return;
  }
  const n = H.notes(key, year), prev = H.find(key, year - 1), next = H.find(key, year + 1), champ = H.champ(t, year);
  mount.innerHTML = `
    <div class="row between" style="margin-bottom:12px"><a class="btn small ghost" href="#/team/${key}/history">← ${esc(t.nick)} history</a>
      <div class="row">${prev ? `<a class="btn small" href="#/season/${key}/${prev.year}">◀ ${esc(H.label(t, prev))}</a>` : ''}<a class="btn small" href="#/year/${year}">All teams in ${year}</a>${next ? `<a class="btn small" href="#/season/${key}/${next.year}">${esc(H.label(t, next))} ▶</a>` : ''}</div></div>
    <div class="team-head"><img class="logo" src="${teamLogoOn(t)}" alt=""><div class="meta"><div class="small muted" style="letter-spacing:.12em;text-transform:uppercase">${esc(s.league)} · ${esc(s.team || t.name)}</div><h1>${esc(H.label(t, s))} ${esc(t.nick)}</h1>
      <div class="row">${s.result === 'champion' ? `<span class="badge gold">🏆 ${esc(champ?.game || 'Champions')}</span>` : `<span class="badge">${esc(H.outcome(s))}</span>`}${s.divWin ? '<span class="badge">Division champs</span>' : ''}${s.confWin ? '<span class="badge">Conference champs</span>' : ''}</div></div>
      <div class="stats"><div class="big-stat"><div class="v">${H.record(t, s)}</div><div class="l">Record</div></div><div class="big-stat"><div class="v">${esc(s.finish || '—')}</div><div class="l">${esc(s.div || 'Finish')}</div></div></div></div>
    <div class="ctx card" style="margin-top:18px">${yearContextHtml(year)}</div>
    <div class="split section" style="margin-top:26px"><div class="stack">
      <div class="card"><h3>${n ? esc(n.t) : 'Season recap'}</h3><div class="story">${n ? `<p>${esc(n.s)}</p>` : ''}<p class="${n ? 'muted' : ''}">${H.autoStory(t, s)}</p></div>${(n?.f || []).map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div>
      <div class="card"><h3>Players who made the season</h3><div id="sStars">${spinner('Loading players…')}</div><h4 style="margin-top:20px">Player stats</h4><div id="sPS"></div></div>
      <div class="card"><h3>Big moments</h3><div id="sHL">${spinner('Reading the game log…')}</div>${s.post.length ? `<h4 style="margin-top:18px">Postseason path</h4>${H.path(s).map(p => `<div class="pathrow">${esc(p)}</div>`).join('')}` : ''}</div>
      <div class="card"><h3>Game-by-game results</h3><div id="sGames">${spinner('Loading game log…')}</div></div>
    </div><div class="stack">
      <div class="card"><h3>Season file</h3><dl class="kv" style="grid-template-columns:100px 1fr"><dt>${t.league === 'mlb' ? 'Manager' : 'Head coach'}</dt><dd>${esc(s.coaches.join(' & ') || '—')}${s.coachRaw && /Until|Starting/.test(s.coachRaw) ? `<div class="small muted">${esc(s.coachRaw)}</div>` : ''}</dd>${s.awards.length ? `<dt>Awards</dt><dd>${s.awards.map(esc).join('<br>')}</dd>` : ''}<dt>League</dt><dd>${esc(s.league)}${s.conf && s.conf !== '—' ? ' · ' + esc(s.conf) : ''}${s.div ? ' · ' + esc(s.div) : ''}</dd>${s.gb && s.gb !== '—' ? `<dt>Games back</dt><dd>${esc(s.gb)}</dd>` : ''}</dl><div id="sExtra"></div></div>
      <div class="card"><h3>League champion</h3>${leagueChampStrip(t, year)}</div>
      <div class="card"><h3>Final standings</h3><div id="sStd">${spinner()}</div></div>
    </div></div>`;

  API.schedule(t, year).then(r => {
    if (!alive()) return;
    const hl = seasonHighlights(t, r.games);
    $('#sHL').innerHTML = hl.length ? `<ul class="hl-list">${hl.map(([a, b]) => `<li><b>${esc(a)}</b>${esc(b)}</li>`).join('')}</ul>` : '<span class="muted small">No game-by-game data is archived for this season.</span>';
    const g = r.games.filter(x => x.state === 'post');
    if (!g.length) { $('#sGames').innerHTML = `<div class="muted">No game-level results are available for this season in the archive.</div>`; return; }
    let w = 0, l = 0, tie = 0;
    const rows = g.map(x => { if (x.result === 'W') w++; else if (x.result === 'L') l++; else tie++; return { ...x, rec: x.stype === 3 ? '' : (t.recordFmt === 'wlt' && tie ? `${w}-${l}-${tie}` : `${w}-${l}`) }; });
    const reg = rows.filter(x => x.stype !== 3).length;
    $('#sGames').innerHTML = `${!t.mlbId && reg < (s.w + s.l + (s.t || 0)) - 1 ? `<div class="errbox" style="margin-bottom:10px">ESPN's archive lists ${reg} of ${s.w + s.l + (s.t || 0)} regular-season games for this year.</div>` : ''}` +
      renderTable(`sg-${key}`, [
        { key: 'ts', label: 'Date', fmt: x => esc(fmtDate(x.date)), sortVal: x => x.ts }, { key: 'label', label: 'Round', cls: 'muted' },
        { key: 'opp', label: 'Opponent', sortVal: x => x.opp.name, fmt: x => `<div class="pname"><span class="dim">${x.home ? 'vs' : '@'}</span>${esc(x.opp.name)}</div>` },
        { key: 'result', label: 'Result', fmt: x => resultChip(x) }, { key: 'rec', label: 'Record', num: true, sortVal: x => x.ts },
      ], rows, { sortKey: 'ts' });
  }).catch(() => { if (alive()) { $('#sGames').innerHTML = errBox('Game log unavailable.'); $('#sHL').innerHTML = ''; } });

  safe(API.standings(t, year)).then(std => { if (alive()) $('#sStd').innerHTML = std?.ours ? standingsTable(std, t) : '<div class="muted small">Standings for that season are not available.</div>'; });
  starsHtml(t, year).then(h => alive() && ($('#sStars').innerHTML = h));
  playerStatsPanel(t, year, $('#sPS'));
  if (t.mlbId) {
    safe(API.mlbTeamStats(t, year), null).then(x => { if (!alive() || !x) return; const h = x.hitting, p = x.pitching; if (!h && !p) return; $('#sExtra').innerHTML = `<div class="grid g2" style="margin-top:12px">${h ? [['Runs', h.runs], ['HR', h.homeRuns], ['AVG', h.avg], ['OPS', h.ops]].map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('') : ''}${p ? [['ERA', p.era], ['Strikeouts', p.strikeOuts], ['WHIP', p.whip], ['Saves', p.saves]].map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('') : ''}</div>`; });
  } else {
    safe(API.coreRecord(t, year), null).then(r => { if (!alive() || !r) return; const pts = t.league === 'nfl' ? [['Points for', r.pf], ['Points against', r.pa]] : [['PPG for', r.avgPf?.toFixed?.(1)], ['PPG against', r.avgPa?.toFixed?.(1)]]; $('#sExtra').innerHTML = `<div class="grid g2" style="margin-top:12px">${pts.map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('')}</div>`; });
  }
}
