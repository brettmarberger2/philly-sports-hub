# Philly Sports Hub

An interactive, mostly-live website for the **Philadelphia Eagles, Phillies and 76ers**.

## Run it

Double-click **`start.bat`**. It starts a small local web server (PowerShell only, nothing to install) and opens
<http://localhost:8080/>. You can also open `index.html` directly, but a server is more reliable.

## What's in it

| Section | What you get |
|---|---|
| **Home** | Live team cards (record, standing, live/next/last game), headlines, championship banners |
| **Team → Overview** | Game center, standings, season leaders, news, computed outlook, franchise facts |
| **Team → Roster** | Live roster, filter/search/sort; click a player for bio, draft, contract chart, career stats, previous teams |
| **Team → Depth Chart** | Live depth chart by formation/position with injury tags |
| **Team → Contracts** | Salaries, years left, expirations, top-10 payroll (NFL/NBA live; MLB reference table) |
| **Team → Stats** | Team totals vs opponents, leaders, standings |
| **Team → Schedule & Results** | Any season, filters, running record, margin chart |
| **Team → Coaches** | Current head coach/manager, MLB full staff, every head coach in franchise history |
| **Team → History / Legends / Stadium / Shop** | Season explorer, retired numbers and icons, stadium history, Fanatics/official shop links |
| **History** | Every season for all three franchises with filters (team, years, decade, result, coach/award search) |
| **Year Explorer** | Pick any year (1883-now): how each team did, league champions, stories and fun facts |
| **Season page** | Recap, playoff path, game-by-game log, leaders, standings, roster (MLB) for any season |
| **Stadiums / Shop** | All current and historic homes; merchandise for every team |

## Where the data comes from

* **Live**: ESPN public site/core feeds + MLB Stats API (fetched in your browser, cached briefly).
* **Historical seasons**: Wikipedia season lists, baked into `data/history.js` by `tools/build-history.ps1`
  (re-run it to refresh: `powershell -ExecutionPolicy Bypass -File tools\build-history.ps1`).
* **Curated**: `data/curated.js` (season stories, fun facts, stadiums, retired numbers, legends, MLB contract reference).

## Known limits (no free feed exists)

* MLB player salaries (a curated reference table of the biggest deals is shown instead).
* NFL/NBA assistant coaches (links to the official staff pages).
* ESPN's archive is patchy for older NFL/NBA game logs; the site says so when data is partial.
* NFL contract feeds give years remaining / remaining dollars, not a year-by-year future schedule.

## Project layout

```
index.html            page shell
css/style.css         theme
js/config.js          teams, API bases
js/api.js             live-data layer (ESPN + MLB)
js/history.js         helpers over baked history
js/views-*.js         pages
js/player.js          player modal
data/history.js       baked season-by-season history (generated)
data/curated.js       hand-written stories, facts, stadiums, legends
tools/                data build + local server scripts
```
