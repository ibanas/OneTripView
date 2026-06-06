import { useEffect, useRef } from 'react';
import { loadPlaces, placesAvailable } from '../lib/googleMaps.js';
import { categoryFromTypes, localityFrom } from '../lib/googlePlaces.js';

/**
 * Google Places "search-and-pick" box. Renders Google's current
 * `PlaceAutocompleteElement` (the legacy Autocomplete is retired for new keys)
 * and, on selection, fetches only core + Pro-tier fields (cheap) before calling:
 *   onPick({ title, address, city, lat, lng, url, category, placeId })
 * Renders nothing when no Maps key is configured.
 */
export default function PlaceAutocomplete({ onPick }) {
  const hostRef = useRef(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!placesAvailable()) return undefined;
    let el = null;
    let handler = null;
    let cancelled = false;

    (async () => {
      let PlaceAutocompleteElement;
      try {
        ({ PlaceAutocompleteElement } = await loadPlaces());
      } catch {
        return; // SDK failed to load — the paste-a-link field still works
      }
      if (cancelled || !hostRef.current) return;

      el = new PlaceAutocompleteElement();
      el.style.width = '100%';

      handler = async (event) => {
        const prediction = event.placePrediction;
        if (!prediction) return;
        try {
          const place = prediction.toPlace();
          await place.fetchFields({
            fields: [
              'displayName',
              'formattedAddress',
              'addressComponents',
              'location',
              'types',
              'googleMapsURI',
            ],
          });
          const loc = place.location;
          onPickRef.current?.({
            title: place.displayName || '',
            address: place.formattedAddress || '',
            city: localityFrom(place.addressComponents),
            lat: loc ? loc.lat() : null,
            lng: loc ? loc.lng() : null,
            url: place.googleMapsURI || '',
            category: categoryFromTypes(place.types),
            placeId: place.id || null,
          });
        } catch {
          /* a fetch failure shouldn't break the form */
        }
      };

      el.addEventListener('gmp-select', handler);
      hostRef.current.appendChild(el);
    })();

    return () => {
      cancelled = true;
      if (el && handler) el.removeEventListener('gmp-select', handler);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
    };
  }, []);

  if (!placesAvailable()) return null;
  return <div ref={hostRef} className="w-full" />;
}
