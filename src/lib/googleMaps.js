// Loads the Google Maps JS SDK on demand. The key is a CLIENT key (Maps JS runs
// in the browser) supplied via VITE_GOOGLE_MAPS_API_KEY — protect it by
// restricting it to your domain(s) and to the Maps JavaScript API + Places API
// (New) + Geocoding API in Google Cloud Console. When no key is set, the app
// falls back to the free OpenStreetMap map + Open-Meteo geocoding + Wikipedia
// photos, so it keeps working with no key and offline.

export function googleMapsKey() {
  const k = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return k && String(k).trim() ? String(k).trim() : null;
}

/** Whether Google Maps/Places features are available (a key is configured). */
export const placesAvailable = () => !!googleMapsKey();

let loaderModulePromise = null;
const libCache = {};

// Load @googlemaps/js-api-loader (v2 functional API: setOptions + importLibrary;
// the old `Loader` class was removed) and call setOptions ONCE. Imported
// DYNAMICALLY so this module has no top-level browser (`window`) dependency — it
// stays safe to import in Node (server code, tests) and only pulls the SDK in the
// browser when a feature actually runs. Returns the module, or null without a key.
function loaderModule() {
  const apiKey = googleMapsKey();
  if (!apiKey) return Promise.resolve(null);
  if (!loaderModulePromise) {
    loaderModulePromise = import('@googlemaps/js-api-loader')
      .then((mod) => {
        mod.setOptions({ key: apiKey, v: 'weekly' });
        return mod;
      })
      .catch((err) => {
        loaderModulePromise = null; // allow a later retry
        throw err;
      });
  }
  return loaderModulePromise;
}

/**
 * Lazily import a Maps JS library ('maps' | 'marker' | 'places' | 'geocoding')
 * and memoize it. Importing a library just loads JS — it never bills; only the
 * actual API calls (a map load, a geocode, a Places request) are billed.
 * Rejects when no key is configured.
 */
export function importGoogleLib(name) {
  if (!libCache[name]) {
    libCache[name] = (async () => {
      const mod = await loaderModule();
      if (!mod) throw new Error('Google Maps key not configured');
      return mod.importLibrary(name);
    })().catch((err) => {
      delete libCache[name]; // allow a later retry
      throw err;
    });
  }
  return libCache[name];
}

/** Resolve to the `google` global with the map libraries loaded (for TripMap). */
export async function loadGoogleMaps() {
  await Promise.all([importGoogleLib('maps'), importGoogleLib('marker')]);
  return window.google;
}

/** The Places library namespace ({ Place, PlaceAutocompleteElement, … }). */
export const loadPlaces = () => importGoogleLib('places');

/** The Geocoding library namespace ({ Geocoder }). */
export const loadGeocoding = () => importGoogleLib('geocoding');
