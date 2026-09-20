/* Stadiums hub, Shop hub, About */
async function viewStadiums({ mount, alive }) {
  const infos = await Promise.all(TEAM_KEYS.map(k => safe(API.team(TEAMS[k]))));
  if (!alive()) return;
  mount.innerHTML = `<div class="hero" style="padding:28px"><div class="tri"><span></span><span></span><span></span></div><h1>Stadiums</h1><p class="muted" style="max-width:700px">Where Philadelphia plays: today's homes in the South Philadelphia Sports Complex and every park, arena and field the three franchises called home before.</p></div>
    <div class="section"><h2>Today</h2><div class="grid g3">${TEAM_KEYS.map((k, i) => stadiumCardHtml(TEAMS[k], infos[i]).replace('<div class="card"', `<div class="card" data-team-card="${k}"`)).join('')}</div></div>
    <div class="section"><h2>Ballparks, fields &amp; arenas of the past</h2><div class="grid g3">${TEAM_KEYS.map(k => `<div class="card"><h3><img src="${teamLogo(TEAMS[k])}" width="28" height="28" alt=""> ${TEAMS[k].nick}</h3>${pastStadiumsHtml(TEAMS[k])}</div>`).join('')}</div></div>
    <div class="section"><h2>Shared history</h2><div class="grid g2"><div class="fact"><b>Veterans Stadium</b> hosted both the Eagles (1971–2002) and Phillies (1971–2003) for three decades before it was imploded in 2004.</div><div class="fact"><b>Shibe Park / Connie Mack Stadium</b> hosted the Athletics, Phillies and Eagles at different points and was the first concrete-and-steel ballpark.</div><div class="fact"><b>Baker Bowl</b> was home to the Phillies for more than 50 seasons and to the Eagles for their first three.</div><div class="fact"><b>The Spectrum &amp; Wells Fargo Center</b> sit side by side in South Philly, shared by the 76ers and Flyers.</div></div></div>`;
}

async function viewShop({ mount }) {
  mount.innerHTML = `<div class="hero" style="padding:28px"><div class="tri"><span></span><span></span><span></span></div><h1>Team shop</h1><p class="muted" style="max-width:720px">Jerseys, hats, tees and collectibles for all three teams. Every link opens Fanatics or the team's official store in a new tab, where you complete your purchase securely with the retailer.</p></div>
    ${TEAM_KEYS.map(k => { const t = TEAMS[k]; return `<div class="section"><h2><img src="${teamLogo(t)}" width="34" height="34" alt=""> ${esc(t.name)}</h2>${shopHtml(t)}</div>`; }).join('')}
    <p class="disc">Some links to retailers may earn the site owner a commission at no extra cost to you. Fanatics, NFL Shop, MLBShop and NBA Store are separate businesses, and prices and stock are theirs alone.</p>`;
}

async function viewAbout({ mount }) {
  mount.innerHTML = `<div class="card"><h2>About the data</h2>
    <p><b>Live:</b> rosters, depth charts, contracts, schedules, scores, standings, team stats, leaders, player bios and career stats come straight from ESPN's public site feeds, and Phillies staff and historical box data from the MLB Stats API, when you open a page.</p>
    <p><b>Historical:</b> season records, coaches, playoff results and league champions come from Wikipedia's season lists, baked in ${esc(HIST.built)}. Game-by-game logs, leaders and standings for past seasons are fetched live from ESPN/MLB, and ESPN's archive is patchy for older NFL seasons.</p>
    <p><b>Curated:</b> season stories, fun facts, stadium notes, retired numbers and icons are hand-written and fact-checked but not exhaustive.</p>
    <p><b>Not available:</b> MLB salaries and NFL/NBA assistant coaches aren't in any free public feed. The site links out instead.</p></div>`;
}
