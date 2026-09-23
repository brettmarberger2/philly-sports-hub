/* Game previews (probable pitchers, lineups, projected starters, injuries, odds) and a card for any team in the league. */

/* ---------- MLB preview data ---------- */
const mlbPeople = async (ids, group, season) => {
  if (!ids.length) return new Map();
  const j = await safe(getJSON(`${MLB_API}/people?personIds=${ids.join(',')}&hydrate=stats(group=[${group}],type=[season],season=${season})`, 900), null);
  return new Map((j?.people || []).map(p => [p.id, { name: p.fullName, pos: p.primaryPosition?.abbreviation || '', hand: group === 'pitching' ? p.pitchHand?.code : p.batSide?.code, s: p.stats?.[0]?.splits?.[0]?.stat || {} }]));
};
/** Most recent lineup a team used (MLB posts the real one ~2 hours before first pitch). */
async function recentLineup(teamId, beforeIso) {
  const end = new Date(beforeIso || Date.now()), start = new Date(end - 8 * 864e5), d = x => x.toISOString().slice(0, 10);
  const j = await safe(getJSON(`${MLB_API}/schedule?sportId=1&teamId=${teamId}&startDate=${d(start)}&endDate=${d(end)}&hydrate=lineups`, 1800), null);
  const games = (j?.dates || []).flatMap(x => x.games).filter(g => g.lineups && new Date(g.gameDate) < end).reverse();
  for (const g of games) { const side = g.teams.home.team.id === +teamId ? 'homePlayers' : 'awayPlayers'; if (g.lineups[side]?.length) return g.lineups[side].map(p => p.id); }
  return [];
}
async function mlbPreview(pk) {
  const sch = await getJSON(`${MLB_API}/schedule?gamePk=${pk}&hydrate=probablePitcher(note),lineups,team`, 120);
  const g = sch.dates?.[0]?.games?.[0]; if (!g) return null;
  const season = new Date(g.gameDate).getFullYear();
  const sides = ['away', 'home'];
  const probIds = sides.map(s => g.teams[s].probablePitcher?.id).filter(Boolean);
  const posted = sides.map(s => (g.lineups?.[s + 'Players'] || []).map(p => p.id));
  const lineIds = await Promise.all(sides.map((s, i) => (posted[i].length ? posted[i] : recentLineup(g.teams[s].team.id, g.gameDate))));
  const [pit, bat, tbl] = await Promise.all([mlbPeople(probIds, 'pitching', season), mlbPeople([...lineIds[0], ...lineIds[1]], 'hitting', season), safe(API.mlbTable(season), null)]);
  return sides.map((s, i) => {
    const tm = g.teams[s].team, row = tbl?.teams.find(x => x.id === tm.id), pp = g.teams[s].probablePitcher;
    return { side: s, id: String(tm.id), name: tm.name, abbr: tm.abbreviation, row, posted: posted[i].length > 0, pitcher: pp ? { id: pp.id, name: pp.fullName, note: pp.note || '', ...(pit.get(pp.id) || {}) } : null, lineup: lineIds[i].map(id => ({ id, ...(bat.get(id) || { name: '', s: {} }) })) };
  });
}

/* ---------- preview view ---------- */
async function fillPreview(g) {
  const box = () => $('#pvBox'), lg = g.lg;
  const cardT = (t, inner) => `<div class="pvcol"><div class="pvh"><img src="${esc(t.logo)}" alt=""><b>${esc(t.abbr)}</b><span class="muted small">${esc(t.record)}</span></div>${inner}</div>`;
  const two = f => `<div class="pv2">${g.teams.map(t => cardT(t, f(t))).join('')}</div>`;
  let html = '';
  if (lg === 'mlb') {
    const p = await safe(mlbPreview(g.id), null); if (!box()) return;
    if (!p) { box().innerHTML = errBox('Preview not available.'); return; }
    const byId = id => p.find(x => x.id === id);
    html += `<h3 class="pvt">Probable pitchers</h3>` + two(t => { const x = byId(t.id)?.pitcher; if (!x) return '<div class="muted small">Not announced yet.</div>'; const s = x.s || {}; return `<div class="pvp"><b>${esc(x.name)}</b>${x.hand ? ` <span class="dim small">${x.hand}HP</span>` : ''}<div class="pvstat"><span><b>${s.wins ?? 0}-${s.losses ?? 0}</b>W-L</span><span><b>${esc(s.era ?? '—')}</b>ERA</span><span><b>${esc(s.whip ?? '—')}</b>WHIP</span><span><b>${s.strikeOuts ?? '—'}</b>K</span><span><b>${esc(s.inningsPitched ?? '—')}</b>IP</span></div>${x.note ? `<p class="small muted" style="margin:6px 0 0">${esc(x.note)}</p>` : ''}</div>`; });
    const anyPosted = p.some(x => x.posted);
    html += `<h3 class="pvt">${anyPosted ? 'Starting lineups' : 'Expected lineups'}</h3><p class="small muted" style="margin:-4px 0 8px">${anyPosted ? 'Official lineups as posted.' : 'Official lineups post about 2 hours before first pitch. Shown: each team\'s most recent batting order.'}</p>` +
      two(t => { const x = byId(t.id); if (!x?.lineup.length) return '<div class="muted small">No lineup yet.</div>'; return `<ol class="pvl">${x.lineup.map(h => `<li><span class="nm">${esc(h.name)} <span class="dim">${esc(h.pos)}</span></span><span class="st">${esc(h.s.avg ?? '')} · ${h.s.homeRuns ?? 0} HR · ${esc(h.s.ops ?? '')} OPS</span></li>`).join('')}</ol>`; });
    html += `<h3 class="pvt">Tale of the tape</h3>` + two(t => { const r = byId(t.id)?.row; return r ? `<div class="kvs"><span>Record</span><b>${r.w}-${r.l}</b><span>Last 10</span><b>${esc(r.l10)}</b><span>Streak</span><b>${esc(r.streak)}</b><span>Run diff</span><b>${r.diff > 0 ? '+' : ''}${r.diff}</b><span>Runs / game</span><b>${(r.rs / Math.max(1, r.gp)).toFixed(2)}</b><span>Allowed / game</span><b>${(r.ra / Math.max(1, r.gp)).toFixed(2)}</b><span>Standing</span><b>${ord(r.divRank)} ${esc(shortDiv(r.divName))}</b></div>` : ''; });
  } else {
    if (g.odds || g.predict) {
      const [a, h] = g.teams, pa = g.predict?.[a.id], ph = g.predict?.[h.id];
      html += `<div class="pvodds">${g.odds ? `<div><span class="muted small">Line (${esc(g.odds.provider || 'odds')})</span><b>${esc(g.odds.details || '—')}</b></div><div><span class="muted small">Over/under</span><b>${esc(g.odds.ou ?? '—')}</b></div>` : ''}${pa && ph ? `<div class="pvwin"><span class="muted small">ESPN win projection</span><div class="bar"><i style="width:${pa}%"></i></div><div class="row between small"><b>${esc(a.abbr)} ${pa.toFixed(1)}%</b><b>${esc(h.abbr)} ${ph.toFixed(1)}%</b></div></div>` : ''}</div>`;
    }
    if (g.leaders.length) html += `<h3 class="pvt">Season leaders</h3>` + two(t => { const l = g.leaders.find(x => x.id === t.id); return l ? l.items.map(x => `<div class="pvrow"><span class="muted">${esc(x.cat)}</span><span><b>${esc(x.name)}</b> ${esc(x.value)}</span></div>`).join('') : ''; });
    // projected starters from each team's depth chart
    const depths = await Promise.all(g.teams.map(t => safe(API.depth({ sport: SPORT_OF[lg], league: lg, espnId: t.id }), null))); if (!box()) return;
    const starters = d => {
      if (!d?.charts?.length) return [];
      if (lg === 'nba') return d.charts[0].rows.map(r => [r.abbr, r.players[0]?.name]);
      const off = d.charts.find(c => /WR|TE|RB/.test(c.name)) || d.charts[0];
      const def = d.charts.find(c => /D\b|Def|3-4|4-3|Nickel/i.test(c.name) && c !== off);
      const pick = (c, keys) => c ? c.rows.filter(r => keys.includes(r.abbr)).map(r => [r.abbr, r.players[0]?.name]) : [];
      return [...pick(off, ['QB', 'RB', 'WR', 'TE']), ...pick(def, ['LDE', 'RDE', 'DE', 'EDGE', 'DT', 'NT', 'WLB', 'MLB', 'LILB', 'RILB', 'SLB', 'LCB', 'RCB', 'CB', 'SS', 'FS'])].slice(0, 14);
    };
    html += `<h3 class="pvt">Projected starters</h3><p class="small muted" style="margin:-4px 0 8px">From each team's current depth chart.</p>` + two(t => { const s = starters(depths[g.teams.indexOf(t)]); return s.length ? s.map(([pos, n]) => `<div class="pvrow"><span class="muted">${esc(pos)}</span><b>${esc(n || '—')}</b></div>`).join('') : '<div class="muted small">Not published.</div>'; });
    if (Object.keys(g.injuries).length) html += `<h3 class="pvt">Injury report</h3>` + two(t => { const inj = (g.injuries[t.id] || []).filter(i => !/^Active$/i.test(i.status)); return inj.length ? inj.slice(0, 10).map(i => `<div class="pvrow"><span><b>${esc(i.name)}</b> <span class="dim small">${esc(i.pos)}</span></span><span class="badge ${/out|reserve/i.test(i.status) ? 'bad' : ''}">${esc(i.status)}${i.type ? ' · ' + esc(i.type) : ''}</span></div>`).join('') : '<div class="muted small">No injuries listed.</div>'; });
    if (g.teamStats.length) html += `<h3 class="pvt">Season stats</h3><div class="table-wrap"><table class="data"><thead><tr><th class="stk"></th>${g.teams.map(t => `<th class="num">${esc(t.abbr)}</th>`).join('')}</tr></thead><tbody>${g.teamStats.slice(0, 14).map(s => `<tr><td class="stk muted">${esc(s.label)}</td>${s.vals.map(v => `<td class="num"><b>${esc(v)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (Object.keys(g.last5).length) html += `<h3 class="pvt">Last five games</h3>` + two(t => (g.last5[t.id] || []).map(e => `<div class="pvrow"><span class="muted">${esc(e.at)} ${esc(e.opp)}</span><b class="${e.res === 'W' ? 'win' : e.res === 'L' ? 'loss' : ''}">${esc(e.res || '')} ${esc(e.score || '')}</b></div>`).join('') || '<div class="muted small">—</div>');
  }
  if (box()) box().innerHTML = html || '<div class="muted small">No preview details yet.</div>';
}

/** One-line preview for home/overview "next game" cards. */
async function previewLine(ref) {
  const [kind, lg, id] = ref.split('|');
  if (kind === 'mlb') {
    const p = await safe(mlbPreview(id), null); if (!p) return '';
    const f = x => (x.pitcher ? `${x.pitcher.name.split(' ').slice(-1)[0]} (${x.pitcher.s?.wins ?? 0}-${x.pitcher.s?.losses ?? 0}, ${x.pitcher.s?.era ?? '—'})` : 'TBD');
    return `<b>Probables:</b> ${esc(f(p[0]))} vs ${esc(f(p[1]))}`;
  }
  const g = await safe(API.gameSummary(kind, lg, id), null); if (!g) return '';
  const parts = [];
  if (g.odds?.details) parts.push(`<b>Line:</b> ${esc(g.odds.details)}${g.odds.ou ? ` · O/U ${esc(g.odds.ou)}` : ''}`);
  const us = g.teams.find(t => t.id === PHILLY_ID[lg]);
  if (us && g.predict?.[us.id]) parts.push(`<b>${esc(us.abbr)} win chance:</b> ${g.predict[us.id].toFixed(0)}%`);
  const outs = us ? (g.injuries[us.id] || []).filter(i => /out|doubtful|questionable/i.test(i.status)).slice(0, 2) : [];
  if (outs.length) parts.push(`<b>Injuries:</b> ${outs.map(i => `${esc(i.name)} (${esc(i.status)})`).join(', ')}`);
  return parts.join('<br>');
}
function fillPreviewLines(root = document) {
  $$('[data-prev]', root).forEach(async el => { if (el.dataset.done) return; el.dataset.done = 1; const h = await previewLine(el.dataset.prev); if (h) el.innerHTML = `${h}<span class="pvmore">Tap for full preview ›</span>`; });
}

/* ---------- Any team in the league ---------- */
document.addEventListener('click', e => {
  const c = e.target.closest('[data-teamcard]'); if (!c) return;
  e.preventDefault(); e.stopPropagation();
  const [lg, id] = c.dataset.teamcard.split('|');
  if (String(id) === PHILLY_ID[lg]) { closeModal(); location.hash = `#/team/${LEAGUES[lg].team}`; return; }
  openTeamCard(lg, id);
}, true);

async function openTeamCard(lg, id) {
  openModal(`<div class="pl-body">${spinner('Loading team…')}</div>`);
  const base = TEAMS[LEAGUES[lg].team];
  const table = await safe(API.leagueTable(lg), null);
  const row = table?.teams.find(x => String(x.id) === String(id));
  if (!$('#modalBack').classList.contains('open')) return;
  if (!row) { openModal(`<div class="pl-body">${errBox('Team not found.')}</div>`); return; }
  const t = { key: `x${id}`, league: lg, sport: base.sport, espnId: lg === 'mlb' ? null : id, mlbId: lg === 'mlb' ? +id : null, abbr: row.abbr, name: row.name, nick: row.name.split(' ').slice(-1)[0], recordFmt: base.recordFmt, gamesInSeason: base.gamesInSeason };
  const statusTxt = r => (lg === 'nba' ? `${r.conf} #${r.seed}` : r.status === 'div' ? `${r.lg || r.conf} #${r.seed} · division leader` : r.status === 'wc' ? `${r.lg || r.conf} #${r.seed} · wild card` : `Outside the playoff field`);
  const nbaStart = lg === 'nba' ? table.year : null;
  openModal(`<div class="pl-head tc-head"><img src="${esc(row.logo)}" alt="" style="width:88px;height:88px;object-fit:contain;background:rgba(255,255,255,.92);border-radius:16px;padding:8px"><div>
      <div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(LEAGUES[lg].short)} · ${esc(lg === 'nba' ? (row.conf === 'East' ? 'Eastern Conference' : 'Western Conference') : shortDiv(row.divName))}${table.fallback ? ' · last season' : ''}</div><h2>${esc(row.name)}</h2>
      <div class="row" style="gap:6px"><span class="badge" style="background:#ffffff26;color:#fff">${row.w}-${row.l}${row.t ? '-' + row.t : ''}</span><span class="badge" style="background:#ffffff26;color:#fff">${esc(statusTxt(row))}</span>${row.streak ? `<span class="badge" style="background:#ffffff26;color:#fff">${esc(row.streak)}</span>` : ''}</div></div></div>
    <div class="pl-body"><div class="seg" id="tcSeg" style="margin-bottom:14px"><button data-v="sched" class="on">Schedule &amp; results</button><button data-v="lead">Team leaders</button><button data-v="stats">Team stats</button></div><div id="tcBox">${spinner()}</div>
      <p class="small dim" style="margin-top:14px">Tap any game for the box score or preview.</p></div>`);
  const draw = async v => {
    $$('#tcSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const box = $('#tcBox'); box.innerHTML = spinner();
    if (v === 'sched') {
      const r = await safe(API.schedule(t), null); if (!$('#tcBox')) return;
      const games = r?.games || [], done = games.filter(g => g.state === 'post' && g.stype !== 1).slice(-8).reverse(), next = games.filter(g => g.state !== 'post' && g.stype !== 1).slice(0, 12);
      const oppRec = g => { const o = table.teams.find(x => String(x.id) === String(g.opp.id)); return o ? `${o.w}-${o.l}${o.t ? '-' + o.t : ''}` : ''; };
      const vsPhilly = games.filter(g => String(g.opp.id) === PHILLY_ID[lg]);
      const line = g => `<a class="uprow" href="javascript:void(0)" data-game="${gameRef(t, g)}"><span class="ud"><b>${esc(fmtDate(g.date, { weekday: 'short' }))}</b>${esc(fmtDate(g.date, { month: 'short', day: 'numeric' }))}</span><span class="uv">${g.home ? 'vs' : '@'}</span><img src="${esc(g.opp.logo)}" alt="" onerror="this.style.visibility='hidden'"><span class="un"><b>${esc(g.opp.name)}</b><span class="small muted">${esc(oppRec(g))}${String(g.opp.id) === PHILLY_ID[lg] ? ' · vs Philly' : ''}</span></span><span class="ut">${g.state === 'post' ? resultChip(g) : g.state === 'in' ? '<span class="badge live">Live</span>' : esc(fmtTime(g.date))}</span></a>`;
      box.innerHTML = `${vsPhilly.length ? `<div class="fact" style="margin-top:0"><b>Vs ${esc(base.nick)} this season:</b> ${vsPhilly.map(g => g.state === 'post' ? `${g.result === 'W' ? 'W' : g.result === 'L' ? 'L' : 'T'} ${g.ourScore}-${g.oppScore}` : fmtDate(g.date, { month: 'short', day: 'numeric' })).join(', ')}</div>` : ''}
        <h4>${next.length ? `Remaining schedule (${games.filter(g => g.state !== 'post' && g.stype !== 1).length})` : 'Remaining schedule'}</h4>${next.length ? `<div class="upl">${next.map(line).join('')}</div>` : '<div class="muted small">No games left.</div>'}
        <h4 style="margin-top:16px">Recent results</h4>${done.length ? `<div class="upl">${done.map(line).join('')}</div>` : '<div class="muted small">No games played yet.</div>'}`;
    } else if (v === 'lead') {
      const l = await safe(API.leaders(t, nbaStart), []); if (!$('#tcBox')) return;
      box.innerHTML = l.length ? `<div class="stars">${l.map(x => leaderTileHtml(t, x)).join('')}</div><p class="small dim" style="margin-top:8px">Tap a tile for the full leaderboard.</p>` : '<div class="muted small">No leaders yet.</div>';
    } else {
      if (lg === 'mlb') {
        const s = await safe(API.mlbTeamStats(t, table.year), null); if (!$('#tcBox')) return;
        const h = s?.hitting, p = s?.pitching;
        box.innerHTML = h || p ? `<div class="stat-list">${h ? [['AVG', h.avg], ['OBP', h.obp], ['SLG', h.slg], ['OPS', h.ops], ['Runs', h.runs], ['Home runs', h.homeRuns], ['Stolen bases', h.stolenBases]].map(([a, b]) => `<div class="s"><span>${a}</span><b>${esc(b ?? '—')}</b></div>`).join('') : ''}${p ? [['ERA', p.era], ['WHIP', p.whip], ['Strikeouts', p.strikeOuts], ['Walks', p.baseOnBalls], ['Saves', p.saves], ['Opp. AVG', p.avg]].map(([a, b]) => `<div class="s"><span>${a}</span><b>${esc(b ?? '—')}</b></div>`).join('') : ''}<div class="s"><span>Run differential</span><b>${row.diff > 0 ? '+' : ''}${row.diff}</b></div></div>` : '<div class="muted small">Stats unavailable.</div>';
      } else {
        const s = await safe(API.teamStats(t), null); if (!$('#tcBox')) return;
        box.innerHTML = s?.cats?.length ? s.cats.filter(c => c.stats.length).slice(0, 4).map(c => `<h4>${esc(c.name)}</h4><div class="stat-list">${c.stats.slice(0, 10).map(x => `<div class="s"><span>${esc(x.label)}</span><span><b>${esc(x.value)}</b>${x.rank ? ` <span class="dim small">${esc(x.rank)}</span>` : ''}</span></div>`).join('')}</div>`).join('') : '<div class="muted small">Team stats are not available yet this season.</div>';
      }
    }
  };
  $('#tcSeg').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) draw(b.dataset.v); });
  draw('sched');
}
