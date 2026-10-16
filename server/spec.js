import { createHash } from 'node:crypto';
import { CATALOG_VERSION, SUIT, FABRIC_BY_ID, OPTION_BY_ID } from './catalog.js';

const MONOGRAM = /^[A-Z]{0,3}$/;

// Validates a design spec against the catalogue. Returns { ok, spec | errors }.
export function validateSpec(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['spec must be an object'] };
  if (input.catalogVersion !== CATALOG_VERSION) errors.push('catalogVersion is stale or unknown');
  if (input.suit !== SUIT.id) errors.push('unsupported suit');
  if (!FABRIC_BY_ID[input.fabric]) errors.push('unsupported fabric');
  for (const k of ['lapel', 'button', 'lining']) if (!OPTION_BY_ID[k][input[k]]) errors.push(`unsupported ${k}`);
  const monogram = String(input.monogram ?? '').toUpperCase();
  if (!MONOGRAM.test(monogram)) errors.push('monogram must be up to 3 letters A–Z');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      catalogVersion: CATALOG_VERSION, suit: input.suit, fabric: input.fabric,
      lapel: input.lapel, button: input.button, lining: input.lining, monogram,
      fitRoute: input.fitRoute === 'atelier-fitting' ? 'atelier-fitting' : 'not-chosen',
    },
  };
}

export const sha = (s) => createHash('sha256').update(s).digest('hex');

// Fields that change the visible garment. Lining and monogram are not visible in a
// front preview, so changing them does not stale a personal image.
export function garmentReference(spec) {
  const visible = { suit: spec.suit, fabric: spec.fabric, lapel: spec.lapel, button: spec.button, catalogVersion: spec.catalogVersion };
  return { assetId: `GR-${spec.suit}-${spec.fabric}-${spec.lapel}-${spec.button}`, version: sha(JSON.stringify(visible)).slice(0, 16), approved: false };
}

export function jobKey({ garment, personAssetVersion, settings }) {
  return sha(JSON.stringify([garment.assetId, garment.version, personAssetVersion, settings]));
}
