/* Indiana University teams: Big Ten standings, AP / Coaches rankings, team record and the college team page.
   Also the Phillies' offseason state. Data: ESPN public API. */

const ESPN_V2 = t => `https://site.api.espn.com/apis/v2/sports/${t.sport}/${t.league}`;
const ESPN_SITE = t => `https://site.api.espn.com/apis/site/v2/sports/${t.sport}/${t.league}`;

/** One conference's standings, normalised, with our team flagged and conference rank assigned. */
async function collegeStandings(t) {
  const j = await getJSON(`${ESPN_V2(t)}/standings?level=3`, 180);
  const grp = (j.children || []).find(c => (c.standings?.entries || []).some(e => String(e.team.id) === String(t.espnId))) || (j.children || []).find(c => c.name === t.confGroup);
  const st = (e, n) => e.stats.find(s => s.name === n);
  const rows = (grp?.standings?.entries || []).map(e => {
    const ov = String(st(e, 'overall')?.displayValue || '0-0'), [w = 0, l = 0, tt = 0] = ov.split('-').map(x => +x || 0);
    const cf = e.stats.find(s => /^vs\.?\s*conf/i.test(s.name))?.displayValue || '';
    const [cw = 0, cl = 0] = cf.split('-').map(x => +x || 0);
    return { id: String(e.team.id), name: e.team.displayName, abbr: e.team.abbreviation, logo: e.team.logos?.[0]?.href || '', w, l, t: tt, pct: pct(w, l, tt), cw, cl, conf: cf || '0-0', confPct: pct(cw, cl), streak: st(e, 'streak')?.displayValue || '', diff: st(e, 'pointDifferential')?.displayValue || '', us: String(e.team.id) === String(t.espnId) };
  }).sort((a, b) => b.confPct - a.confPct || (b.cw + b.cl) - (a.cw + a.cl) || b.pct - a.pct || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.divRank = i + 1));
  return { name: grp?.name || t.confGroup, short: t.conf, rows, us: rows.find(r => r.us) || null, started: rows.some(r => r.w + r.l > 0) };
}

/** AP / Coaches (and CFP, once it exists) polls with our team's position. */
async function collegeRanks(t) {
  const j = await getJSON(`${ESPN_SITE(t)}/rankings`, 600);
  return (j.rankings || []).map(r => {
    const short = /playoff/i.test(r.name) ? 'CFP' : /AP/i.test(r.name) ? 'AP' : /coach/i.test(r.name) ? 'Coaches' : r.name;
    const ranks = (r.ranks || []).map(x => ({ rank: x.current, prev: x.previous, id: String(x.team?.id), name: x.team?.location || x.team?.name, abbr: x.team?.abbreviation, logo: x.team?.logos?.[0]?.href || '', rec: x.recordSummary || '', pts: x.points, trend: x.trend }));
    return { name: r.name, short, ranks, us: ranks.find(x => x.id === String(t.espnId)) || null };
  });
}
const apRank = ranks => (ranks || []).find(r => r.short === 'AP')?.us?.rank ?? null;

/** Team info in the same shape API.team returns for the pro teams. */
async function collegeInfo(t) {
  const [std, ranks] = await Promise.all([collegeStandings(t), safe(collegeRanks(t), [])]);
  const us = std.us, ap = apRank(ranks), cfp = ranks.find(r => r.short === 'CFP')?.us?.rank ?? null;
  const parts = [cfp ? `CFP #${cfp}` : ap ? `AP #${ap}` : '', std.started && us ? `${ord(us.divRank)} in ${t.conf}` : `${t.conf} · ${t.sport === 'football' ? 'fall' : 'winter'} season`].filter(Boolean);
  return { id: String(t.espnId), name: t.name, color: t.primary, logo: teamLogo(t), summary: us ? `${us.w}-${us.l}` : '0-0', w: us?.w || 0, l: us?.l || 0, tie: us?.t || 0, otl: 0, standingSummary: parts.join(' · '), venue: null, links: [], nextEvent: null, confRecord: us?.conf || '', ap, cfp };
}

/** Record + standing from the league standings table, used when ESPN's team endpoint is unavailable. */
async function teamInfoFromTable(t) {
  const tbl = await API.leagueTable(t.league), us = tbl.teams.find(x => String(x.id) === String(t.mlbId || t.espnId));
  if (!us) throw new Error('team not in standings');
  const standing = t.league === 'nba' ? `${ord(us.seed)} in the ${us.conf}` : `${ord(us.divRank)} in ${shortDiv(us.divName)}`;
  return { id: String(us.id), name: t.name, color: t.primary, logo: teamLogo(t), summary: `${us.w}-${us.l}${us.t ? '-' + us.t : ''}`, w: us.w, l: us.l, tie: us.t || 0, otl: 0, standingSummary: standing, venue: null, links: [], nextEvent: null };
}

/** "Playoff picture" stand-in for college teams: ranking + conference position, shaped like the pro pictures the home page reads. */
async function collegePicture(t) {
  const [std, ranks] = await Promise.all([collegeStandings(t), safe(collegeRanks(t), [])]);
  const us = std.us || { id: String(t.espnId), w: 0, l: 0, t: 0, conf: '0-0', divRank: 0, divName: t.conf };
  const ap = apRank(ranks), cfp = ranks.find(r => r.short === 'CFP')?.us?.rank ?? null, coach = ranks.find(r => r.short === 'Coaches')?.us?.rank ?? null;
  const lead = cfp ? `#${cfp} IN THE CFP RANKINGS` : ap ? `#${ap} IN THE AP POLL` : coach ? `#${coach} IN THE COACHES POLL` : 'UNRANKED';
  const rec = `${us.w}-${us.l}${us.t ? '-' + us.t : ''}`;
  const sub = std.started ? `${rec} overall · ${us.conf} ${t.conf} · ${ord(us.divRank)} in the conference` : `Season ${t.sport === 'football' ? 'underway' : 'starting'} · ${t.conf} play hasn't begun`;
  return {
    kind: t.league, college: true, us: { ...us, divName: t.conf }, tone: ap || cfp ? 'in' : 'idle', headline: lead, sub, bullets: [], tiles: [], left: 0, G: t.gamesInSeason, inField: !!(ap || cfp),
    statusShort: `${ap || cfp ? `${cfp ? 'CFP' : 'AP'} #${cfp || ap} · ` : ''}${rec}`, scopes: [{ key: 'conf', label: t.conf, rows: std.rows }], ranks, std,
  };
}

/* Wrap the shared data functions so the college teams and the Phillies' offseason flow through every existing page. */
{
  const baseTeam = API.team.bind(API), basePicture = API.picture;
  API.team = async t => {
    if (t.college) return collegeInfo(t);
    try { return await baseTeam(t); } catch (e) { return teamInfoFromTable(t); }
  };
  API.picture = async t => {
    if (t.college) return collegePicture(t);
    const pic = await basePicture(t);
    if (t.league === 'mlb') await applyMlbOffseason(pic, t);
    return pic;
  };
}

/** Once the Phillies' last game is played, re-label the MLB picture as an offseason summary. */
async function applyMlbOffseason(pic, t) {
  if (!pic || pic.left > 0 || !pic.us) return;
  const ps = await safe(API.mlbPostseason(), null);
  const mine = (ps?.series || []).filter(s => s.involvesUs);
  if (mine.some(s => !s.over)) return;
  const last = mine[mine.length - 1], us = pic.us, rec = `${us.w}-${us.l}`;
  pic.offseason = true; pic.tone = 'idle'; pic.bullets = [];
  if (last) {
    const usIsA = last.teamA.id === t.mlbId, uw = usIsA ? last.winsA : last.winsB, ow = usIsA ? last.winsB : last.winsA, opp = usIsA ? last.teamB : last.teamA, won = uw > ow;
    pic.postseasonResult = { series: last, won, uw, ow, opp };
    if (won && last.gameType === 'W') { pic.headline = 'WORLD SERIES CHAMPIONS'; pic.sub = `${rec} in the regular season · beat ${opp.name} ${uw}-${ow}`; pic.statusShort = 'World Series champions'; pic.tone = 'in'; }
    else { pic.headline = 'SEASON OVER'; pic.sub = `${rec} in the regular season · lost the ${last.round} to ${opp.name} (${uw}-${ow})`; pic.statusShort = `Offseason · out in the ${last.round.replace(' Series', '')}`; }
  } else {
    pic.headline = 'SEASON OVER'; pic.sub = `${rec} in the regular season · missed the postseason`; pic.statusShort = `Offseason · ${rec}`;
  }
}

/** Offseason card for a Philly team that is done for the year. */
function offseasonBannerHtml(pic, t) {
  const r = pic.postseasonResult;
  return `<div class="pic-banner tone-${pic.tone === 'in' ? 'in' : 'idle'}" style="margin-bottom:18px">
    <div class="pb-main"><div class="pb-lab">${esc(t.nick)} · Offseason</div><div class="pb-big">${esc(pic.headline)}</div><div class="pb-sub">${esc(pic.sub)}</div></div>
    <div class="pb-tiles"><div><b>${pic.us.w}-${pic.us.l}</b><span>Final record</span></div>${r ? `<div><b>${r.uw}-${r.ow}</b><span>${esc(r.series.round.replace(' Series', ''))}</span></div>` : ''}</div></div>`;
}

/* ---------- College team page ---------- */
const COLLEGE_TABS = [['overview', 'Overview'], ['news', 'News'], ['schedule', 'Schedule'], ['picture', 'Standings & Rankings'], ['roster', 'Roster'], ['injuries', 'Injuries'], ['shop', 'Shop']];

function collegeStandingsTable(std, t, { windowAround = false } = {}) {
  if (!std.rows.length) return errBox('Conference standings are not available yet.');
  let rows = std.rows;
  if (windowAround && std.us) { const i = rows.indexOf(std.us), a = Math.max(0, Math.min(i - 3, rows.length - 7)); rows = rows.slice(a, a + 7); }
  const cols = [
    { key: 'divRank', label: '#', num: true },
    { key: 'name', label: std.short || t.conf, fmt: r => `<div class="pname"><img src="${esc(r.logo)}" style="border-radius:0;background:none;border:0;width:24px;height:24px;object-fit:contain" alt="" onerror="this.style.visibility='hidden'">${r.us ? `<b>${esc(r.name)}</b>` : esc(r.name)}</div>`, sortVal: r => r.name },
    { key: 'conf', label: 'Conf', num: true, sortVal: r => r.confPct, fmt: r => `<b>${esc(r.conf)}</b>` },
    { key: 'w', label: 'Overall', num: true, sortVal: r => r.pct, fmt: r => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}` },
    { key: 'streak', label: 'Strk', num: true },
    { key: 'diff', label: 'Diff', num: true, sortVal: r => parseFloat(r.diff) || 0 },
  ];
  return renderTable(`cstd-${t.key}${windowAround ? '-w' : ''}`, cols, rows, { rowClass: r => (r.us ? 'us hl' : '') }) + (std.started ? '' : `<p class="small dim" style="margin:8px 2px 0">Conference play hasn't started yet, so every team is 0-0 and listed alphabetically.</p>`);
}
function pollCardHtml(poll, t, { limit = 25 } = {}) {
  const shown = poll.ranks.slice(0, limit), usIn = shown.some(x => x.id === String(t.espnId));
  const line = x => `<tr class="${x.id === String(t.espnId) ? 'us hl' : ''}"><td class="num"><b>${x.rank}</b></td><td><div class="pname"><img src="${esc(x.logo)}" style="border-radius:0;background:none;border:0;width:22px;height:22px;object-fit:contain" alt="" onerror="this.style.visibility='hidden'">${x.id === String(t.espnId) ? `<b>${esc(x.name)}</b>` : esc(x.name)}</div></td><td class="num nw">${esc(x.rec)}</td><td class="num dim">${x.prev && x.prev !== x.rank ? (x.prev > x.rank ? `<span class="win">▲${x.prev - x.rank}</span>` : `<span class="loss">▼${x.rank - x.prev}</span>`) : '—'}</td></tr>`;
  const extra = !usIn && poll.us ? line(poll.us) : '';
  return `<div class="table-wrap"><table class="data"><thead><tr><th class="num">#</th><th class="stk">Team</th><th class="num">Record</th><th class="num">Move</th></tr></thead><tbody>${shown.map(line).join('')}${extra ? `<tr class="secrow"><td colspan="4" class="dim small" style="text-align:center">…</td></tr>${extra}` : ''}</tbody></table></div>`;
}

async function tabCollegeOverview(t, { mount, alive }) {
  mount.innerHTML = `<div class="split"><div class="stack">
      <div class="card" id="ovGames">${spinner()}</div>
      <div class="card" id="ovNews">${spinner()}</div>
      <div class="card" id="ovLast">${spinner('Loading last game…')}</div>
      <div class="card"><h3>${esc(t.conf)} standings</h3><div id="ovStd">${spinner()}</div></div>
    </div><div class="stack">
      <div class="card" id="ovRank">${spinner('Loading rankings…')}</div>
      <div class="card" id="ovOutlook">${spinner()}</div>
      <div class="card" id="ovCoach"></div>
    </div></div>`;
  const gsP = safe(API.gameStatus(t)), stdP = safe(collegeStandings(t), null), rankP = safe(collegeRanks(t), []), rosterP = safe(API.roster(t)), newsP = safe(API.news(t, 14), []), infoP = safe(API.team(t));
  const drawGames = async () => {
    const gs = await gsP; if (!alive() || !gs) { if (alive()) $('#ovGames').innerHTML = errBox('Schedule data unavailable.'); return; }
    const played = gs.games.filter(g => g.state === 'post' && g.stype !== 1), upcoming = gs.games.filter(g => g.state === 'pre' && g.stype !== 1).slice(0, 5);
    $('#ovGames').innerHTML = `<h3>Game center</h3><div class="grid g2">${gs.live ? gameBox(t, gs.live, 'LIVE') : gameBox(t, gs.next, 'NEXT')}${gameBox(t, gs.last, 'LAST')}</div>
      ${played.length ? `<div class="row" style="margin-top:14px"><span class="small muted">Recent form</span>${resultDots(played.slice(-8))}</div>` : ''}
      ${upcoming.length ? `<h4 style="margin-top:16px">Coming up</h4><div class="stack" style="gap:6px">${upcoming.map(g => `<div class="row between small click" data-game="${gameRef(t, g)}" style="cursor:pointer"><span class="row" style="gap:8px"><img src="${esc(g.opp.logo)}" width="22" height="22" alt="" onerror="this.style.visibility='hidden'"> ${g.home ? 'vs' : '@'} ${esc(g.opp.name)}</span><span class="muted">${esc(fmtDay(g.date))} · ${g.tbd ? 'time TBD' : esc(fmtTime(g.date))}${g.tv ? ' · ' + esc(g.tv) : ''}</span></div>`).join('')}</div>` : ''}
      <a class="btn small" style="margin-top:14px" href="#/team/${t.key}/schedule">Full schedule &amp; results →</a>`;
    fillPreviewLines($('#ovGames'));
  };
  drawGames(); App.every(() => alive() && drawGames(), 45000);
  gsP.then(gs => lastGameCard(t, gs, alive));
  stdP.then(s => { if (alive()) $('#ovStd').innerHTML = s ? collegeStandingsTable(s, t, { windowAround: true }) + `<a class="btn small" style="margin-top:12px" href="#/team/${t.key}/picture">Full ${esc(t.conf)} standings →</a>` : errBox('Standings unavailable.'); });
  newsP.then(n => { if (alive()) overviewNews(t, $('#ovNews'), n); });
  rankP.then(ranks => {
    if (!alive()) return;
    const main = ranks.find(r => r.short === 'CFP') || ranks.find(r => r.short === 'AP') || ranks[0];
    $('#ovRank').innerHTML = main ? `<h3>${esc(main.name)}</h3>${pollCardHtml(main, t, { limit: 10 })}<a class="btn small" style="margin-top:12px" href="#/team/${t.key}/picture">All polls →</a>` : `<h3>Rankings</h3><div class="muted small">Polls aren't out yet.</div>`;
  });
  const [info, roster, std, ranks] = await Promise.all([infoP, rosterP, stdP, rankP]); if (!alive()) return;
  const us = std?.us, rows = [];
  rows.push(['Record', info ? `${esc(info.summary)} overall${us && std.started ? ` · ${esc(us.conf)} in ${esc(t.conf)}` : ''}` : '—']);
  ranks.forEach(r => rows.push([r.name, r.us ? `<b>#${r.us.rank}</b>${r.us.prev && r.us.prev !== r.us.rank ? ` (was #${r.us.prev})` : ''}` : 'Not ranked']));
  if (std?.started && us) rows.push(['Conference', `${ord(us.divRank)} of ${std.rows.length} in the ${esc(t.conf)}`]);
  const inj = (roster?.players || []).filter(p => p.injuries.length);
  rows.push(['Health report', inj.length ? `${inj.length} listed: ${inj.slice(0, 4).map(p => `${esc(p.name)} (${esc(p.injuries[0].status)})`).join(', ')}${inj.length > 4 ? '…' : ''}` : 'No players currently listed as injured']);
  $('#ovOutlook').innerHTML = `<h3>Outlook</h3><dl class="kv" style="grid-template-columns:110px 1fr">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const hc = roster?.coach;
  $('#ovCoach').innerHTML = `<h3>Head coach</h3>${hc ? `<div style="font-size:1.3rem;font-weight:700">${esc(hc.firstName)} ${esc(hc.lastName)}</div><div class="muted small">${hc.experience ? hc.experience + ' seasons as a head coach' : 'Indiana University'}</div>` : '<div class="muted small">Not available.</div>'}<a class="btn small" style="margin-top:10px" href="${esc(t.staffUrl)}" target="_blank" rel="noopener">Coaching staff ↗</a>`;
}

async function tabCollegePicture(t, { mount, alive }) {
  const [pic, ranks] = await Promise.all([API.picture(t), safe(collegeRanks(t), [])]); if (!alive()) return;
  mount.innerHTML = `<div class="pic-banner tone-${pic.tone}"><div class="pb-main"><div class="pb-lab">${esc(t.nick)} · ${esc(t.conf)}</div><div class="pb-big">${esc(pic.headline)}</div><div class="pb-sub">${esc(pic.sub)}</div></div></div>
    <div class="section" style="margin-top:22px"><h2>${esc(t.conf)} standings</h2><p class="section-sub">Ordered by conference record${pic.std.started ? '' : '. Conference play has not started yet, so every team shows 0-0'}.</p>${collegeStandingsTable(pic.std, t)}</div>
    <div class="section"><h2>Polls</h2><div class="grid g2">${ranks.length ? ranks.map(r => `<div class="card"><h3>${esc(r.name)}</h3>${pollCardHtml(r, t)}</div>`).join('') : '<div class="card"><div class="muted small">No polls published yet.</div></div>'}</div></div>`;
}
