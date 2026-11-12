/* Router + shell */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { parts, q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
const link = (path, q) => `#/${path}${q ? '?' + new URLSearchParams(q) : ''}`;

function setTheme(key) {
  const r = document.documentElement, t = TEAMS[key];
  if (t) { r.style.setProperty('--team', t.primary); r.style.setProperty('--team2', t.primary); r.style.setProperty('--accent', t.accent); r.dataset.team = key; }
  else { r.style.removeProperty('--team'); r.style.removeProperty('--team2'); r.style.removeProperty('--accent'); delete r.dataset.team; }
}

const NAV_LABEL = { eagles: 'Eagles', sixers: '76ers', iufb: 'IU Football', iubb: 'IU Basketball', phillies: 'Phillies' };
const MORE_ITEMS = [['history', '📜 History'], ['year', '🗓️ Year Explorer'], ['stadiums', '🏟️ Stadiums'], ['shop', '🛍️ Shop']];
function renderNav(activeKey) {
  const isAct = p => activeKey === p || (p && activeKey.startsWith(p) && p !== '');
  const moreOn = MORE_ITEMS.some(([p]) => isAct(p));
  $('#mmenu').innerHTML = `<div class="mh">Teams</div><div class="mgrid">${LIVE_KEYS.map(k => `<a href="#/team/${k}" class="${isAct('team/' + k) ? 'active' : ''}"><img src="${teamLogo(TEAMS[k])}" alt="">${NAV_LABEL[k]}</a>`).join('')}</div><div class="mh">Explore</div><div class="mgrid"><a href="#/" class="${activeKey === '' ? 'active' : ''}">🏠 Home</a><a href="javascript:void(0)" data-qv class="hot">⚡ Game day</a><a href="#/news" class="${isAct('news') ? 'active' : ''}">📰 News</a><a href="#/leagues" class="${isAct('leagues') ? 'active' : ''}">📊 Leagues</a>${MORE_ITEMS.map(([p, l]) => `<a href="#/${p}" class="${isAct(p) ? 'active' : ''}">${l}</a>`).join('')}</div>`;
  $('#nav').innerHTML = `<a href="#/" class="${activeKey === '' ? 'active' : ''}">Home</a>
    <span class="sep"></span>${LIVE_KEYS.map(k => `<a href="#/team/${k}" class="${isAct('team/' + k) ? 'active' : ''}"><img src="${teamLogo(TEAMS[k])}" alt=""><span class="nl">${NAV_LABEL[k]}</span><span class="ns">${NAV_SHORT[k] || NAV_LABEL[k]}</span></a>`).join('')}
    <span class="sep"></span><a href="#/news" class="${isAct('news') ? 'active' : ''}">News</a><a href="#/leagues" class="${isAct('leagues') ? 'active' : ''}">Leagues</a><button type="button" class="morebtn ${moreOn ? 'active' : ''}" id="moreBtn" aria-haspopup="true" aria-expanded="false">More ▾</button>`;
  $('#moreMenu').innerHTML = MORE_ITEMS.map(([p, l]) => `<a href="#/${p}" class="${isAct(p) ? 'active' : ''}">${l}</a>`).join('');
}
/* "More" menu is a fixed-position popover so the scrolling nav bar can't clip it. */
function setMore(open) {
  const m = $('#moreMenu'), b = $('#moreBtn'); if (!m || !b) return;
  m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { const r = b.getBoundingClientRect(); m.style.top = `${r.bottom + 6}px`; m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 200))}px`; }
}
document.addEventListener('click', e => { if (e.target.closest('#moreBtn')) setMore($('#moreMenu').hidden); else if (!$('#moreMenu').hidden) setMore(false); });

/* ---------- Live score ticker (all pages) ---------- */
const NAV_SHORT = { iufb: 'IU FB', iubb: 'IU BB' };
function tickerItem(t, rg) {
  if (!rg) return '';
  const res = g => `<span class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'loss' : ''}">${g.result} ${g.ourScore}–${g.oppScore}</span> ${g.home ? 'vs' : '@'} ${esc(g.opp.abbr || g.opp.short)}`;
  const recent = [...rg.list].reverse();            // newest first
  const first = rg.live ? `<span class="badge live" style="padding:1px 7px">Live</span> ${rg.live.ourScore ?? 0}–${rg.live.oppScore ?? 0} ${rg.live.home ? 'vs' : '@'} ${esc(rg.live.opp.abbr || rg.live.opp.short)} <span class="lab">${esc(rg.live.detail)}</span>` : recent[0] ? `${res(recent[0])}` : 'No games yet';
  const second = rg.live ? (recent[0] ? `Last: ${res(recent[0])}` : '') : recent[0] ? `${esc(fmtDate(recent[0].date, { month: 'short', day: 'numeric' }))}${recent[1] ? ` · Prev: ${res(recent[1])}` : ''}` : '';
  const tg = rg.live || recent[0];
  return `<a class="tk" href="${tg ? 'javascript:void(0)' : '#/team/' + t.key + '/schedule'}" ${tg ? `data-game="${gameRef(t, tg)}"` : ''}><img src="${teamLogo(t)}" alt=""><div><div class="l1"><span>${esc(NAV_SHORT[t.key] || t.nick)}</span> ${first}</div>${second ? `<div class="l2">${second}</div>` : ''}</div></a>`;
}
async function renderTicker() {
  const res = await Promise.all(FOCUS_KEYS.map(async k => ({ t: TEAMS[k], rg: await safe(API.recentGames(TEAMS[k], 2), null) })));
  // Live games first, then whoever played most recently.
  const lastTs = r => (r.rg?.list?.length ? new Date(r.rg.list[r.rg.list.length - 1].date).getTime() : 0);
  res.sort((a, b) => (b.rg?.live ? 1 : 0) - (a.rg?.live ? 1 : 0) || lastTs(b) - lastTs(a));
  $('#ticker .ticker-inner').innerHTML = `<div class="ticker-label"><span class="livedot"></span> Latest</div>${res.map(r => tickerItem(r.t, r.rg)).join('')}`;
}


function setMenu(open) { const m = $('#mmenu'); if (!m) return; m.hidden = !open; $('#menuBtn').setAttribute('aria-expanded', open ? 'true' : 'false'); $('#menuBtn').textContent = open ? '✕' : '☰'; }
$('#menuBtn').addEventListener('click', () => setMenu($('#mmenu').hidden));

async function route() {
  App.clearTimers();
  const my = ++App.token;
  const { parts, q } = parseHash();
  const view = $('#view');
  const head = parts[0] || '';
  let activeKey = head;
  if (head === 'team' || head === 'season') activeKey = `team/${parts[1]}`;
  if (head === 'season') activeKey = 'history';
  if (head === 'league') activeKey = 'leagues';
  if (head === 'legend') activeKey = '';
  renderNav(activeKey); renderBottomNav(activeKey); renderCrumbs(parts);
  const restoreY = NAV.before(location.hash || '#/');
  setTheme(head === 'team' || head === 'season' ? parts[1] : head === 'league' && LEAGUES[parts[1]] ? LEAGUES[parts[1]].team : head === 'playoffs' ? 'phillies' : null);
  closeModal();
  setMenu(false);
  const prev = App.cur; App.cur = { head, key: parts[1] };
  const sameTeam = head === 'team' && prev && prev.head === 'team' && prev.key === parts[1] && $('#tabBody');
  if (!sameTeam) { if (!restoreY) window.scrollTo(0, 0); view.innerHTML = spinner(); }
  try {
    let fn;
    if (!head) fn = viewHome;
    else if (head === 'team' && TEAMS[parts[1]]) fn = viewTeam;
    else if (head === 'history') fn = viewHistoryHub;
    else if (head === 'playoffs') fn = viewPlayoffs;
    else if (head === 'news') fn = viewNews;
    else if (head === 'leagues') fn = viewLeagues;
    else if (head === 'league' && LEAGUES[parts[1]]) fn = viewLeague;
    else if (head === 'year') fn = viewYear;
    else if (head === 'season' && TEAMS[parts[1]]) fn = viewSeason;
    else if (head === 'stadiums') fn = viewStadiums;
    else if (head === 'shop') fn = viewShop;
    else if (head === 'about') fn = viewAbout;
    else { view.innerHTML = `<div class="card center"><h2>Page not found</h2><a class="btn" href="#/">Back home</a></div>`; return; }
    document.title = ({ '': 'My Sports Hub', team: `${TEAMS[parts[1]]?.nick || ''} · My Sports Hub`, history: 'History · My Sports Hub', playoffs: 'MLB Playoffs · My Sports Hub', news: 'News · My Sports Hub', leagues: 'Leagues · My Sports Hub', league: `${LEAGUES[parts[1]]?.short || ''} Standings · My Sports Hub`, year: 'Year Explorer · My Sports Hub', season: 'Season · My Sports Hub', stadiums: 'Stadiums · My Sports Hub', shop: 'Shop · My Sports Hub' })[head] || 'My Sports Hub';
    await fn({ parts, q, mount: view, token: my, alive: () => my === App.token });
    NAV.after(restoreY, () => my === App.token);
  } catch (e) {
    console.error(e);
    if (my === App.token) view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back home</a></div>`;
  }
}

/* ---------- Modal ----------
   Pop-ups stack: opening one from inside another (box score → player, leaderboard → player, Game day → preview)
   keeps the one underneath, so Back (phone button, ‹ in the pop-up, or Escape) returns to it instead of closing everything.
   Each layer is its own history entry; MODAL.ctx holds a layer's live handlers (its segmented-control draw function). */
const MODAL = { stack: [], ctx: {} };
const modalChrome = depth => `<button class="iconbtn x" data-close="all" aria-label="Close">✕</button>${depth ? '<button class="iconbtn mback" data-close aria-label="Back">‹</button>' : ''}`;
function openModal(html) {
  const back = $('#modalBack'), open = back.classList.contains('open');
  if (open) MODAL.stack.push({ html: $('#modal').innerHTML, y: back.scrollTop, ctx: MODAL.ctx }); else MODAL.stack = [];
  MODAL.ctx = {};
  history.pushState({ modal: true, depth: MODAL.stack.length }, '', location.href);
  $('#modal').innerHTML = modalChrome(MODAL.stack.length) + html;
  back.classList.add('open'); back.scrollTop = 0; document.body.style.overflow = 'hidden';
}
/** Swap the open pop-up's content in place (loading → loaded, live refresh) without adding a layer. */
function updateModal(html) {
  if (!$('#modalBack').classList.contains('open')) return openModal(html);
  $('#modal').innerHTML = modalChrome(MODAL.stack.length) + html;
}
function closeModal() { $('#modalBack').classList.remove('open'); document.body.style.overflow = ''; MODAL.stack = []; MODAL.ctx = {}; }
/** Bring back the layer at `depth` (0 = the first pop-up), dropping everything above it. */
function restoreModal(depth) {
  if (depth >= MODAL.stack.length) return;
  MODAL.stack.length = depth + 1;
  const prev = MODAL.stack.pop();
  MODAL.ctx = prev.ctx; $('#modal').innerHTML = prev.html; $('#modalBack').scrollTop = prev.y;
}
/** X / backdrop / Escape close every layer; ‹ goes back one. Both step through history so the phone Back button stays in sync. */
function userCloseModal(all) {
  if (!history.state?.modal) { closeModal(); return; }
  history.go(all ? -(MODAL.stack.length + 1) : -1);
}
$('#modalBack').addEventListener('click', e => { const b = e.target.closest('[data-close]'); if (e.target.id === 'modalBack') userCloseModal(true); else if (b) userCloseModal(b.dataset.close === 'all'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalBack').classList.contains('open')) userCloseModal(true); });
/* Segmented controls inside pop-ups go through the layer's ctx, so a restored layer still responds. */
$('#modal').addEventListener('click', e => {
  const b = e.target.closest('.seg button'); if (!b || !MODAL.ctx.seg) return;
  const v = b.dataset.k ?? b.dataset.v ?? b.dataset.t ?? b.dataset.s; if (v != null) MODAL.ctx.seg(v);
});

/* ---------- Theme toggle ---------- */
try { const saved = localStorage.getItem('ph:theme'); if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved; } catch (e) { }
$('#themeBtn').addEventListener('click', () => {
  const r = document.documentElement, nx = r.dataset.theme === 'dark' ? 'light' : 'dark';
  r.dataset.theme = nx; try { localStorage.setItem('ph:theme', nx); } catch (e) { }
});

$('#dataStamp').textContent = `Historical data built ${HIST.built}. Live data refreshed each time you open a page.`;
window.addEventListener('hashchange', route);
route();
renderTicker();
setInterval(renderTicker, 60000);
