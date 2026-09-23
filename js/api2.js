/* Data layer, part 2: recent games, player stats, season rosters, season highlights */
Object.assign(API, {
  /** Last `n` finished games (falls back to last season's if the new season just started) + live + next. */
  async recentGames(t, n = 2) {
    const r = await API.schedule(t);
    const hasReal = r.games.some(g => g.stype !== 1);
    const done = r.games.filter(g => g.state === 'post' && (g.stype !== 1 || !hasReal));
    let list = done.slice(-n);
    if (list.length < n) {
      const startYear = t.league === 'nba' ? r.season - 1 : r.season;
      const prev = await safe(API.schedule(t, startYear - 1), null);
      if (prev) list = [...prev.games.filter(g => g.state === 'post').slice(-(n - list.length)), ...list];
    }
    const live = r.games.find(g => g.state === 'in') || (await API.scoreboardGame(t).then(g => (g && g.state === 'in' ? g : null)));
    const next = r.games.find(g => g.state === 'pre' && g.stype !== 1 && g.ts > Date.now() - 3 * 3600e3) || null;
    return { live, list, next };
  },

  /** Per-player stat tables for a team-season (year=null → current). */
  async teamPlayerStats(t, year = null) {
    const past = year != null && year < new Date().getFullYear();
    const ttl = past ? 86400 : 300;
    if (t.mlbId) {
      const y = year ?? new Date().getFullYear();
      const get = g => safe(getJSON(`${MLB_API}/stats?stats=season&group=${g}&teamId=${t.mlbId}&season=${y}&playerPool=all&limit=80&sportId=1`, ttl), null);
      const [h, p] = await Promise.all([get('hitting'), get('pitching')]);
      const rows = (j, spec) => (j?.stats?.[0]?.splits || []).map(s => ({ mlbId: s.player.id, name: s.player.fullName, pos: s.position?.abbreviation || '', v: Object.fromEntries(spec.map(([k, f]) => [k, s.stat?.[f] ?? ''])) }));
      const hs = [['G', 'gamesPlayed'], ['AB', 'atBats'], ['R', 'runs'], ['H', 'hits'], ['HR', 'homeRuns'], ['RBI', 'rbi'], ['SB', 'stolenBases'], ['AVG', 'avg'], ['OBP', 'obp'], ['OPS', 'ops']];
      const ps = [['G', 'gamesPlayed'], ['GS', 'gamesStarted'], ['W', 'wins'], ['L', 'losses'], ['SV', 'saves'], ['IP', 'inningsPitched'], ['K', 'strikeOuts'], ['ERA', 'era'], ['WHIP', 'whip']];
      return { tables: [
        { key: 'hitting', name: 'Batting', cols: hs.map(([k]) => k), rows: rows(h, hs), sortKey: 'HR' },
        { key: 'pitching', name: 'Pitching', cols: ps.map(([k]) => k), rows: rows(p, ps), sortKey: 'IP' },
      ].filter(x => x.rows.length) };
    }
    if (t.league === 'nba') {
      // ESPN ignores a team filter on player stats and tags players with their CURRENT team, so identify who actually
      // played for this team that season from the team's own season leaders, then pull those players' full lines.
      const season = espnSeason(t, year ?? new Date().getFullYear() - (new Date().getMonth() < 8 ? 1 : 0));
      const lj = await safe(getJSON(`${ESPN.core(t)}/seasons/${season}/types/2/teams/${t.espnId}/leaders`, ttl), null);
      const ids = new Set(); (lj?.categories || []).forEach(c => (c.leaders || []).forEach(l => { const m = (l.athlete?.$ref || '').match(/athletes\/(\d+)/); if (m) ids.add(m[1]); }));
      const pageUrl = p => `${ESPN.common(t)}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=500&page=${p}&season=${season}&seasontype=2&sort=offensive.avgPoints%3Adesc`;
      const pages = ids.size ? await Promise.all([1, 2].map(p => safe(getJSON(pageUrl(p), ttl), null))) : [];
      const j = { athletes: pages.flatMap(p => p?.athletes || []).filter(a => ids.has(String(a.athlete.id))) };
      const spec = [['GP', 'general', 0], ['MIN', 'general', 1], ['PTS', 'offensive', 0], ['REB', 'general', 11], ['AST', 'offensive', 10], ['STL', 'defensive', 0], ['BLK', 'defensive', 1], ['FG%', 'offensive', 3], ['3P%', 'offensive', 6], ['FT%', 'offensive', 9]];
      const rows = (j?.athletes || []).map(a => {
        const cat = n => a.categories?.find(c => c.name === n)?.totals || [];
        return { id: a.athlete.id, name: a.athlete.displayName, pos: a.athlete.position?.abbreviation || '', v: Object.fromEntries(spec.map(([k, c, i]) => [k, cat(c)[i] ?? ''])) };
      }).filter(r => r.v.GP && r.v.GP !== '-');
      return { ids, tables: rows.length ? [{ key: 'pergame', name: 'Per game', cols: spec.map(s => s[0]), rows, sortKey: 'PTS' }] : [] };
    }
    // NFL: ranked lists from the season leaders feed (works for past seasons too)
    const season = espnSeason(t, year ?? new Date().getFullYear());
    const j = await safe(getJSON(`${ESPN.core(t)}/seasons/${season}/types/2/teams/${t.espnId}/leaders`, ttl), null);
    const want = [['passingLeader', 'Passing'], ['rushingLeader', 'Rushing'], ['receivingLeader', 'Receiving'], ['totalTackles', 'Tackles'], ['sacks', 'Sacks'], ['interceptions', 'Interceptions'], ['receptions', 'Receptions']];
    const cats = want.map(([n, label]) => ({ label, c: j?.categories?.find(c => c.name === n) })).filter(x => x.c?.leaders?.length);
    const refs = uniq(cats.flatMap(x => x.c.leaders.map(l => l.athlete?.$ref)).filter(Boolean));
    const names = {};
    await pool(refs, 10, async ref => { const a = await safe(getJSON(httpsify(ref), 86400), null); names[ref] = { name: a?.displayName || a?.fullName || '', pos: a?.position?.abbreviation || '', id: a?.id }; });
    return { ids: new Set(Object.values(names).map(n => String(n.id))), tables: cats.map(({ label, c }) => ({
      key: label.toLowerCase(), name: label, cols: ['Stat line'], sortKey: null,
      rows: c.leaders.slice(0, 12).map(l => { const m = names[l.athlete?.$ref] || {}; return { id: m.id, name: m.name, pos: m.pos, v: { 'Stat line': l.displayValue } }; }).filter(r => r.name),
    })).filter(x => x.rows.length) };
  },

  /** MLB only: the full roster for a past season (ESPN's historical NFL/NBA rosters return today's players, so they aren't used). */
  async seasonRoster(t, year) {
    return t.mlbId ? API.mlbRosterForYear(t, year) : [];
  },
});

/** Notable moments derived from a season's game log. */
function seasonHighlights(t, games) {
  const unit = t.mlbId ? 'runs' : 'points';
  const played = games.filter(g => g.state === 'post' && g.ourScore != null && g.stype !== 3).sort((a, b) => a.ts - b.ts);
  if (played.length < 4) return [];
  const out = [], desc = g => `${g.result} ${g.ourScore}–${g.oppScore} ${g.home ? 'vs' : '@'} ${g.opp.name} (${fmtDate(g.date, { month: 'short', day: 'numeric' })})`;
  const wins = played.filter(g => g.result === 'W'), losses = played.filter(g => g.result === 'L');
  if (wins.length) { const b = [...wins].sort((a, b) => (b.ourScore - b.oppScore) - (a.ourScore - a.oppScore))[0]; out.push(['Biggest win', `${desc(b)} — by ${b.ourScore - b.oppScore} ${unit}`]); }
  if (losses.length) { const b = [...losses].sort((a, b) => (a.ourScore - a.oppScore) - (b.ourScore - b.oppScore))[0]; out.push(['Toughest loss', `${desc(b)} — by ${b.oppScore - b.ourScore} ${unit}`]); }
  const streak = res => { let best = { n: 0, s: 0 }, cur = 0, start = 0; played.forEach((g, i) => { if (g.result === res) { if (!cur) start = i; cur++; if (cur > best.n) best = { n: cur, s: start }; } else cur = 0; }); return best; };
  const w = streak('W'), l = streak('L');
  if (w.n >= 3) out.push(['Longest winning streak', `${w.n} straight, ${fmtDate(played[w.s].date, { month: 'short', day: 'numeric' })} – ${fmtDate(played[w.s + w.n - 1].date, { month: 'short', day: 'numeric' })}`]);
  if (l.n >= 3) out.push(['Longest losing streak', `${l.n} straight, ${fmtDate(played[l.s].date, { month: 'short', day: 'numeric' })} – ${fmtDate(played[l.s + l.n - 1].date, { month: 'short', day: 'numeric' })}`]);
  out.push(['Season opener', desc(played[0])]);
  return out;
}

/** Season stat line for every player on a team, keyed for the depth chart: ESPN id (NFL/NBA) or normalized name (MLB). */
API.depthLines = async t => {
  const lines = new Map(), byName = new Map();
  if (t.league === 'nfl') {
    const W = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&seasontype=2&limit=1000';
    const cats = [['offense:passing', 'passing:passingYards:desc'], ['offense:rushing', 'rushing:rushingYards:desc'], ['offense:receiving', 'receiving:receivingYards:desc'], ['defense', 'defensive:totalTackles:desc'], ['specialTeams:kicking', 'kicking:fieldGoalsMade:desc']];
    const res = await Promise.all(cats.map(([c, s]) => safe(getJSON(`${W}&season=${new Date().getFullYear()}&category=${encodeURIComponent(c)}&sort=${encodeURIComponent(s)}`, 900), null)));
    res.forEach(j => (j?.athletes || []).filter(a => String(a.athlete.teamId) === String(t.espnId)).forEach(a => {
      if (lines.has(String(a.athlete.id))) return;
      const v = (c, n) => { const cat = j.categories.find(x => x.name === c), i = cat?.names.indexOf(n), ac = a.categories.find(x => x.name === c); const x = i >= 0 && ac ? ac.totals[i] : ''; return x === '-' ? '' : x; };
      const num = x => parseFloat(String(x).replace(/,/g, '')) || 0, parts = [];
      if (num(v('passing', 'passingAttempts'))) parts.push(`${v('passing', 'completions')}/${v('passing', 'passingAttempts')}, ${v('passing', 'passingYards')} yds, ${v('passing', 'passingTouchdowns')} TD, ${v('passing', 'interceptions')} INT`);
      if (num(v('rushing', 'rushingAttempts')) >= 3 || (num(v('rushing', 'rushingAttempts')) && !parts.length)) parts.push(`${v('rushing', 'rushingAttempts')} car, ${v('rushing', 'rushingYards')} yds${num(v('rushing', 'rushingTouchdowns')) ? `, ${v('rushing', 'rushingTouchdowns')} TD` : ''}`);
      if (num(v('receiving', 'receptions'))) parts.push(`${v('receiving', 'receptions')} rec, ${v('receiving', 'receivingYards')} yds${num(v('receiving', 'receivingTouchdowns')) ? `, ${v('receiving', 'receivingTouchdowns')} TD` : ''}`);
      if (num(v('defensive', 'totalTackles')) || num(v('defensive', 'sacks'))) parts.push([`${v('defensive', 'totalTackles') || 0} tkl`, num(v('defensive', 'sacks')) ? `${v('defensive', 'sacks')} sk` : '', num(v('defensiveinterceptions', 'interceptions')) ? `${v('defensiveinterceptions', 'interceptions')} INT` : '', num(v('defensive', 'passesDefended')) ? `${v('defensive', 'passesDefended')} PD` : ''].filter(Boolean).join(', '));
      if (num(v('kicking', 'fieldGoalAttempts'))) parts.push(`FG ${v('kicking', 'fieldGoalsMade')}/${v('kicking', 'fieldGoalAttempts')}, XP ${v('kicking', 'extraPointsMade')}/${v('kicking', 'extraPointAttempts')}`);
      const gp = v('general', 'gamesPlayed');
      lines.set(String(a.athlete.id), (parts.length ? parts.slice(0, 2).join(' · ') : '') + (gp ? `${parts.length ? ' · ' : ''}${gp} GP` : ''));
    }));
    return { lines, byName, label: `${new Date().getFullYear()} season` };
  }
  if (t.league === 'nba') {
    const tb = await safe(API.nbaTable(), null), start = tb?.year ?? new Date().getFullYear() - 1;
    const r = await safe(API.teamPlayerStats(t, start), null);
    (r?.tables?.[0]?.rows || []).forEach(p => lines.set(String(p.id), `${p.v.PTS} pts · ${p.v.REB} reb · ${p.v.AST} ast · ${p.v.GP} GP`));
    return { lines, byName, empty: tb?.fallback ? 'No 76ers games last season (new arrival)' : 'No stats yet this season', label: `${start}–${String(start + 1).slice(2)} per game${tb?.fallback ? ' (last season)' : ''}` };
  }
  const d = await safe(API.mlbPro(t), null);
  (d?.hitters || []).forEach(h => byName.set(normName(h.name), `${h.avg} AVG · ${h.hr} HR · ${h.ops} OPS${h.wrc != null ? ` · ${h.wrc} wRC+` : ''}`));
  (d?.pitchers || []).forEach(p => byName.set(normName(p.name), p.role === 'SP' ? `${p.era} ERA · ${p.w}-${p.l} · ${p.ipS} IP · ${p.k9 ?? '—'} K/9` : `${p.era} ERA · ${p.sv ? p.sv + ' SV · ' : ''}${p.hld ? p.hld + ' HLD · ' : ''}${p.ipS} IP`));
  return { lines, byName, label: `${new Date().getFullYear()} season` };
};
