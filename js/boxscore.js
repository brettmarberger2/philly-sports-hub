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
  const scoring = (s.scoringPlays || []).map(p => ({ text: p.text, type: p.type?.text, period: p.period?.number, clock: p.clock?.displayValue, away: p.awayScore, home: p.homeScore, team: p.team?.abbreviation || '' }));
  const nPer = Math.max(0, ...teams.map(t => t.lines.length));
  const perLabel = i => (lg === 'mlb' ? String(i + 1) : lg === 'nfl' ? (i < 4 ? `Q${i + 1}` : 'OT') : i < 4 ? `Q${i + 1}` : `OT${i - 3}`);
  return { lg, id, kind: 'espn', state: st.state || 'pre', detail: st.detail || st.shortDetail || '', date: comp.date, venue: s.gameInfo?.venue?.fullName || '', tv: s.broadcasts?.[0]?.media?.shortName || '', note: comp.notes?.[0]?.headline || '', teams, periods: Array.from({ length: nPer }, (_, i) => perLabel(i)), teamStats, players, leaders, scoring, link: `https://www.espn.com/${lg}/game/_/gameId/${id}` };
}

async function mlbSummary(pk) {
  const [sch, box, ls, dec] = await Promise.all([
    getJSON(`${MLB_API}/schedule?gamePk=${pk}&hydrate=team,linescore`, 30),
    safe(getJSON(`${MLB_API}/game/${pk}/boxscore`, 30), null),
    safe(getJSON(`${MLB_API}/game/${pk}/linescore`, 30), null),
    safe(getJSON(`https://statsapi.mlb.com/api/v1.1/game/${pk}/feed/live?fields=liveData,decisions,winner,loser,save,fullName,id`, 60), null),
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
  return { lg: 'mlb', id: pk, kind: 'mlb', state, detail: g.status?.detailedState || '', date: g.gameDate, venue: g.venue?.name || '', tv: '', note: g.seriesDescription && g.gameType !== 'R' ? g.seriesDescription : '', teams, periods: (ls?.innings || []).map(i => String(i.num)), rhe, teamStats, players, leaders: [], scoring: [], decisions, link: `https://www.mlb.com/gameday/${pk}` };
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
async function openGame(kind, lg, id) {
  openModal(`<div class="pl-body">${spinner('Loading game…')}</div>`);
  let g;
  try { g = await API.gameSummary(kind, lg, id); } catch (e) { g = null; }
  if (!$('#modalBack').classList.contains('open')) return;
  if (!g || !g.teams.length) { openModal(`<div class="pl-body">${errBox('This game could not be loaded.')}</div>`); return; }
  const rmap = lg === 'mlb' ? new Map(((await safe(getRosterCached('phillies'), null))?.players || []).map(p => [normName(p.name), p.id])) : null;
  const [away, home] = g.teams, ph = g.teams.find(t => t.id === PHILLY_ID[lg]) || home, other = g.teams.find(t => t !== ph);
  const pre = g.state === 'pre';
  const side = t => `<div class="bxt ${t.winner ? 'w' : ''}"><img src="${esc(t.logo)}" alt=""><div><b>${esc(t.abbr)}</b><span>${esc(t.record)}</span></div>${pre ? '' : `<div class="bxs">${esc(t.score)}</div>`}</div>`;
  const status = g.state === 'in' ? `<span class="badge live">Live · ${esc(g.detail)}</span>` : pre ? `<span class="badge">${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))}</span>` : `<span class="badge">${esc(g.detail || 'Final')}</span>`;
  const leaders = g.leaders.length ? `<div class="grid g2" style="gap:12px">${g.leaders.map(l => `<div class="card flat" style="padding:14px"><h4 style="margin:0 0 8px">${esc(l.abbr)} top performers</h4>${l.items.slice(0, 5).map(x => `<div class="row between small" style="padding:3px 0;flex-wrap:nowrap;gap:8px"><span class="muted">${esc(x.cat)}</span><span style="text-align:right"><b>${esc(x.name)}</b> ${esc(x.value)}</span></div>`).join('')}</div>`).join('')}</div>` : '';
  const scoring = g.scoring.length ? `<details class="acc" style="margin-top:14px"><summary>Scoring summary (${g.scoring.length})</summary><div class="inner">${g.scoring.map(p => `<div class="pathrow"><span class="badge" style="min-width:44px;text-align:center">${esc(p.team)}</span><span style="flex:1">${esc(p.text)}</span><span class="dim small nw">${g.lg === 'nfl' ? `Q${p.period}` : ''} ${esc(p.clock || '')} · ${esc(p.away)}–${esc(p.home)}</span></div>`).join('')}</div></details>` : '';
  const tstats = g.teamStats.length ? `<div class="table-wrap"><table class="data"><thead><tr><th class="stk">Team stats</th>${g.teams.map(t => `<th class="num">${esc(t.abbr)}</th>`).join('')}</tr></thead><tbody>${g.teamStats.map(s => `<tr><td class="stk muted">${esc(s.label)}</td>${s.vals.map(v => `<td class="num"><b>${esc(v)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const T = TEAMS[LEAGUES[lg].team];
  openModal(`<div class="pl-head bx-head" style="--team:${T.primary}"><div class="bx-top"><div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(g.note || LEAGUES[lg].short)} · ${esc(fmtDate(g.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))}</div>${status}</div>
      <div class="bx-teams">${side(away)}<div class="bx-at">${pre ? '@' : '–'}</div>${side(home)}</div>
      <div class="small" style="opacity:.85">${esc([g.venue, g.tv].filter(Boolean).join(' · '))}${g.decisions?.length ? ` · ${esc(g.decisions.join(' · '))}` : ''}</div></div>
    <div class="pl-body">
      ${pre ? `<div class="errbox" style="margin-bottom:14px">This game hasn't started. The box score fills in live once it does.</div>` : ''}
      ${lineScoreHtml(g)}
      ${leaders ? `<div style="margin-top:16px">${leaders}</div>` : ''}
      ${scoring}
      ${pre ? '' : `<div class="section" style="margin-top:22px"><h2 style="font-size:1.4rem">Box score</h2><div class="seg" id="bxSeg" style="margin-bottom:12px">${[ph, other].map((t, i) => `<button data-t="${t.id}" class="${i === 0 ? 'on' : ''}">${esc(t.abbr)} players</button>`).join('')}${tstats ? '<button data-t="team">Team stats</button>' : ''}</div><div id="bxBox"></div></div>`}
      <div class="row" style="margin-top:18px"><a class="btn small" href="${esc(g.link)}" target="_blank" rel="noopener">${lg === 'mlb' ? 'MLB Gameday' : 'ESPN Gamecast'} ↗</a></div>
    </div>`);
  if (pre) return;
  const draw = tid => { $$('#bxSeg button').forEach(b => b.classList.toggle('on', b.dataset.t === tid)); $('#bxBox').innerHTML = tid === 'team' ? tstats : playerTablesHtml(g, tid, rmap); };
  $('#bxSeg').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) draw(b.dataset.t); });
  draw(ph.id);
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
