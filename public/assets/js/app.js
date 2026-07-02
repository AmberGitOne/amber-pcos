/* ============================================================================
 * Amber LifeSciences — Pharma Commercial Operating System
 * app.js — router, views, components, charts, AI copilot
 * ==========================================================================*/
(() => {
  const D = AmberData;
  const $ = (s, r = document) => r.querySelector(s);
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const nowTime = () => new Date().toTimeString().slice(0, 5);

  // ---- session ------------------------------------------------------------
  let session = D.user();
  const dashState = { period: 'ytd', division: 'all', series: 'both' };
  const invFilter = { status: 'all', owner: '' };
  let giftWindow = 60;
  let giftTab = 'Doctor';
  let distTab = 'recon';
  let reconFilter = 'all';
  const pcalc = { mrp: 100, gst: 0.12, ret: 0.20, stk: 0.10, paid: 10, total: 11 };

  // ---- desktop / phone view toggle ---------------------------------------
  let viewOverride = localStorage.getItem('amber_view') || 'auto'; // auto | mobile | desktop
  function applyView() {
    const w = window.innerWidth;
    const mobile = viewOverride === 'mobile' ? true : viewOverride === 'desktop' ? false : (w <= 880);
    const forced = viewOverride === 'mobile' && w > 880; // phone frame on a wide screen
    document.documentElement.classList.toggle('is-mobile', mobile);
    document.documentElement.classList.toggle('forced-phone', forced);
  }
  function toggleView() {
    const w = window.innerWidth;
    const mobileNow = viewOverride === 'mobile' || (viewOverride === 'auto' && w <= 880);
    viewOverride = mobileNow ? 'desktop' : 'mobile';
    localStorage.setItem('amber_view', viewOverride);
    document.body.classList.remove('nav-open');
    applyView();
    toast(viewOverride === 'mobile' ? '📱 Phone view' : '🖥 Desktop view');
  }
  window.addEventListener('resize', applyView);

  // ---- charts (inline SVG) ------------------------------------------------
  function donut(pct, color, size = 92) {
    const r = size / 2 - 9, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#eceff2" stroke-width="9"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        transform="rotate(-90 ${size/2} ${size/2})"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".35em" font-size="${size*0.22}" font-weight="800" fill="#1c2733">${pct}%</text>
    </svg>`;
  }

  // multi-segment pie chart with legend. segs: [{label, val, color}]
  function pieChart(segs, size = 150) {
    segs = (segs || []).filter(s => s.val > 0);
    const total = segs.reduce((a, s) => a + s.val, 0);
    if (!total) return '<p class="muted" style="padding:20px 0">No data yet.</p>';
    const cx = size / 2, cy = size / 2, r = size / 2 - 2;
    let ang = -Math.PI / 2;
    const slices = segs.length === 1
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${segs[0].color}"><title>${esc(segs[0].label)}: ${segs[0].val} (100%)</title></circle>`
      : segs.map(s => {
        const a0 = ang, a1 = ang + (s.val / total) * 2 * Math.PI; ang = a1;
        const large = (a1 - a0) > Math.PI ? 1 : 0;
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        return `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${esc(s.label)}: ${s.val} (${Math.round(s.val / total * 100)}%)</title></path>`;
      }).join('');
    const legend = segs.map(s => `<div class="flex" style="gap:6px;font-size:12px"><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${s.color}"></i><span>${esc(s.label)}</span><b style="margin-left:auto">${s.val} · ${Math.round(s.val / total * 100)}%</b></div>`).join('');
    return `<div class="flex" style="gap:16px;align-items:center;flex-wrap:wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:none">${slices}</svg>
      <div style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:6px">${legend}</div></div>`;
  }
  // group a list into pie segments by a key, using a colour map (+ palette fallback)
  function groupSegments(items, keyFn, colorMap) {
    const palette = ['#10a37f', '#3b82f6', '#f5a524', '#7c3aed', '#0891b2', '#e5484d', '#9aa6b2', '#0c5c4c'];
    const counts = {}; let pi = 0;
    (items || []).forEach(i => { const k = keyFn(i) || '—'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ label: k, val: v, color: (colorMap && colorMap[k]) || palette[pi++ % palette.length] }));
  }

  function stockExpirySegments() {
    const c = { ok: 0, expiring: 0, expired: 0 };
    (D.get().stock || []).forEach(x => { const k = expiryStatus(x.expiry).key; if (c[k] != null) c[k]++; });
    return [{ label: 'In date', val: c.ok, color: '#2ec27e' }, { label: 'Expiring ≤90d', val: c.expiring, color: '#f5a524' }, { label: 'Expired', val: c.expired, color: '#e5484d' }];
  }

  function lineChart(data, w = 560, h = 200, series = 'both') {
    if (!data.length) return '<p class="muted">No data for this period.</p>';
    const keys = series === 'primary' ? ['primary'] : series === 'secondary' ? ['secondary'] : ['primary', 'secondary'];
    const pad = 30, max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k]))) * 1.1;
    const x = i => data.length === 1 ? w / 2 : pad + i * (w - pad * 2) / (data.length - 1);
    const y = v => h - pad - (v / max) * (h - pad * 2);
    const path = (k) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[k]).toFixed(1)}`).join(' ');
    const dots = (k, col) => data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d[k])}" r="9" fill="transparent"><title>${d.m} — Primary ₹${d.primary}L · Secondary ₹${d.secondary}L</title></circle><circle cx="${x(i)}" cy="${y(d[k])}" r="3.4" fill="${col}" pointer-events="none"/>`).join('');
    const labels = data.map((d, i) => `<text x="${x(i)}" y="${h - 8}" font-size="11" fill="#6b7a89" text-anchor="middle">${d.m}</text>`).join('');
    const COL = { primary: '#10a37f', secondary: '#f5a524' };
    return `<svg width="100%" viewBox="0 0 ${w} ${h}">
      ${[0,.25,.5,.75,1].map(t=>`<line x1="${pad}" x2="${w-pad}" y1="${pad+t*(h-pad*2)}" y2="${pad+t*(h-pad*2)}" stroke="#eef1f4"/>`).join('')}
      ${keys.map(k => `<path d="${path(k)}" fill="none" stroke="${COL[k]}" stroke-width="2.5"/>`).join('')}
      ${keys.map(k => dots(k, COL[k])).join('')}${labels}
    </svg>`;
  }

  function barChart(rows, w = 560, h = 200) { // rows:[{label,val,color,action,div,tip,active}]
    const pad = 30, max = Math.max(1, ...rows.map(r => r.val)) * 1.15, bw = (w - pad * 2) / rows.length * .55;
    return `<svg width="100%" viewBox="0 0 ${w} ${h}">
      ${rows.map((r, i) => {
        const x = pad + i * (w - pad * 2) / rows.length + ((w - pad * 2) / rows.length - bw) / 2;
        const bh = (r.val / max) * (h - pad * 2), y = h - pad - bh;
        const click = r.action ? `data-action="${r.action}" data-div="${r.div || ''}" style="cursor:pointer"` : '';
        return `<g ${click}><title>${esc(r.tip || (r.label + ': ' + r.val))}</title>
          <rect x="${x}" y="${pad}" width="${bw}" height="${h - pad * 2}" rx="4" fill="${r.active ? '#10a37f18' : 'transparent'}"/>
          <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${r.color || '#10a37f'}" ${r.active ? 'stroke="#0c5c4c" stroke-width="2"' : ''}/>
          <text x="${x + bw / 2}" y="${y - 5}" font-size="10" fill="#1c2733" text-anchor="middle" font-weight="700">${r.val}</text>
          <text x="${x + bw / 2}" y="${h - 8}" font-size="10" fill="#6b7a89" text-anchor="middle">${esc(r.label)}</text></g>`;
      }).join('')}
    </svg>`;
  }

  // horizontal stock gauge: current closing vs Safety / ROP / Max thresholds
  function stockGauge(c) {
    const W = 240, H = 40, pad = 6;
    const end = Math.max(c.maxStock, c.closing, 1) * 1.08;
    const X = v => pad + Math.max(0, Math.min(1, v / end)) * (W - pad * 2);
    const zone = (a, b, col) => `<rect x="${X(a).toFixed(1)}" y="15" width="${Math.max(0, X(b) - X(a)).toFixed(1)}" height="11" fill="${col}"/>`;
    const cur = Math.max(0, c.closing);
    return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:240px">
      <rect x="${pad}" y="15" width="${W - pad * 2}" height="11" rx="3" fill="#eef1f5"/>
      ${zone(0, c.safety, '#fde0e0')}${zone(c.safety, c.rop, '#fdebd2')}${zone(c.rop, c.maxStock, '#dcf2e4')}${zone(c.maxStock, end, '#fcd9da')}
      <line x1="${X(c.safety).toFixed(1)}" x2="${X(c.safety).toFixed(1)}" y1="12" y2="29" stroke="#e5484d" stroke-width="1.4"/>
      <line x1="${X(c.rop).toFixed(1)}" x2="${X(c.rop).toFixed(1)}" y1="12" y2="29" stroke="#d97706" stroke-width="1.4"/>
      <line x1="${X(c.maxStock).toFixed(1)}" x2="${X(c.maxStock).toFixed(1)}" y1="12" y2="29" stroke="#16a34a" stroke-width="1.4"/>
      <circle cx="${X(cur).toFixed(1)}" cy="20.5" r="5" fill="#0f172a"/><circle cx="${X(cur).toFixed(1)}" cy="20.5" r="2.3" fill="#fff"/>
      <text x="${X(c.safety).toFixed(1)}" y="10" font-size="7" fill="#e5484d" text-anchor="middle">Safe</text>
      <text x="${X(c.rop).toFixed(1)}" y="10" font-size="7" fill="#b45309" text-anchor="middle">ROP</text>
      <text x="${X(c.maxStock).toFixed(1)}" y="10" font-size="7" fill="#16a34a" text-anchor="middle">Max</text>
      <text x="${X(cur).toFixed(1)}" y="38" font-size="7.5" fill="#0f172a" text-anchor="middle" font-weight="700">${Math.round(cur).toLocaleString('en-IN')}</text>
    </svg>`;
  }

  // ---- Dashbase-style helpers --------------------------------------------
  // Catmull-Rom → cubic bezier for a smooth curve through points
  function smoothPath(pts) {
    if (pts.length < 2) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  // smooth filled area chart (Dashbase "Revenue Overview" style)
  function areaChart(data, w = 640, h = 250, series = 'both') {
    if (!data.length) return '<p class="muted">No data for this period.</p>';
    const keys = series === 'primary' ? ['primary'] : series === 'secondary' ? ['secondary'] : ['primary', 'secondary'];
    const padL = 36, padR = 14, padT = 14, padB = 26;
    const max = Math.max(1, ...data.flatMap(d => keys.map(k => d[k]))) * 1.18;
    const X = i => data.length === 1 ? w / 2 : padL + i * (w - padL - padR) / (data.length - 1);
    const Y = v => padT + (1 - v / max) * (h - padT - padB);
    const COL = { primary: '#6d5ae6', secondary: '#f59e0b' };
    const grid = [0, .25, .5, .75, 1].map(t => {
      const y = padT + t * (h - padT - padB), val = Math.round(max * (1 - t));
      return `<line x1="${padL}" x2="${w - padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#eef1f5"/><text x="${padL - 8}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="end">${val}</text>`;
    }).join('');
    const xlabels = data.map((d, i) => `<text x="${X(i).toFixed(1)}" y="${h - 7}" font-size="10.5" fill="#94a3b8" text-anchor="middle">${d.m}</text>`).join('');
    let defs = '', body = '';
    keys.forEach(k => {
      const pts = data.map((d, i) => [+X(i).toFixed(1), +Y(d[k]).toFixed(1)]);
      const line = smoothPath(pts);
      if (k === 'primary') {
        defs += `<linearGradient id="dbxg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${COL.primary}" stop-opacity=".30"/><stop offset="1" stop-color="${COL.primary}" stop-opacity="0"/></linearGradient>`;
        body += `<path d="${line} L${X(data.length - 1).toFixed(1)} ${Y(0).toFixed(1)} L${X(0).toFixed(1)} ${Y(0).toFixed(1)} Z" fill="url(#dbxg)"/>`;
      }
      body += `<path d="${line}" fill="none" stroke="${COL[k]}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
      body += data.map((d, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(d[k]).toFixed(1)}" r="11" fill="transparent"><title>${d.m} — Primary ₹${d.primary}L · Secondary ₹${d.secondary}L</title></circle><circle cx="${X(i).toFixed(1)}" cy="${Y(d[k]).toFixed(1)}" r="3.4" fill="#fff" stroke="${COL[k]}" stroke-width="2.2" pointer-events="none"/>`).join('');
    });
    return `<svg width="100%" viewBox="0 0 ${w} ${h}" style="display:block;max-width:100%">${defs ? '<defs>' + defs + '</defs>' : ''}${grid}${body}${xlabels}</svg>`;
  }
  const DBX_ICONS = {
    revenue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    approvals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };
  function dbxDelta(txt, dir) { return `<span class="dbx-delta ${dir}">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'} ${esc(txt)}</span>`; }
  const DBX_AV = ['#6d5ae6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#0891b2', '#8b5cf6'];
  function dbxAvatar(name, i) {
    const n = (name || '?').trim();
    const init = (n.split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
    return `<div class="dbx-av" style="background:${DBX_AV[i % DBX_AV.length]}">${esc(init)}</div>`;
  }
  function dbxAgo(dateStr) {
    const days = Math.round((new Date(today()) - new Date(dateStr)) / 86400000);
    if (isNaN(days)) return dateStr || '';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 30) return Math.floor(days / 7) + 'w ago';
    return Math.floor(days / 30) + 'mo ago';
  }

  // owner of a stock item can be a chemist or a distributor
  function ownerName(id) {
    const s = D.get();
    const c = (s.chemists || []).find(x => x.id === id);
    if (c) return c.name;
    const d = (s.distributors || []).find(x => x.id === id);
    return d ? d.name : id;
  }
  function ownerType(id) { return (D.get().chemists || []).some(c => c.id === id) ? 'Chemist' : 'Distributor'; }
  // expiry status from a yyyy-mm-dd string, relative to today
  function expiryStatus(dateStr) {
    if (!dateStr) return { key: 'none', label: '—', badge: 'muted', days: null };
    const days = Math.round((new Date(dateStr) - new Date(today())) / 86400000);
    if (isNaN(days)) return { key: 'none', label: dateStr, badge: 'muted', days: null };
    if (days < 0) return { key: 'expired', label: 'Expired ' + (-days) + 'd ago', badge: 'danger', days };
    if (days <= 90) return { key: 'expiring', label: 'Expires in ' + days + 'd', badge: 'pending', days };
    return { key: 'ok', label: 'OK · ' + dateStr, badge: 'ok', days };
  }

  function ownerStockItems(id) { return (D.get().stock || []).filter(x => x.owner === id); }
  function ownerStockQty(id) { return ownerStockItems(id).reduce((a, b) => a + (b.quantity || 0), 0); }
  // products a contact is associated with — for doctors: RCPA brands + products discussed in
  // visits (used for CONTENT-RELEVANCE of engagement, never as a prescription-volume reward);
  // for chemists/distributors: products they stock.
  function contactProducts(id, kind) {
    const s = D.get(); const set = new Set();
    if (kind === 'Doctor') {
      (s.rcpa || []).filter(r => r.doctor === id).forEach(r => r.ourBrand && set.add(r.ourBrand));
      (s.visits || []).filter(v => v.targetId === id).forEach(v => (v.products || []).forEach(p => set.add(D.prodName(p))));
    } else {
      ownerStockItems(id).forEach(x => set.add(D.prodName(x.product)));
      (s.visits || []).filter(v => v.targetId === id).forEach(v => (v.products || []).forEach(p => set.add(D.prodName(p))));
    }
    return [...set].filter(Boolean).slice(0, 4);
  }
  const tierClass = (t) => (t || 'Silver').toLowerCase();
  function stockBadge(id) {
    const items = ownerStockItems(id);
    const bad = items.filter(x => { const k = expiryStatus(x.expiry).key; return k === 'expired' || k === 'expiring'; }).length;
    return bad ? ` <span class="badge danger" style="padding:1px 6px">${bad}⚠</span>` : (items.length ? ` <span class="muted">(${items.length})</span>` : '');
  }

  // days until the next annual occurrence of a MM-DD (birthday/anniversary)
  function daysUntilAnnual(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr); if (isNaN(d)) return null;
    const now = new Date(today());
    let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
    if (next < now) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
    return Math.round((next - now) / 86400000);
  }
  // tier-based gift guidance. Doctor suggestions are compliant engagement (fair value),
  // NOT prescription-linked rewards (UCPMP/NMC). Trade = chemists/distributors.
  const GIFT_TIER = {
    Platinum: { cap: 2500, doctor: 'Premium CME sponsorship / medical reference set (fair market value, logged)', trade: 'Premium festive hamper / branded gift set' },
    Gold: { cap: 1500, doctor: 'Journal subscription / CME materials (fair market value, logged)', trade: 'Festive hamper' },
    Silver: { cap: 750, doctor: 'Greeting + patient-education materials', trade: 'Greeting + branded merchandise' },
  };
  // km-based travel reimbursement rates (₹ per km)
  const TRAVEL_RATE = { Bike: 4, Car: 10 };
  // trade-scheme perk slabs by % of monthly target achieved (chemists & distributors)
  const PERK_SLABS = [
    { min: 100, label: '🏆 Target Achieved', badge: 'ok', rate: 0.03, perk: '3% credit note + premium trade scheme + festive gift' },
    { min: 80, label: 'On Track', badge: 'pending', rate: 0.015, perk: '1.5% credit note — reach 100% for the full perk' },
    { min: 0, label: 'Behind Target', badge: 'danger', rate: 0, perk: 'No scheme yet — push secondary sales' },
  ];
  const perkFor = (pct) => PERK_SLABS.find(s => pct >= s.min) || PERK_SLABS[PERK_SLABS.length - 1];
  function tradeAchievement(entity, kind) {
    const base = kind === 'Chemist' ? (entity.monthlyValue || 0) : (entity.secondarySales || 0);
    const fromOrders = ((D.get() || {}).orders || []).filter(o => o.party === entity.id && o.status !== 'Cancelled').reduce((a, b) => a + (b.amount || 0), 0);
    const achieved = base + fromOrders;
    const target = entity.target || 0;
    const pct = target > 0 ? Math.round(achieved / target * 100) : 0;
    return { achieved, base, fromOrders, target, pct, slab: perkFor(pct) };
  }
  // ---- Distribution module (per Pharma Distribution Module spec) ----------
  const DIST = { daysInPeriod: 30, minDOI: 15, maxDOI: 45, safetyDays: 15, maxStockDays: 60, leadTime: 5, imbalRatio: 1.5, returnAlert: 0.08, spikeFactor: 3, roundTripPct: 0.3 };
  // pricing: back-calculate PTR & PTS from MRP (MRP is GST-inclusive, fixed)
  const ptrOf = (mrp, gst, retMgn) => mrp / (1 + retMgn * (1 + gst));
  const ptsOf = (ptr, stkMgn) => ptr / (1 + stkMgn);
  const productPricing = (p) => {
    const mrp = p.mrp || p.price || 0, gst = p.gst ?? 0.12, ret = p.retailMargin ?? 0.20, stk = p.stockistMargin ?? 0.10;
    const ptr = ptrOf(mrp, gst, ret); return { mrp, gst, ret, stk, ptr, pts: ptsOf(ptr, stk) };
  };
  // channel-stock reconciliation + ROP replenishment for one recon row
  function reconCompute(r) {
    const s = D.get();
    const dist = (s.distributors || []).find(d => d.id === r.distributor) || {};
    const lead = dist.leadTime || DIST.leadTime;
    const opening = r.opening || 0, primary = r.primaryQty || 0, secondary = r.secondary || 0, returns = r.returns || 0;
    const closing = opening + primary - secondary - returns;
    const adss = secondary / DIST.daysInPeriod;
    const doi = adss > 0 ? closing / adss : (closing > 0 ? Infinity : 0);
    const safety = adss * DIST.safetyDays;
    const rop = adss * lead + safety;
    const maxStock = adss * DIST.maxStockDays;
    const suggest = closing <= rop ? Math.max(0, Math.round(maxStock - closing)) : 0;
    let status, sevClass;
    if (closing < 0) { status = 'Check Data (Negative)'; sevClass = 'danger'; }
    else if (closing <= 0 && secondary > 0) { status = 'Stockout'; sevClass = 'danger'; }
    else if (secondary === 0 && closing > 0) { status = 'No Offtake / Dead Stock'; sevClass = 'muted'; }
    else if (doi > DIST.maxDOI) { status = 'Overstock / Expiry Risk'; sevClass = 'pending'; }
    else if (doi < DIST.minDOI) { status = 'Low Stock / Reorder'; sevClass = 'pending'; }
    else { status = 'Healthy'; sevClass = 'ok'; }
    let action, actClass;
    if (closing < 0) { action = 'Check data'; actClass = 'danger'; }
    else if (status.startsWith('Overstock')) { action = 'Block (anti-dumping)'; actClass = 'danger'; }
    else if (secondary === 0) { action = 'No secondary — review'; actClass = 'muted'; }
    else if (closing < safety) { action = 'URGENT — below safety'; actClass = 'danger'; }
    else if (closing <= rop) { action = 'Order now'; actClass = 'pending'; }
    else { action = 'OK'; actClass = 'ok'; }
    // anomaly flags
    const flags = [];
    if (closing < 0) flags.push('Negative pipeline');
    if (secondary > 0 && primary > DIST.imbalRatio * secondary && doi > DIST.maxDOI) flags.push('Primary stuffing');
    if (returns > DIST.roundTripPct * secondary && secondary > 0) flags.push('Round-trip returns');
    return { dist, lead, opening, primary, secondary, returns, closing, adss, doi, safety, rop, maxStock, suggest, status, sevClass, action, actClass, flags };
  }

  const DAILY_TARGET = { doctors: 10, chemists: 5 }; // per field rep, per day (spec)
  // salesperson incentive slabs by performance score (coverage + geo-verification + daily target)
  const REP_PERK_SLABS = [
    { min: 90, label: '🏆 Star Performer', badge: 'ok', amount: 15000, reward: '₹15,000 incentive + Star Performer badge + 1 extra leave' },
    { min: 75, label: 'Achiever', badge: 'pending', amount: 7500, reward: '₹7,500 incentive + recognition' },
    { min: 60, label: 'On Track', badge: 'info', amount: 3000, reward: '₹3,000 incentive' },
    { min: 0, label: 'Below Target', badge: 'danger', amount: 0, reward: 'No incentive yet — raise coverage & hit daily target' },
  ];
  const repPerkFor = (pct) => REP_PERK_SLABS.find(s => pct >= s.min) || REP_PERK_SLABS[REP_PERK_SLABS.length - 1];
  // budget & expense approvals are limited to Admin and the Accounts department
  const canApproveBudget = () => ['Admin', 'Accounts'].includes((D.user() || {}).role);
  // RBM, Business Head and Admin can set employee daily targets
  const canSetEmpTarget = () => ['Admin', 'Business Head', 'RBM'].includes((D.user() || {}).role);
  const canEditExpense = canApproveBudget;

  // ---- smart alerts / notifications --------------------------------------
  function computeAlerts() {
    const s = D.get(); if (!s) return [];
    const role = (D.user() || {}).role; const A = [];
    const stock = (s.stock || []).map(x => expiryStatus(x.expiry).key);
    const expired = stock.filter(k => k === 'expired').length;
    const expiring = stock.filter(k => k === 'expiring').length;
    if (expired) A.push({ sev: 'danger', icon: '📦', text: `${expired} stock batch(es) expired`, route: 'inventory' });
    if (expiring) A.push({ sev: 'warn', icon: '📦', text: `${expiring} batch(es) expiring within 90 days`, route: 'inventory' });
    const pend = (s.approvals || []).filter(a => a.status === 'Pending').length;
    if (pend && ['Admin', 'Accounts'].includes(role)) A.push({ sev: 'warn', icon: '🗂️', text: `${pend} approval(s) awaiting your decision`, route: 'approvals' });
    let soon = 0; const add = (d) => { const dd = daysUntilAnnual(d); if (dd != null && dd <= 7) soon++; };
    s.doctors.forEach(d => { add(d.dob); add(d.anniversary); }); s.chemists.forEach(c => add(c.dob)); s.distributors.forEach(d => add(d.dob));
    if (soon) A.push({ sev: 'info', icon: '🎁', text: `${soon} celebration(s) in the next 7 days`, route: 'gifting' });
    const flagged = (s.visits || []).filter(v => !v.geoVerified).length;
    if (flagged) A.push({ sev: 'danger', icon: '🛰️', text: `${flagged} visit(s) flagged (mock-location)`, route: 'gps' });
    const withRcpa = new Set((s.rcpa || []).map(r => r.doctor));
    const noRcpa = s.doctors.filter(d => !withRcpa.has(d.id)).length;
    if (noRcpa) A.push({ sev: 'info', icon: '📈', text: `${noRcpa} doctor(s) need an RCPA`, route: 'rcpa' });
    const below = [...s.chemists.map(c => tradeAchievement(c, 'Chemist')), ...s.distributors.map(d => tradeAchievement(d, 'Distributor'))].filter(a => a.target > 0 && a.pct < 80).length;
    if (below) A.push({ sev: 'warn', icon: '🏆', text: `${below} trade partner(s) below 80% of target`, route: 'schemes' });
    return A;
  }
  function bellHtml() {
    const A = computeAlerts();
    return `<div class="bell">
      <button class="iconbtn" data-action="toggleAlerts" title="Notifications">🔔${A.length ? `<span class="bell-badge">${A.length}</span>` : ''}</button>
      <div id="alerts-panel" class="alerts-panel hidden">
        <div class="alerts-head">Alerts <span class="muted">${A.length}</span></div>
        ${A.length ? A.map(a => `<div class="alert-row" data-route="${a.route}"><span class="dot ${a.sev}"></span><span class="ic">${a.icon}</span><span>${esc(a.text)}</span></div>`).join('')
          : '<div class="alert-row"><span class="muted">All clear — nothing needs attention 🎉</span></div>'}
      </div></div>`;
  }

  function tierBadge(t) { return `<span class="badge ${t.toLowerCase()}">● ${t}</span>`; }
  function statusBadge(s) {
    const m = { Approved: 'ok', Pending: 'pending', Rejected: 'danger', Done: 'ok', Active: 'ok', Planned: 'info', Positive: 'ok', Neutral: 'muted', Negative: 'danger' };
    return `<span class="badge ${m[s] || 'muted'}">${s}</span>`;
  }

  // ---- navigation ---------------------------------------------------------
  // clean line-icons (Feather-style) keyed by route — replaces emoji glyphs
  const _si = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const NAV_ICONS = {
    dashboard: _si('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>'),
    planner: _si('<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>'),
    ai: _si('<path d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6z"/><path d="M18.5 14.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>'),
    doctors: _si('<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>'),
    chemists: _si('<rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><line x1="12" y1="8.5" x2="12" y2="15.5"/>'),
    distributors: _si('<rect x="1" y="4" width="14" height="12" rx="1.5"/><path d="M15 8h4l4 4v4h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
    visits: _si('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.8"/>'),
    targets: _si('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
    rcpa: _si('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
    gps: _si('<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
    campaigns: _si('<path d="M3 11v2a1 1 0 0 0 1 1h2l3.5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7"/><path d="M18.5 5a8 8 0 0 1 0 14"/>'),
    edetailing: _si('<circle cx="12" cy="12" r="9"/><polygon points="10 8.5 16 12 10 15.5 10 8.5"/>'),
    distribution: _si('<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><line x1="8.3" y1="10.7" x2="15.7" y2="6.3"/><line x1="8.3" y1="13.3" x2="15.7" y2="17.7"/>'),
    orders: _si('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'),
    inventory: _si('<path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8"/><path d="M3.3 7 12 12l8.7-5"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M3.3 7 12 2l8.7 5"/>'),
    schemes: _si('<circle cx="12" cy="8.5" r="5.5"/><path d="M8.5 13 7 22l5-2.8L17 22l-1.5-9"/>'),
    gifting: _si('<polyline points="20 12 20 21 4 21 4 12"/><rect x="2.5" y="7.5" width="19" height="4.5" rx="1"/><line x1="12" y1="21" x2="12" y2="7.5"/><path d="M12 7.5H8a2.5 2.5 0 0 1 0-5c3 0 4 5 4 5z"/><path d="M12 7.5h4a2.5 2.5 0 0 0 0-5c-3 0-4 5-4 5z"/>'),
    approvals: _si('<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14 9 11"/>'),
    accounts: _si('<rect x="2.5" y="5.5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="17" cy="15" r="1.3"/>'),
    reports: _si('<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>'),
    hr: _si('<rect x="2.5" y="7.5" width="19" height="13" rx="2"/><path d="M16 20.5V5.5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v15"/>'),
    products: _si('<path d="M9 3h6"/><path d="M10 3v5.5L5.5 17A2 2 0 0 0 7.3 20h9.4a2 2 0 0 0 1.8-3L14 8.5V3"/><line x1="8" y1="14.5" x2="16" y2="14.5"/>'),
    team: _si('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    settings: _si('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  };
  const NAV = [
    { group: 'Overview', items: [
      ['dashboard', '📊', 'Executive Dashboard'],
      ['planner', '✅', 'Daily Planner (AI)'],
      ['ai', '🤖', 'AI Sales Copilot'],
    ]},
    { group: 'Relationships', items: [
      ['doctors', '🩺', 'Doctors'],
      ['chemists', '💊', 'Chemists'],
      ['distributors', '🚚', 'Distributors'],
    ]},
    { group: 'Field Force', items: [
      ['visits', '📍', 'Visits & SFA'],
      ['targets', '🎯', 'Targets & Coverage'],
      ['rcpa', '📈', 'RCPA Engine'],
      ['gps', '🛰️', 'GPS & Field Tracking'],
    ]},
    { group: 'Commercial', items: [
      ['campaigns', '📣', 'PMT / CLM Campaigns'],
      ['edetailing', '🎬', 'E-Detailing'],
      ['distribution', '🏭', 'Distribution Engine'],
      ['orders', '📑', 'Orders & Sales'],
      ['inventory', '📦', 'Stock & Expiry'],
      ['schemes', '🏆', 'Trade Schemes & Perks'],
      ['gifting', '🎁', 'Gifting & Celebrations'],
      ['approvals', '🗂️', 'Approval Workflow'],
      ['accounts', '💰', 'Samples · Spend · Accounts'],
      ['reports', '📄', 'Reports & Exports'],
    ]},
    { group: 'Admin', items: [
      ['hr', '🧑‍💼', 'HR & Payroll'],
      ['products', '🧪', 'Products (SKU Master)'],
      ['team', '👥', 'Team & Hierarchy'],
      ['settings', '⚙️', 'Settings & Tenant'],
    ]},
  ];
  const TITLES = Object.fromEntries(NAV.flatMap(g => g.items.map(i => [i[0], i[2]])));
  // role-restricted pages (omitted = visible to everyone). Employee target/incentive
  // tracking is management-only.
  const PAGE_ACCESS = {
    targets: ['Admin', 'Accounts', 'RBM', 'Business Head'],
  };
  const canAccess = (route) => !PAGE_ACCESS[route] || PAGE_ACCESS[route].includes((D.user() || {}).role);

  // ---- AUTH (portals · role login · signup) ------------------------------
  let authScreen = 'landing', authRole = null;
  const ROLE_PORTALS = [
    { role: 'Business Head', color: '#0c5c4c', blurb: 'Division P&L · all-region visibility · targets', demo: 'vikram@amber.test' },
    { role: 'RBM', color: '#10a37f', blurb: 'Regional performance · escalation approvals', demo: 'anita@amber.test' },
    { role: 'ABM', color: '#2563eb', blurb: 'Area execution · raise approval requests', demo: 'rohit@amber.test' },
    { role: 'TSM', color: '#7c3aed', blurb: 'Daily field visits · RCPA · samples', demo: 'karan@amber.test' },
    { role: 'PMT', color: '#e0a106', blurb: 'Campaigns · CLM content · scientific briefs', demo: 'meera@amber.test' },
    { role: 'Accounts', color: '#0891b2', blurb: 'Stock · spend · budgets · final approvals', demo: 'sanjay@amber.test' },
    { role: 'Admin', color: '#475569', blurb: 'Users · master data · tenant configuration', demo: 'admin@amber.test' },
  ];
  // clean SVG line-icons per role (replaces emoji)
  const ROLE_ICONS = {
    'Business Head': _si('<path d="M3 21h18"/><path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17"/><path d="M15 21v-9h3a1 1 0 0 1 1 1v8"/><line x1="8" y1="7" x2="12" y2="7"/><line x1="8" y1="11" x2="12" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/>'),
    RBM: _si('<polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/>'),
    ABM: _si('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.8"/>'),
    TSM: _si('<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>'),
    PMT: _si('<path d="M3 11v2a1 1 0 0 0 1 1h2l3.5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8.5a4 4 0 0 1 0 7"/><path d="M18.5 5a8 8 0 0 1 0 14"/>'),
    Accounts: _si('<rect x="2.5" y="5.5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><circle cx="17" cy="15" r="1.3"/>'),
    Admin: _si('<path d="M12 2 4 5v6c0 5 3.5 8.6 8 10 4.5-1.4 8-5 8-10V5l-8-3z"/><path d="m9 12 2 2 4-4"/>'),
  };
  const FEAT_ICONS = {
    map: _si('<polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/>'),
    chart: _si('<line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>'),
    shield: _si('<path d="M12 2 4 5v6c0 5 3.5 8.6 8 10 4.5-1.4 8-5 8-10V5l-8-3z"/><path d="m9 12 2 2 4-4"/>'),
  };
  const SIGNUP_DIVISIONS = [['DIV1', 'Cardiac Care'], ['DIV2', 'Diabetic & Endo'], ['DIV3', 'Gastro'], ['DIV4', 'Ortho & Pain']];

  // shared split-screen auth shell: branded aside + form column
  function authShell(box) {
    return `
      <div class="auth-shell">
        <div class="auth-aside">
          <div class="auth-aside-in">
            <div class="logo lg"><span class="mark">A</span> Amber LifeSciences</div>
            <h1>Pharma Commercial Operating System</h1>
            <p>Field-force automation, RCPA, distribution, approvals and an AI sales copilot — one platform for the entire commercial engine.</p>
            <ul class="auth-feat">
              <li><span class="fic">${FEAT_ICONS.map}</span> Live GPS field tracking &amp; geo-verified visits</li>
              <li><span class="fic">${FEAT_ICONS.chart}</span> RCPA Rx-share &amp; executive analytics</li>
              <li><span class="fic">${FEAT_ICONS.shield}</span> UCPMP-compliant approvals &amp; full audit trail</li>
            </ul>
            <div class="auth-aside-foot">Secure sign-in · Role-based access control</div>
          </div>
          <span class="orb o1"></span><span class="orb o2"></span>
        </div>
        <div class="auth-main"><div class="auth-box">${box}</div></div>
      </div>`;
  }

  function bindAuthLinks() {
    document.querySelectorAll('[data-auth]').forEach(a => {
      a.style.cursor = 'pointer';
      a.onclick = (e) => { e.preventDefault(); authScreen = a.dataset.auth; if (authScreen !== 'login') authRole = null; renderAuth(); };
    });
    document.querySelectorAll('[data-pwtoggle]').forEach(b => {
      b.onclick = () => { const i = $('#' + b.dataset.pwtoggle); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; };
    });
  }

  function renderAuth() {
    document.body.className = '';
    if (authScreen === 'signup') return renderSignup();
    if (authScreen === 'login' && authRole) return renderRoleLogin(authRole);
    return renderLanding();
  }

  function renderLanding() {
    document.body.innerHTML = authShell(`
      <div class="logo mob-only"><span class="mark">A</span> Amber LifeSciences</div>
      <h2>Welcome back</h2>
      <p class="tag">Select your designation to sign in</p>
      <div class="portal-grid">
        ${ROLE_PORTALS.map(p => `<button class="portal" data-portal="${p.role}" style="--pc:${p.color}">
          <span class="pic">${ROLE_ICONS[p.role] || ''}</span><b>${p.role}</b><small>${p.blurb}</small></button>`).join('')}
      </div>
      <p class="tag center">New to Amber? <a data-auth="signup"><b>Create an account</b></a></p>`);
    document.querySelectorAll('[data-portal]').forEach(b => b.onclick = () => { authRole = b.dataset.portal; authScreen = 'login'; renderAuth(); });
    bindAuthLinks();
  }

  function renderRoleLogin(role, err) {
    const p = ROLE_PORTALS.find(x => x.role === role) || ROLE_PORTALS[0];
    document.body.innerHTML = authShell(`
      <div style="--pc:${p.color}">
        <a class="back" data-auth="landing">‹ All portals</a>
        <div class="role-head" style="--pc:${p.color}"><span class="role-ic">${ROLE_ICONS[role] || ''}</span>
          <div><div class="logo-sm">Amber LifeSciences</div><h2>${esc(role)} sign-in</h2></div></div>
        <p class="tag">${esc(p.blurb)}</p>
        <div class="field"><label>Email</label><input id="lg-email" type="email" value="${p.demo}" autocomplete="username"></div>
        <div class="field"><label>Password</label>
          <div class="pw-wrap"><input id="lg-pass" type="password" value="amber123" autocomplete="current-password"><button type="button" class="pw-toggle" data-pwtoggle="lg-pass">Show</button></div>
        </div>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <button class="btn" id="lg-go" style="background:${p.color}">Sign in as ${esc(role)}</button>
        <p class="tag center">Not a ${esc(role)}? <a data-auth="landing">Switch portal</a> &nbsp;·&nbsp; <a data-auth="signup">Sign up</a></p>
      </div>`);
    const go = async () => {
      const btn = $('#lg-go'); btn.textContent = 'Signing in…'; btn.disabled = true;
      try {
        session = await D.login($('#lg-email').value.trim(), $('#lg-pass').value, role);
        location.hash = '#dashboard'; route();
      } catch (e) { renderRoleLogin(role, e.message); }
    };
    $('#lg-go').onclick = go;
    $('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    bindAuthLinks();
  }

  function renderSignup(err, vals) {
    const v = vals || {};
    const roles = ROLE_PORTALS.filter(p => p.role !== 'Admin');
    document.body.innerHTML = authShell(`
      <a class="back" data-auth="landing">‹ Back to portals</a>
      <div class="logo mob-only"><span class="mark">A</span> Amber LifeSciences</div>
      <h2>Create your account</h2><p class="tag">Self-register to join the Amber commercial platform</p>
      <div class="field"><label>Full name</label><input id="su-name" value="${esc(v.name || '')}"></div>
      <div class="field"><label>Work email</label><input id="su-email" type="email" placeholder="name@company.com" value="${esc(v.email || '')}"></div>
      <div class="grid2">
        <div class="field"><label>Designation</label><select id="su-role">${roles.map(r => `<option ${v.role === r.role ? 'selected' : ''}>${r.role}</option>`).join('')}</select></div>
        <div class="field"><label>Division</label><select id="su-div">${SIGNUP_DIVISIONS.map(d => `<option value="${d[0]}" ${v.div === d[0] ? 'selected' : ''}>${d[1]}</option>`).join('')}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Password</label><div class="pw-wrap"><input id="su-pass" type="password" placeholder="min 6 characters"><button type="button" class="pw-toggle" data-pwtoggle="su-pass">Show</button></div></div>
        <div class="field"><label>Confirm password</label><input id="su-pass2" type="password"></div>
      </div>
      ${err ? `<p class="err">${esc(err)}</p>` : ''}
      <button class="btn" id="su-go">Create account &amp; sign in</button>
      <p class="tag center">Already have an account? <a data-auth="landing">Sign in</a></p>`);
    $('#su-go').onclick = async () => {
      const name = $('#su-name').value.trim(), email = $('#su-email').value.trim();
      const pass = $('#su-pass').value, pass2 = $('#su-pass2').value;
      const role = $('#su-role').value, div = $('#su-div').value;
      const keep = { name, email, role, div };
      if (!name || !email || !pass) return renderSignup('Please fill in name, email and password', keep);
      if (pass.length < 6) return renderSignup('Password must be at least 6 characters', keep);
      if (pass !== pass2) return renderSignup('Passwords do not match', keep);
      const btn = $('#su-go'); btn.textContent = 'Creating account…'; btn.disabled = true;
      try {
        session = await D.signup({ name, email, password: pass, role, division: div });
        location.hash = '#dashboard'; route();
      } catch (e) { renderSignup(e.message, keep); }
    };
    bindAuthLinks();
  }

  // ---- SHELL --------------------------------------------------------------
  function renderShell(route) {
    document.body.className = '';
    document.body.innerHTML = `
      <div class="app">
        <div class="nav-backdrop" data-action="closeNav"></div>
        <aside class="sidebar">
          <div class="logo"><span class="mark">A</span> Amber <button class="iconbtn drawer-x" data-action="closeNav" title="Close">✕</button></div>
          <nav class="nav">
            ${NAV.map(g => { const items = g.items.filter(i => canAccess(i[0])); return items.length ? `<div class="nav-group">${g.group}</div>` +
              items.map(i => `<a href="#${i[0]}" data-route="${i[0]}" class="${i[0] === route ? 'active' : ''}"><span class="ic">${NAV_ICONS[i[0]] || i[1]}</span>${i[2]}</a>`).join('') : ''; }).join('')}
          </nav>
        </aside>
        <header class="topbar">
          <button class="iconbtn menu-btn" data-action="toggleNav" title="Menu">☰</button>
          <div>
            <div class="crumb">Amber LifeSciences › ${esc(D.divName(session.division))}</div>
            <h2 id="page-title">${TITLES[route] || ''}</h2>
          </div>
          <div class="spacer"></div>
          <button class="iconbtn viewbtn" data-action="toggleView" title="Switch desktop / phone view"><span class="vb-phone">📱</span><span class="vb-desk">🖥️</span></button>
          ${bellHtml()}
          <button class="btn ghost sm logvisit-btn" data-action="newVisit"><span class="lv-full">＋ Log Visit</span><span class="lv-short">＋</span></button>
          <div class="who">
            <div class="meta right"><b>${esc(session.name)}</b><br><span>${esc(session.role)}</span></div>
            <div class="avatar">${esc(session.name[0])}</div>
            <button class="btn ghost sm logout-btn" data-action="logout">Logout</button>
          </div>
        </header>
        <main class="main" id="main"></main>
      </div>`;
    if (liveWatch != null) { try { navigator.geolocation.clearWatch(liveWatch); } catch (e) {} liveWatch = null; }
    $('#main').innerHTML = (VIEWS[route] || VIEWS.dashboard)();
    bindRoute();
    if (AFTER[route]) AFTER[route]();
  }

  function bindRoute() {
    document.querySelectorAll('[data-route]').forEach(a => a.onclick = (e) => {
      e.preventDefault(); location.hash = a.dataset.route;
    });
  }

  // ---- VIEWS --------------------------------------------------------------
  const VIEWS = {
    dashboard() {
      const s = D.get(), m = s.metrics, st = dashState;
      const empDiv = (id) => (s.employees.find(e => e.id === id) || {}).division;
      const inDiv = (repId) => st.division === 'all' || empDiv(repId) === st.division;

      const doctors = s.doctors.filter(d => inDiv(d.rep));
      const visits = s.visits.filter(v => inDiv(v.rep));
      const pendingAppr = s.approvals.filter(a => a.status === 'Pending' && inDiv(a.raisedBy));
      const expenses = s.expenses.filter(x => inDiv(x.rep));
      const spend = expenses.reduce((a, b) => a + b.amount, 0);
      const commits = visits.reduce((a, b) => a + (b.commitment || 0), 0);

      const months = st.period === 'month' ? 1 : st.period === 'quarter' ? 3 : 6;
      const trend = s.salesTrend.slice(-months);
      const revenue = trend.reduce((a, b) => a + b.primary, 0);
      const periodLabel = { month: 'This Month', quarter: 'This Quarter', ytd: 'Year to Date' }[st.period];
      const divName = st.division === 'all' ? 'All Divisions' : D.divName(st.division);

      const platinum = doctors.filter(d => d.tier === 'Platinum').length;
      const firstName = (session && session.name ? session.name : 'there').split(/\s+/)[0];

      const kpis = [
        { label: 'Total Revenue', val: '₹' + revenue + 'L', icon: 'revenue', tone: 'green', route: 'accounts', delta: dbxDelta(m.revenueGrowth + '% YoY', 'up') },
        { label: 'Active Doctors', val: doctors.length, icon: 'users', tone: 'blue', route: 'doctors', delta: dbxDelta(platinum + ' Platinum', platinum ? 'up' : 'flat') },
        { label: 'Field Visits', val: visits.length, icon: 'activity', tone: 'amber', route: 'visits', delta: dbxDelta(commits + ' units committed', 'up') },
        { label: 'Pending Approvals', val: pendingAppr.length, icon: 'approvals', tone: 'violet', route: 'approvals', delta: pendingAppr.length ? dbxDelta('awaiting action', 'down') : dbxDelta('all clear', 'up') },
      ];

      const seg = (action, dataKey, opts, cur) => `<div class="dbx-seg">${opts.map(o => `<span class="${cur === o[0] ? 'active' : ''}" data-action="${action}" data-${dataKey}="${o[0]}">${esc(o[1])}</span>`).join('')}</div>`;
      const periodSeg = seg('dashPeriod', 'period', [['month', 'Month'], ['quarter', 'Quarter'], ['ytd', 'YTD']], st.period);
      const divSeg = seg('dashDiv', 'div', [['all', 'All'], ...s.divisions.map(d => [d.id, d.name.split(' ')[0]])], st.division);
      const seriesSeg = seg('dashSeries', 'series', [['both', 'Both'], ['primary', 'Primary'], ['secondary', 'Secondary']], st.series);

      const divBars = s.divisions.map((d, i) => ({
        label: d.name.split(' ')[0], val: [68, 54, 41, 47][i],
        color: ['#6d5ae6', '#3b82f6', '#10b981', '#f59e0b'][i % 4],
        action: 'dashDiv', div: d.id, tip: d.name + ' — ' + [68, 54, 41, 47][i] + '% of target', active: st.division === d.id,
      }));

      const recent = visits.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 6);

      return `
      <div class="dbx">
        <div class="dbx-hero">
          <div>
            <h1>Welcome back, ${esc(firstName)}</h1>
            <p>Here's what's happening across ${esc(divName)} — ${periodLabel.toLowerCase()}.</p>
          </div>
          <button class="dbx-btn" data-route="visits">View field activity <span aria-hidden="true">→</span></button>
        </div>

        <div class="dbx-toolbar">
          <div class="flex" style="gap:14px;flex-wrap:wrap;align-items:center">
            <div class="flex" style="gap:8px;align-items:center"><span class="dbx-tl">Period</span>${periodSeg}</div>
            <div class="flex" style="gap:8px;align-items:center"><span class="dbx-tl">Division</span>${divSeg}</div>
          </div>
          <div class="flex" style="gap:8px">
            <button class="btn ghost sm" data-action="dashRefresh">Refresh</button>
            <button class="btn ghost sm" data-action="dashExport">Export CSV</button>
          </div>
        </div>

        <div class="dbx-kpis">
          ${kpis.map(k => `<div class="dbx-kpi ${st.division !== 'all' && k.route === 'doctors' ? 'sel' : ''}" data-route="${k.route}">
            <div class="dbx-kpi-top">
              <span class="dbx-kpi-label">${k.label}</span>
              <span class="dbx-kpi-icon ${k.tone}">${DBX_ICONS[k.icon]}</span>
            </div>
            <div class="dbx-kpi-val">${k.val}</div>
            ${k.delta}
          </div>`).join('')}
        </div>

        <div class="dbx-split">
          <div class="dbx-card">
            <div class="dbx-card-head">
              <div><h3>Sales Overview</h3><div class="s">Primary vs secondary · ₹ lakh · ${periodLabel}</div></div>
              ${seriesSeg}
            </div>
            ${areaChart(trend, 640, 250, st.series)}
            <div class="legend" style="margin-top:4px">${st.series !== 'secondary' ? '<span><i style="background:#6d5ae6"></i>Primary</span>' : ''}${st.series !== 'primary' ? '<span><i style="background:#f59e0b"></i>Secondary</span>' : ''}</div>
          </div>
          <div class="dbx-card">
            <div class="dbx-card-head"><div><h3>Recent Activity</h3><div class="s">Latest field check-ins</div></div><a class="dbx-link" data-route="visits" href="#visits">View all</a></div>
            <div class="dbx-feed">
              ${recent.length ? recent.map((v, i) => {
                const name = v.type === 'Doctor' ? D.docName(v.targetId) : D.chemName(v.targetId);
                return `<div class="dbx-feed-item" data-action="view" data-res="visits" data-id="${v.id}">
                  ${dbxAvatar(D.empName(v.rep), i)}
                  <div class="dbx-feed-txt"><b>${esc(D.empName(v.rep))}</b> ${v.type === 'Doctor' ? 'visited' : 'called on'} <span class="lk">${esc(name)}</span>${v.commitment ? ` · <b>${v.commitment}</b> units` : ''}<div class="t">${v.geoVerified ? '<span class="dbx-dot ok"></span>Geo-verified' : '<span class="dbx-dot bad"></span>Unverified'} · ${dbxAgo(v.date)}</div></div>
                </div>`;
              }).join('') : '<p class="muted">No activity for ' + esc(divName) + '.</p>'}
            </div>
          </div>
        </div>

        <div class="dbx-split3">
          <div class="dbx-card"><div class="dbx-card-head"><div><h3>Doctors by Tier</h3><div class="s">${doctors.length} active doctors</div></div><a class="dbx-link" data-route="doctors" href="#doctors">Details</a></div>${pieChart(groupSegments(doctors, d => d.tier || 'Silver', { Platinum: '#7c6bf0', Gold: '#f59e0b', Silver: '#94a3b8' }))}</div>
          <div class="dbx-card"><div class="dbx-card-head"><div><h3>Division Performance</h3><div class="s">Target achievement % · click a bar</div></div></div>${barChart(divBars)}</div>
          <div class="dbx-card"><div class="dbx-card-head"><div><h3>Coverage &amp; Adoption</h3><div class="s">Key commercial metrics</div></div></div>
            <div style="display:flex;flex-direction:column;gap:15px;margin-top:12px">
              ${[['Doctor Coverage', m.doctorCoverage, '#10b981', 'doctors'], ['Campaign Effectiveness', m.campaignEffectiveness, '#3b82f6', 'campaigns'], ['AI Adoption', m.aiAdoption, '#7c6bf0', 'ai']].map(c => `<div class="between" style="cursor:pointer" data-route="${c[3]}"><span style="font-size:13px;color:var(--ink-2)">${c[0]}</span><div class="flex" style="gap:10px"><div class="bar" style="width:110px"><i style="width:${c[1]}%;background:${c[2]}"></i></div><b style="width:34px;text-align:right">${c[1]}%</b></div></div>`).join('')}
            </div>
          </div>
        </div>

        <div class="between" style="margin:6px 2px 0"><h2 style="font-size:17px;margin:0;font-weight:700">Data Breakdown</h2><span class="pill">${esc(divName)} · click a card to drill in</span></div>
        <div class="dbx-split3">
          <div class="dbx-card" data-route="doctors" style="cursor:pointer"><h3>Doctors by Tier</h3><div class="s" style="margin-bottom:10px">${doctors.length} doctors</div>${pieChart(groupSegments(doctors, d => d.tier || 'Silver', { Platinum: '#7c6bf0', Gold: '#f59e0b', Silver: '#94a3b8' }))}</div>
          <div class="dbx-card" data-route="visits" style="cursor:pointer"><h3>Visits by Sentiment</h3><div class="s" style="margin-bottom:10px">${visits.length} visits</div>${pieChart(groupSegments(visits, v => v.sentiment, { Positive: '#10b981', Neutral: '#94a3b8', Negative: '#e5484d' }))}</div>
          <div class="dbx-card" data-route="approvals" style="cursor:pointer"><h3>Approvals by Status</h3><div class="s" style="margin-bottom:10px">${s.approvals.length} requests</div>${pieChart(groupSegments(s.approvals, a => a.status, { Pending: '#f59e0b', Approved: '#10b981', Rejected: '#e5484d', Done: '#6d5ae6' }))}</div>
          <div class="dbx-card" data-route="inventory" style="cursor:pointer"><h3>Stock by Expiry</h3><div class="s" style="margin-bottom:10px">${(s.stock || []).length} batches</div>${pieChart(stockExpirySegments())}</div>
          <div class="dbx-card" data-route="accounts" style="cursor:pointer"><h3>Expenses by Type</h3><div class="s" style="margin-bottom:10px">${s.expenses.length} claims</div>${pieChart(groupSegments(s.expenses, e => e.type))}</div>
          <div class="dbx-card" data-route="campaigns" style="cursor:pointer"><h3>Campaigns by Status</h3><div class="s" style="margin-bottom:10px">${s.campaigns.length} campaigns</div>${pieChart(groupSegments(s.campaigns, c => c.status, { Active: '#10b981', Planned: '#3b82f6', Completed: '#94a3b8' }))}</div>
        </div>

        <div class="dbx-card">
          <div class="dbx-card-head"><div><h3>Live Approval Queue</h3><div class="s">ABM → RBM → Accounts</div></div><span class="pill">${pendingAppr.length} pending</span></div>
          ${pendingAppr.length ? approvalsTable(pendingAppr, true) : '<p class="muted">No pending approvals for ' + esc(divName) + '.</p>'}
        </div>
      </div>`;
    },

    planner() {
      const s = D.get();
      const mine = s.todos;
      const done = mine.filter(t => t.done).length;
      return `
      <div class="note">🤖 <b>AI-generated to-do</b> — Sonnet 4.6 builds this list each morning from RCPA gaps, visit frequency, commitments & celebration triggers. ${done}/${mine.length} completed today.</div>
      <div class="grid cols-2 mt">
        <div class="card">
          <div class="section-head"><h3>Today's Guided Plan</h3>${addBtn('todos', 'Add task')}</div>
          <div class="sub">~10 doctors + 5 chemists target</div>
          ${mine.map(t => `<div class="between" style="padding:11px 0;border-bottom:1px solid var(--line)">
            <label class="flex" style="cursor:pointer">
              <input type="checkbox" data-action="toggleTodo" data-id="${t.id}" ${t.done ? 'checked' : ''}>
              <span style="${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.text)}<br><small class="muted">↳ ${esc(t.reason)}</small></span>
            </label>
            <span class="flex"><span class="badge ${t.priority === 'High' ? 'danger' : t.priority === 'Medium' ? 'pending' : 'muted'}">${t.priority}</span>
            <button class="btn ghost sm" data-action="edit" data-res="todos" data-id="${t.id}">Edit</button>
            <button class="btn ghost sm" data-action="del" data-res="todos" data-id="${t.id}" title="Delete">✕</button></span>
          </div>`).join('')}
        </div>
        <div class="card">
          <h3>Route for Today</h3><div class="sub">Optimised Bandra → Andheri circuit</div>
          <ul class="tl">
            <li><b>10:00 — Dr. Suresh Menon</b> · Lilavati, Bandra <span class="badge platinum">● Platinum</span><br><small>Geofence ready · share titration study</small></li>
            <li><b>11:30 — Apollo Pharmacy</b> · Linking Rd<br><small>Stock check + RCPA</small></li>
            <li><b>13:00 — Dr. Imran Shaikh</b> · Holy Family <span class="badge gold">● Gold</span><br><small>RCPA overdue</small></li>
            <li><b>15:00 — Dr. Arjun Pillai</b> · Nanavati <span class="badge platinum">● Platinum</span><br><small>Anniversary campaign</small></li>
          </ul>
          <button class="btn sm" data-action="newVisit">＋ Check-in & log a visit</button>
        </div>
      </div>`;
    },

    doctors() {
      const s = D.get();
      return `
      <div class="card">
        <div class="section-head"><h2>Doctor Profiling</h2>${addBtn('doctors', 'Add Doctor')}</div>
        <div class="between" style="margin-bottom:14px">
          <div class="chip-row" id="doc-filter">
            ${['All', 'Platinum', 'Gold', 'Silver'].map((t, i) => `<span class="chip ${i === 0 ? 'active' : ''}" data-action="filterDoc" data-tier="${t}">${t}</span>`).join('')}
          </div>
          <input data-search="doc-table" placeholder="🔍 Search doctors…" style="max-width:240px;padding:8px 11px;border:1px solid var(--line);border-radius:9px">
        </div>
        <div class="table-wrap"><table id="doc-table">
          <thead><tr><th>Doctor</th><th>Specialty</th><th>Hospital / City</th><th>Tier</th><th>Potential</th><th>Last Visit</th><th>Rep</th><th></th></tr></thead>
          <tbody>${s.doctors.map(docRow).join('')}</tbody>
        </table></div>
      </div>
      <div class="note mt">🛡️ <b>Compliance:</b> Silver/Gold/Platinum tiers drive <b>engagement intensity</b> (CME, scientific services at fair value) — never prescription-linked rewards, per UCPMP/NMC.</div>`;
    },

    schemes() {
      const s = D.get();
      const list = [
        ...s.chemists.map(c => ({ e: c, kind: 'Chemist', res: 'chemists' })),
        ...s.distributors.map(d => ({ e: d, kind: 'Distributor', res: 'distributors' })),
      ].map(x => ({ ...x, ach: tradeAchievement(x.e, x.kind) }))
        .sort((a, b) => b.ach.pct - a.ach.pct);

      const achieved = list.filter(x => x.ach.pct >= 100).length;
      const onTrack = list.filter(x => x.ach.pct >= 80 && x.ach.pct < 100).length;
      const payout = list.reduce((a, x) => a + x.ach.slab.rate * x.ach.achieved, 0);
      const totTarget = list.reduce((a, x) => a + x.ach.target, 0);
      const totAch = list.reduce((a, x) => a + x.ach.achieved, 0);

      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Partners Achieved Target</span><span class="val" style="color:var(--ok)">${achieved}/${list.length}</span><span class="delta up">perk unlocked 🏆</span></div>
        <div class="card kpi"><span class="label">On Track (≥80%)</span><span class="val" style="color:var(--warn)">${onTrack}</span><span class="delta">close to target</span></div>
        <div class="card kpi"><span class="label">Network Achievement</span><span class="val">${totTarget ? Math.round(totAch / totTarget * 100) : 0}%</span><span class="delta">${inr(totAch)} / ${inr(totTarget)}</span></div>
        <div class="card kpi"><span class="label">Est. Incentive Payout</span><span class="val">${inr(Math.round(payout))}</span><span class="delta">credit notes due</span></div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2>Trade Targets &amp; Perks</h2><span class="pill">≥100% = 3% · ≥80% = 1.5%</span></div>
        <div class="sub" style="margin-top:-8px">Monthly target vs achieved (chemist monthly sales / distributor secondary sales). Edit a partner to set their target.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Partner</th><th>Type</th><th>Tier</th><th>Target</th><th>Achieved</th><th>Progress</th><th>Perk / Reward</th><th></th></tr></thead>
          <tbody>${list.map(x => {
            const a = x.ach;
            return `<tr>
              <td><b>${esc(x.e.name)}</b></td>
              <td><span class="pill">${x.kind}</span></td>
              <td>${tierBadge(x.e.tier || 'Silver')}</td>
              <td>${a.target ? inr(a.target) : '<span class="muted">not set</span>'}</td>
              <td>${inr(a.achieved)}</td>
              <td><div class="flex"><div class="bar" style="width:90px"><i style="width:${Math.min(a.pct, 100)}%;${a.pct >= 100 ? 'background:var(--ok)' : a.pct >= 80 ? 'background:var(--warn)' : 'background:var(--danger)'}"></i></div><b>${a.pct}%</b></div></td>
              <td><span class="badge ${a.slab.badge}">${a.slab.label}</span><br><small class="muted">${esc(a.slab.perk)}</small>${a.slab.rate > 0 ? `<br><small><b>≈ ${inr(Math.round(a.slab.rate * a.achieved))} incentive</b></small>` : ''}</td>
              <td><button class="btn sm" data-action="setTarget" data-res="${x.res}" data-id="${x.e.id}">Set target</button></td>
            </tr>`;
          }).join('')}</tbody></table></div>
      </div>
      <div class="grid cols-3 mt">
        ${PERK_SLABS.map(sl => `<div class="card"><div class="between"><h3><span class="badge ${sl.badge}">${sl.label}</span></h3><b>${sl.rate ? (sl.rate * 100) + '%' : '—'}</b></div>
          <div class="sub" style="margin-top:6px">${sl.min === 100 ? '100% and above' : sl.min === 80 ? '80% – 99% of target' : 'below 80%'}</div>
          <div style="margin-top:6px">${esc(sl.perk)}</div></div>`).join('')}
      </div>`;
    },

    chemists() {
      const s = D.get();
      const tierChips = ['All', 'Platinum', 'Gold', 'Silver'].map((t, i) => `<span class="chip ${i === 0 ? 'active' : ''}" data-action="filterTier" data-table="chem-table" data-tier="${t}">${t}</span>`).join('');
      return `<div class="card">
        <div class="section-head"><h2>Chemist Network</h2>${addBtn('chemists', 'Add Chemist')}</div>
        <div class="sub" style="margin-top:-8px">💊 Visit logging, order capture, stock & secondary-sales tracking</div>
        <div class="between" style="margin:12px 0"><div class="chip-row">${tierChips}</div>
          <input data-search="chem-table" placeholder="🔍 Search chemists…" style="max-width:240px;padding:8px 11px;border:1px solid var(--line);border-radius:9px"></div>
        <div class="table-wrap"><table id="chem-table"><thead><tr><th>Chemist</th><th>Tier</th><th>Area</th><th>Stock Qty</th><th>Monthly Value</th><th>Target</th><th>Linked Rep</th><th></th></tr></thead>
        <tbody>${s.chemists.map(c => { const a = tradeAchievement(c, 'Chemist'); return `<tr data-tier="${c.tier || 'Silver'}">
          <td><b>${esc(c.name)}</b></td><td>${tierBadge(c.tier || 'Silver')}</td><td>${esc(c.area)}</td>
          <td><b>${ownerStockQty(c.id).toLocaleString('en-IN')}</b> u${stockBadge(c.id)}</td>
          <td>${inr(c.monthlyValue)}</td>
          <td>${a.target ? `<div class="flex"><div class="bar" style="width:55px"><i style="width:${Math.min(a.pct, 100)}%;${a.pct >= 100 ? 'background:var(--ok)' : a.pct >= 80 ? 'background:var(--warn)' : 'background:var(--danger)'}"></i></div><span class="badge ${a.slab.badge}">${a.pct}%</span><button class="btn ghost sm" data-action="setTarget" data-res="chemists" data-id="${c.id}" title="Edit target">✎</button></div>` : `<button class="btn ghost sm" data-action="setTarget" data-res="chemists" data-id="${c.id}">Set target</button>`}</td>
          <td>${esc(D.empName(c.rep))}</td>
          <td class="t-actions"><button class="btn ghost sm" data-action="ownerStock" data-id="${c.id}">📦 Stock</button>${rowActions('chemists', c.id, true)}</td>
        </tr>`; }).join('')}</tbody></table></div></div>`;
    },

    distributors() {
      const s = D.get();
      const tierChips = ['All', 'Platinum', 'Gold', 'Silver'].map((t, i) => `<span class="chip ${i === 0 ? 'active' : ''}" data-action="filterTier" data-table="dist-table" data-tier="${t}">${t}</span>`).join('');
      return `<div class="card">
        <div class="section-head"><h2>Distributor Management</h2>${addBtn('distributors', 'Add Distributor')}</div>
        <div class="sub" style="margin-top:-8px">🚚 Stock visibility, primary vs secondary, weekly closing</div>
        <div class="between" style="margin:12px 0"><div class="chip-row">${tierChips}</div>
          <input data-search="dist-table" placeholder="🔍 Search distributors…" style="max-width:240px;padding:8px 11px;border:1px solid var(--line);border-radius:9px"></div>
        <div class="table-wrap"><table id="dist-table"><thead><tr><th>Distributor</th><th>Tier</th><th>City</th><th>Stock Qty</th><th>Secondary Sales</th><th>Target</th><th>Last Closing</th><th></th></tr></thead>
        <tbody>${s.distributors.map(d => { const a = tradeAchievement(d, 'Distributor'); return `<tr data-tier="${d.tier || 'Silver'}">
          <td><b>${esc(d.name)}</b></td><td>${tierBadge(d.tier || 'Silver')}</td><td>${esc(d.city)}</td>
          <td><b>${ownerStockQty(d.id).toLocaleString('en-IN')}</b> u${stockBadge(d.id)}</td>
          <td>${inr(d.secondarySales)}</td>
          <td>${a.target ? `<div class="flex"><div class="bar" style="width:55px"><i style="width:${Math.min(a.pct, 100)}%;${a.pct >= 100 ? 'background:var(--ok)' : a.pct >= 80 ? 'background:var(--warn)' : 'background:var(--danger)'}"></i></div><span class="badge ${a.slab.badge}">${a.pct}%</span><button class="btn ghost sm" data-action="setTarget" data-res="distributors" data-id="${d.id}" title="Edit target">✎</button></div>` : `<button class="btn ghost sm" data-action="setTarget" data-res="distributors" data-id="${d.id}">Set target</button>`}</td>
          <td>${d.lastClosing}</td>
          <td class="t-actions"><button class="btn ghost sm" data-action="ownerStock" data-id="${d.id}">📦 Stock</button>${rowActions('distributors', d.id, true)}</td>
        </tr>`; }).join('')}</tbody></table></div></div>`;
    },

    visits() {
      const s = D.get();
      return `
      <div class="section-head"><h2>Visits & Sales Force Automation</h2>
        <div class="flex"><input data-search="visit-table" placeholder="🔍 Search visits…" style="padding:8px 11px;border:1px solid var(--line);border-radius:9px">
        <button class="btn sm" data-action="newVisit">＋ Log Visit</button></div></div>
      <div class="table-wrap card"><table id="visit-table">
        <thead><tr><th>Date</th><th>Rep</th><th>Type</th><th>Target</th><th>Check-in</th><th>Geo</th><th>Commit</th><th>Sentiment</th><th>Summary</th><th></th></tr></thead>
        <tbody>${s.visits.slice().reverse().map(v => `<tr>
          <td>${v.date}</td><td>${esc(D.empName(v.rep))}</td><td><span class="pill">${v.type}</span></td>
          <td><b>${esc(v.type === 'Doctor' ? D.docName(v.targetId) : D.chemName(v.targetId))}</b></td>
          <td>${v.checkin}</td>
          <td>${v.geoVerified ? '<span class="badge ok">✓ Verified</span>' : '<span class="badge danger">⚠ Mock?</span>'}</td>
          <td>${v.commitment ? v.commitment + ' u' : '—'}</td>
          <td>${statusBadge(v.sentiment)}</td>
          <td class="muted" style="max-width:220px">${v.photo ? '📷 ' : ''}${esc(v.summary)}</td>
          <td>${rowActions('visits', v.id, true)}</td>
        </tr>`).join('')}</tbody></table></div>`;
    },

    rcpa() {
      const s = D.get();
      const rows = s.rcpa.map(r => ({ label: D.docName(r.doctor).replace('Dr. ', ''), val: r.share, color: r.share >= 60 ? '#10a37f' : r.share >= 45 ? '#f5a524' : '#e5484d' }));
      // ---- prescription market share (from RCPA) ----
      const ourTotal = s.rcpa.reduce((a, r) => a + (r.ourScripts || 0), 0);
      const compTotal = s.rcpa.reduce((a, r) => a + (r.compScripts || 0), 0);
      const overallShare = (ourTotal + compTotal) ? Math.round(ourTotal / (ourTotal + compTotal) * 100) : 0;
      const sharePie = [{ label: 'Amber (ours)', val: ourTotal, color: '#10a37f' }, { label: 'Competitors', val: compTotal, color: '#e5484d' }];
      const brandMap = {};
      s.rcpa.forEach(r => { if (r.ourBrand) brandMap[r.ourBrand] = (brandMap[r.ourBrand] || 0) + (r.ourScripts || 0); if (r.competitor) brandMap[r.competitor] = (brandMap[r.competitor] || 0) + (r.compScripts || 0); });
      const ourBrands = new Set(s.rcpa.map(r => r.ourBrand));
      const greens = ['#0c5c4c', '#10a37f', '#2ec27e', '#15725f'], reds = ['#e5484d', '#f5a524', '#9aa6b2', '#7c3aed', '#0891b2', '#c026d3'];
      let gi = 0, ri = 0;
      const brandSegs = Object.entries(brandMap).sort((a, b) => b[1] - a[1]).map(([b, v]) => ({ label: b, val: v, color: ourBrands.has(b) ? greens[gi++ % greens.length] : reds[ri++ % reds.length] }));
      return `
      <div class="grid cols-2">
        <div class="card"><h3>Rx Market Share — Amber vs Competitors</h3><div class="sub">Aggregated from ${s.rcpa.length} RCPA audits · ${ourTotal + compTotal} prescriptions</div>
          ${pieChart(sharePie, 160)}
          <div class="note mt" style="text-align:center">Amber holds <b style="color:var(--brand)">${overallShare}%</b> of audited prescriptions</div></div>
        <div class="card"><h3>Prescription Share by Brand</h3><div class="sub">Your brands (green) vs competitor brands (red) — by Rx volume</div>
          ${pieChart(brandSegs, 160)}</div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Prescription Share (RCPA)</h3><div class="sub">Our brand vs competitor — by doctor</div>${barChart(rows)}</div>
        <div class="card"><h3>Doctor Potential Intelligence</h3><div class="sub">Derived ranking feeds tiering & targeting</div>
          ${s.doctors.slice().sort((a, b) => b.potential - a.potential).map(d => `<div class="between" style="padding:8px 0;border-bottom:1px solid var(--line)">
            <span>${esc(d.name)} <small class="muted">${esc(d.specialty)}</small></span>
            <span class="flex">${tierBadge(d.tier)}<b>${d.potential}</b></span></div>`).join('')}
        </div>
      </div>
      <div class="card mt"><div class="section-head"><h2>RCPA Audit Log</h2>${addBtn('rcpa', 'New RCPA')}</div>
        <div class="table-wrap"><table><thead><tr><th>Date</th><th>Doctor</th><th>Chemist</th><th>Our Brand</th><th>Our Rx</th><th>Competitor</th><th>Comp Rx</th><th>Share</th><th></th></tr></thead>
        <tbody>${s.rcpa.map(r => `<tr><td>${r.date}</td><td>${esc(D.docName(r.doctor))}</td><td>${esc(D.chemName(r.chemist))}</td>
          <td>${esc(r.ourBrand)}</td><td>${r.ourScripts}</td><td>${esc(r.competitor)}</td><td>${r.compScripts}</td>
          <td><span class="badge ${r.share >= 60 ? 'ok' : r.share >= 45 ? 'pending' : 'danger'}">${r.share}%</span></td>
          <td>${rowActions('rcpa', r.id, false)}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
    },

    gps() {
      const s = D.get();
      const verifiedV = s.visits.filter(v => v.geoVerified);
      const flaggedV = s.visits.filter(v => !v.geoVerified);
      const verified = verifiedV.length, flagged = flaggedV.length;
      const provider = AmberMaps.hasGoogleKey() ? 'Google Maps' : 'OpenStreetMap';
      const targetName = (v) => v.type === 'Doctor' ? D.docName(v.targetId) : D.chemName(v.targetId);
      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Geo-verified Check-ins</span><span class="val">${verified}</span><span class="delta up">✓ within geofence</span></div>
        <div class="card kpi" data-route="gps" style="cursor:pointer" title="See flagged visits below"><span class="label">Mock-location Flags</span><span class="val" style="color:var(--danger)">${flagged}</span><span class="delta down">needs re-verification ↓</span></div>
        <div class="card kpi"><span class="label">Mapped Locations</span><span class="val">${s.doctors.length + s.chemists.length + s.distributors.length}</span><span class="delta">doctors · chemists · distys</span></div>
        <div class="card kpi" id="live-stat"><span class="label">My Live Location</span><span class="val" style="font-size:18px">—</span><span class="delta muted">tap "Use my location"</span></div>
      </div>
      ${flagged ? `<div class="card mt" style="border-color:#f3c9ca">
        <div class="section-head"><h2 style="font-size:16px">⚠️ Mock-location Flags — needs re-verification</h2><span class="badge danger">${flagged} flagged</span></div>
        <div class="sub" style="margin-top:-8px">These check-ins were outside the geofence or showed possible GPS spoofing. Review and re-verify if genuine.</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Rep</th><th>Type</th><th>Target</th><th>Check-in</th><th>Summary</th><th></th></tr></thead>
          <tbody>${flaggedV.map(v => `<tr>
            <td>${v.date}</td><td>${esc(D.empName(v.rep))}</td><td><span class="pill">${v.type}</span></td>
            <td><b>${esc(targetName(v))}</b></td><td>${v.checkin}</td>
            <td class="muted" style="max-width:240px">${v.photo ? '📷 ' : ''}${esc(v.summary)}</td>
            <td class="t-actions">
              <button class="btn ghost sm" data-action="view" data-res="visits" data-id="${v.id}">View</button>
              <button class="btn sm" data-action="reverify" data-id="${v.id}">✓ Re-verify</button>
            </td>
          </tr>`).join('')}</tbody></table></div>
      </div>` : `<div class="note mt">✅ No mock-location flags — all check-ins are geo-verified.</div>`}
      <div class="card mt">
        <div class="section-head">
          <div><h2 style="margin:0">Live Field Map</h2><div class="sub" style="margin:2px 0 0">Real coordinates · ${provider} · geofenced visit verification</div></div>
          <div class="flex">
            <button class="btn sm" data-action="locateMe">📍 Use my location</button>
            <button class="btn ghost sm" id="track-btn" data-action="toggleTrack">▶ Live tracking</button>
          </div>
        </div>
        <div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px;background:var(--brand-light);border-radius:10px">
          <span style="font-weight:700;font-size:13px">🧭 Live directions to:</span>
          <select id="nav-dest" style="flex:1;min-width:180px;max-width:320px;padding:8px 11px;border:1px solid var(--line);border-radius:9px">
            <optgroup label="Doctors">${s.doctors.filter(d => d.lat).map(d => `<option value="${d.id}">${esc(d.name)} — ${esc(d.city || d.hospital)}</option>`).join('')}</optgroup>
            <optgroup label="Chemists">${s.chemists.filter(c => c.lat).map(c => `<option value="${c.id}">${esc(c.name)} — ${esc(c.area)}</option>`).join('')}</optgroup>
          </select>
          <button class="btn sm" data-action="navTo">Get route</button>
          <button class="btn ghost sm" data-action="navGoogle">↗ Google Maps</button>
        </div>
        <div id="nav-readout" class="note hidden" style="margin-bottom:12px"></div>
        <div id="map" style="height:440px;border-radius:12px;overflow:hidden;background:#eef4f2"></div>
        <div id="map-fallback"></div>
        <div class="legend">
          <span><i style="background:#5b6f8a"></i>Doctor (Platinum)</span>
          <span><i style="background:#e0a106"></i>Doctor (Gold)</span>
          <span><i style="background:#9aa6b2"></i>Doctor (Silver)</span>
          <span><i style="background:#10a37f"></i>Chemist</span>
          <span><i style="background:#8b5cf6"></i>Distributor</span>
          <span><i style="background:#2563eb"></i>You (live)</span>
        </div>
        <div id="geo-readout" class="note mt hidden"></div>
      </div>`;
    },

    campaigns() {
      const s = D.get();
      return `
      <div class="section-head"><h2>PMT / Closed-Loop Marketing</h2>${addBtn('campaigns', 'New Campaign')}</div>
      <div class="grid cols-3">${s.campaigns.map(c => {
        const roi = c.spend ? Math.round((c.sales - c.spend) / c.spend * 100) : 0;
        return `<div class="card">
          <div class="between"><h3>${esc(c.name)}</h3>${statusBadge(c.status)}</div>
          <div class="sub">${esc(D.prodName(c.product))} · ${esc(c.specialty)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px">
            <div><small class="muted">Venue</small><br>${esc(c.venue)}</div>
            <div><small class="muted">Reach</small><br><b>${c.reach}</b> doctors</div>
            <div><small class="muted">Sales</small><br><b>${inr(c.sales)}</b></div>
            <div><small class="muted">Spend</small><br>${inr(c.spend)}</div>
          </div>
          <div class="mt"><small class="muted">Campaign → Sales ROI</small>
            <div class="bar mt"><i style="width:${Math.min(Math.max(roi,0),100)}%"></i></div>
            <b class="${roi >= 0 ? 'delta up' : 'delta down'}">${roi >= 0 ? '+' : ''}${roi}% ROI</b></div>
          <div class="mt" style="display:flex;gap:6px;justify-content:flex-end">
            <button class="btn ghost sm" data-action="edit" data-res="campaigns" data-id="${c.id}">Edit</button>
            <button class="btn ghost sm" data-action="del" data-res="campaigns" data-id="${c.id}">✕</button></div>
        </div>`;
      }).join('')}</div>
      <div class="note mt">🎂 <b>Celebration engine:</b> Dr. Arjun Pillai's anniversary (22 Apr) auto-queued a compliant scientific-engagement touchpoint.</div>`;
    },

    approvals() {
      const s = D.get();
      return `
      <div class="section-head"><h2>Digital Approval Engine</h2>
        <div class="flex"><span class="pill">ABM → RBM → Accounts</span>${addBtn('approvals', 'Raise Request')}</div></div>
      <div class="card">${approvalsTable(s.approvals, true)}</div>`;
    },

    targets() {
      const s = D.get();
      const reps = s.employees.filter(e => ['TSM', 'ABM'].includes(e.role));
      const rows = reps.map(r => {
        const aDocs = s.doctors.filter(d => d.rep === r.id), aChems = s.chemists.filter(c => c.rep === r.id);
        const myVisits = s.visits.filter(v => v.rep === r.id);
        const todayV = myVisits.filter(v => v.date === today());
        const docToday = todayV.filter(v => v.type === 'Doctor').length;
        const chemToday = todayV.filter(v => v.type === 'Chemist').length;
        const tD = r.targetDoctors != null ? r.targetDoctors : DAILY_TARGET.doctors;
        const tC = r.targetChemists != null ? r.targetChemists : DAILY_TARGET.chemists;
        const targetMet = docToday >= tD && chemToday >= tC;
        const visited = new Set(myVisits.map(v => v.targetId));
        const totAssigned = aDocs.length + aChems.length;
        const totCovered = aDocs.filter(d => visited.has(d.id)).length + aChems.filter(c => visited.has(c.id)).length;
        const coverage = totAssigned ? Math.round(totCovered / totAssigned * 100) : 0;
        const geoOk = myVisits.length ? Math.round(myVisits.filter(v => v.geoVerified).length / myVisits.length * 100) : 0;
        const lastActive = myVisits.map(v => v.date).sort().pop() || '—';
        const dailyProgress = Math.min(100, Math.round((docToday + chemToday) / ((tD + tC) || 1) * 100));
        // composite performance score → drives the incentive perk
        const score = Math.round(0.6 * coverage + 0.25 * geoOk + 0.15 * dailyProgress);
        const perk = repPerkFor(score);
        return { r, tD, tC, aDocs: aDocs.length, aChems: aChems.length, docToday, chemToday, targetMet, totAssigned, totCovered, coverage, geoOk, lastActive, score, perk };
      });
      const onTarget = rows.filter(x => x.targetMet).length;
      const stars = rows.filter(x => x.score >= 90).length;
      const avgPerf = rows.length ? Math.round(rows.reduce((a, x) => a + x.score, 0) / rows.length) : 0;
      const payout = rows.reduce((a, x) => a + x.perk.amount, 0);

      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Reps On Target Today</span><span class="val">${onTarget}/${rows.length}</span><span class="delta ${onTarget ? 'up' : 'muted'}">daily ${DAILY_TARGET.doctors}+${DAILY_TARGET.chemists} met</span></div>
        <div class="card kpi"><span class="label">⭐ Star Performers</span><span class="val" style="color:var(--ok)">${stars}</span><span class="delta">score ≥ 90%</span></div>
        <div class="card kpi"><span class="label">Avg Performance</span><span class="val">${avgPerf}%</span><span class="delta">team average</span></div>
        <div class="card kpi"><span class="label">Est. Incentive Payout</span><span class="val">${inr(payout)}</span><span class="delta">earned this period</span></div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2>Salesperson Targets, Coverage &amp; Incentives</h2><span class="pill">score = 60% coverage + 25% geo + 15% daily target</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Salesperson</th><th>Today (visits)</th><th>Daily Target</th><th>Met</th><th>Allotted Coverage</th><th>Geo</th><th>Performance</th><th>Incentive / Perk Earned</th>${canSetEmpTarget() ? '<th></th>' : ''}</tr></thead>
          <tbody>${rows.map(x => `<tr>
            <td><div class="flex"><span class="avatar" style="width:28px;height:28px;font-size:12px">${esc(x.r.name[0])}</span><b>${esc(x.r.name)}</b> <span class="pill">${esc(x.r.role)}</span></div></td>
            <td>${x.docToday + x.chemToday} / ${x.tD + x.tC}</td>
            <td><b>${x.tD}</b> doc + <b>${x.tC}</b> chem</td>
            <td>${x.targetMet ? '<span class="badge ok">✓ Met</span>' : '<span class="badge pending">Pending</span>'}</td>
            <td><div class="flex"><div class="bar" style="width:80px"><i style="width:${x.coverage}%"></i></div>${x.totCovered}/${x.totAssigned} (${x.coverage}%)</div></td>
            <td><span class="badge ${x.geoOk >= 80 ? 'ok' : 'pending'}">${x.geoOk}%</span></td>
            <td><div class="flex"><div class="bar" style="width:70px"><i style="width:${x.score}%;${x.score >= 90 ? 'background:var(--ok)' : x.score >= 60 ? 'background:var(--warn)' : 'background:var(--danger)'}"></i></div><b>${x.score}%</b></div></td>
            <td><span class="badge ${x.perk.badge}">${x.perk.label}</span><br><small class="muted">${esc(x.perk.reward)}</small></td>
            ${canSetEmpTarget() ? `<td><button class="btn ghost sm" data-action="setEmpTarget" data-id="${x.r.id}">Set target</button></td>` : ''}
          </tr>`).join('')}</tbody></table></div>
        <div class="note mt">🎯 Performance score blends <b>territory coverage</b> (allotted doctors & chemists visited), <b>geo-verified %</b> and <b>daily-target</b> progress. Hit the slabs below to unlock incentives — scores rise live as reps log geo-verified visits.</div>
      </div>
      <div class="grid cols-4 mt">
        ${REP_PERK_SLABS.map(sl => `<div class="card"><div class="between"><h3><span class="badge ${sl.badge}">${sl.label}</span></h3><b>${sl.amount ? inr(sl.amount) : '—'}</b></div>
          <div class="sub" style="margin-top:6px">${sl.min === 90 ? 'score ≥ 90%' : sl.min === 75 ? '75% – 89%' : sl.min === 60 ? '60% – 74%' : 'below 60%'}</div>
          <div style="margin-top:6px;font-size:13px">${esc(sl.reward)}</div></div>`).join('')}
      </div>`;
    },

    gifting() {
      const s = D.get();
      const mk = (entity, kind, occasion, dateStr) => {
        const days = daysUntilAnnual(dateStr);
        if (days == null || days > giftWindow) return null;
        return { id: entity.id, kind, name: entity.name, tier: entity.tier || 'Silver', occasion, date: dateStr, days };
      };
      const occByType = { Doctor: [], Chemist: [], Distributor: [] };
      s.doctors.forEach(d => [mk(d, 'Doctor', '🎂 Birthday', d.dob), mk(d, 'Doctor', '💍 Anniversary', d.anniversary)].forEach(o => o && occByType.Doctor.push(o)));
      s.chemists.forEach(c => { const o = mk(c, 'Chemist', '🎂 Birthday', c.dob); if (o) occByType.Chemist.push(o); });
      s.distributors.forEach(d => { const o = mk(d, 'Distributor', '🎂 Birthday', d.dob); if (o) occByType.Distributor.push(o); });
      Object.values(occByType).forEach(arr => arr.sort((a, b) => a.days - b.days));

      const active = occByType[giftTab] ? giftTab : 'Doctor';
      const occ = occByType[active];
      const isDoctor = active === 'Doctor';
      const fmtWhen = (days) => days === 0 ? 'Today 🎉' : days === 1 ? 'Tomorrow' : 'in ' + days + ' days';
      const tierCount = (t) => occ.filter(o => o.tier === t).length;

      const windowChips = [30, 60, 90].map(w => `<span class="chip ${giftWindow === w ? 'active' : ''}" data-action="giftWindow" data-days="${w}">Next ${w} days</span>`).join('');
      const tabs = [['Doctor', '🩺 Doctors'], ['Chemist', '💊 Chemists'], ['Distributor', '🚚 Distributors']];
      const tabChips = tabs.map(t => `<span class="chip ${active === t[0] ? 'active' : ''}" data-action="giftTab" data-tab="${t[0]}">${t[1]} <b>${occByType[t[0]].length}</b></span>`).join('');

      const tierSegs = groupSegments(occ, o => o.tier, { Platinum: '#5b6f8a', Gold: '#e0a106', Silver: '#9aa6b2' });
      const budget = occ.reduce((a, o) => a + (GIFT_TIER[o.tier] || GIFT_TIER.Silver).cap, 0);
      const next = occ[0];
      const giftKey = isDoctor ? 'doctor' : 'trade';

      const note = isDoctor
        ? `<div class="note" style="border-left:3px solid var(--warn)">🛡️ <b>Doctors — compliance:</b> engagement is matched to therapy/products for <b>relevance</b>, at fair market value (CME, patient-education) — <b>never</b> a reward for prescription volume (UCPMP/NMC). Every gift routes through <b>Gift Approval</b> and is logged.</div>`
        : `<div class="note">🤝 <b>${active}s — trade partners:</b> festive/relationship gifting is standard. Suggestions are <b>branded to the products they ${active === 'Chemist' ? 'stock & sell' : 'distribute'}</b>, within tier value caps.</div>`;

      return `
      <div class="section-head"><h2>Gifting &amp; Celebrations</h2><div class="chip-row">${windowChips}</div></div>
      <div class="chip-row" style="margin-bottom:14px">${tabChips}</div>
      ${note}
      <div class="grid cols-4 mt">
        <div class="card kpi"><span class="label">Upcoming (≤${giftWindow}d)</span><span class="val">${occ.length}</span><span class="delta">${active.toLowerCase()} celebrations</span></div>
        <div class="card kpi"><span class="label">Next Celebration</span><span class="val" style="font-size:16px">${next ? esc(next.name.replace('Dr. ', '')) : '—'}</span><span class="delta ${next && next.days <= 1 ? 'up' : 'muted'}">${next ? fmtWhen(next.days) : 'none in window'}</span></div>
        <div class="card kpi"><span class="label">Suggested Gift Budget</span><span class="val">${inr(budget)}</span><span class="delta">within tier caps</span></div>
        <div class="card kpi"><span class="label">Platinum / Gold / Silver</span><span class="val" style="font-size:18px">${tierCount('Platinum')} / ${tierCount('Gold')} / ${tierCount('Silver')}</span><span class="delta">by tier</span></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Upcoming by Tier</h3><div class="sub">${active} celebrations in the next ${giftWindow} days</div>${pieChart(tierSegs)}</div>
        <div class="card"><h3>${active} Gift Guide</h3><div class="sub">per tier · value cap</div>
          ${['Platinum', 'Gold', 'Silver'].map(t => `<div class="between" style="padding:9px 0;border-bottom:1px solid var(--line)">
            <span>${tierBadge(t)} <small class="muted">${esc(GIFT_TIER[t][giftKey])}</small></span><b>${inr(GIFT_TIER[t].cap)}</b></div>`).join('')}
        </div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2 style="font-size:16px">${active} Celebrations — next ${giftWindow} days</h2><span class="pill">${occ.length} upcoming</span></div>
        ${occ.length ? `<div class="table-wrap"><table>
          <thead><tr><th>When</th><th>Date</th><th>${active}</th><th>Tier</th><th>Occasion</th><th>Products</th><th>Suggested gift</th><th>Cap</th><th></th></tr></thead>
          <tbody>${occ.map(o => {
            const g = GIFT_TIER[o.tier] || GIFT_TIER.Silver;
            const prods = contactProducts(o.id, o.kind);
            const prodTxt = prods.join(', ');
            const suggestion = isDoctor ? `${g.doctor}${prodTxt ? ' — relevant to ' + prodTxt : ''}` : `${g.trade}${prodTxt ? ' — branded for ' + prodTxt : ''}`;
            return `<tr>
              <td><b class="${o.days <= 1 ? 'delta up' : ''}">${fmtWhen(o.days)}</b></td>
              <td>${o.date}</td>
              <td><b>${esc(o.name)}</b></td>
              <td>${tierBadge(o.tier)}</td>
              <td>${o.occasion}</td>
              <td>${prods.length ? prods.map(p => `<span class="pill" style="margin:1px">${esc(p)}</span>`).join(' ') : '<span class="muted">—</span>'}</td>
              <td class="muted" style="max-width:240px">${esc(suggestion)}</td>
              <td>${inr(g.cap)}</td>
              <td><button class="btn sm" data-action="raiseGift" data-id="${o.id}" data-kind="${o.kind}" data-cap="${g.cap}">Raise gift</button></td>
            </tr>`;
          }).join('')}</tbody></table></div>`
        : `<p class="muted">No ${active.toLowerCase()} birthdays${isDoctor ? ' or anniversaries' : ''} in the next ${giftWindow} days. Add a Date of Birth on a ${active.toLowerCase()} to see celebration triggers here.</p>`}
      </div>`;
    },

    inventory() {
      const s = D.get();
      const all = (s.stock || []).map(x => ({ ...x, st: expiryStatus(x.expiry), val: (x.quantity || 0) * (x.mrp || 0) }));
      let rows = all;
      if (invFilter.owner) rows = rows.filter(x => x.owner === invFilter.owner);
      if (invFilter.status !== 'all') rows = rows.filter(x => x.st.key === invFilter.status);
      rows = rows.slice().sort((a, b) => (a.st.days ?? 1e9) - (b.st.days ?? 1e9)); // soonest expiry first

      const expired = all.filter(x => x.st.key === 'expired');
      const expiring = all.filter(x => x.st.key === 'expiring');
      const units = all.reduce((a, b) => a + (b.quantity || 0), 0);
      const value = all.reduce((a, b) => a + b.val, 0);
      const atRiskVal = [...expired, ...expiring].reduce((a, b) => a + b.val, 0);

      const chips = [['all', 'All'], ['expiring', 'Expiring ≤90d'], ['expired', 'Expired'], ['ok', 'In date']]
        .map(c => `<span class="chip ${invFilter.status === c[0] ? 'active' : ''}" data-action="invStatus" data-status="${c[0]}">${c[1]}</span>`).join('');

      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Total SKUs / Units</span><span class="val">${all.length} <span style="font-size:14px;color:var(--muted)">/ ${units.toLocaleString('en-IN')}</span></span><span class="delta">across chemists + distributors</span></div>
        <div class="card kpi"><span class="label">Stock Value</span><span class="val">${inr(value)}</span><span class="delta">at MRP</span></div>
        <div class="card kpi"><span class="label">Expiring ≤90 days</span><span class="val" style="color:var(--warn)">${expiring.length}</span><span class="delta">batches — act now</span></div>
        <div class="card kpi"><span class="label">Expired</span><span class="val" style="color:var(--danger)">${expired.length}</span><span class="delta down">${inr(atRiskVal)} at risk</span></div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2>Stock &amp; Expiry</h2>${addBtn('stock', 'Add Stock')}</div>
        <div class="between" style="margin-bottom:12px">
          <div class="chip-row">${chips}</div>
          <div class="flex">
            ${invFilter.owner ? `<span class="pill">${esc(ownerName(invFilter.owner))}</span><button class="btn ghost sm" data-action="invClearOwner">✕ clear</button>` : ''}
            <input data-search="stock-table" placeholder="🔍 product / batch…" style="padding:8px 11px;border:1px solid var(--line);border-radius:9px">
          </div>
        </div>
        <div class="table-wrap"><table id="stock-table">
          <thead><tr><th>Stockist</th><th>Type</th><th>Product</th><th>Batch</th><th>Qty</th><th>MRP</th><th>Value</th><th>Expiry</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(x => `<tr>
            <td><b>${esc(ownerName(x.owner))}</b></td>
            <td><span class="pill">${ownerType(x.owner)}</span></td>
            <td>${esc(D.prodName(x.product))}</td><td>${esc(x.batch)}</td>
            <td>${(x.quantity || 0).toLocaleString('en-IN')}</td><td>${inr(x.mrp)}</td><td>${inr(x.val)}</td>
            <td>${x.expiry || '—'}</td>
            <td><span class="badge ${x.st.badge}">${x.st.label}</span></td>
            <td>${rowActions('stock', x.id, false)}</td>
          </tr>`).join('') : '<tr><td colspan="10" class="muted">No stock matches this filter.</td></tr>'}</tbody>
        </table></div>
      </div>`;
    },

    accounts() {
      const s = D.get();
      const totalSpend = s.expenses.reduce((a, b) => a + b.amount, 0);
      const sampleVal = s.samples.reduce((a, b) => a + b.value, 0);
      return `
      <div class="grid cols-3">
        <div class="card kpi"><span class="label">Field Spend (MTD)</span><span class="val">${inr(totalSpend)}</span><span class="delta up">68% of budget</span></div>
        <div class="card kpi"><span class="label">Sample Value Issued</span><span class="val">${inr(sampleVal)}</span><span class="delta">fully accounted</span></div>
        <div class="card kpi"><span class="label">Live Stock Movement</span><span class="val">${inr(1970000)}</span><span class="delta up">across 2 distributors</span></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><div class="section-head"><h3>Sample & Gift Accountability</h3>${addBtn('samples', 'Issue Sample')}</div><div class="sub">Unit-by-unit · regulated</div>
          <div class="table-wrap"><table><thead><tr><th>Doctor</th><th>Product</th><th>Qty</th><th>Value</th><th>Purpose</th><th></th></tr></thead>
          <tbody>${s.samples.map(x => `<tr><td>${esc(D.docName(x.doctor))}</td><td>${esc(D.prodName(x.product))}</td><td>${x.qty}</td><td>${inr(x.value)}</td><td class="muted">${esc(x.purpose)}</td><td>${rowActions('samples', x.id, false)}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="card"><div class="section-head"><h3>Expense Claims</h3><div class="flex"><button class="btn ghost sm" data-action="logTravel">🏍️ Log Travel (km)</button>${addBtn('expenses', 'Add Claim')}</div></div>
          <div class="sub">Travel auto-costed by km · ${canEditExpense() ? 'you can edit/approve' : 'edit/approve limited to Admin & Accounts'}</div>
          <div class="table-wrap"><table><thead><tr><th>Rep</th><th>Type</th><th>Distance</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>${s.expenses.map(x => `<tr><td>${esc(D.empName(x.rep))}</td><td>${esc(x.type)}</td>
            <td>${x.km ? x.km + ' km <small class="muted">@₹' + (TRAVEL_RATE[x.mode] || '?') + '/km</small>' : '—'}</td>
            <td>${inr(x.amount)}</td><td>${statusBadge(x.status)}</td>
            <td class="t-actions">
              ${x.status === 'Pending' && canEditExpense() ? `<button class="btn sm" data-action="expenseSet" data-id="${x.id}" data-status="Approved">✓</button><button class="btn ghost sm" data-action="expenseSet" data-id="${x.id}" data-status="Rejected">✕</button>` : ''}
              ${canEditExpense() ? `<button class="btn ghost sm" data-action="edit" data-res="expenses" data-id="${x.id}">Edit</button><button class="btn ghost sm" data-action="del" data-res="expenses" data-id="${x.id}">✕</button>` : ''}
              ${!canEditExpense() && x.status !== 'Pending' ? statusBadge(x.status) : ''}
            </td></tr>`).join('')}</tbody></table></div>
        </div>
      </div>`;
    },

    distribution() {
      const s = D.get();
      const recon = (s.recon || []).map(r => ({ r, c: reconCompute(r) }));
      const tabs = [['recon', '🔄 Reconciliation & ROP'], ['pricing', '💱 Pricing (MRP→PTR→PTS)'], ['anomalies', '🚩 Anomalies']];
      const tabChips = tabs.map(t => `<span class="chip ${distTab === t[0] ? 'active' : ''}" data-action="distTab" data-tab="${t[0]}">${t[1]}</span>`).join('');
      const n = (x) => Math.round(x).toLocaleString('en-IN');

      let panel = '';
      if (distTab === 'recon') {
        const orderNow = recon.filter(x => /Order now|URGENT/.test(x.c.action)).length;
        const block = recon.filter(x => x.c.action.startsWith('Block')).length;
        const suggestTot = recon.reduce((a, x) => a + x.c.suggest, 0);
        const kpi = (filter, label, val, valStyle, delta) => `<div class="card kpi ${reconFilter === filter ? 'active-kpi' : ''}" data-action="reconFilter" data-filter="${filter}" style="cursor:pointer"><span class="label">${label}</span><span class="val" style="${valStyle}">${val}</span><span class="delta">${delta} ${reconFilter === filter ? '✓' : '›'}</span></div>`;
        const shown = reconFilter === 'replenish' ? recon.filter(x => /Order now|URGENT/.test(x.c.action))
          : reconFilter === 'block' ? recon.filter(x => x.c.action.startsWith('Block'))
          : reconFilter === 'suggest' ? recon.filter(x => x.c.suggest > 0)
          : recon;
        const filterLabel = { all: 'All rows', replenish: 'Need replenishment (≤ ROP)', block: 'Anti-dumping blocks', suggest: 'Has suggested order' }[reconFilter];
        const STATUS_COL = { 'Healthy': '#16a34a', 'Low Stock / Reorder': '#f59e0b', 'Overstock / Expiry Risk': '#e0a106', 'Stockout': '#e5484d', 'No Offtake / Dead Stock': '#9aa6b2', 'Check Data (Negative)': '#7c3aed' };
        const statusSegs = groupSegments(recon.map(x => x.c), c => c.status, STATUS_COL);
        const barRows = recon.map(x => ({ label: D.prodName(x.r.product).split(' ')[0].slice(0, 7), val: Math.max(0, Math.round(x.c.closing)), color: STATUS_COL[x.c.status] || '#10a37f', tip: (x.c.dist.name || '') + ' · ' + D.prodName(x.r.product) + ': ' + Math.round(x.c.closing) + ' (' + x.c.status + ')' }));
        // primary vs secondary totals (channel imbalance)
        const totPrimary = recon.reduce((a, x) => a + x.c.primary, 0), totSecondary = recon.reduce((a, x) => a + x.c.secondary, 0);
        panel = `
        <div class="grid cols-4">
          ${kpi('all', 'Distributor × SKU rows', recon.length, '', 'channel reconciliation')}
          ${kpi('replenish', 'Need Replenishment', orderNow, 'color:var(--warn)', 'at / below ROP')}
          ${kpi('block', 'Anti-dumping Blocks', block, 'color:var(--danger)', 'overstock — freeze primary')}
          ${kpi('suggest', 'Suggested Primary', n(suggestTot), '', 'units to order')}
        </div>
        <div class="grid cols-3 mt">
          <div class="card"><h3>Stock Status Mix</h3><div class="sub">channel rows by health</div>${pieChart(statusSegs, 140)}</div>
          <div class="card"><h3>Primary vs Secondary</h3><div class="sub">pipeline push vs true demand (units)</div>${pieChart([{ label: 'Primary (pushed)', val: totPrimary, color: '#3b82f6' }, { label: 'Secondary (demand)', val: totSecondary, color: '#10a37f' }], 140)}</div>
          <div class="card"><h3>Closing Stock by SKU</h3><div class="sub">coloured by status · hover for detail</div>${barChart(barRows)}</div>
        </div>
        <div class="card mt">
          <div class="section-head"><h2>Channel Stock Reconciliation &amp; Replenishment</h2><div class="flex">${addBtn('recon', 'Add Row')}<button class="btn ghost sm" data-action="report" data-kind="recon">⬇ CSV</button></div></div>
          <div class="between" style="margin:-4px 0 10px">
            <div class="sub" style="margin:0">Closing = Opening + Primary − Secondary − Returns · ROP = ADSS×lead + safety · norms: Min ${DIST.minDOI}d / Max ${DIST.maxDOI}d, safety ${DIST.safetyDays}d, max ${DIST.maxStockDays}d</div>
            ${reconFilter !== 'all' ? `<span class="pill">Filtered: ${filterLabel} <a data-action="reconFilter" data-filter="all" style="cursor:pointer">✕ clear</a></span>` : ''}
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Distributor</th><th>SKU</th><th>Open</th><th>Primary</th><th>Secondary</th><th>Returns</th><th>Closing</th><th>DOI</th><th>Status</th><th>Stock vs Safety · ROP · Max</th><th>Suggest Qty</th><th>Action</th><th></th></tr></thead>
            <tbody>${shown.length ? shown.map(({ r, c }) => `<tr>
              <td><b>${esc(D.get().distributors.find(d => d.id === r.distributor)?.name || r.distributor)}</b><br><small class="muted">lead ${c.lead}d</small></td>
              <td>${esc(D.prodName(r.product))}</td>
              <td>${n(c.opening)}</td><td>${n(c.primary)}</td><td>${n(c.secondary)}</td><td>${n(c.returns)}</td>
              <td><b>${n(c.closing)}</b></td>
              <td>${isFinite(c.doi) ? c.doi.toFixed(0) + 'd' : '—'}</td>
              <td><span class="badge ${c.sevClass}">${c.status}</span></td>
              <td style="min-width:200px">${stockGauge(c)}</td>
              <td>${c.suggest ? '<b>' + n(c.suggest) + '</b>' : '—'}</td>
              <td><span class="badge ${c.actClass}">${c.action}</span></td>
              <td>${rowActions('recon', r.id, false)}</td>
            </tr>`).join('') : '<tr><td colspan="13" class="muted">No rows match this filter.</td></tr>'}</tbody></table></div>
          <div class="note mt">🏭 <b>Replenishment rules:</b> draft a primary order for (Max − Current) when Current ≤ ROP · <b>block</b> the invoice if it would exceed Max (anti-dumping) · raise an <b>URGENT</b> alert below safety stock.</div>
        </div>`;
      } else if (distTab === 'pricing') {
        const p = pcalc;
        const ptr = ptrOf(p.mrp, p.gst, p.ret), pts = ptsOf(ptr, p.stk);
        const effPtr = ptr * (p.paid / p.total), effPts = pts * (p.paid / p.total);
        panel = `
        <div class="grid cols-2 mt">
          <div class="card"><h3>Pricing Calculator — MRP → PTR → PTS</h3><div class="sub">Back-calculated from MRP (GST-inclusive). PTR = MRP ÷ (1 + ret×(1+GST)) · PTS = PTR ÷ (1 + stk)</div>
            <div class="grid2">
              <div class="field"><label>MRP (₹)</label><input id="pc-mrp" type="number" value="${p.mrp}"></div>
              <div class="field"><label>GST</label><select id="pc-gst"><option value="0.12" ${p.gst === 0.12 ? 'selected' : ''}>12%</option><option value="0.05" ${p.gst === 0.05 ? 'selected' : ''}>5%</option><option value="0.18" ${p.gst === 0.18 ? 'selected' : ''}>18%</option><option value="0" ${p.gst === 0 ? 'selected' : ''}>0%</option></select></div>
              <div class="field"><label>Retailer margin</label><input id="pc-ret" type="number" step="0.01" value="${p.ret}"></div>
              <div class="field"><label>Stockist margin</label><input id="pc-stk" type="number" step="0.01" value="${p.stk}"></div>
            </div>
            <div class="grid2"><div class="card" style="text-align:center;background:var(--brand-light)"><div class="muted" style="font-size:12px">PTR (to retailer)</div><div style="font-size:24px;font-weight:750">₹${ptr.toFixed(2)}</div></div>
              <div class="card" style="text-align:center;background:var(--brand-light)"><div class="muted" style="font-size:12px">PTS (to stockist)</div><div style="font-size:24px;font-weight:750">₹${pts.toFixed(2)}</div></div></div>
            <h3 class="mt">Quantity scheme (e.g. 10 + 1)</h3><div class="sub">Effective price = standard × paid ÷ total shipped</div>
            <div class="grid2"><div class="field"><label>Paid qty</label><input id="pc-paid" type="number" value="${p.paid}"></div>
              <div class="field"><label>Total shipped</label><input id="pc-total" type="number" value="${p.total}"></div></div>
            <div class="note">Effective PTR <b>₹${effPtr.toFixed(2)}</b> · Effective PTS <b>₹${effPts.toFixed(2)}</b> · promotion cost <b>₹${(pts - effPts).toFixed(2)}</b>/unit (book as Account Promotion Cost, deduct ${p.total} from stock, invoice ${p.paid}).</div>
            <button class="btn sm mt" data-action="pcalc">Recalculate</button>
          </div>
          <div class="card"><h3>SKU Master — auto PTR / PTS</h3><div class="sub">Derived from each product's MRP, GST &amp; margins</div>
            <div class="table-wrap"><table><thead><tr><th>SKU</th><th>MRP</th><th>GST</th><th>PTR</th><th>PTS</th></tr></thead>
            <tbody>${s.products.map(pr => { const pp = productPricing(pr); return `<tr><td><b>${esc(pr.name)}</b></td><td>₹${pp.mrp.toFixed(2)}</td><td>${Math.round(pp.gst * 100)}%</td><td>₹${pp.ptr.toFixed(2)}</td><td>₹${pp.pts.toFixed(2)}</td></tr>`; }).join('')}</tbody></table></div>
          </div>
        </div>`;
      } else {
        const anomalies = recon.flatMap(({ r, c }) => c.flags.map(f => ({ dist: c.dist.name || r.distributor, sku: D.prodName(r.product), flag: f, detail: `closing ${n(c.closing)}, primary ${n(c.primary)} vs secondary ${n(c.secondary)}, returns ${n(c.returns)}` })));
        panel = `
        <div class="card mt">
          <div class="section-head"><h2>Anomaly &amp; Fraud Detection</h2><span class="badge ${anomalies.length ? 'danger' : 'ok'}">${anomalies.length} flag(s)</span></div>
          <div class="sub" style="margin-top:-8px">Rule-based flags from the reconciliation feed (imbalance ${DIST.imbalRatio}×, round-trip ${DIST.roundTripPct * 100}%).</div>
          ${anomalies.length ? `<div class="table-wrap"><table><thead><tr><th>Distributor</th><th>SKU</th><th>Flag</th><th>Detail</th></tr></thead>
            <tbody>${anomalies.map(a => `<tr><td><b>${esc(a.dist)}</b></td><td>${esc(a.sku)}</td><td><span class="badge danger">${esc(a.flag)}</span></td><td class="muted">${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="muted">No anomalies detected in the current channel data. 🎉</p>'}
          <div class="note mt">🚩 Flags: <b>Negative pipeline</b> (closing &lt; 0) · <b>Primary stuffing</b> (primary &gt; ${DIST.imbalRatio}× secondary &amp; high DOI) · <b>Round-trip returns</b> (returns &gt; ${DIST.roundTripPct * 100}% of secondary).</div>
        </div>`;
      }

      return `
      <div class="section-head"><h2>Distribution Engine</h2><span class="pill">Primary → Secondary · Channel-stock truth</span></div>
      <div class="chip-row" style="margin-bottom:6px">${tabChips}</div>
      ${panel}`;
    },

    orders() {
      const s = D.get();
      const list = (s.orders || []).slice().sort((a, b) => a.date < b.date ? 1 : -1);
      const primary = list.filter(o => o.source === 'Primary').reduce((a, b) => a + (b.amount || 0), 0);
      const secondary = list.filter(o => o.source === 'Secondary').reduce((a, b) => a + (b.amount || 0), 0);
      const open = list.filter(o => o.status === 'Open').length;
      const segs = [{ label: 'Primary', val: primary, color: '#10a37f' }, { label: 'Secondary', val: secondary, color: '#f5a524' }];
      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Primary Sales</span><span class="val">${inr(primary)}</span><span class="delta">company → distributor</span></div>
        <div class="card kpi"><span class="label">Secondary Sales</span><span class="val">${inr(secondary)}</span><span class="delta">chemist / retail</span></div>
        <div class="card kpi"><span class="label">Total Orders</span><span class="val">${list.length}</span><span class="delta">${open} open</span></div>
        <div class="card kpi"><span class="label">Order Value</span><span class="val">${inr(primary + secondary)}</span><span class="delta">all orders</span></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Primary vs Secondary</h3>${pieChart(segs)}</div>
        <div class="card"><h3>Top Parties by Order Value</h3>
          ${(() => {
            const byParty = {}; list.forEach(o => byParty[o.party] = (byParty[o.party] || 0) + (o.amount || 0));
            const top = Object.entries(byParty).sort((a, b) => b[1] - a[1]).slice(0, 5);
            return top.length ? top.map(([pid, v]) => `<div class="between" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(ownerName(pid))} <small class="muted">${ownerType(pid)}</small></span><b>${inr(v)}</b></div>`).join('') : '<p class="muted">No orders yet.</p>';
          })()}
        </div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2>Orders &amp; Secondary Sales</h2><div class="flex">${addBtn('orders', 'New Order')}<button class="btn ghost sm" data-action="exportOrders">⬇ CSV</button></div></div>
        <div class="table-wrap"><table id="order-table">
          <thead><tr><th>Date</th><th>Party</th><th>Type</th><th>Product</th><th>Qty</th><th>Value</th><th>Status</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(o => `<tr>
            <td>${o.date}</td><td><b>${esc(ownerName(o.party))}</b></td>
            <td><span class="badge ${o.source === 'Primary' ? 'info' : 'pending'}">${o.source}</span></td>
            <td>${esc(D.prodName(o.product))}</td><td>${(o.quantity || 0).toLocaleString('en-IN')}</td><td>${inr(o.amount)}</td>
            <td>${statusBadge(o.status)}</td>
            <td>${rowActions('orders', o.id, false)}</td>
          </tr>`).join('') : '<tr><td colspan="8" class="muted">No orders yet. Add one to feed trade-scheme achievement.</td></tr>'}</tbody></table></div>
        <div class="note mt">📑 Orders roll into each party's <b>achievement</b> on the Trade Schemes page automatically.</div>
      </div>`;
    },

    reports() {
      const s = D.get();
      return `
      <div class="section-head"><h2>Reports &amp; Exports</h2><button class="btn ghost sm" data-action="printReport">🖨️ Print / Save as PDF</button></div>
      <div class="grid cols-3">
        ${[
          ['field', '🧭 Field Performance', 'Per-rep coverage, geo-verification & incentive'],
          ['doctors', '🩺 Doctor Master', 'Doctors with tier, potential, rep & RCPA share'],
          ['stock', '📦 Stock & Expiry', 'All batches with expiry status & value'],
          ['orders', '📑 Orders & Sales', 'Primary/secondary orders with value'],
          ['expenses', '💰 Expense Claims', 'Claims with km/mode, amount & status'],
          ['schemes', '🏆 Trade Scheme Achievement', 'Targets vs achieved with incentive due'],
        ].map(r => `<div class="card"><h3>${r[1]}</h3><div class="sub">${r[2]}</div>
          <button class="btn sm mt" data-action="report" data-kind="${r[0]}">⬇ Download CSV</button></div>`).join('')}
      </div>
      <div class="note mt">📄 CSV opens in Excel/Sheets. Use <b>Print / Save as PDF</b> for a formatted snapshot of the current page.</div>`;
    },

    edetailing() {
      const s = D.get();
      const decks = s.edetail || [];
      const active = decks.filter(d => d.status === 'Active');
      const totViews = decks.reduce((a, b) => a + (b.views || 0), 0);
      const avgEng = active.length ? Math.round(active.reduce((a, b) => a + (b.engagement || 0), 0) / active.length) : 0;
      const viewSegs = decks.filter(d => d.views > 0).map((d, i) => ({ label: d.name.split('—')[0].trim().slice(0, 10), val: d.views, color: ['#10a37f', '#3b82f6', '#f5a524', '#7c3aed', '#0891b2'][i % 5] }));
      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Detailing Decks</span><span class="val">${decks.length}</span><span class="delta">${active.length} active</span></div>
        <div class="card kpi"><span class="label">Total Views</span><span class="val">${totViews.toLocaleString('en-IN')}</span><span class="delta">across doctors</span></div>
        <div class="card kpi"><span class="label">Avg Engagement</span><span class="val">${avgEng}%</span><span class="delta">slide view-through</span></div>
        <div class="card kpi"><span class="label">Best Performing</span><span class="val" style="font-size:15px">${esc((decks.slice().sort((a, b) => b.engagement - a.engagement)[0] || {}).name?.split('—')[0] || '—')}</span><span class="delta">highest engagement</span></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Views by Deck</h3><div class="sub">closed-loop engagement</div>${pieChart(viewSegs, 150)}</div>
        <div class="card"><h3>Engagement by Deck</h3><div class="sub">avg slide view-through %</div>
          ${decks.map(d => `<div style="padding:7px 0;border-bottom:1px solid var(--line)"><div class="between"><span>${esc(d.name)} ${statusBadge(d.status)}</span><b>${d.engagement || 0}%</b></div><div class="bar mt"><i style="width:${d.engagement || 0}%"></i></div></div>`).join('')}
        </div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2>E-Detailing Decks</h2>${addBtn('edetail', 'New Deck')}</div>
        <div class="sub" style="margin-top:-8px">Interactive visual aids pushed to rep tablets · slide-level engagement analytics (CLM)</div>
        <div class="table-wrap"><table><thead><tr><th>Deck</th><th>Product</th><th>Specialty</th><th>Slides</th><th>Views</th><th>Engagement</th><th>Status</th><th></th></tr></thead>
          <tbody>${decks.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(D.prodName(d.product))}</td><td>${esc(d.specialty)}</td><td>${d.slides}</td><td>${(d.views || 0).toLocaleString('en-IN')}</td>
            <td><div class="flex"><div class="bar" style="width:60px"><i style="width:${d.engagement || 0}%"></i></div>${d.engagement || 0}%</div></td>
            <td>${statusBadge(d.status)}</td><td>${rowActions('edetail', d.id, false)}</td></tr>`).join('')}</tbody></table></div>
        <div class="note mt">🎬 Decks go through MLR (medical-legal-regulatory) approval before field use; engagement is correlated with RCPA/secondary-sales lift to rank what works.</div>
      </div>`;
    },

    hr() {
      const s = D.get();
      const reps = s.employees;
      const fieldReps = reps.filter(e => ['TSM', 'ABM'].includes(e.role));
      const td = today();
      const canApprove = ['Admin', 'Business Head', 'RBM'].includes((D.user() || {}).role);
      // attendance from geo-verified visits today
      const att = fieldReps.map(r => {
        const mv = s.visits.filter(v => v.rep === r.id);
        const todayV = mv.filter(v => v.date === td);
        const last = mv.map(v => v.date).sort().pop() || '—';
        return { r, present: todayV.length > 0, calls: todayV.length, last };
      });
      const presentCount = att.filter(a => a.present).length;
      // performance score (coverage + geo) → incentive, per rep
      const perfScore = (r) => {
        const aDocs = s.doctors.filter(d => d.rep === r.id), aChems = s.chemists.filter(c => c.rep === r.id);
        const mv = s.visits.filter(v => v.rep === r.id); const visited = new Set(mv.map(v => v.targetId));
        const totA = aDocs.length + aChems.length; const cov = totA ? Math.round((aDocs.filter(d => visited.has(d.id)).length + aChems.filter(c => visited.has(c.id)).length) / totA * 100) : 0;
        const geo = mv.length ? Math.round(mv.filter(v => v.geoVerified).length / mv.length * 100) : 0;
        return Math.round(0.6 * cov + 0.25 * geo);
      };
      const leaves = s.leaves || [];
      const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
      // payroll — base salary is editable per employee (Admin); falls back to role default
      const isAdmin = (D.user() || {}).role === 'Admin';
      const payroll = reps.map(r => {
        const base = (r.salary != null && r.salary > 0) ? r.salary : (SALARY[r.role] || 40000);
        const incentive = ['TSM', 'ABM'].includes(r.role) ? (repPerkFor(perfScore(r)).amount || 0) : 0;
        const lopDays = leaves.filter(l => l.rep === r.id && l.status === 'Approved' && l.type === 'Loss of Pay').reduce((a, b) => a + (b.days || 0), 0);
        const lop = Math.round(base / 30 * lopDays);
        const reimburse = s.expenses.filter(x => x.rep === r.id && x.status === 'Approved').reduce((a, b) => a + b.amount, 0);
        return { r, base, incentive, lop, reimburse, net: base + incentive - lop + reimburse };
      });
      const payrollTotal = payroll.reduce((a, b) => a + b.net, 0);

      return `
      <div class="section-head"><h2>HR &amp; Payroll</h2><span class="pill">attendance · leave · payslip</span></div>
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Present Today (field)</span><span class="val">${presentCount}/${fieldReps.length}</span><span class="delta">geo-verified check-in</span></div>
        <div class="card kpi"><span class="label">Headcount</span><span class="val">${reps.length}</span><span class="delta">across departments</span></div>
        <div class="card kpi"><span class="label">Pending Leaves</span><span class="val" style="color:var(--warn)">${pendingLeaves}</span><span class="delta">awaiting approval</span></div>
        <div class="card kpi"><span class="label">Monthly Payroll</span><span class="val">${inr(payrollTotal)}</span><span class="delta">base + incentive</span></div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Attendance — Today (${td})</h3><div class="sub">derived from geo-tagged field activity</div>
          <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Status</th><th>Calls today</th><th>Last active</th></tr></thead>
          <tbody>${att.map(a => `<tr><td><b>${esc(a.r.name)}</b> <span class="pill">${esc(a.r.role)}</span></td>
            <td>${a.present ? '<span class="badge ok">● Present</span>' : '<span class="badge muted">○ Not yet</span>'}</td>
            <td>${a.calls}</td><td>${a.last}</td></tr>`).join('')}</tbody></table></div>
        </div>
        <div class="card"><div class="section-head"><h3>Leave Management</h3>${addBtn('leaves', 'Apply Leave')}</div>
          <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th></th></tr></thead>
          <tbody>${leaves.map(l => `<tr><td><b>${esc(D.empName(l.rep))}</b></td><td>${esc(l.type)}</td><td class="muted">${l.fromDate} → ${l.toDate}</td><td>${l.days}</td><td>${statusBadge(l.status)}</td>
            <td class="t-actions">${l.status === 'Pending' && canApprove ? `<button class="btn sm" data-action="leaveSet" data-id="${l.id}" data-status="Approved">✓</button><button class="btn ghost sm" data-action="leaveSet" data-id="${l.id}" data-status="Rejected">✕</button>` : `<button class="btn ghost sm" data-action="del" data-res="leaves" data-id="${l.id}">✕</button>`}</td></tr>`).join('')}</tbody></table></div>
          ${canApprove ? '' : '<div class="note mt">Approvals are limited to RBM, Business Head & Admin.</div>'}
        </div>
      </div>
      <div class="card mt">
        <div class="section-head"><h2 style="font-size:16px">Payroll &amp; Incentive Run</h2><button class="btn ghost sm" data-action="report" data-kind="payroll">⬇ CSV</button></div>
        <div class="sub" style="margin-top:-8px">Base salary + auto-computed incentive (from Target vs Achievement) − loss-of-pay + approved reimbursements${isAdmin ? ' · Admin can edit base salary' : ''}</div>
        <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Role</th><th>Base Salary</th><th>Incentive</th><th>LOP</th><th>Reimburse</th><th>Net Payable</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody>${payroll.map(p => `<tr><td><b>${esc(p.r.name)}</b></td><td><span class="pill">${esc(p.r.role)}</span></td>
            <td>${inr(p.base)}${p.r.salary == null ? ' <small class="muted">(default)</small>' : ''}</td><td class="${p.incentive ? 'delta up' : ''}">${p.incentive ? '+' + inr(p.incentive) : '—'}</td>
            <td>${p.lop ? '−' + inr(p.lop) : '—'}</td><td>${p.reimburse ? '+' + inr(p.reimburse) : '—'}</td><td><b>${inr(p.net)}</b></td>
            ${isAdmin ? `<td><button class="btn ghost sm" data-action="setSalary" data-id="${p.r.id}">✎ Salary</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
        <div class="between mt"><span class="muted">Total net payable</span><b>${inr(payroll.reduce((a, b) => a + b.net, 0))}</b></div>
      </div>`;
    },

    products() {
      const s = D.get();
      const admin = (D.user() || {}).role === 'Admin';
      const byDiv = groupSegments(s.products, p => D.divName(p.division));
      return `
      <div class="grid cols-4">
        <div class="card kpi"><span class="label">Total SKUs</span><span class="val">${s.products.length}</span><span class="delta">across divisions</span></div>
        <div class="card kpi"><span class="label">Divisions</span><span class="val">${s.divisions.length}</span><span class="delta">brand groups</span></div>
        <div class="card kpi"><span class="label">Avg MRP</span><span class="val">${inr(Math.round(s.products.reduce((a, p) => a + (p.mrp || p.price || 0), 0) / (s.products.length || 1)))}</span><span class="delta">per SKU</span></div>
        <div class="card kpi"><span class="label">5% GST SKUs</span><span class="val">${s.products.filter(p => (p.gst ?? 0.12) === 0.05).length}</span><span class="delta">life-saving slab</span></div>
      </div>
      <div class="grid cols-2 mt" style="grid-template-columns:1fr 2fr">
        <div class="card"><h3>SKUs by Division</h3>${pieChart(byDiv, 150)}</div>
        <div class="card">
          <div class="section-head"><h2 style="font-size:16px">SKU Master</h2>${admin ? addBtn('products', 'Add Product') : ''}</div>
          <div class="sub" style="margin-top:-8px">PTR/PTS auto-derived from MRP, GST &amp; margins${admin ? '' : ' · master data is Admin-managed'}</div>
          <div class="table-wrap"><table id="prod-table"><thead><tr><th>Product</th><th>Division</th><th>Specialty</th><th>MRP</th><th>GST</th><th>PTR</th><th>PTS</th>${admin ? '<th></th>' : ''}</tr></thead>
            <tbody>${s.products.map(p => { const pp = productPricing(p); return `<tr>
              <td><b>${esc(p.name)}</b></td><td>${esc(D.divName(p.division))}</td><td>${esc(p.specialty)}</td>
              <td>${inr(pp.mrp)}</td><td>${Math.round(pp.gst * 100)}%</td><td>₹${pp.ptr.toFixed(2)}</td><td>₹${pp.pts.toFixed(2)}</td>
              ${admin ? `<td>${rowActions('products', p.id, false)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
        </div>
      </div>
      ${admin ? `<div class="card mt"><div class="section-head"><h2 style="font-size:16px">Divisions</h2>${addBtn('divisions', 'Add Division')}</div>
        <div class="table-wrap"><table><thead><tr><th>Division</th><th>Business Head</th><th>SKUs</th><th></th></tr></thead>
          <tbody>${s.divisions.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.head || '—')}</td><td>${s.products.filter(p => p.division === d.id).length}</td>
            <td>${rowActions('divisions', d.id, false)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    },

    team() {
      const s = D.get();
      const order = ['Admin', 'Business Head', 'RBM', 'ABM', 'TSM', 'PMT', 'Accounts'];
      const isAdmin = (D.user() || {}).role === 'Admin';
      return `<div class="card">
        <div class="section-head"><h2>Team & Reporting Hierarchy</h2>${isAdmin ? `<button class="btn sm" data-action="addUser">＋ Add Team Member</button>` : ''}</div>
        <div class="sub" style="margin-top:-8px">👥 BH → RBM → ABM → TSM with role-based access control. New users can sign in immediately.</div>
        <div class="table-wrap"><table id="team-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Division</th><th>Reports To</th><th>Location</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
        <tbody>${s.employees.slice().sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).map(e => `<tr>
          <td><div class="flex"><span class="avatar" style="width:28px;height:28px;font-size:12px">${esc(e.name[0])}</span><b>${esc(e.name)}</b></div></td>
          <td class="muted">${esc(e.email || '—')}</td>
          <td><span class="pill">${esc(e.role)}</span></td><td>${esc(D.divName(e.division))}</td>
          <td>${e.reportsTo ? esc(D.empName(e.reportsTo)) : '—'}</td><td>${esc(e.city)}</td>
          ${isAdmin ? `<td>${e.id === D.user().id ? '<span class="muted">you</span>' : `<button class="btn ghost sm" data-action="delUser" data-id="${e.id}">✕</button>`}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
    },

    settings() {
      const s = D.get();
      return `
      <div class="grid cols-2">
        <div class="card"><h3>Tenant / Organisation</h3><div class="sub">Multi-tenant: every record scoped to org_id</div>
          <table><tbody>
            <tr><td class="muted">Organisation</td><td><b>${esc(s.org.name)}</b></td></tr>
            <tr><td class="muted">Plan</td><td>${esc(s.org.plan)}</td></tr>
            <tr><td class="muted">Hosting region</td><td>${esc(s.org.region)} · DPDP-aligned</td></tr>
            <tr><td class="muted">Divisions</td><td>${s.divisions.length}</td></tr>
            <tr><td class="muted">Users</td><td>${s.employees.length}</td></tr>
          </tbody></table>
        </div>
        <div class="card"><h3>AI Configuration</h3><div class="sub">Claude API model routing</div>
          <table><tbody>
            <tr><td><b>Haiku 4.5</b></td><td class="muted">Summary structuring, extraction, sentiment</td></tr>
            <tr><td><b>Sonnet 4.6</b></td><td class="muted">Daily to-do, route & priority guidance</td></tr>
            <tr><td><b>Opus 4.8</b></td><td class="muted">Region/territory strategy summaries</td></tr>
          </tbody></table>
          <div class="note mt">Speech-to-text runs on a separate STT service; transcript → Haiku for structuring.</div>
        </div>
      </div>
      <div class="card mt"><h3>Maps Provider</h3><div class="sub">GPS & Field Tracking uses real maps + live geolocation</div>
        <p class="muted">Currently using <b>${AmberMaps.hasGoogleKey() ? 'Google Maps' : 'OpenStreetMap (free, no key)'}</b>. To switch to Google Maps, paste a Google Maps JavaScript API key (from Google Cloud Console — requires a billing account). It is stored only in this browser.</p>
        <div class="flex" style="max-width:560px">
          <input id="gmaps-key" placeholder="Google Maps API key (optional)" value="${esc(localStorage.getItem('amber_gmaps_key') || '')}" style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:9px">
          <button class="btn sm" data-action="saveGmaps">Use Google Maps</button>
          ${AmberMaps.hasGoogleKey() ? `<button class="btn ghost sm" data-action="clearGmaps">Use OSM</button>` : ''}
        </div>
      </div>
      <div class="grid cols-2 mt">
        <div class="card"><h3>Change Password</h3><div class="sub">Update your own sign-in password</div>
          <div class="field"><label>Current password</label><input id="cp-cur" type="password"></div>
          <div class="field"><label>New password (min 6)</label><input id="cp-new" type="password"></div>
          <div class="field"><label>Confirm new password</label><input id="cp-new2" type="password"></div>
          <button class="btn sm" data-action="changePw">Update password</button>
        </div>
        <div class="card"><h3>Security</h3><div class="sub">Production hardening</div>
          <table><tbody>
            <tr><td class="muted">Passwords</td><td>scrypt-hashed (async)</td></tr>
            <tr><td class="muted">Sessions</td><td>signed JWT · 12h expiry</td></tr>
            <tr><td class="muted">Rate limiting</td><td>login & signup throttled per IP</td></tr>
            <tr><td class="muted">Database</td><td>indexed · WAL · org-scoped</td></tr>
            <tr><td class="muted">Audit</td><td>every action logged</td></tr>
          </tbody></table>
        </div>
      </div>
      ${(D.user() || {}).role === 'Admin' ? `<div class="card mt"><div class="section-head"><h3>Audit Log</h3><button class="btn ghost sm" data-action="loadAudit">↻ Load recent activity</button></div>
        <div id="audit-box"><p class="muted">Click "Load recent activity" to view the audit trail.</p></div></div>` : ''}
      <div class="card mt"><h3>Data & Security</h3><div class="sub">Real backend · SQLite database · JWT auth · org-scoped (multi-tenant) · audit logged</div>
        <p class="muted">Every change is persisted server-side in <code>server/data/amber.db</code> and survives restarts.</p></div>`;
    },

    ai() { return aiView(); },
  };

  // ---- shared components --------------------------------------------------
  function card(title, sub, inner) {
    return `<div class="card"><h3>${esc(title)}</h3><div class="sub">${sub}</div><div class="table-wrap">${inner}</div></div>`;
  }
  function docRow(d) {
    return `<tr data-tier="${d.tier}">
      <td><div class="flex"><span class="avatar" style="width:30px;height:30px;font-size:12px">${esc(d.name.replace('Dr. ', '')[0])}</span><b>${esc(d.name)}</b></div></td>
      <td>${esc(d.specialty)}</td><td>${esc(d.hospital)}<br><small class="muted">${esc(d.city)}</small></td>
      <td>${tierBadge(d.tier)}</td>
      <td><div class="flex"><div class="bar" style="width:70px"><i style="width:${d.potential}%"></i></div>${d.potential}</div></td>
      <td>${d.lastVisit}</td><td>${esc(D.empName(d.rep))}</td>
      <td>${rowActions('doctors', d.id, true)}</td></tr>`;
  }
  function approvalsTable(list, withActions) {
    if (!list.length) return '<p class="muted">No items.</p>';
    return `<table><thead><tr><th>Type</th><th>Raised By</th><th>Doctor</th><th>Amount</th><th>Purpose</th><th>Stage</th><th>Status</th>${withActions ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map(a => `<tr>
        <td><b>${esc(a.type)}</b></td><td>${esc(D.empName(a.raisedBy))}</td><td>${a.doctor ? esc(D.docName(a.doctor)) : '—'}</td>
        <td>${inr(a.amount)}</td><td class="muted" style="max-width:200px">${esc(a.purpose)}</td>
        <td><span class="pill">${a.stage}</span></td><td>${statusBadge(a.status)}</td>
        ${withActions ? `<td class="t-actions">${a.status === 'Pending'
          ? (canApproveBudget()
            ? `<button class="btn sm" data-action="approve" data-id="${a.id}">Approve</button><button class="btn ghost sm" data-action="reject" data-id="${a.id}">Reject</button>`
            : '<span class="badge pending">Awaiting Admin / Accounts</span>')
          : '✓'}</td>` : ''}
      </tr>`).join('')}</tbody></table>`;
  }

  // ---- AI copilot ---------------------------------------------------------
  let aiHistory = [{ role: 'ai', text: "Hi — I'm the <b>Amber AI Sales Copilot</b>. Ask me about doctor priorities, RCPA gaps, today's plan, or summarise a visit." }];
  function aiView() {
    const sugg = ['Who should I prioritise today?', 'Summarise my last visit', 'Where am I losing market share?', 'Draft a compliant CME note for Dr. Menon'];
    return `<div class="ai-shell">
      <div class="ai-log" id="ai-log">${aiHistory.map(m => `<div class="msg ${m.role}">${m.text}</div>`).join('')}</div>
      <div>
        <div class="suggest">${sugg.map(s => `<span class="chip" data-action="aiSuggest" data-q="${esc(s)}">${esc(s)}</span>`).join('')}</div>
        <div class="ai-input"><input id="ai-q" placeholder="Ask the Amber copilot…"><button class="btn sm" data-action="aiSend">Send</button></div>
      </div>
    </div>`;
  }
  function aiReply(q) {
    const s = D.get(), t = q.toLowerCase();
    if (/priorit|today|plan|to.?do/.test(t)) {
      const top = s.doctors.filter(d => d.tier === 'Platinum');
      return `Based on RCPA share and visit recency, prioritise: <b>${top.map(d => d.name).join(', ')}</b> (Platinum, high potential). Also clear the <b>overdue RCPA</b> for Dr. Imran Shaikh and re-verify the mock-location-flagged visit. Target: ~10 doctors + 5 chemists.`;
    }
    if (/summar|visit/.test(t)) {
      const v = s.visits[s.visits.length - 1];
      return `Last visit — <b>${D.docName(v.targetId)}</b> (${v.date}): ${esc(v.summary)} <br>→ Extracted: commitment <b>${v.commitment} units</b>, follow-up <b>${v.followUp}</b>, sentiment <b>${v.sentiment}</b>. <i>(Structured by Haiku 4.5)</i>`;
    }
    if (/market share|losing|competitor/.test(t)) {
      const weak = s.rcpa.filter(r => r.share < 50);
      return `You're below 50% share with: ${weak.map(r => `<b>${D.docName(r.doctor)}</b> (${r.share}% vs ${r.competitor})`).join(', ') || 'none — strong position!'}. Recommend a comparative-efficacy detailing and CLM e-detail follow-up.`;
    }
    if (/cme|compliant|note|draft/.test(t)) {
      return `Draft CME note: <i>"Sponsorship of bona-fide Continuing Medical Education for Dr. Menon at fair market value; scientific agenda attached; no prescription linkage. Purpose & value logged for audit per UCPMP."</i> Want me to raise the approval (ABM → RBM → Accounts)?`;
    }
    return `I can help with doctor prioritisation, RCPA/market-share gaps, visit summaries, route planning and compliant engagement drafting. Try one of the suggestions above.`;
  }

  // ---- modals & actions ---------------------------------------------------
  function modal(title, body, footer) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal"><header><h3>${esc(title)}</h3><button class="x" data-close>×</button></header>
      <div class="body">${body}</div><div class="foot">${footer || ''}</div></div>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back || e.target.hasAttribute('data-close')) back.remove(); });
    return back;
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }
  const uid = (p) => p + Math.random().toString(36).slice(2, 7);

  function openVisitModal() {
    const s = D.get();
    let photoData = null;
    const sttOk = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const body = `
      <div class="field"><label>Visit type</label><select id="v-type"><option>Doctor</option><option>Chemist</option></select></div>
      <div class="field"><label>Target</label><select id="v-target">${s.doctors.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="note">📍 Geofenced check-in — timestamp + geotag captured. Mock-location: <b>not detected ✓</b></div>
      <div class="field mt"><label>Post-visit dictated summary</label>
        <textarea id="v-sum" rows="3" placeholder="met Dr. X, discussed product Y, committed ~Z units…"></textarea>
        <div class="flex" style="margin-top:6px">
          <button type="button" class="btn ghost sm" id="v-mic" ${sttOk ? '' : 'disabled title="Speech recognition not supported in this browser"'}>🎤 ${sttOk ? 'Dictate' : 'Dictation N/A'}</button>
          <span class="muted" id="v-mic-status" style="font-size:12px"></span>
        </div>
      </div>
      <div class="field"><label>Visit-proof photo (optional)</label>
        <input id="v-photo" type="file" accept="image/*" capture="environment">
        <div id="v-photo-preview" class="mt"></div>
      </div>
      <p class="muted">AI structures your summary (product, commitment, follow-up). Photo + transcript are stored as visit proof.</p>`;
    const m = modal('Log a Visit (Geofenced Check-in)', body,
      `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="v-save">Save & sync</button>`);

    // ---- voice dictation (Web Speech API) ----
    let rec = null, listening = false;
    if (sttOk) {
      m.querySelector('#v-mic').onclick = () => {
        if (listening && rec) { rec.stop(); return; }
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.continuous = true;
        const ta = m.querySelector('#v-sum'); const base = ta.value;
        rec.onstart = () => { listening = true; m.querySelector('#v-mic').textContent = '⏹ Stop'; m.querySelector('#v-mic-status').textContent = 'Listening…'; };
        rec.onerror = (e) => { m.querySelector('#v-mic-status').textContent = 'Mic error: ' + e.error; };
        rec.onend = () => { listening = false; m.querySelector('#v-mic').textContent = '🎤 Dictate'; m.querySelector('#v-mic-status').textContent = ''; };
        rec.onresult = (ev) => {
          let txt = '';
          for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
          ta.value = (base ? base + ' ' : '') + txt;
        };
        rec.start();
      };
    }
    // ---- photo capture (downscaled to keep size small) ----
    m.querySelector('#v-photo').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 800, scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          photoData = c.toDataURL('image/jpeg', 0.7);
          m.querySelector('#v-photo-preview').innerHTML = `<img src="${photoData}" style="max-width:160px;border-radius:8px;border:1px solid var(--line)"> <span class="badge ok">📷 attached</span>`;
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };

    m.querySelector('#v-save').onclick = async () => {
      if (listening && rec) rec.stop();
      const sum = m.querySelector('#v-sum').value || 'Visit logged.';
      const commit = +((sum.match(/(\d+)\s*(units?|u)\b/i) || [])[1] || Math.floor(Math.random() * 30 + 5));
      try {
        await D.create('visits', { rep: D.user().id, type: m.querySelector('#v-type').value, targetId: m.querySelector('#v-target').value,
          date: today(), checkin: nowTime(), geoVerified: true, products: ['P1'], summary: sum, commitment: commit, followUp: '2026-07-01', sentiment: 'Positive', photo: photoData || '' });
        m.remove(); toast('Visit synced · AI extracted ' + commit + ' units'); route();
      } catch (e) { toast(e.message); }
    };
  }

  function openDoctor(id) {
    const s = D.get();
    const d = s.doctors.find(x => x.id === id); if (!d) return;
    const rc = s.rcpa.filter(r => r.doctor === id);
    const visits = s.visits.filter(v => v.targetId === id).slice().sort((a, b) => a.date < b.date ? 1 : -1);
    const lastV = visits[0];
    const samples = (s.samples || []).filter(x => x.doctor === id);
    const pendingFollowUp = lastV && lastV.followUp && lastV.followUp >= today() ? lastV.followUp : null;
    // next-best-action
    const nba = (() => {
      if (!rc.length) return '📈 Run an RCPA — no prescription audit on record yet.';
      const weak = rc.filter(r => r.share < 50);
      if (weak.length) return `🎯 Detail <b>${esc(weak[0].ourBrand)}</b> — only ${weak[0].share}% share vs ${esc(weak[0].competitor)}; share comparative-efficacy data.`;
      if (pendingFollowUp) return `📞 Follow up on the ${lastV.commitment}-unit commitment (due ${pendingFollowUp}).`;
      const deck = (s.edetail || []).find(e => e.specialty === d.specialty && e.status === 'Active');
      if (deck) return `🎬 Run the <b>${esc(deck.name)}</b> e-detailing deck on your next visit.`;
      return '✅ Strong position — maintain frequency and reinforce with samples.';
    })();
    modal(d.name, `
      <div class="between"><div>${tierBadge(d.tier)} <span class="muted">${esc(d.specialty)}</span></div><div><b>Potential ${d.potential}</b></div></div>
      <div class="note mt" style="border-left:3px solid var(--brand-2)"><b>🤖 Smart Call Card — Next Best Action</b><br>${nba}</div>
      <table class="mt"><tbody>
        <tr><td class="muted">Hospital</td><td>${esc(d.hospital)}, ${esc(d.city)}</td></tr>
        <tr><td class="muted">Phone</td><td>${esc(d.phone)}</td></tr>
        <tr><td class="muted">Assigned rep</td><td>${esc(D.empName(d.rep))}</td></tr>
        <tr><td class="muted">Last call</td><td>${lastV ? lastV.date + ' — ' + esc(lastV.summary).slice(0, 70) : 'No visits logged'}</td></tr>
        <tr><td class="muted">Pending follow-up</td><td>${pendingFollowUp ? '<b>' + pendingFollowUp + '</b>' : '—'}</td></tr>
        <tr><td class="muted">Samples issued</td><td>${samples.length ? samples.map(x => esc(D.prodName(x.product)) + ' ×' + x.qty).join(', ') : '—'}</td></tr>
        <tr><td class="muted">Linked chemists</td><td>${d.linkedChemists.map(c => esc(D.chemName(c))).join(', ') || '—'}</td></tr>
      </tbody></table>
      ${rc.length ? `<h3 class="mt">RCPA — Rx share</h3>${rc.map(r => `<div class="between"><span>${esc(r.ourBrand)} vs ${esc(r.competitor)}</span><span class="badge ${r.share >= 60 ? 'ok' : r.share >= 45 ? 'pending' : 'danger'}">${r.share}% share</span></div>`).join('')}` : ''}
      <div class="note mt">🛡️ Engagement tier drives compliant CME/scientific services at fair value — not prescription-linked rewards.</div>
    `, `<button class="btn ghost sm" data-action="edit" data-res="doctors" data-id="${d.id}" data-close>Edit</button>
       <button class="btn ghost sm" data-action="add" data-res="visits" data-close>Log Visit</button>
       <button class="btn sm" data-close>Close</button>`);
  }

  // ---- generic CRUD form system ------------------------------------------
  const SINGULAR = { doctors: 'Doctor', chemists: 'Chemist', distributors: 'Distributor', visits: 'Visit', rcpa: 'RCPA', campaigns: 'Campaign', samples: 'Sample', expenses: 'Expense', todos: 'Task', approvals: 'Approval Request', stock: 'Stock Item', orders: 'Order', recon: 'Channel Stock Row', leaves: 'Leave', edetail: 'E-Detail Deck', products: 'Product (SKU)', divisions: 'Division' };
  // base monthly gross salary by role (₹) — used for payslip
  const SALARY = { 'TSM': 42000, 'ABM': 68000, 'RBM': 110000, 'Business Head': 220000, 'PMT': 75000, 'Accounts': 60000, 'Admin': 90000 };
  const opts = (arr, val, label) => arr.map(o => ({ v: o[val], t: typeof label === 'function' ? label(o) : o[label] }));
  const sel = (a) => a.map(x => ({ v: x, t: x }));

  function fieldsFor(resource) {
    const s = D.get();
    const reps = opts(s.employees, 'id', 'name');
    const docs = opts(s.doctors, 'id', 'name');
    const chems = opts(s.chemists, 'id', 'name');
    const prods = opts(s.products, 'id', 'name');
    const targets = [...s.doctors.map(d => ({ v: d.id, t: '🩺 ' + d.name })), ...s.chemists.map(c => ({ v: c.id, t: '💊 ' + c.name }))];
    const SP = sel(['Cardiologist', 'Diabetologist', 'Gastroenterologist', 'Orthopedist', 'General Physician', 'Neurologist']);
    const map = {
      doctors: [
        { k: 'name', l: 'Name', t: 'text', req: 1 }, { k: 'specialty', l: 'Specialty', t: 'select', o: SP },
        { k: 'hospital', l: 'Hospital', t: 'text' }, { k: 'city', l: 'City', t: 'text' },
        { k: 'tier', l: 'Engagement Tier', t: 'select', o: sel(['Silver', 'Gold', 'Platinum']) },
        { k: 'potential', l: 'Potential (0–100)', t: 'number' }, { k: 'dob', l: 'Date of Birth', t: 'date' },
        { k: 'anniversary', l: 'Anniversary', t: 'date' }, { k: 'phone', l: 'Phone', t: 'text' },
        { k: 'rep', l: 'Assigned Rep', t: 'select', o: reps }, { k: 'lastVisit', l: 'Last Visit', t: 'date' },
        { k: 'lat', l: 'Latitude (for map)', t: 'number' }, { k: 'lng', l: 'Longitude (for map)', t: 'number' },
      ],
      chemists: [
        { k: 'name', l: 'Name', t: 'text', req: 1 }, { k: 'area', l: 'Area', t: 'text' }, { k: 'city', l: 'City', t: 'text' },
        { k: 'tier', l: 'Tier', t: 'select', o: sel(['Silver', 'Gold', 'Platinum']) },
        { k: 'dob', l: 'Date of Birth (for gifting)', t: 'date' },
        { k: 'rep', l: 'Assigned Rep', t: 'select', o: reps }, { k: 'monthlyValue', l: 'Monthly Sales / Achieved (₹)', t: 'number' },
        { k: 'target', l: 'Monthly Target (₹) — for perks', t: 'number' },
        { k: 'lastVisit', l: 'Last Visit', t: 'date' },
        { k: 'lat', l: 'Latitude (for map)', t: 'number' }, { k: 'lng', l: 'Longitude (for map)', t: 'number' },
      ],
      distributors: [
        { k: 'name', l: 'Name', t: 'text', req: 1 }, { k: 'city', l: 'City', t: 'text' },
        { k: 'tier', l: 'Tier', t: 'select', o: sel(['Silver', 'Gold', 'Platinum']) },
        { k: 'dob', l: 'Date of Birth (for gifting)', t: 'date' },
        { k: 'rep', l: 'Linked Rep', t: 'select', o: reps },
        { k: 'stockValue', l: 'Stock Value (₹)', t: 'number' }, { k: 'secondarySales', l: 'Secondary Sales / Achieved (₹)', t: 'number' },
        { k: 'target', l: 'Monthly Target (₹) — for perks', t: 'number' },
        { k: 'leadTime', l: 'CFA lead time (days) — for ROP', t: 'number' },
        { k: 'lastClosing', l: 'Last Closing', t: 'date' },
        { k: 'lat', l: 'Latitude (for map)', t: 'number' }, { k: 'lng', l: 'Longitude (for map)', t: 'number' },
      ],
      visits: [
        { k: 'rep', l: 'Rep', t: 'select', o: reps }, { k: 'type', l: 'Type', t: 'select', o: sel(['Doctor', 'Chemist']) },
        { k: 'targetId', l: 'Target (doctor / chemist)', t: 'select', o: targets }, { k: 'date', l: 'Date', t: 'date' },
        { k: 'checkin', l: 'Check-in time', t: 'text' },
        { k: 'geoVerified', l: 'Geo check-in', t: 'select', o: [{ v: 'true', t: 'Verified ✓' }, { v: 'false', t: 'Flagged ⚠' }], bool: 1 },
        { k: 'commitment', l: 'Commitment (units)', t: 'number' }, { k: 'followUp', l: 'Follow-up date', t: 'date' },
        { k: 'sentiment', l: 'Sentiment', t: 'select', o: sel(['Positive', 'Neutral', 'Negative']) },
        { k: 'summary', l: 'Visit summary', t: 'textarea' },
      ],
      rcpa: [
        { k: 'doctor', l: 'Doctor', t: 'select', o: docs, req: 1 }, { k: 'chemist', l: 'Chemist (audit source)', t: 'select', o: chems },
        { k: 'date', l: 'Date', t: 'date' }, { k: 'ourBrand', l: 'Our Brand', t: 'select', o: opts(s.products, 'name', 'name') },
        { k: 'ourScripts', l: 'Our Prescriptions', t: 'number' }, { k: 'competitor', l: 'Competitor Brand', t: 'text' },
        { k: 'compScripts', l: 'Competitor Prescriptions', t: 'number' }, { k: 'share', l: 'Our Share %', t: 'number' },
      ],
      campaigns: [
        { k: 'name', l: 'Campaign Name', t: 'text', req: 1 }, { k: 'product', l: 'Product', t: 'select', o: prods },
        { k: 'specialty', l: 'Target Specialty', t: 'select', o: SP }, { k: 'venue', l: 'Venues', t: 'text' },
        { k: 'status', l: 'Status', t: 'select', o: sel(['Planned', 'Active', 'Completed']) },
        { k: 'reach', l: 'Reach (doctors)', t: 'number' }, { k: 'sales', l: 'Sales (₹)', t: 'number' }, { k: 'spend', l: 'Spend (₹)', t: 'number' },
      ],
      samples: [
        { k: 'doctor', l: 'Doctor', t: 'select', o: docs, req: 1 }, { k: 'product', l: 'Product', t: 'select', o: prods },
        { k: 'qty', l: 'Quantity', t: 'number' }, { k: 'value', l: 'Value (₹)', t: 'number' },
        { k: 'purpose', l: 'Purpose', t: 'text' }, { k: 'date', l: 'Date', t: 'date' },
      ],
      expenses: [
        { k: 'rep', l: 'Rep', t: 'select', o: reps }, { k: 'type', l: 'Type', t: 'select', o: sel(['Travel (Bike)', 'Travel (Car)', 'Travel', 'Food & Lodging', 'Doctor Engagement', 'Stationery', 'Other']) },
        { k: 'mode', l: 'Travel mode (km-based)', t: 'select', o: sel(['—', 'Bike', 'Car']) },
        { k: 'km', l: 'Distance (km) — auto-calculates amount', t: 'number' },
        { k: 'amount', l: 'Amount (₹)', t: 'number' }, { k: 'status', l: 'Status', t: 'select', o: sel(['Pending', 'Approved', 'Rejected']) },
        { k: 'date', l: 'Date', t: 'date' },
      ],
      todos: [
        { k: 'rep', l: 'Assign to', t: 'select', o: reps }, { k: 'text', l: 'Task', t: 'text', req: 1 },
        { k: 'priority', l: 'Priority', t: 'select', o: sel(['High', 'Medium', 'Low']) }, { k: 'reason', l: 'Reason / context', t: 'text' },
      ],
      leaves: [
        { k: 'rep', l: 'Employee', t: 'select', o: reps, req: 1 },
        { k: 'type', l: 'Leave type', t: 'select', o: sel(['Casual Leave', 'Sick Leave', 'Privilege Leave', 'Comp Off', 'Loss of Pay']) },
        { k: 'fromDate', l: 'From', t: 'date' }, { k: 'toDate', l: 'To', t: 'date' },
        { k: 'days', l: 'Days', t: 'number' }, { k: 'reason', l: 'Reason', t: 'text' },
        { k: 'status', l: 'Status', t: 'select', o: sel(['Pending', 'Approved', 'Rejected']) },
      ],
      products: [
        { k: 'name', l: 'Product / SKU name', t: 'text', req: 1 },
        { k: 'division', l: 'Division', t: 'select', o: s.divisions.map(d => ({ v: d.id, t: d.name })) },
        { k: 'specialty', l: 'Specialty', t: 'select', o: SP },
        { k: 'mrp', l: 'MRP (₹, GST-inclusive)', t: 'number', def: 100 },
        { k: 'gst', l: 'GST', t: 'select', o: [{ v: 0.12, t: '12%' }, { v: 0.05, t: '5%' }, { v: 0.18, t: '18%' }, { v: 0, t: '0%' }] },
        { k: 'retailMargin', l: 'Retailer margin (e.g. 0.20)', t: 'number', def: 0.20 },
        { k: 'stockistMargin', l: 'Stockist margin (e.g. 0.10)', t: 'number', def: 0.10 },
      ],
      divisions: [
        { k: 'name', l: 'Division name', t: 'text', req: 1 },
        { k: 'head', l: 'Business Head', t: 'text' },
      ],
      edetail: [
        { k: 'name', l: 'Deck name', t: 'text', req: 1 },
        { k: 'product', l: 'Product', t: 'select', o: prods },
        { k: 'specialty', l: 'Target specialty', t: 'select', o: sel(['Cardiologist', 'Diabetologist', 'Gastroenterologist', 'Orthopedist', 'General Physician', 'Neurologist']) },
        { k: 'slides', l: 'Slides', t: 'number' }, { k: 'views', l: 'Views', t: 'number' },
        { k: 'engagement', l: 'Avg engagement %', t: 'number' },
        { k: 'status', l: 'Status', t: 'select', o: sel(['Draft', 'Active', 'Archived']) },
      ],
      recon: [
        { k: 'distributor', l: 'Distributor', t: 'select', o: s.distributors.map(d => ({ v: d.id, t: d.name })), req: 1 },
        { k: 'product', l: 'SKU / Product', t: 'select', o: prods },
        { k: 'opening', l: 'Opening channel stock (units)', t: 'number' },
        { k: 'primaryQty', l: 'Primary (company → stockist, units)', t: 'number' },
        { k: 'secondary', l: 'Secondary (stockist → retail, units)', t: 'number' },
        { k: 'returns', l: 'Returns (units)', t: 'number' },
      ],
      orders: [
        { k: 'party', l: 'Party (chemist / distributor)', t: 'select', o: [...s.chemists.map(c => ({ v: c.id, t: '💊 ' + c.name })), ...s.distributors.map(d => ({ v: d.id, t: '🚚 ' + d.name }))], req: 1 },
        { k: 'source', l: 'Sales type', t: 'select', o: sel(['Primary', 'Secondary']) },
        { k: 'product', l: 'Product', t: 'select', o: prods },
        { k: 'quantity', l: 'Quantity (units)', t: 'number' },
        { k: 'amount', l: 'Order Value (₹)', t: 'number' },
        { k: 'date', l: 'Date', t: 'date' },
        { k: 'status', l: 'Status', t: 'select', o: sel(['Open', 'Delivered', 'Closed', 'Cancelled']) },
      ],
      stock: [
        { k: 'owner', l: 'Stockist (chemist / distributor)', t: 'select', o: [...s.chemists.map(c => ({ v: c.id, t: '💊 ' + c.name })), ...s.distributors.map(d => ({ v: d.id, t: '🚚 ' + d.name }))], req: 1 },
        { k: 'product', l: 'Product', t: 'select', o: prods },
        { k: 'batch', l: 'Batch No.', t: 'text' },
        { k: 'quantity', l: 'Quantity (units)', t: 'number' },
        { k: 'mrp', l: 'MRP (₹)', t: 'number' },
        { k: 'expiry', l: 'Expiry date', t: 'date' },
      ],
      approvals: [
        { k: 'type', l: 'Request Type', t: 'select', o: sel(['CME Sponsorship', 'Sample Approval', 'Conference Approval', 'Event Approval', 'Gift Approval', 'Expense Claim']) },
        { k: 'raisedBy', l: 'Raised By', t: 'select', o: reps },
        { k: 'doctor', l: 'Doctor (optional)', t: 'select', o: [{ v: '', t: '— none —' }, ...docs] },
        { k: 'amount', l: 'Amount (₹)', t: 'number' },
        { k: 'purpose', l: 'Purpose / justification', t: 'textarea' },
      ],
    };
    return map[resource] || [];
  }

  const defVal = (f) => f.def != null ? f.def : f.o && f.o.length ? f.o[0].v : f.t === 'number' ? 0 : f.t === 'date' ? today() : '';

  function openForm(resource, existing, prefill) {
    const fields = fieldsFor(resource);
    const v = existing || prefill || {};
    const body = fields.map(f => {
      let cur = (f.k in v) ? v[f.k] : defVal(f);
      if (f.bool) cur = (cur === true || cur === 'true') ? 'true' : 'false';
      if (f.t === 'select') return `<div class="field"><label>${f.l}</label><select id="ff-${f.k}">${f.o.map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(cur) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select></div>`;
      if (f.t === 'textarea') return `<div class="field"><label>${f.l}</label><textarea id="ff-${f.k}" rows="3">${esc(cur)}</textarea></div>`;
      const tp = f.t === 'number' ? 'number' : f.t === 'date' ? 'date' : 'text';
      return `<div class="field"><label>${f.l}${f.req ? ' *' : ''}</label><input id="ff-${f.k}" type="${tp}" value="${esc(cur)}"></div>`;
    }).join('');
    const m = modal((existing ? 'Edit ' : 'Add ') + (SINGULAR[resource] || resource), body,
      `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="ff-save">${existing ? 'Save changes' : 'Create'}</button>`);
    m.querySelector('#ff-save').onclick = async () => {
      const obj = {};
      for (const f of fields) {
        const e = m.querySelector('#ff-' + f.k); let val = e.value;
        if (f.t === 'number') val = val === '' ? 0 : Number(val);
        else if (f.bool) val = (val === 'true');
        if (f.req && !String(val).trim()) return toast(f.l + ' is required');
        obj[f.k] = val;
      }
      // km-based travel: auto-calculate the amount from distance × per-km rate
      if (resource === 'expenses' && obj.km > 0 && TRAVEL_RATE[obj.mode]) {
        obj.amount = Math.round(obj.km * TRAVEL_RATE[obj.mode]);
        if (!/^Travel/.test(obj.type)) obj.type = 'Travel (' + obj.mode + ')';
      }
      if (resource === 'products') obj.price = obj.mrp; // keep legacy price aligned to MRP
      // new approval requests enter the chain at ABM stage, Pending
      if (resource === 'approvals' && !existing) {
        obj.stage = 'ABM'; obj.status = 'Pending'; obj.date = today();
        obj.log = ['ABM raised by ' + (D.empName(obj.raisedBy)) + ' — ' + today()];
      }
      try {
        if (existing) await D.update(resource, existing.id, obj);
        else await D.create(resource, obj);
        m.remove(); toast((SINGULAR[resource] || 'Record') + (existing ? ' updated' : ' created')); route();
      } catch (err) { toast(err.message); }
    };
  }

  function openView(resource, id) {
    if (resource === 'doctors') return openDoctor(id);
    const item = (D.get()[resource] || []).find(x => x.id === id); if (!item) return;
    const display = (f) => {
      let val = item[f.k];
      if (f.k === 'rep') return esc(D.empName(val));
      if (f.k === 'doctor' || (f.k === 'targetId' && item.type === 'Doctor')) return esc(D.docName(val));
      if (f.k === 'chemist' || (f.k === 'targetId' && item.type === 'Chemist')) return esc(D.chemName(val));
      if (f.k === 'product') return esc(D.prodName(val));
      if (f.bool) return val ? 'Verified ✓' : 'Flagged ⚠';
      if (typeof val === 'number' && /value|amount|sales|spend|monthly|stock|secondary/i.test(f.k)) return inr(val);
      return esc(val);
    };
    const rows = fieldsFor(resource).map(f => `<tr><td class="muted">${f.l}</td><td>${display(f)}</td></tr>`).join('');
    let extra = '';
    if (resource === 'visits' && item.photo) {
      extra = `<h3 class="mt">Visit-proof photo 📷</h3><img src="${item.photo}" style="max-width:100%;border-radius:10px;border:1px solid var(--line)">`;
    }
    if (resource === 'chemists' || resource === 'distributors') {
      const items = ownerStockItems(id);
      const val = items.reduce((a, b) => a + (b.quantity || 0) * (b.mrp || 0), 0);
      const bad = items.filter(x => ['expired', 'expiring'].includes(expiryStatus(x.expiry).key)).length;
      extra = `<h3 class="mt">Stock &amp; Expiry ${bad ? `<span class="badge danger">${bad} need attention</span>` : ''}</h3>
        <div class="sub">${items.length} SKU(s) · ${inr(val)} at MRP</div>
        ${items.length ? `<table><tbody>${items.map(x => { const st = expiryStatus(x.expiry); return `<tr><td><b>${esc(D.prodName(x.product))}</b> <small class="muted">${esc(x.batch)}</small></td><td>${(x.quantity || 0).toLocaleString('en-IN')} u</td><td><span class="badge ${st.badge}">${st.label}</span></td></tr>`; }).join('')}</tbody></table>` : '<p class="muted">No stock recorded.</p>'}
        <button class="btn ghost sm mt" data-action="ownerStock" data-id="${id}" data-close>Manage stock ›</button>`;
    }
    modal(SINGULAR[resource] || resource, `<table><tbody>${rows}</tbody></table>${extra}`,
      `<button class="btn ghost sm" data-action="edit" data-res="${resource}" data-id="${id}" data-close>Edit</button><button class="btn sm" data-close>Close</button>`);
  }

  function openTravelModal() {
    const s = D.get();
    const body = `
      <div class="field"><label>Rep</label><select id="tv-rep">${s.employees.map(e => `<option value="${e.id}" ${e.id === (D.user() || {}).id ? 'selected' : ''}>${esc(e.name)} (${esc(e.role)})</option>`).join('')}</select></div>
      <div class="grid2">
        <div class="field"><label>Mode</label><select id="tv-mode"><option value="Bike">🏍️ Bike (₹${TRAVEL_RATE.Bike}/km)</option><option value="Car">🚗 Car (₹${TRAVEL_RATE.Car}/km)</option></select></div>
        <div class="field"><label>Distance (km)</label><input id="tv-km" type="number" min="0" value="0"></div>
      </div>
      <div class="field"><label>Date</label><input id="tv-date" type="date" value="${today()}"></div>
      <div class="note" id="tv-calc">Amount: <b>₹0</b></div>`;
    const m = modal('Log Travel Expense (km-based)', body, `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="tv-save">Submit claim</button>`);
    const recalc = () => {
      const km = +m.querySelector('#tv-km').value || 0, mode = m.querySelector('#tv-mode').value;
      m.querySelector('#tv-calc').innerHTML = `Amount: <b>${inr(Math.round(km * TRAVEL_RATE[mode]))}</b> = ${km} km × ₹${TRAVEL_RATE[mode]}/km (${mode})`;
    };
    m.querySelector('#tv-km').addEventListener('input', recalc);
    m.querySelector('#tv-mode').addEventListener('change', recalc);
    m.querySelector('#tv-save').onclick = async () => {
      const km = +m.querySelector('#tv-km').value || 0, mode = m.querySelector('#tv-mode').value;
      if (km <= 0) return toast('Enter distance in km');
      const amount = Math.round(km * TRAVEL_RATE[mode]);
      try {
        await D.create('expenses', { rep: m.querySelector('#tv-rep').value, type: 'Travel (' + mode + ')', mode, km, amount, status: 'Pending', date: m.querySelector('#tv-date').value });
        m.remove(); toast('Travel claim submitted: ' + inr(amount)); route();
      } catch (e) { toast(e.message); }
    };
  }

  function openTargetModal(resource, id) {
    const s = D.get();
    const kind = resource === 'chemists' ? 'Chemist' : 'Distributor';
    const e = (s[resource] || []).find(x => x.id === id); if (!e) return;
    const achieved = kind === 'Chemist' ? (e.monthlyValue || 0) : (e.secondarySales || 0);
    const body = `
      <div class="between"><div><b>${esc(e.name)}</b> ${tierBadge(e.tier || 'Silver')}</div><span class="pill">${kind}</span></div>
      <table class="mt"><tbody>
        <tr><td class="muted">Achieved (${kind === 'Chemist' ? 'monthly sales' : 'secondary sales'})</td><td><b>${inr(achieved)}</b></td></tr>
      </tbody></table>
      <div class="field mt"><label>Monthly Target (₹)</label><input id="tg-val" type="number" min="0" value="${e.target || 0}"></div>
      <div class="note" id="tg-preview"></div>`;
    const m = modal('Set Target — ' + e.name, body, `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="tg-save">Save target</button>`);
    const preview = () => {
      const tgt = +m.querySelector('#tg-val').value || 0;
      const pct = tgt > 0 ? Math.round(achieved / tgt * 100) : 0;
      const slab = perkFor(pct);
      m.querySelector('#tg-preview').innerHTML = tgt > 0
        ? `At <b>${inr(tgt)}</b> target → <b>${pct}%</b> achieved · <span class="badge ${slab.badge}">${slab.label}</span><br><small>${esc(slab.perk)}${slab.rate > 0 ? ` · ≈ <b>${inr(Math.round(slab.rate * achieved))}</b> incentive` : ''}</small>`
        : 'Enter a target to preview the perk.';
    };
    m.querySelector('#tg-val').addEventListener('input', preview); preview();
    m.querySelector('#tg-save').onclick = async () => {
      try { await D.update(resource, id, { target: +m.querySelector('#tg-val').value || 0 }); m.remove(); toast('Target updated'); route(); }
      catch (err) { toast(err.message); }
    };
  }

  function openEmpTargetModal(id) {
    const e = (D.get().employees || []).find(x => x.id === id); if (!e) return;
    const tD = e.targetDoctors != null ? e.targetDoctors : DAILY_TARGET.doctors;
    const tC = e.targetChemists != null ? e.targetChemists : DAILY_TARGET.chemists;
    const body = `
      <div class="between"><div class="flex"><span class="avatar" style="width:30px;height:30px;font-size:12px">${esc(e.name[0])}</span><b>${esc(e.name)}</b></div><span class="pill">${esc(e.role)}</span></div>
      <p class="muted mt">Daily visit targets for this salesperson (used for daily-target tracking & the performance score).</p>
      <div class="grid2">
        <div class="field"><label>Doctors / day</label><input id="et-doc" type="number" min="0" value="${tD}"></div>
        <div class="field"><label>Chemists / day</label><input id="et-chem" type="number" min="0" value="${tC}"></div>
      </div>`;
    const m = modal('Set Daily Target — ' + e.name, body, `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="et-save">Save target</button>`);
    m.querySelector('#et-save').onclick = async () => {
      try {
        await D.updateEmpTarget(id, { targetDoctors: +m.querySelector('#et-doc').value || 0, targetChemists: +m.querySelector('#et-chem').value || 0 });
        m.remove(); toast('Target updated for ' + e.name); route();
      } catch (err) { toast(err.message); }
    };
  }

  function openSalaryModal(id) {
    const e = (D.get().employees || []).find(x => x.id === id); if (!e) return;
    const cur = (e.salary != null && e.salary > 0) ? e.salary : (SALARY[e.role] || 40000);
    const body = `
      <div class="between"><div class="flex"><span class="avatar" style="width:30px;height:30px;font-size:12px">${esc(e.name[0])}</span><b>${esc(e.name)}</b></div><span class="pill">${esc(e.role)}</span></div>
      <p class="muted mt">Base monthly gross salary (₹). Incentive, loss-of-pay and reimbursements are added automatically.</p>
      <div class="field"><label>Base salary (₹ / month)</label><input id="sl-val" type="number" min="0" value="${cur}"></div>`;
    const m = modal('Set Salary — ' + e.name, body, `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="sl-save">Save salary</button>`);
    m.querySelector('#sl-save').onclick = async () => {
      try { await D.updateEmpTarget(id, { salary: +m.querySelector('#sl-val').value || 0 }); m.remove(); toast('Salary updated for ' + e.name); route(); }
      catch (err) { toast(err.message); }
    };
  }

  function confirmDelete(resource, id) {
    const m = modal('Delete ' + (SINGULAR[resource] || 'record') + '?',
      `<p>This permanently removes the record from the database. This action cannot be undone.</p>`,
      `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="cd-yes" style="background:var(--danger)">Delete</button>`);
    m.querySelector('#cd-yes').onclick = async () => {
      try { await D.remove(resource, id); m.remove(); toast('Deleted'); route(); } catch (e) { toast(e.message); }
    };
  }

  function rowActions(resource, id, withView) {
    return `<div class="t-actions">
      ${withView ? `<button class="btn ghost sm" data-action="view" data-res="${resource}" data-id="${id}">View</button>` : ''}
      <button class="btn ghost sm" data-action="edit" data-res="${resource}" data-id="${id}">Edit</button>
      <button class="btn ghost sm" data-action="del" data-res="${resource}" data-id="${id}" title="Delete">✕</button>
    </div>`;
  }
  const addBtn = (resource, label) => `<button class="btn sm" data-action="add" data-res="${resource}">＋ ${label || ('Add ' + (SINGULAR[resource] || resource))}</button>`;

  // ---- global action handler ---------------------------------------------
  // close the alerts panel when clicking outside it
  document.addEventListener('click', (e) => {
    const p = document.getElementById('alerts-panel');
    if (p && !p.classList.contains('hidden') && !e.target.closest('.bell')) p.classList.add('hidden');
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action, id = el.dataset.id, s = D.get();
    const res = el.dataset.res;
    try {
      switch (a) {
        case 'logout': D.logout(); session = null; authScreen = 'landing'; authRole = null; renderAuth(); break;
        case 'toggleAlerts': { const p = document.getElementById('alerts-panel'); if (p) p.classList.toggle('hidden'); break; }
        case 'toggleNav': document.body.classList.toggle('nav-open'); break;
        case 'closeNav': document.body.classList.remove('nav-open'); break;
        case 'toggleView': toggleView(); break;
        case 'changePw': {
          const cur = $('#cp-cur').value, nw = $('#cp-new').value, nw2 = $('#cp-new2').value;
          if (!nw || nw.length < 6) return toast('New password must be at least 6 characters');
          if (nw !== nw2) return toast('New passwords do not match');
          try { await D.changePassword(cur, nw); toast('Password updated'); $('#cp-cur').value = $('#cp-new').value = $('#cp-new2').value = ''; }
          catch (err) { toast(err.message); }
          break;
        }
        case 'loadAudit': {
          try {
            const rows = await D.getAudit(100);
            const box = $('#audit-box');
            box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>${rows.map(a => `<tr><td class="muted">${new Date(a.ts).toLocaleString()}</td><td>${esc(a.user || '—')}</td><td>${esc(a.role || '')}</td><td><span class="pill">${esc(a.action)}</span></td><td class="muted">${esc(a.detail || '')}</td></tr>`).join('')}</tbody></table></div>`;
          } catch (err) { toast(err.message); }
          break;
        }
        case 'newVisit': openVisitModal(); break;
        case 'dashPeriod': dashState.period = el.dataset.period; route(); break;
        case 'dashDiv': dashState.division = el.dataset.div; route(); break;
        case 'dashSeries': dashState.series = el.dataset.series; route(); break;
        case 'dashRefresh': await D.bootstrap(); toast('Refreshed from server'); route(); break;
        case 'dashExport': exportDashboardCsv(); break;
        case 'exportOrders': downloadCsv('amber-orders-' + today() + '.csv', reportRows('orders')); break;
        case 'report': downloadCsv('amber-report-' + el.dataset.kind + '-' + today() + '.csv', reportRows(el.dataset.kind)); break;
        case 'printReport': window.print(); break;
        case 'add': openForm(res); break;
        case 'edit': { const item = (D.get()[res] || []).find(x => x.id === id); if (item) openForm(res, item); break; }
        case 'view': openView(res, id); break;
        case 'del': confirmDelete(res, id); break;
        case 'addUser': openUserForm(); break;
        case 'delUser': confirmDeleteUser(id); break;
        case 'expenseSet': await D.update('expenses', id, { status: el.dataset.status }); toast('Expense ' + el.dataset.status.toLowerCase()); route(); break;
        case 'leaveSet': await D.update('leaves', id, { status: el.dataset.status }); toast('Leave ' + el.dataset.status.toLowerCase()); route(); break;
        case 'setSalary': openSalaryModal(id); break;
        case 'logTravel': openTravelModal(); break;
        case 'setTarget': openTargetModal(res, id); break;
        case 'setEmpTarget': openEmpTargetModal(id); break;
        case 'locateMe': locateMe(); break;
        case 'toggleTrack': toggleTrack(el); break;
        case 'ownerStock': invFilter.owner = id; invFilter.status = 'all'; location.hash = 'inventory'; break;
        case 'giftWindow': giftWindow = +el.dataset.days; route(); break;
        case 'giftTab': giftTab = el.dataset.tab; route(); break;
        case 'distTab': distTab = el.dataset.tab; reconFilter = 'all'; route(); break;
        case 'reconFilter': reconFilter = (reconFilter === el.dataset.filter && el.dataset.filter !== 'all') ? 'all' : el.dataset.filter; route(); break;
        case 'pcalc': { pcalc.mrp = +$('#pc-mrp').value || 0; pcalc.gst = +$('#pc-gst').value; pcalc.ret = +$('#pc-ret').value || 0; pcalc.stk = +$('#pc-stk').value || 0; pcalc.paid = +$('#pc-paid').value || 0; pcalc.total = +$('#pc-total').value || 1; route(); break; }
        case 'raiseGift': {
          const kind = el.dataset.kind, cap = +el.dataset.cap;
          const name = kind === 'Doctor' ? D.docName(id) : (kind === 'Chemist' ? D.chemName(id) : (D.get().distributors.find(x => x.id === id) || {}).name || id);
          const prods = contactProducts(id, kind);
          const pTxt = prods.length ? prods.join(', ') : '';
          const purpose = kind === 'Doctor'
            ? `Content-relevant scientific engagement / educational materials${pTxt ? ' for ' + pTxt : ''} — ${name} (fair market value, relevance-based not prescription-linked, UCPMP)`
            : `Branded festive / relationship gift for ${name}${pTxt ? ' tied to ' + pTxt : ''} (${kind.toLowerCase()} trade partner)`;
          openForm('approvals', null, { type: 'Gift Approval', raisedBy: (D.user() || {}).id, doctor: kind === 'Doctor' ? id : '', amount: cap, purpose });
          break;
        }
        case 'invStatus': invFilter.status = el.dataset.status; route(); break;
        case 'invClearOwner': invFilter.owner = ''; route(); break;
        case 'reverify': await D.update('visits', id, { geoVerified: true }); toast('Visit re-verified ✓'); route(); break;
        case 'navTo': navigateTo((document.getElementById('nav-dest') || {}).value); break;
        case 'navGoogle': openGoogleDirections(el.dataset.id || (document.getElementById('nav-dest') || {}).value); break;
        case 'saveGmaps': { const k = ($('#gmaps-key').value || '').trim(); if (!k) return toast('Paste a key first'); localStorage.setItem('amber_gmaps_key', k); toast('Google Maps enabled · reloading…'); setTimeout(() => location.reload(), 700); break; }
        case 'clearGmaps': localStorage.removeItem('amber_gmaps_key'); toast('Reverted to OpenStreetMap · reloading…'); setTimeout(() => location.reload(), 700); break;
        case 'filterDoc': {
          document.querySelectorAll('#doc-filter .chip').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          const tier = el.dataset.tier;
          document.querySelectorAll('#doc-table tbody tr').forEach(tr => tr.dataset.tier && (tr.style.display = (tier === 'All' || tr.dataset.tier === tier) ? '' : 'none'));
          break;
        }
        case 'filterTier': {
          el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          const tier = el.dataset.tier, tbl = el.dataset.table;
          document.querySelectorAll('#' + tbl + ' tbody tr').forEach(tr => tr.dataset.tier && (tr.style.display = (tier === 'All' || tr.dataset.tier === tier) ? '' : 'none'));
          break;
        }
        case 'toggleTodo': { const t = s.todos.find(x => x.id === id); if (t) await D.update('todos', id, { done: !t.done }); route(); break; }
        case 'approve': await D.approval(id, 'approve'); toast('Approval advanced'); route(); break;
        case 'reject': await D.approval(id, 'reject'); toast('Request rejected'); route(); break;
        case 'aiSend': case 'aiSuggest': handleAi(el.dataset.q); break;
      }
    } catch (err) { toast(err.message); }
  });

  // ---- live search (filter table rows by text) ---------------------------
  document.addEventListener('input', (e) => {
    const box = e.target.closest('[data-search]'); if (!box) return;
    const q = box.value.toLowerCase();
    document.querySelectorAll('#' + box.dataset.search + ' tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  // ---- user (team) management --------------------------------------------
  function openUserForm() {
    const s = D.get();
    const roles = ['Business Head', 'RBM', 'ABM', 'TSM', 'PMT', 'Accounts', 'Admin'];
    const body = `
      <div class="field"><label>Full name *</label><input id="uf-name"></div>
      <div class="field"><label>Email *</label><input id="uf-email" type="email" placeholder="name@amber.test"></div>
      <div class="field"><label>Role</label><select id="uf-role">${roles.map(r => `<option ${r === 'TSM' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="field"><label>Division</label><select id="uf-div">${s.divisions.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Reports to</label><select id="uf-rep"><option value="">— none —</option>${s.employees.map(e2 => `<option value="${e2.id}">${esc(e2.name)} (${esc(e2.role)})</option>`).join('')}</select></div>
      <div class="field"><label>City / Location</label><input id="uf-city"></div>
      <div class="field"><label>Password</label><input id="uf-pass" value="amber123"></div>`;
    const m = modal('Add Team Member', body, `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="uf-save">Create user</button>`);
    m.querySelector('#uf-save').onclick = async () => {
      const name = m.querySelector('#uf-name').value.trim(), email = m.querySelector('#uf-email').value.trim();
      if (!name || !email) return toast('Name and email are required');
      try {
        await D.createUser({ name, email, role: m.querySelector('#uf-role').value, division: m.querySelector('#uf-div').value,
          reportsTo: m.querySelector('#uf-rep').value || null, city: m.querySelector('#uf-city').value, password: m.querySelector('#uf-pass').value });
        m.remove(); toast('User created · can now sign in'); route();
      } catch (e) { toast(e.message); }
    };
  }
  function confirmDeleteUser(id) {
    const m = modal('Remove team member?', `<p>This removes <b>${esc(D.empName(id))}</b> and their login access.</p>`,
      `<button class="btn ghost sm" data-close>Cancel</button><button class="btn sm" id="du-yes" style="background:var(--danger)">Remove</button>`);
    m.querySelector('#du-yes').onclick = async () => {
      try { await D.removeUser(id); m.remove(); toast('User removed'); route(); } catch (e) { toast(e.message); }
    };
  }

  function handleAi(q) {
    const input = $('#ai-q');
    const question = q || (input && input.value.trim());
    if (!question) return;
    aiHistory.push({ role: 'user', text: esc(question) });
    aiHistory.push({ role: 'ai', text: aiReply(question) });
    $('#main').innerHTML = aiView();
    const log = $('#ai-log'); if (log) log.scrollTop = log.scrollHeight;
  }

  // ---- GPS & live location -----------------------------------------------
  let gpsMap = null, liveWatch = null, lastFix = null, trailCoords = [];
  const TIER_COLOR = { Platinum: '#5b6f8a', Gold: '#e0a106', Silver: '#9aa6b2' };

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371000, t = Math.PI / 180;
    const dLa = (la2 - la1) * t, dLo = (lo2 - lo1) * t;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  const fmtDist = (m) => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';

  async function initGpsMap() {
    const s = D.get();
    gpsMap = null;
    try {
      const m = await AmberMaps.create('map', { center: [19.085, 72.86], zoom: 12 });
      gpsMap = m;
      s.doctors.filter(d => d.lat).forEach(d => {
        const col = TIER_COLOR[d.tier] || '#9aa6b2';
        m.marker(d.lat, d.lng, { color: col, title: d.name, popup: `<b>${esc(d.name)}</b><br>${esc(d.specialty)} · ${esc(d.tier)}<br>${esc(d.hospital)}, ${esc(d.city)}` });
        m.circle(d.lat, d.lng, 200, { color: col });
      });
      s.chemists.filter(c => c.lat).forEach(c => m.marker(c.lat, c.lng, { color: '#10a37f', title: c.name, popup: `<b>${esc(c.name)}</b><br>Chemist · ${esc(c.area)}, ${esc(c.city)}` }));
      s.distributors.filter(d => d.lat).forEach(d => m.marker(d.lat, d.lng, { color: '#8b5cf6', title: d.name, popup: `<b>${esc(d.name)}</b><br>Distributor · ${esc(d.city)}` }));
      // draw the signed-in rep's visit route through real target coordinates
      const me = D.user().id;
      const coords = s.visits.filter(v => v.rep === me).slice().sort((a, b) => a.date < b.date ? -1 : 1)
        .map(v => { const t = v.type === 'Doctor' ? s.doctors.find(d => d.id === v.targetId) : s.chemists.find(c => c.id === v.targetId); return t && t.lat ? [t.lat, t.lng] : null; })
        .filter(Boolean);
      if (coords.length > 1) m.polyline(coords, { color: '#3b82f6' });
      m.fit();
      if (lastFix) applyFix(lastFix.lat, lastFix.lng, lastFix.acc);
    } catch (e) {
      const mapEl = document.getElementById('map'); if (mapEl) mapEl.style.display = 'none';
      const fb = document.getElementById('map-fallback');
      if (fb) fb.innerHTML = `<div class="note">🌐 Live map tiles need an internet connection (loading ${AmberMaps.hasGoogleKey() ? 'Google Maps' : 'OpenStreetMap'}). Your live GPS location buttons still work. <br><small>${esc(e.message)}</small></div>`;
    }
  }

  function applyFix(lat, lng, acc) {
    lastFix = { lat, lng, acc };
    if (gpsMap) gpsMap.setLive(lat, lng, 'You');
    // breadcrumb trail while live tracking is on
    if (liveWatch != null && gpsMap) {
      const last = trailCoords[trailCoords.length - 1];
      if (!last || haversine(last[0], last[1], lat, lng) > 5) trailCoords.push([lat, lng]);
      gpsMap.updateTrail(trailCoords);
    }
    const s = D.get();
    const targets = [
      ...s.doctors.filter(d => d.lat).map(d => ({ n: d.name, lat: d.lat, lng: d.lng, r: 200 })),
      ...s.chemists.filter(c => c.lat).map(c => ({ n: c.name, lat: c.lat, lng: c.lng, r: 200 })),
    ];
    let best = null;
    targets.forEach(t => { const dm = haversine(lat, lng, t.lat, t.lng); if (!best || dm < best.dm) best = { ...t, dm }; });
    const stat = document.getElementById('live-stat');
    if (stat) stat.innerHTML = `<span class="label">My Live Location</span><span class="val" style="font-size:15px">${lat.toFixed(4)}, ${lng.toFixed(4)}</span><span class="delta ${best && best.dm <= best.r ? 'up' : 'muted'}">±${Math.round(acc || 0)}m accuracy</span>`;
    const ro = document.getElementById('geo-readout');
    if (ro && best) {
      const inside = best.dm <= best.r;
      ro.classList.remove('hidden');
      ro.innerHTML = `📍 You are at <b>${lat.toFixed(5)}, ${lng.toFixed(5)}</b> (±${Math.round(acc || 0)}m). Nearest location: <b>${esc(best.n)}</b> — ${fmtDist(best.dm)} away. ${inside ? '<b style="color:var(--ok)">✓ Inside geofence — a check-in here would be verified.</b>' : '<b style="color:var(--warn)">Outside the 200 m geofence — move closer to auto check-in.</b>'}`;
    }
  }

  function locateMe() {
    if (!navigator.geolocation) return toast('Geolocation is not supported by this browser');
    toast('Locating you…');
    navigator.geolocation.getCurrentPosition(
      pos => applyFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      err => toast('Location error: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
  function toggleTrack(btn) {
    if (liveWatch != null) {
      navigator.geolocation.clearWatch(liveWatch); liveWatch = null;
      btn.textContent = '▶ Live tracking'; btn.classList.add('ghost'); toast('Live tracking stopped'); return;
    }
    if (!navigator.geolocation) return toast('Geolocation is not supported');
    trailCoords = [];
    liveWatch = navigator.geolocation.watchPosition(
      pos => applyFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      err => toast('Tracking error: ' + err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    btn.textContent = '⏸ Stop tracking'; btn.classList.remove('ghost'); toast('Live tracking on — your marker and trail follow you');
  }

  // ---- live directions ----------------------------------------------------
  function currentPos() {
    return new Promise((resolve, reject) => {
      if (lastFix) return resolve(lastFix);
      if (!navigator.geolocation) return reject(new Error('Geolocation is not supported'));
      navigator.geolocation.getCurrentPosition(
        p => { applyFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy); resolve(lastFix); },
        e => reject(new Error(e.message)), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    });
  }
  function destById(id) {
    const s = D.get();
    return s.doctors.find(d => d.id === id) || s.chemists.find(c => c.id === id) || null;
  }
  async function getDirections(from, to) {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('routing service unavailable');
    const j = await r.json();
    if (!j.routes || !j.routes.length) throw new Error('no road route found');
    const rt = j.routes[0];
    return { coords: rt.geometry.coordinates.map(c => [c[1], c[0]]), distance: rt.distance, duration: rt.duration };
  }
  async function navigateTo(destId) {
    const t = destById(destId);
    if (!t || !t.lat) return toast('That location has no coordinates yet');
    toast('Getting your location…');
    let from;
    try { from = await currentPos(); } catch (e) { return toast('Location needed for directions: ' + e.message); }
    if (!gpsMap) return toast('Map is still loading — try again in a moment');
    toast('Calculating road route…');
    const ro = document.getElementById('nav-readout');
    try {
      const dir = await getDirections(from, { lat: t.lat, lng: t.lng });
      gpsMap.drawRoute(dir.coords);
      if (ro) {
        ro.classList.remove('hidden');
        ro.innerHTML = `🧭 Route to <b>${esc(t.name)}</b>: <b>${(dir.distance / 1000).toFixed(1)} km</b> by road · ~<b>${Math.round(dir.duration / 60)} min</b> drive. <a data-action="navGoogle" data-id="${destId}" style="cursor:pointer"><b>Open turn-by-turn in Google Maps ›</b></a>`;
      }
      toast('Route ready · ' + (dir.distance / 1000).toFixed(1) + ' km');
    } catch (e) {
      // fallback: straight line + offer Google Maps for real turn-by-turn
      gpsMap.drawRoute([[from.lat, from.lng], [t.lat, t.lng]]);
      const km = (haversine(from.lat, from.lng, t.lat, t.lng) / 1000).toFixed(1);
      if (ro) { ro.classList.remove('hidden'); ro.innerHTML = `🧭 Direct line to <b>${esc(t.name)}</b>: <b>${km} km</b> (live road routing unavailable). <a data-action="navGoogle" data-id="${destId}" style="cursor:pointer"><b>Open turn-by-turn in Google Maps ›</b></a>`; }
      toast('Showing direct line — use Google Maps for turn-by-turn');
    }
  }
  async function openGoogleDirections(destId) {
    const t = destById(destId);
    if (!t || !t.lat) return toast('That location has no coordinates yet');
    let origin = '';
    try { const from = await currentPos(); origin = `&origin=${from.lat},${from.lng}`; } catch (e) { /* origin optional */ }
    window.open(`https://www.google.com/maps/dir/?api=1${origin}&destination=${t.lat},${t.lng}&travelmode=driving`, '_blank');
  }

  const AFTER = { gps: initGpsMap };

  // ---- dashboard CSV export ----------------------------------------------
  // generic CSV download from an array-of-arrays
  function downloadCsv(name, rows) {
    const csv = rows.map(r => r.map(c => { const x = String(c == null ? '' : c); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Downloaded ' + name);
  }

  function reportRows(kind) {
    const s = D.get();
    if (kind === 'doctors') return [['Name', 'Specialty', 'Hospital', 'City', 'Tier', 'Potential', 'Rep', 'Last Visit'], ...s.doctors.map(d => [d.name, d.specialty, d.hospital, d.city, d.tier, d.potential, D.empName(d.rep), d.lastVisit])];
    if (kind === 'stock') return [['Stockist', 'Type', 'Product', 'Batch', 'Qty', 'MRP', 'Value', 'Expiry', 'Status'], ...(s.stock || []).map(x => { const st = expiryStatus(x.expiry); return [ownerName(x.owner), ownerType(x.owner), D.prodName(x.product), x.batch, x.quantity, x.mrp, (x.quantity || 0) * (x.mrp || 0), x.expiry, st.key]; })];
    if (kind === 'orders') return [['Date', 'Party', 'Type', 'Product', 'Qty', 'Value', 'Status'], ...(s.orders || []).map(o => [o.date, ownerName(o.party), o.source, D.prodName(o.product), o.quantity, o.amount, o.status])];
    if (kind === 'recon') return [['Distributor', 'SKU', 'Opening', 'Primary', 'Secondary', 'Returns', 'Closing', 'DOI', 'Safety', 'ROP', 'Max', 'Suggest', 'Status', 'Action'], ...(s.recon || []).map(r => { const c = reconCompute(r); return [c.dist.name || r.distributor, D.prodName(r.product), c.opening, c.primary, c.secondary, c.returns, Math.round(c.closing), isFinite(c.doi) ? Math.round(c.doi) : '', Math.round(c.safety), Math.round(c.rop), Math.round(c.maxStock), c.suggest, c.status, c.action]; })];
    if (kind === 'payroll') return [['Employee', 'Role', 'Base', 'Incentive', 'LOP', 'Reimburse', 'Net'], ...s.employees.map(r => { const base = SALARY[r.role] || 40000; const reimb = s.expenses.filter(x => x.rep === r.id && x.status === 'Approved').reduce((a, b) => a + b.amount, 0); return [r.name, r.role, base, '', '', reimb, base + reimb]; })];
    if (kind === 'expenses') return [['Rep', 'Type', 'Mode', 'Km', 'Amount', 'Status', 'Date'], ...s.expenses.map(x => [D.empName(x.rep), x.type, x.mode || '', x.km || '', x.amount, x.status, x.date])];
    if (kind === 'schemes') return [['Partner', 'Type', 'Tier', 'Target', 'Achieved', 'Achievement %', 'Perk'], ...[...s.chemists.map(c => ({ e: c, k: 'Chemist' })), ...s.distributors.map(d => ({ e: d, k: 'Distributor' }))].map(x => { const a = tradeAchievement(x.e, x.k); return [x.e.name, x.k, x.e.tier, a.target, a.achieved, a.pct + '%', a.slab.label]; })];
    if (kind === 'field') {
      const reps = s.employees.filter(e => ['TSM', 'ABM'].includes(e.role));
      return [['Salesperson', 'Role', 'Assigned', 'Covered', 'Coverage %', 'Geo %', 'Performance %', 'Incentive'], ...reps.map(r => {
        const aDocs = s.doctors.filter(d => d.rep === r.id), aChems = s.chemists.filter(c => c.rep === r.id);
        const mv = s.visits.filter(v => v.rep === r.id); const visited = new Set(mv.map(v => v.targetId));
        const totA = aDocs.length + aChems.length; const cov = aDocs.filter(d => visited.has(d.id)).length + aChems.filter(c => visited.has(c.id)).length;
        const covPct = totA ? Math.round(cov / totA * 100) : 0; const geo = mv.length ? Math.round(mv.filter(v => v.geoVerified).length / mv.length * 100) : 0;
        const score = Math.round(0.6 * covPct + 0.25 * geo); const perk = repPerkFor(score);
        return [r.name, r.role, totA, cov, covPct + '%', geo + '%', score + '%', perk.amount ? ('₹' + perk.amount) : '—'];
      })];
    }
    return [['No data for ' + kind]];
  }

  function exportDashboardCsv() {
    const s = D.get(), st = dashState;
    const empDiv = (id) => (s.employees.find(e => e.id === id) || {}).division;
    const inDiv = (repId) => st.division === 'all' || empDiv(repId) === st.division;
    const doctors = s.doctors.filter(d => inDiv(d.rep));
    const visits = s.visits.filter(v => inDiv(v.rep));
    const pendingAppr = s.approvals.filter(a => a.status === 'Pending' && inDiv(a.raisedBy));
    const spend = s.expenses.filter(x => inDiv(x.rep)).reduce((a, b) => a + b.amount, 0);
    const months = st.period === 'month' ? 1 : st.period === 'quarter' ? 3 : 6;
    const revenue = s.salesTrend.slice(-months).reduce((a, b) => a + b.primary, 0);
    const divName = st.division === 'all' ? 'All Divisions' : D.divName(st.division);
    const rows = [
      ['Amber LifeSciences — Executive Dashboard Export'],
      ['Division', divName], ['Period', st.period.toUpperCase()], ['Generated', new Date().toString()],
      [],
      ['Metric', 'Value'],
      ['Revenue (period, lakh)', revenue],
      ['Active Doctors', doctors.length],
      ['Field Visits', visits.length],
      ['Units Committed', visits.reduce((a, b) => a + (b.commitment || 0), 0)],
      ['Pending Approvals', pendingAppr.length],
      ['Field Spend', spend],
      ['Doctor Coverage %', s.metrics.doctorCoverage],
      [],
      ['Recent Visits'], ['Date', 'Rep', 'Type', 'Target', 'Geo-verified', 'Commitment', 'Sentiment'],
      ...visits.slice().sort((a, b) => a.date < b.date ? 1 : -1).map(v => [
        v.date, D.empName(v.rep), v.type, v.type === 'Doctor' ? D.docName(v.targetId) : D.chemName(v.targetId),
        v.geoVerified ? 'Yes' : 'No', v.commitment || 0, v.sentiment]),
    ];
    const csv = rows.map(r => r.map(c => { const x = String(c == null ? '' : c); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `amber-dashboard-${st.division}-${st.period}-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Dashboard exported to CSV');
  }

  // ---- router -------------------------------------------------------------
  async function route() {
    const r = (location.hash || '#dashboard').slice(1);
    if (!D.isAuthed()) return renderAuth();
    if (!D.get()) {
      try { await D.bootstrap(); } catch (e) { D.logout(); authScreen = 'landing'; return renderAuth(); }
    }
    session = D.user();
    const blocked = VIEWS[r] && !canAccess(r);
    const target = (VIEWS[r] && canAccess(r)) ? r : 'dashboard';
    renderShell(target);
    if (blocked) toast('That page is restricted to management roles');
  }
  function boot() { applyView(); route(); }
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
