# Travel Itinerary Dashboard

A local web app that turns booking-confirmation PDFs (flights, hotels, Airbnbs)
into a clean, editable, chronological trip itinerary. Drop in your PDFs and the
app uses the Anthropic API to extract structured booking data, lays everything
out on a timeline, and lets you correct anything inline. Export the result to
Excel or PDF.

Built with **React + Vite + Tailwind**. Excel export via **SheetJS (xlsx)**,
PDF export via **jspdf + jspdf-autotable**, PDF rendering via **pdfjs-dist**.

## How extraction works (and why your API key is safe)

The browser never sees your API key. When you drop a PDF:

1. Each page is rendered to an image with `pdfjs-dist` (in the browser).
2. The page images are POSTed to `/api/extract`.
3. A tiny **Vite dev-server middleware** (`server/extractPlugin.js`) reads
   `ANTHROPIC_API_KEY` from the server environment, attaches it, and forwards
   the request to `https://api.anthropic.com/v1/messages`
   (model `claude-sonnet-4-20250514`).
4. The model returns a JSON array of bookings, which is added to your timeline.

Because the key is injected by the middleware running in the Node/Vite process,
it is never bundled into client code.

## Setup

```bash
npm install
```

### Set your Anthropic API key

The key must be present in the environment when you start the dev server. Pick
**one** of these:

**Option A — `.env` file (easiest)**

```bash
cp .env.example .env
# then edit .env and paste your key:
# ANTHROPIC_API_KEY=sk-ant-...
```

**Option B — environment variable**

```powershell
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npm run dev
```

```bash
# macOS / Linux (bash/zsh)
export ANTHROPIC_API_KEY="sk-ant-..."
npm run dev
```

> The variable has **no** `VITE_` prefix on purpose — that keeps it server-side
> only. If you change `.env`, restart the dev server.

## Run

```bash
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Using it

- **Drop PDFs** (one or many) onto the drop zone. Each shows its own spinner
  while extracting; failures show an error with a **Retry** button.
- **Edit anything** — click any field (title, location, dates/times,
  confirmation number, notes) to edit; it saves on blur. Add or remove
  **traveler chips** per booking.
- **Filter** by clicking a traveler's avatar in the hero.
- **Merge duplicate travelers** — click **Manage** in the hero to merge
  different spellings of the same person (e.g. "SMITH/JOHN MR", "John Smith")
  into one identity, rename them, or split them apart. Comes pre-seeded so the
  bundled name groups merge automatically.
- **Add a booking manually** with the **Add** button.
- **Add places to check** with the **Place** button (or "+ add a spot" per city):
  paste a Google Maps share link, a restaurant website, or an event page. Full
  Maps links auto-fill the name + drop an exact map pin; other links get a name
  you can edit. Places form a **"Places to check in {city}" shortlist** and show
  as **category-colored map pins** — give one a date to also pin it onto the day
  timeline. (A server-side "unfurl" enhancement resolves short `maps.app.goo.gl`
  links and grabs a page photo; it fails silently so adding always works.)
- **Delete** a booking with the trash icon on its card.
- **Export** to Excel (one row per booking, travelers comma-separated, using the
  merged names) or to a printable, day-grouped PDF.

Everything (bookings + your traveler-merge settings) is saved to your browser's
`localStorage`, so your trip is still there when you reload.

## Visual features & third-party services

The dashboard shows a **gradient hero** with a destination photo and countdown,
an **interactive trip map**, a **vertical day-by-day timeline**, colored
**traveler avatars**, and per-stay **destination photos**. These use three
**keyless, browser-callable** services and **all degrade gracefully offline**
(the core app never depends on the network):

- **Map tiles** — OpenStreetMap (`tile.openstreetmap.org`) via Leaflet.
- **Geocoding** (city → coordinates) — Open-Meteo Geocoding API, with a
  Nominatim fallback. Results are cached in `localStorage`.
- **Destination photos** — Wikipedia REST "page summary" lead images, cached in
  `localStorage`, with a deterministic gradient fallback when a city has no
  photo or you're offline.

If you're offline, the map shows a friendly notice and photos fall back to
gradients — extraction, editing, filtering, and export all keep working.

## Use it on your phone — deploy to Vercel

The same `/api/extract` proxy is provided two ways: a Vite middleware for local
dev (`server/extractPlugin.js`) and a Vercel serverless function for production
(`api/extract.js`) — both share `server/prompt.js` and `server/auth.js`, so the
front-end is identical in both. To put it on your phone:

1. **Push to GitHub** (already done for this repo).
2. On [vercel.com](https://vercel.com), **Add New → Project → Import** your
   GitHub repo. Framework preset = **Vite** (build `npm run build`, output
   `dist`) — these are auto-detected.
3. In **Project → Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` — your key (**no** `VITE_` prefix).
   - `APP_PASSPHRASE` — a long random phrase. **Strongly recommended**: a public
     deploy without this lets anyone who finds the URL spend your API budget.
4. **Deploy.** Open the URL on your phone. The app asks for the passphrase once
   (then remembers it on that device).

**Install as an app (PWA):** in your phone browser, use **Add to Home Screen**.
You get a full-screen, app-like icon, and your saved itinerary is **viewable
offline** (e.g. on a plane). Extraction still needs a connection.

**Payload note:** Vercel caps request bodies at 4.5 MB, so the client renders
pages to JPEG and **chunks large PDFs** into batches automatically — nothing to
configure. (The local dev middleware has a 64 MB limit, so test very long PDFs
against a Vercel preview, not just `npm run dev`.)

> Prefer Cloudflare Pages or Netlify? Cloudflare allows larger bodies but has a
> 10 ms CPU limit on its free tier; Netlify's free tier caps function time at
> 10 s, which is too short for vision calls. Vercel's free tier (300 s
> functions) is the smoothest fit.

## Sync across devices (optional)

Click **Sync** in the header to keep your itinerary in sync across phone and
laptop. How it works:

- You **generate a private sync code** on one device and enter the same code on
  the others.
- Your data is **encrypted in the browser** with a key derived from that code
  (PBKDF2 → AES-GCM). The server only ever stores ciphertext it cannot read,
  addressed by a hash of the code. **Keep the code safe — it can't be recovered,
  and anyone with it can read your trip.**
- The app pulls on open / when you return to the tab, and pushes (debounced)
  after changes. Bookings merge by id (newest edit wins; deletes propagate via
  tombstones), so a stale device can't wipe newer data.

**One-time setup (free):** in the Vercel dashboard → **Storage → Create
Database → Upstash (Redis)** → choose **Free** and "let Vercel manage the
account" → connect it to the project. This injects `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. **Redeploy**, and sync is live. (Free tier: 500K
commands/month, 256 MB — far more than a personal trip needs.) For local-dev
sync, run `vercel env pull .env.local`.

### Or move a trip manually (no setup)

Use **Export backup** / **Import backup** in the footer to download or restore a
JSON file of all bookings **and** your traveler-merge settings. Import is
additive (it won't clobber existing data).

## Notes

- `npm audit` flags a high-severity advisory in `xlsx` (the SheetJS build
  published to npm). It was requested for this project; if it matters for your
  use, SheetJS recommends installing from their CDN tarball instead.
- Local `npm run dev` extraction uses the Vite middleware; the deployed app uses
  `api/extract.js`. The passphrase gate is **open** when `APP_PASSPHRASE` is
  unset (convenient for local dev) and **enforced** once you set it.
