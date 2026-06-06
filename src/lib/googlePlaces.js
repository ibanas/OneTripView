// Google Places (New) helpers — all client-side under the Maps JS key.
//
// Cost note (March-2025 pricing, billed at the highest field tier touched):
//   - core fields (formattedAddress/location/types) = Essentials
//   - displayName/googleMapsURI = Pro
//   - rating/regularOpeningHours/websiteURI + fetching a photo = Enterprise
// So the add-a-place pick (PlaceAutocomplete) requests only core+Pro fields, and
// the rich details below are fetched lazily (on demand) and then PERSISTED into
// the booking + synced, so they're fetched at most once per place, ever.

import { loadPlaces, placesAvailable } from './googleMaps.js';

// Re-exported for convenience so place helpers + the components that use them can
// import availability from one module.
export { placesAvailable };

// Map Google place "types" to one of our PLACE_CATEGORIES. First match wins.
const TYPE_TO_CATEGORY = [
  [['cafe', 'bakery', 'bar', 'coffee_shop', 'pub', 'wine_bar'], 'cafe'],
  [
    ['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'fast_food_restaurant'],
    'restaurant',
  ],
  [
    [
      'tourist_attraction', 'museum', 'art_gallery', 'park', 'national_park', 'zoo', 'aquarium',
      'church', 'mosque', 'synagogue', 'hindu_temple', 'place_of_worship', 'landmark',
      'historical_landmark', 'monument', 'natural_feature', 'beach', 'garden', 'observation_deck',
    ],
    'sight',
  ],
  [
    [
      'stadium', 'arena', 'performing_arts_theater', 'movie_theater', 'concert_hall', 'night_club',
      'amusement_park', 'event_venue', 'casino', 'bowling_alley',
    ],
    'event',
  ],
  [
    ['store', 'shopping_mall', 'clothing_store', 'department_store', 'supermarket', 'market', 'book_store'],
    'shop',
  ],
];

/** Pull the best "city" from a Google place's address components. */
export function localityFrom(components) {
  const comps = Array.isArray(components) ? components : [];
  const pick = (type) => comps.find((c) => (c.types || []).includes(type));
  const c =
    pick('locality') ||
    pick('postal_town') ||
    pick('administrative_area_level_2') ||
    pick('administrative_area_level_1');
  return c ? c.longText || c.long_name || '' : '';
}

/** Best-guess our category from a Google place's `types` array. */
export function categoryFromTypes(types) {
  const set = new Set(Array.isArray(types) ? types : []);
  for (const [keys, category] of TYPE_TO_CATEGORY) {
    if (keys.some((k) => set.has(k))) return category;
    // also catch suffix conventions like "*_store" / "*_restaurant"
    for (const t of set) {
      if (keys.some((k) => t === k || t.endsWith(`_${k}`))) return category;
    }
  }
  return 'other';
}

function photoFrom(place, maxWidth) {
  const photo = place.photos && place.photos[0];
  if (!photo) return { image: null, imageAttribution: null };
  let image;
  try {
    image = photo.getURI({ maxWidth });
  } catch {
    image = null;
  }
  const attribution = photo.authorAttributions && photo.authorAttributions[0];
  return { image, imageAttribution: attribution?.displayName || null };
}

/**
 * Fetch rich details for a place id (Enterprise tier — call lazily). Returns a
 * patch to merge into the booking: { rating, hours, website, image,
 * imageAttribution } (any field may be null). Deliberately does NOT return `url`
 * — that's a user-editable field already captured at add-time, and the venue
 * website is surfaced separately via `website`. Throws if Places is unavailable
 * or the request fails — callers should catch and degrade.
 */
export async function fetchPlaceDetails(placeId) {
  const { Place } = await loadPlaces();
  const place = new Place({ id: placeId });
  await place.fetchFields({
    fields: ['rating', 'regularOpeningHours', 'websiteURI', 'photos'],
  });
  const { image, imageAttribution } = photoFrom(place, 800);
  return {
    rating: typeof place.rating === 'number' ? place.rating : null,
    hours: place.regularOpeningHours?.weekdayDescriptions || null,
    website: place.websiteURI || null,
    image,
    imageAttribution,
  };
}

/**
 * Resolve a free-text query (e.g. a place name + address from a pasted Google
 * Maps link) to a precise Google place. Returns { title, address, city, lat,
 * lng, category, placeId } or null. Pro tier (no photo) — used to turn pasted
 * links into full places with an exact pin + placeId (which then unlocks the
 * lazy rating/hours/photo). Throws if Places is unavailable.
 */
export async function findPlaceByText(query) {
  if (!query) return null;
  const { Place } = await loadPlaces();
  const { places } = await Place.searchByText({
    textQuery: query,
    fields: ['location', 'formattedAddress', 'addressComponents', 'displayName', 'types'],
    maxResultCount: 1,
  });
  const p = places && places[0];
  if (!p || !p.location) return null;
  return {
    title: p.displayName || null,
    address: p.formattedAddress || null,
    city: localityFrom(p.addressComponents),
    lat: p.location.lat(),
    lng: p.location.lng(),
    category: categoryFromTypes(p.types),
    placeId: p.id || null,
  };
}

/**
 * Find a representative photo for a city/region by text search. Returns
 * { src, attribution, title } or null. Enterprise tier (a photo fetch) — used
 * by the hero, then cached in localStorage by photos.js.
 */
export async function searchCityPhoto(city) {
  if (!city) return null;
  const { Place } = await loadPlaces();
  const { places } = await Place.searchByText({
    textQuery: city,
    fields: ['photos', 'displayName'],
    maxResultCount: 1,
  });
  const place = places && places[0];
  if (!place) return null;
  const { image, imageAttribution } = photoFrom(place, 1200);
  if (!image) return null;
  return { src: image, attribution: imageAttribution, title: place.displayName || city };
}
