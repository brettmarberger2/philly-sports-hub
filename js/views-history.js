/* History explorer, Year explorer, Season detail */
const TEAM_COL = { eagles: '#004C54', phillies: '#E81828', sixers: '#006BB6' };

async function liveSeasonRow(t) {
  const info = await safe(API.team(t)); if (!info) return null;
  const games = info.w + info.l + info.tie; if (!games) return null;
  const now = new Date(), year = t.league === 'nba' ? (now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1) : now.getFullYear();
  if (H.find(t.key, year)) return null;
  return { team: t.key, year, label: t.league === 'nba' ? `${year}–${String(year + 1).slice(2)}` : String(year), w: info.w, l: info.l, t: info.tie, pct: pct(info.w, info.l, info.tie), finish: info.standingSummary, coaches: [], post: [], awards: [], result: 'none', live: true };
}

async function historyExplorer({ mount, alive, q, teams, fixedTeam }) {
  const yr = H.years(), curYear = new Date().getFullYear();
  const st = { view: 'both', teams: new Set(q.team ? q.team.split(',').filter(k => TEAMS[k]) : teams), from: +q.from || yr.min, to: +q.to || yr.max, result: q.result || 'all', text: q.text || '' };
  if (fixedTeam) st.from = +q.from || TEAMS[fixedTeam].since;
  const rows = () => TEAM_KEYS.filter(k => st.teams.has(k)).flatMap(k => H.seasons(k).map(s => ({ ...s, team: k, teamName: TEAMS[k].nick, pctV: H.pctOf(s), coach: s.coaches.join(' / '), outcome: H.outcome(s), decade: H.decadeOf(s.year) })));
  const live = (await Promise.all(TEAM_KEYS.map(k => liveSeasonRow(TEAMS[k])))).filter(Boolean);
  if (!alive()) return;
  const coachList = k => uniq(H.seasons(k).flatMap(s => s.coaches)).sort();

  mount.innerHTML = `
    <div class="filters" id="hFilters">
      ${fixedTeam ? '' : `<div><div class="small muted" style="margin-bottom:4px;font-weight:700;letter-spacing:.06em;font-size:.72rem;text-transform:uppercase">Teams</div><div class="chips" id="hTeams">${TEAM_KEYS.map(k => `<button class="chip ${st.teams.has(k) ? 'on' : ''}" data-k="${k}"><i class="dot" style="background:${TEAMS[k].primary}"></i>${TEAMS[k].nick}</button>`).join('')}</div></div>`}
      <label class="f">From<input type="number" id="hFrom" min="${yr.min}" max="${yr.max}" value="${st.from}" style="width:90px"></label>
      <label class="f">To<input type="number" id="hTo" min="${yr.min}" max="${yr.max + 1}" value="${st.to}" style="width:90px"></label>
      <label class="f">Decade<select id="hDec"><option value="">Any</option>${uniq([...Array(Math.floor((yr.max - yr.min) / 10) + 1)].map((_, i) => Math.floor(yr.min / 10) * 10 + i * 10)).map(d => `<option value="${d}">${d}s</option>`).join('')}</select></label>
      <label class="f">Postseason<select id="hRes"><option value="all">All seasons</option><option value="champion">Champions</option><option value="finals">Finals (won or lost)</option><option value="playoffs">Made playoffs</option><option value="none">Missed playoffs</option></select></label>
      <label class="f">Search<input type="search" id="hText" placeholder="Coach, award, opponent…" value="${esc(st.text)}"></label>
      <div><div class="small muted" style="margin-bottom:4px;font-weight:800;letter-spacing:.07em;font-size:.7rem;text-transform:uppercase">View</div><div class="seg" id="hView"><button data-v="both" class="on">Both</button><button data-v="overview">📈 Overview</button><button data-v="table">☰ Table</button></div></div>
      <button class="btn small ghost" id="hReset">Reset</button>
    </div>
    <div id="hSummary"></div><div id="hCharts"></div><div id="hTable"></div>`;
  $('#hRes').value = st.result;

  const filtered = () => {
    let r = rows();
    if (st.decade) r = r.filter(x => x.decade === st.decade);
    r = r.filter(x => x.year >= st.from && x.year <= st.to);
    if (st.result === 'champion') r = r.filter(x => x.result === 'champion');
    else if (st.result === 'finals') r = r.filter(x => x.result === 'champion' || x.result === 'finalist');
    else if (st.result === 'playoffs') r = r.filter(x => x.result !== 'none');
    else if (st.result === 'none') r = r.filter(x => x.result === 'none');
    const tx = st.text.trim().toLowerCase();
    if (tx) r = r.filter(x => `${x.coach} ${x.awards.join(' ')} ${x.post.join(' ')} ${x.label} ${x.finish}`.toLowerCase().includes(tx));
    return r;
  };

  const paint = () => {
    const r = filtered();
    const lv = live.filter(x => st.teams.has(x.team) && x.year >= st.from && x.year <= st.to && st.result === 'all' && !st.decade && !st.text);
    const w = sum(r, x => x.w), l = sum(r, x => x.l), tt = sum(r, x => x.t);
    $('#hSummary').innerHTML = `<div class="grid g4" style="margin-bottom:16px">
      <div class="stat-tile"><div class="v">${r.length}</div><div class="l">Seasons shown</div></div>
      <div class="stat-tile"><div class="v">${w}–${l}${tt ? '–' + tt : ''}</div><div class="l">Combined record</div></div>
      <div class="stat-tile"><div class="v">${w + l ? fmtPct(pct(w, l, tt)) : '—'}</div><div class="l">Win percentage</div></div>
      <div class="stat-tile"><div class="v">${r.filter(x => x.result === 'champion').length} 🏆 · ${r.filter(x => x.result !== 'none').length}</div><div class="l">Titles · playoff seasons</div></div></div>`;
    // Charts
    const keys = TEAM_KEYS.filter(k => st.teams.has(k));
    const series = keys.map(k => ({ name: TEAMS[k].nick, color: TEAM_COL[k], points: r.filter(x => x.team === k).sort((a, b) => a.year - b.year).map(x => ({ x: x.year, y: x.pctV, mark: x.result === 'champion' ? '#f5c542' : null, title: `${TEAMS[k].nick} ${x.label}: ${H.record(TEAMS[k], x)} · ${x.outcome}`, href: `#/season/${k}/${x.year}` })) })).filter(s => s.points.length);
    const yrsInRange = uniq(r.map(x => x.year)).length;
    $('#hCharts').innerHTML = `${series.length && yrsInRange > 1 ? `<div class="card" style="margin-bottom:16px"><h3>Win percentage by season</h3>${Charts.line(series, { yMin: 0, yMax: 1, yFmt: v => v.toFixed(2).replace(/^0/, ''), refY: 0.5, xTicks: 9 })}<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}<span><i style="background:#f5c542;border-radius:50%"></i>Championship season</span></div></div>` : ''}
      ${true ? keys.filter(k => r.some(x => x.team === k)).map(k => `<div class="card" style="margin-bottom:16px"><h3>${TEAMS[k].nick} · every season</h3><div class="timeline">${[...lv.filter(x => x.team === k), ...r.filter(x => x.team === k).sort((a, b) => b.year - a.year)].map(x => `<a class="tl ${x.live ? '' : x.result}" href="#/season/${k}/${x.year}" title="${esc(x.live ? 'In progress' : H.outcome(x))}"><b>${TEAMS[k].league === 'nba' ? esc(x.label.slice(2)) : x.year}</b>${x.w}-${x.l}${x.t ? '-' + x.t : ''}${x.live ? '<br>live' : ''}</a>`).join('')}</div><div class="legend"><span><i style="background:var(--gold)"></i>Champions</span><span><i style="background:var(--warn)"></i>Lost finals</span><span><i style="background:var(--good)"></i>Playoffs</span></div></div>`).join('') : ''}`;
    $('#hCharts').style.display = st.view === 'table' ? 'none' : ''; $('#hTable').style.display = st.view === 'overview' ? 'none' : '';
    const multi = keys.length > 1;
    const cols = [
      { key: 'year', label: 'Season', sortVal: x => x.year, fmt: x => `<a href="#/season/${x.team}/${x.year}"><b>${esc(x.label)}</b></a>${x.live ? ' <span class="badge live">live</span>' : ''}` },
      ...(multi ? [{ key: 'teamName', label: 'Team', fmt: x => `<div class="pname"><img src="${teamLogo(TEAMS[x.team])}" style="border-radius:0;background:none;width:22px;height:22px;object-fit:contain" alt="">${esc(x.teamName)}</div>` }] : []),
      { key: 'w', label: 'Record', num: true, sortVal: x => x.w, fmt: x => esc(H.record(TEAMS[x.team], x)) },
      { key: 'pctV', label: 'Win %', num: true, fmt: x => fmtPct(x.pctV) },
      { key: 'finish', label: 'Finish', fmt: x => esc(x.finish || '') },
      { key: 'coach', label: 'Coach / Manager', cls: 'muted', fmt: x => esc(x.coach) },
      { key: 'outcome', label: 'Postseason', fmt: x => (x.result === 'champion' ? `<span class="badge gold">🏆 Champions</span>` : x.result === 'finalist' ? `<span class="badge">${esc(x.outcome)}</span>` : x.result === 'playoffs' ? `<span class="badge good">${esc(x.outcome)}</span>` : `<span class="dim">${x.live ? 'In progress' : 'Missed'}</span>`) },
      { key: 'awards', label: 'Awards', cls: 'muted small', fmt: x => esc(x.awards.join('; ')) },
    ];
    const data = [...lv.map(x => ({ ...x, teamName: TEAMS[x.team].nick, pctV: x.pct, coach: '', outcome: 'In progress' })), ...r];
    $('#hTable').innerHTML = `<div class="section" style="margin-top:8px"><h2>Season results (${data.length})</h2>${renderTable('hist-' + (fixedTeam || 'all'), cols, data, { sortKey: 'year', sortDir: -1, rowClass: x => (x.result === 'champion' ? 'hl' : '') })}</div>`;
  };
  const sync = () => {
    st.from = Math.max(yr.min, +$('#hFrom').value || yr.min); st.to = +$('#hTo').value || yr.max; st.result = $('#hRes').value; st.text = $('#hText').value;
    const d = $('#hDec').value; st.decade = d ? +d : null; paint();
  };
  $('#hView').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; st.view = b.dataset.v; $$('#hView button').forEach(x => x.classList.toggle('on', x === b)); paint(); });
  $('#hFilters').addEventListener('input', debounce(sync, 150)); $('#hFilters').addEventListener('change', sync);
  $('#hTeams')?.addEventListener('click', e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    if (st.teams.has(b.dataset.k) && st.teams.size === 1) return;
    st.teams.has(b.dataset.k) ? st.teams.delete(b.dataset.k) : st.teams.add(b.dataset.k);
    $$('#hTeams .chip').forEach(c => c.classList.toggle('on', st.teams.has(c.dataset.k))); paint();
  });
  $('#hReset').addEventListener('click', () => { st.from = fixedTeam ? TEAMS[fixedTeam].since : yr.min; st.to = yr.max; st.result = 'all'; st.text = ''; st.decade = null; $('#hFrom').value = st.from; $('#hTo').value = st.to; $('#hRes').value = 'all'; $('#hText').value = ''; $('#hDec').value = ''; paint(); });
  paint();
}

/* ---------- History hub ---------- */
async function viewHistoryHub({ q, mount, alive }) {
  const yr = H.years();
  const tot = TEAM_KEYS.map(k => ({ k, ...H.totals(k) }));
  mount.innerHTML = `<div class="hero" style="padding:28px"><div class="tri"><span></span><span></span><span></span></div><h1>Franchise history</h1><p class="muted" style="max-width:700px">Every season the Eagles, Phillies and 76ers have played, from ${yr.min} to today. Filter by team, era, result or coach, and click any season for its full story.</p></div>
    <div class="section"><h2>All-time comparison</h2>${renderTable('alltime', [
    { key: 'k', label: 'Franchise', fmt: x => `<a href="#/team/${x.k}/history"><div class="pname"><img src="${teamLogo(TEAMS[x.k])}" style="border-radius:0;background:none;width:28px;height:28px;object-fit:contain" alt=""><b>${TEAMS[x.k].name}</b></div></a>`, sortVal: x => x.k },
    { key: 'seasons', label: 'Seasons', num: true }, { key: 'w', label: 'Record', num: true, fmt: x => `${x.w}-${x.l}${x.t ? '-' + x.t : ''}`, sortVal: x => x.w },
    { key: 'pct', label: 'Win %', num: true, fmt: x => fmtPct(x.pct) }, { key: 'titles', label: 'Titles', num: true, fmt: x => `<b style="color:var(--gold)">${x.titles}</b>` }, { key: 'finals', label: 'Lost finals', num: true },
    { key: 'playoffs', label: 'Playoff seasons', num: true }, { key: 'divTitles', label: 'Division titles', num: true },
  ], tot)}</div>
    <div class="section"><h2>Explore every season</h2><div id="hx"></div></div>`;
  await historyExplorer({ mount: $('#hx'), alive, q, teams: TEAM_KEYS });
}

/* ---------- Year explorer ---------- */
function leagueChampStrip(t, year) {
  const c = H.champ(t, year), isUs = c && c.winner.includes('Philadelphia') && (t.league !== 'nba' || /76ers|Nationals/.test(c.winner) || c.winner.includes('76ers')) && !/Warriors|Athletics/.test(c.winner);
  if (!c) return `<div class="stat-tile"><div class="l">${CHAMP_TITLES[t.champKey][1]}</div><div class="muted small">No league championship recorded.</div></div>`;
  const philWin = /Philadelphia (Eagles|Phillies|76ers)|Syracuse Nationals/.test(c.winner);
  return `<div class="stat-tile" style="${philWin ? 'border:1px solid var(--gold)' : ''}"><div class="l">${esc(c.game)} · ${CHAMP_TITLES[t.champKey][1]} ${t.league === 'nba' ? seasonLabel(t, year) : year} season</div><div class="v" style="font-size:1.25rem;margin-top:6px">${philWin ? '🏆 ' : ''}${esc(c.winner)}</div><div class="small muted">def. ${esc(c.loser)} ${esc(c.score)}${c.mvp ? ` · MVP ${esc(c.mvp)}` : ''}</div></div>`;
}
function seasonCardHtml(k, s) {
  const t = TEAMS[k], n = H.notes(k, s.year);
  return `<div class="season-card" style="--c1:${t.primary}"><div class="hd"><img src="${teamLogoOn(t)}" alt=""><div><h3>${esc(t.nick)}</h3><div class="small" style="opacity:.85">${esc(s.team || t.name)} · ${esc(s.league)}</div></div><div style="margin-left:auto;text-align:right"><div style="font-family:var(--display);font-size:2rem;font-weight:700;line-height:1">${H.record(t, s)}</div><div class="small" style="opacity:.85">${fmtPct(H.pctOf(s))}</div></div></div>
    <div class="bd">${s.result === 'champion' ? `<div class="champion-strip" style="margin-bottom:12px;padding:8px 12px">🏆 <b>${esc(H.champ(t, s.year)?.game || 'Champions')}</b></div>` : ''}
    <dl class="kv"><dt>Finish</dt><dd>${esc(s.finish || '—')}${s.div ? ' · ' + esc(s.div) : ''}</dd><dt>${t.league === 'mlb' ? 'Manager' : 'Coach'}</dt><dd>${esc(s.coaches.join(' & ') || '—')}</dd><dt>Postseason</dt><dd>${s.post.length ? H.path(s).map(esc).join('<br>') : 'Did not qualify'}</dd>${s.awards.length ? `<dt>Awards</dt><dd>${s.awards.map(esc).join('<br>')}</dd>` : ''}</dl>
    ${n ? `<div class="fact"><b>${esc(n.t)}</b><br>${esc(n.s)}</div>` : ''}
    <a class="btn small" style="margin-top:12px" href="#/season/${k}/${s.year}">Full season page →</a></div></div>`;
}
async function viewYear({ parts, q, mount }) {
  const yr = H.years(), cur = new Date().getFullYear();
  let year = +parts[1] || yr.max;
  year = Math.min(Math.max(year, yr.min), cur + 1);
  const sel = new Set(q.teams ? q.teams.split(',').filter(k => TEAMS[k]) : TEAM_KEYS);
  const cards = TEAM_KEYS.filter(k => sel.has(k)).map(k => ({ k, s: H.find(k, year) })), have = cards.filter(c => c.s);
  const summary = have.map(({ k, s }) => `${TEAMS[k].nick}: ${H.record(TEAMS[k], s)}${s.result === 'champion' ? ' 🏆' : s.result !== 'none' ? ' (' + H.outcome(s) + ')' : ''}`);
  const champs = have.filter(c => c.s.result === 'champion').map(c => TEAMS[c.k].nick), madeAll = TEAM_KEYS.filter(k => H.find(k, year)).length === 3 && TEAM_KEYS.every(k => H.find(k, year).result !== 'none');
  const headline = champs.length ? `${year} was a championship year: the ${champs.join(' and ')} won it all.` : madeAll ? `${year}: all three Philadelphia teams reached the playoffs.` : have.length ? `${year} in Philadelphia sports.` : `No Philadelphia team from this list played in ${year}.`;
  mount.innerHTML = `<div class="card" style="margin-bottom:18px"><div class="year-pick"><div class="yr">${year}</div>
      <button class="btn" id="yPrev">◀ ${year - 1}</button><button class="btn" id="yNext">${year + 1} ▶</button>
      <input type="range" id="yRange" min="${yr.min}" max="${cur}" value="${year}"><input type="number" id="yNum" value="${year}" min="${yr.min}" max="${cur + 1}" style="width:96px"></div>
      <div class="filters" style="margin:14px 0 0"><div class="chips" id="yTeams">${TEAM_KEYS.map(k => `<button class="chip ${sel.has(k) ? 'on' : ''}" data-k="${k}"><i class="dot" style="background:${TEAMS[k].primary}"></i>${TEAMS[k].nick}</button>`).join('')}</div>
      <div class="chips">${[1933, 1948, 1960, 1967, 1980, 1983, 1993, 2008, 2017, 2024].map(y => `<a class="chip" href="#/year/${y}">${y}</a>`).join('')}</div></div></div>
    <h2 style="text-transform:none;font-family:var(--font);font-size:1.3rem;font-weight:700">${esc(headline)}</h2>
    <p class="muted">${summary.map(esc).join(' &nbsp;·&nbsp; ')}</p>
    <div class="section"><h2>League champions</h2><div class="grid g3">${TEAM_KEYS.filter(k => sel.has(k)).map(k => leagueChampStrip(TEAMS[k], year)).join('')}</div>${year >= 2025 ? '<p class="small dim">Champion data updates as leagues crown winners.</p>' : ''}</div>
    <div class="section"><h2>The teams that year</h2><div class="grid g3" id="yCards">${cards.map(({ k, s }) => s ? seasonCardHtml(k, s) : `<div class="card"><h3>${TEAMS[k].nick}</h3><p class="muted">${year < TEAMS[k].since ? `The franchise didn't exist yet (founded ${TEAMS[k].since}).` : `No completed season on file for ${year}${year >= cur ? ' — the current season is in progress. <a href="#/team/' + k + '/schedule">See live schedule &amp; results →</a>' : '.'}`}</p></div>`).join('')}</div></div>
    <div class="section"><h2>Fun facts &amp; moments</h2>${(() => { const items = have.flatMap(({ k, s }) => [...(H.facts(k, s.year) || []), ...(H.notes(k, s.year) ? [] : [])]); const nearby = TEAM_KEYS.flatMap(k => Object.entries(CUR.notes[k] || {}).filter(([y]) => Math.abs(y - year) <= 3 && +y !== year).map(([y, n]) => ({ k, y, n }))).slice(0, 6); return (items.length ? items.map(f => `<div class="fact">${esc(f)}</div>`).join('') : '') + (nearby.length ? `<h4 style="margin-top:14px">Nearby in Philly history</h4>${nearby.map(({ k, y, n }) => `<a class="fact" style="display:block;color:inherit" href="#/year/${y}"><b>${y} ${esc(TEAMS[k].nick)}:</b> ${esc(n.t)}</a>`).join('')}` : '') || '<div class="muted">No curated moments for this year. The season pages still have a generated recap.</div>'; })()}</div>`;
  const go = y => { y = Math.min(Math.max(+y || year, yr.min), cur + 1); const tq = sel.size === 3 ? '' : `?teams=${[...sel].join(',')}`; location.hash = `#/year/${y}${tq}`; };
  $('#yPrev').onclick = () => go(year - 1); $('#yNext').onclick = () => go(year + 1);
  $('#yRange').addEventListener('change', e => go(e.target.value)); $('#yNum').addEventListener('change', e => go(e.target.value));
  $('#yTeams').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; if (sel.has(b.dataset.k) && sel.size === 1) return; sel.has(b.dataset.k) ? sel.delete(b.dataset.k) : sel.add(b.dataset.k); go(year); });
}

/* ---------- Season detail ---------- */
async function viewSeason({ parts, mount, alive }) {
  const key = parts[1], t = TEAMS[key], year = +parts[2];
  const s = H.find(key, year);
  const cur = new Date().getFullYear();
  if (!s) {
    mount.innerHTML = `<div class="card center"><h2>${esc(t.nick)} · ${esc(seasonLabel(t, year))}</h2><p class="muted">${year >= cur ? 'This season is in progress and not in the archive yet.' : 'No season on file.'}</p><div class="row" style="justify-content:center"><a class="btn primary" href="#/team/${key}/schedule${year >= cur ? '' : '?y=' + year}">Schedule &amp; results</a><a class="btn" href="#/team/${key}/history">Franchise history</a></div></div>`; return;
  }
  const n = H.notes(key, year), prev = H.find(key, year - 1), next = H.find(key, year + 1), champ = H.champ(t, year);
  const all = H.seasons(key);
  const chart = Charts.line([{ name: t.nick, color: TEAM_COL[key], points: all.map(x => ({ x: x.year, y: H.pctOf(x), mark: x.year === year ? '#f5c542' : null, title: `${H.label(t, x)}: ${H.record(t, x)}`, href: `#/season/${key}/${x.year}` })) }], { yMin: 0, yMax: 1, yFmt: v => v.toFixed(2).replace(/^0/, ''), refY: 0.5 });
  mount.innerHTML = `
    <div class="row between" style="margin-bottom:12px"><a class="btn small ghost" href="#/team/${key}/history">← ${esc(t.nick)} history</a>
      <div class="row">${prev ? `<a class="btn small" href="#/season/${key}/${prev.year}">◀ ${esc(H.label(t, prev))}</a>` : ''}<a class="btn small" href="#/year/${year}">All teams in ${year}</a>${next ? `<a class="btn small" href="#/season/${key}/${next.year}">${esc(H.label(t, next))} ▶</a>` : ''}</div></div>
    <div class="team-head"><img class="logo" src="${teamLogoOn(t)}" alt=""><div class="meta"><div class="small muted" style="letter-spacing:.12em;text-transform:uppercase">${esc(s.league)} · ${esc(s.team || t.name)}</div><h1>${esc(H.label(t, s))} ${esc(t.nick)}</h1>
      <div class="row">${s.result === 'champion' ? `<span class="badge gold">🏆 ${esc(champ?.game || 'Champions')}</span>` : `<span class="badge">${esc(H.outcome(s))}</span>`}${s.divWin ? '<span class="badge good">Division champs</span>' : ''}${s.confWin ? '<span class="badge good">Conference champs</span>' : ''}</div></div>
      <div class="stats"><div class="big-stat"><div class="v">${H.record(t, s)}</div><div class="l">Record</div></div><div class="big-stat"><div class="v">${fmtPct(H.pctOf(s))}</div><div class="l">Win %</div></div><div class="big-stat"><div class="v">${esc(s.finish || '—')}</div><div class="l">${esc(s.div || 'Finish')}</div></div></div></div>
    <div class="split section"><div class="stack">
      <div class="card"><h3>${n ? esc(n.t) : 'Season recap'}</h3><div class="story">${n ? `<p>${esc(n.s)}</p>` : ''}<p class="${n ? 'muted' : ''}">${H.autoStory(t, s)}</p></div>${(n?.f || []).map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div>
      <div class="card"><h3>Postseason</h3>${s.post.length ? `<ol style="margin:0;padding-left:20px">${H.path(s).map(p => `<li style="margin:4px 0">${esc(p)}</li>`).join('')}</ol>` : '<div class="muted">The team did not qualify for the postseason.</div>'}</div>
      <div class="card"><h3>Game-by-game results</h3><div id="sGames">${spinner('Loading game log…')}</div></div>
      <div class="card"><h3>Win percentage across franchise history</h3>${chart}<p class="small muted">Gold dot = this season. Rank by win % among ${all.length} seasons: <b>${ord(H.rankOf(key, s))}</b>.</p></div>
    </div><div class="stack">
      <div class="card"><h3>Season file</h3><dl class="kv" style="grid-template-columns:110px 1fr"><dt>${t.league === 'mlb' ? 'Manager' : 'Head coach'}</dt><dd>${esc(s.coaches.join(' & ') || '—')}${s.coachRaw && /Until|Starting/.test(s.coachRaw) ? `<div class="small muted">${esc(s.coachRaw)}</div>` : ''}</dd>${s.awards.length ? `<dt>Awards</dt><dd>${s.awards.map(esc).join('<br>')}</dd>` : ''}<dt>League</dt><dd>${esc(s.league)}${s.conf && s.conf !== '—' ? ' · ' + esc(s.conf) : ''}${s.div ? ' · ' + esc(s.div) : ''}</dd>${s.gb && s.gb !== '—' ? `<dt>Games back</dt><dd>${esc(s.gb)}</dd>` : ''}</dl><div id="sExtra"></div></div>
      <div class="card"><h3>League champion</h3>${leagueChampStrip(t, year)}</div>
      <div class="card"><h3>Final standings</h3><div id="sStd">${spinner()}</div></div>
      <div class="card"><h3>Team leaders</h3><div id="sLead">${spinner()}</div></div>
      ${t.mlbId ? `<div class="card"><h3>Roster that year</h3><div id="sRoster">${spinner()}</div></div>` : ''}
    </div></div>`;

  API.schedule(t, year).then(r => {
    if (!alive()) return;
    const g = r.games.filter(x => x.state === 'post');
    if (!g.length) { $('#sGames').innerHTML = `<div class="muted">No game-level results are available for this season in the archive.</div>`; return; }
    let w = 0, l = 0, tie = 0;
    const rows = g.map(x => { if (x.result === 'W') w++; else if (x.result === 'L') l++; else tie++; return { ...x, rec: x.stype === 3 ? '' : (t.recordFmt === 'wlt' && tie ? `${w}-${l}-${tie}` : `${w}-${l}`) }; });
    const reg = rows.filter(x => x.stype !== 3).length;
    $('#sGames').innerHTML = `${!t.mlbId && reg < t.gamesInSeason - 1 && reg < s.w + s.l + s.t - 1 ? `<div class="errbox" style="margin-bottom:10px">ESPN's archive lists ${reg} of ${s.w + s.l + (s.t || 0)} regular-season games for this year.</div>` : ''}` +
      renderTable(`sg-${key}`, [
        { key: 'ts', label: 'Date', fmt: x => esc(fmtDate(x.date)), sortVal: x => x.ts }, { key: 'label', label: 'Round', cls: 'muted' },
        { key: 'opp', label: 'Opponent', sortVal: x => x.opp.name, fmt: x => `<div class="pname"><span class="dim">${x.home ? 'vs' : '@'}</span>${esc(x.opp.name)}</div>` },
        { key: 'result', label: 'Result', fmt: x => resultChip(x) }, { key: 'rec', label: 'Record', num: true, sortVal: x => x.ts },
      ], rows, { sortKey: 'ts' });
  }).catch(() => alive() && ($('#sGames').innerHTML = errBox('Game log unavailable.')));

  safe(API.standings(t, year)).then(std => { if (alive()) $('#sStd').innerHTML = std?.ours ? standingsTable(std, t) : '<div class="muted small">Standings for that season are not available.</div>'; });
  safe(API.leaders(t, year), []).then(l => { if (alive()) $('#sLead').innerHTML = l?.length ? `<div class="stack" style="gap:8px">${l.map(x => `<div class="row between"><span class="muted small">${esc(x.cat)}</span><span><b>${esc(x.name)}</b> <span class="dim">${esc(x.value)}</span></span></div>`).join('')}</div>` : '<div class="muted small">Leaders unavailable for this season.</div>'; });
  if (t.mlbId) {
    safe(API.mlbRosterForYear(t, year), []).then(r => { if (!alive()) return; $('#sRoster').innerHTML = r.length ? `<div class="small" style="line-height:1.9">${r.map(p => `<span class="badge" style="margin:2px">${esc(p.name)} <span class="dim">${esc(p.pos || '')}</span></span>`).join('')}</div>` : '<div class="muted small">Roster not available.</div>'; });
    safe(API.mlbTeamStats(t, year), null).then(x => { if (!alive() || !x) return; const h = x.hitting, p = x.pitching; if (!h && !p) return; $('#sExtra').innerHTML = `<div class="grid g2" style="margin-top:12px">${h ? [['Runs', h.runs], ['HR', h.homeRuns], ['AVG', h.avg], ['OPS', h.ops]].map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('') : ''}${p ? [['ERA', p.era], ['Strikeouts', p.strikeOuts], ['WHIP', p.whip], ['Saves', p.saves]].map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('') : ''}</div>`; });
  } else {
    safe(API.coreRecord(t, year), null).then(r => { if (!alive() || !r) return; const pts = t.league === 'nfl' ? [['Points for', r.pf], ['Points against', r.pa]] : [['PPG for', r.avgPf?.toFixed?.(1)], ['PPG against', r.avgPa?.toFixed?.(1)]]; $('#sExtra').innerHTML = `<div class="grid g2" style="margin-top:12px">${pts.map(([a, b]) => `<div class="stat-tile"><div class="v">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('')}</div>`; });
  }
}
