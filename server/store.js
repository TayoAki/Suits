import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const HOUR = 3600_000;
export const RETENTION = { rawPhotoAfterProcessingMs: 24 * HOUR, unsavedResultMs: 7 * 24 * HOUR, rawPhotoUnusedMs: 24 * HOUR };

// Private storage: blobs on disk under a non-public directory, metadata in memory.
// Requests (the business handoff) are persisted durably as JSON lines.
export function createStore(dir) {
  const uploads = new Map(); const jobs = new Map(); const spend = new Map();
  const blobPath = (id) => join(dir, 'blobs', id);

  return {
    uploads, jobs,
    async init() { await mkdir(join(dir, 'blobs'), { recursive: true }); await mkdir(join(dir, 'requests'), { recursive: true }); },
    async putUpload(owner, meta, buf) {
      const id = randomUUID();
      await writeFile(blobPath(id), buf, { mode: 0o600 });
      const rec = { id, owner, ...meta, version: randomUUID().slice(0, 8), createdAt: Date.now(), expiresAt: Date.now() + RETENTION.rawPhotoUnusedMs };
      uploads.set(id, rec); return rec;
    },
    async readBlob(id) { return readFile(blobPath(id)); },
    async putResult(jobId, buf) { await writeFile(blobPath(`result-${jobId}`), buf, { mode: 0o600 }); },
    async readResult(jobId) { return readFile(blobPath(`result-${jobId}`)); },
    async deleteUpload(id) { uploads.delete(id); await rm(blobPath(id), { force: true }); },
    async deleteJob(id) { jobs.delete(id); await rm(blobPath(`result-${id}`), { force: true }); },
    spendCount: (owner) => spend.get(owner) ?? 0,
    addSpend: (owner) => spend.set(owner, (spend.get(owner) ?? 0) + 1),
    async putRequest(rec) {
      const id = `NY-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const full = { id, ...rec, receivedAt: new Date().toISOString() };
      await writeFile(join(dir, 'requests', `${id}.json`), JSON.stringify(full, null, 2), { flag: 'wx', mode: 0o600 });
      return full;
    },
    async sweep(now = Date.now()) {
      for (const u of uploads.values()) if (u.expiresAt <= now) await this.deleteUpload(u.id);
      for (const j of jobs.values()) if (j.expiresAt && j.expiresAt <= now) await this.deleteJob(j.id);
    },
  };
}
