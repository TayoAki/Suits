// Proof-scope catalogue (plan §4). Every entry carries an approval status so the
// UI can never present an unverified attribute as fact.
export const CATALOG_VERSION = 'lab-2026-10-15.1';

export const SUIT = {
  id: 'SU-LAB-01',
  name: 'Two-piece, single-breasted, two-button',
  approval: 'pending-tailor-approval',
  jacket: 'Half-canvas, two-button, flap pockets, double vent',
  trouser: 'Flat front, belt loops, plain hem',
};

// Supplier IDs are placeholders until the source-ID catalogue (milestone 1) exists.
export const FABRICS = [
  { id: 'FB-PLAIN-DARK', supplierId: 'TBC-SUPPLIER-001', name: 'Midnight navy plain', pattern: 'plain', base: '#1d2433', accent: '#283147', verified: {} },
  { id: 'FB-PLAIN-LIGHT', supplierId: 'TBC-SUPPLIER-002', name: 'Stone grey plain', pattern: 'plain', base: '#a7a39a', accent: '#b5b1a8', verified: {} },
  { id: 'FB-CHECK', supplierId: 'TBC-SUPPLIER-003', name: 'Charcoal windowpane check', pattern: 'check', base: '#3a3b3d', accent: '#8b8f96', verified: {} },
];

export const OPTIONS = {
  lapel: [
    { id: 'LP-NOTCH', name: 'Notch lapel', help: 'A V-shaped step where collar meets lapel. The everyday business choice.' },
    { id: 'LP-PEAK', name: 'Peak lapel', help: 'Lapel points rise toward the shoulder. More formal; reads broader across the chest.' },
  ],
  button: [
    { id: 'BT-HORN-DARK', name: 'Dark horn', color: '#2b211b' },
    { id: 'BT-HORN-LIGHT', name: 'Light horn', color: '#8a6a4c' },
  ],
  lining: [
    { id: 'LN-NAVY', name: 'Navy', color: '#22305a' },
    { id: 'LN-BURGUNDY', name: 'Burgundy', color: '#6b1f2a' },
  ],
};

// Compatibility rules are explicit; the client must confirm, never silently reset.
export const RULES = [
  { when: { lapel: 'LP-PEAK', fabric: 'FB-PLAIN-LIGHT' }, note: 'Peak lapel on a light plain cloth is unusual for daywear. Allowed, flagged for design review.' },
];

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const FABRIC_BY_ID = byId(FABRICS);
export const OPTION_BY_ID = Object.fromEntries(Object.entries(OPTIONS).map(([k, v]) => [k, byId(v)]));

export function publicCatalog() {
  return { version: CATALOG_VERSION, suit: SUIT, fabrics: FABRICS, options: OPTIONS, rules: RULES };
}
