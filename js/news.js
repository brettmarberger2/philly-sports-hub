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
  if (!list.length) { mount.innerHTML = errBox('No headlines are available right now. Try again in a few minutes.'); return; }
  const { top, rest } = newsSplit(list), lead = top.find(a => a.img) || top[0], next = top.filter(a => a !== lead);
  mount.innerHTML = `<div class="split"><div class="stack">
      <div class="card ntop"><h3>Top story</h3>${newsLead(lead, t)}</div>
      ${next.length ? `<div class="card"><h3>More ${esc(t.nick)} news</h3>${next.slice(0, 12).map(newsRow).join('')}</div>` : ''}
    </div><div class="stack">
      ${rest.length ? `<div class="card"><h3>Around the ${t.college ? 'NCAA' : LEAGUES[t.league]?.short || 'league'}</h3>${rest.slice(0, 10).map(newsRow).join('')}</div>` : ''}
      <div class="card"><h3>More coverage</h3><div class="col" style="gap:8px"><a class="btn small" href="${esc(t.official)}" target="_blank" rel="noopener">${esc(t.nick)} official site ↗</a><a class="btn small" href="#/team/${t.key}/injuries">Injury report →</a><a class="btn small" href="#/team/${t.key}/schedule">Schedule &amp; results →</a></div></div>
    </div></div><p class="disc">Headlines from ESPN, newest first, refreshed every few minutes. Stories open on ESPN.</p>`;
}
