/* Home page + shared game widgets */

function resultChip(g) {
  if (!g || g.result == null) return '';
  const cls = g.result === 'W' ? 'win' : g.result === 'L' ? 'loss' : 'tie';
  return `<b class="${cls}">${g.result} ${g.ourScore}–${g.oppScore}</b>`;
}

/** A compact game card. label: 'LIVE' | 'NEXT' | 'LAST' */
function gameBox(t, g, label) {
  if (!g) return `<div class="gamebox"><div class="lab"><span>${label}</span></div><div class="muted small">Nothing on the schedule right now.</div></div>`;
  const live = g.state === 'in', done = g.state === 'post';
  const meSide = { logo: teamLogo(t), abbr: t.abbr, score: g.ourScore };
  const opSide = { logo: g.opp.logo, abbr: g.opp.abbr || g.opp.short, score: g.oppScore };
  const [away, home] = g.home ? [opSide, meSide] : [meSide, opSide];
  const side = (s, isRight) => `<div class="side" style="${isRight ? 'flex-direction:row-reverse' : ''}"><img src="${esc(s.logo)}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(s.abbr)}</span></div>`;
  const mid = (live || done) ? `<div class="score">${away.score ?? 0} – ${home.score ?? 0}</div>` : `<div class="muted small center">${g.home ? 'vs' : '@'}</div>`;
  const badge = live ? `<span class="badge live">Live · ${esc(g.detail)}</span>` : done ? `<span class="badge ${g.result === 'W' ? 'good' : g.result === 'L' ? 'bad' : ''}">Final · ${g.result}</span>` : `<span class="badge">${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))}</span>`;
  const meta = [g.label, g.tv, g.venue].filter(Boolean).join(' · ');
  return `<a class="gamebox" style="display:block;color:inherit" href="${esc(g.link)}" target="_blank" rel="noopener">
    <div class="lab"><span>${label}${g.label ? ' · ' + esc(g.label) : ''}</span>${badge}</div>
    <div class="matchup">${side(away)}${mid}${side(home, true)}</div>
    ${meta ? `<div class="dim small" style="margin-top:6px">${esc(meta)}</div>` : ''}
  </a>`;
}

function bannerWall(key, { compact = false } = {}) {
  const t = TEAMS[key], ts = H.titles(key);
  if (!ts.length) return `<div class="muted small">No titles yet.</div>`;
  return `<div class="banners">${ts.map(s => {
    const c = H.champ(t, s.year);
    return `<a class="banner" href="#/season/${key}/${s.year}" title="${esc((c?.game || 'Champions') + ' · ' + t.nick)}">${t.league === 'nba' ? esc(s.label.replace(/^\d\d(\d\d)–(\d\d)$/, '$1–$2')) : s.year}<small>${esc(t.league === 'nfl' ? (c?.game || '').replace('Super Bowl ', 'SB ').replace('NFL Championship', 'NFL') : t.league === 'mlb' ? 'WS' : 'NBA')}</small></a>`;
  }).join('')}</div>`;
}

async function viewHome({ mount, alive }) {
  const totals = TEAM_KEYS.map(k => H.totals(k));
  const allTitles = sum(totals, x => x.titles);
  const yr = H.years();
  mount.innerHTML = `
    <section class="hero compact"><div class="hero-grid">
      <div>
        <div class="tri"><span></span><span></span><span></span></div>
        <h1>Philly sports,<br><em>right now.</em></h1>
        <p class="lede">Scores, standings, playoff races, stats and news for the Eagles, Phillies and 76ers. Plus every season since ${yr.min} when you want the history.</p>
        <div class="row" style="margin-top:18px">
          <a class="btn primary" style="--team:#0b1a30" href="#/leagues">Standings &amp; playoff races</a>
          <a class="btn" href="#/league/mlb/leaders">League leaders</a>
        </div>
        <form class="yearjump" id="yjForm" style="margin-top:14px" autocomplete="off"><input type="number" id="yjIn" inputmode="numeric" min="${yr.min}" max="${new Date().getFullYear()}" placeholder="Jump to any year" aria-label="Jump to a year"><button type="submit">Jump →</button></form>
      </div>
      <div class="hero-tiles" id="heroTiles">${TEAM_KEYS.map(k => `<a class="hero-tile" href="#/team/${k}" style="--c1:${TEAMS[k].primary}"><img src="${teamLogoOn(TEAMS[k])}" alt=""><div><div class="nm">${TEAMS[k].nick}</div><div class="sub" id="hs-${k}">${TEAMS[k].sportName}</div></div><div class="rc">—<small>Record</small></div></a>`).join('')}</div>
    </div></section>
    <div id="liveStrip"></div>
    <section class="section"><h2>Game day</h2><div class="grid g3" id="teamCards">${TEAM_KEYS.map(k => `<div class="card">${spinner()}</div>`).join('')}</div></section>
    <section class="section"><h2>Coming up</h2><div class="card" id="upcoming">${spinner('Loading schedules…')}</div></section>
    <section class="section"><h2>Standings</h2><p class="section-sub">Where each team sits right now. Tap a card for the full playoff picture and every division.</p><div class="grid g3" id="stdSnap">${TEAM_KEYS.map(() => `<div class="card">${spinner()}</div>`).join('')}</div></section>
    <section class="section"><h2>League leaders</h2><p class="section-sub">The top of each league, with Philly players highlighted. Tap any list for the full leaderboard.</p><div id="ldSnap">${spinner('Loading leaders…')}</div></section>
    <section class="section"><h2>Headlines</h2><div id="homeNews">${spinner('Loading headlines…')}</div></section>

    <div class="histdiv"><span>Explore the history</span></div>
    <section class="tm" id="tm">
      <div class="tm-top"><div><h2>Time machine</h2><p class="sub">Pick any year from ${yr.min} to today. See how the Eagles, Phillies and 76ers did, who won the title, then open the year for the players, stats and stories.</p></div><div class="tm-year" id="tmYear">1980</div></div>
      <input type="range" id="tmRange" min="${yr.min}" max="${new Date().getFullYear()}" value="1980" aria-label="Pick a year">
      <div class="ends"><span>${yr.min}</span><span>DRAG TO TRAVEL THROUGH TIME</span><span>${new Date().getFullYear()}</span></div>
      <div class="decs" id="tmDecs">${[...Array(Math.floor((new Date().getFullYear() - 1880) / 10) + 1)].map((_, i) => 1880 + i * 10).map(d => `<button data-y="${d < yr.min ? yr.min : d + 5}">${d}s</button>`).join('')}</div>
      <div class="champline" id="tmChamp"></div>
      <div class="tm-cards" id="tmCards"></div>
      <div class="go"><a class="btn go-btn" id="tmGo" href="#/year/1980">Open 1980 →</a><span class="small" style="color:#ffffffb0">or type a year</span><input type="number" id="tmNum" min="${yr.min}" max="${new Date().getFullYear()}" value="1980" style="width:100px"></div>
    </section>
    <section class="section"><h2>Championship banners</h2><div class="grid g3">${TEAM_KEYS.map(k => `<div class="card"><div class="row between" style="margin-bottom:12px"><h3 style="margin:0"><img src="${teamLogo(TEAMS[k])}" width="34" height="34" alt=""> ${TEAMS[k].nick}</h3><span class="badge gold">${H.titles(k).length} titles</span></div>${bannerWall(k)}<a class="btn small ghost" style="margin-top:14px" href="#/team/${k}/history">Full history →</a></div>`).join('')}</div></section>
    <section class="section"><h2>Only in Philadelphia</h2><p class="section-sub">Beyond the scoreboard: the landmarks, the food and the movie that made the city. Click any photo for the story.</p><div id="iconCards">${spinner('Loading photos…')}</div>
      <div class="factgrid">${CUR.phillyFacts.map(([a, b]) => `<div class="fact"><b>${esc(a)}.</b> ${esc(b)}</div>`).join('')}</div>
      <p class="disc">Photos from Wikimedia Commons via Wikipedia; each article lists the photographer and license. Facts are summarized from public sources.</p></section>
    <section class="section"><h2>Explore</h2><div class="grid g-auto" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      ${[['#/leagues', '📊', 'Leagues', 'Standings, playoff races and leaders for the MLB, NFL and NBA.'], ['#/history', '📜', 'Franchise overview', 'The three franchises: titles, timelines and every season.'],
      ['#/year', '🗓️', 'Year Explorer', 'Pick any year and see how all three teams did.'],
      ['#/stadiums', '🏟️', 'Stadiums', 'Current homes and the parks of the past.'],
      ['#/shop', '🛍️', 'Team shop', 'Jerseys, hats and more at Fanatics and official stores.']]
      .map(([h, i, a, b]) => `<a class="card" href="${h}"><div style="font-size:2.2rem">${i}</div><h3 style="margin-top:8px">${a}</h3><div class="muted small">${b}</div></a>`).join('')}
    </div></section>`;


  const tmUpdate = y => {
    y = Math.min(Math.max(+y || 1980, yr.min), new Date().getFullYear());
    $('#tmYear').textContent = y; $('#tmRange').value = y; $('#tmNum').value = y; $('#tmGo').href = `#/year/${y}`; $('#tmGo').textContent = `Open ${y} →`;
    $$('#tmDecs button').forEach(b => b.classList.toggle('on', Math.floor(+b.dataset.y / 10) === Math.floor(y / 10)));
    $('#tmCards').innerHTML = TEAM_KEYS.map(k => {
      const tt = TEAMS[k], s = H.find(k, y);
      const body = s ? `<div class="rc">${H.record(tt, s)}</div><div class="rs">${s.result === 'champion' ? '🏆 ' + esc(H.champ(tt, y)?.game || 'Champions') : esc(H.outcome(s))}</div>` : `<div class="rs">${y < tt.since ? 'Not founded yet' : y >= new Date().getFullYear() ? 'Season in progress' : 'No season on file'}</div>`;
      return `<div class="tm-card ${s?.result === 'champion' ? 'champ' : ''}"><img src="${teamLogoOn(tt)}" alt=""><div><div style="font-weight:800">${tt.nick}</div>${body}</div></div>`;
    }).join('');
    const ch = TEAM_KEYS.map(k => H.champ(TEAMS[k], y)).filter(Boolean);
    $('#tmChamp').innerHTML = ch.length ? 'League champions: ' + ch.map(c => `<b>${esc(c.winner)}</b> (${esc(c.game.replace('NFL Championship', 'NFL').replace('Super Bowl ', 'SB '))})`).join(' · ') : '';
  };
  $('#tmRange').addEventListener('input', e => tmUpdate(e.target.value));
  $('#tmNum').addEventListener('change', e => tmUpdate(e.target.value));
  $('#tmNum').addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = `#/year/${$('#tmNum').value}`; });
  $('#tmDecs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) tmUpdate(b.dataset.y); });
  tmUpdate(1980);

  $('#yjForm').addEventListener('submit', e => {
    e.preventDefault(); const v = +$('#yjIn').value, max = new Date().getFullYear();
    if (v >= yr.min && v <= max) location.hash = `#/year/${v}`; else { toast(`Enter a year between ${yr.min} and ${max}`); $('#yjIn').focus(); }
  });
  phillyIcons().then(list => {
    if (!alive()) return;
    $('#iconCards').innerHTML = phillyIconCards(list);
  });
  phillySkyline().then(url => { if (!alive() || !url) return; const h = $('.hero'); h.style.setProperty('--skyline', `url('${url}')`); h.classList.add('photo'); });
  const draw = async () => {
    const stats = await Promise.all(TEAM_KEYS.map(async k => {
      const t = TEAMS[k];
      const [info, gs, pic] = await Promise.all([safe(API.team(t)), safe(API.gameStatus(t)), safe(API.picture(t), null)]);
      return { k, t, info, gs, pic };
    }));
    if (!alive()) return;
    $$('#heroTiles .hero-tile').forEach((el, i) => { const { info: inf, pic, k } = stats[i]; el.querySelector('.rc').innerHTML = `${inf && (inf.w + inf.l + inf.tie) > 0 ? esc(inf.summary) : '—'}<small>${esc(inf?.standingSummary || 'Record')}</small>`; if (pic) $(`#hs-${k}`).textContent = pic.statusShort; });
    homeUpcoming(stats);
    homeStandings(stats);
    $('#teamCards').innerHTML = stats.map(({ k, t, info, gs, pic }) => {
      const tot = totals[TEAM_KEYS.indexOf(k)];
      const hasRec = info && (info.w + info.l + info.tie) > 0;
      return `<div class="team-card" style="--c1:${t.primary}">
        <a class="top" href="#/team/${k}"><img src="${teamLogoOn(t)}" alt=""><div><div class="small" style="color:#ffffffb0;letter-spacing:.1em;text-transform:uppercase">${t.sportName} · ${t.since}–present</div><h3>${t.nick}</h3>
          <div class="rec">${hasRec ? esc(info.summary) : '—'}</div><div class="small" style="color:#ffffffd0">${esc(info?.standingSummary || 'Offseason')}</div></div></a>
        <div class="body">
          ${pic ? `<a class="pstrip tone-${pic.tone}" href="#/team/${k}/picture"><span class="pl">${pic.kind === 'nba' && pic.fin ? 'LAST SEASON' : 'PLAYOFF PICTURE'}</span><b>${esc(pic.headline)}</b><span class="ps">${esc(pic.sub)}</span></a>` : ''}
          ${gs?.live ? gameBox(t, gs.live, 'LIVE') : ''}
          ${!gs?.live ? gameBox(t, gs?.next, 'NEXT') : ''}
          ${gameBox(t, gs?.last, 'LAST')}
          <div class="row small muted" style="margin-top:auto"><span>🏆 ${tot.titles} titles</span><span>📈 ${tot.w}–${tot.l}${tot.t ? '–' + tot.t : ''} all-time</span><a href="#/team/${k}" style="margin-left:auto;font-weight:700">Team hub →</a></div>
        </div></div>`;
    }).join('');
    const live = stats.filter(s => s.gs?.live);
    $('#liveStrip').innerHTML = live.length ? `<div class="champion-strip" style="margin-top:20px;background:#fde4e1;border-color:#f5b5ae;color:#7a1a12"><span class="badge live">Live now</span>${live.map(s => `<a href="#/team/${s.k}"><b>${esc(s.t.nick)}</b> ${s.gs.live.ourScore ?? 0}–${s.gs.live.oppScore ?? 0} ${s.gs.live.home ? 'vs' : '@'} ${esc(s.gs.live.opp.short)} · ${esc(s.gs.live.detail)}</a>`).join(' · ')}</div>` : '';
  };
  draw();
  App.every(() => alive() && draw(), 45000);
  homeLeaders(alive);

  const news = (await Promise.all(TEAM_KEYS.map(k => safe(API.news(TEAMS[k], 6), [])))).flat().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!alive()) return;
  if (!news.length) { $('#homeNews').innerHTML = errBox('Headlines are unavailable right now.'); return; }
  const withImg = news.find(n => n.img) || news[0], rest = news.filter(n => n !== withImg).slice(0, 6);
  $('#homeNews').innerHTML = `<div class="mag">
    <a class="feature" href="${esc(withImg.link)}" target="_blank" rel="noopener" style="background-image:url('${esc(withImg.img || '')}')"><div class="in"><span class="badge">${esc(TEAMS[withImg.team].nick)} · ${ago(withImg.date)}</span><div class="t">${esc(withImg.title)}</div><div class="d">${esc(withImg.desc || '')}</div></div></a>
    <div class="card" style="padding:18px 20px">${rest.map(n => `<a class="news" href="${esc(n.link)}" target="_blank" rel="noopener">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy">` : ''}<div><div class="t">${esc(n.title)}</div><div class="small muted">${esc(TEAMS[n.team].nick)} · ${ago(n.date)}</div></div></a>`).join('')}</div></div>`;
}

/* ---------- Home: current-season sections ---------- */
function homeUpcoming(stats) {
  const soon = Date.now() + 10 * 864e5;
  const games = stats.flatMap(({ t, gs }) => (gs?.games || []).filter(g => g.state === 'pre' && g.stype !== 1 && g.ts > Date.now() - 3 * 3600e3 && g.ts < soon).map(g => ({ ...g, t }))).sort((a, b) => a.ts - b.ts).slice(0, 10);
  const el = $('#upcoming'); if (!el) return;
  el.innerHTML = games.length ? `<div class="upl">${games.map(g => `<a class="uprow" href="${esc(g.link)}" target="_blank" rel="noopener"><span class="ud"><b>${esc(fmtDate(g.date, { weekday: 'short' }))}</b>${esc(fmtDate(g.date, { month: 'short', day: 'numeric' }))}</span><img src="${teamLogo(g.t)}" alt=""><span class="uv">${g.home ? 'vs' : '@'}</span><img src="${esc(g.opp.logo)}" alt="" onerror="this.style.visibility='hidden'"><span class="un"><b>${esc(g.t.nick)}</b> ${g.home ? 'vs' : 'at'} ${esc(g.opp.name)}<span class="small muted">${esc([g.label, g.venue].filter(Boolean).join(' · '))}</span></span><span class="ut">${esc(fmtTime(g.date))}${g.tv ? `<span class="small muted">${esc(g.tv)}</span>` : ''}</span></a>`).join('')}</div>`
    : '<div class="muted small">No Philly games in the next 10 days.</div>';
}
function homeStandings(stats) {
  const el = $('#stdSnap'); if (!el) return;
  el.innerHTML = stats.map(({ k, t, pic }) => {
    if (!pic) return `<div class="card"><h3>${esc(t.nick)}</h3><div class="muted small">Standings unavailable.</div></div>`;
    let rows, title;
    if (pic.kind === 'nba') { const o = pic.table.leagues[pic.us.conf].ordered, i = o.indexOf(o.find(x => x.id === pic.us.id)); rows = o.slice(Math.max(0, i - 3), Math.max(0, i - 3) + 7); title = `${pic.us.conf === 'East' ? 'Eastern' : 'Western'} Conference${pic.fin ? ' (final)' : ''}`; }
    else { rows = pic.scopes[0].rows; title = pic.us.divName; }
    const top = rows[0];
    return `<a class="card snap" href="#/team/${k}/picture" style="border-top:5px solid ${t.primary}"><div class="row between" style="margin-bottom:10px"><h3 style="margin:0;font-size:1.15rem">${esc(title)}</h3><span class="pstrip-mini tone-${pic.tone}">${esc(pic.statusShort)}</span></div>
      <div class="mini">${rows.map(r => `<div class="${r.id === pic.us.id ? 'us' : ''}"><span class="s">${pic.kind === 'nba' ? r.seed : r.divRank}</span><img src="${esc(r.logo)}" alt=""><b>${esc(r.abbr)}</b><span class="rec">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</span><span class="gbx">${fmtGB(gbFrom(pic.kind === 'nba' ? pic.table.leagues[pic.us.conf].ordered[0] : top, r))}</span></div>`).join('')}</div>
      <div class="small" style="margin-top:10px;color:var(--accent);font-weight:700">Playoff picture &amp; every ${pic.kind === 'nba' ? 'conference' : 'division'} ›</div></a>`;
  }).join('');
}
async function homeLeaders(alive) {
  const pick = { mlb: ['homeRuns', 'battingAverage', 'earnedRunAverage', 'strikeouts'], nfl: ['passingYards', 'rushingYards', 'receivingYards', 'sacks'], nba: ['pointsPerGame', 'reboundsPerGame', 'assistsPerGame', 'threePointFieldGoalsMade'] };
  const res = await Promise.all(LEAGUE_KEYS.map(async lg => ({ lg, lists: (await Promise.all(pick[lg].map(k => safe(API.leaderboard(lg, k, null, 5), null)))).filter(l => l && l.rows.length) })));
  if (!alive() || !$('#ldSnap')) return;
  $('#ldSnap').innerHTML = res.map(({ lg, lists }) => lists.length ? `<div class="ldrow"><div class="ldlab"><img src="${teamLogo(TEAMS[LEAGUES[lg].team])}" alt=""><b>${LEAGUES[lg].short}</b><span class="small muted">${esc(lists[0].season)}</span><a class="small" href="#/league/${lg}/leaders">All leaders ›</a></div>
    <div class="ldcards">${lists.map(l => `<button class="ldcard" data-lb="${lg}|${l.key}|"><div class="lh">${esc(l.label)} <span>›</span></div>${l.rows.slice(0, 3).map(r => `<div class="lr ${r.philly ? 'ph' : ''}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.name)} <span class="dim">${esc(r.abbr || '')}</span></span><b>${esc(r.value)}</b></div>`).join('')}</button>`).join('')}</div></div>` : '').join('') || errBox('League leaders are unavailable right now.');
}
