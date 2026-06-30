# Amber LifeSciences — Pharma Commercial Operating System

A **real, full-stack web application** implementing the core of the Amber LifeSciences
commercial platform from the specification documents: Sales Force Automation, CRM,
RCPA, Closed-Loop Marketing, GPS field tracking, approval workflows, accounts, and an
AI Sales Copilot — with a real server, a real database, real login, and role-based
access control.

This is **not** a browser-only demo. Data is stored in a real SQLite database on disk,
persists across restarts, is shared by all users, and every change goes through an
authenticated REST API.

---

## How to run it

1. **Double-click `start.bat`.**
   It launches the server and opens the app at <http://localhost:4321>.
2. **Pick your designation portal**, then sign in (all demo passwords `amber123`):

   | Portal | Demo account |
   |--------|--------------|
   | Business Head | `vikram@amber.test` |
   | RBM | `anita@amber.test` |
   | ABM | `rohit@amber.test` |
   | TSM (field officer) | `karan@amber.test`, `priya@amber.test` |
   | PMT / Marketing | `meera@amber.test` |
   | Accounts | `sanjay@amber.test` |
   | Admin | `admin@amber.test` (full access) |

   Each portal is **designation-specific** — signing in with an account whose role
   doesn't match the chosen portal is rejected (e.g. an Admin account can't sign in
   through the TSM portal).
3. **New users:** click **Create an account** on the landing page to self-register
   (name, work email, password, designation, division). The account is created with a
   scrypt-hashed password and signs in immediately. Admin accounts cannot be
   self-registered — they're provisioned by an existing Admin under *Team*.

To stop the server, close its window (or press a key in it).

> Requires Node.js 22+ (already installed on this machine). The server uses **only
> Node's built-in modules** — no `npm install`, no external dependencies.

---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web UI | HTML + CSS + vanilla JS (SPA) | `public/` — served by the backend |
| API | Node.js `http` server | `server/server.js` — REST, JSON |
| Database | SQLite via built-in `node:sqlite` | `server/data/amber.db` (persistent, WAL) |
| Auth | JWT (HMAC-SHA256) + scrypt password hashing | `server/auth.js`, Node `crypto` |
| Access control | Role-based (BH → RBM → ABM → TSM, PMT, Accounts, Admin) | enforced server-side |
| Multi-tenant | every row scoped to `org_id` | resale-ready data model |
| Audit | `audit_log` table records every action | login, create, update, approve, delete |

```
crm/
├─ start.bat              ← double-click to run
├─ package.json          (npm start → node server/server.js)
├─ server/
│  ├─ server.js          HTTP + REST API + static host + RBAC
│  ├─ db.js              SQLite schema + seed (spec data model)
│  ├─ auth.js            scrypt hashing + JWT
│  └─ data/amber.db      the live database (created on first run)
└─ public/               the web app (index.html + assets/)
```

## API (all under `/api`, JWT-protected except login)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/login` | email + password → JWT |
| GET | `/bootstrap` | all org data + computed dashboard metrics |
| GET/POST/PATCH/DELETE | `/doctors`,`/chemists`,`/distributors`,`/visits`,`/rcpa`,`/campaigns`,`/approvals`,`/samples`,`/expenses`,`/todos` | full CRUD |
| POST | `/approvals/:id/approve` · `/reject` | advances ABM → RBM → Accounts, audit-logged |

## Modules (mapped to the spec)

Executive Dashboard · Daily Planner (AI) · AI Sales Copilot · Doctor Profiling &
compliant tiering · Chemists · Distributors · Visits & SFA (geofenced check-in +
dictated-summary AI extraction) · RCPA Engine · GPS & Field Tracking · PMT/CLM
Campaigns · Approval Workflow · Samples/Spend/Accounts · Team & Hierarchy · Tenant
Settings.

### Everything is interactive

Every data module supports full **Add / View / Edit / Delete** through real forms that
validate and persist to the database:

- **Doctors, Chemists, Distributors, Visits, RCPA, Campaigns, Samples, Expenses,
  Tasks** — create, edit and delete with proper dropdowns (reps, doctors, products…).
- **Doctors & Visits** have live search; doctors also filter by tier.
- **Approvals** — raise a new request and advance it ABM → RBM → Accounts (or reject),
  fully audit-logged.
- **Expenses** — approve/reject pending claims inline.
- **Team** (Admin only) — add a team member with a real login (they can sign in
  immediately) or remove one.
- **Planner** — tick off, add, edit or delete AI-suggested tasks.
- **AI Copilot** — ask about priorities, market-share gaps, visit summaries, or a
  compliant CME draft (answers computed from your live data).

### GPS & Field Tracking — real maps + live location

- An **interactive map** plots every doctor, chemist and distributor at its **real
  latitude/longitude** (Mumbai), with **200 m geofence** circles and the rep's visit
  route drawn as a polyline.
- **"Use my location"** reads your device's **real GPS** (browser Geolocation), drops a
  live marker, finds the nearest location, and tells you whether you're **inside the
  geofence** (a check-in there would be verified) — with true haversine distance.
- **"Live tracking"** follows your position continuously as you move.
- **Map provider:** works out-of-the-box with **OpenStreetMap** (free, no key). To use
  **Google Maps**, open *Settings → Maps Provider* and paste a Google Maps JavaScript
  API key (from Google Cloud Console; Google requires a key + billing account). The key
  is stored only in your browser; the app reloads and switches provider automatically.
- Map tiles need an internet connection; if offline, the page degrades gracefully and
  the live-location buttons still work.

---

## Resetting the data

To return to the original seeded dataset, stop the server, delete
`server/data/amber.db` (and the `-wal`/`-shm` files), and start again — it re-seeds
automatically. Keep `server/data/.secret` (it signs login tokens).

## Going to production (next steps from here)

The system is written to scale up along the spec's roadmap:
- **Public URL:** deploy `server/` to any Node host (Render, Railway, a VPS) and point
  a domain at it. The same code runs unchanged.
- **PostgreSQL + PostGIS:** swap the `node:sqlite` calls in `db.js`/`server.js` for a
  Postgres driver when you need concurrency at scale and real geo queries. The schema
  is already relational and tenant-scoped.
- **Live AI:** the AI Copilot currently uses deterministic logic over your real data.
  Wire `server` to the Claude API (Haiku for summaries, Sonnet for to-do/route, Opus
  for strategy) per the spec; add a speech-to-text provider for voice summaries.
- **Mobile app:** build the offline-first field app (React Native/Flutter) against this
  same REST API.
