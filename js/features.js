/* Shared features: bio + moment modals, player-stats panel, grouped roster, timeline rails, year-context axis */
const TEAM_HEX = { eagles: '#004C54', phillies: '#E81828', sixers: '#006BB6' };

/* ---------- global click handlers ---------- */
document.addEventListener('click', e => {
  const lg = e.target.closest('[data-legend]');
  if (lg) { e.preventDefault(); openLegend(lg.dataset.team, lg.dataset.legend); return; }
  const jp = e.target.closest('[data-jump]');
  if (jp) { e.preventDefault(); const el = document.getElementById(jp.dataset.jump); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (innerWidth <= 960 ? 12 : 70)); return; }
  const mo = e.target.closest('[data-moment]');
  if (mo) { e.preventDefault(); openMoment(mo.dataset.team, +mo.dataset.year); return; }
});

/* ---------- tenure helper ---------- */
function eraRange(era) {
  const toks = String(era || '').match(/\d{2,4}/g); if (!toks) return null;
  let prev = null;
  const ys = toks.map(tk => { let y = +tk; if (tk.length === 2 && prev) { y = Math.floor(prev / 100) * 100 + y; if (y < prev) y += 100; } prev = y; return y; });
  return { start: ys[0], end: /-\s*$/.test(String(era).trim()) ? new Date().getFullYear() : ys[ys.length - 1] };
}

/* ---------- Legend / retired-number bio ---------- */
async function openLegend(teamKey, name) {
  const t = TEAMS[teamKey];
  const l = (CUR.legends[teamKey] || []).find(x => x.name === name), r = (CUR.retired[teamKey] || []).find(x => x.name === name);
  const num = l?.n || r?.n || '', era = l?.era || r?.years || '', pos = l?.pos || '', bio = l?.bio || '';
  const rng = eraRange(era);
  const titles = rng ? H.titles(teamKey).filter(s => s.year >= rng.start && s.year <= rng.end) : [];
  const title = CUR.wikiTitle?.[name] || name.replace(/ /g, '_');
  const body = wiki => `
    <div class="pl-head"><div style="font-family:var(--display);font-size:5rem;font-weight:800;line-height:1;opacity:.35;min-width:90px;text-align:center">${num ? '#' + esc(num) : '★'}</div>
      <div><div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(t.nick)}${pos ? ' · ' + esc(pos) : ''}${era ? ' · ' + esc(era) : ''}</div><h2>${esc(name)}</h2>
      ${r ? `<span class="badge gold">Number retired</span>` : ''}</div></div>
    <div class="pl-body">
      ${bio ? `<p class="story" style="margin-bottom:16px">${esc(bio)}</p>` : ''}
      ${titles.length ? `<h4>Championships during their time with the club</h4><div class="row" style="gap:8px;margin-bottom:16px">${titles.map(s => `<button class="badge gold" style="border:0;cursor:pointer" data-moment data-team="${teamKey}" data-year="${s.year}">🏆 ${esc(H.label(t, s))} · ${esc(H.champ(t, s.year)?.game || 'Champions')}</button>`).join('')}</div>` : ''}
      ${wiki === undefined ? spinner('Loading biography…') : wiki ? `<h4>Biography</h4><div class="wikibox">${wiki.thumbnail?.source ? `<img src="${esc(wiki.thumbnail.source)}" alt="${esc(name)}">` : ''}<div><p style="margin:0 0 10px">${esc(wiki.extract)}</p><a href="${esc(wiki.content_urls?.desktop?.page || '#')}" target="_blank" rel="noopener">Read the full biography on Wikipedia ↗</a></div></div>` : ''}
      <p class="disc">Biography text from Wikipedia (CC BY-SA). Franchise notes are hand-written.</p>
    </div>`;
  openModal(body(undefined));
  const wiki = await safe(getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 604800), null);
  if (!$('#modalBack').classList.contains('open')) return;
  openModal(body(wiki && wiki.type !== 'disambiguation' && wiki.extract ? wiki : null));
}

/* ---------- "What happened" moment modal ---------- */
function openMoment(teamKey, year) {
  const t = TEAMS[teamKey], s = H.find(teamKey, year), n = H.notes(teamKey, year), c = H.champ(t, year);
  const label = s ? H.label(t, s) : String(year);
  openModal(`
    <div class="pl-head" style="--team:${TEAM_HEX[teamKey]}"><img src="${teamLogoOn(t)}" alt="" style="width:90px;height:90px;object-fit:contain;background:none"><div>
      <div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(label)} ${esc(t.nick)}</div><h2>${esc(n?.t || (s ? H.outcome(s) : 'Season'))}</h2>
      ${s ? `<div class="row" style="gap:6px"><span class="badge" style="background:#ffffff26;color:#fff">${H.record(t, s)}</span>${s.result === 'champion' ? `<span class="badge gold">🏆 ${esc(c?.game || 'Champions')}</span>` : `<span class="badge" style="background:#ffffff26;color:#fff">${esc(H.outcome(s))}</span>`}</div>` : ''}</div></div>
    <div class="pl-body">
      ${n ? `<p class="story">${esc(n.s)}</p>${(n.f || []).map(f => `<div class="fact">${esc(f)}</div>`).join('')}` : ''}
      ${s ? `<p class="${n ? 'muted' : 'story'}">${H.autoStory(t, s)}</p>` : ''}
      ${s?.post?.length ? `<h4 style="margin-top:14px">Postseason path</h4>${H.path(s).map(p => `<div class="pathrow">${esc(p)}</div>`).join('')}` : ''}
      ${s?.awards?.length ? `<h4 style="margin-top:14px">Awards</h4><p>${s.awards.map(esc).join(' · ')}</p>` : ''}
      <div class="row" style="margin-top:18px"><a class="btn primary" style="--team:${TEAM_HEX[teamKey]}" href="#/season/${teamKey}/${year}">Full ${esc(label)} season page →</a><a class="btn" href="#/year/${year}">Everything from ${year}</a></div>
    </div>`);
}

/* ---------- Roster grouped by unit and position ---------- */
const POS_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OT', 'OG', 'G', 'T', 'OL', 'DE', 'DT', 'NT', 'DL', 'EDGE', 'OLB', 'ILB', 'MLB', 'LB', 'CB', 'FS', 'SS', 'S', 'DB', 'K', 'PK', 'P', 'LS', 'SP', 'RP', 'CL', '1B', '2B', '3B', 'LF', 'CF', 'RF', 'DH', 'PG', 'SG', 'SF', 'PF', 'F'];
const posRank = p => { const i = POS_ORDER.indexOf(p); return i < 0 ? 99 : i; };
function playerCard(t, p) {
  return `<div class="pcard" data-player="${p.id}" data-team="${t.key}" data-name="${esc(p.name)}"><div class="ph"><span class="no">${esc(p.jersey)}</span><img src="${esc(p.headshot)}" alt="" loading="lazy" onerror="this.style.display='none'">${p.injuries.length ? `<span class="badge bad st">${esc(p.injuries[0].status)}</span>` : ''}</div><div class="pi"><b>${esc(p.name)}</b><span>${esc(p.pos)}${p.height ? ' · ' + esc(p.height) : ''}${p.age ? ' · ' + p.age + ' yrs' : ''}</span>${t.league !== 'mlb' && p.salary ? `<span style="display:block;margin-top:2px;color:var(--text);font-weight:700">${money(p.salary)}</span>` : ''}</div></div>`;
}
function groupedRosterHtml(t, players) {
  if (!players.length) return errBox('No players match.');
  const groups = uniq(players.map(p => p.group));
  return groups.map(g => {
    const gp = players.filter(p => p.group === g), positions = uniq(gp.map(p => p.pos)).sort((a, b) => posRank(a) - posRank(b) || a.localeCompare(b));
    return `${groups.length > 1 ? `<h3 class="grp">${esc(g)}<span>${gp.length} players</span></h3>` : ''}` + positions.map(pos => {
      const pl = gp.filter(p => p.pos === pos).sort((a, b) => (a.jersey === '' ? 999 : +a.jersey) - (b.jersey === '' ? 999 : +b.jersey));
      return `<div class="poshead"><b>${esc(pos || '—')}</b> ${esc(pl[0].posName || '')} · ${pl.length}</div><div class="pcards">${pl.map(p => playerCard(t, p)).join('')}</div>`;
    }).join('');
  }).join('');
}

/* ---------- Player stats panel (tabs + sortable table, every name clickable) ---------- */
async function playerStatsPanel(t, year, el) {
  el.innerHTML = spinner('Loading player stats…');
  const [res, roster] = await Promise.all([API.teamPlayerStats(t, year), year == null ? safe(API.roster(t)) : Promise.resolve(null)]);
  if (!res.tables.length) { el.innerHTML = errBox('Player stats are not available for this season.'); return; }
  const rmap = new Map((roster?.players || []).map(p => [p.name.toLowerCase(), p.id]));
  const uid = 'ps' + Math.random().toString(36).slice(2, 7);
  let idx = 0;
  const nameCell = r => {
    const pid = r.id || (r.mlbId && rmap.get(r.name.toLowerCase()));
    if (pid) return `<a href="javascript:void(0)" data-player="${pid}" data-team="${t.key}" data-name="${esc(r.name)}"><b>${esc(r.name)}</b></a>`;
    if (r.mlbId) return `<a href="https://www.mlb.com/player/${r.mlbId}" target="_blank" rel="noopener"><b>${esc(r.name)}</b> ↗</a>`;
    return `<b>${esc(r.name)}</b>`;
  };
  const draw = () => {
    const tb = res.tables[idx];
    const single = tb.cols.length === 1;
    const cols = [
      ...(single ? [{ key: '_i', label: '#', num: true, fmt: r => r._i }] : []),
      { key: 'name', label: 'Player', fmt: nameCell }, { key: 'pos', label: 'Pos', cls: 'muted' },
      ...tb.cols.map(c => ({ key: c, label: c, num: !single, sortVal: r => { const n = parseFloat(String(r[c]).replace(/,/g, '')); return isNaN(n) ? -1 : n; }, fmt: r => esc(r[c] ?? '') })),
    ];
    const rows = tb.rows.map((r, i) => ({ _i: i + 1, name: r.name, id: r.id, mlbId: r.mlbId, pos: r.pos, ...r.v }));
    $(`#${uid}-t`).innerHTML = renderTable(`${uid}-${tb.key}`, cols, rows, single ? {} : { sortKey: tb.sortKey, sortDir: -1 });
  };
  el.innerHTML = `<div class="pstat-tabs"><div class="chips" id="${uid}-c">${res.tables.map((tb, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-i="${i}">${esc(tb.name)} <span class="dim">${tb.rows.length}</span></button>`).join('')}</div></div><div id="${uid}-t"></div>
    <p class="disc">${t.league === 'nfl' ? 'Top performers in each category for the season, from ESPN. ' : ''}Click any player for career stats and bio. Column headers sort the table.</p>`;
  $(`#${uid}-c`).addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; idx = +b.dataset.i; $$(`#${uid}-c .chip`).forEach(c => c.classList.toggle('on', c === b)); draw(); });
  draw();
}

/** "Stars of the season" tiles (clickable). */
async function starsHtml(t, year) {
  const [lead, roster] = await Promise.all([safe(API.leaders(t, year), []), year == null ? safe(API.roster(t)) : Promise.resolve(null)]);
  if (!lead?.length) return '<div class="muted small">No season leaders on file.</div>';
  const rmap = new Map((roster?.players || []).map(p => [p.name.toLowerCase(), p.id]));
  return `<div class="stars">${lead.map(x => {
    const pid = x.id || (x.mlbId && rmap.get(x.name.toLowerCase()));
    const inner = `<img src="${esc(x.headshot)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><div class="v">${esc(x.value)}</div><div class="c">${esc(x.cat)}</div><div class="n">${esc(x.name)}</div></div>`;
    return pid ? `<button class="star" data-player="${pid}" data-team="${t.key}" data-name="${esc(x.name)}">${inner}</button>` : x.mlbId ? `<a class="star" href="https://www.mlb.com/player/${x.mlbId}" target="_blank" rel="noopener" style="color:inherit">${inner}</a>` : `<div class="star">${inner}</div>`;
  }).join('')}</div>`;
}

/* ---------- Timeline rail (key years stick out; click any year for detail) ---------- */
function tlDetailHtml(key, year) {
  const t = TEAMS[key], s = H.find(key, year); if (!s) return '';
  const n = H.notes(key, year), c = H.champ(t, year), label = H.label(t, s);
  return `<div class="cols"><div><h3>${esc(label)} ${esc(t.nick)}${n ? ` — ${esc(n.t)}` : ''}</h3>
      <div class="row" style="gap:6px;margin-bottom:10px"><span class="badge team">${H.record(t, s)}</span>${s.result === 'champion' ? `<span class="badge gold">🏆 ${esc(c?.game || 'Champions')}</span>` : s.result !== 'none' ? `<span class="badge good">${esc(H.outcome(s))}</span>` : '<span class="badge">Missed playoffs</span>'}${s.divWin ? '<span class="badge">Division champs</span>' : ''}</div>
      <p class="${n ? '' : 'muted'}" style="margin-bottom:8px">${n ? esc(n.s) : H.autoStory(t, s)}</p>
      ${(n?.f || []).map(f => `<div class="fact">${esc(f)}</div>`).join('')}
    </div><div>
      <dl class="kv" style="grid-template-columns:96px 1fr"><dt>${t.league === 'mlb' ? 'Manager' : 'Coach'}</dt><dd>${esc(s.coaches.join(' & ') || '—')}</dd><dt>Finish</dt><dd>${esc(s.finish || '—')}${s.div ? ' · ' + esc(s.div) : ''}</dd>${s.awards.length ? `<dt>Awards</dt><dd>${s.awards.map(esc).join('<br>')}</dd>` : ''}${s.post.length ? `<dt>Postseason</dt><dd>${H.path(s).map(esc).join('<br>')}</dd>` : ''}</dl>
      <div class="row" style="margin-top:14px"><a class="btn small primary" style="--team:${TEAM_HEX[key]}" href="#/season/${key}/${year}">Full season page →</a><a class="btn small" href="#/year/${year}">All teams in ${year}</a></div>
    </div></div>`;
}

function timelineCardHtml(key) {
  const t = TEAMS[key], ss = H.seasons(key), notes = CUR.notes[key] || {};
  const W = 20, LAB = 44, minY = ss[0].year, maxY = ss.at(-1).year, xOf = y => (y - minY) * W + W / 2 + 10, width = (maxY - minY + 1) * W + 20;
  const place = (list, levels, minGap) => { const last = Array(levels).fill(-1e9); return list.map(s => { const x = xOf(s.year); let lv = last.findIndex(v => x - v >= minGap); if (lv < 0) lv = last.indexOf(Math.min(...last)); last[lv] = x; return { s, x, lv }; }); };
  const shortRes = s => { const g = H.champ(t, s.year)?.game || ''; if (s.result === 'champion') return g.replace('NFL Championship', 'NFL Champs').replace('NBA Finals', 'NBA Champs').replace('World Series', 'World Series'); const o = H.outcome(s); return o.replace(/^Lost /, 'Lost ').slice(0, 22); };
  const above = place(ss.filter(s => s.result === 'champion'), 3, 96), below = place(ss.filter(s => s.result !== 'champion' && (s.result === 'finalist' || notes[s.year])), 2, 104);
  const maxA = above.length ? Math.max(...above.map(a => a.lv)) : -1, maxB = below.length ? Math.max(...below.map(b => b.lv)) : -1;
  const BASE = 34 + LAB + 20 + Math.max(0, maxA) * (LAB + 8), HEIGHT = BASE + 44 + (maxB + 1) * (LAB + 8) + 26;
  const pinsA = above.map(({ s, x, lv }) => { const top = BASE - 34 - LAB - lv * (LAB + 8); return `<button class="pin champion" data-y="${s.year}" style="left:${x}px;top:${top}px"><span class="lab"><b>${esc(H.label(t, s))}</b>${esc(shortRes(s))}</span><span class="stem" style="height:${BASE - 8 - (top + LAB)}px"></span></button>`; }).join('');
  const pinsB = below.map(({ s, x, lv }) => { const stem = 26 + lv * (LAB + 8); const sub = s.result === 'finalist' ? shortRes(s) : (notes[s.year]?.t || '').slice(0, 24); return `<button class="pin ${s.result === 'finalist' ? 'finalist' : 'moment'}" data-y="${s.year}" style="left:${x}px;top:${BASE + 8}px"><span class="stem" style="height:${stem}px"></span><span class="lab"><b>${esc(H.label(t, s))}</b>${esc(sub)}</span></button>`; }).join('');
  const ticks = ss.map(s => `<button class="tick ${s.result}" data-y="${s.year}" title="${esc(H.label(t, s))}: ${H.record(t, s)} · ${esc(H.outcome(s))}" style="left:${xOf(s.year)}px;top:${BASE - (s.result === 'champion' ? 8 : 6)}px"></button>`).join('');
  const decs = ss.filter(s => s.year % 10 === 0).map(s => `<span class="dec" style="left:${xOf(s.year)}px;top:${BASE + 14}px">${s.year}</span>`).join('');
  return `<div class="card tlcard" data-tl="${key}"><div class="hd"><img src="${teamLogo(t)}" alt=""><h3>${esc(t.nick)}</h3><span class="badge gold">${H.titles(key).length} titles</span><span class="muted small">${minY}–${maxY}</span></div>
    <div class="tlhint">Scroll sideways. Gold = champions, orange = lost the finals, green = made the playoffs. Click any dot or label.</div>
    <div class="railwrap"><div class="rail" style="width:${width}px;height:${HEIGHT}px"><div class="base" style="top:${BASE - 1.5}px"></div>${decs}${ticks}${pinsA}${pinsB}</div></div>
    <div class="tldetail" id="tld-${key}"></div></div>`;
}
function wireTimelines(root) {
  $$('.tlcard[data-tl]', root).forEach(card => {
    const key = card.dataset.tl, panel = $('.tldetail', card), wrap = $('.railwrap', card);
    const select = y => { $$('.sel', card).forEach(e => e.classList.remove('sel')); $$(`[data-y="${y}"]`, card).forEach(e => e.classList.add('sel')); panel.innerHTML = tlDetailHtml(key, y); };
    card.addEventListener('click', e => { const b = e.target.closest('[data-y]'); if (b) select(+b.dataset.y); });
    const latest = H.titles(key).slice(-1)[0] || H.seasons(key).slice(-1)[0];
    select(latest.year);
    const sel = $('.tick.sel', card); if (sel) wrap.scrollLeft = Math.max(0, sel.offsetLeft - wrap.clientWidth / 2);
  });
}

/* ---------- Where does this year sit in time? ---------- */
function yearContextHtml(year) {
  const yr = H.years(), cur = new Date().getFullYear(), min = yr.min, max = cur, pctX = y => ((y - min) / (max - min)) * 100;
  const all = TEAM_KEYS.flatMap(k => H.titles(k).map(s => ({ k, year: s.year, s }))).sort((a, b) => a.year - b.year);
  const prev = [...all].reverse().find(x => x.year < year), next = all.find(x => x.year > year), here = all.filter(x => x.year === year);
  const ago = year === cur ? 'the current season' : year < cur ? `${cur - year} years ago` : 'next season';
  const mk = all.map(x => `<button class="mk" data-moment data-team="${x.k}" data-year="${x.year}" title="${x.year} ${TEAMS[x.k].nick}: ${esc(H.champ(TEAMS[x.k], x.year)?.game || 'Champions')}" style="left:${pctX(x.year)}%;background:${TEAM_HEX[x.k]}"></button>`).join('');
  const lbls = [];
  for (let y = 1900; y <= max; y += 20) lbls.push(`<span class="lbl" style="left:${pctX(y)}%">${y}</span>`);
  return `<div class="ctx"><div class="row between" style="gap:10px"><div><b style="font-size:1.05rem">${year} was ${ago}.</b><div class="muted small">Dots are Philadelphia championships. Click one to read about it.</div></div>
      <div class="legend" style="margin:0">${TEAM_KEYS.map(k => `<span><i style="background:${TEAM_HEX[k]};border-radius:50%"></i>${TEAMS[k].nick}</span>`).join('')}</div></div>
    <div class="axis"><div class="line"></div>${lbls.join('')}${mk}<div class="cur" style="left:${pctX(Math.min(max, Math.max(min, year)))}%"><span>${year}</span></div></div>
    <div class="row small muted" style="gap:20px">${prev ? `<span>◀ Previous Philly title: <a href="javascript:void(0)" data-moment data-team="${prev.k}" data-year="${prev.year}"><b>${prev.year} ${TEAMS[prev.k].nick}</b></a> (${year - prev.year} yrs earlier)</span>` : '<span>No Philly title before this year.</span>'}${here.length ? `<span>🏆 This year: ${here.map(x => `<a href="javascript:void(0)" data-moment data-team="${x.k}" data-year="${x.year}"><b>${TEAMS[x.k].nick}</b></a>`).join(', ')}</span>` : ''}${next ? `<span>Next Philly title: <a href="javascript:void(0)" data-moment data-team="${next.k}" data-year="${next.year}"><b>${next.year} ${TEAMS[next.k].nick}</b></a> (${next.year - year} yrs later) ▶</span>` : ''}</div></div>`;
}
