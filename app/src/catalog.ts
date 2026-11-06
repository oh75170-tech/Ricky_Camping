/**
 * 모두의 장비목록
 *  - 누군가 장비를 직접 추가·수정하면 자동으로 서버에 올라가 모든 사용자의 장비목록에 보임
 *  - 앱을 열 때·다시 볼 때 최신 목록을 받음 (코드 불필요)
 *  - 고치기·지우기는 올린 사람(같은 기여자 코드)만, 다른 사람 장비 지우기는 관리자 코드 필요
 */
import { serverUrl } from './config';
import { allGear, getState, setState, subscribeStore } from './store';
import { IS_PREVIEW } from './env';
import type { Gear } from './types';

const PUSHED_KEY = 'campcanvas-pushed'; // 올린 장비 id → 내용 해시 (같은 내용은 다시 안 올림)

function contributor(): string {
  let id = getState().contributorId;
  if (!id) {
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    id = [...crypto.getRandomValues(new Uint8Array(20))].map((b) => abc[b % abc.length]).join('');
    setState((s) => ({ ...s, contributorId: id }));
  }
  return id;
}

let loading = false;
export async function loadSharedCatalog() {
  const base = serverUrl();
  if (!base || IS_PREVIEW || loading) return;
  loading = true;
  try {
    const r = await fetch(`${base}/catalog`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { gear?: Gear[]; updatedAt?: number };
    if (!Array.isArray(j.gear) || (j.updatedAt ?? 0) === getState().sharedAt) return;
    setState((s) => ({ ...s, sharedGear: j.gear!, sharedAt: j.updatedAt ?? 0 }));
  } catch {
    /* 오프라인: 받아 둔 사본 사용 */
  } finally {
    loading = false;
  }
}

const strip = (g: Gear): Gear => {
  const { custom: _c, shared: _s, ...rest } = g;
  void _c;
  void _s;
  return rest as Gear;
};

function readPushed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PUSHED_KEY) || '{}');
  } catch {
    return {};
  }
}
function writePushed(p: Record<string, string>) {
  try {
    localStorage.setItem(PUSHED_KEY, JSON.stringify(p));
  } catch {
    /* 저장 불가 */
  }
}

let pushing = false;
let again = false;
/** 내가 직접 추가·수정한 장비 중 아직 안 올린 것 올리기 */
export async function pushMyGear(): Promise<void> {
  const base = serverUrl();
  if (!base || IS_PREVIEW) return;
  if (pushing) {
    again = true;
    return;
  }
  const pushed = readPushed();
  const todo = getState()
    .customGear.map(strip)
    .filter((g) => pushed[g.id] !== JSON.stringify(g));
  if (!todo.length) return;
  pushing = true;
  try {
    for (let i = 0; i < todo.length; i += 30) {
      const batch = todo.slice(i, i + 30);
      const r = await fetch(`${base}/catalog/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ by: contributor(), gear: batch }),
      });
      if (!r.ok) break;
      // 올렸거나(saved) 남이 먼저 올린 같은 id(skipped)는 다시 시도하지 않음
      batch.forEach((g) => (pushed[g.id] = JSON.stringify(g)));
      writePushed(pushed);
    }
    await loadSharedCatalog();
  } catch {
    /* 오프라인이면 다음에 */
  } finally {
    pushing = false;
    if (again) {
      again = false;
      pushMyGear();
    }
  }
}

/** 모두의 목록에서 지우기: 내가 올린 장비는 코드 없이, 다른 사람 장비는 관리자 코드 */
export async function deleteSharedGear(id: string, adminCode = ''): Promise<{ ok: boolean; message?: string }> {
  const base = serverUrl();
  if (!base || IS_PREVIEW) return { ok: false, message: '서버에 연결할 수 없어요.' };
  try {
    const r = await fetch(`${base}/catalog/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(adminCode.trim() ? { 'x-admin-code': encodeURIComponent(adminCode.trim()) } : {}) },
      body: JSON.stringify({ id, by: contributor() }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (r.ok) {
      const p = readPushed();
      delete p[id];
      writePushed(p);
      setState((s) => ({ ...s, sharedGear: s.sharedGear.filter((g) => g.id !== id) }));
      loadSharedCatalog();
      return { ok: true };
    }
    return {
      ok: false,
      message:
        j.error === 'admin_code_error'
          ? '관리자 코드가 서버와 달라요.'
          : j.error === 'not_owner'
            ? '다른 사람이 올린 장비라 관리자 코드가 있어야 지울 수 있어요.'
            : `서버 오류 (${r.status})`,
    };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했어요.' };
  }
}

/** 관리자: 내가 고친 기본 장비 제원을 모두에게 반영 */
export async function publishOverrides(adminCode: string): Promise<{ ok: boolean; message: string }> {
  const base = serverUrl();
  const s = getState();
  const ids = Object.keys(s.overrides);
  if (!base || !ids.length) return { ok: false, message: '고친 기본 장비가 없어요.' };
  const gear = allGear(s)
    .filter((g) => s.overrides[g.id] && !g.custom)
    .map(strip);
  try {
    const r = await fetch(`${base}/catalog/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-code': encodeURIComponent(adminCode.trim()) },
      body: JSON.stringify({ by: contributor(), gear }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; saved?: number };
    if (!r.ok) return { ok: false, message: j.error === 'admin_code_error' ? '관리자 코드가 서버와 달라요.' : `서버 오류 (${r.status})` };
    await loadSharedCatalog();
    return { ok: true, message: `고친 기본 장비 ${gear.length}개를 모두에게 반영했어요.` };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했어요.' };
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function startSharedCatalog() {
  loadSharedCatalog().then(pushMyGear);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadSharedCatalog();
  });
  // 장비를 추가·수정하면 잠시 뒤 자동으로 올림
  let last = getState().customGear;
  subscribeStore(() => {
    const cur = getState().customGear;
    if (cur === last) return;
    last = cur;
    clearTimeout(timer);
    timer = setTimeout(pushMyGear, 1500);
  });
}
