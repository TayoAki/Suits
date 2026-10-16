import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { unconfiguredProvider } from '../server/providers.js';
import { inspectImage } from '../server/image.js';
import { validateSpec, garmentReference } from '../server/spec.js';
import { CATALOG_VERSION } from '../server/catalog.js';

const SPEC = { catalogVersion: CATALOG_VERSION, suit: 'SU-LAB-01', fabric: 'FB-CHECK', lapel: 'LP-NOTCH', button: 'BT-HORN-DARK', lining: 'LN-NAVY', monogram: 'ab' };

function jpeg(w, h, withExif = true) {
  const seg = (m, body) => { const b = Buffer.alloc(4); b[0] = 0xff; b[1] = m; b.writeUInt16BE(body.length + 2, 2); return Buffer.concat([b, body]); };
  const sof = Buffer.alloc(15); sof[0] = 8; sof.writeUInt16BE(h, 1); sof.writeUInt16BE(w, 3);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0')), withExif ? seg(0xe1, Buffer.from('Exif\0\0GPS-SECRET')) : Buffer.alloc(0), seg(0xc0, sof), Buffer.from([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9])]);
}

async function boot(provider = unconfiguredProvider, spendLimit = 3) {
  const store = createStore(await mkdtemp(join(tmpdir(), 'nyoni-')));
  await store.init();
  const server = createApp({ store, provider, publicDir: 'public', spendLimit }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, init = {}) => {
      const res = await fetch(base + path, { ...init, headers: { ...(init.headers ?? {}), cookie } });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const ct = res.headers.get('content-type') ?? '';
      return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
    };
  };
  return { server, store, client };
}
const upload = (c, buf, consent = true) => c('/api/uploads', { method: 'POST', body: buf, headers: consent ? { 'x-nyoni-consent': 'own-photo;processing' } : {} });
const waitJob = async (c, id) => { for (let i = 0; i < 50; i++) { const r = await c(`/api/jobs/${id}`); if (!['queued', 'processing'].includes(r.body.status)) return r.body; await new Promise((r) => setTimeout(r, 10)); } throw new Error('timeout'); };

test('image inspection checks real bytes, size and strips EXIF', () => {
  assert.equal(inspectImage(Buffer.from('not an image at all')).reason, 'unsupported_format');
  assert.equal(inspectImage(jpeg(300, 600)).reason, 'too_small');
  assert.equal(inspectImage(jpeg(1200, 800)).reason, 'not_portrait');
  const ok = inspectImage(jpeg(800, 1600));
  assert.ok(ok.ok); assert.equal(ok.width, 800);
  assert.ok(!ok.clean.includes(Buffer.from('GPS-SECRET')));
});

test('spec validation rejects unsupported options and stale catalogues', () => {
  assert.ok(validateSpec(SPEC).ok);
  assert.equal(validateSpec(SPEC).spec.monogram, 'AB');
  assert.ok(!validateSpec({ ...SPEC, lapel: 'LP-SHAWL' }).ok);
  assert.ok(!validateSpec({ ...SPEC, catalogVersion: 'old' }).ok);
  assert.ok(!validateSpec({ ...SPEC, monogram: 'ABCD' }).ok);
  // lining is not visible in a front preview, so it does not change the garment reference
  assert.equal(garmentReference(SPEC).version, garmentReference({ ...SPEC, lining: 'LN-BURGUNDY' }).version);
  assert.notEqual(garmentReference(SPEC).version, garmentReference({ ...SPEC, lapel: 'LP-PEAK' }).version);
});

test('upload requires consent; images are owner-scoped and signed', async () => {
  const { server, client } = await boot();
  const a = client(); const b = client();
  assert.equal((await upload(a, jpeg(800, 1600), false)).status, 400);
  const up = await upload(a, jpeg(800, 1600));
  assert.equal(up.status, 201);
  const img = await a(up.body.imageUrl); assert.equal(img.status, 200);
  assert.ok(!img.body.includes(Buffer.from('GPS-SECRET')));
  assert.equal((await b(up.body.imageUrl)).status, 404, 'other session cannot read');
  assert.equal((await a(`/api/uploads/${up.body.id}/image`)).status, 403, 'unsigned URL refused');
  assert.equal((await a(`/api/uploads/${up.body.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await a(up.body.imageUrl)).status, 404);
  server.close();
});

test('unconfigured provider fails honestly with no output', async () => {
  const { server, client } = await boot();
  const c = client(); const up = await upload(c, jpeg(800, 1600));
  const job = await c('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: SPEC, uploadId: up.body.id }) });
  assert.equal(job.status, 202);
  const done = await waitJob(c, job.body.id);
  assert.equal(done.status, 'failed'); assert.equal(done.reason, 'provider_not_configured'); assert.equal(done.resultUrl, null);
  server.close();
});

test('jobs are idempotent, spend-limited, and cancelled results are discarded', async () => {
  let release;
  const slow = { name: 'test', configured: true, submit: () => new Promise((r) => { release = () => r({ status: 'succeeded', image: Buffer.from('img'), mime: 'image/png' }); }) };
  const { server, client } = await boot(slow, 2);
  const c = client(); const up = await upload(c, jpeg(800, 1600));
  const post = (spec) => c('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, uploadId: up.body.id }) });
  const j1 = await post(SPEC); const j1b = await post(SPEC);
  assert.equal(j1b.body.id, j1.body.id, 'same garment+photo reuses job');
  await new Promise((r) => setTimeout(r, 10));
  await c(`/api/jobs/${j1.body.id}/cancel`, { method: 'POST' }); release();
  await new Promise((r) => setTimeout(r, 10));
  const after = await c(`/api/jobs/${j1.body.id}`);
  assert.equal(after.body.status, 'cancelled'); assert.equal(after.body.resultUrl, null);
  const j2 = await post({ ...SPEC, lapel: 'LP-PEAK' }); assert.equal(j2.status, 202);
  await new Promise((r) => setTimeout(r, 10)); release();
  const ok = await waitJob(c, j2.body.id); assert.equal(ok.status, 'succeeded');
  assert.equal((await c(ok.resultUrl)).status, 200);
  assert.equal((await client()(ok.resultUrl)).status, 404, 'result is owner-scoped');
  assert.equal((await post({ ...SPEC, fabric: 'FB-PLAIN-DARK' })).status, 429);
  server.close();
});

test('design-review request returns an ID only after storage', async () => {
  const { server, client } = await boot();
  const c = client();
  assert.equal((await c('/api/requests', { method: 'POST', body: JSON.stringify({ spec: SPEC }) })).status, 422);
  const r = await c('/api/requests', { method: 'POST', body: JSON.stringify({ spec: SPEC, name: 'Test', contact: 't@example.com' }) });
  assert.equal(r.status, 201); assert.match(r.body.id, /^NY-\d{8}-[A-F0-9]{6}$/);
  server.close();
});
