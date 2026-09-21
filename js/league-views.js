/* Views: playoff picture tab, league pages, MLB pro stats */

/* ---------- shared bits ---------- */
const normName = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\./g, '').toLowerCase().trim();
const fmtCut = v => (v == null ? '' : v < 0 ? `+${fmtGB(-v)}` : v === 0 ? '—' : fmtGB(v));
function statusBadge(r, kind) {
  if (kind === 'nba') return r.status === 'in' ? '<span class="badge good">In</span>' : r.status === 'playin' ? '<span class="badge" style="background:#fff1e6;color:#8a4b12">Play-in</span>' : '';
  return r.status === 'div' ? '<span class="badge good">Division</span>' : r.status === 'wc' ? '<span class="badge" style="background:#e3f0fb;color:#0b4a86">Wild card</span>' : '';
}
function raceTableHtml(pic, scope, id) {
  const us = pic.us, rows = scope.rows, kind = pic.kind, hasT = kind === 'nfl';
  const data = rows.map((r, i) => ({ ...r, _rank: scope.showSeed ? (r.seed ?? '–') : i + 1, _gb: scope.gb ? scope.gb(r, rows) : 0, _cut: (scope.cutAfter && i + 1 === scope.cutAfter) || (scope.cutAfter2 && i + 1 === scope.cutAfter2) }));
  const cols = [
    { key: '_rank', label: scope.showSeed ? 'Seed' : '#', num: true, sortVal: r => (typeof r._rank === 'number' ? r._rank : 99) },
    { key: 'name', label: 'Team', fmt: r => `<div class="pname"><img src="${esc(r.logo)}" style="border-radius:0;background:none;border:0;width:24px;height:24px;object-fit:contain" alt="">${r.id === us.id ? `<b>${esc(r.name)}</b>` : esc(r.name)}</div>` },
    { key: 'w', label: 'W-L', num: true, cls: 'nw', sortVal: r => r.pct, fmt: r => `<b>${esc(hasT && r.t ? `${r.w}-${r.l}-${r.t}` : `${r.w}-${r.l}`)}</b>` },
    { key: 'pct', label: 'PCT', num: true, fmt: r => fmtPct(r.pct) },
    { key: '_gb', label: scope.gbLabel || 'GB', num: true, fmt: r => (scope.gbLabel ? fmtCut(r._gb) : fmtGB(r._gb)) },
    ...(kind !== 'nfl' ? [{ key: 'l10', label: 'L10', num: true }] : [{ key: 'divRec', label: 'DIV', num: true }]),
    { key: 'streak', label: 'STRK', num: true },
    { key: 'diff', label: kind === 'mlb' ? 'RUN DIFF' : 'DIFF', num: true, fmt: r => esc(r.diff > 0 ? '+' + r.diff : r.diff ?? '') },
    { key: 'status', label: '', fmt: r => statusBadge(r, kind) },
  ];
  return renderTable(id, cols, data, { rowClass: r => `${r.id === us.id ? 'us hl' : ''} ${r._cut ? 'cutrow' : ''}` });
}

function picBannerHtml(pic, compact = false) {
  return `<div class="pic-banner tone-${pic.tone}"><div class="pb-main"><div class="pb-lab">${pic.kind === 'nba' && pic.fin ? 'Last season' : 'If the season ended today'}</div><div class="pb-big">${esc(pic.headline)}</div><div class="pb-sub">${esc(pic.sub)}</div></div>
    ${compact ? '' : `<div class="pb-tiles">${pic.tiles.map(x => `<div><b>${esc(x.v)}</b><span>${esc(x.l)}</span></div>`).join('')}</div>`}</div>`;
}

/* ---------- Playoff picture tab ---------- */
async function tabPicture(t, { mount, alive }) {
  const pic = await API.picture(t); if (!alive()) return;
  mount.innerHTML = `${picBannerHtml(pic)}
    <div class="split" style="margin-top:18px"><div class="stack">
      <div class="card"><h3>What needs to happen</h3><ul class="needs">${pic.bullets.map(b => `<li>${b}</li>`).join('')}</ul><p class="disc">Computed live from the standings. Magic numbers assume the nearest competitor; final seeding also depends on tiebreakers. ${pic.kind === 'nfl' ? 'NFL seeds shown are ESPN\'s current order.' : ''}</p></div>
      <div class="card" id="remCard"><h3>Remaining schedule</h3>${spinner('Loading schedule…')}</div>
    </div><div class="stack">
      <div class="card flat"><h4 style="margin:0 0 6px">How to read this</h4><p class="small muted" style="margin:0">${pic.kind === 'mlb' ? 'Six teams per league make the playoffs: three division winners (seeds 1–3) and three Wild Cards (4–6). Seeds 1 and 2 skip the best-of-3 Wild Card round.' : pic.kind === 'nfl' ? 'Seven teams per conference: four division winners (1–4) and three wild cards (5–7). Only the #1 seed gets a first-round bye.' : 'Seeds 1–6 in each conference qualify directly. Seeds 7–10 play the Play-In Tournament for the final two spots.'}</p></div>
    </div></div>
    <div class="section"><h2>The race</h2><div class="filters" style="padding:10px 14px"><div class="seg" id="scopeSeg">${pic.scopes.map((s, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${esc(s.label)}</button>`).join('')}</div><span class="muted small" id="scopeNote"></span></div><div id="raceBox"></div></div>`;
  const draw = i => { const s = pic.scopes[i]; $('#raceBox').innerHTML = raceTableHtml(pic, s, `race-${t.key}-${s.key}`); $('#scopeNote').textContent = s.cutAfter ? `Red line = playoff cut${s.cutAfter2 ? 's' : ''}. Your team is highlighted.` : 'Your team is highlighted.'; };
  $('#scopeSeg').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; $$('#scopeSeg button').forEach(x => x.classList.toggle('on', x === b)); draw(+b.dataset.i); });
  const start = pic.kind === 'nba' ? 0 : 1;
  $$('#scopeSeg button').forEach((b, i) => b.classList.toggle('on', i === start));
  draw(start);
  API.remaining(t, pic.table).then(rem => { if (!alive()) return; $('#remCard').innerHTML = remainingHtml(t, pic, rem); });
}
function remainingHtml(t, pic, rem) {
  if (!rem || !rem.games.length) return `<h3>Remaining schedule</h3><div class="muted small">${pic.left === 0 || pic.fin ? 'No regular-season games remain.' : 'No upcoming games found.'}</div>`;
  const shown = rem.games.slice(0, 20), opener = pic.kind === 'nba' && pic.fin;
  const cols = [
    { key: 'ts', label: 'Date', sortVal: g => g.ts, fmt: g => esc(fmtDay(g.date)) },
    { key: 'opp', label: 'Opponent', sortVal: g => g.opp.name, fmt: g => `<div class="pname"><span class="dim">${g.home ? 'vs' : '@'}</span><img src="${esc(g.opp.logo)}" style="border-radius:0;background:none;border:0;width:24px;height:24px;object-fit:contain" alt="" onerror="this.style.visibility='hidden'">${esc(g.opp.name)}</div>` },
    { key: 'rec', label: 'Their record', num: true, sortVal: g => g.oppT?.pct ?? 0, fmt: g => (g.oppT ? esc(wl(g.oppT, t)) : '') },
    { key: 'lvl', label: 'Tough?', fmt: g => (!g.oppT ? '' : g.oppT.pct >= 0.6 ? '<span class="badge bad">Hard</span>' : g.oppT.pct >= 0.5 ? '<span class="badge" style="background:#fff1e6;color:#8a4b12">Winning team</span>' : '<span class="badge good">Easier</span>') },
  ];
  return `<h3>${opener ? 'Season opening stretch' : 'Remaining schedule'}</h3>
    <p class="small muted" style="margin-top:-6px">${opener ? '' : `<b>${rem.games.length}</b> game${rem.games.length === 1 ? '' : 's'} left (${rem.home} home, ${rem.away} away). `}${rem.avgOpp != null ? `Opponents' combined win %: <b>${fmtPct(rem.avgOpp)}</b>${rem.avgOpp >= 0.52 ? ' (tougher than average)' : rem.avgOpp <= 0.48 ? ' (softer than average)' : ' (about average)'}. ` : ''}${rem.vsWinning} against teams at .500 or better.${opener ? ' Opponent records are last season\'s.' : ''}</p>
    ${renderTable(`rem-${t.key}`, cols, shown, { sortKey: 'ts' })}${rem.games.length > shown.length ? `<p class="small dim">Showing the next ${shown.length} of ${rem.games.length}.</p>` : ''}`;
}

/* compact card used on the team overview + home */
function pictureCardHtml(pic, t) {
  const pick = pic.bullets.filter(b => /^<b>(Division|Playoffs|Play-in|Gap|Cushion|Play-in line)/.test(b)).slice(0, 2);
  return `<h3>Playoff picture</h3>${picBannerHtml(pic, true)}<ul class="needs" style="margin-top:12px">${pick.map(b => `<li>${b}</li>`).join('')}</ul><a class="btn small" href="#/team/${t.key}/picture">Full picture: what needs to happen →</a>`;
}

/* ---------- League leaders card grid ---------- */
function leaderListsHtml(groups) {
  return groups.map(g => `<div class="section" style="margin-top:22px"><h2 style="font-size:1.5rem">${esc(g.title)}</h2><div class="grid g3">${g.lists.map(l => `<div class="card lcard"><h3 style="font-size:1.15rem">${esc(l.label)}</h3>
    <table class="data lt"><tbody>${l.rows.map(r => `<tr class="${r.philly ? 'hl' : ''}"><td class="rk">${r.rank}</td><td><div class="pname"><img src="${esc(r.head || r.logo)}" alt="" style="width:30px;height:30px" onerror="this.src='${esc(r.logo)}'"><div style="min-width:0"><a href="${r.mlbId ? `https://www.mlb.com/player/${r.mlbId}` : r.id ? `https://www.espn.com/${location.hash.includes('nba') ? 'nba' : 'nfl'}/player/_/id/${r.id}` : '#'}" target="_blank" rel="noopener" style="color:inherit">${esc(r.name)}</a>${r.philly ? ' <span class="badge gold" style="padding:1px 6px">Philly</span>' : ''}<div class="small dim">${esc(r.abbr || '')}${r.extra?.length ? ' · ' + r.extra.map((x, i) => `${esc(x)} ${esc(l.cols[i] || '')}`).join(' · ') : ''}</div></div></div></td><td class="num"><b>${esc(r.value)}</b>${l.main ? ` <span class="dim small">${esc(l.main)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div></div>`).join('');
}

/* ---------- League pages ---------- */
async function viewLeagues({ mount, alive }) {
  mount.innerHTML = `<div class="hero slim"><div class="tri"><span></span><span></span><span></span></div><h1>The leagues</h1><p class="lede" style="margin:0">Standings, playoff races and league leaders for the MLB, NFL and NBA, with the Phillies, Eagles and 76ers front and center.</p></div>
    <div class="grid g3" style="margin-top:22px" id="lgCards">${LEAGUE_KEYS.map(() => `<div class="card">${spinner()}</div>`).join('')}</div>`;
  const res = await Promise.all(LEAGUE_KEYS.map(async k => { const t = TEAMS[LEAGUES[k].team]; const pic = await safe(API.picture(t), null); return { k, t, pic }; }));
  if (!alive()) return;
  $('#lgCards').innerHTML = res.map(({ k, t, pic }) => {
    const L = LEAGUES[k], groups = pic ? Object.values(pic.table.leagues) : [];
    const n = k === 'mlb' ? 6 : k === 'nfl' ? 7 : 6;
    return `<div class="card"><div class="row" style="gap:12px;margin-bottom:12px"><img src="${teamLogo(t)}" width="44" height="44" alt=""><div><h3 style="margin:0">${L.short}</h3><div class="muted small">${esc(L.sub)}</div></div></div>
      ${pic ? picBannerHtml(pic, true) : ''}
      ${groups.map(g => `<h4 style="margin:14px 0 6px">${esc(g.name)}</h4><div class="mini">${g.ordered.slice(0, n).map((r, i) => `<div class="${pic && r.id === pic.us.id ? 'us' : ''}"><span class="s">${r.seed ?? i + 1}</span><img src="${esc(r.logo)}" alt=""><b>${esc(r.abbr)}</b><span class="rec">${esc(`${r.w}-${r.l}${r.t ? '-' + r.t : ''}`)}</span></div>`).join('')}</div>`).join('')}
      <div class="row" style="margin-top:16px"><a class="btn small primary" style="--team:${t.primary}" href="#/league/${k}">Full ${L.short} standings →</a><a class="btn small" href="#/league/${k}/leaders">Leaders</a></div></div>`;
  }).join('');
}

const LEAGUE_TABS = [['standings', 'Standings'], ['picture', 'Playoff picture'], ['leaders', 'League leaders'], ['news', 'News & scores']];
async function viewLeague({ parts, q, mount, alive }) {
  const key = parts[1], L = LEAGUES[key], tab = LEAGUE_TABS.some(x => x[0] === parts[2]) ? parts[2] : 'standings', t = TEAMS[L.team];
  const table = await API.leagueTable(key);
  const pic = await safe(API.picture(t), null); if (!alive()) return;
  mount.innerHTML = `<div class="team-head" style="--team:${t.primary}"><img class="logo" src="${teamLogoOn(t)}" alt=""><div class="meta"><div class="small muted" style="letter-spacing:.12em;text-transform:uppercase">${esc(L.sub)}${table.fallback ? ` · showing ${table.year}–${String(table.year + 1).slice(2)} final` : ''}</div><h1>${esc(L.name)}</h1>
      <div class="row small muted"><a href="#/team/${t.key}/picture" style="color:#fff;text-decoration:underline">${esc(t.nick)}: ${esc(pic?.statusShort || '')}</a></div></div></div>
    <div class="tabs" id="tabs">${LEAGUE_TABS.map(([k, l]) => `<a href="#/league/${key}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div><div id="lgBody">${spinner()}</div>`;
  const body = $('#lgBody');
  if (tab === 'standings') return leagueStandings(key, table, pic, body);
  if (tab === 'picture') return leaguePicture(key, table, pic, body);
  if (tab === 'leaders') return leagueLeadersTab(key, table, body, alive);
  return leagueNewsTab(key, body, alive);
}

function miniDiv(table, pic, div, title, id) {
  const us = pic?.us, top = div[0];
  const cols = [
    { key: 'name', label: title, fmt: r => `<div class="pname"><img src="${esc(r.logo)}" style="border-radius:0;background:none;border:0;width:22px;height:22px;object-fit:contain" alt="">${us && r.id === us.id ? `<b>${esc(r.name)}</b>` : esc(r.name)}</div>` },
    { key: 'w', label: 'W', num: true }, { key: 'l', label: 'L', num: true }, ...(table.kind === 'nfl' ? [{ key: 't', label: 'T', num: true }] : []),
    { key: 'pct', label: 'PCT', num: true, fmt: r => fmtPct(r.pct) }, { key: 'gbx', label: 'GB', num: true, fmt: r => fmtGB(gbFrom(top, r)) },
    ...(table.kind === 'nfl' ? [] : [{ key: 'l10', label: 'L10', num: true }]), { key: 'streak', label: 'STRK', num: true },
  ];
  return renderTable(id, cols, div, { rowClass: r => (us && r.id === us.id ? 'us hl' : '') });
}
function leagueStandings(key, table, pic, body) {
  const groups = Object.values(table.leagues);
  const draw = mode => {
    if (mode === 'all') {
      const rows = [...table.teams].sort((a, b) => b.pct - a.pct || (b.diff || 0) - (a.diff || 0)), top = rows[0], us = pic?.us;
      const cols = [{ key: '_i', label: '#', num: true }, { key: 'name', label: 'Team', fmt: r => `<div class="pname"><img src="${esc(r.logo)}" style="border-radius:0;background:none;border:0;width:24px;height:24px;object-fit:contain" alt="">${us && r.id === us.id ? `<b>${esc(r.name)}</b>` : esc(r.name)}</div>` }, { key: 'w', label: 'W-L', num: true, cls: 'nw', sortVal: r => r.pct, fmt: r => `<b>${r.w}-${r.l}${r.t ? '-' + r.t : ''}</b>` }, { key: 'pct', label: 'PCT', num: true, fmt: r => fmtPct(r.pct) }, { key: 'gbx', label: 'GB', num: true, fmt: r => fmtGB(gbFrom(top, r)) }, { key: 'conf', label: table.kind === 'mlb' ? 'League' : 'Conf', fmt: r => esc(r.lg || r.conf) }, { key: 'status', label: '', fmt: r => statusBadge(r, table.kind) }];
      $('#stBox').innerHTML = renderTable(`lgall-${key}`, cols, rows.map((r, i) => ({ ...r, _i: i + 1 })), { rowClass: r => (us && r.id === us.id ? 'us hl' : '') });
      return;
    }
    $('#stBox').innerHTML = groups.map(g => `<div class="section" style="margin-top:0;margin-bottom:24px"><h2 style="font-size:1.5rem">${esc(g.name)}</h2>${g.divisions.length ? `<div class="grid ${table.kind === 'mlb' ? 'g3' : 'g2'}">${g.divisions.map((d, i) => `<div>${miniDiv(table, pic, d, (d[0].divName || '').replace(/^(American|National) League /, ''), `lgdiv-${key}-${g.key}-${i}`)}</div>`).join('')}</div>` : (() => { const fake = { us: pic?.us, kind: table.kind }; return raceTableHtml(fake, { rows: g.ordered, showSeed: true, cutAfter: 6, cutAfter2: 10, gb: (r, rows) => gbFrom(rows[0], r) }, `lgconf-${key}-${g.key}`); })()}</div>`).join('');
  };
  body.innerHTML = `<div class="filters" style="padding:10px 14px"><div class="seg" id="stSeg"><button data-m="div" class="on">${table.kind === 'nba' ? 'By conference' : 'By division'}</button><button data-m="all">Whole league</button></div><span class="muted small">${table.fallback ? `${table.year}–${String(table.year + 1).slice(2)} final standings (new season hasn't started)` : `Updated live · ${table.started ? 'season in progress' : 'season not started'}`}</span></div><div id="stBox"></div>`;
  $('#stSeg').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; $$('#stSeg button').forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.m); });
  draw('div');
}
function leaguePicture(key, table, pic, body) {
  const groups = Object.values(table.leagues), kind = table.kind;
  const rules = kind === 'mlb' ? 'Six teams per league: three division winners (seeds 1–3) and three Wild Cards (4–6). The top two seeds get a bye.' : kind === 'nfl' ? 'Seven teams per conference: four division winners (1–4) and three wild cards (5–7). Only the #1 seed gets a bye.' : 'Seeds 1–6 clinch directly. Seeds 7–10 go to the Play-In Tournament.';
  const fake = { us: pic?.us, kind };
  body.innerHTML = `<p class="muted">${rules} Red lines mark the cut. ${table.fallback ? 'The new season has not started, so this is last season\'s final order.' : ''}</p><div class="stack" style="gap:26px">${groups.map(g => {
    const cuts = kind === 'mlb' ? { cutAfter: 6 } : kind === 'nfl' ? { cutAfter: 7 } : { cutAfter: 6, cutAfter2: 10 };
    const cut = kind === 'mlb' ? g.ordered[5] : kind === 'nfl' ? g.ordered[6] : g.ordered[5];
    const scope = { rows: kind === 'mlb' ? g.ordered.slice(0, 10) : g.ordered.slice(0, kind === 'nfl' ? 10 : 12), showSeed: true, ...cuts, gbLabel: 'vs cut', gb: r => (kind === 'mlb' && r.status === 'div' ? 0 : -((r.w - cut.w) + (cut.l - r.l)) / 2) };
    return `<div><h3 style="margin-bottom:8px">${esc(g.name)}</h3>${raceTableHtml(fake, scope, `pic-${key}-${g.key}`)}</div>`;
  }).join('')}</div><p class="small dim" style="margin-top:12px">"vs cut": + = games ahead of the last playoff spot, otherwise games behind it.</p>`;
}
async function leagueLeadersTab(key, table, body, alive) {
  const opts = key === 'mlb' ? null : [[null, 'Current season'], [key === 'nba' ? 2025 : nowYear() - 1, 'Last season']];
  let year = null;
  const draw = async () => {
    $('#ldBox').innerHTML = spinner('Loading league leaders…');
    const groups = await API.leagueLeaders(key, key === 'nba' ? (year ?? (table.fallback ? table.year + 1 : null)) : year); if (!alive()) return;
    $('#ldBox').innerHTML = groups.some(g => g.lists.length) ? leaderListsHtml(groups) : errBox('League leaders are not available yet.');
  };
  body.innerHTML = `<div class="filters" style="padding:10px 14px">${opts ? `<div class="seg" id="ldSeg">${opts.map(([v, l], i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>` : '<span class="muted small">Qualified players, current season.</span>'}<span class="muted small">Philadelphia players are highlighted.</span></div><div id="ldBox"></div>`;
  $('#ldSeg')?.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; $$('#ldSeg button').forEach(x => x.classList.toggle('on', x === b)); year = opts[+b.dataset.i][0]; draw(); });
  if (key === 'nba' && table.fallback) $('#ldBox').insertAdjacentHTML('beforebegin', `<div class="errbox" style="margin-bottom:12px">The ${table.year + 1}–${String(table.year + 2).slice(2)} season hasn't started, so these are the ${table.year}–${String(table.year + 1).slice(2)} leaders.</div>`);
  draw();
}
async function leagueNewsTab(key, body, alive) {
  body.innerHTML = `<div class="split"><div class="card"><h3>Headlines</h3><div id="lgNews">${spinner()}</div></div><div class="card"><h3>Latest scores</h3><div id="lgScores">${spinner()}</div></div></div>`;
  API.leagueNews(key).then(n => { if (!alive()) return; $('#lgNews').innerHTML = n.length ? n.map(a => `<a class="news" href="${esc(a.link)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<div><div class="t">${esc(a.title)}</div><div class="small muted">${ago(a.date)}</div></div></a>`).join('') : errBox('No headlines right now.'); });
  API.leagueScores(key).then(g => { if (!alive()) return; $('#lgScores').innerHTML = g.length ? `<div class="stack" style="gap:8px">${g.slice(0, 24).map(x => `<a class="gamerow ${x.philly ? 'ph' : ''}" href="${esc(x.link || '#')}" target="_blank" rel="noopener"><span class="tm"><img src="${esc(x.away.logo)}" alt="" onerror="this.style.visibility='hidden'">${esc(x.away.abbr)}</span><b class="${x.away.win ? '' : 'dim'}">${esc(x.away.score ?? '')}</b><span class="at">${x.state === 'post' ? 'F' : x.state === 'in' ? 'LIVE' : '@'}</span><b class="${x.home.win ? '' : 'dim'}">${esc(x.home.score ?? '')}</b><span class="tm"><img src="${esc(x.home.logo)}" alt="" onerror="this.style.visibility='hidden'">${esc(x.home.abbr)}</span><span class="dim small">${esc(x.state === 'pre' ? fmtTime(new Date(x.ts).toISOString()) : x.detail)}</span></a>`).join('')}</div>` : '<div class="muted small">No games in the latest window.</div>'; });
}

/* ---------- MLB pro stats (Stats tab) ---------- */
function ttip(label, tip) { return `<abbr title="${esc(tip)}" style="text-decoration:none;cursor:help">${esc(label)}</abbr>`; }
async function mlbProStatsView(t, mount, alive, rosterMap) {
  const cur = nowYear(), state = { year: null, role: 'everyday' };
  mount.innerHTML = `<div class="filters" style="padding:10px 14px"><div class="seg" id="yrSeg"><button data-y="" class="on">${cur} season</button><button data-y="${cur - 1}">${cur - 1}</button></div><span class="muted small">Advanced stats are relative to the league: 100 = average.</span></div><div id="proBox">${spinner('Loading player stats…')}</div>`;
  const nameLink = p => { const rid = rosterMap.get(normName(p.name)); return rid ? `<a href="javascript:void(0)" data-player="${rid}" data-team="${t.key}" data-name="${esc(p.name)}"><b>${esc(p.name)}</b></a>` : `<a href="https://www.mlb.com/player/${p.id}" target="_blank" rel="noopener"><b>${esc(p.name)}</b> ↗</a>`; };
  const gr = (g, v) => (v == null ? '<span class="dim">—</span>' : `<span class="gr gr-${g[0]}" title="${g[1]}">${v}</span>`);
  const load = async () => {
    $('#proBox').innerHTML = spinner('Loading player stats…');
    const d = await API.mlbPro(t, state.year); if (!alive()) return;
    const H_ = d.hitters, P_ = d.pitchers, q = H_.filter(h => h.qual && h.wrc != null), sp = P_.filter(p => p.role === 'SP' && p.ip >= 15), rp = P_.filter(p => p.role === 'RP' && p.ip >= 8);
    const co = [], rate = (arr, f) => { const ip = sum(arr, p => p.ip); return ip ? sum(arr, p => f(p) * p.ip) / ip : null; };
    if (q.length) {
      const bestW = [...q].sort((a, b) => (b.war ?? -9) - (a.war ?? -9))[0], worst = [...q].sort((a, b) => a.wrc - b.wrc)[0];
      co.push(['good', 'Carrying the offense', `${bestW.name}: ${bestW.ops} OPS, ${bestW.wrc} wRC+ (${bestW.wrc - 100}% above a league-average hitter), ${bestW.war} WAR`]);
      if (worst.wrc < 95) co.push(['bad', 'Struggling at the plate', `${worst.name}: ${worst.ops} OPS, ${worst.wrc} wRC+ (${100 - worst.wrc}% below average)${worst.war != null ? `, ${worst.war} WAR` : ''}`]);
      const hot = H_.filter(h => h.l14 && parseFloat(h.l14) - parseFloat(h.ops) >= 0.1).sort((a, b) => parseFloat(b.l14) - parseFloat(a.l14)).slice(0, 3), cold = H_.filter(h => h.l14 && h.qual && parseFloat(h.ops) - parseFloat(h.l14) >= 0.1).slice(0, 3);
      if (hot.length) co.push(['good', 'Hot lately (last 14 days)', hot.map(h => `${h.name} (${h.l14} OPS, season ${h.ops})`).join(' · ')]);
      if (cold.length) co.push(['bad', 'Cold lately (last 14 days)', cold.map(h => `${h.name} (${h.l14} OPS, season ${h.ops})`).join(' · ')]);
    }
    if (sp.length) { const ace = [...sp].sort((a, b) => (a.eraM ?? 999) - (b.eraM ?? 999))[0], rot = rate(sp, p => parseFloat(p.era)); co.push(['good', 'Rotation ace', `${ace.name}: ${ace.era} ERA, ${ace.whip} WHIP, ${ace.k9 ?? '—'} K/9${ace.war != null ? `, ${ace.war} WAR` : ''}`]); if (rot != null) co.push(['', 'Starters as a group', `${rot.toFixed(2)} ERA over ${Math.round(sum(sp, p => p.ip))} innings`]); const bad = sp.filter(p => p.eraM > 125); if (bad.length) co.push(['bad', 'Rotation trouble spots', bad.map(p => `${p.name} (${p.era} ERA)`).join(' · ')]); }
    if (rp.length) { const pen = rate(rp, p => parseFloat(p.era)); const shaky = rp.filter(p => p.eraM > 130).slice(0, 3); co.push(['', 'Bullpen', `${pen != null ? pen.toFixed(2) + ' ERA as a group. ' : ''}${shaky.length ? 'Shaky: ' + shaky.map(p => `${p.name} (${p.era})`).join(', ') : 'No major red flags.'}`]); }
    const callouts = co.length ? `<div class="grid g2" style="margin-bottom:22px">${co.map(([tone, h, b]) => `<div class="callout ${tone}"><b>${h}</b><span>${esc(b)}</span></div>`).join('')}</div>` : '';
    $('#proBox').innerHTML = `${callouts}
      <div class="section" style="margin-top:0"><h2 style="font-size:1.6rem">Hitters</h2><div class="filters" style="padding:8px 12px"><div class="seg" id="roleSeg"><button data-r="everyday" class="on">Everyday players</button><button data-r="all">All hitters</button></div><span class="muted small">Everyday = ${Math.round(3.1 * d.teamGP)}+ plate appearances. Grade is based on wRC+.</span></div><div id="hitBox"></div></div>
      <div class="section"><h2 style="font-size:1.6rem">Starting pitchers</h2><div id="spBox"></div></div>
      <div class="section"><h2 style="font-size:1.6rem">Bullpen</h2><div id="rpBox"></div></div>
      <div class="card flat" style="margin-top:20px"><h4 style="margin:0 0 6px">Reading the numbers</h4><ul class="small muted" style="margin:0;padding-left:18px;line-height:1.7"><li><b>${ttip('wRC+', 'Weighted Runs Created Plus')}</b>: total offense vs. the league, park-adjusted. 100 is average, 130 is All-Star level, below 80 is a problem.</li><li><b>${ttip('WAR', 'Wins Above Replacement')}</b>: total wins a player adds vs. a replacement-level player. 2 = solid starter, 5 = star, 8 = MVP.</li><li><b>${ttip('ERA−', 'ERA minus')}</b>: ERA vs. the league. 100 is average and <b>lower is better</b> (80 = 20% better than average). <b>${ttip('FIP', 'Fielding Independent Pitching')}</b> strips out defense and luck.</li><li><b>Form</b> compares the last 14 days (hitters) or 30 days (pitchers) to the season line.</li></ul></div>`;
    const drawHit = () => {
      let rows = H_.filter(h => h.pa >= 10 && (state.role === 'all' || h.qual)); if (!rows.length) rows = H_.filter(h => h.pa >= 10);
      const cols = [
        { key: 'name', label: 'Player', fmt: nameLink }, { key: 'pos', label: 'Pos', cls: 'muted' }, { key: 'pa', label: 'PA', num: true },
        { key: 'avg', label: 'AVG', num: true, sortVal: r => parseFloat(r.avg) || 0 }, { key: 'obp', label: 'OBP', num: true, sortVal: r => parseFloat(r.obp) || 0 }, { key: 'slg', label: 'SLG', num: true, sortVal: r => parseFloat(r.slg) || 0 }, { key: 'ops', label: 'OPS', num: true, sortVal: r => parseFloat(r.ops) || 0, fmt: r => `<b>${esc(r.ops)}</b>` },
        { key: 'hr', label: 'HR', num: true }, { key: 'rbi', label: 'RBI', num: true }, { key: 'r', label: 'R', num: true }, { key: 'sb', label: 'SB', num: true },
        { key: 'bbp', label: 'BB%', num: true, fmt: r => (r.bbp == null ? '' : r.bbp.toFixed(1)) }, { key: 'kp', label: 'K%', num: true, fmt: r => (r.kp == null ? '' : r.kp.toFixed(1)) },
        { key: 'wrc', label: 'wRC+', num: true, sortVal: r => r.wrc ?? -1, fmt: r => gr(gradeBat(r.wrc), r.wrc) }, { key: 'war', label: 'WAR', num: true, sortVal: r => r.war ?? -9, fmt: r => (r.war == null ? '' : r.war.toFixed(1)) },
        { key: 'grade', label: 'Grade', sortVal: r => r.wrc ?? -1, fmt: r => { const g = gradeBat(r.wrc); return g[1] ? `<span class="gr gr-${g[0]}">${g[1]}</span>` : ''; } },
        ...(d.cur ? [{ key: 'l14', label: 'Form', sortVal: r => (r.l14 ? parseFloat(r.l14) - parseFloat(r.ops) : -9), fmt: r => { if (!r.l14) return '<span class="dim">—</span>'; const df = parseFloat(r.l14) - parseFloat(r.ops); return `<span class="form ${df >= 0.1 ? 'hot' : df <= -0.1 ? 'cold' : ''}" title="Last 14 days: ${r.l14} OPS (${r.l14pa} PA)">${df >= 0.1 ? '▲ Hot' : df <= -0.1 ? '▼ Cold' : '● Steady'} <span class="dim">${esc(r.l14)}</span></span>`; } }] : []),
      ];
      $('#hitBox').innerHTML = renderTable(`prohit-${t.key}-${state.year ?? 'c'}`, cols, rows, { sortKey: 'war', sortDir: -1 });
    };
    $('#roleSeg').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; state.role = b.dataset.r; $$('#roleSeg button').forEach(x => x.classList.toggle('on', x === b)); drawHit(); });
    drawHit();
    const pcols = (starter) => [
      { key: 'name', label: 'Pitcher', fmt: nameLink },
      { key: 'g', label: starter ? 'GS' : 'G', num: true, fmt: r => (starter ? r.gs : r.g) }, { key: 'ip', label: 'IP', num: true, fmt: r => esc(r.ipS) },
      ...(starter ? [{ key: 'w', label: 'W-L', num: true, sortVal: r => r.w, fmt: r => `${r.w}-${r.l}` }] : [{ key: 'sv', label: 'SV', num: true }, { key: 'hld', label: 'HLD', num: true }]),
      { key: 'era', label: 'ERA', num: true, sortVal: r => -(parseFloat(r.era) || 99), fmt: r => `<b>${esc(r.era)}</b>` }, { key: 'whip', label: 'WHIP', num: true, sortVal: r => -(parseFloat(r.whip) || 99) },
      { key: 'k9', label: 'K/9', num: true, fmt: r => (r.k9 == null ? '' : r.k9.toFixed(1)) }, { key: 'bb9', label: 'BB/9', num: true, sortVal: r => -(r.bb9 ?? 99), fmt: r => (r.bb9 == null ? '' : r.bb9.toFixed(1)) },
      { key: 'fip', label: 'FIP', num: true, sortVal: r => -(r.fip ?? 99), fmt: r => (r.fip == null ? '' : r.fip.toFixed(2)) }, { key: 'eraM', label: 'ERA−', num: true, sortVal: r => -(r.eraM ?? 999), fmt: r => gr(gradePit(r.eraM), r.eraM) }, { key: 'war', label: 'WAR', num: true, sortVal: r => r.war ?? -9, fmt: r => (r.war == null ? '' : r.war.toFixed(1)) },
      { key: 'grade', label: 'Grade', sortVal: r => -(r.eraM ?? 999), fmt: r => { const g = gradePit(r.eraM); return g[1] ? `<span class="gr gr-${g[0]}">${g[1]}</span>` : ''; } },
      ...(d.cur ? [{ key: 'l30', label: 'Form', sortVal: r => (r.l30 ? -(parseFloat(r.l30) - parseFloat(r.era)) : -99), fmt: r => { if (!r.l30) return '<span class="dim">—</span>'; const df = parseFloat(r.l30) - parseFloat(r.era); return `<span class="form ${df <= -1 ? 'hot' : df >= 1.5 ? 'cold' : ''}" title="Last 30 days ERA">${df <= -1 ? '▲ Hot' : df >= 1.5 ? '▼ Cold' : '● Steady'} <span class="dim">${esc(r.l30)}</span></span>`; } }] : []),
    ];
    $('#spBox').innerHTML = sp.length ? renderTable(`prosp-${t.key}-${state.year ?? 'c'}`, pcols(true), P_.filter(p => p.role === 'SP' && p.ip >= 1), { sortKey: 'war', sortDir: -1 }) : '<div class="muted small">No starting pitchers yet.</div>';
    $('#rpBox').innerHTML = renderTable(`prorp-${t.key}-${state.year ?? 'c'}`, pcols(false), P_.filter(p => p.role === 'RP' && p.ip >= 3), { sortKey: 'war', sortDir: -1 });
  };
  $('#yrSeg').addEventListener('click', e => { const b = e.target.closest('[data-y]'); if (!b) return; $$('#yrSeg button').forEach(x => x.classList.toggle('on', x === b)); state.year = b.dataset.y ? +b.dataset.y : null; load(); });
  load();
}
