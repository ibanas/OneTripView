// Loads the Google Maps JS SDK on demand. The key is a CLIENT key (Maps JS runs
// in the browser) supplied via VITE_GOOGLE_MAPS_API_KEY — protect it by
// restricting it to your domain(s) + the Maps JavaScript API in Google Cloud
// Console. When no key is set, the app falls back to the OpenStreetMap map.

import { Loader } from '@googlemaps/js-api-loader';

export function googleMapsKey() {
  const k = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return k && String(k).trim() ? String(k).trim() : null;
}

let loaderPromise = null;

/** Resolve to the `google` global with maps+marker libraries loaded, or reject. */
export function loadGoogleMaps() {
  const apiKey = googleMapsKey();
  if (!apiKey) return Promise.reject(new Error('Google Maps key not configured'));
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const loader = new Loader({ apiKey, version: 'weekly' });
      await loader.importLibrary('maps');
      await loader.importLibrary('marker');
      return window.google;
    })().catch((err) => {
      loaderPromise = null; // allow a later retry
      throw err;
    });
  }
  return loaderPromise;
}
