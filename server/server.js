/* ============================================================================
 * Amber LifeSciences — Pharma Commercial Operating System
 * server.js — HTTP API + static host. Node built-ins only (http, sqlite, crypto)
 * ==========================================================================*/
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db } = require('./db');
const { verifyPw, signToken, verifyToken, hashPw, hashPwAsync, verifyPwAsync } = require('./auth');

// ---- simple in-memory rate limiter (per IP, sliding 1-min window) ----------
const rlMap = new Map();
function rateLimited(ip, max = 12) {
  const now = Date.now(), w = 60000;
  const e = rlMap.get(ip) || { count: 0, ts: now };
  if (now - e.ts > w) { e.count = 0; e.ts = now; }
  e.count++; rlMap.set(ip, e);
  return e.count > max;
}

const PORT = process.env.PORT || 4321;
const PUBLIC = path.join(__dirname, '..', 'public');
const uid = (p) => p + crypto.randomBytes(4).toString('hex');
const nowISO = () => new Date().toISOString();

// ---- resource config (dto <-> column mapping) -----------------------------
// type flags: j=JSON, b=boolean(int), n=number
const R = {
  doctors: { table: 'doctors', id: 'D', f: { name: 'name', specialty: 'specialty', hospital: 'hospital', city: 'city', tier: 'tier', potential: ['potential', 'n'], dob: 'dob', anniversary: 'anniversary', phone: 'phone', rep: 'rep_id', lastVisit: 'last_visit', linkedChemists: ['linked_chemists', 'j'], lat: ['lat', 'n'], lng: ['lng', 'n'] } },
  chemists: { table: 'chemists', id: 'C', f: { name: 'name', area: 'area', city: 'city', rep: 'rep_id', monthlyValue: ['monthly_value', 'n'], lastVisit: 'last_visit', lat: ['lat', 'n'], lng: ['lng', 'n'], tier: 'tier', dob: 'dob', target: ['target', 'n'] } },
  distributors: { table: 'distributors', id: 'DS', f: { name: 'name', city: 'city', rep: 'rep_id', stockValue: ['stock_value', 'n'], secondarySales: ['secondary_sales', 'n'], lastClosing: 'last_closing', lat: ['lat', 'n'], lng: ['lng', 'n'], tier: 'tier', dob: 'dob', target: ['target', 'n'], leadTime: ['lead_time_days', 'n'] } },
  visits: { table: 'visits', id: 'V', f: { rep: 'rep_id', type: 'type', targetId: 'target_id', date: 'date', checkin: 'checkin', geoVerified: ['geo_verified', 'b'], products: ['products', 'j'], summary: 'summary', commitment: ['commitment', 'n'], followUp: 'follow_up', sentiment: 'sentiment', photo: 'photo' } },
  rcpa: { table: 'rcpa', id: 'R', f: { doctor: 'doctor_id', chemist: 'chemist_id', date: 'date', ourBrand: 'our_brand', ourScripts: ['our_scripts', 'n'], competitor: 'competitor', compScripts: ['comp_scripts', 'n'], share: ['share', 'n'] } },
  campaigns: { table: 'campaigns', id: 'CM', f: { name: 'name', product: 'product_id', specialty: 'specialty', venue: 'venue', status: 'status', reach: ['reach', 'n'], sales: ['sales', 'n'], spend: ['spend', 'n'] } },
  approvals: { table: 'approvals', id: 'AP', f: { type: 'type', raisedBy: 'raised_by', doctor: 'doctor_id', amount: ['amount', 'n'], purpose: 'purpose', stage: 'stage', status: 'status', date: 'date', log: ['log', 'j'] } },
  samples: { table: 'samples', id: 'S', f: { doctor: 'doctor_id', product: 'product_id', qty: ['qty', 'n'], value: ['value', 'n'], purpose: 'purpose', date: 'date' } },
  expenses: { table: 'expenses', id: 'EX', f: { rep: 'rep_id', type: 'type', amount: ['amount', 'n'], status: 'status', date: 'date', km: ['km', 'n'], mode: 'mode' } },
  todos: { table: 'todos', id: 'T', f: { rep: 'rep_id', text: 'text', priority: 'priority', done: ['done', 'b'], reason: 'reason' } },
  stock: { table: 'stock', id: 'STK', f: { owner: 'owner_id', product: 'product_id', batch: 'batch', quantity: ['quantity', 'n'], mrp: ['mrp', 'n'], expiry: 'expiry' } },
  orders: { table: 'orders', id: 'O', f: { party: 'party_id', source: 'source', product: 'product_id', quantity: ['quantity', 'n'], amount: ['amount', 'n'], date: 'date', status: 'status' } },
  recon: { table: 'recon', id: 'RC', f: { distributor: 'distributor_id', product: 'product_id', opening: ['opening', 'n'], primaryQty: ['primary_qty', 'n'], secondary: ['secondary', 'n'], returns: ['returns', 'n'] } },
  leaves: { table: 'leaves', id: 'LV', f: { rep: 'rep_id', type: 'type', fromDate: 'fromDate', toDate: 'toDate', days: ['days', 'n'], reason: 'reason', status: 'status' } },
  edetail: { table: 'edetail', id: 'ED', f: { name: 'name', product: 'product_id', specialty: 'specialty', slides: ['slides', 'n'], views: ['views', 'n'], engagement: ['engagement', 'n'], status: 'status' } },
  products: { table: 'products', id: 'P', f: { name: 'name', division: 'division_id', specialty: 'specialty', price: ['price', 'n'], mrp: ['mrp', 'n'], gst: ['gst', 'n'], retailMargin: ['retail_margin', 'n'], stockistMargin: ['stockist_margin', 'n'] } },
  divisions: { table: 'divisions', id: 'DIV', f: { name: 'name', head: 'head' } },
};
// master data only Admin may create / edit / delete
const ADMIN_RESOURCES = new Set(['products', 'divisions']);
const colOf = (spec) => Array.isArray(spec) ? spec[0] : spec;
const typeOf = (spec) => Array.isArray(spec) ? spec[1] : 's';

function rowToDto(res, row) {
  const out = { id: row.id };
  for (const [field, spec] of Object.entries(res.f)) {
    const col = colOf(spec), t = typeOf(spec); let v = row[col];
    if (t === 'j') v = v ? JSON.parse(v) : [];
    else if (t === 'b') v = !!v;
    out[field] = v;
  }
  return out;
}
function dtoToRow(res, dto) {
  const cols = {}, fields = {};
  for (const [field, spec] of Object.entries(res.f)) {
    if (!(field in dto)) continue;
    const col = colOf(spec), t = typeOf(spec); let v = dto[field];
    if (t === 'j') v = JSON.stringify(v || []);
    else if (t === 'b') v = v ? 1 : 0;
    else if (t === 'n') v = v == null || v === '' ? 0 : Number(v);
    cols[col] = v; fields[field] = true;
  }
  return cols;
}

function listAll(res, org) {
  const rows = db.prepare(`SELECT * FROM ${res.table} WHERE org_id = ?`).all(org);
  return rows.map(r => rowToDto(res, r));
}

// ---- helpers --------------------------------------------------------------
function send(out, code, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  out.writeHead(code, { 'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json', ...headers });
  out.end(body);
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', c => { b += c; if (b.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return token ? verifyToken(token) : null;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.png': 'image/png', '.map': 'application/json' };

function audit(org, userId, action, detail) {
  db.prepare('INSERT INTO audit_log (org_id,user_id,action,detail,ts) VALUES (?,?,?,?,?)').run(org, userId, action, detail, nowISO());
}

// ---- dashboard / bootstrap ------------------------------------------------
function metrics(org) {
  const doctors = db.prepare('SELECT COUNT(*) c FROM doctors WHERE org_id=?').get(org).c || 1;
  const visited = db.prepare('SELECT COUNT(DISTINCT target_id) c FROM visits WHERE org_id=? AND type=\'Doctor\'').get(org).c;
  const geoOk = db.prepare('SELECT COUNT(*) c FROM visits WHERE org_id=? AND geo_verified=1').get(org).c;
  const totVisits = db.prepare('SELECT COUNT(*) c FROM visits WHERE org_id=?').get(org).c || 1;
  return {
    doctorCoverage: Math.round(visited / doctors * 100),
    chemistCoverage: 84, distributorCoverage: 91,
    targetAchievement: 73, campaignEffectiveness: 66,
    fieldProductivity: Math.round(geoOk / totVisits * 100),
    secondarySalesGrowth: 12, productGrowth: 9, marketShareGrowth: 5,
    aiAdoption: 58, managementVisibility: 95, revenueGrowth: 14,
  };
}
const SALES_TREND = [
  { m: 'Jan', primary: 42, secondary: 31 }, { m: 'Feb', primary: 48, secondary: 35 },
  { m: 'Mar', primary: 45, secondary: 33 }, { m: 'Apr', primary: 53, secondary: 39 },
  { m: 'May', primary: 58, secondary: 44 }, { m: 'Jun', primary: 61, secondary: 47 },
];

function bootstrap(org) {
  const orgRow = db.prepare('SELECT * FROM orgs WHERE id=?').get(org);
  const divisions = db.prepare('SELECT id,name,head FROM divisions WHERE org_id=?').all(org);
  const employees = db.prepare('SELECT id,name,email,role,division_id as division,reports_to as reportsTo,city,target_doctors as targetDoctors,target_chemists as targetChemists,salary FROM users WHERE org_id=?').all(org);
  const products = db.prepare('SELECT id,name,division_id as division,specialty,price,mrp,gst,retail_margin as retailMargin,stockist_margin as stockistMargin FROM products WHERE org_id=?').all(org);
  const data = { org: orgRow, divisions, employees, products, metrics: metrics(org), salesTrend: SALES_TREND };
  for (const key of Object.keys(R)) data[key] = listAll(R[key], org);
  return data;
}

// ---- RBAC -----------------------------------------------------------------
const canDelete = (role) => ['Admin', 'Business Head'].includes(role);
// Budget / expense approvals are restricted to Admin and the Accounts department only.
const BUDGET_APPROVERS = ['Admin', 'Accounts'];
const canApprove = (role) => BUDGET_APPROVERS.includes(role);

function advanceApproval(ap, role, name) {
  const chain = ['ABM', 'RBM', 'Accounts'];
  const log = ap.log ? JSON.parse(ap.log) : [];
  const stamp = new Date().toISOString().slice(0, 10);
  log.push(`${ap.stage} approved by ${name} — ${stamp}`);
  let stage = ap.stage, status = ap.status;
  const i = chain.indexOf(ap.stage);
  if (i === -1 || i >= chain.length - 1) { status = 'Approved'; stage = 'Done'; }
  else stage = chain[i + 1];
  return { stage, status, log: JSON.stringify(log) };
}

// ---- request router -------------------------------------------------------
async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---- API ----
  if (p.startsWith('/api/')) {
    try { await handleApi(req, res, p, url); }
    catch (e) { console.error(e); send(res, 500, { error: 'Server error' }); }
    return;
  }

  // ---- static ----
  let file = p === '/' ? '/index.html' : decodeURIComponent(p);
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.readFile(full, (err, buf) => {
    if (err) { // SPA fallback
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, idx) => e2 ? send(res, 404, 'Not found') : send(res, 200, idx, { 'Content-Type': 'text/html' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(requestHandler);

async function handleApi(req, res, p, url) {
  const method = req.method;

  const clientIp = req.socket.remoteAddress || 'unknown';

  // --- public: login ---
  if (p === '/api/auth/login' && method === 'POST') {
    if (rateLimited(clientIp)) return send(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' });
    const { email, password, role } = await readBody(req);
    const u = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email || '').trim());
    if (!u || !(await verifyPwAsync(password, u.password_hash))) return send(res, 401, { error: 'Invalid email or password' });
    // role-specific portals: the chosen designation must match the account
    if (role && u.role !== role) return send(res, 403, { error: `This account is registered as ${u.role}. Please use the ${u.role} portal.` });
    const token = signToken({ uid: u.id, org: u.org_id, role: u.role, name: u.name });
    audit(u.org_id, u.id, 'login', u.email);
    return send(res, 200, { token, user: { id: u.id, name: u.name, role: u.role, division: u.division_id, email: u.email } });
  }

  // --- public: signup (self-registration) ---
  if (p === '/api/auth/signup' && method === 'POST') {
    if (rateLimited(clientIp, 6)) return send(res, 429, { error: 'Too many attempts. Please wait a minute and try again.' });
    const { name, email, password, role, division } = await readBody(req);
    const allowed = ['Business Head', 'RBM', 'ABM', 'TSM', 'PMT', 'Accounts'];
    if (!name || !email || !password) return send(res, 400, { error: 'Name, email and password are required' });
    if (String(password).length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' });
    if (!allowed.includes(role)) return send(res, 400, { error: 'Please choose a valid designation' });
    if (!/^\S+@\S+\.\S+$/.test(String(email))) return send(res, 400, { error: 'Please enter a valid email address' });
    const ORG = 'org_amber';
    const exists = db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(String(email).trim());
    if (exists) return send(res, 409, { error: 'An account with that email already exists — please sign in' });
    const div = db.prepare('SELECT 1 FROM divisions WHERE id=? AND org_id=?').get(division, ORG) ? division : 'DIV1';
    const id = uid('U');
    const pwHash = await hashPwAsync(password);
    db.prepare('INSERT INTO users (id,org_id,name,email,password_hash,role,division_id,reports_to,city) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, ORG, String(name).trim(), String(email).trim(), pwHash, role, div, null, '');
    audit(ORG, id, 'signup', String(email).trim());
    const token = signToken({ uid: id, org: ORG, role, name: String(name).trim() });
    return send(res, 201, { token, user: { id, name: String(name).trim(), role, division: div, email: String(email).trim() } });
  }

  // --- everything else requires auth ---
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated' });
  const org = user.org;

  if (p === '/api/me' && method === 'GET') return send(res, 200, { user });
  if (p === '/api/bootstrap' && method === 'GET') return send(res, 200, bootstrap(org));

  // --- change own password ---
  if (p === '/api/auth/change-password' && method === 'POST') {
    const { current, next } = await readBody(req);
    if (!next || String(next).length < 6) return send(res, 400, { error: 'New password must be at least 6 characters' });
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.uid);
    if (!u || !(await verifyPwAsync(current, u.password_hash))) return send(res, 403, { error: 'Current password is incorrect' });
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hashPwAsync(next), user.uid);
    audit(org, user.uid, 'change-password', u.email);
    return send(res, 200, { ok: true });
  }

  // --- audit log (Admin only) ---
  if (p === '/api/audit' && method === 'GET') {
    if (user.role !== 'Admin') return send(res, 403, { error: 'Admin only' });
    const limit = Math.min(200, Number(url.searchParams.get('limit')) || 100);
    const rows = db.prepare(`SELECT a.action, a.detail, a.ts, u.name as user, u.role as role
      FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.org_id=? ORDER BY a.id DESC LIMIT ?`).all(org, limit);
    return send(res, 200, rows);
  }

  // --- approval actions ---
  let m = p.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
  if (m && method === 'POST') {
    if (!canApprove(user.role)) return send(res, 403, { error: 'Only Admin or the Accounts department can approve budget requests' });
    const ap = db.prepare('SELECT * FROM approvals WHERE id=? AND org_id=?').get(m[1], org);
    if (!ap) return send(res, 404, { error: 'Not found' });
    if (m[2] === 'approve') {
      const upd = advanceApproval(ap, user.role, user.name);
      db.prepare('UPDATE approvals SET stage=?,status=?,log=? WHERE id=?').run(upd.stage, upd.status, upd.log, ap.id);
      audit(org, user.uid, 'approve', ap.id);
    } else {
      const log = JSON.parse(ap.log || '[]'); log.push(`Rejected by ${user.name}`);
      db.prepare('UPDATE approvals SET stage=\'Done\',status=\'Rejected\',log=? WHERE id=?').run(JSON.stringify(log), ap.id);
      audit(org, user.uid, 'reject', ap.id);
    }
    const row = db.prepare('SELECT * FROM approvals WHERE id=?').get(ap.id);
    return send(res, 200, rowToDto(R.approvals, row));
  }

  // --- user management (separate: password hashing + email uniqueness) ---
  m = p.match(/^\/api\/users(?:\/([^/]+))?$/);
  if (m) {
    if (method === 'GET' && !m[1]) {
      const rows = db.prepare('SELECT id,name,email,role,division_id as division,reports_to as reportsTo,city,target_doctors as targetDoctors,target_chemists as targetChemists,salary FROM users WHERE org_id=?').all(org);
      return send(res, 200, rows);
    }
    if (method === 'POST') {
      if (user.role !== 'Admin') return send(res, 403, { error: 'Only Admin can add users' });
      const b = await readBody(req);
      if (!b.name || !b.email) return send(res, 400, { error: 'Name and email are required' });
      const exists = db.prepare('SELECT 1 FROM users WHERE lower(email)=lower(?)').get(String(b.email).trim());
      if (exists) return send(res, 409, { error: 'A user with that email already exists' });
      const newId = uid('U');
      db.prepare('INSERT INTO users (id,org_id,name,email,password_hash,role,division_id,reports_to,city) VALUES (?,?,?,?,?,?,?,?,?)').run(
        newId, org, b.name, String(b.email).trim(), await hashPwAsync(b.password || 'amber123'),
        b.role || 'TSM', b.division || null, b.reportsTo || null, b.city || '');
      audit(org, user.uid, 'create:user', newId);
      const row = db.prepare('SELECT id,name,email,role,division_id as division,reports_to as reportsTo,city,target_doctors as targetDoctors,target_chemists as targetChemists,salary FROM users WHERE id=?').get(newId);
      return send(res, 201, row);
    }
    if (method === 'DELETE' && m[1]) {
      if (user.role !== 'Admin') return send(res, 403, { error: 'Only Admin can remove users' });
      if (m[1] === user.uid) return send(res, 400, { error: 'You cannot delete your own account' });
      db.prepare('DELETE FROM users WHERE id=? AND org_id=?').run(m[1], org);
      audit(org, user.uid, 'delete:user', m[1]);
      return send(res, 200, { ok: true });
    }
    // set employee daily visit targets — RBM, Business Head and Admin only
    if (method === 'PATCH' && m[1]) {
      if (!['Admin', 'Business Head', 'RBM'].includes(user.role)) return send(res, 403, { error: 'Only RBM, Business Head or Admin can set employee targets' });
      const b = await readBody(req);
      const sets = [], vals = [];
      if (b.targetDoctors != null) { sets.push('target_doctors=?'); vals.push(Math.max(0, Number(b.targetDoctors) || 0)); }
      if (b.targetChemists != null) { sets.push('target_chemists=?'); vals.push(Math.max(0, Number(b.targetChemists) || 0)); }
      // base salary is HR/payroll data — Admin only
      if (b.salary != null && user.role === 'Admin') { sets.push('salary=?'); vals.push(Math.max(0, Number(b.salary) || 0)); }
      if (sets.length) db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=? AND org_id=?`).run(...vals, m[1], org);
      audit(org, user.uid, 'set-target:user', m[1]);
      const row = db.prepare('SELECT id,name,email,role,division_id as division,reports_to as reportsTo,city,target_doctors as targetDoctors,target_chemists as targetChemists,salary FROM users WHERE id=? AND org_id=?').get(m[1], org);
      return row ? send(res, 200, row) : send(res, 404, { error: 'Not found' });
    }
  }

  // --- generic CRUD: /api/<resource>[/<id>] ---
  m = p.match(/^\/api\/([a-z]+)(?:\/([^/]+))?$/);
  if (m && R[m[1]]) {
    const res2 = R[m[1]], id = m[2];

    // master data (products, divisions) — only Admin may write
    if (ADMIN_RESOURCES.has(m[1]) && method !== 'GET' && user.role !== 'Admin') {
      return send(res, 403, { error: 'Only Admin can manage ' + m[1] });
    }

    if (method === 'GET' && !id) return send(res, 200, listAll(res2, org));
    if (method === 'GET' && id) {
      const row = db.prepare(`SELECT * FROM ${res2.table} WHERE id=? AND org_id=?`).get(id, org);
      return row ? send(res, 200, rowToDto(res2, row)) : send(res, 404, { error: 'Not found' });
    }
    if (method === 'POST') {
      const dto = await readBody(req);
      const cols = dtoToRow(res2, dto);
      const newId = uid(res2.id);
      const keys = ['id', 'org_id', ...Object.keys(cols)];
      const vals = [newId, org, ...Object.values(cols)];
      db.prepare(`INSERT INTO ${res2.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
      audit(org, user.uid, 'create:' + m[1], newId);
      const row = db.prepare(`SELECT * FROM ${res2.table} WHERE id=?`).get(newId);
      return send(res, 201, rowToDto(res2, row));
    }
    if ((method === 'PATCH' || method === 'PUT') && id) {
      // expenses can only be edited / approved by Admin or the Accounts department
      if (m[1] === 'expenses' && !BUDGET_APPROVERS.includes(user.role)) {
        return send(res, 403, { error: 'Only Admin or the Accounts department can edit or approve expenses' });
      }
      const dto = await readBody(req);
      const cols = dtoToRow(res2, dto);
      if (Object.keys(cols).length) {
        const setSql = Object.keys(cols).map(k => `${k}=?`).join(',');
        db.prepare(`UPDATE ${res2.table} SET ${setSql} WHERE id=? AND org_id=?`).run(...Object.values(cols), id, org);
      }
      audit(org, user.uid, 'update:' + m[1], id);
      const row = db.prepare(`SELECT * FROM ${res2.table} WHERE id=? AND org_id=?`).get(id, org);
      return row ? send(res, 200, rowToDto(res2, row)) : send(res, 404, { error: 'Not found' });
    }
    if (method === 'DELETE' && id) {
      if (m[1] === 'expenses' && !BUDGET_APPROVERS.includes(user.role)) return send(res, 403, { error: 'Only Admin or the Accounts department can remove expenses' });
      if (m[1] !== 'expenses' && !canDelete(user.role)) return send(res, 403, { error: 'Your role cannot delete' });
      db.prepare(`DELETE FROM ${res2.table} WHERE id=? AND org_id=?`).run(id, org);
      audit(org, user.uid, 'delete:' + m[1], id);
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Unknown endpoint' });
}

// Only start a listening server when run directly (e.g. `node server/server.js`
// or start.bat). On serverless hosts the handler is imported instead.
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n  Amber LifeSciences — Commercial Operating System`);
    console.log(`  Running at  http://localhost:${PORT}`);
    console.log(`  Login: admin@amber.test / amber123  (or karan@amber.test, priya@amber.test ...)\n`);
  });
}

module.exports = { handler: requestHandler, server };
