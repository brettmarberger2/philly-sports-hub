/* App-like navigation: back button, breadcrumbs, bottom tab bar, scroll memory, and phone Back closing pop-ups. */
const NAV = { stack: [], popped: false, cur: null, scroll: {}, userMoved: false };

addEventListener('scroll', () => { if (NAV.cur != null) NAV.scroll[NAV.cur] = scrollY; }, { passive: true });
['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, () => (NAV.userMoved = true), { passive: true }));

addEventListener('popstate', () => {
  // Same page, different history entry = the Back press was closing a pop-up.
  if ((location.hash || '#/') === NAV.cur) { if ($('#modalBack').classList.contains('open')) closeModal(); return; }
  NAV.popped = true;
});

/** Called by the router before a page renders. */
NAV.before = hash => {
  if (NAV.popped) { const i = NAV.stack.lastIndexOf(hash); if (i >= 0) NAV.stack.length = i + 1; else NAV.stack.push(hash); }
  else if (NAV.stack.at(-1) !== hash) NAV.stack.push(hash);
  NAV.cur = hash;
  $('#backBtn').hidden = NAV.stack.length < 2;
  const restore = NAV.popped ? NAV.scroll[hash] || 0 : 0;
  NAV.popped = false;
  return restore;
};
/** Called after a page renders: put the reader back where they were when they pressed Back. */
NAV.after = (y, alive) => {
  if (!y) return;
  NAV.userMoved = false;
  const t0 = Date.now();
  const tryIt = () => {
    if (!alive() || NAV.userMoved) return;
    const room = document.documentElement.scrollHeight - innerHeight;
    scrollTo(0, Math.min(y, room));
    if (room < y && Date.now() - t0 < 4000) setTimeout(tryIt, 250);
  };
  tryIt();
};
$('#backBtn').addEventListener('click', () => history.back());

/* Links inside a pop-up replace the pop-up's history entry, so Back returns to the page underneath. */
document.addEventListener('click', e => {
  const a = e.target.closest('#modal a[href^="#/"]'); if (!a) return;
  e.preventDefault(); const href = a.getAttribute('href');
  closeModal();
  if (history.state?.modal) { history.replaceState(null, '', href); route(); } else location.hash = href;
}, true);

/* ---------- Breadcrumbs ---------- */
const TAB_NAMES = () => Object.fromEntries(TAB_LIST.map(([k, l]) => [k, l]));
function renderCrumbs(parts) {
  const head = parts[0] || '', c = [['#/', 'Home']];
  if (head === 'team' && TEAMS[parts[1]]) { c.push([`#/team/${parts[1]}`, TEAMS[parts[1]].nick]); if (parts[2] && parts[2] !== 'overview') c.push([null, TAB_NAMES()[parts[2]] || parts[2]]); }
  else if (head === 'season' && TEAMS[parts[1]]) { c.push([`#/team/${parts[1]}`, TEAMS[parts[1]].nick], [`#/team/${parts[1]}/history`, 'History'], [null, seasonLabel(TEAMS[parts[1]], +parts[2])]); }
  else if (head === 'leagues') c.push([null, 'Leagues']);
  else if (head === 'league' && LEAGUES[parts[1]]) { c.push(['#/leagues', 'Leagues'], [`#/league/${parts[1]}`, LEAGUES[parts[1]].short]); if (parts[2] && parts[2] !== 'standings') c.push([null, (LEAGUE_TABS.find(x => x[0] === parts[2]) || [])[1] || parts[2]]); }
  else if (head === 'history') c.push([null, 'Franchises']);
  else if (head === 'year') { c.push(['#/year', 'Year Explorer']); if (parts[1]) c.push([null, parts[1]]); }
  else if (head) c.push([null, { stadiums: 'Stadiums', shop: 'Shop', about: 'About the data' }[head] || head]);
  const el = $('#crumbs');
  el.hidden = !head;
  el.innerHTML = c.map(([h, l], i) => (h && i < c.length - 1 ? `<a href="${h}">${esc(l)}</a>` : `<span>${esc(l)}</span>`)).join('<i>›</i>');
}

/* ---------- Bottom tab bar (phones) ---------- */
function renderBottomNav(activeKey) {
  const items = [['', 'Home', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>'],
    ...TEAM_KEYS.map(k => [`team/${k}`, TEAMS[k].nick, `<img src="${teamLogo(TEAMS[k])}" alt="">`]),
    ['leagues', 'Leagues', '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>']];
  $('#bnav').innerHTML = items.map(([p, l, ic]) => `<a href="#/${p}" class="${(p === '' ? activeKey === '' : activeKey.startsWith(p)) ? 'on' : ''}">${ic}<span>${esc(l)}</span></a>`).join('');
}
