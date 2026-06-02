import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocode, cleanPlace } from '../lib/geocode.js';
import { typeStyle } from '../lib/typeStyles.js';
import { Spinner, MapIcon } from './icons.jsx';

// Colored teardrop pin as a divIcon — no PNG assets, so it sidesteps the
// classic Leaflet-with-bundlers broken-marker-icon problem entirely.
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
      <span style="transform:rotate(45deg)">${label}</span></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
    popupAnchor: [0, -22],
  });
}

export default function TripMap({ stops }) {
  // Stable key so we only re-geocode when the set of places actually changes.
  const stopsKey = useMemo(
    () => stops.map((s) => `${cleanPlace(s.place).toLowerCase()}|${s.type}`).join('>'),
    [stops]
  );

  const [status, setStatus] = useState('loading'); // loading | ready | empty | error
  const [points, setPoints] = useState([]); // ordered [{ lat, lon, name, type, label }]
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  // 1) Geocode all stops (cached), preserving chronological order.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      // Resolve with bounded concurrency (preserves order; cap keeps us gentle
      // to the Nominatim fallback's ~1 req/s policy if Open-Meteo is erroring).
      const CONCURRENCY = 4;
      const results = new Array(stops.length);
      let next = 0;
      const worker = async () => {
        while (next < stops.length) {
          const i = next++;
          results[i] = await geocode(stops[i].place);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, stops.length) }, worker)
      );
      if (!alive) return;
      const resolved = results
        .map((c, i) =>
          c && {
            lat: c.lat,
            lon: c.lon,
            name: c.name || cleanPlace(stops[i].place),
            type: stops[i].type,
          }
        )
        .filter(Boolean);
      setPoints(resolved);
      setStatus(resolved.length ? 'ready' : 'error');
    })();
    return () => {
      alive = false;
    };
  }, [stopsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Build / rebuild the Leaflet map once points are resolved.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18,
    }).addTo(map);

    // Markers — dedupe by coordinate so a city visited twice gets one pin.
    const seen = new Set();
    let n = 0;
    for (const p of points) {
      const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      n += 1;
      L.marker([p.lat, p.lon], { icon: pinIcon(p.type, String(n)) })
        .addTo(map)
        .bindPopup(`<b>${n}. ${p.name}</b>`);
    }

    const latlngs = points.map((p) => [p.lat, p.lon]);
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(map);
      map.fitBounds(L.latLngBounds(latlngs), { padding: [36, 36] });
    } else {
      map.setView(latlngs[0], 11);
    }

    // Container may have just appeared — make sure tiles fill it.
    const t = setTimeout(() => map.invalidateSize(), 60);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [status, points]);

  if (stops.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-slate-100">
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-ink">
        <MapIcon className="h-4 w-4 text-sky-600" />
        Trip map
        {status === 'ready' && (
          <span className="font-normal text-slate-400">· {points.length} stops</span>
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
