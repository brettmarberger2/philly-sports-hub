/* MLB postseason: the whole bracket, every round, every series, every game — seeding, records, schedule and Vegas lines. */

const PS_ROUND = { F: 'Wild Card Series', D: 'Division Series', L: 'Championship Series', W: 'World Series' };
const PS_ORDER = { F: 0, D: 1, L: 2, W: 3 };
let LAST_PS = null;

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
  if (!games.length) { LAST_PS = { year: y, started: false, series: [] }; return LAST_PS; }
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
    const status = over ? `${lead.abbr} wins ${max}-${min}` : (s.teamA.placeholder || s.teamB.placeholder) ? 'Matchup TBD' : (winsA === 0 && winsB === 0) ? 'Not yet started' : winsA === winsB ? `Series tied ${winsA}-${winsB}` : `${lead.abbr} leads ${max}-${min}`;
    return { ...s, winsA, winsB, over, winner: over ? (winsA > winsB ? 'A' : 'B') : null, league, status, involvesUs: s.teamA.id === usId || s.teamB.id === usId };
  }).sort((a, b) => a.order - b.order || (a.league || 'Z').localeCompare(b.league || 'Z') || (b.involvesUs - a.involvesUs));
  LAST_PS = { year: y, started: true, series };
  return LAST_PS;
};

/** Fetch Vegas odds for every not-yet-played game between two confirmed (non-placeholder) teams. */
async function attachPostseasonOdds(series) {
  const pending = [];
  series.forEach(s => { if (s.teamA.placeholder || s.teamB.placeholder) return; s.games.forEach(g => { if (g.state === 'pre') pending.push(g); }); });
  if (!pending.length) return;
  await pool(pending, 6, async g => { g.odds = await safe(API.gameOdds(g.awayAbbr, g.homeAbbr, g.officialDate, true), null); });
}

/* ---------- series detail modal (teams, every game, odds) ---------- */
function psTeamHtml(team, wins, isWinner) {
  if (!team) return `<div class="pst pst-tbd"><span class="pst-seed">–</span><span class="pst-name"><b>TBD</b></span><span class="pst-wins">–</span></div>`;
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
  return `<div class="card psc ${s.involvesUs ? 'us' : ''}" style="box-shadow:none;border:0;padding:0">
    <div class="psc-head"><span>${esc(s.round)}${s.league ? ` · ${s.league}` : ''} · Best-of-${s.bestOf}</span><b class="${s.over ? 'done' : ''}">${esc(s.status)}</b></div>
    <div class="psc-teams">${psTeamHtml(s.teamA, s.winsA, s.winner === 'A')}${psTeamHtml(s.teamB, s.winsB, s.winner === 'B')}</div>
    <div class="psc-games">${shown.map(g => psGameHtml(g, s)).join('')}</div>
    ${anyIfNec ? '<p class="small dim" style="margin:6px 2px 0">* if necessary</p>' : ''}
  </div>`;
}
function openSeriesModal(key) {
  const s = (LAST_PS?.series || []).find(x => x.key === key); if (!s) return;
  openModal(`<div class="pl-body" style="padding-top:44px">${seriesCardHtml(s)}</div>`);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-series]'); if (!el) return;
  e.preventDefault(); openSeriesModal(el.dataset.series);
});

/** Prominent "we're in it" banner for a Philly team's Standings & Playoffs tab, once the postseason has started. */
function phillyPostseasonBannerHtml(s) {
  const us = s.teamA.id === TEAMS.phillies.mlbId ? s.teamA : s.teamB, opp = us === s.teamA ? s.teamB : s.teamA;
  const usWins = us === s.teamA ? s.winsA : s.winsB, oppWins = us === s.teamA ? s.winsB : s.winsA;
  const next = s.games.find(g => g.state === 'in') || s.games.find(g => g.state === 'pre');
  const tone = s.over ? (usWins > oppWins ? 'in' : 'out') : 'bubble';
  const record = s.over ? (usWins > oppWins ? `Won the series ${usWins}-${oppWins}` : `Lost the series ${oppWins}-${usWins}`) : (usWins === 0 && oppWins === 0) ? 'Series not yet started' : usWins === oppWins ? `Series tied ${usWins}-${oppWins}` : usWins > oppWins ? `Lead the series ${usWins}-${oppWins}` : `Trail the series ${oppWins}-${usWins}`;
  const nextLine = !next ? '' : next.state === 'in' ? `Live now · ${esc(next.detail)}` : `Next: Game ${next.num} · ${esc(fmtDate(next.date, { weekday: 'short', month: 'short', day: 'numeric' }))} ${esc(fmtTime(next.date))}${next.odds?.details ? ` · Line: ${esc(next.odds.details)}` : ''}`;
  return `<div class="pic-banner tone-${tone} click" data-series="${s.key}" style="margin-bottom:18px;cursor:pointer">
    <div class="pb-main"><div class="pb-lab">${esc(s.round)}${s.league ? ` · ${s.league}` : ''} · The Phillies are in the playoffs</div>
      <div class="pb-big">${esc(us.abbr)} vs ${esc(opp.abbr)} — ${esc(record)}</div>
      <div class="pb-sub">${nextLine}</div></div>
    <div class="pb-tiles"><div><b>${usWins}-${oppWins}</b><span>Best-of-${s.bestOf}</span></div></div>
  </div>`;
}

/* ---------- bracket tree ---------- */
function brkTeamRowHtml(team, wins, isWinner, bye) {
  if (bye) return `<div class="brk-t w brk-bye"><span class="brk-seed">${team?.seed ?? '–'}</span>${team ? `<img src="${esc(team.logo)}" alt="">` : ''}<span class="brk-nm">${team ? esc(team.abbr) : 'TBD'}</span><span class="brk-w">BYE</span></div>`;
  if (!team) return `<div class="brk-t brk-empty"></div>`;
  if (team.placeholder) return `<div class="brk-t brk-tbd"><span class="brk-seed">–</span><span class="brk-nm">TBD</span></div>`;
  const us = team.id === TEAMS.phillies.mlbId;
  return `<div class="brk-t ${isWinner ? 'w' : ''} ${us ? 'us' : ''}"><span class="brk-seed">${team.seed ?? '–'}</span><img src="${esc(team.logo)}" alt=""><span class="brk-nm">${esc(team.abbr)}</span><span class="brk-w">${wins}</span></div>`;
}
function brkMatchHtml(s, byeTeam) {
  if (byeTeam) return `<div class="brk-m brk-byem">${brkTeamRowHtml(byeTeam, 0, true, true)}${brkTeamRowHtml(null)}</div>`;
  if (!s) return `<div class="brk-m brk-ghost"></div>`;
  return `<div class="brk-m ${s.involvesUs ? 'us' : ''}" data-series="${s.key}" role="button" tabindex="0">${brkTeamRowHtml(s.teamA, s.winsA, s.winner === 'A')}${brkTeamRowHtml(s.teamB, s.winsB, s.winner === 'B')}</div>`;
}
function brkPairHtml(a, b) { return `<div class="brk-pair">${a}${b}</div>`; }

/** Slot a league's series into the fixed WC(4 incl. 2 byes) → DS(2) → CS(1) tree shape MLB's format always produces. */
function leagueHalfSeries(series, lg) {
  const wc = series.filter(s => s.gameType === 'F' && s.league === lg);
  const ds = series.filter(s => s.gameType === 'D' && s.league === lg);
  const cs = series.find(s => s.gameType === 'L' && s.league === lg) || null;
  const seedIn = (s, seed) => s && (s.teamA.seed === seed || s.teamB.seed === seed);
  const wc45 = wc.find(s => seedIn(s, 4) || seedIn(s, 5)) || wc[0] || null;
  const wc36 = wc.find(s => s !== wc45) || wc[1] || null;
  let ds1 = ds.find(s => seedIn(s, 1)) || null;
  let ds2 = ds.find(s => s !== ds1) || null;
  if (!ds1 && ds.length) { ds1 = ds[0]; ds2 = ds[1] || null; }
  const byeOf = s => { if (!s) return null; return s.teamA.placeholder ? s.teamB : (s.teamB.placeholder ? s.teamA : null); };
  return { wcTop: byeOf(ds1), wc45, wc36, wcBottom: byeOf(ds2), ds1, ds2, cs };
}
function wcColumnHtml(h) {
  return `<div class="brk-col-body">${brkPairHtml(brkMatchHtml(null, h.wcTop), brkMatchHtml(h.wc45))}${brkPairHtml(brkMatchHtml(h.wc36), brkMatchHtml(null, h.wcBottom))}</div>`;
}
function dsColumnHtml(h) { return `<div class="brk-col-body">${brkPairHtml(brkMatchHtml(h.ds1), brkMatchHtml(h.ds2))}</div>`; }
function csColumnHtml(h) { return `<div class="brk-col-body">${brkMatchHtml(h.cs)}</div>`; }
function halfHtml(h, mirror) {
  return `<div class="brk-half ${mirror ? 'brk-mirror' : ''}">
    <div class="brk-col brk-wc"><div class="brk-lab">Wild Card</div>${wcColumnHtml(h)}</div>
    <div class="brk-col brk-ds"><div class="brk-lab">Division Series</div>${dsColumnHtml(h)}</div>
    <div class="brk-col brk-cs"><div class="brk-lab">Championship</div>${csColumnHtml(h)}</div>
  </div>`;
}
function bracketHtml(data) {
  const AL = leagueHalfSeries(data.series, 'AL'), NL = leagueHalfSeries(data.series, 'NL');
  const ws = data.series.find(s => s.gameType === 'W') || null;
  return `<div class="bwrap"><div class="bracket">
    ${halfHtml(AL, false)}
    <div class="brk-ws-col"><div class="brk-lab">World Series</div><div class="brk-col-body">${brkMatchHtml(ws)}</div></div>
    ${halfHtml(NL, true)}
  </div></div>
  <p class="small dim" style="margin-top:10px">American League on the left, National League on the right, meeting at the World Series. Tap any matchup to see the full schedule, results and odds.</p>`;
}

async function viewPlayoffs({ mount, alive }) {
  mount.innerHTML = `<div class="hero slim"><div class="tri"><span></span><span></span><span></span></div><h1>MLB Playoffs</h1><p class="lede" style="margin:0">The full postseason bracket — every round, every series, every game, with seeding, records and betting lines. The Phillies are highlighted wherever they appear.</p></div>
    <div id="psBody" style="margin-top:22px">${spinner('Loading the bracket…')}</div>`;
  const data = await safe(API.mlbPostseason(), null); if (!alive()) return;
  if (!data || !data.started) { $('#psBody').innerHTML = errBox('The postseason bracket has not been set yet. Check back once the regular season wraps up and the field is clinched.'); return; }
  await attachPostseasonOdds(data.series); if (!alive()) return;
  $('#psBody').innerHTML = bracketHtml(data);
}
