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

function renderNav(activeKey) {
  const items = [
    ['', 'Home', null],
    ...TEAM_KEYS.map(k => [`team/${k}`, TEAMS[k].nick, teamLogo(TEAMS[k])]),
    ['leagues', 'Leagues', null], ['history', 'Franchises', null], ['year', 'Year Explorer', null], ['stadiums', 'Stadiums', null], ['shop', 'Shop', null],
  ];
  const isAct = p => activeKey === p || (p && activeKey.startsWith(p) && p !== '');
  $('#mmenu').innerHTML = `<div class="mh">Teams</div><div class="mgrid">${TEAM_KEYS.map(k => `<a href="#/team/${k}" class="${isAct('team/' + k) ? 'active' : ''}"><img src="${teamLogo(TEAMS[k])}" alt="">${TEAMS[k].nick}</a>`).join('')}<a href="#/history" class="${isAct('history') ? 'active' : ''}">📜 Franchises</a></div><div class="mh">Explore</div><div class="mgrid"><a href="#/" class="${activeKey === '' ? 'active' : ''}">🏠 Home</a><a href="#/leagues" class="${isAct('leagues') ? 'active' : ''}">📊 Leagues</a><a href="#/year" class="${isAct('year') ? 'active' : ''}">🗓️ Year Explorer</a><a href="#/stadiums" class="${isAct('stadiums') ? 'active' : ''}">🏟️ Stadiums</a><a href="#/shop" class="${isAct('shop') ? 'active' : ''}">🛍️ Shop</a></div>`;
  $('#nav').innerHTML = items.map(([p, label, img], i) => `${i === 1 || label === 'Leagues' ? '<span class="sep"></span>' : ''}<a href="#/${p}" class="${activeKey === p || (p && activeKey.startsWith(p) && p !== '') ? 'active' : ''}">${img ? `<img src="${img}" alt="">` : ''}${label}</a>`).join('');
}

/* ---------- Live score ticker (all pages) ---------- */
function tickerItem(t, rg) {
  if (!rg) return '';
  const res = g => `<span class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'loss' : ''}">${g.result} ${g.ourScore}–${g.oppScore}</span> ${g.home ? 'vs' : '@'} ${esc(g.opp.abbr || g.opp.short)}`;
  const recent = [...rg.list].reverse();            // newest first
  const first = rg.live ? `<span class="badge live" style="padding:1px 7px">Live</span> ${rg.live.ourScore ?? 0}–${rg.live.oppScore ?? 0} ${rg.live.home ? 'vs' : '@'} ${esc(rg.live.opp.abbr || rg.live.opp.short)} <span class="lab">${esc(rg.live.detail)}</span>` : recent[0] ? `${res(recent[0])} <span class="lab">${esc(fmtDate(recent[0].date, { month: 'short', day: 'numeric' }))}</span>` : 'No games yet';
  const second = rg.live ? (recent[0] ? `Last: ${res(recent[0])}` : '') : recent[1] ? `Prev: ${res(recent[1])} · ${esc(fmtDate(recent[1].date, { month: 'short', day: 'numeric' }))}` : '';
  return `<a class="tk" href="#/team/${t.key}/schedule"><img src="${teamLogo(t)}" alt=""><div><div class="l1"><span>${esc(t.nick)}</span> ${first}</div>${second ? `<div class="l2">${second}</div>` : ''}</div></a>`;
}
async function renderTicker() {
  const res = await Promise.all(TEAM_KEYS.map(async k => ({ t: TEAMS[k], rg: await safe(API.recentGames(TEAMS[k], 2), null) })));
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
  setTheme(head === 'team' || head === 'season' ? parts[1] : head === 'league' && LEAGUES[parts[1]] ? LEAGUES[parts[1]].team : null);
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
    else if (head === 'leagues') fn = viewLeagues;
    else if (head === 'league' && LEAGUES[parts[1]]) fn = viewLeague;
    else if (head === 'year') fn = viewYear;
    else if (head === 'season' && TEAMS[parts[1]]) fn = viewSeason;
    else if (head === 'stadiums') fn = viewStadiums;
    else if (head === 'shop') fn = viewShop;
    else if (head === 'about') fn = viewAbout;
    else { view.innerHTML = `<div class="card center"><h2>Page not found</h2><a class="btn" href="#/">Back home</a></div>`; return; }
    document.title = ({ '': 'Philly Sports Hub', team: `${TEAMS[parts[1]]?.nick || ''} · Philly Sports Hub`, history: 'Franchise Overview · Philly Sports Hub', leagues: 'Leagues · Philly Sports Hub', league: `${LEAGUES[parts[1]]?.short || ''} Standings · Philly Sports Hub`, year: 'Year Explorer · Philly Sports Hub', season: 'Season · Philly Sports Hub', stadiums: 'Stadiums · Philly Sports Hub', shop: 'Shop · Philly Sports Hub' })[head] || 'Philly Sports Hub';
    await fn({ parts, q, mount: view, token: my, alive: () => my === App.token });
    NAV.after(restoreY, () => my === App.token);
  } catch (e) {
    console.error(e);
    if (my === App.token) view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back home</a></div>`;
  }
}

/* ---------- Modal ---------- */
function openModal(html) {
  if (!$('#modalBack').classList.contains('open')) history.pushState({ modal: true }, '', location.href);
  $('#modal').innerHTML = `<button class="iconbtn x" data-close aria-label="Close">✕</button>${html}`;
  $('#modalBack').classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalBack').classList.remove('open'); document.body.style.overflow = ''; }
/** Close from the X, the backdrop or Escape: step back through history so the phone Back button stays in sync. */
function userCloseModal() { if (history.state?.modal) history.back(); else closeModal(); }
$('#modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack' || e.target.closest('[data-close]')) userCloseModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalBack').classList.contains('open')) userCloseModal(); });

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
