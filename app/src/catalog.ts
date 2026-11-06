/**
 * 공유 장비목록
 *  - 앱을 열 때 서버의 최신 공유 장비목록을 받아 기본 장비목록에 더함 (코드 없이 누구나)
 *  - 관리자(관리자 코드 보유)는 자기가 추가·수정한 장비를 모두에게 올릴 수 있음
 */
import { serverUrl } from './config';
import { allGear, getState, setState } from './store';
import { IS_PREVIEW } from './env';
import type { Gear } from './types';

let loading = false;
export async function loadSharedCatalog() {
  const base = serverUrl();
  if (!base || IS_PREVIEW || loading) return;
  loading = true;
  try {
    const r = await fetch(`${base}/catalog`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = (await r.json()) as { gear?: Gear[]; brands?: string[]; updatedAt?: number };
    if (!Array.isArray(j.gear) || !j.updatedAt || j.updatedAt === getState().sharedAt) return;
    setState((s) => ({ ...s, sharedGear: j.gear!, sharedBrands: j.brands ?? [], sharedAt: j.updatedAt! }));
  } catch {
    /* 오프라인: 받아 둔 사본 사용 */
  } finally {
    loading = false;
  }
}

export function startSharedCatalog() {
  loadSharedCatalog();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadSharedCatalog();
  });
}

/** 올릴 장비: 지금 공유된 것 + 내가 직접 추가한 것 + 내가 고친 기본 장비 */
export function catalogToPublish() {
  const s = getState();
  const gear = allGear(s)
    .filter((g) => g.custom || g.shared || s.overrides[g.id])
    .map((g) => {
      const { custom: _c, shared: _s, ...rest } = g;
      void _c;
      void _s;
      return rest as Gear;
    });
  const brands = [...new Set([...s.sharedBrands, ...s.extraBrands])];
  return { gear, brands };
}

export async function publishCatalog(adminCode: string): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  const base = serverUrl();
  if (!base) return { ok: false, message: '서버 주소가 없어요.' };
  const body = catalogToPublish();
  try {
    const r = await fetch(`${base}/catalog`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-code': encodeURIComponent(adminCode.trim()) },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; count?: number };
    if (r.ok) {
      await loadSharedCatalog();
      return { ok: true, count: j.count ?? body.gear.length };
    }
    const msg =
      j.error === 'admin_code_error'
        ? '관리자 코드가 서버와 달라요. GitHub에 등록한 ADMIN_CODE와 똑같이 입력해주세요.'
        : j.error === 'admin_disabled'
          ? '서버에 관리자 코드(ADMIN_CODE)가 아직 없어요. GitHub Secrets에 등록 후 서버를 다시 배포해야 해요.'
          : j.error === 'too large'
            ? '장비가 너무 많아 한 번에 올릴 수 없어요.'
            : `서버 오류 (${r.status})`;
    return { ok: false, message: msg };
  } catch {
    return { ok: false, message: '서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.' };
  }
}
