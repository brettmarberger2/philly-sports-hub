/* Player detail modal: bio, contract structure, career stats, previous teams */
App.rosters = {};
async function getRosterCached(teamKey) {
  if (!App.rosters[teamKey]) App.rosters[teamKey] = API.roster(TEAMS[teamKey]);
  return App.rosters[teamKey];
}
const prettySlug = s => (s || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

document.addEventListener('click', e => {
  const el = e.target.closest('[data-player]');
  if (el) { e.preventDefault(); openPlayer(el.dataset.team, el.dataset.player); }
  const tab = e.target.closest('[data-pltab]');
  if (tab) {
    $$('[data-pltab]').forEach(b => b.classList.toggle('on', b === tab));
    $$('[data-plpane]').forEach(p => (p.style.display = p.dataset.plpane === tab.dataset.pltab ? '' : 'none'));
  }
});

function contractChart(p, t) {
  const cs = p.contracts.filter(c => c.salary > 0 || c.year >= (p.salaryYear || 0));
  if (!cs.length) return '<div class="muted small">No year-by-year salary data is published for this player.</div>';
  const cur = p.salaryYear;
  const items = cs.map(c => ({ label: t.league === 'nba' ? `${String(c.year - 1).slice(2)}-${String(c.year).slice(2)}` : String(c.year), value: c.salary, color: c.year === cur ? 'var(--gold)' : c.year > (cur || 0) ? 'var(--team2)' : 'var(--dim)', title: `${c.year}: ${money(c.salary)}` }));
  return Charts.bars(items.slice(-14), { fmt: money, w: 720, h: 230 }) + `<div class="legend"><span><i style="background:var(--dim)"></i>Past seasons</span><span><i style="background:var(--gold)"></i>Current season</span><span><i style="background:var(--team2)"></i>Future commitments</span></div>`;
}

function careerTables(stats) {
  const cats = (stats?.categories || []).filter(c => c.statistics?.length);
  if (!cats.length) return '<div class="muted small">No career statistics are available for this player yet.</div>';
  const teamName = s => { const m = stats.teams?.[s.teamId] || stats.teams?.[s.teamSlug]; return m?.abbreviation || prettySlug(s.teamSlug) || ''; };
  return cats.map((c, i) => {
    const labels = c.labels || [];
    const rows = c.statistics.map(s => `<tr><td><b>${esc(s.season?.displayName || s.season?.year || '')}</b></td><td>${esc(teamName(s))}</td>${labels.map((_, j) => `<td class="num">${esc(s.stats?.[j] ?? '')}</td>`).join('')}</tr>`).join('');
    const tot = c.totals?.length ? `<tr style="font-weight:700;background:var(--card2)"><td colspan="2">Career</td>${labels.map((_, j) => `<td class="num">${esc(c.totals[j] ?? '')}</td>`).join('')}</tr>` : '';
    return `<details class="acc" ${i < 2 ? 'open' : ''}><summary>${esc(c.displayName || c.name)}</summary><div class="inner"><div class="table-wrap"><table class="data"><thead><tr><th>Season</th><th>Team</th>${labels.map(l => `<th class="num">${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows}${tot}</tbody></table></div></div></details>`;
  }).join('');
}

function teamsPath(stats, t) {
  const seq = [];
  (stats?.categories || []).forEach(c => (c.statistics || []).forEach(s => {
    if (!s.season?.year || !s.teamSlug) return;
    const name = (stats.teams?.[s.teamId] || stats.teams?.[s.teamSlug])?.displayName || prettySlug(s.teamSlug);
    seq.push({ y: s.season.year, name });
  }));
  if (!seq.length) return '';
  const by = new Map();
  seq.forEach(s => { const c = by.get(s.name) || { name: s.name, min: s.y, max: s.y }; c.min = Math.min(c.min, s.y); c.max = Math.max(c.max, s.y); by.set(s.name, c); });
  if (!by.has(t.name)) { const y = new Date().getFullYear(); by.set(t.name, { name: t.name, min: y, max: y }); }
  const list = [...by.values()].sort((a, b) => a.min - b.min);
  return `<ol style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px">${list.map((c, i) => `<li class="fact" style="margin:0"><b>${esc(c.name)}</b> <span class="muted">· ${c.min === c.max ? c.min : c.min + '–' + c.max}</span>${c.name === t.name ? ' <span class="badge team">Current</span>' : ''}</li>`).join('')}</ol>`;
}

async function openPlayer(teamKey, id) {
  const t = TEAMS[teamKey];
  openModal(`<div class="pl-body">${spinner('Loading player…')}</div>`);
  let p = null;
  try { p = (await getRosterCached(teamKey)).players.find(x => String(x.id) === String(id)); } catch (e) { /* ignore */ }
  if (!p) p = { id, name: 'Player', contracts: [], injuries: [], headshot: headshot(t, id) };
  const base = () => `
    <div class="pl-head">
      <img src="${esc(p.headshot)}" alt="" onerror="this.style.visibility='hidden'">
      <div><div class="small" style="opacity:.85;letter-spacing:.1em;text-transform:uppercase">${esc(t.nick)}${p.jersey ? ' · #' + esc(p.jersey) : ''}${p.pos ? ' · ' + esc(p.posName || p.pos) : ''}</div>
      <h2>${esc(p.name)}</h2><div class="row" style="gap:6px">${p.status && p.status !== 'Active' ? `<span class="badge bad">${esc(p.status)}</span>` : '<span class="badge good">Active</span>'}${p.injuries.map(i => `<span class="badge bad">${esc(i.status)}${i.detail ? ' · ' + esc(i.detail) : ''}</span>`).join('')}</div></div>
    </div>`;
  const facts = (extra = {}) => {
    const items = [['Age', p.age], ['Height', p.height], ['Weight', p.weight], ['Experience', extra.exp || (p.exp != null ? (p.exp === 0 ? 'Rookie' : p.exp + ' yrs') : '')], ['College', p.college], ['Born', extra.birth || p.birth], ['Draft', extra.draft], ['Bats/Throws', extra.hand], ['Debut', p.debut]].filter(([, v]) => v !== '' && v != null);
    return `<div class="facts-grid">${items.map(([l, v]) => `<div class="fg"><div class="l">${l}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>`;
  };
  const contractPane = () => {
    const has = p.salary != null || p.contracts.length;
    if (t.league === 'mlb' && !has) return `<div class="errbox">MLB salary figures are not available from free public data feeds. See the <a href="${t.spotrac}" target="_blank" rel="noopener">Spotrac payroll page</a> or <a href="${t.otc}" target="_blank" rel="noopener">Cot's Contracts</a>.</div>`;
    if (!has) return `<div class="errbox">No contract information is published for this player.</div>`;
    const remain = p.salaryRemaining;
    return `<div class="facts-grid" style="margin-bottom:14px">
      <div class="fg"><div class="l">${p.salaryYear || 'Current'} salary</div><div class="v">${money(p.salary)}</div></div>
      <div class="fg"><div class="l">Years remaining</div><div class="v">${p.yearsRemaining ?? '—'}</div></div>
      <div class="fg"><div class="l">Signed through</div><div class="v">${p.through ?? (p.contracts.length ? Math.max(...p.contracts.filter(c => c.salary > 0).map(c => c.year)) : '—')}</div></div>
      <div class="fg"><div class="l">Guaranteed / remaining</div><div class="v">${remain ? money(remain) : '—'}</div></div>
    </div>${contractChart(p, t)}<p class="disc">Figures as reported by ESPN and may reflect cap hit or base salary depending on the league. Check Spotrac or OverTheCap for full contract structure.</p>`;
  };
  const shell = (bio, stats) => `${base()}<div class="pl-body">
    <div class="pl-tabs"><button class="chip on" data-pltab="overview">Overview</button><button class="chip" data-pltab="contract">Contract</button><button class="chip" data-pltab="stats">Career stats</button><button class="chip" data-pltab="teams">Teams</button></div>
    <div data-plpane="overview">${facts({ exp: bio?.displayExperience, birth: bio?.displayBirthPlace, draft: bio?.displayDraft, hand: bio?.hand?.displayValue || bio?.hand?.abbreviation })}
      ${bio?.statsSummary ? `<h4 style="margin-top:16px">${esc(bio.statsSummary.displayName || 'Season stats')}</h4><div class="facts-grid">${(bio.statsSummary.statistics || []).map(s => `<div class="fg"><div class="l">${esc(s.shortDisplayName || s.displayName)}</div><div class="v">${esc(s.displayValue)}</div></div>`).join('')}</div>` : ''}
      ${bio?.links?.length ? `<p class="small" style="margin-top:14px"><a href="${esc((bio.links.find(l => /player card|playercard/i.test(l.rel?.join?.(',') || '')) || bio.links[0]).href)}" target="_blank" rel="noopener">View on ESPN ↗</a></p>` : ''}</div>
    <div data-plpane="contract" style="display:none">${contractPane()}</div>
    <div data-plpane="stats" style="display:none">${stats === undefined ? spinner('Loading career stats…') : careerTables(stats)}</div>
    <div data-plpane="teams" style="display:none">${stats === undefined ? spinner() : (teamsPath(stats, t) || '<div class="muted small">Team history unavailable.</div>')}</div>
  </div>`;
  openModal(shell(null, undefined));
  const { bio, stats } = await API.athlete(t, id);
  if (!$('#modalBack').classList.contains('open')) return;
  const prevTab = $('[data-pltab].on')?.dataset.pltab || 'overview';
  openModal(shell(bio, stats || { categories: [] }));
  $$('[data-pltab]').forEach(b => b.classList.toggle('on', b.dataset.pltab === prevTab));
  $$('[data-plpane]').forEach(pn => (pn.style.display = pn.dataset.plpane === prevTab ? '' : 'none'));
}
