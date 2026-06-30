/* ============================================================================
 * Amber LifeSciences — Pharma Commercial Operating System
 * db.js — real persistent SQLite database (multi-tenant schema + seed)
 * Uses Node's built-in node:sqlite — no external dependencies.
 * ==========================================================================*/
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashPw } = require('./auth');

// On serverless hosts (e.g. Vercel) the project files are read-only — only
// /tmp is writable. Locally we keep the persistent ./data folder.
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'amber-data') : path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'amber.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// ---- schema ---------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY, name TEXT, plan TEXT, region TEXT
);
CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, head TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, email TEXT UNIQUE,
  password_hash TEXT, role TEXT, division_id TEXT, reports_to TEXT, city TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, org_id TEXT, division_id TEXT, name TEXT, specialty TEXT, price REAL
);
CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, specialty TEXT, hospital TEXT, city TEXT,
  tier TEXT, potential INTEGER, dob TEXT, anniversary TEXT, phone TEXT, rep_id TEXT,
  last_visit TEXT, linked_chemists TEXT, lat REAL, lng REAL
);
CREATE TABLE IF NOT EXISTS chemists (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, area TEXT, city TEXT, rep_id TEXT,
  monthly_value REAL, last_visit TEXT, lat REAL, lng REAL, tier TEXT, dob TEXT, target REAL
);
CREATE TABLE IF NOT EXISTS distributors (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, city TEXT, rep_id TEXT,
  stock_value REAL, secondary_sales REAL, last_closing TEXT, lat REAL, lng REAL, tier TEXT, dob TEXT, target REAL
);
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY, org_id TEXT, rep_id TEXT, type TEXT, target_id TEXT, date TEXT,
  checkin TEXT, geo_verified INTEGER, products TEXT, summary TEXT, commitment INTEGER,
  follow_up TEXT, sentiment TEXT
);
CREATE TABLE IF NOT EXISTS rcpa (
  id TEXT PRIMARY KEY, org_id TEXT, doctor_id TEXT, chemist_id TEXT, date TEXT,
  our_brand TEXT, our_scripts INTEGER, competitor TEXT, comp_scripts INTEGER, share INTEGER
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, product_id TEXT, specialty TEXT, venue TEXT,
  status TEXT, reach INTEGER, sales REAL, spend REAL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, org_id TEXT, type TEXT, raised_by TEXT, doctor_id TEXT, amount REAL,
  purpose TEXT, stage TEXT, status TEXT, date TEXT, log TEXT
);
CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY, org_id TEXT, doctor_id TEXT, product_id TEXT, qty INTEGER,
  value REAL, purpose TEXT, date TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, org_id TEXT, rep_id TEXT, type TEXT, amount REAL, status TEXT, date TEXT,
  km REAL, mode TEXT
);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY, org_id TEXT, rep_id TEXT, text TEXT, priority TEXT, done INTEGER, reason TEXT
);
CREATE TABLE IF NOT EXISTS stock (
  id TEXT PRIMARY KEY, org_id TEXT, owner_id TEXT, product_id TEXT, batch TEXT,
  quantity INTEGER, mrp REAL, expiry TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, org_id TEXT, party_id TEXT, source TEXT, product_id TEXT,
  quantity INTEGER, amount REAL, date TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS recon (
  id TEXT PRIMARY KEY, org_id TEXT, distributor_id TEXT, product_id TEXT,
  opening REAL, primary_qty REAL, secondary REAL, returns REAL
);
CREATE TABLE IF NOT EXISTS leaves (
  id TEXT PRIMARY KEY, org_id TEXT, rep_id TEXT, type TEXT, fromDate TEXT, toDate TEXT,
  days REAL, reason TEXT, status TEXT
);
CREATE TABLE IF NOT EXISTS edetail (
  id TEXT PRIMARY KEY, org_id TEXT, name TEXT, product_id TEXT, specialty TEXT,
  slides INTEGER, views INTEGER, engagement INTEGER, status TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, org_id TEXT, user_id TEXT, action TEXT, detail TEXT, ts TEXT
);
`);

// ---- migrations: add lat/lng to existing DBs (idempotent) ----------------
for (const t of ['doctors', 'chemists', 'distributors']) {
  for (const c of ['lat', 'lng']) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} REAL`); } catch (e) { /* already exists */ }
  }
}
// ---- migration: tier on chemists/distributors (idempotent + backfill) -----
for (const t of ['chemists', 'distributors']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN tier TEXT`); } catch (e) { /* already exists */ }
}
const TIER_BACKFILL = { C1: 'Gold', C2: 'Platinum', C3: 'Silver', DS1: 'Platinum', DS2: 'Gold' };
for (const [id, tier] of Object.entries(TIER_BACKFILL)) {
  db.prepare(`UPDATE chemists SET tier=? WHERE id=? AND (tier IS NULL OR tier='')`).run(tier, id);
  db.prepare(`UPDATE distributors SET tier=? WHERE id=? AND (tier IS NULL OR tier='')`).run(tier, id);
}
db.exec(`UPDATE chemists SET tier='Silver' WHERE tier IS NULL OR tier=''`);
db.exec(`UPDATE distributors SET tier='Silver' WHERE tier IS NULL OR tier=''`);
// ---- migration: dob on chemists/distributors (idempotent + backfill) ------
for (const t of ['chemists', 'distributors']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN dob TEXT`); } catch (e) { /* already exists */ }
}
const DOB_BACKFILL = { C1: ['chemists', '1979-07-02'], C2: ['chemists', '1985-06-25'], C3: ['chemists', '1982-11-10'], DS1: ['distributors', '1975-06-30'], DS2: ['distributors', '1980-09-05'] };
for (const [id, [tbl, dob]] of Object.entries(DOB_BACKFILL)) {
  db.prepare(`UPDATE ${tbl} SET dob=? WHERE id=? AND (dob IS NULL OR dob='')`).run(dob, id);
}
// ---- migration: km / mode on expenses (idempotent) ------------------------
try { db.exec(`ALTER TABLE expenses ADD COLUMN km REAL`); } catch (e) { /* exists */ }
try { db.exec(`ALTER TABLE expenses ADD COLUMN mode TEXT`); } catch (e) { /* exists */ }
// ---- migration: visit-proof photo (base64 data URL) -----------------------
try { db.exec(`ALTER TABLE visits ADD COLUMN photo TEXT`); } catch (e) { /* exists */ }
// ---- migration: distribution pricing fields on products -------------------
try { db.exec(`ALTER TABLE products ADD COLUMN mrp REAL`); } catch (e) {}
try { db.exec(`ALTER TABLE products ADD COLUMN gst REAL DEFAULT 0.12`); } catch (e) {}
try { db.exec(`ALTER TABLE products ADD COLUMN retail_margin REAL DEFAULT 0.20`); } catch (e) {}
try { db.exec(`ALTER TABLE products ADD COLUMN stockist_margin REAL DEFAULT 0.10`); } catch (e) {}
db.exec(`UPDATE products SET mrp=price WHERE mrp IS NULL`);
db.exec(`UPDATE products SET gst=0.05 WHERE id='P3'`); // life-saving (5% GST) example
// ---- migration: distributor lead time (days) for ROP ----------------------
try { db.exec(`ALTER TABLE distributors ADD COLUMN lead_time_days INTEGER DEFAULT 5`); } catch (e) {}
db.prepare(`UPDATE distributors SET lead_time_days=7 WHERE id='DS2' AND (lead_time_days IS NULL OR lead_time_days=5)`).run();

// ---- performance indexes (idempotent) -------------------------------------
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_doctors_org ON doctors(org_id);
  CREATE INDEX IF NOT EXISTS idx_chemists_org ON chemists(org_id);
  CREATE INDEX IF NOT EXISTS idx_distributors_org ON distributors(org_id);
  CREATE INDEX IF NOT EXISTS idx_visits_org ON visits(org_id);
  CREATE INDEX IF NOT EXISTS idx_visits_rep ON visits(rep_id);
  CREATE INDEX IF NOT EXISTS idx_visits_target ON visits(target_id);
  CREATE INDEX IF NOT EXISTS idx_rcpa_org ON rcpa(org_id);
  CREATE INDEX IF NOT EXISTS idx_stock_org ON stock(org_id);
  CREATE INDEX IF NOT EXISTS idx_stock_owner ON stock(owner_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(org_id);
  CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id);
`);
// ---- migration: trade target on chemists/distributors (idempotent) --------
for (const t of ['chemists', 'distributors']) {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN target REAL`); } catch (e) { /* exists */ }
}
const TARGET_BACKFILL = { C1: ['chemists', 200000], C2: ['chemists', 220000], C3: ['chemists', 150000], DS1: ['distributors', 900000], DS2: ['distributors', 700000] };
for (const [id, [tbl, tgt]] of Object.entries(TARGET_BACKFILL)) {
  db.prepare(`UPDATE ${tbl} SET target=? WHERE id=? AND (target IS NULL OR target=0)`).run(tgt, id);
}
// ---- migration: per-employee daily visit targets (default 10 doctors + 5 chemists) ----
try { db.exec(`ALTER TABLE users ADD COLUMN target_doctors INTEGER DEFAULT 10`); } catch (e) { /* exists */ }
try { db.exec(`ALTER TABLE users ADD COLUMN target_chemists INTEGER DEFAULT 5`); } catch (e) { /* exists */ }
// ---- migration: editable base monthly salary (admin) ----------------------
try { db.exec(`ALTER TABLE users ADD COLUMN salary REAL`); } catch (e) { /* exists */ }

// ---- seed (runs once) -----------------------------------------------------
function seed() {
  const already = db.prepare('SELECT COUNT(*) c FROM orgs').get();
  if (already.c > 0) return;
  const ORG = 'org_amber';
  const pw = hashPw('amber123'); // default password for every seeded user

  const tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } };

  tx(() => {
    db.prepare('INSERT INTO orgs VALUES (?,?,?,?)').run(ORG, 'Amber LifeSciences', 'Enterprise', 'Mumbai (India)');

    [['DIV1', 'Cardiac Care', 'Dr. R. Mehta'], ['DIV2', 'Diabetic & Endo', 'S. Krishnan'],
     ['DIV3', 'Gastro', 'A. Banerjee'], ['DIV4', 'Ortho & Pain', 'P. Nair']]
      .forEach(d => db.prepare('INSERT INTO divisions VALUES (?,?,?,?)').run(d[0], ORG, d[1], d[2]));

    const users = [
      ['E1', 'Vikram Rao', 'vikram@amber.test', 'Business Head', 'DIV1', null, 'Mumbai'],
      ['E2', 'Anita Desai', 'anita@amber.test', 'RBM', 'DIV1', 'E1', 'West Region'],
      ['E3', 'Rohit Sharma', 'rohit@amber.test', 'ABM', 'DIV1', 'E2', 'Mumbai'],
      ['E4', 'Priya Iyer', 'priya@amber.test', 'TSM', 'DIV1', 'E3', 'Andheri'],
      ['E5', 'Karan Singh', 'karan@amber.test', 'TSM', 'DIV1', 'E3', 'Bandra'],
      ['E6', 'Meera Joshi', 'meera@amber.test', 'PMT', 'DIV1', 'E1', 'HO'],
      ['E7', 'Sanjay Gupta', 'sanjay@amber.test', 'Accounts', 'DIV1', 'E1', 'HO'],
      ['E0', 'Admin', 'admin@amber.test', 'Admin', 'DIV1', null, 'HO'],
    ];
    users.forEach(u => db.prepare('INSERT INTO users (id,org_id,name,email,password_hash,role,division_id,reports_to,city) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(u[0], ORG, u[1], u[2], pw, u[3], u[4], u[5], u[6]));

    [['P1', 'DIV1', 'Cardamol XR 50', 'Cardiologist', 145], ['P2', 'DIV1', 'Beta-Stat 25', 'Cardiologist', 98],
     ['P3', 'DIV2', 'GlucoNorm M', 'Diabetologist', 210], ['P4', 'DIV3', 'Pantowell 40', 'Gastroenterologist', 76],
     ['P5', 'DIV4', 'OrthoFlex Gel', 'Orthopedist', 132]]
      .forEach(p => db.prepare('INSERT INTO products (id,org_id,division_id,name,specialty,price) VALUES (?,?,?,?,?,?)').run(p[0], ORG, p[1], p[2], p[3], p[4]));

    // lat/lng are real Mumbai coordinates for each location
    const docs = [
      ['D1', 'Dr. Suresh Menon', 'Cardiologist', 'Lilavati Hospital', 'Bandra', 'Platinum', 92, '1968-04-12', '1995-11-20', '98200xxxxx', 'E5', '2026-06-14', '["C1","C2"]', 19.0509, 72.8295],
      ['D2', 'Dr. Kavita Rao', 'Cardiologist', 'Hinduja Clinic', 'Andheri', 'Gold', 74, '1975-09-30', '2002-02-14', '98201xxxxx', 'E4', '2026-06-12', '["C3"]', 19.1136, 72.8697],
      ['D3', 'Dr. Imran Shaikh', 'Diabetologist', 'Holy Family', 'Bandra', 'Gold', 68, '1980-01-22', '2010-06-18', '98202xxxxx', 'E5', '2026-06-10', '["C2"]', 19.0606, 72.8365],
      ['D4', 'Dr. Neha Kulkarni', 'Gastroenterologist', 'Kokilaben', 'Andheri', 'Silver', 45, '1985-07-08', '2014-12-05', '98203xxxxx', 'E4', '2026-06-05', '["C3"]', 19.1305, 72.8255],
      ['D5', 'Dr. Arjun Pillai', 'Orthopedist', 'Nanavati Max', 'Vile Parle', 'Platinum', 88, '1970-03-15', '1998-04-22', '98204xxxxx', 'E5', '2026-06-15', '["C1"]', 19.0995, 72.8413],
      ['D6', 'Dr. Fatima Khan', 'Cardiologist', 'Asian Heart', 'Bandra', 'Silver', 51, '1982-11-03', '2009-01-30', '98205xxxxx', 'E4', '2026-05-28', '["C2"]', 19.0662, 72.8676],
    ];
    docs.forEach(d => db.prepare('INSERT INTO doctors VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(d[0], ORG, d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], d[13], d[14]));

    [['C1', 'Wellness Forever', 'Bandra West', 'Bandra', 'E5', 185000, '2026-06-13', 19.0560, 72.8290, 'Gold', '1979-07-02', 200000],
     ['C2', 'Apollo Pharmacy', 'Linking Rd', 'Bandra', 'E5', 240000, '2026-06-13', 19.0640, 72.8330, 'Platinum', '1985-06-25', 220000],
     ['C3', 'MedPlus', 'Andheri East', 'Andheri', 'E4', 132000, '2026-06-11', 19.1150, 72.8700, 'Silver', '1982-11-10', 150000]]
      .forEach(c => db.prepare('INSERT INTO chemists (id,org_id,name,area,city,rep_id,monthly_value,last_visit,lat,lng,tier,dob,target) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(c[0], ORG, c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11]));

    [['DS1', 'Mumbai Pharma Distributors', 'Mumbai', 'E3', 1250000, 980000, '2026-06-09', 19.0130, 72.8300, 'Platinum', '1975-06-30', 900000],
     ['DS2', 'Konkan Medi Supply', 'Thane', 'E3', 720000, 540000, '2026-06-08', 19.1972, 72.9722, 'Gold', '1980-09-05', 700000]]
      .forEach(d => db.prepare('INSERT INTO distributors (id,org_id,name,city,rep_id,stock_value,secondary_sales,last_closing,lat,lng,tier,dob,target) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(d[0], ORG, d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11]));

    const visits = [
      ['V1', 'E5', 'Doctor', 'D1', '2026-06-14', '10:24', 1, '["P1","P2"]', 'Discussed Cardamol XR titration data. Committed ~40 units/month. Follow-up on sample efficacy.', 40, '2026-06-28', 'Positive'],
      ['V2', 'E5', 'Doctor', 'D5', '2026-06-15', '11:40', 1, '["P5"]', 'OrthoFlex gel feedback positive. Requested patient education leaflets.', 25, '2026-06-30', 'Positive'],
      ['V3', 'E4', 'Doctor', 'D2', '2026-06-12', '09:55', 1, '["P1"]', 'Comparing Beta-Stat vs competitor. Needs comparative pricing sheet.', 15, '2026-06-26', 'Neutral'],
      ['V4', 'E5', 'Chemist', 'C2', '2026-06-13', '15:10', 1, '["P1","P2"]', 'Stock replenishment order placed. Promo scheme explained.', 0, '2026-06-20', 'Positive'],
      ['V5', 'E4', 'Doctor', 'D4', '2026-06-05', '12:30', 0, '["P4"]', 'Mock-location flagged — visit pending re-verification.', 10, '2026-06-19', 'Neutral'],
    ];
    visits.forEach(v => db.prepare('INSERT INTO visits (id,org_id,rep_id,type,target_id,date,checkin,geo_verified,products,summary,commitment,follow_up,sentiment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(v[0], ORG, v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11]));

    [['R1', 'D1', 'C2', '2026-06-10', 'Cardamol XR 50', 38, 'Cardiotone', 22, 63],
     ['R2', 'D2', 'C3', '2026-06-09', 'Beta-Stat 25', 14, 'BetaMax', 26, 35],
     ['R3', 'D5', 'C1', '2026-06-11', 'OrthoFlex Gel', 29, 'FlexPro', 12, 71]]
      .forEach(r => db.prepare('INSERT INTO rcpa VALUES (?,?,?,?,?,?,?,?,?,?)').run(r[0], ORG, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]));

    [['CM1', 'Cardamol XR Launch Q2', 'P1', 'Cardiologist', 'Clinics + CME', 'Active', 142, 680000, 120000],
     ['CM2', 'Diabetes Awareness CME', 'P3', 'Diabetologist', 'Hospitals', 'Active', 88, 410000, 90000],
     ['CM3', 'Ortho Patient Education', 'P5', 'Orthopedist', 'Nursing Homes', 'Planned', 0, 0, 45000]]
      .forEach(c => db.prepare('INSERT INTO campaigns VALUES (?,?,?,?,?,?,?,?,?,?)').run(c[0], ORG, c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8]));

    [['AP1', 'CME Sponsorship', 'E3', 'D1', 35000, 'Cardiology CME — fair market value engagement', 'RBM', 'Pending', '2026-06-14', '["ABM raised — 14 Jun"]'],
     ['AP2', 'Sample Approval', 'E3', 'D5', 8000, 'OrthoFlex physician samples (50 units)', 'Accounts', 'Pending', '2026-06-13', '["ABM raised — 13 Jun","RBM approved — 14 Jun"]'],
     ['AP3', 'Expense Claim', 'E5', null, 4200, 'Field travel + lodging (Bandra circuit)', 'Done', 'Approved', '2026-06-10', '["ABM raised — 10 Jun","RBM approved — 11 Jun","Accounts approved — 12 Jun"]']]
      .forEach(a => db.prepare('INSERT INTO approvals VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(a[0], ORG, a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9]));

    [['S1', 'D1', 'P1', 30, 4350, 'Efficacy trial', '2026-06-14'],
     ['S2', 'D5', 'P5', 50, 6600, 'Patient starter packs', '2026-06-15']]
      .forEach(s => db.prepare('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?)').run(s[0], ORG, s[1], s[2], s[3], s[4], s[5], s[6]));

    [['EX1', 'E5', 'Travel (Bike)', 128, 'Approved', '2026-06-10', 32, 'Bike'],
     ['EX2', 'E4', 'Food & Lodging', 2800, 'Pending', '2026-06-14', null, null],
     ['EX3', 'E5', 'Doctor Engagement', 35000, 'Pending', '2026-06-14', null, null]]
      .forEach(e => db.prepare('INSERT INTO expenses (id,org_id,rep_id,type,amount,status,date,km,mode) VALUES (?,?,?,?,?,?,?,?,?)').run(e[0], ORG, e[1], e[2], e[3], e[4], e[5], e[6], e[7]));

    [['T1', 'E5', 'Visit Dr. Suresh Menon (Platinum) — share titration study', 'High', 0, 'RCPA share 63% — push Cardamol XR'],
     ['T2', 'E5', 'RCPA at Apollo Pharmacy for Dr. Imran Shaikh', 'High', 0, 'No RCPA in 30 days'],
     ['T3', 'E5', 'Chemist follow-up: Wellness Forever stock', 'Medium', 0, 'Order due in 2 days'],
     ['T4', 'E4', 'Re-verify Dr. Neha Kulkarni visit (mock-location flagged)', 'High', 0, 'Compliance flag'],
     ['T5', 'E4', 'Send comparative pricing to Dr. Kavita Rao', 'Medium', 0, 'Committed in last visit'],
     ['T6', 'E5', 'Anniversary campaign: Dr. Arjun Pillai (22 Apr)', 'Low', 1, 'Celebration trigger']]
      .forEach(t => db.prepare('INSERT INTO todos VALUES (?,?,?,?,?,?,?)').run(t[0], ORG, t[1], t[2], t[3], t[4], t[5]));
  });
  console.log('[db] seeded initial Amber dataset');
}
seed();

// ---- stock seed (runs once, independent so existing DBs get stock too) ----
function seedStock() {
  const org = db.prepare('SELECT id FROM orgs LIMIT 1').get();
  if (!org) return;
  if (db.prepare('SELECT COUNT(*) c FROM stock').get().c > 0) return;
  const ORG = org.id;
  // owner, product, batch, qty, mrp, expiry — mix of OK / expiring-soon / expired
  const rows = [
    ['C1', 'P1', 'CX2401', 120, 145, '2026-08-31'],
    ['C1', 'P2', 'BS2312', 60, 98, '2027-03-31'],
    ['C2', 'P1', 'CX2312', 200, 145, '2026-06-30'],
    ['C2', 'P4', 'PW2402', 80, 76, '2025-12-31'],
    ['C3', 'P3', 'GN2401', 45, 210, '2027-01-31'],
    ['DS1', 'P1', 'CX2403', 1500, 145, '2026-08-15'],
    ['DS1', 'P5', 'OF2312', 300, 132, '2026-07-15'],
    ['DS2', 'P3', 'GN2311', 220, 210, '2025-11-30'],
    ['DS2', 'P2', 'BS2402', 500, 98, '2027-06-30'],
  ];
  for (const r of rows) {
    db.prepare('INSERT INTO stock VALUES (?,?,?,?,?,?,?,?)')
      .run('STK' + r[2] + r[0], ORG, r[0], r[1], r[2], r[3], r[4], r[5]);
  }
  console.log('[db] seeded stock / expiry data');
}
seedStock();

// ---- orders seed (runs once, independent) ---------------------------------
function seedOrders() {
  const org = db.prepare('SELECT id FROM orgs LIMIT 1').get();
  if (!org) return;
  if (db.prepare('SELECT COUNT(*) c FROM orders').get().c > 0) return;
  const ORG = org.id;
  // party, source, product, qty, amount, date, status
  const rows = [
    ['C2', 'Secondary', 'P1', 120, 17400, '2026-06-12', 'Delivered'],
    ['C1', 'Secondary', 'P2', 80, 7840, '2026-06-11', 'Delivered'],
    ['C3', 'Secondary', 'P3', 40, 8400, '2026-06-10', 'Delivered'],
    ['DS1', 'Primary', 'P1', 1000, 145000, '2026-06-09', 'Closed'],
    ['DS2', 'Primary', 'P3', 300, 63000, '2026-06-08', 'Open'],
  ];
  for (const r of rows) {
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?)')
      .run('O' + r[0] + r[2] + r[5].slice(8), ORG, r[0], r[1], r[2], r[3], r[4], r[5], r[6]);
  }
  console.log('[db] seeded orders');
}
seedOrders();

// ---- channel reconciliation seed (distributor × SKU) ----------------------
function seedRecon() {
  const org = db.prepare('SELECT id FROM orgs LIMIT 1').get();
  if (!org) return;
  if (db.prepare('SELECT COUNT(*) c FROM recon').get().c > 0) return;
  const ORG = org.id;
  // distributor, product, opening, primary, secondary, returns  (designed to span every stock status)
  const rows = [
    ['DS1', 'P1', 5000, 2000, 3000, 100], // Healthy / OK
    ['DS1', 'P2', 3000, 500, 2400, 50],   // Low + below safety → URGENT
    ['DS2', 'P3', 8000, 1000, 2000, 0],   // Overstock → Block
    ['DS2', 'P4', 1600, 0, 1600, 0],      // Stockout (closing = 0 with prior secondary)
    ['DS1', 'P5', 2000, 0, 0, 0],         // No offtake / dead stock
    ['DS2', 'P1', 2000, 3000, 3000, 0],   // at ROP → Order now, suggest 4000 (spec scenario)
    ['DS1', 'P3', 500, 200, 1800, 600],   // negative → Check Data
  ];
  for (const r of rows) db.prepare('INSERT INTO recon VALUES (?,?,?,?,?,?,?,?)')
    .run('RC' + r[0] + r[1], ORG, r[0], r[1], r[2], r[3], r[4], r[5]);
  console.log('[db] seeded channel reconciliation');
}
seedRecon();

// ---- HR (leave) + E-Detailing seed ----------------------------------------
function seedHrEdetail() {
  const org = db.prepare('SELECT id FROM orgs LIMIT 1').get();
  if (!org) return;
  const ORG = org.id;
  if (db.prepare('SELECT COUNT(*) c FROM leaves').get().c === 0) {
    [['E4', 'Casual Leave', '2026-06-22', '2026-06-23', 2, 'Family function', 'Pending'],
     ['E5', 'Sick Leave', '2026-06-16', '2026-06-16', 1, 'Fever', 'Approved'],
     ['E3', 'Privilege Leave', '2026-07-01', '2026-07-03', 3, 'Vacation', 'Pending']]
      .forEach(l => db.prepare('INSERT INTO leaves VALUES (?,?,?,?,?,?,?,?,?)').run('LV' + l[0] + l[2].slice(5), ORG, l[0], l[1], l[2], l[3], l[4], l[5], l[6]));
    console.log('[db] seeded leaves');
  }
  if (db.prepare('SELECT COUNT(*) c FROM edetail').get().c === 0) {
    [['Cardamol XR — Titration Story', 'P1', 'Cardiologist', 12, 142, 78, 'Active'],
     ['GlucoNorm M — HbA1c Control', 'P3', 'Diabetologist', 9, 88, 64, 'Active'],
     ['OrthoFlex — Patient Education', 'P5', 'Orthopedist', 7, 51, 71, 'Active'],
     ['Pantowell — Acidity Pathway', 'P4', 'Gastroenterologist', 8, 0, 0, 'Draft']]
      .forEach(e => db.prepare('INSERT INTO edetail VALUES (?,?,?,?,?,?,?,?,?)').run('ED' + e[1] + e[3], ORG, e[0], e[1], e[2], e[3], e[4], e[5], e[6]));
    console.log('[db] seeded e-detailing decks');
  }
}
seedHrEdetail();

module.exports = { db };
