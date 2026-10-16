import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { publicCatalog } from './catalog.js';
import { validateSpec, garmentReference, jobKey } from './spec.js';
import { inspectImage, MAX_BYTES } from './image.js';
import { RETENTION } from './store.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const URL_TTL_MS = 5 * 60_000;
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'expired']);

export function createApp({ store, provider, publicDir, spendLimit = 3, secret = randomBytes(32) }) {
  const sign = (path, exp) => createHmac('sha256', secret).update(`${path}|${exp}`).digest('base64url');
  const signedUrl = (path) => { const exp = Date.now() + URL_TTL_MS; return `${path}?exp=${exp}&sig=${sign(path, exp)}`; };
  const checkSig = (path, q) => {
    const exp = Number(q.get('exp')); const sig = q.get('sig') ?? '';
    if (!exp || exp < Date.now()) return false;
    const want = Buffer.from(sign(path, exp)); const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  };

  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too_large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
  });
  const json = async (req) => { try { return JSON.parse((await readBody(req, 64 * 1024)).toString('utf8')); } catch (e) { if (e.code === 413) throw e; return null; } };

  function ownerOf(req, res) {
    const m = /(?:^|;\s*)nyoni_sid=([a-f0-9-]{36})/.exec(req.headers.cookie ?? '');
    if (m) return m[1];
    const sid = randomUUID();
    res.setHeader('set-cookie', `nyoni_sid=${sid}; HttpOnly; SameSite=Strict; Path=/`);
    return sid;
  }

  const jobView = (j) => ({
    id: j.id, status: j.status, reason: j.reason ?? null, key: j.key, garment: j.garment, uploadId: j.uploadId,
    createdAt: j.createdAt, updatedAt: j.updatedAt,
    resultUrl: j.status === 'succeeded' ? signedUrl(`/api/jobs/${j.id}/result`) : null,
  });

  async function runJob(job) {
    const ctrl = new AbortController(); job.abort = ctrl;
    job.status = 'processing'; job.updatedAt = Date.now();
    let outcome;
    try {
      const upload = store.uploads.get(job.uploadId);
      if (!upload) outcome = { status: 'failed', reason: 'photo_removed' };
      else outcome = await provider.submit({ jobId: job.id, personImage: await store.readBlob(upload.id), garmentReference: job.garment, settings: job.settings, signal: ctrl.signal });
    } catch { outcome = { status: 'failed', reason: 'provider_error' }; }
    if (job.status !== 'processing') return; // cancelled or deleted meanwhile: discard late result
    if (outcome.status === 'succeeded') {
      await store.putResult(job.id, outcome.image);
      job.resultMime = outcome.mime; job.expiresAt = Date.now() + RETENTION.unsavedResultMs;
    }
    job.status = outcome.status; job.reason = outcome.reason; job.updatedAt = Date.now();
    const upload = store.uploads.get(job.uploadId);
    if (upload) upload.expiresAt = Math.min(upload.expiresAt, Date.now() + RETENTION.rawPhotoAfterProcessingMs);
  }

  async function api(req, res, url, owner) {
    const p = url.pathname; const m = req.method;
    if (m === 'GET' && p === '/api/catalog') return send(res, 200, publicCatalog());
    if (m === 'GET' && p === '/api/status') return send(res, 200, { provider: provider.name, previewsEnabled: provider.configured, spendLimit, used: store.spendCount(owner), retention: RETENTION });

    if (m === 'POST' && p === '/api/uploads') {
      if (req.headers['x-nyoni-consent'] !== 'own-photo;processing') return send(res, 400, { error: 'consent_required' });
      const buf = await readBody(req, MAX_BYTES + 1);
      const info = inspectImage(buf);
      if (!info.ok) return send(res, 422, { error: info.reason });
      const rec = await store.putUpload(owner, { format: info.format, width: info.width, height: info.height }, info.clean);
      return send(res, 201, { id: rec.id, width: rec.width, height: rec.height, expiresAt: rec.expiresAt, imageUrl: signedUrl(`/api/uploads/${rec.id}/image`) });
    }
    let mm;
    if ((mm = /^\/api\/uploads\/([\w-]+)(\/image)?$/.exec(p))) {
      const u = store.uploads.get(mm[1]);
      if (!u || u.owner !== owner) return send(res, 404, { error: 'not_found' });
      if (m === 'GET' && mm[2]) {
        if (!checkSig(p, url.searchParams)) return send(res, 403, { error: 'url_expired' });
        res.writeHead(200, { 'content-type': `image/${u.format}`, 'cache-control': 'private, no-store' });
        return res.end(await store.readBlob(u.id));
      }
      if (m === 'DELETE' && !mm[2]) {
        for (const j of store.jobs.values()) if (j.uploadId === u.id && !TERMINAL.has(j.status)) { j.status = 'cancelled'; j.abort?.abort(); }
        await store.deleteUpload(u.id); return send(res, 200, { deleted: true });
      }
    }

    if (m === 'POST' && p === '/api/jobs') {
      const body = await json(req);
      const v = validateSpec(body?.spec);
      if (!v.ok) return send(res, 422, { error: 'invalid_spec', details: v.errors });
      const upload = store.uploads.get(body.uploadId);
      if (!upload || upload.owner !== owner) return send(res, 404, { error: 'photo_not_found' });
      const garment = garmentReference(v.spec); const settings = { view: 'front', pieces: 'two-piece' };
      const key = jobKey({ garment, personAssetVersion: upload.version, settings });
      for (const j of store.jobs.values()) if (j.owner === owner && j.key === key && !['failed', 'cancelled', 'expired'].includes(j.status)) return send(res, 200, jobView(j)); // idempotent
      if (store.spendCount(owner) >= spendLimit) return send(res, 429, { error: 'session_limit_reached' });
      const job = { id: randomUUID(), owner, uploadId: upload.id, garment, settings, key, status: 'queued', createdAt: Date.now(), updatedAt: Date.now() };
      store.jobs.set(job.id, job);
      if (provider.configured) store.addSpend(owner);
      queueMicrotask(() => runJob(job));
      return send(res, 202, jobView(job));
    }
    if ((mm = /^\/api\/jobs\/([\w-]+)(\/result|\/cancel)?$/.exec(p))) {
      const j = store.jobs.get(mm[1]);
      if (!j || j.owner !== owner) return send(res, 404, { error: 'not_found' });
      if (m === 'GET' && !mm[2]) return send(res, 200, jobView(j));
      if (m === 'GET' && mm[2] === '/result') {
        if (j.status !== 'succeeded' || !checkSig(p, url.searchParams)) return send(res, 403, { error: 'url_expired' });
        res.writeHead(200, { 'content-type': j.resultMime ?? 'image/jpeg', 'cache-control': 'private, no-store' });
        return res.end(await store.readResult(j.id));
      }
      if (m === 'POST' && mm[2] === '/cancel') {
        if (!TERMINAL.has(j.status)) { j.status = 'cancelled'; j.updatedAt = Date.now(); j.abort?.abort(); }
        return send(res, 200, jobView(j));
      }
      if (m === 'DELETE' && !mm[2]) { j.status = 'cancelled'; j.abort?.abort(); await store.deleteJob(j.id); return send(res, 200, { deleted: true }); }
    }

    if (m === 'POST' && p === '/api/requests') {
      const body = await json(req);
      const v = validateSpec(body?.spec);
      if (!v.ok) return send(res, 422, { error: 'invalid_spec', details: v.errors });
      const name = String(body.name ?? '').trim().slice(0, 120); const contact = String(body.contact ?? '').trim().slice(0, 200);
      if (!name || !contact) return send(res, 422, { error: 'name_and_contact_required' });
      const rec = await store.putRequest({ type: 'fitting-design-review', name, contact, occasion: String(body.occasion ?? '').slice(0, 200), eventDate: body.eventDate ?? null, notes: String(body.notes ?? '').slice(0, 2000), spec: v.spec, garment: garmentReference(v.spec), personalPreviewIncluded: false });
      return send(res, 201, { id: rec.id, receivedAt: rec.receivedAt });
    }
    return send(res, 404, { error: 'not_found' });
  }

  async function serveStatic(res, pathname) {
    const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(publicDir, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url, ownerOf(req, res));
      if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
      return await serveStatic(res, url.pathname);
    } catch (e) {
      // Never log request bodies or image data.
      if (e.code === 413) return send(res, 413, { error: 'too_large' });
      console.error('request failed', req.method, url.pathname, e.message);
      if (!res.headersSent) send(res, 500, { error: 'server_error' });
    }
  });
}
