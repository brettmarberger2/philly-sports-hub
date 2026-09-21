/* League standings, playoff pictures, league leaders and pro-level MLB stats.
   Data: MLB Stats API (standings, sabermetrics, leaders) + ESPN (NFL / NBA standings and leaders). */

const LEAGUES = {
  mlb: { key: 'mlb', name: 'Major League Baseball', short: 'MLB', team: 'phillies', sub: 'American & National League' },
  nfl: { key: 'nfl', name: 'National Football League', short: 'NFL', team: 'eagles', sub: 'AFC & NFC' },
  nba: { key: 'nba', name: 'National Basketball Association', short: 'NBA', team: 'sixers', sub: 'Eastern & Western Conference' },
};
const LEAGUE_KEYS = ['mlb', 'nfl', 'nba'];
const gbFrom = (lead, t) => ((lead.w - t.w) + (t.l - lead.l)) / 2;
const fmtGB = g => (g === 0 || g == null ? '—' : Number.isInteger(g) ? String(g) : g.toFixed(1));
const wl = (t, team) => (team?.recordFmt === 'wlt' && t.t ? `${t.w}-${t.l}-${t.t}` : `${t.w}-${t.l}`);
const nowYear = () => new Date().getFullYear();
const isoDay = d => d.toISOString().slice(0, 10);

/* ---------------- MLB ---------------- */
API.mlbTable = async (year = null) => {
  const y = year ?? nowYear();
  const j = await getJSON(`${MLB_API}/standings?leagueId=103,104&season=${y}&standingsTypes=regularSeason&hydrate=team,division,league`, year && year < nowYear() ? 86400 : 90);
  const teams = [];
  (j.records || []).forEach(r => r.teamRecords.forEach(x => {
    const sp = n => x.records?.splitRecords?.find(s => s.type === n);
    const l10 = sp('lastTen'), home = sp('home'), away = sp('away');
    teams.push({
      id: x.team.id, name: x.team.name, abbr: x.team.abbreviation, logo: `https://www.mlbstatic.com/team-logos/${x.team.id}.svg`,
      divId: r.division.id, divName: r.division.name, lg: r.league.id === 103 ? 'AL' : 'NL',
      w: x.wins, l: x.losses, t: 0, gp: x.gamesPlayed, pct: +x.winningPercentage, divRank: +x.divisionRank, wcRank: x.wildCardRank ? +x.wildCardRank : null,
      clinched: !!x.clinched, elim: x.eliminationNumber, wcElim: x.wildCardEliminationNumber, rs: x.runsScored, ra: x.runsAllowed, diff: x.runDifferential,
      streak: x.streak?.streakCode || '', l10: l10 ? `${l10.wins}-${l10.losses}` : '', home: home ? `${home.wins}-${home.losses}` : '', away: away ? `${away.wins}-${away.losses}` : '',
    });
  }));
  const leagues = {};
  for (const lg of ['AL', 'NL']) {
    const lt = teams.filter(t => t.lg === lg);
    const leaders = lt.filter(t => t.divRank === 1).sort((a, b) => b.pct - a.pct || b.w - a.w);
    const pool = lt.filter(t => t.divRank !== 1).sort((a, b) => (a.wcRank ?? 99) - (b.wcRank ?? 99) || b.pct - a.pct);
    leaders.forEach((t, i) => { t.seed = i + 1; t.status = 'div'; });
    pool.forEach((t, i) => { t.wcPos = i + 1; t.seed = i < 3 ? i + 4 : null; t.status = i < 3 ? 'wc' : 'out'; });
    leagues[lg] = { key: lg, name: lg === 'AL' ? 'American League' : 'National League', teams: lt, leaders, pool, ordered: [...leaders, ...pool], divisions: Object.values(groupBy(lt, t => t.divId)).map(a => a.sort((x, z) => x.divRank - z.divRank)) };
  }
  return { kind: 'mlb', year: y, teams, leagues, G: 162, started: teams.some(t => t.gp > 0) };
};

/* ---------------- NFL ---------------- */
API.nflTable = async (year = null) => {
  const T = TEAMS.eagles, y = year ?? '';
  const j = await getJSON(`${ESPN.siteV2(T)}/standings?level=3${y ? `&season=${y}` : ''}`, year && year < nowYear() ? 86400 : 90);
  const groups = []; const walk = n => { if (n.standings?.entries) groups.push({ name: n.name, entries: n.standings.entries }); (n.children || []).forEach(walk); }; walk(j);
  const teams = [];
  groups.forEach(g => {
    const conf = g.name.startsWith('AFC') ? 'AFC' : 'NFC';
    const rows = g.entries.map(e => {
      const v = n => e.stats.find(s => s.name === n)?.value, d = n => e.stats.find(s => s.name === n)?.displayValue;
      return { id: String(e.team.id), name: e.team.displayName, abbr: e.team.abbreviation, logo: e.team.logos?.[0]?.href || teamLogo(T, e.team.abbreviation), divName: g.name, conf, w: v('wins') ?? 0, l: v('losses') ?? 0, t: v('ties') ?? 0, seedRaw: v('playoffSeed') || 0, pf: v('pointsFor') ?? 0, pa: v('pointsAgainst') ?? 0, diff: v('pointDifferential') ?? 0, streak: d('streak') || '', divRec: d('divisionRecord') || '', confRec: d('vs. Conf.') || '', home: d('Home') || '', away: d('Road') || '' };
    });
    rows.forEach(r => { r.gp = r.w + r.l + r.t; r.pct = pct(r.w, r.l, r.t); });
    const seeded = rows.some(r => r.seedRaw > 0); rows.sort((a, b) => (seeded ? (a.seedRaw || 99) - (b.seedRaw || 99) : 0) || b.pct - a.pct || b.diff - a.diff).forEach((r, i) => (r.divRank = i + 1));
    teams.push(...rows);
  });
  const leagues = {};
  for (const c of ['AFC', 'NFC']) {
    const ct = teams.filter(t => t.conf === c), seeded = ct.some(t => t.seedRaw > 0);
    ct.sort((a, b) => (seeded ? (a.seedRaw || 99) - (b.seedRaw || 99) : 0) || b.pct - a.pct || b.diff - a.diff);
    ct.forEach((t, i) => { t.seed = i + 1; t.status = t.seed <= 4 ? 'div' : t.seed <= 7 ? 'wc' : 'out'; t.confRank = i + 1; });
    leagues[c] = { key: c, name: c === 'AFC' ? 'American Football Conference' : 'National Football Conference', teams: ct, ordered: ct, divisions: Object.values(groupBy(ct, t => t.divName)).map(a => a.sort((x, z) => x.divRank - z.divRank)) };
  }
  return { kind: 'nfl', year: y || nowYear(), teams, leagues, G: 17, started: teams.some(t => t.gp > 0) };
};

/* ---------------- NBA ---------------- */
API.nbaTable = async (startYear = null) => {
  const T = TEAMS.sixers, now = new Date();
  let y = startYear ?? (now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1), fallback = false;
  const load = async yy => { const j = await getJSON(`${ESPN.siteV2(T)}/standings?level=2&season=${yy + 1}`, yy < nowYear() - 1 ? 86400 : 90); const teams = []; (j.children || []).forEach(c => (c.standings?.entries || []).forEach(e => { const v = n => e.stats.find(s => s.name === n)?.value, d = n => e.stats.find(s => s.name === n)?.displayValue; teams.push({ id: String(e.team.id), name: e.team.displayName, abbr: e.team.abbreviation, logo: e.team.logos?.[0]?.href || teamLogo(T, e.team.abbreviation), conf: c.name.startsWith('East') ? 'East' : 'West', w: v('wins') ?? 0, l: v('losses') ?? 0, t: 0, seedRaw: v('playoffSeed') || 0, streak: d('streak') || '', l10: d('Last Ten Games') || d('lastTen') || '', diff: d('pointDifferential') || d('differential') || '', home: d('Home') || '', away: d('Road') || '' }); })); teams.forEach(t => { t.gp = t.w + t.l; t.pct = pct(t.w, t.l); }); return teams; };
  let teams = await load(y);
  if (!teams.some(t => t.gp > 0) && !startYear) { y -= 1; fallback = true; teams = await load(y); }
  const leagues = {};
  for (const c of ['East', 'West']) {
    const ct = teams.filter(t => t.conf === c).sort((a, b) => (a.seedRaw || 99) - (b.seedRaw || 99) || b.pct - a.pct);
    ct.forEach((t, i) => { t.seed = i + 1; t.status = t.seed <= 6 ? 'in' : t.seed <= 10 ? 'playin' : 'out'; });
    leagues[c] = { key: c, name: c === 'East' ? 'Eastern Conference' : 'Western Conference', teams: ct, ordered: ct, divisions: [] };
  }
  return { kind: 'nba', year: y, fallback, teams, leagues, G: 82, started: teams.some(t => t.gp > 0) };
};

API.leagueTable = (leagueKey, year = null) => (leagueKey === 'mlb' ? API.mlbTable(year) : leagueKey === 'nfl' ? API.nflTable(year) : API.nbaTable(year));

/* ---------------- Remaining schedule & strength ---------------- */
API.remaining = async (t, table) => {
  const r = await safe(API.schedule(t), null); if (!r) return null;
  const hasReal = r.games.some(g => g.stype !== 1);
  let games = r.games.filter(g => g.state === 'pre' && (g.stype === 2 || (!hasReal && g.stype === 1)) && g.ts > Date.now() - 4 * 3600e3);
  const info = games.map(g => ({ ...g, oppT: table.teams.find(x => String(x.id) === String(g.opp.id)) }));
  const known = info.filter(g => g.oppT);
  return { games: info, avgOpp: known.length ? sum(known, g => g.oppT.pct) / known.length : null, vsWinning: known.filter(g => g.oppT.pct >= 0.5).length, home: info.filter(g => g.home).length, away: info.filter(g => !g.home).length };
};

/* ---------------- Playoff picture (per Philly team) ---------------- */
const pyth = (rs, ra, exp = 1.83) => (rs ** exp) / (rs ** exp + ra ** exp);

API.picture = async t => {
  const table = await API.leagueTable(t.league);
  const pic = t.league === 'mlb' ? mlbPicture(t, table) : t.league === 'nfl' ? nflPicture(t, table) : nbaPicture(t, table);
  pic.table = table; pic.t = t;
  return pic;
};

function mlbPicture(t, table) {
  const us = table.teams.find(x => x.id === t.mlbId), L = table.leagues[us.lg], G = table.G, left = G - us.gp, bul = [];
  const div = table.teams.filter(x => x.divId === us.divId).sort((a, b) => a.divRank - b.divRank), lead = div[0], second = div[1];
  const wcPool = L.pool, wcLast = wcPool[2], firstOut = wcPool[3];
  const inField = us.status !== 'out', best = us.w + left;
  const cushion = firstOut ? ((us.w - firstOut.w) + (firstOut.l - us.l)) / 2 : 0;
  let tone, headline, sub;
  if (!table.started) { tone = 'idle'; headline = 'Season not started'; sub = ''; }
  else if (us.status === 'div') { tone = 'in'; headline = `IN — ${us.lg} #${us.seed} seed`; sub = `Leads the ${us.divName}${us.seed <= 2 ? ' · first-round bye' : ''}`; }
  else if (us.status === 'wc') { tone = cushion <= 2 ? 'bubble' : 'in'; headline = `IN — ${us.lg} #${us.seed} seed`; sub = `Wild Card ${us.wcPos} · ${fmtGB(cushion)} game${cushion === 1 ? '' : 's'} ahead of the first team out`; }
  else { const gb = wcLast ? gbFrom(wcLast, us) : 0; const alive = best >= (wcLast?.w ?? 0); tone = alive ? 'bubble' : 'out'; headline = alive ? `OUT — ${fmtGB(gb)} back` : 'ELIMINATED'; sub = alive ? `Chasing the last Wild Card spot (${wcLast?.name})` : 'Mathematically out of the playoff field'; }

  // ----- what needs to happen
  if (table.started) {
    bul.push(`<b>Right now:</b> ${wl(us, t)} through ${us.gp} games (${fmtPct(us.pct)}), ${left} to play. ${us.status === 'out' ? `They sit ${ord(L.ordered.indexOf(us) + 1)} in the ${us.lg}.` : `They hold the ${us.lg} #${us.seed} seed.`}`);
    // division
    if (us.divRank === 1) {
      const magic = G + 1 - us.w - second.l;
      bul.push(magic <= 0 ? `<b>Division:</b> clinched the ${us.divName}.` : `<b>Division:</b> leads ${second.name} by ${fmtGB(gbFrom(second, us))}. <b>Magic number: ${magic}</b>. Any mix of ${us.abbr} wins and ${second.abbr} losses totaling ${magic} wins the division.`);
    } else {
      const gap = gbFrom(lead, us), d = lead.w - us.w;
      if (best < lead.w) bul.push(`<b>Division:</b> out of the ${us.divName} race (${fmtGB(gap)} behind ${lead.name}).`);
      else if (best === lead.w) bul.push(`<b>Division:</b> ${fmtGB(gap)} behind ${lead.name}. Only a tie is still possible: ${us.abbr} would need to win all ${left} while ${lead.abbr} loses out, and a tiebreaker would decide it.`);
      else bul.push(`<b>Division:</b> ${fmtGB(gap)} behind ${lead.name} (${lead.w}-${lead.l}). To finish first, ${us.abbr} needs to win at least ${d + 1} of its last ${left} even if ${lead.abbr} loses out, and more if ${lead.abbr} wins any.`);
    }
    // wild card / berth
    if (us.status === 'wc' || (us.status === 'div' && us.divRank === 1 && firstOut)) {
      const magicBerth = firstOut ? G + 1 - us.w - firstOut.l : 0;
      bul.push(magicBerth <= 0 ? `<b>Playoffs:</b> a postseason berth is clinched.` : `<b>Playoffs:</b> ${us.status === 'wc' ? `${fmtGB(cushion)} game${cushion === 1 ? '' : 's'} clear of ${firstOut.name} (${firstOut.w}-${firstOut.l}), the first team out.` : `safe from the Wild Card chase for now.`} <b>Magic number to clinch a berth: ${magicBerth}</b> (combined ${us.abbr} wins + ${firstOut.abbr} losses).`);
    } else if (us.status === 'out') {
      bul.push(best >= (wcLast?.w ?? 0) ? `<b>Playoffs:</b> ${fmtGB(gbFrom(wcLast, us))} behind ${wcLast.name} (${wcLast.w}-${wcLast.l}) for the final Wild Card spot with ${left} left. They need to win at least ${Math.max(0, wcLast.w - us.w + 1)} of ${left} even if ${wcLast.abbr} loses out. ${wcPool.filter(x => x !== us && x.w > us.w && x.wcPos < us.wcPos).length ? `They'd also have to pass ${wcPool.filter(x => x !== us && x.wcPos < us.wcPos && x.wcPos > 3).map(x => x.name).join(', ') || 'the teams ahead'}.` : ''}` : `<b>Playoffs:</b> can no longer catch ${wcLast.name}, since even winning out (${best} wins) falls short of ${wcLast.w} wins.`);
    }
    // bracket
    if (inField) bul.push(us.seed <= 2 ? `<b>If it ended today:</b> a first-round bye, then the Division Series against the winner of #${us.seed === 1 ? '4 vs #5' : '3 vs #6'}.` : `<b>If it ended today:</b> ${us.seed >= 3 ? `they'd play the #${9 - us.seed} seed (${L.ordered.find(x => x.seed === 9 - us.seed)?.name}) in the best-of-3 Wild Card Series${us.seed === 3 || us.seed === 4 ? ' at home' : ' on the road'}.` : ''}`);
    // form
    const exp = pyth(us.rs, us.ra), diffW = us.w - Math.round(exp * us.gp);
    bul.push(`<b>Form:</b> ${us.l10} in the last 10 (${us.streak || '—'}). Run differential ${us.diff > 0 ? '+' : ''}${us.diff}, which points to about a ${Math.round(exp * us.gp)}-${us.gp - Math.round(exp * us.gp)} team${Math.abs(diffW) >= 3 ? `, so the record is ${diffW > 0 ? 'a little better' : 'a little worse'} than the underlying numbers` : ', in line with the record'}.`);
  }
  // scopes
  const ord = L.ordered.map(x => ({ ...x }));
  const scopes = [
    { key: 'div', label: 'Division', rows: div, gb: r => gbFrom(lead, r) },
    { key: 'lg', label: `${us.lg} playoff picture`, rows: L.ordered, cutAfter: 6, showSeed: true, gb: r => (r.status === 'wc' || r.status === 'out' ? -((r.w - wcLast.w) + (wcLast.l - r.l)) / 2 : 0), gbLabel: 'GB of last WC' },
    { key: 'wc', label: 'Wild Card race', rows: wcPool, cutAfter: 3, gb: r => -((r.w - wcLast.w) + (wcLast.l - r.l)) / 2, gbLabel: 'vs last WC' },
    { key: 'all', label: 'All MLB', rows: [...table.teams].sort((a, b) => b.pct - a.pct || b.w - a.w), gb: (r, rows) => gbFrom(rows[0], r) },
  ];
  const ranked = [...table.teams].sort((a, b) => b.pct - a.pct || b.w - a.w), rsR = [...table.teams].sort((a, b) => b.rs - a.rs), raR = [...table.teams].sort((a, b) => a.ra - b.ra);
  const tiles = [
    { v: `#${ranked.indexOf(us) + 1}`, l: 'of 30 in MLB' }, { v: `#${L.ordered.indexOf(us) + 1}`, l: `in the ${us.lg}` }, { v: ord2(us.divRank), l: us.divName.replace(/^(American|National) League /, '') },
    { v: `${us.diff > 0 ? '+' : ''}${us.diff}`, l: 'run differential' }, { v: `#${rsR.indexOf(us) + 1} / #${raR.indexOf(us) + 1}`, l: 'runs scored / allowed rank' }, { v: left, l: 'games left' },
  ];
  return { kind: 'mlb', us, tone, headline, sub, bullets: bul, scopes, tiles, left, G, inField, seed: us.seed, statusShort: us.status === 'div' ? `${us.lg} #${us.seed} · division leader` : us.status === 'wc' ? `${us.lg} #${us.seed} · Wild Card` : 'Outside the field' };
}
const ord2 = n => (n ? ord(n) : '—');

function nflPicture(t, table) {
  const us = table.teams.find(x => x.id === String(t.espnId)), L = table.leagues[us.conf], G = table.G, left = G - us.gp, bul = [];
  const div = table.teams.filter(x => x.divName === us.divName).sort((a, b) => a.divRank - b.divRank), lead = div[0], seven = L.ordered[6], eight = L.ordered[7];
  const early = us.gp <= 6;
  const cushion = eight ? ((us.w - eight.w) + (eight.l - us.l)) / 2 : 0;
  let tone = 'idle', headline = 'Season not started', sub = '';
  if (table.started) {
    if (us.seed <= 4) { tone = 'in'; headline = `IN — ${us.conf} #${us.seed} seed`; sub = `${us.divName} leader${us.seed === 1 ? ' · only team with a first-round bye' : ''}`; }
    else if (us.seed <= 7) { tone = 'in'; headline = `IN — ${us.conf} #${us.seed} seed`; sub = `Wild card${us.seed === 7 ? ' · last spot' : ''}`; }
    else { tone = 'out'; headline = `OUT — ${us.conf} #${us.seed}`; sub = `${fmtGB(gbFrom(seven, us))} game(s) behind the #7 seed`; }
    if (tone === 'in' && early) tone = 'in';
    bul.push(`<b>Right now:</b> ${wl(us, t)} (${fmtPct(us.pct)}) after ${us.gp} game${us.gp === 1 ? '' : 's'}, ${left} to play. ${early ? 'It is early, so the seeds will shuffle every week.' : ''}`);
    if (us.divRank === 1) bul.push(`<b>Division:</b> leads the ${us.divName}${div[1] ? ` (next: ${div[1].name} ${wl(div[1], t)})` : ''}. Division winners take seeds 1–4 and host a playoff game.`);
    else bul.push(`<b>Division:</b> ${fmtGB(gbFrom(lead, us))} game(s) behind ${lead.name} (${wl(lead, t)}) in the ${us.divName}. Winning the division guarantees a top-4 seed; a wild card can still get in.`);
    if (us.seed <= 7) bul.push(`<b>Cushion:</b> ${fmtGB(Math.max(0, cushion))} game(s) ahead of the first team out (${eight?.name}). ${us.seed >= 5 ? 'Seeds 5–7 play on the road in the wild-card round.' : ''}`);
    else bul.push(`<b>Gap:</b> ${fmtGB(gbFrom(seven, us))} game(s) behind ${seven.name}, the #7 seed. Teams around them: ${L.ordered.slice(4, 9).map(x => `${x.abbr} ${wl(x, t)}`).join(', ')}.`);
    const need = Math.max(0, 10 - us.w);
    bul.push(`<b>Benchmark:</b> 10 wins is a common playoff mark (9 sometimes gets in, 11+ almost always does). ${us.w >= 10 ? `${us.abbr} is already there.` : `${us.abbr} needs ${need} more win${need === 1 ? '' : 's'} in its last ${left} (${need}-${left - need} or better).`} Current pace: about ${Math.round(us.pct * G)} wins.`);
    if (us.seed <= 7) bul.push(`<b>If it ended today:</b> they'd ${us.seed === 1 ? 'get a bye' : `play the #${9 - us.seed} seed (${L.ordered.find(x => x.seed === 9 - us.seed)?.name}) ${us.seed <= 4 ? 'at home' : 'on the road'} in the wild-card round`}.`);
    bul.push(`<b>Scoring:</b> ${us.pf} points for, ${us.pa} against (${us.diff > 0 ? '+' : ''}${us.diff}); ${us.streak || 'no streak yet'}.`);
  }
  const scopes = [
    { key: 'div', label: 'Division', rows: div, gb: r => gbFrom(lead, r) },
    { key: 'lg', label: `${us.conf} playoff picture`, rows: L.ordered, cutAfter: 7, showSeed: true, gb: (r, rows) => gbFrom(rows[0], r) },
    { key: 'all', label: 'All NFL', rows: [...table.teams].sort((a, b) => b.pct - a.pct || b.diff - a.diff), gb: (r, rows) => gbFrom(rows[0], r) },
  ];
  const ranked = [...table.teams].sort((a, b) => b.pct - a.pct || b.diff - a.diff), pfR = [...table.teams].sort((a, b) => b.pf - a.pf), paR = [...table.teams].sort((a, b) => a.pa - b.pa);
  const tiles = [{ v: `#${ranked.indexOf(us) + 1}`, l: 'of 32 in the NFL' }, { v: `#${us.confRank}`, l: `in the ${us.conf}` }, { v: ord2(us.divRank), l: us.divName }, { v: `${us.diff > 0 ? '+' : ''}${us.diff}`, l: 'point differential' }, { v: `#${pfR.indexOf(us) + 1} / #${paR.indexOf(us) + 1}`, l: 'points for / against rank' }, { v: left, l: 'games left' }];
  return { kind: 'nfl', us, tone, headline, sub, bullets: bul, scopes, tiles, left, G, inField: us.seed <= 7, seed: us.seed, statusShort: us.seed <= 4 ? `${us.conf} #${us.seed} · division leader` : us.seed <= 7 ? `${us.conf} #${us.seed} · wild card` : 'Outside the field' };
}

function nbaPicture(t, table) {
  const us = table.teams.find(x => x.id === String(t.espnId)), L = table.leagues[us.conf], G = table.G, left = G - us.gp, bul = [];
  const six = L.ordered[5], ten = L.ordered[9], label = `${table.year}–${String(table.year + 1).slice(2)}`;
  const fin = table.fallback || left === 0;
  let tone, headline, sub;
  const seasonRec = H.find('sixers', table.year);
  if (us.status === 'in') { tone = 'in'; headline = `${fin ? 'FINISHED' : 'IN —'} ${us.conf} #${us.seed}`; sub = 'Direct playoff berth'; }
  else if (us.status === 'playin') { tone = 'bubble'; headline = `${fin ? 'FINISHED' : 'PLAY-IN —'} ${us.conf} #${us.seed}`; sub = 'In the play-in tournament (seeds 7–10)'; }
  else { tone = 'out'; headline = `${fin ? 'FINISHED' : 'OUT —'} ${us.conf} #${us.seed}`; sub = 'Outside the play-in'; }
  bul.push(fin ? `<b>${label} final standings:</b> ${wl(us, t)}, ${ord(us.seed)} in the ${us.conf}${seasonRec ? ` · ${H.outcome(seasonRec)}` : ''}. The ${table.year + 1}–${String(table.year + 2).slice(2)} season has not started, so the table below shows last season's final order.` : `<b>Right now:</b> ${wl(us, t)} (${fmtPct(us.pct)}), ${ord(us.seed)} in the ${us.conf} with ${left} games left.`);
  if (!fin) {
    bul.push(us.seed <= 6 ? `<b>Playoffs:</b> in a direct berth as the #${us.seed} seed, ${fmtGB(Math.max(0, gbFrom(six, us) * -1 + 0))} game(s) ${us.seed === 6 ? 'clear of' : 'ahead of'} the play-in line (#7 ${L.ordered[6]?.abbr}).` : us.seed <= 10 ? `<b>Play-in:</b> ${fmtGB(gbFrom(six, us))} game(s) behind #6 ${six.abbr} for an automatic spot; ${us.seed <= 8 ? 'top two play-in seeds get two chances to win the 7 or 8 seed' : 'seeds 9–10 must win two elimination games'}.` : `<b>Gap:</b> ${fmtGB(gbFrom(ten, us))} game(s) behind #10 ${ten.abbr}, the last play-in spot, with ${left} left.`);
    bul.push(`<b>Play-in format:</b> seeds 7 vs 8 (winner is the #7 seed), 9 vs 10 (loser is out), then the 7-8 loser plays the 9-10 winner for the #8 seed.`);
  } else {
    bul.push(`<b>Play-in line:</b> seeds 1–6 clinch directly, seeds 7–10 play the play-in. ${us.abbr} ${us.seed <= 6 ? 'earned a direct berth' : us.seed <= 10 ? 'was in the play-in' : 'missed both'}.`);
  }
  const scopes = [
    { key: 'lg', label: us.conf === 'East' ? 'Eastern Conference' : 'Western Conference', rows: L.ordered, cutAfter: 6, cutAfter2: 10, showSeed: true, gb: (r, rows) => gbFrom(rows[0], r) },
    { key: 'all', label: 'All NBA', rows: [...table.teams].sort((a, b) => b.pct - a.pct), gb: (r, rows) => gbFrom(rows[0], r) },
  ];
  const ranked = [...table.teams].sort((a, b) => b.pct - a.pct);
  const tiles = [{ v: `#${ranked.indexOf(us) + 1}`, l: 'of 30 in the NBA' }, { v: `#${us.seed}`, l: `in the ${us.conf}` }, { v: wl(us, t), l: `${label} record` }, { v: us.home || '—', l: 'home' }, { v: us.away || '—', l: 'road' }, { v: fin ? 'Final' : left, l: fin ? 'season complete' : 'games left' }];
  return { kind: 'nba', us, tone, headline, sub, bullets: bul, scopes, tiles, left, G, fin, inField: us.seed <= 10, seed: us.seed, statusShort: `${us.conf} #${us.seed}${fin ? ' (final)' : ''}` };
}

/* ---------------- League leaders (league-wide top 10s) ---------------- */
const ESPN_W = 'https://site.web.api.espn.com/apis/common/v3/sports';
async function espnLeaderList(sport, league, spec, season, qualified) {
  const T = Object.values(TEAMS).find(x => x.league === league);
  const j = await safe(getJSON(`${ESPN_W}/${sport}/${league}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=${qualified}&limit=10&season=${season}&seasontype=2${spec.cat ? `&category=${encodeURIComponent(spec.cat)}` : ''}&sort=${encodeURIComponent(spec.sort)}`, 600), null);
  if (!j?.athletes) return null;
  const val = (a, c, n) => { const cat = j.categories.find(x => x.name === c), idx = cat?.names.indexOf(n); const ac = a.categories.find(x => x.name === c); return idx >= 0 && ac ? ac.totals[idx] : ''; };
  return { label: spec.label, main: spec.mainLabel, cols: spec.extra.map(e => e[2]), rows: j.athletes.map((a, i) => ({ rank: i + 1, id: a.athlete.id, name: a.athlete.displayName, abbr: a.athlete.teamShortName, logo: teamLogo(T, a.athlete.teamShortName || 'phi'), value: val(a, spec.c, spec.main), extra: spec.extra.map(e => val(a, e[0], e[1])), philly: a.athlete.teamShortName === 'PHI', head: a.athlete.headshot?.href })) };
}
API.leagueLeaders = async (leagueKey, year = null) => {
  if (leagueKey === 'mlb') {
    const y = year ?? nowYear();
    const mk = async (group, cats) => { const j = await safe(getJSON(`${MLB_API}/stats/leaders?leaderCategories=${cats.map(c => c[0]).join(',')}&season=${y}&sportId=1&limit=10&statGroup=${group}`, 600), null); return cats.map(([k, label]) => { const c = j?.leagueLeaders?.find(x => x.leaderCategory === k); return c ? { label, rows: c.leaders.map(l => ({ rank: l.rank, name: l.person.fullName, mlbId: l.person.id, abbr: l.team?.name?.split(' ').pop(), logo: `https://www.mlbstatic.com/team-logos/${l.team.id}.svg`, value: l.value, philly: l.team.id === 143, extra: [], head: `https://img.mlbstatic.com/mlb-photos/image/upload/w_80,q_auto:best/v1/people/${l.person.id}/headshot/67/current` })), cols: [] } : null; }).filter(Boolean); };
    const [bat, pit] = await Promise.all([mk('hitting', [['battingAverage', 'Batting average'], ['homeRuns', 'Home runs'], ['runsBattedIn', 'RBI'], ['onBasePlusSlugging', 'OPS'], ['stolenBases', 'Stolen bases'], ['hits', 'Hits']]), mk('pitching', [['earnedRunAverage', 'ERA'], ['wins', 'Wins'], ['strikeouts', 'Strikeouts'], ['saves', 'Saves'], ['walksAndHitsPerInningPitched', 'WHIP'], ['inningsPitched', 'Innings pitched']])]);
    return [{ title: 'Batting leaders', lists: bat }, { title: 'Pitching leaders', lists: pit }];
  }
  if (leagueKey === 'nfl') {
    const s = year ?? nowYear(), R = (label, cat, sort, c, main, extra, mainLabel) => ({ label, cat, sort, c, main, extra, mainLabel });
    const specs = [
      R('Passing yards', 'offense:passing', 'passing:passingYards:desc', 'passing', 'passingYards', [['passing', 'passingTouchdowns', 'TD'], ['passing', 'interceptions', 'INT'], ['passing', 'QBRating', 'RTG']], 'YDS'),
      R('Rushing yards', 'offense:rushing', 'rushing:rushingYards:desc', 'rushing', 'rushingYards', [['rushing', 'rushingAttempts', 'CAR'], ['rushing', 'yardsPerRushAttempt', 'YPC'], ['rushing', 'rushingTouchdowns', 'TD']], 'YDS'),
      R('Receiving yards', 'offense:receiving', 'receiving:receivingYards:desc', 'receiving', 'receivingYards', [['receiving', 'receptions', 'REC'], ['receiving', 'receivingTargets', 'TGT'], ['receiving', 'receivingTouchdowns', 'TD']], 'YDS'),
      R('Sacks', 'defense', 'defensive:sacks:desc', 'defensive', 'sacks', [['defensive', 'totalTackles', 'TKL'], ['defensive', 'tacklesForLoss', 'TFL']], 'SACKS'),
      R('Interceptions', 'defense', 'defensiveInterceptions:interceptions:desc', 'defensiveinterceptions', 'interceptions', [['defensiveinterceptions', 'interceptionYards', 'YDS'], ['defensiveinterceptions', 'interceptionTouchdowns', 'TD']], 'INT'),
      R('Tackles', 'defense', 'defensive:totalTackles:desc', 'defensive', 'totalTackles', [['defensive', 'soloTackles', 'SOLO'], ['defensive', 'sacks', 'SACK']], 'TKL'),
    ];
    const lists = (await Promise.all(specs.map(sp => espnLeaderList('football', 'nfl', sp, s, false)))).filter(Boolean);
    return [{ title: `${s} season leaders`, lists }];
  }
  const s = year ?? (new Date().getMonth() >= 8 ? nowYear() : nowYear() - 1) + 1;
  const R = (label, sort, c, main, extra, mainLabel) => ({ label, sort, c, main, extra, mainLabel });
  const specs = [
    R('Points per game', 'offensive.avgPoints:desc', 'offensive', 'avgPoints', [['general', 'gamesPlayed', 'GP'], ['offensive', 'fieldGoalPct', 'FG%'], ['offensive', 'threePointFieldGoalPct', '3P%']], 'PPG'),
    R('Rebounds per game', 'general.avgRebounds:desc', 'general', 'avgRebounds', [['general', 'gamesPlayed', 'GP'], ['offensive', 'avgPoints', 'PPG']], 'RPG'),
    R('Assists per game', 'offensive.avgAssists:desc', 'offensive', 'avgAssists', [['general', 'gamesPlayed', 'GP'], ['offensive', 'avgPoints', 'PPG'], ['offensive', 'avgTurnovers', 'TO']], 'APG'),
    R('Steals per game', 'defensive.avgSteals:desc', 'defensive', 'avgSteals', [['general', 'gamesPlayed', 'GP']], 'SPG'),
    R('Blocks per game', 'defensive.avgBlocks:desc', 'defensive', 'avgBlocks', [['general', 'gamesPlayed', 'GP']], 'BPG'),
    R('3-pointers made per game', 'offensive.avgThreePointFieldGoalsMade:desc', 'offensive', 'avgThreePointFieldGoalsMade', [['general', 'gamesPlayed', 'GP'], ['offensive', 'threePointFieldGoalPct', '3P%']], '3PM'),
  ];
  const lists = (await Promise.all(specs.map(sp => espnLeaderList('basketball', 'nba', sp, s, true)))).filter(Boolean);
  return [{ title: `${s - 1}–${String(s).slice(2)} season leaders`, lists }];
};

/* ---------------- League news + scores ---------------- */
API.leagueNews = async leagueKey => {
  const T = TEAMS[LEAGUES[leagueKey].team];
  const j = await safe(getJSON(`${ESPN.site(T)}/news?limit=12`, 300), null);
  return (j?.articles || []).map(a => ({ title: a.headline, desc: a.description, date: a.published, img: a.images?.[0]?.url, link: a.links?.web?.href || '#' }));
};
API.leagueScores = async leagueKey => {
  const T = TEAMS[LEAGUES[leagueKey].team], out = [];
  const days = leagueKey === 'mlb' ? [1, 0] : [0];
  for (const back of days) {
    const d = new Date(Date.now() - back * 864e5), ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const j = await safe(getJSON(`${ESPN.site(T)}/scoreboard${leagueKey === 'nfl' && back === 0 ? '' : `?dates=${ds}`}`, 90), null);
    (j?.events || []).forEach(ev => { const c = ev.competitions?.[0]; if (!c) return; const home = c.competitors.find(x => x.homeAway === 'home'), away = c.competitors.find(x => x.homeAway === 'away'); out.push({ id: ev.id, ts: new Date(ev.date).getTime(), state: c.status?.type?.state, detail: c.status?.type?.shortDetail, home: { abbr: home.team.abbreviation, logo: home.team.logos?.[0]?.href, score: home.score, win: home.winner }, away: { abbr: away.team.abbreviation, logo: away.team.logos?.[0]?.href, score: away.score, win: away.winner }, philly: [home, away].some(x => x.team.abbreviation === 'PHI'), link: ev.links?.[0]?.href }); });
  }
  const seen = new Set(); return out.filter(g => (seen.has(g.id) ? false : seen.add(g.id))).sort((a, b) => b.ts - a.ts);
};

/* ---------------- Pro-level MLB stats ---------------- */
API.mlbPro = async (t, year = null) => {
  const y = year ?? nowYear(), cur = y === nowYear(), ttl = cur ? 600 : 86400;
  const end = new Date(), s14 = new Date(Date.now() - 14 * 864e5), s30 = new Date(Date.now() - 30 * 864e5);
  const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  const get = (stats, g, extra = '') => safe(getJSON(`${MLB_API}/stats?stats=${stats}&group=${g}&teamId=${t.mlbId}&season=${y}&playerPool=all&limit=120&sportId=1${extra}`, ttl), null);
  const [h, hs, hr, p, ps, pr] = await Promise.all([get('season', 'hitting'), get('sabermetrics', 'hitting'), cur ? get('byDateRange', 'hitting', `&startDate=${fmt(s14)}&endDate=${fmt(end)}`) : null, get('season', 'pitching'), get('sabermetrics', 'pitching'), cur ? get('byDateRange', 'pitching', `&startDate=${fmt(s30)}&endDate=${fmt(end)}`) : null]);
  const idx = j => new Map((j?.stats?.[0]?.splits || []).map(s => [s.player.id, s]));
  const hsM = idx(hs), hrM = idx(hr), psM = idx(ps), prM = idx(pr);
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const teamGP = Math.max(...((h?.stats?.[0]?.splits || []).map(s => s.stat.gamesPlayed || 0)), 1);
  const hitters = (h?.stats?.[0]?.splits || []).filter(s => (s.stat.plateAppearances || 0) >= 1 && s.position?.abbreviation !== 'P').map(s => {
    const st = s.stat, sb = hsM.get(s.player.id)?.stat || {}, rc = hrM.get(s.player.id)?.stat, pa = st.plateAppearances || 0;
    return { id: s.player.id, name: s.player.fullName, pos: s.position?.abbreviation || '', g: st.gamesPlayed, pa, avg: st.avg, obp: st.obp, slg: st.slg, ops: st.ops, hr: st.homeRuns, rbi: st.rbi, r: st.runs, sb: st.stolenBases, bbp: pa ? (st.baseOnBalls / pa) * 100 : null, kp: pa ? (st.strikeOuts / pa) * 100 : null, wrc: sb.wRcPlus != null ? Math.round(sb.wRcPlus) : null, war: sb.war != null ? +sb.war.toFixed(1) : null, l14: rc && (rc.plateAppearances || 0) >= 20 ? rc.ops : null, l14pa: rc?.plateAppearances || 0, qual: pa >= 3.1 * teamGP };
  });
  const pitchers = (p?.stats?.[0]?.splits || []).map(s => {
    const st = s.stat, sb = psM.get(s.player.id)?.stat || {}, rc = prM.get(s.player.id)?.stat, ip = num(st.inningsPitched) || 0;
    const gs = st.gamesStarted || 0, g = st.gamesPlayed || 0;
    return { id: s.player.id, name: s.player.fullName, role: gs >= g / 2 && gs > 0 ? 'SP' : 'RP', g, gs, ip, ipS: st.inningsPitched, w: st.wins, l: st.losses, sv: st.saves, hld: st.holds, era: st.era, whip: st.whip, k: st.strikeOuts, bb: st.baseOnBalls, k9: num(st.strikeoutsPer9Inn), bb9: num(st.walksPer9Inn), hr9: num(st.homeRunsPer9), fip: sb.fip != null ? +sb.fip.toFixed(2) : null, eraM: sb.eraMinus != null ? Math.round(sb.eraMinus) : null, war: sb.war != null ? +sb.war.toFixed(1) : null, l30: rc && (num(rc.inningsPitched) || 0) >= 4 ? rc.era : null };
  }).filter(x => x.ip >= 1);
  return { year: y, cur, teamGP, hitters, pitchers };
};
const gradeBat = w => (w == null ? ['', ''] : w >= 140 ? ['elite', 'Elite'] : w >= 115 ? ['good', 'Good'] : w >= 90 ? ['avg', 'Average'] : w >= 70 ? ['poor', 'Below avg'] : ['bad', 'Struggling']);
const gradePit = e => (e == null ? ['', ''] : e <= 70 ? ['elite', 'Elite'] : e <= 90 ? ['good', 'Good'] : e <= 110 ? ['avg', 'Average'] : e <= 130 ? ['poor', 'Below avg'] : ['bad', 'Struggling']);
