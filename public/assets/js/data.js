/* ============================================================================
 * Amber LifeSciences — Pharma Commercial Operating System
 * data.js — API client. Talks to the real backend; caches org data in memory.
 * Keeps a synchronous get() for rendering; all mutations persist via the API.
 * ==========================================================================*/
const AmberData = (() => {
  let token = sessionStorage.getItem('amber_token') || null;
  let user = JSON.parse(sessionStorage.getItem('amber_user') || 'null');
  let state = null; // populated by bootstrap()

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) { logoutLocal(); throw new Error('Session expired — please sign in again'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  function logoutLocal() {
    token = null; user = null; state = null;
    sessionStorage.removeItem('amber_token');
    sessionStorage.removeItem('amber_user');
  }

  // ---- collection helpers (operate on cached state + persist) -------------
  function coll(name) { return (state && state[name]) || []; }

  return {
    isAuthed: () => !!token,
    user: () => user,
    get: () => state,

    async login(email, password, role) {
      const r = await api('/auth/login', { method: 'POST', body: { email, password, role } });
      token = r.token; user = r.user;
      sessionStorage.setItem('amber_token', token);
      sessionStorage.setItem('amber_user', JSON.stringify(user));
      await this.bootstrap();
      return user;
    },

    async signup(dto) {
      const r = await api('/auth/signup', { method: 'POST', body: dto });
      token = r.token; user = r.user;
      sessionStorage.setItem('amber_token', token);
      sessionStorage.setItem('amber_user', JSON.stringify(user));
      await this.bootstrap();
      return user;
    },

    logout() { logoutLocal(); },

    async bootstrap() {
      state = await api('/bootstrap');
      return state;
    },

    // create -> returns new dto, appends to cache
    async create(resource, dto) {
      const row = await api('/' + resource, { method: 'POST', body: dto });
      coll(resource).push(row);
      return row;
    },
    // patch -> updates cache in place
    async update(resource, id, patch) {
      const row = await api('/' + resource + '/' + id, { method: 'PATCH', body: patch });
      const arr = coll(resource); const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr[i] = row;
      return row;
    },
    async remove(resource, id) {
      await api('/' + resource + '/' + id, { method: 'DELETE' });
      const arr = coll(resource); const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr.splice(i, 1);
    },
    async approval(id, action) {
      const row = await api('/approvals/' + id + '/' + action, { method: 'POST' });
      const arr = coll('approvals'); const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr[i] = row;
      return row;
    },

    // users live in state.employees (separate endpoint: password + email checks)
    async createUser(dto) {
      const row = await api('/users', { method: 'POST', body: dto });
      (state.employees || (state.employees = [])).push(row);
      return row;
    },
    async removeUser(id) {
      await api('/users/' + id, { method: 'DELETE' });
      const a = state.employees; const i = a.findIndex(x => x.id === id);
      if (i >= 0) a.splice(i, 1);
    },
    async updateEmpTarget(id, patch) {
      const row = await api('/users/' + id, { method: 'PATCH', body: patch });
      const a = state.employees; const i = a.findIndex(x => x.id === id);
      if (i >= 0) a[i] = row;
      return row;
    },
    changePassword(current, next) { return api('/auth/change-password', { method: 'POST', body: { current, next } }); },
    getAudit(limit = 100) { return api('/audit?limit=' + limit); },

    // ---- lookups ----
    empName: (id) => ((state.employees || []).find(e => e.id === id) || {}).name || id,
    docName: (id) => ((state.doctors || []).find(d => d.id === id) || {}).name || id,
    chemName: (id) => ((state.chemists || []).find(c => c.id === id) || {}).name || id,
    prodName: (id) => ((state.products || []).find(p => p.id === id) || {}).name || id,
    divName: (id) => ((state.divisions || []).find(d => d.id === id) || {}).name || id,
  };
})();
