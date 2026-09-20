/* Small helpers: escaping, cached fetch, formatting */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const _mem = new Map();
const _inflight = new Map();
/** Fetch JSON with in-memory + localStorage caching. ttl in seconds. */
async function getJSON(url, ttl = 120, opts = {}) {
  const now = Date.now();
  const m = _mem.get(url);
  if (m && now - m.t < ttl * 1000) return m.v;
  if (!opts.noStore && ttl >= 1800) {
    try {
      const raw = localStorage.getItem('ph:' + url);
      if (raw) { const o = JSON.parse(raw); if (now - o.t < ttl * 1000) { _mem.set(url, o); return o.v; } }
    } catch (e) { /* storage unavailable */ }
  }
  if (_inflight.has(url)) return _inflight.get(url);
  const p = fetch(url).then(async r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    const v = await r.json();
    const o = { t: Date.now(), v };
    _mem.set(url, o);
    if (!opts.noStore && ttl >= 1800) { try { const s = JSON.stringify(o); if (s.length < 400000) localStorage.setItem('ph:' + url, s); } catch (e) { /* quota */ } }
    return v;
  }).finally(() => _inflight.delete(url));
  _inflight.set(url, p);
  return p;
}
const safe = (p, fallback = null) => p.catch(e => { console.warn(e); return fallback; });

const money = n => {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
};
const fmtDate = (iso, o = { month: 'short', day: 'numeric', year: 'numeric' }) => (iso ? new Date(iso).toLocaleDateString('en-US', o) : '');
const fmtDay = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');
const fmtTime = iso => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');
const ago = iso => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const ord = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const pct = (w, l, t = 0) => { const g = w + l + t; return g ? ((w + t / 2) / g) : 0; };
const fmtPct = v => v.toFixed(3).replace(/^0/, '');
const sum = (a, f = x => x) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const uniq = a => [...new Set(a)];
const groupBy = (a, f) => a.reduce((m, x) => { (m[f(x)] ||= []).push(x); return m; }, {});
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const httpsify = u => (u ? u.replace(/^http:/, 'https:') : u);
const fmtInt = n => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));
/** Run fn over items with limited concurrency, preserving order. */
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

function recordStr(t, w, l, tie) { return t.recordFmt === 'wlt' && tie ? `${w}-${l}-${tie}` : `${w}-${l}`; }

const spinner = (msg = 'Loading live data…') => `<div class="loading"><span class="spin"></span>${esc(msg)}</div>`;
const errBox = (msg = 'This data is not available right now.') => `<div class="errbox">${esc(msg)}</div>`;

/** Simple toast */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

/** Sortable table helper: click headers to sort. cols: [{key,label,num?,fmt?,cls?}] */
function renderTable(id, cols, rows, opts = {}) {
  const state = (renderTable.state ||= {});
  const st = (state[id] ||= { key: opts.sortKey ?? null, dir: opts.sortDir ?? 1 });
  st.cols = cols; st.rows = rows; st.opts = opts;
  let data = rows.slice();
  if (st.key != null) {
    const col = cols.find(c => c.key === st.key);
    const val = r => (col.sortVal ? col.sortVal(r) : r[col.key]);
    data.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * st.dir;
    });
  }
  const head = cols.map(c => `<th class="${c.num ? 'num' : ''} ${c.cls || ''} sortable ${st.key === c.key ? (st.dir > 0 ? 'asc' : 'desc') : ''}" data-sort="${c.key}" data-table="${id}">${esc(c.label)}</th>`).join('');
  const body = data.map(r => `<tr ${opts.rowAttr ? opts.rowAttr(r) : ''} class="${opts.rowClass ? opts.rowClass(r) : ''}">${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.fmt ? c.fmt(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="data" id="${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
document.addEventListener('click', e => {
  const th = e.target.closest('th.sortable');
  if (!th) return;
  const id = th.dataset.table, key = th.dataset.sort, st = renderTable.state[id];
  st.dir = st.key === key ? -st.dir : 1; st.key = key;
  const wrap = document.getElementById(id)?.closest('.table-wrap');
  if (wrap) { const scroll = wrap.scrollLeft; wrap.outerHTML = renderTable(id, st.cols, st.rows, st.opts); const nw = document.getElementById(id)?.closest('.table-wrap'); if (nw) nw.scrollLeft = scroll; }
});
