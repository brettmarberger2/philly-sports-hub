/* Game day: one pop-up with everything for the teams that matter right now.
   Next game (time, TV, line, win chance, injuries, projected starters), last result, standings, headlines. */

const QV_SHORT = { eagles: 'Eagles', sixers: '76ers', iufb: 'IU Football', iubb: 'IU Basketball', phillies: 'Phillies' };
const qvWindow = (rows, id, n = 7) => { if (!rows?.length) return []; const i = Math.max(0, rows.findIndex(r => String(r.id) === String(id))), a = Math.max(0, Math.min(i - 3, rows.length - n)); return rows.slice(a, a + n); };

async function qvPane(t) {
  const [info, gs, pic, news, injr] = await Promise.all([timeout(safe(API.team(t), null), 8000), timeout(safe(API.gameStatus(t), null), 8000), timeout(safe(API.picture(t), null), 8000), timeout(safe(API.news(t, 3), []), 8000, []), timeout(safe(API.injuries(t), null), 8000)]);
  const g = gs?.live || gs?.next, last = gs?.last, lg = t.league;
  let sum = null, depth = null;
  if (g && !t.mlbId) {
    const [, , id] = gameRef(t, g).split('|');
    [sum, depth] = await Promise.all([safe(API.gameSummary('espn', lg, id), null), safe(API.depth({ sport: t.sport, league: lg, espnId: t.espnId }), null)]);
  }
  const ourId = String(t.mlbId || t.espnId);
  const us = sum?.teams?.find(x => x.id === ourId), them = sum?.teams?.find(x => x !== us);
  const injAll = injr?.list || ((sum?.injuries || {})[ourId] || []).filter(i => !/^Active$/i.test(i.status)), inj = injAll.slice(0, 5);
  const win = us && sum?.predict?.[us.id];
  const starters = depthStarters(lg, depth).filter(x => x[1]).slice(0, 10);
  const state = pic?.offseason ? 'Offseason' : g ? (gs.live ? 'Live now' : 'Next up') : 'No game scheduled';

  const game = g ? `<a class="qv-game" href="javascript:void(0)" data-game="${gameRef(t, g)}">
      <div class="qv-lab"><span class="${gs.live ? 'badge live' : 'qv-tag'}">${gs.live ? 'Live' : 'Next up'}</span><span>${esc(g.label || LEAGUES[lg]?.short || '')} · ${gs.live ? `<b>${g.ourScore ?? 0}–${g.oppScore ?? 0}</b> ${esc(g.detail)}` : esc(whenTxt(g.date, g.tbd))}</span></div>
      <div class="qv-vs"><img src="${esc(teamLogo(t))}" alt=""><b>${esc(t.abbr)}</b><span>${g.home ? 'vs' : '@'}</span><img src="${esc(g.opp.logo)}" alt="" onerror="this.style.visibility='hidden'"><b>${esc(g.opp.abbr || g.opp.short)}</b></div>
      <div class="small muted">${esc([g.opp.name, g.venue, g.tv].filter(Boolean).join(' · '))}${gs.live || g.tbd ? '' : ` · <b>${esc(countdown(g.date))}</b>`}</div></a>
    ${sum?.odds || win != null ? `<div class="pvodds qv-odds">${sum.odds ? `<div><span class="muted small">Line${sum.odds.provider ? ` (${esc(sum.odds.provider)})` : ''}</span><b>${esc(sum.odds.details || '—')}</b></div><div><span class="muted small">Over/under</span><b>${esc(sum.odds.ou ?? '—')}</b></div>` : ''}${win != null && them ? `<div class="pvwin"><span class="muted small">ESPN win projection</span><div class="bar"><i style="width:${win}%"></i></div><div class="row between small"><b>${esc(us.abbr)} ${win.toFixed(0)}%</b><b>${esc(them.abbr)} ${(100 - win).toFixed(0)}%</b></div></div>` : ''}</div>` : ''}
    <div class="qv-cols">
      <div><h4 class="qv-h">Injuries${injAll.length ? ` <span class="dim">${injAll.length}</span>` : ''}</h4>${inj.length ? inj.map(i => `<div class="pvrow"><span><b>${esc(i.name)}</b> <span class="dim small">${esc(i.pos)}</span></span><span class="badge ${/out|reserve/i.test(i.status) ? 'bad' : ''}">${esc(i.status)}</span></div>`).join('') + (injAll.length > inj.length ? `<a class="small" href="#/team/${t.key}/injuries">+${injAll.length - inj.length} more · full injury report ›</a>` : `<a class="small" href="#/team/${t.key}/injuries">Full injury report ›</a>`) : '<div class="muted small">None listed.</div>'}</div>
      <div><h4 class="qv-h">Projected starters</h4>${starters.length ? starters.map(([p, n]) => `<div class="pvrow"><span class="muted">${esc(p)}</span><b>${esc(n)}</b></div>`).join('') : '<div class="muted small">Not published yet. Open the full preview for the latest.</div>'}</div></div>
    <a class="btn small primary" style="margin-top:10px" href="javascript:void(0)" data-game="${gameRef(t, g)}">Full preview, lineups &amp; odds ›</a>` : `<div class="qv-game flat"><div class="qv-lab"><span class="qv-tag">${esc(state)}</span></div><div class="muted small">${pic?.offseason ? esc(pic.sub) : 'Nothing on the schedule right now.'}</div></div>`;

  const lastHtml = last ? `<a class="qv-last" href="javascript:void(0)" data-game="${gameRef(t, last)}">${resultChip(last)} <span>${last.home ? 'vs' : '@'} ${esc(last.opp.name)}</span><span class="dim small">${esc(fmtDate(last.date, { month: 'short', day: 'numeric' }))} · box score ›</span></a>` : '';
  const rows = pic ? (pic.college ? qvWindow(pic.scopes[0].rows, ourId) : pic.kind === 'nfl' ? (pic.scopes[0].rows || []) : pic.kind === 'nba' ? qvWindow(pic.scopes[0].rows, ourId) : (pic.scopes[0]?.rows || [])) : [];
  const stand = rows.length ? `<h4 class="qv-h">${pic.college ? esc(t.conf) : pic.kind === 'nba' ? (pic.us.conf === 'East' ? 'Eastern Conference' : 'Western Conference') : esc(shortDiv(pic.us.divName || ''))}</h4><div class="mini qv-mini">${rows.map((r, i) => `<div class="${String(r.id) === ourId ? 'us' : ''}"><span class="s">${pic.kind === 'nba' ? (r.seed ?? i + 1) : (r.divRank ?? i + 1)}</span><img src="${esc(r.logo)}" alt="" onerror="this.style.visibility='hidden'"><b>${esc(r.abbr)}</b><span class="rec">${r.w}-${r.l}${r.t ? '-' + r.t : ''}</span></div>`).join('')}</div>` : '';
  const newsHtml = news?.length ? `<h4 class="qv-h">Headlines</h4>${news.map(a => `<a class="news" href="${esc(a.link)}" target="_blank" rel="noopener"><div><div class="t">${esc(a.title)}</div><div class="small muted">${ago(a.date)}</div></div></a>`).join('')}` : '';
  const status = pic ? `<div class="qv-status tone-${pic.tone}"><b>${esc(pic.headline)}</b><span>${esc(pic.sub)}</span></div>` : '';

  return `<div class="qv-team" style="--team:${t.primary}"><img src="${esc(teamLogoOn(t))}" alt=""><div><div class="nm">${esc(t.name)}</div><div class="small">${esc(info?.standingSummary || state)}</div></div><div class="rc">${info && (info.w + info.l + info.tie) > 0 ? esc(info.summary) : '—'}<small>Record</small></div></div>
    ${status}${game}${lastHtml}${stand}${newsHtml}
    <div class="row" style="margin-top:14px"><a class="btn small" href="#/team/${t.key}">Team page →</a><a class="btn small" href="#/team/${t.key}/schedule">Full schedule →</a>${t.college ? `<a class="btn small" href="#/team/${t.key}/picture">Rankings →</a>` : ''}</div>`;
}

async function openQuickView(startKey) {
  openModal(`<div class="qv-head"><div class="small" style="opacity:.8;letter-spacing:.12em;text-transform:uppercase">${esc(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</div><h2>⚡ Game day</h2></div>
    <div class="pl-body qv"><div class="seg qv-seg" id="qvSeg">${LIVE_KEYS.map(k => `<button data-k="${k}"><img src="${esc(teamLogo(TEAMS[k]))}" alt="">${esc(QV_SHORT[k])}${k === 'phillies' ? ' <span class="dim small">offseason</span>' : ''}</button>`).join('')}</div><div id="qvBox">${spinner('Checking the schedule…')}</div></div>`);
  let pick = startKey;
  if (!pick) {
    const gss = await Promise.all(FOCUS_KEYS.map(k => safe(API.gameStatus(TEAMS[k]), null)));
    const live = FOCUS_KEYS.find((k, i) => gss[i]?.live);
    pick = live || FOCUS_KEYS.map((k, i) => ({ k, ts: gss[i]?.next?.ts ?? Infinity })).sort((a, b) => a.ts - b.ts)[0].k;
  }
  if (!$('#qvBox')) return;
  const draw = async k => {
    $$('#qvSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const box = $('#qvBox'); box.innerHTML = spinner('Loading…'); box.dataset.k = k;
    const html = await safe(qvPane(TEAMS[k]), null);
    if (!$('#qvBox') || $('#qvBox').dataset.k !== k) return;
    $('#qvBox').innerHTML = html || errBox('Could not load this team right now.');
    fillPreviewLines($('#qvBox'));
  };
  $('#qvSeg').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) draw(b.dataset.k); });
  draw(pick);
}

document.addEventListener('click', e => { const b = e.target.closest('[data-qv]'); if (!b) return; e.preventDefault(); setMenu?.(false); openQuickView(b.dataset.qv || undefined); });
document.addEventListener('keydown', e => { if (e.key !== 'g' || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; if (!$('#modalBack').classList.contains('open')) openQuickView(); });
