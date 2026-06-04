// Cloud-sync orchestration: merge rules + encrypted pull/push transport.
// The envelope shape is { v, updatedAt, bookings, people, peopleUpdatedAt }.

import { encrypt, decrypt, bucketKeyFromCode } from './crypto.js';
import {
  getStoredPassphrase,
  clearStoredPassphrase,
  promptForPassphrase,
} from './passphrase.js';

const CODE_KEY = 'itinerary.synccode.v1';

export const getSyncCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) || '';
  } catch {
    return '';
  }
};
export const setSyncCode = (c) => {
  try {
    localStorage.setItem(CODE_KEY, c);
  } catch {
    /* ignore */
  }
};
export const clearSyncCode = () => {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
};

// Special error thrown when decryption fails (wrong code / tampered data).
export const WRONG_CODE = 'WRONG_SYNC_CODE';

// Tombstones older than this are garbage-collected (kept comfortably under the
// 180-day server TTL so deletes still propagate to any device that syncs in
// time, but old graves don't grow the payload forever).
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Per-id newest-wins merge (tombstones included), then GC of stale tombstones. */
export function mergeBookings(local = [], remote = []) {
  const byId = new Map();
  // remote first, then local — on equal updatedAt the local copy wins.
  for (const b of [...remote, ...local]) {
    if (!b || !b.id) continue;
    const prev = byId.get(b.id);
    if (!prev || (b.updatedAt || '') >= (prev.updatedAt || '')) byId.set(b.id, b);
  }
  const cutoff = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
  return [...byId.values()].filter((b) => !(b.deleted && (b.updatedAt || '') < cutoff));
}

/**
 * Merge the people registry by id (union — never drop a person that exists on
 * only one device). On id conflicts the newer registry's version wins. This
 * avoids the silent loss a whole-registry replace would cause.
 */
export function pickPeople(local, remote) {
  const lt = local.peopleUpdatedAt || '';
  const rt = remote.peopleUpdatedAt || '';
  const remoteNewer = rt > lt;
  const byId = new Map();
  const loser = remoteNewer ? local.people || [] : remote.people || [];
  const winner = remoteNewer ? remote.people || [] : local.people || [];
  for (const p of loser) if (p && p.id) byId.set(p.id, p);
  for (const p of winner) if (p && p.id) byId.set(p.id, p); // winner applied last
  return { people: [...byId.values()], peopleUpdatedAt: rt > lt ? rt : lt };
}

// ---- Transport ----

// Thrown when a 401 is hit during a NON-interactive (background) sync, so the
// caller can fail quietly instead of popping a prompt the user didn't trigger.
export const PASSPHRASE_REQUIRED = 'PASSPHRASE_REQUIRED';

async function syncFetch(path, options = {}, interactive = false) {
  const send = (pass) =>
    fetch(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(pass ? { 'x-app-passphrase': pass } : {}),
      },
    });

  let res = await send(getStoredPassphrase());
  if (res.status === 401) {
    if (!interactive) throw new Error(PASSPHRASE_REQUIRED);
    const entered = promptForPassphrase('Enter the app passphrase to sync your bookings:');
    if (!entered) throw new Error(PASSPHRASE_REQUIRED);
    res = await send(entered);
    if (res.status === 401) {
      clearStoredPassphrase();
      throw new Error('Wrong passphrase.');
    }
  }
  return res;
}

/** Fetch + decrypt the remote envelope, or null if nothing is stored yet. */
export async function pullRemote(code, interactive = false) {
  const bucket = await bucketKeyFromCode(code);
  const res = await syncFetch(`/api/sync?bucket=${bucket}`, { method: 'GET' }, interactive);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Sync pull failed (${res.status}).`);
  if (data.payload == null) return null;
  let json;
  try {
    json = await decrypt(data.payload, code);
  } catch {
    throw new Error(WRONG_CODE);
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(WRONG_CODE);
  }
}

/** Encrypt + store the envelope. */
export async function pushEnvelope(code, envelope, interactive = false) {
  const bucket = await bucketKeyFromCode(code);
  const payload = await encrypt(JSON.stringify(envelope), code);
  const res = await syncFetch(
    `/api/sync?bucket=${bucket}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) },
    interactive
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Sync push failed (${res.status}).`);
}
