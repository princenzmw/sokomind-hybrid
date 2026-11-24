import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getFirebaseServices } from './firebaseClient';
import type { LedgerEntry, SyncState } from './types';

export const LEDGER_STORAGE_KEY = 'sokomind.ledger.v1';

export type SanitizedCloudLedgerEntry = Omit<LedgerEntry, 'rawInput'>;

export function sanitizeEntryForCloud(entry: LedgerEntry): SanitizedCloudLedgerEntry {
  const { rawInput: _omittedRawInput, ...sanitizedEntry } = entry;
  return sanitizedEntry;
}

export function loadLocalEntries(seedFallback: LedgerEntry[]): LedgerEntry[] {
  try {
    const saved = localStorage.getItem(LEDGER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as LedgerEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore corrupted storage and fall back to sample data.
  }
  return seedFallback;
}

export function saveLocalEntries(entries: LedgerEntry[]): void {
  try {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota restrictions cleanly.
  }
}

async function resolveAnonymousUid(): Promise<string | null> {
  const services = getFirebaseServices();
  if (!services) {
    return null;
  }
  try {
    const auth = getAuth(services.app);
    if (auth.currentUser) {
      return auth.currentUser.uid;
    }
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
  } catch {
    return null;
  }
}

function offlineOrSynced(): SyncState {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline_cached';
  }
  return 'firestore_synced';
}

export async function loadLedgerEntries(
  seedFallback: LedgerEntry[],
): Promise<{ entries: LedgerEntry[]; syncState: SyncState }> {
  const localEntries = loadLocalEntries(seedFallback);
  const services = getFirebaseServices();
  if (!services) {
    return { entries: localEntries, syncState: 'local_only' };
  }

  const uid = await resolveAnonymousUid();
  if (!uid) {
    return { entries: localEntries, syncState: 'local_only' };
  }

  try {
    const entriesRef = collection(services.db, 'shops', uid, 'entries');
    const q = query(entriesRef, orderBy('createdAt', 'desc'), limit(100));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { entries: localEntries, syncState: offlineOrSynced() };
    }
    const cloudEntries: LedgerEntry[] = snapshot.docs.map((snap) => {
      const data = snap.data() as SanitizedCloudLedgerEntry;
      return {
        ...data,
        rawInput: data.sanitizedInput,
      };
    });
    saveLocalEntries(cloudEntries);
    return { entries: cloudEntries, syncState: offlineOrSynced() };
  } catch {
    return {
      entries: localEntries,
      syncState: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline_cached' : 'local_only',
    };
  }
}

export async function persistLedgerEntry(entry: LedgerEntry): Promise<SyncState> {
  const services = getFirebaseServices();
  if (!services) {
    return 'local_only';
  }

  const uid = await resolveAnonymousUid();
  if (!uid) {
    return 'local_only';
  }

  try {
    const sanitized = sanitizeEntryForCloud(entry);
    const ref = doc(services.db, 'shops', uid, 'entries', entry.id);
    await setDoc(ref, sanitized, { merge: true });
    return offlineOrSynced();
  } catch {
    return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline_cached' : 'local_only';
  }
}
