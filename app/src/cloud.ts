import { useSyncExternalStore } from 'react';
import { getState, setState, subscribeStore, type AppState } from './store';
import { serverUrl } from './config';
import { IS_PREVIEW } from './env';
import { exportPhotos, importPhotos } from './photos';

/** 백업·동기화 대상 (설정·키는 제외) */
const DATA_KEYS = ['customGear', 'overrides', 'owned', 'wish', 'extraBrands', 'sites', 'placements', 'campsite', 'layer', 'seedVersion', 'trips', 'home', 'siteMemory'] as const;
type DataKey = (typeof DATA_KEYS)[number];
export type UserData = Pick<AppState, DataKey>;

export function pickData(s: AppState = getState()): UserData {
  const d = {} as Record<string, unknown>;
  for (const k of DATA_KEYS) d[k] = s[k];
  return d as UserData;
}

function isUserData(x: unknown): x is Partial<UserData> {
  return !!x && typeof x === 'object' && Array.isArray((x as UserData).owned) && Array.isArray((x as UserData).customGear);
}

export function applyData(d: Partial<UserData>) {
  setState((s) => {
    const next = { ...s } as Record<string, unknown>;
    for (const k of DATA_KEYS) if (d[k] !== undefined) next[k] = d[k];
    return next as unknown as AppState;
  });
}

// ───────── 1) 백업 파일 ─────────
/** 백업 파일: 데이터 + 캠핑 사진(이 기기에 있는 것) */
export async function makeBackup(): Promise<Blob> {
  const data = pickData();
  const ids = data.trips.flatMap((t) => t.photos ?? []);
  const photos = ids.length ? await exportPhotos(ids) : {};
  const payload = { app: 'CampCanvas', version: 2, exportedAt: new Date().toISOString(), data, photos };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export interface BackupFile {
  data: UserData;
  photos: Record<string, string>;
}

export async function readBackup(file: File): Promise<BackupFile> {
  const obj = JSON.parse(await file.text());
  const data = obj?.app === 'CampCanvas' ? obj.data : obj;
  if (!isUserData(data)) throw new Error('CampCanvas 백업 파일이 아니에요.');
  return { data: data as UserData, photos: (obj?.photos as Record<string, string>) ?? {} };
}

export async function applyBackup(b: BackupFile) {
  await importPhotos(b.photos);
  applyData(b.data);
}

// ───────── 2) 서버 자동 동기화 ─────────
export interface CloudStatus {
  state: 'off' | 'syncing' | 'saved' | 'error' | 'conflict';
  message: string;
  savedAt: number | null;
  /** 처음 연결할 때 서버와 이 기기 둘 다 데이터가 있으면 사용자가 고름 */
  remote?: { data: UserData; updatedAt: number } | null;
}
let status: CloudStatus = { state: 'off', message: '', savedAt: null };
const ls = new Set<() => void>();
const set = (p: Partial<CloudStatus>) => {
  status = { ...status, ...p };
  ls.forEach((l) => l());
};
export const useCloudStatus = () =>
  useSyncExternalStore(
    (l) => (ls.add(l), () => ls.delete(l)),
    () => status,
  );

const META_KEY = 'campcanvas-sync-meta';
function meta(): { localUpdatedAt: number; code: string } {
  try {
    return { localUpdatedAt: 0, code: '', ...JSON.parse(localStorage.getItem(META_KEY) ?? '{}') };
  } catch {
    return { localUpdatedAt: 0, code: '' };
  }
}
function saveMeta(m: { localUpdatedAt: number; code: string }) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* 저장 불가 */
  }
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`campcanvas:${text.trim()}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function call(method: 'GET' | 'PUT', code: string, body?: string) {
  const base = serverUrl();
  const { passcode } = getState().settings;
  if (!base) throw new Error('서버 주소가 없어요.');
  if (!passcode) throw new Error('설정에서 AI 접속 코드를 먼저 입력해주세요. (동기화에도 필요해요)');
  const r = await fetch(`${base}/sync/${await sha256(code)}`, {
    method,
    headers: { 'x-api-key': encodeURIComponent(passcode.trim()), 'content-type': 'application/json' },
    body,
  });
  if (r.status === 401) throw new Error('접속 코드가 맞지 않아 동기화할 수 없어요.');
  if (!r.ok) throw new Error(`동기화 오류 (${r.status})`);
  return r.json();
}

let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let last: unknown[] = [];
let unsub: (() => void) | null = null;

async function push() {
  const code = getState().settings.syncCode;
  if (!code) return;
  set({ state: 'syncing', message: '저장 중…' });
  try {
    const m = meta();
    await call('PUT', code, JSON.stringify({ data: pickData(), updatedAt: m.localUpdatedAt || Date.now() }));
    set({ state: 'saved', message: '서버에 저장됨', savedAt: Date.now() });
  } catch (e) {
    set({ state: 'error', message: (e as Error).message });
  }
}

function onChange() {
  if (applying) return;
  const s = getState();
  const cur = DATA_KEYS.map((k) => s[k]);
  if (cur.every((v, i) => v === last[i])) return;
  last = cur;
  saveMeta({ ...meta(), localUpdatedAt: Date.now() });
  if (!s.settings.syncCode) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(push, 1500);
}

function applyRemote(data: UserData, updatedAt: number) {
  applying = true;
  applyData(data);
  const s = getState();
  last = DATA_KEYS.map((k) => s[k]);
  saveMeta({ ...meta(), localUpdatedAt: updatedAt });
  applying = false;
}

/** 앱 시작 시 / 코드 연결 시: 서버와 비교해서 최신 쪽으로 맞춤 */
export async function syncNow(opts: { firstConnect?: boolean } = {}) {
  const code = getState().settings.syncCode;
  if (!code || IS_PREVIEW) return set({ state: 'off', message: '' });
  set({ state: 'syncing', message: '서버와 비교 중…' });
  try {
    const res = (await call('GET', code)) as { doc: { data: UserData; updatedAt: number } | null };
    const remote = res.doc && isUserData(res.doc.data) ? res.doc : null;
    const m = meta();
    const codeChanged = m.code !== code;
    if (!remote) {
      saveMeta({ ...m, code });
      return push();
    }
    // 처음 연결할 때 서버와 이 기기의 내용이 다르면 (보유 표시만 바꾼 경우 포함) 사용자에게 선택을 맡김
    const differs = JSON.stringify(pickData()) !== JSON.stringify({ ...pickData(), ...remote.data });
    if ((opts.firstConnect || codeChanged) && differs) {
      // 둘 다 데이터가 있으면 사용자에게 선택을 맡김
      return set({ state: 'conflict', message: '서버에도 저장된 데이터가 있어요. 어느 쪽을 쓸까요?', remote });
    }
    saveMeta({ ...m, code });
    if (codeChanged || remote.updatedAt > m.localUpdatedAt) {
      applyRemote(remote.data, remote.updatedAt);
      set({ state: 'saved', message: '서버 데이터를 불러왔어요', savedAt: Date.now(), remote: null });
    } else if (remote.updatedAt < m.localUpdatedAt) {
      await push();
    } else {
      set({ state: 'saved', message: '최신 상태', savedAt: Date.now() });
    }
  } catch (e) {
    set({ state: 'error', message: (e as Error).message });
  }
}

/** 충돌 시 사용자의 선택 */
export async function resolveConflict(useServer: boolean) {
  const r = status.remote;
  saveMeta({ ...meta(), code: getState().settings.syncCode });
  if (useServer && r) {
    applyRemote(r.data, r.updatedAt);
    set({ state: 'saved', message: '서버 데이터를 불러왔어요', savedAt: Date.now(), remote: null });
  } else {
    saveMeta({ ...meta(), localUpdatedAt: Date.now() });
    set({ remote: null });
    await push();
  }
}

export function startCloudSync() {
  if (IS_PREVIEW || unsub) return;
  const s = getState();
  last = DATA_KEYS.map((k) => s[k]);
  unsub = subscribeStore(onChange);
  syncNow();
  // 다른 기기에서 바꾼 내용을 앱으로 돌아올 때 반영
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
}
