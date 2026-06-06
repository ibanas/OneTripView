import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DropZone from './components/DropZone.jsx';
import EmptyState from './components/EmptyState.jsx';
import ProcessingQueue from './components/ProcessingQueue.jsx';
import Hero from './components/Hero.jsx';
import TripMap from './components/TripMap.jsx';
import Timeline from './components/Timeline.jsx';
import ManagePeople from './components/ManagePeople.jsx';
import SyncModal from './components/SyncModal.jsx';
import PlacesToCheck from './components/PlacesToCheck.jsx';
import AddPlaceModal from './components/AddPlaceModal.jsx';
import TripsHome from './components/TripsHome.jsx';
import NewTripModal from './components/NewTripModal.jsx';
import {
  PlusIcon,
  PinIcon,
  SheetIcon,
  DocIcon,
  CloudIcon,
  CloudCheckIcon,
  Spinner,
  ChevronLeftIcon,
} from './components/icons.jsx';
import {
  loadBookings,
  saveBookings,
  loadPeople,
  savePeople,
  loadPeopleTs,
  savePeopleTs,
  loadTrips,
  saveTrips,
  loadTripsTs,
  saveTripsTs,
  loadActiveTripId,
  saveActiveTripId,
} from './lib/storage.js';
import {
  emptyBooking,
  normalizeBooking,
  summarize,
  routeCities,
  primaryDestination,
  tripStops,
  DEFAULT_TRIP_ID,
} from './lib/bookings.js';
import {
  newTrip,
  normalizeTrip,
  reconcileTrips,
  tripsWithDerived,
  sortTrips,
} from './lib/trips.js';
import { buildResolver, bookingHasPerson } from './lib/people.js';
import { extractBookingsFromPdf } from './lib/extract.js';
import { exportToExcel } from './lib/exportExcel.js';
import { exportToPdf } from './lib/exportPdf.js';
import { exportBackup, readBackup } from './lib/backup.js';
import { cryptoAvailable } from './lib/crypto.js';
import {
  getSyncCode,
  setSyncCode as persistSyncCode,
  clearSyncCode,
  mergeBookings,
  mergeTrips,
  pickPeople,
  pullRemote,
  pushEnvelope,
  WRONG_CODE,
  PASSPHRASE_REQUIRED,
} from './lib/sync.js';

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `j_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const nowIso = () => new Date().toISOString();

export default function App() {
  const [bookings, setBookings] = useState(loadBookings); // includes delete tombstones
  const [people, setPeople] = useState(loadPeople); // name-alias registry
  const [peopleTs, setPeopleTs] = useState(loadPeopleTs); // registry change time
  const [jobs, setJobs] = useState([]);
  const [activePerson, setActivePerson] = useState(null);
  const [showManage, setShowManage] = useState(false);
  const [addPlace, setAddPlace] = useState(null); // null = closed; { city } = open
  const [view, setView] = useState('itinerary'); // 'itinerary' | 'places'

  // Trips
  const [trips, setTrips] = useState(loadTrips);
  const [tripsTs, setTripsTs] = useState(loadTripsTs);
  const [activeTripId, setActiveTripId] = useState(loadActiveTripId); // null = Trips home
  const [editTrip, setEditTrip] = useState(null); // null | 'new' | { id, name } (rename)

  // Sync
  const [syncCode, setSyncCodeState] = useState(getSyncCode);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | error
  const [syncError, setSyncError] = useState(null);
  const [showSync, setShowSync] = useState(false);

  // Persist.
  useEffect(() => saveBookings(bookings), [bookings]);
  useEffect(() => savePeople(people), [people]);
  useEffect(() => savePeopleTs(peopleTs), [peopleTs]);
  useEffect(() => saveTrips(trips), [trips]);
  useEffect(() => saveTripsTs(tripsTs), [tripsTs]);
  useEffect(() => saveActiveTripId(activeTripId), [activeTripId]);

  // The UI only ever sees non-deleted bookings; tombstones live in `bookings`
  // for persistence + sync.
  const liveBookings = useMemo(() => bookings.filter((b) => !b.deleted), [bookings]);
  const resolver = useMemo(() => buildResolver(people), [people]);

  // Migrate legacy data + reconcile orphans (idempotent, sync-safe). Re-homes any
  // live booking whose trip is missing/deleted and (re)creates the default trip.
  useEffect(() => {
    const r = reconcileTrips(trips, bookings, resolver);
    if (r.trips !== trips) setTrips(r.trips);
    if (r.bookings !== bookings) setBookings(r.bookings);
  }, [trips, bookings, resolver]);

  // Everything below is scoped to the ACTIVE trip.
  const activeBookings = useMemo(
    () => liveBookings.filter((b) => (b.tripId || DEFAULT_TRIP_ID) === activeTripId),
    [liveBookings, activeTripId]
  );

  const summary = useMemo(() => summarize(activeBookings, resolver), [activeBookings, resolver]);
  const cities = useMemo(() => routeCities(activeBookings), [activeBookings]);
  const destination = useMemo(() => primaryDestination(activeBookings), [activeBookings]);
  const stops = useMemo(() => tripStops(activeBookings), [activeBookings]);

  const visibleBookings = useMemo(() => {
    if (!activePerson) return activeBookings;
    return activeBookings.filter((b) => bookingHasPerson(b, activePerson, resolver));
  }, [activeBookings, activePerson, resolver]);

  // Timeline shows person-filtered real bookings + all SCHEDULED places. Places
  // are person-agnostic, so they bypass the traveler filter (otherwise a
  // scheduled place would silently vanish when you filter by a person).
  const timelineBookings = useMemo(
    () => [
      ...visibleBookings.filter((b) => b.type !== 'place'),
      ...activeBookings.filter((b) => b.type === 'place' && b.startDate),
    ],
    [visibleBookings, activeBookings]
  );
  // All places (dated or not) in this trip live on the Places tab + map pins.
  const placePins = useMemo(
    () => activeBookings.filter((b) => b.type === 'place'),
    [activeBookings]
  );
  const cityNames = useMemo(() => {
    const set = new Set(cities.map((c) => c.name).filter(Boolean));
    for (const p of placePins) if (p.location) set.add(p.location);
    return [...set];
  }, [cities, placePins]);

  // Trip cards for the home screen (derived per trip from ALL bookings).
  const tripCards = useMemo(
    () => sortTrips(tripsWithDerived(trips, bookings, resolver)),
    [trips, bookings, resolver]
  );
  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId && !t.deleted) || null,
    [trips, activeTripId]
  );

  useEffect(() => {
    if (activePerson && !summary.people.some((p) => p.key === activePerson)) {
      setActivePerson(null);
    }
  }, [activePerson, summary.people]);

  // If the active trip vanished (deleted, incl. via sync), return to the home.
  useEffect(() => {
    if (activeTripId && !trips.some((t) => t.id === activeTripId && !t.deleted)) {
      setActiveTripId(null);
    }
  }, [activeTripId, trips]);

  // ---- Sync engine ----
  const stateRef = useRef({});
  stateRef.current = { bookings, people, peopleTs, trips, tripsTs };
  const syncingRef = useRef(false);
  const rerunRef = useRef(false);
  const pushTimer = useRef(null);

  const doFullSync = useCallback(async (interactive = false) => {
    const code = getSyncCode();
    if (!code || !cryptoAvailable()) return;
    if (syncingRef.current) {
      rerunRef.current = true; // coalesce — run once more after the current pass
      return;
    }
    syncingRef.current = true;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const remote = await pullRemote(code, interactive);
      const cur = stateRef.current;
      // Always run the merge (with [] when there's no remote) so tombstone GC
      // and de-duplication apply even on the first push. Re-normalize so a
      // synced record passes the same sanitizers (e.g. url http/https-only) as
      // every other ingress path.
      let mergedBookings = mergeBookings(cur.bookings, remote ? remote.bookings || [] : []).map(
        normalizeBooking
      );
      const picked = remote
        ? pickPeople({ people: cur.people, peopleUpdatedAt: cur.peopleTs }, remote)
        : { people: cur.people, peopleUpdatedAt: cur.peopleTs };
      // Merge trips (per-id), then reconcile: re-home any orphaned live booking
      // and (re)create the default trip so nothing is left invisible.
      const mergedResolver = buildResolver(picked.people);
      let mergedTrips = mergeTrips(cur.trips, remote ? remote.trips || [] : []).map(normalizeTrip);
      const reconciled = reconcileTrips(mergedTrips, mergedBookings, mergedResolver);
      mergedTrips = reconciled.trips;
      mergedBookings = reconciled.bookings;
      const tripsTsNext =
        remote && (remote.tripsUpdatedAt || '') > (cur.tripsTs || '')
          ? remote.tripsUpdatedAt
          : cur.tripsTs;

      if (JSON.stringify(mergedBookings) !== JSON.stringify(cur.bookings)) {
        setBookings(mergedBookings);
      }
      if (
        picked.peopleUpdatedAt !== cur.peopleTs ||
        JSON.stringify(picked.people) !== JSON.stringify(cur.people)
      ) {
        setPeople(picked.people);
        setPeopleTs(picked.peopleUpdatedAt);
      }
      if (JSON.stringify(mergedTrips) !== JSON.stringify(cur.trips)) {
        setTrips(mergedTrips);
        setTripsTs(tripsTsNext || nowIso());
      }

      await pushEnvelope(
        code,
        {
          v: 2,
          updatedAt: nowIso(),
          bookings: mergedBookings,
          people: picked.people,
          peopleUpdatedAt: picked.peopleUpdatedAt,
          trips: mergedTrips,
          tripsUpdatedAt: tripsTsNext || nowIso(),
        },
        interactive
      );
      setSyncStatus('synced');
    } catch (e) {
      if (e.message === PASSPHRASE_REQUIRED) {
        setSyncError('Passphrase required — open Sync to enter it.');
      } else if (e.message === WRONG_CODE) {
        setSyncError('That sync code doesn’t match the data already in the cloud.');
      } else {
        setSyncError(e.message || 'Sync failed.');
      }
      setSyncStatus('error');
    } finally {
      syncingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        setTimeout(() => doFullSync(false), 50);
      }
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (!getSyncCode()) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => doFullSync(false), 2500);
  }, [doFullSync]);

  // Pull on mount + when returning to the tab (background — never prompts).
  useEffect(() => {
    if (!syncCode) return;
    doFullSync(false);
    const onFocus = () => doFullSync(false);
    const onVis = () => !document.hidden && doFullSync(false);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [syncCode, doFullSync]);

  const useSyncCode = (code) => {
    persistSyncCode(code);
    setSyncCodeState(code);
    setSyncStatus('syncing');
    setSyncError(null);
    doFullSync(true); // user-initiated → may prompt for the passphrase if gated
  };
  const stopSync = () => {
    clearSyncCode();
    setSyncCodeState('');
    setSyncStatus('idle');
    setSyncError(null);
  };

  // ---- Extraction job lifecycle ----
  const runJob = async (jobId, file) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'loading', error: null } : j))
    );
    try {
      const extracted = await extractBookingsFromPdf(file);
      if (extracted.length === 0) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  status: 'error',
                  error: 'No bookings found in this PDF. Retry or add one manually.',
                }
              : j
          )
        );
        return;
      }
      setBookings((prev) => [...prev, ...extracted.map((b) => ({ ...b, tripId: activeTripId }))]);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      schedulePush();
    } catch (err) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: 'error', error: err.message || 'Extraction failed.' }
            : j
        )
      );
    }
  };

  const handleFiles = (files) => {
    const newJobs = files.map((file) => ({
      id: newId(),
      fileName: file.name,
      status: 'loading',
      error: null,
      file,
    }));
    setJobs((prev) => [...prev, ...newJobs]);
    newJobs.forEach((job) => runJob(job.id, job.file));
  };

  const retryJob = (jobId) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) runJob(jobId, job.file);
  };

  const dismissJob = (jobId) => setJobs((prev) => prev.filter((j) => j.id !== jobId));

  // ---- Booking CRUD ---- (all stamp the active trip)
  const addManual = () => {
    setBookings((prev) => [...prev, { ...emptyBooking(), tripId: activeTripId }]);
    schedulePush();
    setView('itinerary'); // a manual booking is a flight — show it on the itinerary
  };

  const updateBooking = (id, next) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? normalizeBooking({ ...next, id, updatedAt: nowIso() }) : b))
    );
    schedulePush();
  };

  // Soft delete (tombstone) so the deletion propagates across devices.
  const deleteBooking = (id) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: nowIso() } : b))
    );
    schedulePush();
  };

  const commitPlace = (raw) => {
    setBookings((prev) => [...prev, normalizeBooking({ ...raw, tripId: activeTripId })]);
    schedulePush();
    setView('places'); // jump to the Places tab so the new place is visible
  };

  // Add a place picked from the map's own search box — stays on the current view
  // (the new pin just appears on the map).
  const addPlaceFromMap = (raw) => {
    setBookings((prev) => [...prev, normalizeBooking({ ...raw, tripId: activeTripId })]);
    schedulePush();
  };

  const applyPeople = (next) => {
    setPeople(next);
    setPeopleTs(nowIso());
    schedulePush();
  };

  // ---- Trip CRUD ----
  const createTrip = (name) => {
    const t = newTrip(name);
    setTrips((prev) => [...prev, t]);
    setTripsTs(nowIso());
    setActiveTripId(t.id);
    setView('itinerary');
    setEditTrip(null);
    schedulePush();
  };

  const renameTrip = (id, name) => {
    setTrips((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: String(name || '').trim() || t.name, updatedAt: nowIso() } : t))
    );
    setTripsTs(nowIso());
    setEditTrip(null);
    schedulePush();
  };

  const deleteTrip = (id) => {
    const card = tripCards.upcoming.concat(tripCards.past).find((c) => c.id === id);
    const count = card ? card.counts.total : 0;
    if (
      !window.confirm(
        `Delete this trip and its ${count} item${count === 1 ? '' : 's'} from all your devices? This can’t be undone.`
      )
    ) {
      return;
    }
    const ts = nowIso();
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, deleted: true, updatedAt: ts } : t)));
    setBookings((prev) =>
      prev.map((b) => ((b.tripId || DEFAULT_TRIP_ID) === id ? { ...b, deleted: true, updatedAt: ts } : b))
    );
    setTripsTs(ts);
    if (activeTripId === id) setActiveTripId(null);
    schedulePush();
  };

  // ---- Backup (JSON export / import) ----
  const importRef = useRef(null);

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readBackup(file);
      // Restore preserving each item's trip (additive, by id).
      setBookings((prev) => {
        const ids = new Set(prev.map((b) => b.id));
        return [...prev, ...data.bookings.filter((b) => !ids.has(b.id))];
      });
      setPeople((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...data.people.filter((p) => !ids.has(p.id))];
      });
      if (data.trips && data.trips.length) {
        setTrips((prev) => {
          const ids = new Set(prev.map((t) => t.id));
          return [...prev, ...data.trips.filter((t) => !ids.has(t.id))];
        });
        setTripsTs(nowIso());
      }
      setPeopleTs(nowIso());
      schedulePush();
    } catch (err) {
      alert(err.message || 'Could not import that file.');
    }
  };

  const hasContent = activeBookings.length > 0 || jobs.length > 0;

  // Header sync indicator.
  const syncOn = !!syncCode;
  let SyncGlyph = CloudIcon;
  let syncColor = 'text-slate-400';
  if (syncOn && syncStatus === 'synced') {
    SyncGlyph = CloudCheckIcon;
    syncColor = 'text-emerald-600';
  } else if (syncOn && syncStatus === 'error') {
    syncColor = 'text-rose-500';
  } else if (syncOn) {
    syncColor = 'text-sky-600';
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {activeTripId ? (
              <button
                type="button"
                onClick={() => setActiveTripId(null)}
                aria-label="Back to all trips"
                className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                ✈
              </span>
            )}
            <h1 className="truncate text-lg font-bold tracking-tight text-ink">
              {activeTripId ? activeTrip?.name || 'Trip' : 'OneTripView'}
            </h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowSync(true)}
              aria-label="Sync across devices"
              title={syncOn ? 'Cloud sync is on' : 'Sync across devices'}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {syncOn && syncStatus === 'syncing' ? (
                <Spinner className={`h-4 w-4 ${syncColor}`} />
              ) : (
                <SyncGlyph className={`h-4 w-4 ${syncColor}`} />
              )}
              <span className="hidden sm:inline">Sync</span>
            </button>
            {activeTripId && (
              <>
                <button
                  type="button"
                  onClick={addManual}
                  aria-label="Add booking"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <PlusIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddPlace({ city: '' })}
                  aria-label="Add a place to check"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <PinIcon className="h-4 w-4 text-emerald-600" />
                  <span className="hidden sm:inline">Place</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportToExcel(activeBookings, resolver)}
                  disabled={activeBookings.length === 0}
                  aria-label="Export to Excel"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <SheetIcon className="h-4 w-4 text-emerald-600" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportToPdf(activeBookings, resolver)}
                  disabled={activeBookings.length === 0}
                  aria-label="Export to PDF"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  <DocIcon className="h-4 w-4 text-rose-600" />
                  <span className="hidden sm:inline">PDF</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {!activeTripId ? (
          <TripsHome
            cards={tripCards}
            liveBookings={liveBookings}
            trips={trips}
            resolver={resolver}
            onOpenTrip={(id, v = 'itinerary') => {
              setActivePerson(null);
              setView(v);
              setActiveTripId(id);
            }}
            onNewTrip={() => setEditTrip('new')}
            onRenameTrip={(id, name) => setEditTrip({ id, name })}
            onDeleteTrip={deleteTrip}
          />
        ) : !hasContent ? (
          <EmptyState onFiles={handleFiles} onAddManual={addManual} />
        ) : (
          <div className="space-y-5">
            {/* Itinerary / Places tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => setView('itinerary')}
                className={`flex-1 rounded-lg py-1.5 transition-colors ${
                  view === 'itinerary' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Itinerary
              </button>
              <button
                type="button"
                onClick={() => setView('places')}
                className={`flex-1 rounded-lg py-1.5 transition-colors ${
                  view === 'places' ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Places{placePins.length > 0 ? ` (${placePins.length})` : ''}
              </button>
            </div>

            {view === 'itinerary' ? (
              <>
                {activeBookings.length > 0 && (
                  <Hero
                    summary={summary}
                    cities={cities}
                    destination={destination}
                    activePerson={activePerson}
                    onTogglePerson={setActivePerson}
                    onManagePeople={() => setShowManage(true)}
                  />
                )}

                {(stops.length > 0 || placePins.length > 0) && (
                  <TripMap stops={stops} places={placePins} onAddPlace={addPlaceFromMap} />
                )}

                <DropZone onFiles={handleFiles} compact />

                <ProcessingQueue jobs={jobs} onRetry={retryJob} onDismiss={dismissJob} />

                {timelineBookings.length > 0 ? (
                  <Timeline
                    bookings={timelineBookings}
                    resolver={resolver}
                    onChange={updateBooking}
                    onDelete={deleteBooking}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center text-sm text-slate-400">
                    Nothing scheduled yet — drop a booking PDF above, or add spots in the{' '}
                    <button
                      type="button"
                      onClick={() => setView('places')}
                      className="font-semibold text-sky-600 hover:underline"
                    >
                      Places
                    </button>{' '}
                    tab.
                  </p>
                )}
              </>
            ) : (
              <>
                {placePins.length > 0 && (
                  <TripMap stops={[]} places={placePins} onAddPlace={addPlaceFromMap} />
                )}
                {placePins.length > 0 ? (
                  <PlacesToCheck
                    places={placePins}
                    onChange={updateBooking}
                    onDelete={deleteBooking}
                    onAddPlace={(city) => setAddPlace({ city })}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center">
                    <p className="text-sm text-slate-500">
                      No places yet. Paste a Google Maps, restaurant, or event link to start a
                      shortlist for each destination.
                    </p>
                    <button
                      type="button"
                      onClick={() => setAddPlace({ city: '' })}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <PinIcon className="h-4 w-4" /> Add a place
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <footer className="mt-10 pb-8 text-center text-xs text-slate-400">
          <p>
            {syncOn ? 'Synced across your devices' : 'Saved on this device'} ·{' '}
            {tripCards.upcoming.length + tripCards.past.length} trip
            {tripCards.upcoming.length + tripCards.past.length === 1 ? '' : 's'} · {liveBookings.length} item
            {liveBookings.length === 1 ? '' : 's'}
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => exportBackup(liveBookings, people, trips)}
              disabled={liveBookings.length === 0 && people.length === 0}
              className="font-medium text-slate-500 hover:text-sky-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              Export backup
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => importRef.current?.click()}
              className="font-medium text-slate-500 hover:text-sky-600 hover:underline"
            >
              Import backup
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFile}
            />
          </div>
        </footer>
      </main>

      {showManage && (
        <ManagePeople
          peopleInTrip={summary.people}
          registry={people}
          onApply={applyPeople}
          onClose={() => setShowManage(false)}
        />
      )}

      {showSync && (
        <SyncModal
          code={syncCode}
          status={syncStatus}
          error={syncError}
          onUseCode={useSyncCode}
          onStop={stopSync}
          onSyncNow={() => doFullSync(true)}
          onClose={() => setShowSync(false)}
        />
      )}

      {addPlace && (
        <AddPlaceModal
          presetCity={addPlace.city}
          cities={cityNames}
          onAdd={commitPlace}
          onClose={() => setAddPlace(null)}
        />
      )}

      {editTrip && (
        <NewTripModal
          mode={editTrip === 'new' ? 'create' : 'rename'}
          initialName={editTrip === 'new' ? '' : editTrip.name}
          onSubmit={(name) =>
            editTrip === 'new' ? createTrip(name) : renameTrip(editTrip.id, name)
          }
          onClose={() => setEditTrip(null)}
        />
      )}
    </div>
  );
}
