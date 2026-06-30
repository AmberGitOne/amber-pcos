/* ============================================================================
 * api/index.js — Vercel serverless entry.
 * Reuses the same request handler that powers the local Node server, so the
 * full /api/* backend (login, bootstrap, CRUD) runs on Vercel unchanged.
 * vercel.json routes every /api/* request here.
 * ==========================================================================*/
'use strict';
const { handler } = require('../server/server.js');

module.exports = (req, res) => handler(req, res);
