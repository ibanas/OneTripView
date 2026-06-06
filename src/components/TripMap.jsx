import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { geocode, cleanPlace } from '../lib/geocode.js';
import { typeStyle, categoryHex } from '../lib/typeStyles.js';
import { googleMapsKey, loadGoogleMaps } from '../lib/googleMaps.js';
import { Spinner, MapIcon } from './icons.jsx';

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// ---- Leaflet (OpenStreetMap) fallback ----
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

function buildLeafletMap(container, data) {
  const map = L.map(container, { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 18,
  }).addTo(map);

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
  if (routeLatLngs.length > 1) {
    L.polyline(routeLatLngs, { color: '#2563eb', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(map);
  }
  if (allLatLngs.length > 1) map.fitBounds(L.latLngBounds(allLatLngs), { padding: [36, 36] });
  else map.setView(allLatLngs[0], 12);

  const t = setTimeout(() => map.invalidateSize(), 60);
  return () => {
    clearTimeout(t);
    map.remove();
  };
}

// ---- Google Maps ----
function buildGoogleMap(google, container, data) {
  const gm = google.maps;
  const map = new gm.Map(container, {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: 'cooperative',
  });
  const bounds = new gm.LatLngBounds();
  const info = new gm.InfoWindow();
  const markers = [];

  const seen = new Set();
  let n = 0;
  for (const p of data.route) {
    const k = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    n += 1;
    const pos = { lat: p.lat, lng: p.lon };
    const mk = new gm.Marker({
      position: pos,
      map,
      title: p.name,
      label: { text: String(n), color: '#fff', fontSize: '11px', fontWeight: '600' },
      icon: {
        path: gm.SymbolPath.CIRCLE,
        scale: 11,
        fillColor: typeStyle(p.type).hex,
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });
    const label = `${n}. ${p.name}`;
    mk.addListener('click', () => {
      info.setContent(`<b>${esc(label)}</b>`);
      info.open(map, mk);
    });
    markers.push(mk);
    bounds.extend(pos);
  }

  for (const p of data.places) {
    const pos = { lat: p.lat, lng: p.lon };
    const mk = new gm.Marker({
      position: pos,
      map,
      title: p.name,
      icon: {
        path: gm.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: categoryHex(p.category),
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });
    const addr = p.address ? `<br><span style="color:#64748b">${esc(p.address)}</span>` : '';
    const link = p.url
      ? `<br><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
      : '';
    mk.addListener('click', () => {
      info.setContent(`<b>${esc(p.name)}</b>${addr}${link}`);
      info.open(map, mk);
    });
    markers.push(mk);
    bounds.extend(pos);
  }

  const routeLatLngs = data.route.map((p) => ({ lat: p.lat, lng: p.lon }));
  if (routeLatLngs.length > 1) {
    new gm.Polyline({
      path: routeLatLngs,
      map,
      strokeColor: '#2563eb',
      strokeOpacity: 0, // dashed via repeated icons
      icons: [
        {
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeWeight: 3, scale: 2 },
          offset: '0',
          repeat: '14px',
        },
      ],
    });
  }

  const count = data.route.length + data.places.length;
  if (count > 1) map.fitBounds(bounds, 36);
  else if (count === 1) {
    map.setCenter(bounds.getCenter());
    map.setZoom(13);
  }

  return () => {
    markers.forEach((m) => m.setMap(null));
    info.close();
    try {
      container.innerHTML = '';
    } catch {
      /* ignore */
    }
  };
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

  // 1) Geocode route stops + places (cached; exact coords skip the network).
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

  // 2) Build the map: Google Maps when a key is set, else the OSM fallback.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current) return undefined;
    const container = containerRef.current;
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      if (googleMapsKey()) {
        try {
          const google = await loadGoogleMaps();
          if (cancelled || !container.isConnected) return;
          cleanup = buildGoogleMap(google, container, data);
          return;
        } catch (err) {
          // Don't fail silently — surface WHY we fell back so a misconfigured
          // key (API not enabled / referrer blocked / billing off / blocked
          // network) is diagnosable instead of looking like "Google didn't work".
          console.warn(
            '[TripMap] Google Maps failed to load — falling back to OpenStreetMap. Reason:',
            err
          );
        }
      }
      if (cancelled || !container.isConnected) return;
      cleanup = buildLeafletMap(container, data);
    })();

    return () => {
      cancelled = true;
      cleanup();
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
