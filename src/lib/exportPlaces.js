// Export the trip's "places to check" for import into Google My Maps
// (mymaps.google.com) — which then appears in the Google Maps app under
// Saved -> Maps. NOTE: the Google Maps app's own "saved lists" (Favorites /
// Want to go / custom lists) have no public bulk-import; My Maps is the supported
// path, so that's what these files target.
//
// KML carries exact pins (best for places we already resolved). CSV is handy
// because My Maps can geocode an address/lat-lng column, so pin-less places still
// land. We emit both kinds; the UI offers each.

import { CATEGORY_LABELS } from './bookings.js';

function xmlEscape(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

// CDATA must not contain the literal ']]>' — split it if it appears.
function cdata(s) {
  return `<![CDATA[${String(s == null ? '' : s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function descriptionHtml(p) {
  const lines = [];
  if (p.address) lines.push(xmlEscape(p.address));
  const cat = CATEGORY_LABELS[p.category] || p.category;
  if (cat) lines.push(xmlEscape(cat));
  if (typeof p.rating === 'number') lines.push(`Rating: ${p.rating.toFixed(1)} / 5`);
  if (p.website) lines.push(`<a href="${xmlEscape(p.website)}">Website</a>`);
  if (p.url) lines.push(`<a href="${xmlEscape(p.url)}">Open in Maps</a>`);
  if (p.notes) lines.push(xmlEscape(p.notes));
  return lines.join('<br>');
}

/** Build a KML document string for the given places. */
export function placesToKml(places, title) {
  const placemarks = places
    .map((p) => {
      const name = xmlEscape(p.title || 'Untitled place');
      const desc = cdata(descriptionHtml(p));
      const hasCoords = Number.isFinite(p.lat) && Number.isFinite(p.lng);
      // Exact pin when we have coords; otherwise an <address> Google geocodes.
      const place = hasCoords
        ? `<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>`
        : p.address || p.location
          ? `<address>${xmlEscape(p.address || p.location)}</address>`
          : '';
      return `    <Placemark>
      <name>${name}</name>
      <description>${desc}</description>
      ${place}
    </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xmlEscape(title || 'OneTripView places')}</name>
${placemarks}
  </Document>
</kml>
`;
}

/** Build a CSV string My Maps can import (plots by lat/lng, else by Address). */
export function placesToCsv(places) {
  const header = [
    'Name',
    'Address',
    'City',
    'Category',
    'Latitude',
    'Longitude',
    'Google Maps URL',
    'Notes',
  ];
  const rows = places.map((p) => [
    p.title || '',
    p.address || '',
    p.location || '',
    CATEGORY_LABELS[p.category] || p.category || '',
    Number.isFinite(p.lat) ? p.lat : '',
    Number.isFinite(p.lng) ? p.lng : '',
    p.url || '',
    p.notes || '',
  ]);
  const esc = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Lead with a BOM so Excel/Sheets read UTF-8 correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

function slug(name) {
  return (
    String(name || 'onetripview')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'onetripview'
  );
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadPlacesKml(places, tripName) {
  download(
    `${slug(tripName)}-places.kml`,
    placesToKml(places, `${tripName || 'OneTripView'} — places`),
    'application/vnd.google-earth.kml+xml'
  );
}

export function downloadPlacesCsv(places, tripName) {
  download(`${slug(tripName)}-places.csv`, placesToCsv(places), 'text/csv;charset=utf-8');
}
