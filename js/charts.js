/* Tiny dependency-free SVG charts */
const Charts = {
  /** Vertical bar chart. items: [{label, value, color?, title?}] */
  bars(items, { w = 640, h = 220, fmt = v => v, color = 'var(--team2)', pad = { l: 46, r: 8, t: 14, b: 30 }, minZero = true, hi = null } = {}) {
    if (!items.length) return '';
    const vals = items.map(i => i.value);
    const max = Math.max(...vals, 1), min = minZero ? Math.min(0, ...vals) : Math.min(...vals);
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const bw = Math.min(46, iw / items.length * 0.68);
    const y = v => pad.t + ih - ((v - min) / (max - min || 1)) * ih;
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
    for (let i = 0; i <= 4; i++) {
      const v = min + (max - min) * i / 4, yy = y(v);
      s += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    items.forEach((it, i) => {
      const cx = pad.l + iw * (i + 0.5) / items.length, yy = y(Math.max(it.value, 0)), y0 = y(0);
      const c = it.color || (hi != null && i === hi ? 'var(--gold)' : color);
      s += `<g><title>${esc(it.title || `${it.label}: ${fmt(it.value)}`)}</title><rect x="${cx - bw / 2}" y="${Math.min(yy, y0)}" width="${bw}" height="${Math.max(1, Math.abs(y0 - yy))}" rx="3" fill="${c}"/>`;
      if (items.length <= 14) s += `<text x="${cx}" y="${Math.min(yy, y0) - 4}" text-anchor="middle" style="fill:var(--text)">${fmt(it.value)}</text>`;
      s += `<text x="${cx}" y="${h - 10}" text-anchor="middle">${esc(it.label)}</text></g>`;
    });
    return s + '</svg>';
  },

  /** Line chart. series:[{name,color,points:[{x,y,mark?,title?,href?}]}] */
  line(series, { w = 900, h = 260, xFmt = v => v, yFmt = v => v, yMin = null, yMax = null, pad = { l: 44, r: 14, t: 16, b: 28 }, refY = null, xTicks = 8 } = {}) {
    const pts = series.flatMap(s => s.points);
    if (!pts.length) return '';
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = yMin ?? Math.min(...ys), y1 = yMax ?? Math.max(...ys);
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const X = v => pad.l + ((v - x0) / (x1 - x0 || 1)) * iw, Y = v => pad.t + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
    for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4, yy = Y(v); s += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${yFmt(v)}</text>`; }
    const step = Math.max(1, Math.round((x1 - x0) / xTicks));
    for (let v = x0; v <= x1; v += step) s += `<text x="${X(v)}" y="${h - 8}" text-anchor="middle">${xFmt(v)}</text>`;
    if (refY != null) s += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(refY)}" y2="${Y(refY)}" stroke="var(--dim)" stroke-dasharray="4 4"/>`;
    series.forEach(se => {
      const d = se.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
      s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.2" stroke-linejoin="round"/>`;
      se.points.forEach(p => {
        if (p.mark) s += `<a href="${p.href || '#'}"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="5" fill="${p.mark}" stroke="var(--bg)" stroke-width="1.5"><title>${esc(p.title || '')}</title></circle></a>`;
        else if (se.points.length < 60) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="2.5" fill="${se.color}"><title>${esc(p.title || '')}</title></circle>`;
      });
    });
    return s + '</svg>';
  },

  /** Stacked bars by year: groups:[{label, parts:[{name,value,color}]}] */
  stacked(groups, { w = 720, h = 260, fmt = v => v, pad = { l: 54, r: 8, t: 14, b: 30 } } = {}) {
    if (!groups.length) return '';
    const totals = groups.map(g => sum(g.parts, p => p.value));
    const max = Math.max(...totals, 1);
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, bw = Math.min(70, iw / groups.length * 0.65);
    const y = v => pad.t + ih - (v / max) * ih;
    let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">`;
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); s += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}"/><text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${fmt(v)}</text>`; }
    groups.forEach((g, i) => {
      const cx = pad.l + iw * (i + 0.5) / groups.length; let acc = 0;
      g.parts.forEach(p => { const y1 = y(acc + p.value), y0 = y(acc); s += `<rect x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1)}" fill="${p.color}"><title>${esc(p.name)}: ${fmt(p.value)}</title></rect>`; acc += p.value; });
      s += `<text x="${cx}" y="${y(acc) - 5}" text-anchor="middle" style="fill:var(--text);font-weight:700">${fmt(acc)}</text><text x="${cx}" y="${h - 10}" text-anchor="middle">${esc(g.label)}</text>`;
    });
    return s + '</svg>';
  },

  /** Horizontal bar list (HTML) */
  hbars(items, { fmt = v => v, max = null } = {}) {
    const m = max ?? Math.max(...items.map(i => i.value), 1);
    return items.map(i => `<div class="bar-h"><div title="${esc(i.label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i.html || esc(i.label)}</div><div class="track"><div class="fill" style="width:${Math.max(2, i.value / m * 100)}%;${i.color ? `background:${i.color}` : ''}"></div></div><div class="num">${fmt(i.value)}</div></div>`).join('');
  },
};
