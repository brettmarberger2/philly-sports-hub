/* Helpers over the baked historical data (window.HIST) + curated notes (window.CUR) */
const H = {
  _cache: {},
  seasons(key) { return (this._cache[key] ||= [...HIST[key]].sort((a, b) => a.year - b.year)); },
  find(key, year) { return this.seasons(key).find(s => s.year === +year); },
  champ(t, year) { return HIST.champs[t.champKey]?.[String(year)] || null; },
  years() { const all = TEAM_KEYS.flatMap(k => this.seasons(k).map(s => s.year)); return { min: Math.min(...all), max: Math.max(...all) }; },
  label(t, s) { return t.league === 'nba' ? s.label : String(s.year); },

  record(t, s) { return t.recordFmt === 'wlt' && s.t ? `${s.w}-${s.l}-${s.t}` : `${s.w}-${s.l}`; },
  pctOf(s) { return pct(s.w ?? 0, s.l ?? 0, s.t ?? 0); },

  /** Human summary of a season's postseason outcome */
  outcome(s) {
    if (s.result === 'champion') return 'Champions';
    if (!s.post.length) return 'Missed playoffs';
    const last = s.post[s.post.length - 1];
    const m = last.match(/^(Won|Lost)\s+(?:the\s+)?(.*?)(?:\s*\(|\s+\d|$)/);
    if (s.result === 'finalist') return `Lost ${m ? m[2].replace(/\s*\(\d+\)$/, '') : 'Finals'}`;
    return m ? `${m[1]} ${m[2]}` : last;
  },
  /** Short playoff-path text list */
  path(s) { return s.post.map(p => p.replace(/\s*[*†‡]+\s*$/, '').replace(/\s\(\d+\)(?=\s\()/, '').replace(/\s\(\d+\)\s*$/, '')); },

  titles(key) { return this.seasons(key).filter(s => s.result === 'champion'); },
  finals(key) { return this.seasons(key).filter(s => s.result === 'finalist'); },
  playoffs(key) { return this.seasons(key).filter(s => s.result !== 'none'); },
  divTitles(key) { return this.seasons(key).filter(s => s.divWin); },

  totals(key) {
    const ss = this.seasons(key), w = sum(ss, s => s.w), l = sum(ss, s => s.l), t = sum(ss, s => s.t);
    return { seasons: ss.length, w, l, t, pct: pct(w, l, t), titles: this.titles(key).length, finals: this.finals(key).length, playoffs: this.playoffs(key).length, divTitles: this.divTitles(key).length };
  },

  /** Aggregate head coaches / managers. Shared seasons are counted separately so records are honest. */
  coaches(key) {
    const m = new Map();
    this.seasons(key).forEach(s => {
      const names = s.coaches.length ? s.coaches : ['Unknown'];
      names.forEach(n => {
        const c = m.get(n) || { name: n, years: [], w: 0, l: 0, t: 0, titles: 0, playoffs: 0, shared: 0, seasons: [] };
        c.years.push(s.year); c.seasons.push(s);
        if (names.length === 1) { c.w += s.w || 0; c.l += s.l || 0; c.t += s.t || 0; } else c.shared++;
        if (s.result === 'champion') c.titles++;
        if (s.result !== 'none') c.playoffs++;
        m.set(n, c);
      });
    });
    return [...m.values()].map(c => ({ ...c, first: Math.min(...c.years), last: Math.max(...c.years), pct: pct(c.w, c.l, c.t) })).sort((a, b) => a.first - b.first);
  },

  bestSeasons(key, n = 5) { return [...this.seasons(key)].filter(s => s.w != null).sort((a, b) => this.pctOf(b) - this.pctOf(a)).slice(0, n); },
  worstSeasons(key, n = 5) { return [...this.seasons(key)].filter(s => s.w != null && (s.w + s.l) > 8).sort((a, b) => this.pctOf(a) - this.pctOf(b)).slice(0, n); },
  rankOf(key, s) { const all = [...this.seasons(key)].sort((a, b) => this.pctOf(b) - this.pctOf(a)); return all.findIndex(x => x.year === s.year) + 1; },
  decadeOf(y) { return Math.floor(y / 10) * 10; },

  notes(key, year) { return CUR.notes?.[key]?.[year] || null; },
  facts(key, year) { return CUR.notes?.[key]?.[year]?.f || []; },

  /** Generated narrative for any season using the baked data */
  autoStory(t, s) {
    const key = t.key, prev = this.find(key, s.year - 1), next = this.find(key, s.year + 1);
    const label = this.label(t, s), coach = s.coaches.join(' & ') || 'the club';
    const role = t.league === 'mlb' ? 'manager' : 'head coach';
    let out = `The ${label} ${s.team && !/Phillies|Eagles|76ers/.test(s.team) ? s.team : t.nick} went <b>${this.record(t, s)}</b>`;
    if (s.finish && s.finish !== '—' && s.finish !== 'split season') out += ` and finished <b>${s.finish}</b>${s.div ? ` in the ${s.div}` : ''}`;
    out += `, under ${role} ${coach}.`;
    if (prev && prev.w != null && s.w != null) {
      const d = s.w - prev.w;
      out += d === 0 ? ` That matched the previous year's win total.` : ` That was ${Math.abs(d)} ${Math.abs(d) === 1 ? 'win' : 'wins'} ${d > 0 ? 'better' : 'worse'} than ${prev.year}'s ${this.record(t, prev)}.`;
    }
    if (s.result === 'champion') out += ` 🏆 The season ended with a <b>championship</b>.`;
    else if (s.result === 'finalist') out += ` They reached the championship round before falling short.`;
    else if (s.result === 'playoffs') out += ` They reached the postseason (${this.outcome(s).toLowerCase()}).`;
    else out += ` The team missed the postseason.`;
    if (s.awards.length) out += ` Honors: ${s.awards.join('; ')}.`;
    const rk = this.rankOf(key, s);
    out += ` By win percentage it ranks <b>${ord(rk)}</b> of ${this.seasons(key).length} seasons in franchise history.`;
    return out;
  },
};
