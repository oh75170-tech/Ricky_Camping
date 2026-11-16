/**
 * 캠핑일정·사진을 내 다른 기기와 동기화 (설정에서 켰을 때만)
 *  - 장비 동기화와 같은 동기화 코드를 쓰지만 서버에는 따로 저장 (코드#trips)
 *  - 충돌 없이 합치기: 일정마다 마지막 저장(updatedAt)이 최신인 쪽, 지운 일정은 다시 살아나지 않음
 *  - 사진은 일정에 들어 있는 것만 서버에 올리고, 없는 기기는 받아옴
 */
import { useSyncExternalStore } from 'react';
import { getState, setState, subscribeStore, type AppState } from './store';
import { serverUrl } from './config';
import { IS_PREVIEW } from './env';
import { sha256 } from './cloud';
import { getPhotoBlob, hasPhoto, putPhotoBlob } from './photos';
import type { HomePlace, Trip } from './types';

interface TripDoc {
  trips: Trip[];
  deletedTrips: Record<string, number>;
  home: HomePlace | null;
  siteMemory: AppState['siteMemory'];
}

let status = { state: 'off' as 'off' | 'syncing' | 'saved' | 'error', message: '', at: 0 };
const ls = new Set<() => void>();
const set = (p: Partial<typeof status>) => {
  status = { ...status, ...p };
  ls.forEach((l) => l());
};
export const useTripSyncStatus = () =>
  useSyncExternalStore(
    (l) => (ls.add(l), () => ls.delete(l)),
    () => status,
  );

const enabled = () => {
  const s = getState().settings;
  return !IS_PREVIEW && !!s.syncCode && s.syncTrips && !!s.passcode && !!serverUrl();
};
const headers = () => ({ 'x-api-key': encodeURIComponent(getState().settings.passcode.trim()) });
const hashOf = async () => sha256(`${getState().settings.syncCode}#trips`);

const ts = (t: Trip) => t.updatedAt ?? t.createdAt ?? 0;

function pick(s: AppState = getState()): TripDoc {
  return { trips: s.trips, deletedTrips: s.deletedTrips, home: s.home, siteMemory: s.siteMemory };
}

/** 두 기기의 일정 합치기 */
function merge(a: TripDoc, b: TripDoc): TripDoc {
  const deleted: Record<string, number> = { ...a.deletedTrips };
  for (const [id, t] of Object.entries(b.deletedTrips ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, t);
  const byId = new Map<string, Trip>();
  for (const t of [...(a.trips ?? []), ...(b.trips ?? [])]) {
    const cur = byId.get(t.id);
    if (!cur || ts(t) > ts(cur)) byId.set(t.id, t);
  }
  const trips = [...byId.values()].filter((t) => !(deleted[t.id] && deleted[t.id] >= ts(t)));
  const siteMemory: AppState['siteMemory'] = { ...(b.siteMemory ?? {}) };
  for (const [k, v] of Object.entries(a.siteMemory ?? {})) siteMemory[k] = { ...(siteMemory[k] ?? {}), ...v };
  return { trips, deletedTrips: deleted, home: a.home ?? b.home ?? null, siteMemory };
}

const key = (d: TripDoc) =>
  JSON.stringify([
    [...d.trips].sort((x, y) => x.id.localeCompare(y.id)).map((t) => [t.id, ts(t)]),
    d.deletedTrips,
    d.home,
    d.siteMemory,
  ]);

let busy = false;
let again = false;
let applying = false;

/** 서버와 합쳐서 양쪽을 같게 만들기 */
export async function syncTripsNow(): Promise<void> {
  if (!enabled()) return set({ state: 'off', message: '' });
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  set({ state: 'syncing', message: '일정 동기화 중…' });
  try {
    const base = serverUrl();
    const h = await hashOf();
    const r = await fetch(`${base}/sync/${h}`, { headers: headers() });
    if (r.status === 401) throw new Error('접속 코드가 맞지 않아 동기화할 수 없어요.');
    if (!r.ok) throw new Error(`동기화 오류 (${r.status})`);
    const remote = ((await r.json()) as { doc: { data: TripDoc } | null }).doc?.data ?? null;
    const local = pick();
    const merged = remote ? merge(local, remote) : local;
    if (key(merged) !== key(local)) {
      applying = true;
      setState((s) => ({ ...s, ...merged }));
      applying = false;
    }
    if (!remote || key(merged) !== key(remote)) {
      const p = await fetch(`${base}/sync/${h}`, {
        method: 'PUT',
        headers: { ...headers(), 'content-type': 'application/json' },
        body: JSON.stringify({ data: merged, updatedAt: Date.now() }),
      });
      if (!p.ok) throw new Error(p.status === 413 ? '일정이 너무 많아 한 번에 올릴 수 없어요.' : `동기화 오류 (${p.status})`);
    }
    await syncPhotos(h, merged.trips);
    set({ state: 'saved', message: '일정·사진 동기화됨', at: Date.now() });
  } catch (e) {
    set({ state: 'error', message: (e as Error).message });
  } finally {
    busy = false;
    if (again) {
      again = false;
      syncTripsNow();
    }
  }
}

const UP_KEY = 'campcanvas-photo-up';
async function syncPhotos(h: string, trips: Trip[]) {
  const base = serverUrl();
  let up: Record<string, true> = {};
  try {
    up = JSON.parse(localStorage.getItem(`${UP_KEY}:${h}`) || '{}');
  } catch {
    /* 없음 */
  }
  const ids = trips.flatMap((t) => t.photos ?? []);
  for (const id of ids) {
    if (await hasPhoto(id)) {
      if (up[id]) continue;
      const blob = await getPhotoBlob(id);
      if (!blob) continue;
      const r = await fetch(`${base}/sync/${h}/photo/${id}`, { method: 'PUT', headers: { ...headers(), 'content-type': 'image/jpeg' }, body: blob });
      if (r.ok) up[id] = true;
    } else {
      const r = await fetch(`${base}/sync/${h}/photo/${id}`, { headers: headers() });
      if (r.ok) {
        await putPhotoBlob(id, await r.blob());
        up[id] = true;
      }
    }
  }
  try {
    localStorage.setItem(`${UP_KEY}:${h}`, JSON.stringify(up));
  } catch {
    /* 저장 불가 */
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function startTripSync() {
  if (IS_PREVIEW) return;
  let last = pick();
  subscribeStore(() => {
    const cur = pick();
    if (cur.trips === last.trips && cur.deletedTrips === last.deletedTrips && cur.home === last.home && cur.siteMemory === last.siteMemory) return;
    last = cur;
    if (applying || !enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(syncTripsNow, 1500);
  });
  syncTripsNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncTripsNow();
  });
}
