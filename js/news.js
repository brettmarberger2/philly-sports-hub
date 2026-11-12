/* Team news: a "Top news" card on the Overview (lead story + next few) and a full News tab.
   Stories that ESPN tags to this team come first; everything else in the team feed goes under "Around the league". */

const NEWS_KIND = a => (a.type && !/^story$/i.test(a.type) ? a.type : '');

function newsLead(a, t) {
  return `<a class="feature nlead" href="${esc(a.link)}" target="_blank" rel="noopener" style="background-image:url('${esc(a.img || '')}')"><div class="in">
    <span class="badge">${esc([NEWS_KIND(a), ago(a.date)].filter(Boolean).join(' · '))}</span>
    <div class="t">${esc(a.title)}</div>${a.desc ? `<div class="d">${esc(a.desc)}</div>` : ''}</div></a>`;
}
function newsRow(a) {
  return `<a class="news" href="${esc(a.link)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : ''}<div><div class="t">${esc(a.title)}</div>${a.desc ? `<div class="nd small muted">${esc(a.desc)}</div>` : ''}<div class="small muted">${[NEWS_KIND(a) ? `<b class="nk">${esc(NEWS_KIND(a))}</b>` : '', ago(a.date)].filter(Boolean).join(' · ')}</div></div></a>`;
}
/** Team-tagged stories first (newest first), then the rest. */
function newsSplit(list) {
  const byNew = (a, b) => new Date(b.date) - new Date(a.date);
  const mine = list.filter(a => a.tagged).sort(byNew), rest = list.filter(a => !a.tagged).sort(byNew);
  return mine.length ? { top: mine, rest } : { top: [...list].sort(byNew), rest: [] };
}

/** Overview card: the lead story with its picture, then the next three headlines. */
function overviewNews(t, el, list) {
  if (!el) return;
  if (!list?.length) { el.innerHTML = `<h3>Top news</h3>${errBox('No headlines right now.')}`; return; }
  const { top } = newsSplit(list), lead = top.find(a => a.img) || top[0], more = top.filter(a => a !== lead).slice(0, 3);
  el.innerHTML = `<div class="row between"><h3 style="margin:0">Top news</h3><a class="small" href="#/team/${t.key}/news">All ${esc(t.nick)} news ›</a></div>
    <div class="nlead-wrap">${newsLead(lead, t)}</div>${more.map(newsRow).join('')}`;
}

async function tabNews(t, { mount, alive }) {
  const list = await safe(API.news(t, 25), []); if (!alive()) return;
  mount.innerHTML = list.length ? newsTabHtml(t, list) : errBox('No headlines are available right now. Try again in a few minutes.');
}
function newsTabHtml(t, list) {
  const { top, rest } = newsSplit(list), lead = top.find(a => a.img) || top[0], next = top.filter(a => a !== lead);
  return `<div class="split"><div class="stack">
      <div class="card ntop"><h3>Top story</h3>${newsLead(lead, t)}</div>
      ${next.length ? `<div class="card"><h3>More ${esc(t.nick)} news</h3>${next.slice(0, 12).map(newsRow).join('')}</div>` : ''}
    </div><div class="stack">
      ${rest.length ? `<div class="card"><h3>Around the ${t.college ? 'NCAA' : LEAGUES[t.league]?.short || 'league'}</h3>${rest.slice(0, 10).map(newsRow).join('')}</div>` : ''}
      <div class="card"><h3>More coverage</h3><div class="col" style="gap:8px"><a class="btn small" href="${esc(t.official)}" target="_blank" rel="noopener">${esc(t.nick)} official site ↗</a><a class="btn small" href="#/team/${t.key}/injuries">Injury report →</a><a class="btn small" href="#/team/${t.key}/schedule">Schedule &amp; results →</a></div></div>
    </div></div><p class="disc">Headlines from ESPN, newest first, refreshed every few minutes. Stories open on ESPN.</p>`;
}

/* ---------- Home "Top news" + the all-teams News page ---------- */
const teamBadge = k => `<span class="tbadge"><img src="${esc(teamLogo(TEAMS[k]))}" alt="">${esc(TEAMS[k].nick)}</span>`;
/** Newest story per team first (so every team gets a voice), then the rest by date. */
function newsRoundup(lists, keys = LIVE_KEYS) {
  const tops = keys.map((k, i) => newsSplit(lists[i] || []).top), firsts = tops.map(t => t[0]).filter(Boolean);
  const rest = tops.flatMap(t => t.slice(1)).sort((a, b) => new Date(b.date) - new Date(a.date));
  return [...firsts.sort((a, b) => new Date(b.date) - new Date(a.date)), ...rest];
}
function homeNewsHtml(el, lists) {
  if (!el) return;
  const all = newsRoundup(lists);
  if (!all.length) { el.innerHTML = errBox('Headlines are unavailable right now.'); return; }
  const lead = all.find(n => n.img) || all[0], rest = all.filter(n => n !== lead).slice(0, 6);
  el.innerHTML = `<div class="mag">
    <a class="feature" href="${esc(lead.link)}" target="_blank" rel="noopener" style="background-image:url('${esc(lead.img || '')}')"><div class="in"><span class="badge">${esc(TEAMS[lead.team].nick)} · ${ago(lead.date)}</span><div class="t">${esc(lead.title)}</div><div class="d">${esc(lead.desc || '')}</div></div></a>
    <div class="card" style="padding:18px 20px">${rest.map(n => `<a class="news" href="${esc(n.link)}" target="_blank" rel="noopener">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy">` : ''}<div><div class="t">${esc(n.title)}</div><div class="small muted">${teamBadge(n.team)} · ${ago(n.date)}</div></div></a>`).join('')}
      <div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap">${LIVE_KEYS.map(k => `<a class="btn small" href="#/news?team=${k}">${esc(TEAMS[k].nick)} ›</a>`).join('')}</div></div></div>`;
}

async function viewNews({ q, mount, alive }) {
  const pick0 = q.team && TEAMS[q.team] ? q.team : 'all';
  mount.innerHTML = `<div class="hero slim" style="margin-bottom:18px"><div class="tri"><span></span><span></span><span></span></div><h1>News</h1><p class="lede" style="margin:0">The latest on every team, newest first. Stories open on ESPN.</p></div>
    <div class="seg nw-seg" id="nwSeg"><button data-k="all">All teams</button>${LIVE_KEYS.map(k => `<button data-k="${k}"><img src="${esc(teamLogo(TEAMS[k]))}" alt="" width="18" height="18" style="object-fit:contain">${esc(TEAMS[k].nick)}</button>`).join('')}</div>
    <div id="nwBody">${spinner('Loading headlines…')}</div>`;
  const lists = await Promise.all(LIVE_KEYS.map(k => timeout(safe(API.news(TEAMS[k], 25), []), 8000, []))); if (!alive()) return;
  const draw = k => {
    $$('#nwSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    history.replaceState(history.state, '', k === 'all' ? '#/news' : `#/news?team=${k}`); NAV.cur = location.hash;
    const body = $('#nwBody');
    if (k !== 'all') { const t = TEAMS[k], list = lists[LIVE_KEYS.indexOf(k)]; body.innerHTML = list.length ? newsTabHtml(t, list) : errBox('No headlines right now.'); return; }
    body.innerHTML = `<div class="nw-grid">${LIVE_KEYS.map((key, i) => {
      const t = TEAMS[key], { top } = newsSplit(lists[i] || []); if (!top.length) return '';
      const lead = top.find(a => a.img) || top[0], more = top.filter(a => a !== lead).slice(0, 3);
      return `<div class="card nw-team" style="--team:${t.primary}"><div class="row between"><h3 style="margin:0">${teamBadge(key)}</h3><a class="small" href="#/news?team=${key}">More ›</a></div><div class="nlead-wrap">${newsLead(lead, t)}</div>${more.map(newsRow).join('')}</div>`;
    }).join('')}</div>`;
  };
  $('#nwSeg').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) draw(b.dataset.k); });
  draw(pick0);
}
