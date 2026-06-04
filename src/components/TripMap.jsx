import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocode, cleanPlace } from '../lib/geocode.js';
import { typeStyle, categoryHex } from '../lib/typeStyles.js';
import { Spinner, MapIcon } from './icons.jsx';

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// Numbered teardrop for route stops (flights/stays).
function pinIcon(type, label) {
  const color = typeStyle(type).hex;
  return L.divIcon({
    className: 'trip-pin',
    html: `<span style="
      display:flex;align-items:center;justify-content:center;
      width:26px;height:26px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);background:${color};
      border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);
      color:#fff;font:600 11px/1 ui-sans-serif,system-ui;">
      <span style="transform:rotate(45deg)">${esc(label)}</span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
    popupAnchor: [0, -22],
  });
}

// Small round dot for places — visually distinct from route teardrops.
function placeIcon(category) {
  const color = categoryHex(category);
  return L.divIcon({
    className: 'place-pin',
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;
      background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function TripMap({ stops, places = [] }) {
  const stopsKey = useMemo(
    () => stops.map((s) => `${cleanPlace(s.place).toLowerCase()}|${s.type}`).join('>'),
    [stops]
  );
  const placesKey = useMemo(
    () =>
      places
        .map(
          (p) =>
            `${p.id}|${p.lat ?? ''}|${p.lng ?? ''}|${cleanPlace(p.location).toLowerCase()}|${p.category}|${p.title}|${p.url || ''}|${p.address || ''}`
        )
        .join('>'),
    [places]
  );

  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [data, setData] = useState({ route: [], places: [] });
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // 1) Geocode route stops (ordered) + places (use exact coords when present).
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      const CONCURRENCY = 4;
      const route = new Array(stops.length);
      let next = 0;
      const worker = async () => {
        while (next < stops.length) {
          const i = next++;
          route[i] = await geocode(stops[i].place);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stops.length) }, worker));

      const placePts = [];
      for (const p of places) {
        let lat = p.lat;
        let lon = p.lng;
        if (lat == null || lon == null) {
          const c = p.location ? await geocode(p.location) : null;
          if (c) {
            lat = c.lat;
            lon = c.lon;
          }
        }
        if (lat != null && lon != null) {
          placePts.push({ lat, lon, name: p.title, category: p.category, url: p.url, address: p.address });
        }
      }

      if (!alive) return;
      const routePts = route
        .map((c, i) =>
          c && { lat: c.lat, lon: c.lon, name: c.name || cleanPlace(stops[i].place), type: stops[i].type }
        )
        .filter(Boolean);
      setData({ route: routePts, places: placePts });
      setStatus(routePts.length + placePts.length ? 'ready' : 'error');
    })();
    return () => {
      alive = false;
    };
  }, [stopsKey, placesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Build / rebuild the Leaflet map once points are resolved.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    // Route markers (numbered), deduped by coordinate.
    const seen = new Set();
    let n = 0;
    for (const p of data.route) {
      const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      n += 1;
      L.marker([p.lat, p.lon], { icon: pinIcon(p.type, String(n)) })
        .addTo(map)
        .bindPopup(`<b>${n}. ${esc(p.name)}</b>`);
    }

    // Place markers (round, category-colored).
    for (const p of data.places) {
      const addr = p.address ? `<br><span style="color:#64748b">${esc(p.address)}</span>` : '';
      const link = p.url
        ? `<br><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
        : '';
      L.marker([p.lat, p.lon], { icon: placeIcon(p.category) })
        .addTo(map)
        .bindPopup(`<b>${esc(p.name)}</b>${addr}${link}`);
    }

    const routeLatLngs = data.route.map((p) => [p.lat, p.lon]);
    const allLatLngs = [...routeLatLngs, ...data.places.map((p) => [p.lat, p.lon])];
    // Draw the journey line through route stops only (not places).
    if (routeLatLngs.length > 1) {
      L.polyline(routeLatLngs, { color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(map);
    }
    if (allLatLngs.length > 1) {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [36, 36] });
    } else {
      map.setView(allLatLngs[0], 12);
    }

    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [status, data]);

  if (stops.length === 0 && places.length === 0) return null;

  const stopCount = data.route.length;
  const placeCount = data.places.length;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink">
        <MapIcon className="h-4 w-4 text-sky-600" />
        Trip map
        {status === 'ready' && (
          <span className="font-normal text-slate-400">
            · {stopCount} stop{stopCount === 1 ? '' : 's'}
            {placeCount > 0 && ` · ${placeCount} place${placeCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>

      {status === 'loading' && (
        <div className="flex h-64 items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500">
          <Spinner className="h-5 w-5 text-sky-500" /> Locating your stops…
        </div>
      )}

      {status === 'error' && (
        <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-slate-500">
          Couldn&apos;t place these locations on the map (you may be offline). The rest of your
          itinerary still works.
        </div>
      )}

      <div
        ref={containerRef}
        className="h-72 w-full"
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
    </section>
  );
}
