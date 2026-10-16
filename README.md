# NYONI Personal Preview Lab

The "immediate next build" from the NYONI personal suit design plan (§10, 15 Oct 2026): a separate lab with one suit, three proof fabrics, an optional **See it on me** flow, a studio fallback, explicit generation, result comparison, delete and retry, plus a real **Request a fitting / design review** handoff.

**No paid provider is connected.** If you generate a preview, the job is recorded and then fails honestly with `provider_not_configured`. No AI image is invented and no completion is simulated.

## Run

```
npm start      # http://localhost:4310
npm test
```

Node 20+ is required. There are no dependencies.

## What is real

- **Design spec** (`server/spec.js`): it is versioned against `CATALOG_VERSION` and validated on the server. Unsupported options are rejected.
- **Garment reference**: `assetId` plus a version hash of the *visible* fields (fabric, lapel, buttons). Lining and monogram don't make a front preview stale.
- **Upload** (`server/image.js`): you must give consent to upload. The server reads the format from the file's bytes (JPEG or PNG only). Limits: 12 MB, at least 512 px on the short side, portrait orientation. EXIF, XMP and PNG text chunks are removed. Files are stored privately with mode 0600.
- **Access**: every upload, job and result is scoped to its owner through an HttpOnly session cookie. Image URLs are HMAC-signed and expire after 5 minutes. Responses are sent with `no-store`, and image bytes are never logged.
- **Jobs**: these statuses are used: queued, processing, succeeded, failed, cancelled. The job key hashes the garment version, the photo version and the settings, so asking again for the same garment and photo returns the existing job. You can cancel a job. A result that arrives after cancellation or deletion is thrown away. Each session has a spend limit (default 3, counted only when a provider is configured).
- **Retention** (proposed settings, not a legal conclusion): raw photos are deleted 24 h after processing, or after 24 h if unused. Unsaved results are deleted after 7 days. A sweep runs every 10 minutes.
- **Client**: if you change the design after generating, the personal image is labelled **Previous design — update preview** and is only regenerated when you ask. The last good image is kept when a run fails. You can switch between Original, Personal preview and Garment details. There is no back view.
- **Handoff**: `POST /api/requests` writes the request to `.private-data/requests/<ID>.json` and returns the reference ID only once the write has succeeded.

## Placeholders that need business decisions

- Supplier IDs (`TBC-SUPPLIER-00x`), fabric attributes, construction and the tailor approval of the suit.
- The studio view is an SVG diagram, not approved garment imagery (milestone 3).
- Provider adapter: `server/providers.js` defines the contract. FASHN or Google VTO goes there after the milestone-2 go/no-go, consent review and trial budget.
- Concierge destination: requests are stored on disk. They are not yet routed to a real workflow.
- The draft is saved in this browser only (localStorage). There are no accounts.
