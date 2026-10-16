// NYONI Personal Preview Lab client. The design spec is authoritative; images are visual aids.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const DRAFT_KEY = 'nyoni-lab-draft';
const store = { get() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(v)); } catch {} } };
const say = (msg) => { $('#sr-status').textContent = msg; };

let catalog; let status; let spec;
const me = { upload: null, job: null, lastGood: null, phase: 'intro', error: null, pollTimer: null };
const byId = (list, id) => list.find((x) => x.id === id);
const fabric = () => byId(catalog.fabrics, spec.fabric);
const opt = (k) => byId(catalog.options[k], spec[k]);
const visibleKey = (s = spec) => [s.fabric, s.lapel, s.button].join('|');

async function api(path, init = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(body?.error ?? `http_${res.status}`), { status: res.status, body });
  return body;
}

// ---------- Studio garment (SVG diagram of the recorded spec) ----------
function patternDef(f, id) {
  if (f.pattern === 'check') return `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${f.base}"/><path d="M0 .5H22M.5 0V22" stroke="${f.accent}" stroke-width="1"/></pattern>`;
  return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${f.base}"/><path d="M0 4L4 0" stroke="${f.accent}" stroke-width=".6" opacity=".6"/></pattern>`;
}
function lapelPath(peak) {
  return peak
    ? 'M150 92 L132 110 L120 96 L128 150 L170 250 Z M210 92 L228 110 L240 96 L232 150 L190 250 Z'
    : 'M150 92 L128 118 L136 126 L128 150 L170 250 Z M210 92 L232 118 L224 126 L232 150 L190 250 Z';
}
function studioSVG() {
  const f = fabric(); const btn = opt('button').color; const peak = spec.lapel === 'LP-PEAK';
  return `<svg viewBox="0 0 360 640" role="img" aria-label="Studio diagram: ${esc(f.name)}, ${esc(opt('lapel').name)}, ${esc(opt('button').name)} buttons">
  <defs>${patternDef(f, 'cloth')}<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
  <circle cx="180" cy="48" r="30" fill="#c9b8a6"/><rect x="168" y="74" width="24" height="20" fill="#c9b8a6"/>
  <path d="M110 330 L120 600 L172 600 L180 360 L188 600 L240 600 L250 330 Z" fill="url(#cloth)"/><path d="M110 330 L120 600 L172 600 L180 360 L188 600 L240 600 L250 330 Z" fill="url(#shade)"/>
  <path d="M180 360 L180 600" stroke="#0003"/>
  <rect x="116" y="600" width="58" height="16" rx="4" fill="#1a1512"/><rect x="186" y="600" width="58" height="16" rx="4" fill="#1a1512"/>
  <path d="M150 90 L180 160 L210 90 Z" fill="#f4f2ee"/><path d="M174 104 L180 250 L186 104 Z" fill="#3b4150"/>
  <path d="M150 88 L96 104 L84 236 L70 400 L104 404 L114 250 L112 380 L248 380 L246 250 L256 404 L290 400 L276 236 L264 104 L210 88 L190 250 L170 250 Z" fill="url(#cloth)"/>
  <path d="M150 88 L96 104 L84 236 L70 400 L104 404 L114 250 L112 380 L248 380 L246 250 L256 404 L290 400 L276 236 L264 104 L210 88 L190 250 L170 250 Z" fill="url(#shade)"/>
  <path d="${lapelPath(peak)}" fill="url(#cloth)" stroke="#0004"/>
  <path d="M180 250 L180 380" stroke="#0004"/>
  <rect x="124" y="300" width="40" height="8" fill="url(#cloth)" stroke="#0003"/><rect x="196" y="300" width="40" height="8" fill="url(#cloth)" stroke="#0003"/>
  <circle cx="184" cy="272" r="5" fill="${btn}"/><circle cx="184" cy="318" r="5" fill="${btn}"/>
  </svg>`;
}
function detailFigures() {
  const f = fabric(); const peak = spec.lapel === 'LP-PEAK';
  return `
  <figure><svg viewBox="0 0 60 60"><defs>${patternDef(f, 'c2')}</defs><rect width="60" height="60" fill="url(#c2)"/></svg><figcaption>Cloth (illustrative)</figcaption></figure>
  <figure><svg viewBox="110 80 140 180"><defs>${patternDef(f, 'c3')}</defs><path d="${lapelPath(peak)}" fill="url(#c3)" stroke="#000"/></svg><figcaption>${esc(opt('lapel').name)}</figcaption></figure>
  <figure><svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="20" fill="${opt('button').color}"/><circle cx="25" cy="25" r="2.5" fill="#0006"/><circle cx="35" cy="25" r="2.5" fill="#0006"/><circle cx="25" cy="35" r="2.5" fill="#0006"/><circle cx="35" cy="35" r="2.5" fill="#0006"/></svg><figcaption>${esc(opt('button').name)} buttons</figcaption></figure>
  <figure><svg viewBox="0 0 60 60"><rect width="60" height="60" fill="${opt('lining').color}"/>${spec.monogram ? `<text x="30" y="36" fill="#d9c38a" text-anchor="middle" font-family="serif" font-size="16">${esc(spec.monogram)}</text>` : ''}</svg><figcaption>${esc(opt('lining').name)} lining${spec.monogram ? ', monogram' : ''}</figcaption></figure>`;
}

// ---------- Views ----------
let view = 'studio';
function setView(v) {
  view = v;
  for (const b of document.querySelectorAll('.view-tabs button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
  for (const n of ['studio', 'original', 'personal', 'details']) $(`#view-${n}`).hidden = n !== v;
}
function renderStage() {
  $('#view-studio').innerHTML = studioSVG();
  $('#view-details').innerHTML = detailFigures();
  $('#tab-original').hidden = !me.upload;
  $('#tab-personal').hidden = !me.lastGood;
  if (me.lastGood) {
    const stale = me.lastGood.visibleKey !== visibleKey();
    $('#stale-banner').hidden = !stale;
    $('#personal-img').alt = stale ? 'Personal preview of your previous design' : 'Personal preview of your current design (illustrative)';
  }
  if ((view === 'original' && !me.upload) || (view === 'personal' && !me.lastGood)) setView('studio');
}

// ---------- Design controls ----------
function radioCard(group, item, checked, inner) {
  return `<button type="button" role="radio" class="${inner.cls}" data-group="${group}" data-id="${item.id}" aria-checked="${checked}">${inner.html}</button>`;
}
function renderControls() {
  $('#fabric-list').innerHTML = catalog.fabrics.map((f) => radioCard('fabric', f, f.id === spec.fabric, { cls: 'card', html:
    `<svg class="swatch" viewBox="0 0 56 56" aria-hidden="true"><defs>${patternDef(f, `sw-${f.id}`)}</defs><rect width="56" height="56" fill="url(#sw-${f.id})"/></svg>
     <span><strong>${esc(f.name)}</strong><br><span class="muted">Supplier ID ${esc(f.supplierId)} · attributes pending verification</span></span>` })).join('');
  $('#opt-lapel').innerHTML = catalog.options.lapel.map((o) => radioCard('lapel', o, o.id === spec.lapel, { cls: 'card', html: `<span><strong>${esc(o.name)}</strong><br><span class="muted">${esc(o.help)}</span></span>` })).join('');
  for (const k of ['button', 'lining']) $(`#opt-${k}`).innerHTML = catalog.options[k].map((o) => radioCard(k, o, o.id === spec[k], { cls: 'chip', html: `<span class="dot" style="background:${o.color}"></span>${esc(o.name)}` })).join('');
  $('#monogram').value = spec.monogram;
}
function ruleFor(next) { return catalog.rules.find((r) => Object.entries(r.when).every(([k, v]) => next[k] === v)); }
function confirmRule(rule) {
  return new Promise((resolve) => {
    const d = $('#confirm-dialog'); $('#confirm-text').textContent = rule.note;
    const done = (v) => { d.close(); resolve(v); };
    $('#confirm-apply').onclick = () => done(true); $('#confirm-cancel').onclick = () => done(false);
    d.oncancel = (e) => { e.preventDefault(); done(false); };
    d.showModal();
  });
}
async function choose(group, id, trigger) {
  const next = { ...spec, [group]: id };
  const rule = ruleFor(next);
  if (rule && !ruleFor(spec) && !(await confirmRule(rule))) { trigger?.focus(); return; }
  spec = next; commit(); say(`${group} set to ${byId(group === 'fabric' ? catalog.fabrics : catalog.options[group], id).name}`);
  document.querySelector(`[data-group="${group}"][data-id="${id}"]`)?.focus();
}
function commit() {
  store.set({ spec, savedAt: Date.now() });
  $('#draft-note').textContent = 'Draft saved in this browser only';
  renderControls(); renderStage(); renderSummary(); if (currentStep === 'me') renderMe();
}
document.addEventListener('click', (e) => {
  const r = e.target.closest('[role=radio][data-group]'); if (r) choose(r.dataset.group, r.dataset.id, r);
  const t = e.target.closest('.view-tabs button'); if (t) setView(t.dataset.view);
  const s = e.target.closest('[data-step]'); if (s) goStep(s.dataset.step);
  const ed = e.target.closest('[data-edit]'); if (ed) goStep(ed.dataset.edit);
});
document.addEventListener('keydown', (e) => {
  const r = e.target.closest?.('[role=radio][data-group]'); if (!r || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) return;
  e.preventDefault();
  const sib = [...r.parentElement.querySelectorAll('[role=radio]')]; const i = sib.indexOf(r);
  const n = sib[(i + (/Down|Right/.test(e.key) ? 1 : -1) + sib.length) % sib.length]; choose(n.dataset.group, n.dataset.id, n);
});
$('#monogram').addEventListener('input', (e) => {
  const v = e.target.value.toUpperCase();
  if (!/^[A-Z]{0,3}$/.test(v)) { $('#mono-err').textContent = 'Letters A–Z only.'; return; }
  $('#mono-err').textContent = ''; spec = { ...spec, monogram: v }; store.set({ spec, savedAt: Date.now() }); renderStage(); renderSummary();
});

let currentStep = 'cloth';
function goStep(step) {
  currentStep = step;
  for (const b of document.querySelectorAll('.steps button')) {
    if (b.dataset.step === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  }
  for (const s of ['cloth', 'details', 'me', 'review']) $(`#step-${s}`).hidden = s !== step;
  if (step === 'me') renderMe();
  $(`#step-${step} h2`).setAttribute('tabindex', '-1'); $(`#step-${step} h2`).focus();
}

// ---------- See it on me ----------
const REASONS = {
  provider_not_configured: 'Personal previews are not connected yet in this lab. Your photo has not been sent anywhere outside NYONI. You can keep designing with the studio view.',
  provider_error: 'The preview service did not respond. Your design and previous image are kept. You can retry or return to the studio.',
  photo_removed: 'Your photo was removed before processing.',
  session_limit_reached: 'You have reached the preview limit for this session. Your design is saved; request a design review to continue with our team.',
  too_small: 'The photo is too small. Use a photo at least 512 pixels on its shortest side.',
  too_large: 'The file is larger than 12 MB. Try a smaller export.',
  unsupported_format: 'Please use a JPEG or PNG photo.',
  not_portrait: 'Use an upright, full-body portrait photo (taller than it is wide) with head and feet visible.',
  corrupt: 'We could not read that file. Try exporting it again.',
  consent_required: 'Please confirm both statements before uploading.',
};
const reasonText = (r) => REASONS[r] ?? 'Something went wrong. Your design is safe; try again or continue in the studio.';
const guideFig = (ok, label, body) => `<figure><svg viewBox="0 0 80 120" aria-hidden="true">${body}</svg><figcaption>${ok ? '✓' : '✕'} ${label}</figcaption></figure>`;
const person = (extra = '') => `<circle cx="40" cy="18" r="9" fill="#999"/><rect x="28" y="28" width="24" height="44" rx="6" fill="#777"/><rect x="29" y="72" width="9" height="40" fill="#777"/><rect x="42" y="72" width="9" height="40" fill="#777"/>${extra}`;

function renderMe() {
  const b = $('#me-body'); const enabled = status.previewsEnabled;
  const svc = `<p class="muted">Processing provider: <strong>${enabled ? esc(status.provider) : 'not connected in this lab'}</strong>. Purpose: one styling preview of your selected suit. Not used for model training or marketing. NYONI deletes your raw photo within 24 hours after processing (or 24 hours if unused) and unsaved previews within 7 days. Provider retention is separate and will be disclosed before any provider is connected.</p>`;
  if (me.phase === 'intro') {
    b.innerHTML = `<p>Upload one full-body photo and we will generate an illustrative image of <em>this</em> suit on you. It is a visual aid: it does not measure you or choose a size. The studio view stays available either way.</p>
      <div class="guide">
        ${guideFig(true, 'Front-facing, head to feet, arms relaxed', person())}
        ${guideFig(false, 'Cropped at knees or head', `<g transform="translate(0,30)">${person()}</g><rect y="100" width="80" height="20" fill="#e2ddd4"/>`)}
        ${guideFig(false, 'Hands or bag over jacket area', person('<rect x="24" y="38" width="32" height="18" fill="#444"/>'))}
        ${guideFig(false, 'Dark, blurred or backlit', `<rect width="80" height="120" fill="#333"/>${person()}`)}
      </div>
      <p class="muted">Best results: good even light, simple fitted clothing, neutral stance, plain background.</p>
      ${svc}
      <form id="consent-form" class="box">
        <label><input type="checkbox" name="own" style="width:auto"> This is a photo of me, or I have permission from the adult pictured.</label>
        <label><input type="checkbox" name="proc" style="width:auto"> I agree to NYONI processing this photo for this preview, as described above.</label>
        <label>Photo (JPEG or PNG, up to 12 MB) <input type="file" name="file" accept="image/jpeg,image/png"></label>
        <div class="row"><button class="primary" type="submit">Upload photo</button><button type="button" data-step="review">Skip — use studio view</button></div>
        <div class="error" role="alert">${me.error ? esc(reasonText(me.error)) : ''}</div>
      </form>`;
    $('#consent-form').onsubmit = onUpload; return;
  }
  if (me.phase === 'crop') {
    b.innerHTML = `<p>Check your photo. We use it as uploaded — no stretching or reshaping. Head and feet should both be visible.</p>
      <div class="crop"><img src="${me.upload.imageUrl}" alt="Your uploaded photo"></div>
      <p class="muted">${me.upload.width} × ${me.upload.height} px · metadata (EXIF/location) removed.</p>
      <div class="row"><button class="primary" id="crop-ok">Use this photo</button><button id="retake">Choose a different photo</button><button id="remove-photo">Remove photo</button></div>`;
    $('#crop-ok').onclick = () => { me.phase = 'ready'; renderMe(); };
    $('#retake').onclick = removePhoto; $('#remove-photo').onclick = removePhoto; return;
  }
  const j = me.job; const busy = j && ['queued', 'processing'].includes(j.status);
  const stale = me.lastGood && me.lastGood.visibleKey !== visibleKey();
  b.innerHTML = `<p>Selected: <strong>${esc(fabric().name)}</strong>, ${esc(opt('lapel').name)}, ${esc(opt('button').name)} buttons. Front view only.</p>
    ${!enabled ? `<p class="box warn">Personal previews are not connected in this lab build. Generating will record a real job and report that no provider is available — no image will be invented.</p>` : `<p class="muted">Previews used this session: ${status.used} of ${status.spendLimit}.</p>`}
    <div role="status" aria-live="polite" class="box">${
      busy ? `${j.status === 'queued' ? 'Queued' : 'Processing'}… <button id="cancel-job">Cancel</button>`
      : j?.status === 'failed' ? `<span class="error">${esc(reasonText(j.reason))}</span>`
      : j?.status === 'cancelled' ? 'Cancelled. Your previous image is kept.'
      : j?.status === 'succeeded' ? `<span class="ok">Preview ready.</span> <button class="link" id="show-personal">View it</button>`
      : me.error ? `<span class="error">${esc(reasonText(me.error))}</span>` : 'Ready when you are.'}</div>
    <div class="row">
      <button class="primary" id="generate" ${busy ? 'disabled' : ''}>${stale ? 'Update my preview' : j?.status === 'failed' ? 'Retry' : 'Generate my preview'}</button>
      <button id="to-studio">Return to studio</button>
      ${me.lastGood ? '<button id="delete-preview">Delete my preview</button>' : ''}
      <button id="remove-photo">Remove photo</button>
    </div>
    <p class="muted">Changing your design updates the studio view instantly. The personal image is only regenerated when you ask.</p>`;
  $('#generate').onclick = generate;
  $('#to-studio').onclick = () => { setView('studio'); goStep('details'); };
  $('#remove-photo').onclick = removePhoto;
  $('#cancel-job') && ($('#cancel-job').onclick = cancelJob);
  $('#show-personal') && ($('#show-personal').onclick = () => setView('personal'));
  $('#delete-preview') && ($('#delete-preview').onclick = deletePreview);
}

async function onUpload(e) {
  e.preventDefault(); const f = e.target;
  if (!f.own.checked || !f.proc.checked) { me.error = 'consent_required'; return renderMe(); }
  const file = f.file.files[0]; if (!file) { me.error = 'unsupported_format'; return renderMe(); }
  if (file.size > 12 * 1024 * 1024) { me.error = 'too_large'; return renderMe(); }
  try {
    me.upload = await api('/api/uploads', { method: 'POST', headers: { 'x-nyoni-consent': 'own-photo;processing', 'content-type': 'application/octet-stream' }, body: file });
    $('#original-img').src = me.upload.imageUrl; me.error = null; me.phase = 'crop'; say('Photo uploaded. Check it before continuing.');
  } catch (err) { me.error = err.message; }
  renderMe(); renderStage();
}
async function generate() {
  if (!me.upload) { me.phase = 'intro'; return renderMe(); }
  const key = visibleKey(); me.error = null;
  try { me.job = { ...(await api('/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, uploadId: me.upload.id }) })), visibleKey: key }; say('Preview queued.'); poll(); }
  catch (err) { me.error = err.message; }
  renderMe();
}
function poll() {
  clearTimeout(me.pollTimer);
  me.pollTimer = setTimeout(async () => {
    const j = me.job; if (!j) return;
    try {
      const next = { ...(await api(`/api/jobs/${j.id}`)), visibleKey: j.visibleKey };
      if (me.job?.id !== j.id) return; // superseded
      me.job = next;
      if (next.status === 'succeeded') {
        me.lastGood = { jobId: next.id, visibleKey: next.visibleKey, url: next.resultUrl };
        $('#personal-img').src = next.resultUrl; say('Personal preview ready.');
      } else if (next.status === 'failed') say(reasonText(next.reason));
      else if (next.status !== 'cancelled') poll();
    } catch { me.error = 'provider_error'; }
    renderMe(); renderStage();
  }, 1500);
}
async function cancelJob() { if (!me.job) return; clearTimeout(me.pollTimer); me.job = { ...(await api(`/api/jobs/${me.job.id}/cancel`, { method: 'POST' })), visibleKey: me.job.visibleKey }; say('Cancelled.'); renderMe(); }
async function deletePreview() {
  if (!me.lastGood) return; await api(`/api/jobs/${me.lastGood.jobId}`, { method: 'DELETE' }).catch(() => {});
  me.lastGood = null; $('#personal-img').removeAttribute('src'); say('Preview deleted.'); renderMe(); renderStage();
}
async function removePhoto() {
  clearTimeout(me.pollTimer);
  if (me.upload) await api(`/api/uploads/${me.upload.id}`, { method: 'DELETE' }).catch(() => {});
  me.upload = null; me.job = null; me.phase = 'intro'; $('#original-img').removeAttribute('src'); say('Photo removed.');
  renderMe(); renderStage();
}

// ---------- Review & request ----------
function renderSummary() {
  const f = fabric(); const rule = ruleFor(spec);
  const rows = [
    ['Suit', `${catalog.suit.name} (${catalog.suit.id}) — awaiting tailor approval`, 'cloth'],
    ['Cloth', `${f.name} · supplier ID ${f.supplierId} (placeholder)`, 'cloth'],
    ['Lapel', opt('lapel').name, 'details'], ['Buttons', opt('button').name, 'details'], ['Lining', opt('lining').name, 'details'],
    ['Monogram', spec.monogram || 'None', 'details'],
    ['Price', 'Quoted after design review (not yet verified)', null],
    ['Fit', 'Atelier fitting requested with this form; a photo does not establish size', null],
    ['Catalogue', catalog.version, null],
  ];
  $('#summary').innerHTML = rows.map(([k, v, s]) => `<dt>${k}</dt><dd>${esc(v)}${s ? ` <button class="link" data-edit="${s}" aria-label="Edit ${k}">Edit</button>` : ''}</dd>`).join('')
    + (rule ? `<dt>Note</dt><dd class="warn">${esc(rule.note)}</dd>` : '');
}
$('#request-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target; const st = $('#request-status'); const btn = f.querySelector('button');
  if (!f.name.value.trim() || !f.contact.value.trim()) { st.innerHTML = '<span class="error">Please add your name and an email or phone number.</span>'; return; }
  btn.disabled = true; st.textContent = 'Sending…';
  try {
    const r = await api('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec: { ...spec, fitRoute: 'atelier-fitting' }, name: f.name.value, contact: f.contact.value, occasion: f.occasion.value, eventDate: f.eventDate.value || null, notes: f.notes.value }) });
    st.innerHTML = `<p class="ok"><strong>Request received.</strong> Reference <strong>${esc(r.id)}</strong>.</p><p>Next: a NYONI tailor reviews your specification and contacts you to arrange a fitting. In this lab build, requests are stored for the concierge team; no booking or payment is made.</p>`;
  } catch (err) { st.innerHTML = `<span class="error">Your request was not saved (${esc(err.message)}). Your design is kept — please try again.</span>`; btn.disabled = false; }
});

$('#update-preview').addEventListener('click', () => { goStep('me'); generate(); });

// ---------- Boot ----------
(async function boot() {
  [catalog, status] = await Promise.all([api('/api/catalog'), api('/api/status')]);
  const def = { catalogVersion: catalog.version, suit: catalog.suit.id, fabric: catalog.fabrics[0].id, lapel: 'LP-NOTCH', button: 'BT-HORN-DARK', lining: 'LN-NAVY', monogram: '', fitRoute: 'not-chosen' };
  const saved = store.get()?.spec;
  const valid = saved && saved.catalogVersion === catalog.version && byId(catalog.fabrics, saved.fabric) && ['lapel', 'button', 'lining'].every((k) => byId(catalog.options[k], saved[k]));
  spec = valid ? { ...def, ...saved } : def;
  $('#draft-note').textContent = valid ? 'Draft restored from this browser' : saved ? 'Previous draft used an older catalogue and was not restored' : '';
  renderControls(); renderStage(); renderSummary();
})().catch(() => { document.body.insertAdjacentHTML('afterbegin', '<p class="error box">The lab could not load. Please refresh.</p>'); });
