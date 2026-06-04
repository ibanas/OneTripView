// Client-side handling of the optional app passphrase. Stored in localStorage so
// it's entered at most once. We never prompt up front — only when the server
// answers 401 (i.e. a gate is actually configured).

const KEY = 'itinerary.passphrase.v1';

export function getStoredPassphrase() {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPassphrase(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

export function clearStoredPassphrase() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Ask the user for the passphrase and store it. Returns '' if cancelled. */
export function promptForPassphrase(message) {
  if (typeof window === 'undefined' || !window.prompt) return '';
  const v = window.prompt(message || 'Enter the app passphrase to extract bookings:');
  if (v == null) return '';
  const trimmed = v.trim();
  setStoredPassphrase(trimmed);
  return trimmed;
}
