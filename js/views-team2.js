/* Team tabs, part 2: coaches, history, legends, stadium, shop */

/* ---------- Coaches ---------- */
async function tabCoaches(t, { mount, alive }) {
  const role = t.league === 'mlb' ? 'Manager' : 'Head coach';
  const [roster, staff] = await Promise.all([safe(API.roster(t)), t.mlbId ? safe(API.mlbStaff(t), []) : Promise.resolve(null)]);
  if (!alive()) return;
  const all = H.coaches(t.key);
  const cols = [
    { key: 'name', label: role, fmt: c => `<a href="#/history?team=${t.key}&text=${encodeURIComponent(c.name)}"><b>${esc(c.name)}</b></a>` },
    { key: 'first', label: 'Years', sortVal: c => c.first, fmt: c => (c.first === c.last ? c.first : `${c.first}–${c.last}`) },
    { key: 'n', label: 'Seasons', num: true, sortVal: c => c.years.length, fmt: c => c.years.length + (c.shared ? `<span class="dim" title="${c.shared} season(s) shared with another coach">*</span>` : '') },
    { key: 'w', label: 'Record', num: true, sortVal: c => c.w, fmt: c => (t.recordFmt === 'wlt' ? `${c.w}-${c.l}-${c.t}` : `${c.w}-${c.l}`) },
    { key: 'pct', label: 'Win %', num: true, fmt: c => (c.w + c.l ? fmtPct(c.pct) : '—') },
    { key: 'playoffs', label: 'Postseason', num: true }, { key: 'titles', label: 'Titles', num: true, fmt: c => (c.titles ? `<b style="color:var(--gold)">${c.titles} 🏆</b>` : '') },
  ];
  const cur = roster?.coach, mgr = staff?.find(s => /^manager$|interim manager/i.test(s.job)) || staff?.find(s => /manager/i.test(s.job));
  mount.innerHTML = `
    <div class="grid g2">
      <div class="card"><h3>Current ${role.toLowerCase()}</h3>
        ${mgr ? `<div style="font-size:1.6rem;font-weight:800">${esc(mgr.name)}</div><div class="muted">${esc(mgr.job)}</div>` : cur ? `<div style="font-size:1.6rem;font-weight:800">${esc(cur.firstName)} ${esc(cur.lastName)}</div><div class="muted">${cur.experience ? `${cur.experience} seasons as a head coach` : ''}</div>` : '<div class="muted">Not available.</div>'}
        ${(() => { const nm = mgr ? mgr.name : cur ? `${cur.firstName} ${cur.lastName}` : ''; const c = all.find(x => x.name === nm); return c ? `<div class="small muted" style="margin-top:8px">With the ${esc(t.nick)}: ${c.years.length} seasons · ${t.recordFmt === 'wlt' ? `${c.w}-${c.l}-${c.t}` : `${c.w}-${c.l}`} · ${c.playoffs} postseason trips · ${c.titles} title(s)</div>` : nm ? `<div class="small muted" style="margin-top:8px">New to the job since the last completed season, so their record with the team appears in the live season standings.</div>` : ''; })()}
      </div>
      <div class="card"><h3>Coaching staff</h3>${t.mlbId ? '' : `<p class="muted">Assistant coordinators and position coaches aren't published in any free public data feed. The team's official staff directory has the current list.</p><a class="btn" href="${t.staffUrl}" target="_blank" rel="noopener">Official coaching staff ↗</a>`}
        ${t.mlbId ? (staff?.length ? `<div class="table-wrap"><table class="data"><tbody>${staff.map(s => `<tr><td class="muted">${esc(s.job)}</td><td><b>${esc(s.name)}</b></td><td class="num dim">${esc(s.jersey ? '#' + s.jersey : '')}</td></tr>`).join('')}</tbody></table></div>` : errBox('Staff list unavailable.')) : ''}
      </div>
    </div>
    <div class="section"><h2>Every ${role.toLowerCase()} in franchise history</h2>
      ${renderTable(`coach-hist-${t.key}`, cols, all, { sortKey: 'first', sortDir: -1 })}
      <p class="disc">Records count only seasons where that person was the sole ${role.toLowerCase()} of record. Seasons with a mid-year change are marked * and are not added to either record. Titles and postseason trips count every season a person coached in.</p></div>`;
}

/* ---------- History (team) ---------- */
async function tabHistory(t, { mount, alive, q }) {
  return historyExplorer({ mount, alive, q, teams: [t.key], fixedTeam: t.key });
}

/* ---------- Legends ---------- */
async function tabLegends(t, { mount }) {
  const moments = Object.entries(CUR.notes[t.key] || {}).sort((a, b) => a[0] - b[0]);
  mount.innerHTML = `
    <div class="section" style="margin-top:0"><h2>Retired numbers</h2><div class="retired">${CUR.retired[t.key].map(r => `<button class="num-b" data-legend="${esc(r.name)}" data-team="${t.key}"><div class="n">${esc(r.n)}</div><div style="font-weight:700">${esc(r.name)}</div><div class="small muted">${esc(r.years)}</div><div class="small" style="color:var(--accent);margin-top:4px">Read bio →</div></button>`).join('')}</div></div>
    <div class="section"><h2>Franchise icons</h2><p class="section-sub">Click anyone for a full bio and their championships with the club.</p><div class="grid g2">${CUR.legends[t.key].map(l => `<button class="legend-card" data-legend="${esc(l.name)}" data-team="${t.key}"><div class="n">${l.n ? '#' + esc(l.n) : '★'}</div><div><b>${esc(l.name)}</b> <span class="badge">${esc(l.pos)}</span> <span class="dim small">${esc(l.era)}</span><div class="muted small" style="margin-top:4px">${esc(l.bio)}</div><div class="small" style="color:var(--accent);margin-top:6px;font-weight:700">Read full bio →</div></div></button>`).join('')}</div></div>
    <div class="section"><h2>Defining moments</h2><div class="stack">${moments.map(([y, n]) => { const s = H.find(t.key, y); return `<a class="card flat" style="color:inherit;display:block;cursor:pointer" href="javascript:void(0)" data-moment data-team="${t.key}" data-year="${y}"><div class="row between"><b>${esc(n.t)}</b><span class="badge ${s?.result === 'champion' ? 'gold' : ''}">${esc(s ? H.label(t, s) : y)}${s?.result === 'champion' ? ' 🏆' : ''}</span></div><div class="muted small" style="margin-top:4px">${esc(n.s)}</div></a>`; }).join('')}</div></div>
    <div class="section"><h2>Trivia</h2>${CUR.teamFacts[t.key].map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div>`;
}

/* ---------- Stadium ---------- */
function stadiumCardHtml(t, info) {
  const s = CUR.stadiums[t.key], c = s.current, v = info?.venue;
  const img = v?.images?.[0]?.href;
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + c.address)}`;
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="height:180px;background:linear-gradient(135deg,var(--c1,${t.primary}),#0b0f14);${img ? `background-image:linear-gradient(180deg,transparent 30%,#0b0f14ee),url('${esc(img)}');background-size:cover;background-position:center` : ''};display:flex;align-items:flex-end;padding:18px">
      <div><div class="small" style="opacity:.8;text-transform:uppercase;letter-spacing:.1em">Home of the ${esc(t.nick)}</div><h2 style="margin:0;color:#fff">${esc(c.name)}</h2></div></div>
    <div style="padding:18px"><dl class="kv"><dt>Opened</dt><dd>${c.opened}</dd><dt>Capacity</dt><dd>${c.capacity}</dd><dt>Address</dt><dd>${esc(c.address)} · <a href="${map}" target="_blank" rel="noopener">Map ↗</a></dd><dt>Surface</dt><dd>${esc(c.surface)}${v ? (v.indoor ? ' · indoor' : ' · open air') : ''}</dd><dt>Tenants</dt><dd>${esc(c.tenants)}</dd><dt>Cost</dt><dd>${c.cost}</dd></dl>
    ${c.facts.map(f => `<div class="fact">${esc(f)}</div>`).join('')}</div></div>`;
}
function pastStadiumsHtml(t) {
  return `<div class="stack">${CUR.stadiums[t.key].past.map(p => `<div class="legend-card"><div class="n" style="font-size:1rem;min-width:100px">${esc(p.years)}</div><div><b>${esc(p.name)}</b><div class="muted small">${esc(p.note)}</div></div></div>`).join('')}</div>`;
}
async function tabStadium(t, { mount, alive }) {
  const info = await safe(API.team(t)); if (!alive()) return;
  let extra = '';
  if (t.mlbId) {
    const v = await safe(getJSON(`${MLB_API}/venues/2681?hydrate=fieldInfo,location`, 86400), null), f = v?.venues?.[0]?.fieldInfo;
    if (f) extra = `<div class="card"><h3>Field dimensions</h3><dl class="kv"><dt>Left field</dt><dd>${f.leftLine ?? '—'} ft</dd><dt>Left-center</dt><dd>${f.leftCenter ?? '—'} ft</dd><dt>Center</dt><dd>${f.center ?? '—'} ft</dd><dt>Right-center</dt><dd>${f.rightCenter ?? '—'} ft</dd><dt>Right field</dt><dd>${f.rightLine ?? '—'} ft</dd><dt>Capacity</dt><dd>${f.capacity ? f.capacity.toLocaleString() : '—'}</dd><dt>Turf / roof</dt><dd>${esc(f.turfType || '')} · ${esc(f.roofType || '')}</dd></dl></div>`;
  }
  mount.innerHTML = `<div class="split"><div class="stack">${stadiumCardHtml(t, info)}${extra}</div><div><div class="card"><h3>Homes through the years</h3>${pastStadiumsHtml(t)}</div><a class="btn" style="margin-top:14px" href="${t.tickets}" target="_blank" rel="noopener">🎟️ Tickets ↗</a></div></div>`;
}

/* ---------- Shop ---------- */
const MERCH_CATS = [
  ['Jerseys', '🎽', 'jersey', 'Game, limited and replica jerseys'], ['Hats', '🧢', 'hat', 'Fitted, snapback and knit caps'], ['T-Shirts', '👕', 't-shirt', 'Tees for every fan'],
  ['Hoodies & Jackets', '🧥', 'hoodie', 'Sweatshirts, quarter-zips, jackets'], ['Kids & Youth', '🧒', 'youth', 'Gear for the next generation'], ['Women', '👚', 'women', 'Women’s apparel and jerseys'],
  ['Throwbacks', '📼', 'throwback', 'Vintage and heritage styles'], ['Collectibles', '🏆', 'collectible', 'Autographed and commemorative items'], ['Home & Tailgate', '🏠', 'flag', 'Flags, mugs, pennants and more'],
];
const fanaticsUrl = (t, term) => `https://www.fanatics.com/search?query=${encodeURIComponent(`${t.fanatics} ${term}`.trim())}`;
function shopHtml(t) {
  const champ = H.titles(t.key).slice(-1)[0];
  return `<div class="grid g-auto" style="--c1:${t.primary}">${MERCH_CATS.map(([n, em, term, d]) => `<a class="merch-card" style="--c1:${t.primary}" href="${fanaticsUrl(t, term)}" target="_blank" rel="noopener sponsored"><div class="pic"><img src="${teamLogoOn(t)}" alt=""><span class="em">${em}</span></div><div class="info"><b>${n}</b><span>${d}</span><div class="small" style="margin-top:6px;color:var(--accent)">Shop ${esc(t.nick)} at Fanatics ↗</div></div></a>`).join('')}</div>
    <div class="row" style="margin-top:16px"><a class="btn primary" href="${fanaticsUrl(t, '')}" target="_blank" rel="noopener sponsored">All ${esc(t.nick)} gear at Fanatics ↗</a><a class="btn" href="${t.shopOfficial}" target="_blank" rel="noopener">Official team shop ↗</a><a class="btn" href="${t.tickets}" target="_blank" rel="noopener">🎟️ Tickets ↗</a>${champ ? `<a class="btn" href="${fanaticsUrl(t, (t.league === 'nfl' ? 'super bowl champions' : t.league === 'mlb' ? 'world series champions' : 'nba champions'))}" target="_blank" rel="noopener sponsored">🏆 Champions gear ↗</a>` : ''}</div>`;
}
async function tabShop(t, { mount }) {
  mount.innerHTML = `<div class="card flat" style="margin-bottom:16px"><h3>${esc(t.name)} merchandise</h3><p class="muted">These links open Fanatics and the official team store in a new tab, so you check out securely with the retailer. Availability and prices are set by the store.</p></div>${shopHtml(t)}`;
}
