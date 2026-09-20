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
    ['history', 'History', null], ['year', 'Year Explorer', null], ['stadiums', 'Stadiums', null], ['shop', 'Shop', null],
  ];
  $('#nav').innerHTML = items.map(([p, label, img], i) => `${i === 1 || label === 'History' ? '<span class="sep"></span>' : ''}<a href="#/${p}" class="${activeKey === p || (p && activeKey.startsWith(p) && p !== '') ? 'active' : ''}">${img ? `<img src="${img}" alt="">` : ''}${label}</a>`).join('');
}

/* ---------- Live score ticker (all pages) ---------- */
function tickerItem(t, gs) {
  if (!gs) return '';
  const now = Date.now();
  const g = gs.live || (gs.next && gs.next.ts - now < 40 * 3600e3 ? gs.next : gs.last || gs.next);
  if (!g) return `<a class="tk" href="#/team/${t.key}"><img src="${teamLogo(t)}" alt=""><div><div class="who">${t.nick}</div><div class="st">No games scheduled</div></div></a>`;
  const live = g.state === 'in', done = g.state === 'post';
  const status = live ? `<span class="livedot"></span> LIVE · ${esc(g.detail)}` : done ? `Final${g.label ? ' · ' + esc(g.label) : ''} · ${esc(fmtDay(g.date))}` : `${esc(fmtDay(g.date))} · ${esc(fmtTime(g.date))}`;
  const score = live || done ? `<span class="${g.result === 'W' ? 'win' : g.result === 'L' ? 'loss' : ''}">${done ? g.result + ' ' : ''}${g.ourScore ?? 0}–${g.oppScore ?? 0}</span>` : `<span class="dim" style="font-size:.9rem">${g.home ? 'HOME' : 'AWAY'}</span>`;
  return `<a class="tk" href="#/team/${t.key}"><img src="${teamLogo(t)}" alt=""><div><div class="who">${esc(t.abbr)} ${g.home ? 'vs' : '@'} ${esc(g.opp.abbr || g.opp.short)}</div><div class="st">${status}</div></div><div class="sc">${score}</div></a>`;
}
async function renderTicker() {
  const res = await Promise.all(TEAM_KEYS.map(async k => ({ t: TEAMS[k], gs: await safe(API.gameStatus(TEAMS[k]), null) })));
  $('#ticker .ticker-inner').innerHTML = `<div class="ticker-label"><span class="livedot"></span> Scores</div>${res.map(r => tickerItem(r.t, r.gs)).join('')}`;
}

async function route() {
  App.clearTimers();
  const my = ++App.token;
  const { parts, q } = parseHash();
  const view = $('#view');
  const head = parts[0] || '';
  let activeKey = head;
  if (head === 'team' || head === 'season') activeKey = `team/${parts[1]}`;
  if (head === 'season') activeKey = 'history';
  if (head === 'legend') activeKey = '';
  renderNav(activeKey);
  setTheme(head === 'team' || head === 'season' ? parts[1] : null);
  closeModal();
  window.scrollTo({ top: 0 });
  view.innerHTML = spinner();
  try {
    let fn;
    if (!head) fn = viewHome;
    else if (head === 'team' && TEAMS[parts[1]]) fn = viewTeam;
    else if (head === 'history') fn = viewHistoryHub;
    else if (head === 'year') fn = viewYear;
    else if (head === 'season' && TEAMS[parts[1]]) fn = viewSeason;
    else if (head === 'stadiums') fn = viewStadiums;
    else if (head === 'shop') fn = viewShop;
    else if (head === 'about') fn = viewAbout;
    else { view.innerHTML = `<div class="card center"><h2>Page not found</h2><a class="btn" href="#/">Back home</a></div>`; return; }
    document.title = ({ '': 'Philly Sports Hub', team: `${TEAMS[parts[1]]?.nick || ''} · Philly Sports Hub`, history: 'Franchise History · Philly Sports Hub', year: 'Year Explorer · Philly Sports Hub', season: 'Season · Philly Sports Hub', stadiums: 'Stadiums · Philly Sports Hub', shop: 'Shop · Philly Sports Hub' })[head] || 'Philly Sports Hub';
    await fn({ parts, q, mount: view, token: my, alive: () => my === App.token });
  } catch (e) {
    console.error(e);
    if (my === App.token) view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back home</a></div>`;
  }
}

/* ---------- Modal ---------- */
function openModal(html) {
  $('#modal').innerHTML = `<button class="iconbtn x" data-close aria-label="Close">✕</button>${html}`;
  $('#modalBack').classList.add('open'); document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modalBack').classList.remove('open'); document.body.style.overflow = ''; }
$('#modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

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
