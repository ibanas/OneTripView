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

## Notes

- `npm audit` flags a high-severity advisory in `xlsx` (the SheetJS build
  published to npm). It was requested for this project; if it matters for your
  use, SheetJS recommends installing from their CDN tarball instead.
- Extraction requires the dev server (for the `/api/extract` middleware).
  `npm run build` / `npm run preview` produce the static front-end but do not
  include the extraction proxy.
