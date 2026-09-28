/* MLB postseason: the whole bracket, every series, every game — seeding, records, schedule and Vegas lines. */

const PS_ROUND = { F: 'Wild Card Series', D: 'Division Series', L: 'Championship Series', W: 'World Series' };
const PS_ORDER = { F: 0, D: 1, L: 2, W: 3 };

/** Vegas odds for one game by matchup + local date. Works for any MLB game, regular season or postseason. */
API.gameOdds = async (awayAbbr, homeAbbr, officialDate, postseason = false) => {
  if (!awayAbbr || !homeAbbr || !officialDate) return null;
  const ds = officialDate.replace(/-/g, '');
  const load = season => safe(getJSON(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${ds}${season ? `&seasontype=${season}` : ''}`, 1800), null);
  let j = await load(postseason ? 3 : 2);
  let events = j?.events || [];
  if (!events.length) { j = await load(); events = j?.events || []; }
  const ev = events.find(e => { const abbrs = (e.competitions?.[0]?.competitors || []).map(c => c.team?.abbreviation); return abbrs.includes(awayAbbr) && abbrs.includes(homeAbbr); });
  const o = ev?.competitions?.[0]?.odds?.[0]; if (!o) return null;
  const ml = o.moneyline, num = x => { if (x == null) return null; const s = String(x); return /^[+-]/.test(s) ? s : (+s > 0 ? `+${s}` : s); };
  return {
    provider: o.provider?.name || 'Odds', details: o.details || '', ou: o.overUnder ?? null, spread: o.spread ?? null,
    moneyline: ml ? { home: num(ml.home?.close?.odds ?? ml.home?.open?.odds), away: num(ml.away?.close?.odds ?? ml.away?.open?.odds) } : null,
  };
};

/** The full postseason bracket for a season: every round, every series, seeded and grouped by league. */
API.mlbPostseason = async (year = null) => {
  const y = year ?? nowYear();
  const [sch, table] = await Promise.all([
    safe(getJSON(`${MLB_API}/schedule?sportId=1&season=${y}&gameTypes=F,D,L,W&hydrate=team,seriesStatus,linescore`, 60), null),
    safe(API.mlbTable(y), null),
  ]);
  const games = (sch?.dates || []).flatMap(d => d.games);
  if (!games.length) return { year: y, started: false, series: [] };
  const seedOf = id => table?.teams.find(x => x.id === id)?.seed ?? null;
  const side = x => {
    const tm = x.team, ph = !!tm.placeholder;
    return { id: tm.id, name: tm.name, abbr: tm.abbreviation, placeholder: ph, logo: ph ? '' : `https://www.mlbstatic.com/team-logos/${tm.id}.svg`, seed: ph ? null : seedOf(tm.id), record: x.leagueRecord ? `${x.leagueRecord.wins}-${x.leagueRecord.losses}` : '' };
  };
  const map = new Map();
  [...games].sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate)).forEach(g => {
    const awaySide = side(g.teams.away), homeSide = side(g.teams.home);
    const key = `${g.gameType}|${[awaySide.id, homeSide.id].sort((a, b) => a - b).join('-')}`;
    if (!map.has(key)) map.set(key, { key, gameType: g.gameType, order: PS_ORDER[g.gameType] ?? 9, round: PS_ROUND[g.gameType] || g.seriesDescription || '', desc: g.seriesDescription || '', bestOf: g.gamesInSeries || (g.gameType === 'F' ? 3 : g.gameType === 'D' ? 5 : 7), teamA: homeSide, teamB: awaySide, games: [] });
    const s = map.get(key);
    const aIsHome = homeSide.id === s.teamA.id;
    s.games.push({
      pk: g.gamePk, date: g.gameDate, officialDate: g.officialDate,
      state: { Preview: 'pre', Live: 'in', Final: 'post' }[g.status?.abstractGameState] || 'pre', detail: g.status?.detailedState || '',
      num: g.seriesGameNumber || s.games.length + 1, ifNecessary: g.ifNecessary === 'Y', venue: g.venue?.name || '',
      aScore: aIsHome ? (g.teams.home.score ?? null) : (g.teams.away.score ?? null), bScore: aIsHome ? (g.teams.away.score ?? null) : (g.teams.home.score ?? null),
      aWin: !!(aIsHome ? g.teams.home.isWinner : g.teams.away.isWinner), bWin: !!(aIsHome ? g.teams.away.isWinner : g.teams.home.isWinner),
      awayAbbr: g.teams.away.team.abbreviation, homeAbbr: g.teams.home.team.abbreviation,
    });
  });
  const usId = TEAMS.phillies.mlbId;
  const series = [...map.values()].map(s => {
    const winsA = s.games.filter(g => g.state === 'post' && g.aWin).length, winsB = s.games.filter(g => g.state === 'post' && g.bWin).length;
    const need = Math.ceil(s.bestOf / 2), over = winsA >= need || winsB >= need;
    const league = /^AL\b/.test(s.desc) ? 'AL' : /^NL\b/.test(s.desc) ? 'NL' : null;
    const lead = winsA > winsB ? s.teamA : s.teamB, max = Math.max(winsA, winsB), min = Math.min(winsA, winsB);
    const status = over ? `${lead.abbr} wins ${max}-${min}` : (winsA === 0 && winsB === 0) ? `Best-of-${s.bestOf}` : winsA === winsB ? `Series tied ${winsA}-${winsB}` : `${lead.abbr} leads ${max}-${min}`;
    return { ...s, winsA, winsB, over, winner: over ? (winsA > winsB ? 'A' : 'B') : null, league, status, involvesUs: s.teamA.id === usId || s.teamB.id === usId };
  }).sort((a, b) => a.order - b.order || (a.league || 'Z').localeCompare(b.league || 'Z') || (b.involvesUs - a.involvesUs));
  return { year: y, started: true, series };
};

/** Fetch Vegas odds for every not-yet-played game between two confirmed (non-placeholder) teams. */
async function attachPostseasonOdds(series) {
  const pending = [];
  series.forEach(s => { if (s.teamA.placeholder || s.teamB.placeholder) return; s.games.forEach(g => { if (g.state === 'pre') pending.push(g); }); });
  if (!pending.length) return;
  await pool(pending, 6, async g => { g.odds = await safe(API.gameOdds(g.awayAbbr, g.homeAbbr, g.officialDate, true), null); });
}

/* ---------- rendering ---------- */
function psTeamHtml(team, wins, isWinner) {
  if (team.placeholder) return `<div class="pst pst-tbd"><span class="pst-seed">–</span><span class="pst-name"><b>TBD</b><span class="dim small">${esc(team.abbr)}</span></span><span class="pst-wins">–</span></div>`;
  const us = team.id === TEAMS.phillies.mlbId;
  return `<a class="pst ${isWinner ? 'w' : ''} ${us ? 'us' : ''}" href="javascript:void(0)" data-teamcard="mlb|${team.id}">
    <span class="pst-seed">${team.seed ?? '–'}</span><img src="${esc(team.logo)}" alt="">
    <span class="pst-name"><b>${esc(team.name)}</b><span class="dim small">${esc(team.record || '')}</span></span>
    <span class="pst-wins">${wins}</span>
  </a>`;
}
function psGameHtml(g, s) {
  const ref = `mlb|mlb|${g.pk}|phillies`;
  if (g.state === 'post') {
    const winAbbr = g.aWin ? s.teamA.abbr : g.bWin ? s.teamB.abbr : '';
    return `<a class="psg" href="javascript:void(0)" data-game="${ref}"><span class="psg-n">Gm ${g.num}</span><span class="psg-sc"><b class="${g.aWin ? '' : 'dim'}">${g.aScore ?? ''}</b>–<b class="${g.bWin ? '' : 'dim'}">${g.bScore ?? ''}</b></span><span class="psg-d dim">${esc(fmtDate(g.date, { month: 'short', day: 'numeric' }))}${winAbbr ? ` · ${esc(winAbbr)} W` : ''}</span></a>`;
  }
  if (g.state === 'in') return `<a class="psg live" href="javascript:void(0)" data-game="${ref}"><span class="psg-n">Gm ${g.num}</span><span class="badge live">Live</span><span class="psg-d">${esc(g.detail)}</span></a>`;
  const o = g.odds;
  return `<a class="psg" href="javascript:void(0)" data-game="${ref}"><span class="psg-n">Gm ${g.num}${g.ifNecessary ? '*' : ''}</span><span class="psg-d"><b>${esc(fmtDate(g.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</b> ${esc(fmtTime(g.date))}</span>${o ? `<span class="psg-odds">${esc(o.details || '')}${o.ou != null ? ` · O/U ${esc(o.ou)}` : ''}</span>` : (s.teamA.placeholder || s.teamB.placeholder ? '' : '<span class="psg-odds dim">Odds not posted yet</span>')}</a>`;
}
function seriesCardHtml(s) {
  const shown = s.games.filter(g => !(g.ifNecessary && g.state === 'pre' && s.over));
  const anyIfNec = shown.some(g => g.ifNecessary);
  return `<div class="card psc ${s.involvesUs ? 'us' : ''}">
    <div class="psc-head"><span>Best-of-${s.bestOf}</span><b class="${s.over ? 'done' : ''}">${esc(s.status)}</b></div>
    <div class="psc-teams">${psTeamHtml(s.teamA, s.winsA, s.winner === 'A')}${psTeamHtml(s.teamB, s.winsB, s.winner === 'B')}</div>
    <div class="psc-games">${shown.map(g => psGameHtml(g, s)).join('')}</div>
    ${anyIfNec ? '<p class="small dim" style="margin:6px 2px 0">* if necessary</p>' : ''}
  </div>`;
}

async function viewPlayoffs({ mount, alive }) {
  mount.innerHTML = `<div class="hero slim"><div class="tri"><span></span><span></span><span></span></div><h1>MLB Playoffs</h1><p class="lede" style="margin:0">The full postseason bracket — every series, every game, with seeding, records, schedules and betting lines. The Phillies are highlighted wherever they appear.</p></div>
    <div id="psBody" style="margin-top:22px">${spinner('Loading the bracket…')}</div>`;
  const data = await safe(API.mlbPostseason(), null); if (!alive()) return;
  if (!data || !data.started) { $('#psBody').innerHTML = errBox('The postseason bracket has not been set yet. Check back once the regular season wraps up and the field is clinched.'); return; }
  await attachPostseasonOdds(data.series); if (!alive()) return;
  const rounds = [['Wild Card Series', 'F'], ['Division Series', 'D'], ['Championship Series', 'L'], ['World Series', 'W']];
  $('#psBody').innerHTML = rounds.map(([label, gt], ri) => {
    const rs = data.series.filter(s => s.gameType === gt); if (!rs.length) return '';
    const al = rs.filter(s => s.league === 'AL'), nl = rs.filter(s => s.league === 'NL'), other = rs.filter(s => !s.league);
    const cards = list => list.map(seriesCardHtml).join('') || '<div class="muted small">Not set yet.</div>';
    return `<div class="section" style="margin-top:${ri === 0 ? 0 : 36}px"><h2>${esc(label)}</h2>
      ${other.length ? `<div class="stack">${cards(other)}</div>` : `<div class="grid g2"><div><h4 class="grouph">American League</h4><div class="stack">${cards(al)}</div></div><div><h4 class="grouph">National League</h4><div class="stack">${cards(nl)}</div></div></div>`}
    </div>`;
  }).join('') || errBox('No postseason games found for this season.');
}
