/* Box scores: tap any game anywhere on the site to see the line score, team stats and every player's line. */
const SPORT_OF = { nfl: 'football', nba: 'basketball', mlb: 'baseball' };
const PHILLY_ID = { nfl: '21', nba: '20', mlb: '143' };
/** data-game value for a normalized game: kind|league|id|teamKey */
const gameRef = (t, g) => `${t.mlbId ? 'mlb' : 'espn'}|${t.league}|${g.id}|${t.key}`;

document.addEventListener('click', e => {
  const g = e.target.closest('[data-game]'); if (!g || e.target.closest('[data-player]')) return;
  e.preventDefault(); const [kind, lg, id] = g.dataset.game.split('|'); openGame(kind, lg, id);
});

/* ---------- data ---------- */
API.gameSummary = async (kind, lg, id) => (kind === 'mlb' ? mlbSummary(id) : espnSummary(lg, id));

async function espnSummary(lg, id) {
  const s = await getJSON(`https://site.api.espn.com/apis/site/v2/sports/${SPORT_OF[lg]}/${lg}/summary?event=${id}`, 30);
  const comp = s.header?.competitions?.[0] || {}, st = comp.status?.type || {};
  const teams = (comp.competitors || []).map(c => ({ side: c.homeAway, id: String(c.team.id), abbr: c.team.abbreviation, name: c.team.displayName, logo: c.team.logos?.[0]?.href || c.team.logo, score: c.score ?? '', winner: !!c.winner, record: c.record?.[0]?.displayValue || c.record?.[0]?.summary || '', lines: (c.linescores || []).map(l => l.displayValue ?? l.value) }))
    .sort((a, b) => (a.side === 'away' ? -1 : 1));
  const tsById = new Map((s.boxscore?.teams || []).map(t => [String(t.team.id), t.statistics || []]));
  const labels = (s.boxscore?.teams?.[0]?.statistics || []).map(x => x.label || x.name);
  const teamStats = labels.map(l => ({ label: l, vals: teams.map(t => (tsById.get(t.id) || []).find(x => (x.label || x.name) === l)?.displayValue ?? '') }));
  const players = {};
  (s.boxscore?.players || []).forEach(p => { players[String(p.team.id)] = (p.statistics || []).filter(c => c.athletes?.length).map(c => ({ title: String(c.text || c.name || '').replace(new RegExp(`^(${[p.team.location, p.team.displayName, p.team.shortDisplayName].filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+`), ''), labels: c.labels || [], totals: c.totals || [], rows: c.athletes.map(a => ({ id: a.athlete?.id, name: a.athlete?.displayName || '', pos: a.athlete?.position?.abbreviation || '', starter: !!a.starter, dnp: !!a.didNotPlay, stats: a.stats || [] })) })); });
  const leaders = (s.leaders || []).map(l => ({ id: String(l.team?.id), abbr: l.team?.abbreviation, items: (l.leaders || []).filter(c => c.leaders?.length).map(c => ({ cat: c.displayName, name: c.leaders[0].athlete?.displayName, pid: c.leaders[0].athlete?.id, value: c.leaders[0].displayValue })) }));
  const byTeamId = id => (comp.competitors || []).find(c => String(c.team.id) === String(id))?.team?.abbreviation || '';
  const perTxt = p => p.period?.displayValue || (lg === 'nfl' || lg === 'nba' ? (p.period?.number ? `Q${p.period.number}` : '') : '');
  const scoreSrc = s.scoringPlays?.length ? s.scoringPlays : (s.plays || []).filter(p => p.scoringPlay && lg === 'mlb');
  const scoring = scoreSrc.map(p => ({ text: p.text, type: p.type?.text, period: perTxt(p), clock: p.clock?.displayValue || '', away: p.awayScore, home: p.homeScore, team: p.team?.abbreviation || byTeamId(p.team?.id) }));
  const recent = (s.plays || []).filter(p => p.text).slice(-6).reverse().map(p => ({ period: perTxt(p), clock: p.clock?.displayValue || '', text: p.text }));
  const sit = s.situation, stIn = (st.state || '') === 'in';
  const pname = new Map((s.boxscore?.players || []).flatMap(p => (p.statistics || []).flatMap(c => (c.athletes || []).map(a => [String(a.athlete?.id), a.athlete?.displayName]))));
  const who = x => x?.athlete?.displayName || pname.get(String(x?.playerId)) || '';
  const now = stIn ? { label: st.shortDetail || st.detail || '', down: sit?.downDistanceText || '', poss: sit?.possessionText || '', outs: sit?.outs, balls: sit?.balls, strikes: sit?.strikes, bases: sit && 'onFirst' in sit ? [!!sit.onFirst, !!sit.onSecond, !!sit.onThird] : null, batter: who(sit?.batter), pitcher: who(sit?.pitcher), last: sit?.lastPlay?.text || recent[0]?.text || '', note: sit?.situationNotes?.[0]?.text || '' } : null;
  const nPer = Math.max(0, ...teams.map(t => t.lines.length));
  const perLabel = i => (lg === 'mlb' ? String(i + 1) : lg === 'nfl' ? (i < 4 ? `Q${i + 1}` : 'OT') : i < 4 ? `Q${i + 1}` : `OT${i - 3}`);
  const injuries = {}; (s.injuries || []).forEach(t => { injuries[String(t.team?.id)] = (t.injuries || []).map(i => ({ name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation || '', status: i.status, type: i.details?.type || i.type?.description || '' })); });
  const pc = s.pickcenter?.[0], pr = s.predictor;
  const odds = pc ? { details: pc.details, ou: pc.overUnder, provider: pc.provider?.name } : null;
  const predict = pr ? { [String(pr.homeTeam?.id)]: parseFloat(pr.homeTeam?.gameProjection), [String(pr.awayTeam?.id)]: parseFloat(pr.awayTeam?.gameProjection) } : null;
  const last5 = {}; (s.lastFiveGames || []).forEach(t => { last5[String(t.team?.id)] = (t.events || []).map(e => ({ res: e.gameResult, score: e.score, opp: e.opponent?.abbreviation || '', at: e.atVs || '', id: e.id, date: e.gameDate })); });
  return { lg, id, kind: 'espn', injuries, odds, predict, last5, now, recent, state: st.state || 'pre', detail: st.detail || st.shortDetail || '', date: comp.date, venue: s.gameInfo?.venue?.fullName || '', tv: s.broadcasts?.[0]?.media?.shortName || '', note: comp.notes?.[0]?.headline || '', teams, periods: Array.from({ length: nPer }, (_, i) => perLabel(i)), teamStats, players, leaders, scoring, link: `https://www.espn.com/${lg}/game/_/gameId/${id}` };
}

async function mlbSummary(pk) {
  const [sch, box, ls, dec] = await Promise.all([
    getJSON(`${MLB_API}/schedule?gamePk=${pk}&hydrate=team,linescore`, 30),
    safe(getJSON(`${MLB_API}/game/${pk}/boxscore`, 30), null),
    safe(getJSON(`${MLB_API}/game/${pk}/linescore`, 30), null),
    safe(getJSON(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=liveData,plays,allPlays,scoringPlays,currentPlay,result,description,awayScore,homeScore,about,inning,halfInning,matchup,batter,pitcher,fullName,count,balls,strikes,outs,linescore,currentInningOrdinal,inningState,offense,first,second,third,decisions,winner,loser,save,id`, 20), null),
  ]);
  const g = sch.dates?.[0]?.games?.[0] || {};
  const state = { Preview: 'pre', Live: 'in', Final: 'post' }[g.status?.abstractGameState] || 'pre';
  const d = dec?.liveData?.decisions || {}, decMark = pid => (d.winner?.id === pid ? ' (W)' : d.loser?.id === pid ? ' (L)' : d.save?.id === pid ? ' (S)' : '');
  const teams = ['away', 'home'].map(side => { const x = g.teams?.[side] || {}, tm = x.team || {}; return { side, id: String(tm.id), abbr: tm.abbreviation || '', name: tm.name || '', logo: `https://www.mlbstatic.com/team-logos/${tm.id}.svg`, score: x.score ?? '', winner: !!x.isWinner, record: x.leagueRecord ? `${x.leagueRecord.wins}-${x.leagueRecord.losses}` : '', lines: (ls?.innings || []).map(i => i[side]?.runs ?? '') }; });
  const players = {}, teamStats = [];
  if (box) {
    ['away', 'home'].forEach((side, ti) => {
      const B = box.teams[side], P = id => B.players['ID' + id];
      const bat = B.batters.map(P).filter(p => p?.stats?.batting && (p.stats.batting.atBats != null || p.stats.batting.plateAppearances)).map(p => { const s = p.stats.batting; return { mlbId: p.person.id, name: p.person.fullName, pos: p.position?.abbreviation || '', sub: p.battingOrder && !String(p.battingOrder).endsWith('00'), stats: [s.atBats, s.runs, s.hits, s.rbi, s.homeRuns, s.baseOnBalls, s.strikeOuts, p.seasonStats?.batting?.avg ?? ''] }; });
      const pit = B.pitchers.map(P).filter(p => p?.stats?.pitching).map(p => { const s = p.stats.pitching; return { mlbId: p.person.id, name: p.person.fullName + decMark(p.person.id), pos: 'P', stats: [s.inningsPitched, s.hits, s.runs, s.earnedRuns, s.baseOnBalls, s.strikeOuts, s.homeRuns, s.pitchesThrown ?? s.numberOfPitches ?? '', p.seasonStats?.pitching?.era ?? ''] }; });
      const tb = B.teamStats.batting, tp = B.teamStats.pitching;
      players[teams[ti].id] = [
        { title: 'Batting', labels: ['AB', 'R', 'H', 'RBI', 'HR', 'BB', 'K', 'AVG'], totals: [tb.atBats, tb.runs, tb.hits, tb.rbi, tb.homeRuns, tb.baseOnBalls, tb.strikeOuts, ''], rows: bat },
        { title: 'Pitching', labels: ['IP', 'H', 'R', 'ER', 'BB', 'K', 'HR', 'PC', 'ERA'], totals: [tp.inningsPitched, tp.hits, tp.runs, tp.earnedRuns, tp.baseOnBalls, tp.strikeOuts, tp.homeRuns, '', ''], rows: pit },
      ];
    });
    const s = side => box.teams[side].teamStats;
    [['Hits', x => x.batting.hits], ['Home runs', x => x.batting.homeRuns], ['Walks', x => x.batting.baseOnBalls], ['Strikeouts (batting)', x => x.batting.strikeOuts], ['Left on base', x => x.batting.leftOnBase], ['Stolen bases', x => x.batting.stolenBases], ['Errors', x => x.fielding?.errors], ['Pitches thrown', x => x.pitching.pitchesThrown ?? x.pitching.numberOfPitches]]
      .forEach(([label, f]) => teamStats.push({ label, vals: ['away', 'home'].map(sd => f(s(sd)) ?? '') }));
  }
  const rhe = ls?.teams ? ['away', 'home'].map(sd => [ls.teams[sd].runs ?? '', ls.teams[sd].hits ?? '', ls.teams[sd].errors ?? '']) : null;
  const decisions = [d.winner && `W: ${d.winner.fullName}`, d.loser && `L: ${d.loser.fullName}`, d.save && `S: ${d.save.fullName}`].filter(Boolean);
  const plays = dec?.liveData?.plays, lsl = dec?.liveData?.linescore;
  const halfTxt = p => `${p.about?.halfInning === 'top' ? 'Top' : 'Bot'} ${ord(p.about?.inning || 0)}`;
  const scoring = (plays?.scoringPlays || []).map(i => plays.allPlays[i]).filter(Boolean).map(p => ({ period: halfTxt(p), text: p.result?.description || '', away: p.result?.awayScore, home: p.result?.homeScore, team: p.about?.halfInning === 'top' ? teams[0].abbr : teams[1].abbr }));
  const cp = plays?.currentPlay;
  const now = state === 'in' && lsl ? { label: `${lsl.inningState || ''} ${lsl.currentInningOrdinal || ''}`.trim(), outs: lsl.outs ?? cp?.count?.outs ?? 0, balls: cp?.count?.balls ?? lsl.balls ?? 0, strikes: cp?.count?.strikes ?? lsl.strikes ?? 0, bases: [!!lsl.offense?.first, !!lsl.offense?.second, !!lsl.offense?.third], batter: cp?.matchup?.batter?.fullName || lsl.offense?.batter?.fullName || '', pitcher: cp?.matchup?.pitcher?.fullName || '', last: [...(plays?.allPlays || [])].reverse().find(p => p.result?.description)?.result.description || '' } : null;
  const recent = [...(plays?.allPlays || [])].filter(p => p.result?.description).slice(-6).reverse().map(p => ({ period: halfTxt(p), text: p.result.description }));
  return { lg: 'mlb', id: pk, kind: 'mlb', scoring, now, recent, state, detail: g.status?.detailedState || '', date: g.gameDate, venue: g.venue?.name || '', tv: '', note: g.seriesDescription && g.gameType !== 'R' ? g.seriesDescription : '', teams, periods: (ls?.innings || []).map(i => String(i.num)), rhe, teamStats, players, leaders: [], decisions, link: `https://www.mlb.com/gameday/${pk}` };
}

/* ---------- view ---------- */
function lineScoreHtml(g) {
  if (!g.periods.length) return '';
  const extra = g.rhe ? ['R', 'H', 'E'] : ['T'];
  return `<div class="table-wrap"><table class="data linescore"><thead><tr><th class="stk"></th>${g.periods.map(p => `<th class="num">${p}</th>`).join('')}${extra.map(x => `<th class="num tot">${x}</th>`).join('')}</tr></thead><tbody>${g.teams.map((t, i) => `<tr class="${t.id === PHILLY_ID[g.lg] ? 'hl' : ''}"><td class="stk"><div class="pname"><img src="${esc(t.logo)}" alt="" style="border-radius:0;border:0;background:none">${esc(t.abbr)}</div></td>${g.periods.map((_, j) => `<td class="num">${esc(t.lines[j] ?? '')}</td>`).join('')}${(g.rhe ? g.rhe[i] : [t.score]).map(x => `<td class="num tot"><b>${esc(x)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function playerTablesHtml(g, teamId, rmap) {
  const cats = g.players[teamId] || [];
  if (!cats.length) return '<div class="muted small">No player stats yet.</div>';
  const isPhilly = teamId === PHILLY_ID[g.lg], tk = LEAGUES[g.lg].team;
  const nameCell = r => {
    const pid = isPhilly ? (r.mlbId ? rmap?.get(normName(r.name.replace(/ \([WLS]\)$/, ''))) : r.id) : null;
    const label = `${r.sub ? '<span class="dim">– </span>' : ''}<b>${esc(r.name)}</b>${r.pos ? ` <span class="dim small">${esc(r.pos)}</span>` : ''}${r.starter && g.lg === 'nba' ? '' : ''}`;
    return pid ? `<a href="javascript:void(0)" data-player="${pid}" data-team="${tk}" data-name="${esc(r.name)}">${label}</a>` : label;
  };
  return cats.map((c, ci) => {
    const rows = c.rows.filter(r => !r.dnp);
    const cols = [{ key: 'name', label: c.title || 'Player', fmt: nameCell }, ...c.labels.map((l, i) => ({ key: 's' + i, label: l, num: true, sortVal: r => parseFloat(String(r.stats[i]).split('/')[0]) || 0, fmt: r => esc(r.stats[i] ?? '') }))];
    const tot = c.totals?.some(x => x !== '' && x != null) ? `<div class="small dim" style="margin:6px 2px 0">Team: ${c.labels.map((l, i) => (c.totals[i] !== '' && c.totals[i] != null ? `${l} ${c.totals[i]}` : '')).filter(Boolean).join(' · ')}</div>` : '';
    return `<h4 style="margin:${ci ? 18 : 0}px 0 8px">${esc(c.title)}</h4>${renderTable(`bx-${g.id}-${teamId}-${ci}`, cols, rows)}${tot}`;
  }).join('');
}
/* ---------- game summary pieces ---------- */
function basesSvg(b) {
  const on = i => (b?.[i] ? 'var(--gold)' : 'var(--card2)');
  return `<svg viewBox="0 0 60 44" width="66" height="48" aria-label="Runners on base"><rect x="23" y="4" width="14" height="14" transform="rotate(45 30 11)" fill="${on(1)}" stroke="var(--muted)"/><rect x="41" y="20" width="14" height="14" transform="rotate(45 48 27)" fill="${on(0)}" stroke="var(--muted)"/><rect x="5" y="20" width="14" height="14" transform="rotate(45 12 27)" fill="${on(2)}" stroke="var(--muted)"/></svg>`;
}
const dots = (n, max) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
function nowHtml(g) {
  const n = g.now; if (!n) return '';
  if (g.lg === 'mlb') return `<div class="nowbox"><div class="nowl"><b>${esc(n.label)}</b>${basesSvg(n.bases)}<div class="outs"><span>Outs</span>${dots(n.outs || 0, 3)}</div>${n.balls != null ? `<div class="cnt">${n.balls}-${n.strikes} count</div>` : ''}</div>
    <div class="nowr">${n.batter ? `<div><span class="muted small">At bat</span><b>${esc(n.batter)}</b></div>` : ''}${n.pitcher ? `<div><span class="muted small">Pitching</span><b>${esc(n.pitcher)}</b></div>` : ''}${n.last ? `<div class="lastp"><span class="muted small">Last play</span>${esc(n.last)}</div>` : ''}${n.note ? `<div class="small muted">${esc(n.note)}</div>` : ''}</div></div>`;
  return `<div class="nowbox"><div class="nowl"><b>${esc(n.label)}</b>${n.down ? `<div class="cnt">${esc(n.down)}</div>` : ''}${n.poss ? `<div class="small muted">${esc(n.poss)}</div>` : ''}</div><div class="nowr">${n.last ? `<div class="lastp"><span class="muted small">Last play</span>${esc(n.last)}</div>` : ''}</div></div>`;
}
function scoringHtml(g, live) {
  if (!g.scoring?.length) return live ? `<h3 class="pvt">Scoring plays</h3><div class="muted small">No scoring yet.</div>` : '';
  const list = live ? [...g.scoring].reverse() : g.scoring;
  return `<h3 class="pvt">Scoring plays${live ? ' <span class="small muted" style="font-family:var(--font);text-transform:none;letter-spacing:0">(newest first)</span>' : ''}</h3><div class="plays">${list.map(p => `<div class="play"><span class="pp">${esc(p.period || '')}${p.clock ? ' ' + esc(p.clock) : ''}</span><span class="badge">${esc(p.team)}</span><span class="pt">${esc(p.text)}</span><b class="nw">${esc(p.away)}–${esc(p.home)}</b></div>`).join('')}</div>`;
}
function recentHtml(g) {
  if (!g.recent?.length) return '';
  return `<h3 class="pvt">Latest plays</h3><div class="plays">${g.recent.map(p => `<div class="play"><span class="pp">${esc(p.period || '')}${p.clock ? ' ' + esc(p.clock) : ''}</span><span class="pt">${esc(p.text)}</span></div>`).join('')}</div>`;
}
/** Baseball: who is hitting and pitching well so far, both teams. */
function mlbSoFarHtml(g) {
  const col = t => {
    const [bat, pit] = g.players[t.id] || [];
    const hot = (bat?.rows || []).filter(r => +r.stats[2] > 0 || +r.stats[3] > 0 || +r.stats[5] > 0).sort((a, b) => (+b.stats[2] + +b.stats[4] * 2 + +b.stats[3]) - (+a.stats[2] + +a.stats[4] * 2 + +a.stats[3])).slice(0, 4);
    return `<div class="pvcol"><div class="pvh"><img src="${esc(t.logo)}" alt=""><b>${esc(t.abbr)}</b></div><div class="lbl">At the plate</div>${hot.map(r => `<div class="pvrow"><b>${esc(r.name)}</b><span>${r.stats[2]}-for-${r.stats[0]}${+r.stats[4] ? `, ${r.stats[4]} HR` : ''}${+r.stats[3] ? `, ${r.stats[3]} RBI` : ''}${+r.stats[5] ? `, ${r.stats[5]} BB` : ''}</span></div>`).join('') || '<div class="muted small">No hits yet.</div>'}
      <div class="lbl" style="margin-top:10px">On the mound</div>${(pit?.rows || []).map(r => `<div class="pvrow"><b>${esc(r.name)}</b><span>${esc(r.stats[0])} IP, ${r.stats[1]} H, ${r.stats[3]} ER, ${r.stats[5]} K${r.stats[7] !== '' ? `, ${r.stats[7]} P` : ''}</span></div>`).join('') || '<div class="muted small">—</div>'}</div>`;
  };
  return `<h3 class="pvt">${g.state === 'in' ? 'How it is going so far' : 'Who did what'}</h3><div class="pv2">${g.teams.map(col).join('')}</div>`;
}
function leadersHtml(g) {
  if (!g.leaders.length) return '';
  return `<h3 class="pvt">${g.state === 'in' ? 'Top performers so far' : 'Top performers'}</h3><div class="pv2">${g.leaders.map(l => `<div class="pvcol"><div class="pvh"><b>${esc(l.abbr)}</b></div>${l.items.slice(0, 5).map(x => `<div class="pvrow"><span class="muted">${esc(x.cat)}</span><span><b>${esc(x.name)}</b> ${esc(x.value)}</span></div>`).join('')}</div>`).join('')}</div>`;
}

async function openGame(kind, lg, id, opts = {}) {
  clearTimeout(window._gameTimer);
  if (!opts.refresh) openModal(`<div class="pl-body">${spinner('Loading game…')}</div>`);
  let g;
  try { g = await API.gameSummary(kind, lg, id); } catch (e) { g = null; }
  if (!$('#modalBack').classList.contains('open')) return;
  if (opts.refresh && $('#gameMark')?.dataset.g !== String(id)) return;
  if (!g || !g.teams.length) { if (!opts.refresh) openModal(`<div class="pl-body">${errBox('This game could not be loaded.')}</div>`); return; }
  const rmap = lg === 'mlb' ? new Map(((await safe(getRosterCached('phillies'), null))?.players || []).map(p => [normName(p.name), p.id])) : null;
  const [away, home] = g.teams, ph = g.teams.find(t => t.id === PHILLY_ID[lg]) || home, other = g.teams.find(t => t !== ph);
  const pre = g.state === 'pre', live = g.state === 'in';
  const side = t => `<div class="bxt ${t.winner ? 'w' : ''}" data-teamcard="${lg}|${t.id}" role="button" title="Open ${esc(t.name)}"><img src="${esc(t.logo)}" alt=""><div><b>${esc(t.abbr)}</b><span>${esc(t.record)}</span></div>${pre ? '' : `<div class="bxs">${esc(t.score)}</div>`}</div>`;
  const status = live ? `<span class="badge live">Live · ${esc(g.detail)}</span>` : pre ? `<span class="badge">${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))}</span>` : `<span class="badge">${esc(g.detail || 'Final')}</span>`;
  const tstats = g.teamStats.length ? `<div class="table-wrap"><table class="data"><thead><tr><th class="stk">Team stats</th>${g.teams.map(t => `<th class="num">${esc(t.abbr)}</th>`).join('')}</tr></thead><tbody>${g.teamStats.map(s => `<tr><td class="stk muted">${esc(s.label)}</td>${s.vals.map(v => `<td class="num"><b>${esc(v)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const T = TEAMS[LEAGUES[lg].team];
  const tab = opts.tab || ph.id;
  openModal(`<div id="gameMark" data-g="${esc(id)}" hidden></div><div class="pl-head bx-head" style="--team:${T.primary}"><div class="bx-top"><div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(g.note || LEAGUES[lg].short)} · ${esc(fmtDate(g.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))}</div>${status}</div>
      <div class="bx-teams">${side(away)}<div class="bx-at">${pre ? '@' : '–'}</div>${side(home)}</div>
      <div class="small" style="opacity:.85">${esc([g.venue, g.tv].filter(Boolean).join(' · '))}${g.decisions?.length ? ` · ${esc(g.decisions.join(' · '))}` : ''}</div></div>
    <div class="pl-body">
      ${pre ? `<div id="pvBox">${spinner('Building the game preview…')}</div>` : `
        ${live ? `${nowHtml(g)}<p class="small dim" style="margin:6px 0 0">Updates automatically every 30 seconds.</p>` : ''}
        <div style="margin-top:14px">${lineScoreHtml(g)}</div>
        ${scoringHtml(g, live)}
        ${lg === 'mlb' ? mlbSoFarHtml(g) : leadersHtml(g)}
        ${live ? recentHtml(g) : ''}
        <div class="section" style="margin-top:26px"><h2 style="font-size:1.4rem">Box score</h2><div class="seg" id="bxSeg" style="margin-bottom:12px">${[ph, other].map(t => `<button data-t="${t.id}">${esc(t.abbr)} players</button>`).join('')}${tstats ? '<button data-t="team">Team stats</button>' : ''}</div><div id="bxBox"></div></div>`}
      <div class="row" style="margin-top:18px"><a class="btn small" href="${esc(g.link)}" target="_blank" rel="noopener">${lg === 'mlb' ? 'MLB Gameday' : 'ESPN Gamecast'} ↗</a></div>
    </div>`);
  if (pre) { fillPreview(g); return; }
  let cur = tab;
  const draw = tid => { cur = tid; $$('#bxSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === tid)); $('#bxBox').innerHTML = tid === 'team' ? tstats : playerTablesHtml(g, tid, rmap); };
  $('#bxSeg').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) draw(b.dataset.t); });
  draw(g.teams.some(t => t.id === tab) || tab === 'team' ? tab : ph.id);
  if (live) window._gameTimer = setTimeout(() => { if ($('#modalBack').classList.contains('open') && $('#gameMark')?.dataset.g === String(id)) openGame(kind, lg, id, { refresh: true, tab: cur }); }, 30000);
}

/** Overview card: the most recent game with each side's top performers and a link to the full box score. */
async function lastGameCard(t, gs, alive) {
  const el = () => $('#ovLast');
  let g = gs?.live || gs?.last;
  if (!g) { const rg = await safe(API.recentGames(t, 1), null); g = rg?.live || rg?.list?.at(-1); }
  if (!alive() || !el()) return;
  if (!g) { el().innerHTML = '<h3>Last game</h3><div class="muted small">No games played yet.</div>'; return; }
  const ref = gameRef(t, g), [kind, lg, id] = ref.split('|');
  const s = await safe(API.gameSummary(kind, lg, id), null); if (!alive() || !el()) return;
  const us = s?.teams.find(x => x.id === PHILLY_ID[lg]);
  let perf = '';
  if (s?.leaders?.length) perf = s.leaders.map(l => `<div><h4 style="margin:10px 0 6px">${esc(l.abbr)}</h4>${l.items.slice(0, 3).map(x => `<div class="row between small" style="padding:2px 0;flex-wrap:nowrap;gap:8px"><span class="muted">${esc(x.cat)}</span><span style="text-align:right"><b>${esc(x.name)}</b> ${esc(x.value)}</span></div>`).join('')}</div>`).join('');
  else if (s && lg === 'mlb' && us) {
    const bat = (s.players[us.id]?.[0]?.rows || []).filter(r => +r.stats[2] > 0 || +r.stats[3] > 0).sort((a, b) => (+b.stats[2] + +b.stats[3] * 1.5) - (+a.stats[2] + +a.stats[3] * 1.5)).slice(0, 4);
    const pit = (s.players[us.id]?.[1]?.rows || []).slice(0, 3);
    perf = `<h4 style="margin:10px 0 6px">${esc(us.abbr)} at the plate</h4>${bat.map(r => `<div class="row between small" style="padding:2px 0"><b>${esc(r.name)}</b><span>${r.stats[2]}-for-${r.stats[0]}${+r.stats[4] ? `, ${r.stats[4]} HR` : ''}${+r.stats[3] ? `, ${r.stats[3]} RBI` : ''}</span></div>`).join('') || '<div class="muted small">No hits.</div>'}
      <h4 style="margin:10px 0 6px">${esc(us.abbr)} on the mound</h4>${pit.map(r => `<div class="row between small" style="padding:2px 0"><b>${esc(r.name)}</b><span>${r.stats[0]} IP, ${r.stats[3]} ER, ${r.stats[5]} K</span></div>`).join('')}${s.decisions?.length ? `<div class="small muted" style="margin-top:6px">${esc(s.decisions.join(' · '))}</div>` : ''}`;
  }
  el().innerHTML = `<div class="row between" style="margin-bottom:8px"><h3 style="margin:0">${g.state === 'in' ? 'Live now' : 'Last game'}</h3><span class="muted small">${esc(fmtDate(g.date, { weekday: 'short', month: 'short', day: 'numeric' }))}</span></div>
    <a class="lastline" href="javascript:void(0)" data-game="${ref}">${resultChip(g) || `<b>${g.ourScore ?? 0}–${g.oppScore ?? 0}</b>`} <span>${g.home ? 'vs' : '@'} ${esc(g.opp.name)}</span>${s ? `<span class="dim small">${esc(s.detail)}</span>` : ''}</a>
    ${s ? lineScoreHtml(s) : ''}${perf}
    <button class="btn small primary" style="margin-top:12px" data-game="${ref}">Full box score ›</button>`;
}
