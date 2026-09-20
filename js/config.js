/* Team configuration + shared constants */
const TEAMS = {
  eagles: {
    key: 'eagles', name: 'Philadelphia Eagles', nick: 'Eagles', city: 'Philadelphia', abbr: 'PHI',
    sport: 'football', league: 'nfl', sportName: 'NFL', espnId: 21, champKey: 'nfl',
    primary: '#004C54', secondary: '#A5ACAF', accent: '#0a7b83', since: 1933, gamesInSeason: 17,
    unit: 'game', recordFmt: 'wlt', venueEspnId: 3806, emoji: '🦅',
    fanatics: 'philadelphia eagles', official: 'https://www.philadelphiaeagles.com/', shopOfficial: 'https://www.philadelphiaeagles.com/team/eagles-pro-shop',
    tickets: 'https://www.philadelphiaeagles.com/tickets/', staffUrl: 'https://www.philadelphiaeagles.com/team/coaches-roster/',
    spotrac: 'https://www.spotrac.com/nfl/philadelphia-eagles/cap/', otc: 'https://overthecap.com/salary-cap/philadelphia-eagles',
  },
  phillies: {
    key: 'phillies', name: 'Philadelphia Phillies', nick: 'Phillies', city: 'Philadelphia', abbr: 'PHI',
    sport: 'baseball', league: 'mlb', sportName: 'MLB', espnId: 22, mlbId: 143, champKey: 'mlb',
    primary: '#E81828', secondary: '#002D72', accent: '#c8102e', since: 1883, gamesInSeason: 162,
    unit: 'game', recordFmt: 'wl', venueEspnId: null, emoji: '⚾',
    fanatics: 'philadelphia phillies', official: 'https://www.mlb.com/phillies', shopOfficial: 'https://www.mlbshop.com/philadelphia-phillies/t-2270379+z-9-1428433/',
    tickets: 'https://www.mlb.com/phillies/tickets', staffUrl: 'https://www.mlb.com/phillies/roster/coaches',
    spotrac: 'https://www.spotrac.com/mlb/philadelphia-phillies/payroll/', otc: 'https://legacy.baseballprospectus.com/compensation/cots/national-league/philadelphia-phillies/',
  },
  sixers: {
    key: 'sixers', name: 'Philadelphia 76ers', nick: '76ers', city: 'Philadelphia', abbr: 'PHI',
    sport: 'basketball', league: 'nba', sportName: 'NBA', espnId: 20, champKey: 'nba',
    primary: '#006BB6', secondary: '#ED174C', accent: '#0a5ea0', since: 1946, gamesInSeason: 82,
    unit: 'game', recordFmt: 'wl', venueEspnId: null, emoji: '🏀',
    fanatics: 'philadelphia 76ers', official: 'https://www.nba.com/sixers/', shopOfficial: 'https://shop.sixers.com/',
    tickets: 'https://www.nba.com/sixers/tickets', staffUrl: 'https://www.nba.com/sixers/roster',
    spotrac: 'https://www.spotrac.com/nba/philadelphia-76ers/payroll/', otc: 'https://www.basketball-reference.com/contracts/PHI.html',
  },
};
const TEAM_KEYS = ['eagles', 'phillies', 'sixers'];

const ESPN = {
  site: t => `https://site.api.espn.com/apis/site/v2/sports/${t.sport}/${t.league}`,
  siteV2: t => `https://site.api.espn.com/apis/v2/sports/${t.sport}/${t.league}`,
  core: t => `https://sports.core.api.espn.com/v2/sports/${t.sport}/leagues/${t.league}`,
  web: t => `https://site.web.api.espn.com/apis/site/v2/sports/${t.sport}/${t.league}`,
  common: t => `https://site.web.api.espn.com/apis/common/v3/sports/${t.sport}/${t.league}`,
};
const MLB_API = 'https://statsapi.mlb.com/api/v1';

const teamLogo = (t, abbr) => `https://a.espncdn.com/i/teamlogos/${t.league}/500/${(abbr || t.abbr).toLowerCase()}.png`;
/** Light-on-dark logo for use on team-colored backgrounds. */
const teamLogoOn = (t, abbr) => `https://a.espncdn.com/i/teamlogos/${t.league}/500-dark/${(abbr || t.abbr).toLowerCase()}.png`;
const headshot = (t, id) => `https://a.espncdn.com/i/headshots/${t.league}/players/full/${id}.png`;

/** ESPN "season" query value for our start-year keyed seasons (NBA seasons are labelled by ending year). */
const espnSeason = (t, year) => (t.league === 'nba' ? year + 1 : year);
const seasonLabel = (t, year) => (t.league === 'nba' ? `${year}–${String(year + 1).slice(2)}` : String(year));

const CHAMP_TITLES = { nfl: ['NFL Championship / Super Bowl', 'NFL'], mlb: ['World Series', 'MLB'], nba: ['NBA Championship', 'NBA'] };

const App = {
  timers: [],
  clearTimers() { this.timers.forEach(clearInterval); this.timers = []; },
  every(fn, ms) { this.timers.push(setInterval(fn, ms)); },
  token: 0,
};
