/* Live data layer: ESPN public site API + MLB Stats API. Everything is normalised to shapes the views share. */
const API = {
  /* ---------- Team summary ---------- */
  async team(t) {
    const j = await getJSON(`${ESPN.site(t)}/teams/${t.espnId}`, 45);
    const tm = j.team, rec = tm.record?.items?.find(i => i.type === 'total') || tm.record?.items?.[0];
    const st = n => rec?.stats?.find(s => s.name === n)?.value;
    return {
      id: tm.id, name: tm.displayName, color: tm.color, logo: tm.logos?.[0]?.href || teamLogo(t),
      summary: rec?.summary || '0-0', w: st('wins') ?? 0, l: st('losses') ?? 0, tie: st('ties') ?? 0, otl: st('otLosses') ?? 0,
      standingSummary: tm.standingSummary || '', venue: tm.franchise?.venue, links: tm.links || [],
      nextEvent: tm.nextEvent?.[0] ? API.normEvent(t, tm.nextEvent[0]) : null,
    };
  },

  /* ---------- Games ---------- */
  normEvent(t, ev) {
    const c = ev.competitions?.[0]; if (!c) return null;
    const us = c.competitors.find(x => String(x.team?.id) === String(t.espnId)), them = c.competitors.find(x => x !== us);
    if (!us || !them) return null;
    const sc = x => { const s = x.score; if (s == null) return null; const v = typeof s === 'object' ? (s.displayValue ?? s.value) : s; return v === '' || v == null ? null : Number(v); };
    const st = c.status?.type || ev.status?.type || {};
    const state = st.state || 'pre';
    const a = sc(us), b = sc(them);
    let result = null;
    if (state === 'post' && a != null && b != null) result = a > b ? 'W' : a < b ? 'L' : 'T';
    const tn = them.team || {};
    return {
      id: ev.id, ts: new Date(ev.date).getTime(), date: ev.date, home: us.homeAway === 'home', neutral: !!c.neutralSite,
      opp: { id: tn.id, name: tn.displayName || tn.name, short: tn.shortDisplayName || tn.name, abbr: tn.abbreviation, logo: tn.logos?.[0]?.href || (tn.abbreviation ? teamLogo(t, tn.abbreviation) : '') },
      ourScore: a, oppScore: b, result, state, detail: st.shortDetail || st.detail || '', completed: !!st.completed,
      label: ev.week?.text || (ev.seasonType?.type === 3 ? ev.competitions[0].notes?.[0]?.headline || 'Postseason' : ev.seasonType?.name) || '',
      stype: ev.seasonType?.type ?? 2, venue: c.venue?.fullName, tv: c.broadcasts?.[0]?.media?.shortName || c.broadcast || '',
      link: ev.links?.find(l => /gamecast|summary|boxscore/i.test(l.text || ''))?.href || `https://www.espn.com/${t.league}/game/_/gameId/${ev.id}`,
      ourRecord: us.record?.find?.(r => r.type === 'total')?.displayValue || (typeof us.record === 'string' ? us.record : ''),
      period: c.status?.period, clock: c.status?.displayClock,
      note: c.notes?.[0]?.headline || '',
    };
  },
  normMlbGame(t, g) {
    const home = g.teams.home, away = g.teams.away, ourHome = home.team.id === t.mlbId, us = ourHome ? home : away, them = ourHome ? away : home;
    const state = { Preview: 'pre', Live: 'in', Final: 'post' }[g.status.abstractGameState] || 'pre';
    const a = us.score ?? null, b = them.score ?? null;
    let result = null; if (state === 'post' && a != null && b != null) result = a > b ? 'W' : a < b ? 'L' : 'T';
    const labels = { R: '', F: 'Wild Card', D: 'Division Series', L: 'League Championship', W: 'World Series', S: 'Spring Training', E: 'Exhibition' };
    return {
      id: g.gamePk, ts: new Date(g.gameDate).getTime(), date: g.gameDate, home: ourHome, neutral: false,
      opp: { id: them.team.id, name: them.team.name, short: them.team.teamName || them.team.name, abbr: them.team.abbreviation, logo: `https://www.mlbstatic.com/team-logos/${them.team.id}.svg` },
      ourScore: a, oppScore: b, result, state, detail: g.status.detailedState, completed: state === 'post',
      label: g.seriesDescription && g.gameType !== 'R' ? g.seriesDescription : labels[g.gameType] || '', stype: g.gameType === 'R' ? 2 : g.gameType === 'S' ? 1 : 3,
      venue: g.venue?.name, tv: '', link: `https://www.mlb.com/gameday/${g.gamePk}`,
      ourRecord: us.leagueRecord ? `${us.leagueRecord.wins}-${us.leagueRecord.losses}` : '', note: g.description || '',
    };
  },

  /** Full schedule/results. year=null → current season (ESPN's idea of "current"). */
  async schedule(t, year = null) {
    if (t.mlbId) {
      const y = year ?? new Date().getFullYear();
      const j = await getJSON(`${MLB_API}/schedule?sportId=1&teamId=${t.mlbId}&season=${y}&gameType=R,F,D,L,W&hydrate=team`, year && year < new Date().getFullYear() ? 86400 : 90);
      const games = (j.dates || []).flatMap(d => d.games).map(g => API.normMlbGame(t, g));
      return { season: y, games: games.sort((a, b) => a.ts - b.ts) };
    }
    let season = year != null ? espnSeason(t, year) : null;
    if (season == null) { const j0 = await getJSON(`${ESPN.site(t)}/teams/${t.espnId}/schedule`, 60); season = j0.requestedSeason?.year || j0.season?.year; }
    const past = year != null && espnSeason(t, year) < new Date().getFullYear();
    const types = year != null ? [2, 3] : [1, 2, 3];
    const parts = await Promise.all(types.map(ty => safe(getJSON(`${ESPN.site(t)}/teams/${t.espnId}/schedule?season=${season}&seasontype=${ty}`, past ? 86400 : 90), { events: [] })));
    const seen = new Set(), games = [];
    parts.forEach(p => (p.events || []).forEach(ev => { if (seen.has(ev.id)) return; seen.add(ev.id); const g = API.normEvent(t, ev); if (g) games.push(g); }));
    return { season, games: games.sort((a, b) => a.ts - b.ts) };
  },

  /** Live info override from scoreboard (richer for in-progress games). */
  async scoreboardGame(t) {
    const j = await safe(getJSON(`${ESPN.site(t)}/scoreboard`, 20), null);
    const ev = j?.events?.find(e => e.competitions?.[0]?.competitors?.some(c => String(c.team?.id) === String(t.espnId)));
    return ev ? API.normEvent(t, ev) : null;
  },

  /** Convenience: {live, next, last, games} for the current season. */
  async gameStatus(t) {
    const { games } = await API.schedule(t);
    const now = Date.now();
    let live = games.find(g => g.state === 'in');
    if (!live) { const sb = await API.scoreboardGame(t); if (sb && sb.state === 'in') live = sb; }
    const reg = games.filter(g => g.stype !== 1 || games.every(x => x.stype === 1)); // ignore preseason if real games exist
    const next = reg.find(g => g.state === 'pre' && g.ts > now - 3 * 3600e3) || null;
    const last = [...reg].reverse().find(g => g.state === 'post') || null;
    return { live, next, last, games };
  },

  /* ---------- Roster / depth / contracts ---------- */
  normPlayer(t, a, group) {
    const c = a.contract || {};
    const contracts = (a.contracts || []).filter(x => x.season?.year).map(x => ({ year: x.season.year, salary: x.salary || 0 })).sort((x, y) => x.year - y.year);
    return {
      id: a.id, name: a.fullName || a.displayName, first: a.firstName, last: a.lastName, jersey: a.jersey || '', pos: a.position?.abbreviation || '', posName: a.position?.displayName || a.position?.name || '',
      group: group || '', age: a.age, height: a.displayHeight, weight: a.displayWeight, exp: typeof a.experience === 'object' ? a.experience?.years : a.experience,
      college: a.college?.name || a.college?.shortName || '', birth: [a.birthPlace?.city, a.birthPlace?.state || a.birthPlace?.country].filter(Boolean).join(', '),
      dob: a.dateOfBirth, debut: a.debutYear, headshot: a.headshot?.href || headshot(t, a.id),
      status: a.status?.name || 'Active', injuries: (a.injuries || []).map(i => ({ status: i.status, date: i.date, detail: i.details?.type || i.details?.detail || '' })),
      salary: c.salary ?? null, salaryYear: c.season?.year, yearsRemaining: c.yearsRemaining ?? null, through: c.signedThrough ?? null, salaryRemaining: c.salaryRemaining ?? null, bonus: c.bonus ?? null,
      contractExtra: c, contracts,
    };
  },
  async roster(t) {
    const j = await getJSON(`${ESPN.site(t)}/teams/${t.espnId}/roster`, 120);
    const nice = { offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams', injuredReserveOrOut: 'Injured Reserve / Out', suspended: 'Suspended', practiceSquad: 'Practice Squad', Pitchers: 'Pitchers', Catchers: 'Catchers', Infielders: 'Infielders', Outfielders: 'Outfielders', 'Designated Hitter': 'Designated Hitters' };
    let players = [];
    if (j.athletes?.[0]?.items) j.athletes.forEach(g => (g.items || []).forEach(a => players.push(API.normPlayer(t, a, nice[g.position] || g.position))));
    else players = (j.athletes || []).map(a => API.normPlayer(t, a, 'Roster'));
    return { players, coach: j.coach?.[0], season: j.season, team: j.team };
  },
  async depth(t) {
    const j = await getJSON(`${ESPN.site(t)}/teams/${t.espnId}/depthcharts`, 120);
    const charts = (j.depthchart || []).map(ch => ({
      name: ch.name,
      rows: Object.entries(ch.positions || {}).map(([k, v]) => ({
        key: k, abbr: v.position?.abbreviation || k.toUpperCase(), label: v.position?.displayName || k,
        players: (v.athletes || []).map((a, i) => ({ id: a.id, name: a.displayName || a.shortName, rank: a.rank ?? i + 1, jersey: a.jersey })),
      })).filter(r => r.players.length),
    })).filter(c => c.rows.length);
    return { charts, season: j.season };
  },

  /* ---------- Standings ---------- */
  async standings(t, year = null) {
    if (t.mlbId) {
      const y = year ?? new Date().getFullYear();
      const j = await getJSON(`${MLB_API}/standings?leagueId=103,104&season=${y}&standingsTypes=regularSeason&hydrate=team,division`, year && year < new Date().getFullYear() ? 86400 : 120);
      const groups = (j.records || []).map(r => ({
        name: r.division?.name || r.division?.nameShort || `Division ${r.division?.id ?? ''}`, league: r.league?.id,
        entries: r.teamRecords.map(x => ({
          id: x.team.id, us: x.team.id === t.mlbId, name: x.team.name, abbr: x.team.abbreviation, logo: `https://www.mlbstatic.com/team-logos/${x.team.id}.svg`,
          w: x.wins, l: x.losses, t: 0, pct: x.winningPercentage, gb: x.gamesBack, streak: x.streak?.streakCode || '', pf: x.runsScored, pa: x.runsAllowed, diff: x.runDifferential, rank: +x.divisionRank || null,
        })),
      }));
      return { groups, ours: groups.find(g => g.entries.some(e => e.us)) };
    }
    const season = year != null ? espnSeason(t, year) : '';
    const j = await getJSON(`${ESPN.siteV2(t)}/standings?level=3${season ? `&season=${season}` : ''}`, year != null ? 3600 : 120);
    const groups = [];
    const walk = n => { if (n.standings?.entries) groups.push({ name: n.name, entries: n.standings.entries }); (n.children || []).forEach(walk); };
    walk(j);
    const norm = groups.map(g => ({
      name: g.name,
      entries: g.entries.map(e => {
        const s = n => e.stats.find(x => x.name === n); const v = n => s(n)?.value; const d = n => s(n)?.displayValue;
        return {
          id: e.team.id, us: String(e.team.id) === String(t.espnId), name: e.team.displayName, abbr: e.team.abbreviation, logo: e.team.logos?.[0]?.href || teamLogo(t, e.team.abbreviation),
          w: v('wins') ?? 0, l: v('losses') ?? 0, t: v('ties') ?? 0, pct: d('winPercent') ?? d('leagueWinPercent'), gb: d('gamesBehind') ?? '-', streak: d('streak') || '', pf: v('pointsFor') ?? v('avgPointsFor'), pa: v('pointsAgainst') ?? v('avgPointsAgainst'), diff: d('pointDifferential') ?? d('differential'),
          seed: v('playoffSeed'), rank: v('playoffSeed'),
        };
      }).sort((a, b) => (b.w - a.w) || (a.l - b.l)),
    }));
    return { groups: norm, ours: norm.find(g => g.entries.some(e => e.us)) };
  },

  /* ---------- Team stats & leaders ---------- */
  async teamStats(t) {
    const j = await getJSON(`${ESPN.web(t)}/teams/${t.espnId}/statistics`, 300);
    const cats = (j.results?.stats?.categories || []).map(c => ({ name: c.displayName, stats: (c.stats || []).map(s => ({ label: s.displayName, abbr: s.abbreviation, value: s.displayValue, rank: s.rankDisplayValue || '' })) }));
    const opp = (j.results?.opponent || []).map(c => ({ name: c.displayName, stats: (c.stats || []).map(s => ({ label: s.displayName, value: s.displayValue })) }));
    return { cats, opp, season: j.season };
  },
  /** Team leaders for a season (year = null → current). Returns [{cat, name, id, value, headshot}] */
  async leaders(t, year = null) {
    if (t.mlbId) {
      const y = year ?? new Date().getFullYear();
      const cats = ['homeRuns', 'battingAverage', 'runsBattedIn', 'hits', 'stolenBases', 'wins', 'earnedRunAverage', 'strikeouts', 'saves'];
      const j = await getJSON(`${MLB_API}/teams/${t.mlbId}/leaders?leaderCategories=${cats.join(',')}&season=${y}&leaderGameTypes=R`, year && year < new Date().getFullYear() ? 86400 : 300);
      const names = { homeRuns: 'Home Runs', battingAverage: 'Batting Avg', runsBattedIn: 'RBI', hits: 'Hits', stolenBases: 'Stolen Bases', wins: 'Wins', earnedRunAverage: 'ERA', strikeouts: 'Strikeouts (P)', saves: 'Saves' };
      return (j.teamLeaders || []).filter(x => x.leaders?.length).map(x => { const l = x.leaders[0]; return { cat: names[x.leaderCategory] || x.leaderCategory, name: l.person.fullName, value: l.value, mlbId: l.person.id, headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${l.person.id}/headshot/67/current` }; });
    }
    const season = espnSeason(t, year ?? new Date().getFullYear());
    const want = t.league === 'nfl'
      ? { passingYards: 'Passing Yards', rushingYards: 'Rushing Yards', receivingYards: 'Receiving Yards', passingTouchdowns: 'Passing TD', receivingTouchdowns: 'Receiving TD', totalTackles: 'Tackles', sacks: 'Sacks', interceptions: 'Interceptions' }
      : { pointsPerGame: 'Points / Game', reboundsPerGame: 'Rebounds / Game', assistsPerGame: 'Assists / Game', stealsPerGame: 'Steals / Game', blocksPerGame: 'Blocks / Game', threePointFieldGoalsMade: '3-Pointers Made' };
    let j = await safe(getJSON(`${ESPN.core(t)}/seasons/${season}/types/2/teams/${t.espnId}/leaders`, year != null ? 86400 : 600), null);
    if (!j?.categories?.length) return [];
    const picks = j.categories.filter(c => want[c.name] && c.leaders?.length);
    const out = await Promise.all(picks.map(async c => {
      const l = c.leaders[0]; let name = '', id = '';
      const ref = l.athlete?.$ref; if (ref) { id = (ref.match(/athletes\/(\d+)/) || [])[1]; const a = await safe(getJSON(httpsify(ref), 86400), null); name = a?.displayName || a?.fullName || ''; }
      return { cat: want[c.name], name, id, value: l.displayValue, headshot: id ? headshot(t, id) : '' };
    }));
    return out.filter(o => o.name);
  },
  /** ESPN core record for a past season (points for/against etc.) */
  async coreRecord(t, year) {
    if (t.mlbId) return null;
    const j = await safe(getJSON(`${ESPN.core(t)}/seasons/${espnSeason(t, year)}/types/2/teams/${t.espnId}/record`, 86400), null);
    const it = j?.items?.find(i => i.name === 'overall') || j?.items?.[0]; if (!it) return null;
    const g = n => it.stats?.find(s => s.name === n)?.value;
    return { summary: it.summary, pf: g('pointsFor'), pa: g('pointsAgainst'), avgPf: g('avgPointsFor'), avgPa: g('avgPointsAgainst'), diff: g('differential') ?? g('pointDifferential'), streak: g('streak') };
  },
  async mlbTeamStats(t, year) {
    const j = await safe(getJSON(`${MLB_API}/teams/${t.mlbId}/stats?season=${year}&group=hitting,pitching&stats=season`, year < new Date().getFullYear() ? 86400 : 300), null);
    const out = {}; (j?.stats || []).forEach(s => { out[s.group.displayName] = s.splits?.[0]?.stat; }); return out;
  },
  async mlbRosterForYear(t, year) {
    const j = await safe(getJSON(`${MLB_API}/teams/${t.mlbId}/roster?season=${year}&rosterType=fullSeason&hydrate=person`, 86400), null);
    return (j?.roster || []).map(r => ({ id: r.person.id, name: r.person.fullName, pos: r.position?.abbreviation, jersey: r.jerseyNumber || '' }));
  },
  async mlbStaff(t) {
    const j = await getJSON(`${MLB_API}/teams/${t.mlbId}/coaches`, 600);
    return (j.roster || []).map(r => ({ id: r.person.id, name: r.person.fullName, job: r.job, jersey: r.jerseyNumber || '' }));
  },

  /* ---------- News ---------- */
  async news(t, limit = 8) {
    const j = await getJSON(`${ESPN.site(t)}/news?team=${t.espnId}&limit=${limit}`, 300);
    return (j.articles || []).map(a => ({ title: a.headline, desc: a.description, date: a.published, img: a.images?.[0]?.url, link: a.links?.web?.href || '#', team: t.key })).slice(0, limit);
  },

  /* ---------- Player detail ---------- */
  async athlete(t, id) {
    const [bio, stats] = await Promise.all([
      safe(getJSON(`${ESPN.common(t)}/athletes/${id}`, 3600), null),
      safe(getJSON(`${ESPN.common(t)}/athletes/${id}/stats`, 3600), null),
    ]);
    return { bio: bio?.athlete || null, stats };
  },
  async coachDetail(t, id) {
    const j = await safe(getJSON(`${ESPN.core(t)}/coaches/${id}`, 3600), null);
    return j;
  },
};
