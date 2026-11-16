/** 캠핑 일정 ↔ 배치도 연결 도우미 */
import { CATEGORIES, type Gear, type LayoutSnapshot, type Trip } from './types';
import { allGear, getState, setState, uid } from './store';

/** 현재 배치도를 일정에 넣을 사본으로 만들기 (썼던 장비 목록 포함) */
export function snapshotLayout(): LayoutSnapshot {
  const s = getState();
  const gearMap = new Map(allGear(s).map((g) => [g.id, g]));
  const used = [...new Set(s.placements.map((p) => p.gearId))];
  const counts = new Map<string, number>();
  s.placements.forEach((p) => counts.set(p.gearId, (counts.get(p.gearId) ?? 0) + 1));
  // 직접 추가했거나 수정한 장비는 장비 정보 자체를 같이 저장 (다른 기기·나중에 지워도 볼 수 있게)
  const gear: Gear[] = used
    .map((id) => gearMap.get(id))
    .filter((g): g is Gear => !!g && (!!g.custom || !!g.shared || !!s.overrides[g.id]));
  const order = (c: string) => CATEGORIES.findIndex((x) => x.id === c);
  const gearList = used
    .map((id) => gearMap.get(id))
    .filter((g): g is Gear => !!g)
    .sort((a, b) => order(a.category) - order(b.category))
    .map((g) => ({
      id: g.id,
      brand: g.brand,
      name: g.name,
      category: g.category,
      size: `${g.l}×${g.w}${g.h ? `×${g.h}` : ''}cm`,
      count: counts.get(g.id) ?? 1,
    }));
  return {
    savedAt: Date.now(),
    sites: s.sites,
    placements: s.placements,
    campsite: s.campsite,
    gear,
    gearList,
  };
}

/** 일정에 저장된 배치도를 배치 화면으로 꺼내기 */
export function applyLayout(snap: LayoutSnapshot) {
  setState((s) => {
    const have = new Set(allGear(s).map((g) => g.id));
    const custom = snap.gear.filter((g) => (g.custom || g.shared) && !have.has(g.id)).map((g) => ({ ...g, custom: true, shared: false }));
    return {
      ...s,
      customGear: [...s.customGear, ...custom],
      sites: snap.sites.length ? snap.sites : s.sites,
      placements: snap.placements,
      campsite: { ...snap.campsite, confirmed: true },
    };
  });
}

export function newTrip(): Trip {
  const today = new Date();
  const d = (n: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return { id: uid('trip'), title: '', startDate: d(7), endDate: d(8), place: { name: '' }, siteNo: '', floor: '', createdAt: Date.now() };
}

export const todayStr = () => {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const isPastTrip = (t: Trip) => (t.endDate || t.startDate) < todayStr();

/** 날짜 표시: 2026.11.14(토) – 11.15(일) · 1박 */
export function fmtTripDates(t: Trip) {
  if (!t.startDate) return '날짜 미정';
  const wd = ['일', '월', '화', '수', '목', '금', '토'];
  const p = (s: string) => {
    const d = new Date(`${s}T00:00:00`);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: wd[d.getDay()], t: d.getTime() };
  };
  const a = p(t.startDate);
  if (!t.endDate || t.endDate === t.startDate) return `${a.y}.${a.m}.${a.d}(${a.w}) · 당일`;
  const b = p(t.endDate);
  const nights = Math.round((b.t - a.t) / 86400000);
  return `${a.y}.${a.m}.${a.d}(${a.w}) – ${b.y !== a.y ? `${b.y}.` : ''}${b.m}.${b.d}(${b.w}) · ${nights}박`;
}

/** D-day */
export function dday(t: Trip) {
  if (!t.startDate) return '';
  const a = new Date(`${t.startDate}T00:00:00`).getTime();
  const now = new Date(`${todayStr()}T00:00:00`).getTime();
  const n = Math.round((a - now) / 86400000);
  if (n > 0) return `D-${n}`;
  if (!isPastTrip(t)) return n === 0 ? 'D-DAY' : '캠핑 중';
  return '다녀옴';
}

// ───────── 자리번호 → 사이트 크기 기억 ─────────
export const campKey = (name: string) => name.replace(/\s+/g, '').toLowerCase();
export const siteKey = (no: string) => no.trim().toUpperCase().replace(/\s+/g, '').replace(/번$/, '');

/** 구역: "A-12"/"A12" → A, "카라반3" → 카라반, "2-15" → 2 */
export function zoneOf(no: string): string | null {
  const k = siteKey(no);
  const m = k.match(/^([A-Z가-힣]+)/);
  if (m) return m[1];
  const d = k.match(/^(\d+)[-_.]\d+/);
  return d ? d[1] : null;
}

export type SiteSizeHint = { w: number; h: number; kind: 'exact' } | { w: number; h: number; kind: 'zone'; zone: string; n: number };

export function lookupSiteSize(campName: string, no: string): SiteSizeHint | null {
  const mem = getState().siteMemory[campKey(campName)];
  if (!mem || !no.trim()) return null;
  const k = siteKey(no);
  if (mem[k]) return { ...mem[k], kind: 'exact' };
  const zone = zoneOf(no);
  if (!zone) return null;
  const counts = new Map<string, { w: number; h: number; n: number }>();
  for (const [sk, v] of Object.entries(mem)) {
    if (zoneOf(sk) !== zone) continue;
    const id = `${v.w}x${v.h}`;
    const c = counts.get(id) ?? { ...v, n: 0 };
    c.n++;
    counts.set(id, c);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return best ? { w: best.w, h: best.h, kind: 'zone', zone, n: best.n } : null;
}

// ───────── 일정 ↔ 배치 화면 (버튼으로만 연결) ─────────
const emptyLayoutFor = (t: Trip): LayoutSnapshot => {
  const s = getState();
  return {
    savedAt: Date.now(),
    sites: [{ id: 'site-1', name: '우리 사이트', color: '#262626' }],
    placements: [],
    campsite: {
      w: t.siteW ?? s.campsite.w,
      h: t.siteH ?? s.campsite.h,
      name: [t.place.name, t.siteNo].filter(Boolean).join(' '),
      confirmed: !!(t.siteW && t.siteH),
    },
    gear: [],
    gearList: [],
  };
};

const layoutKey = (x: { sites: unknown; placements: unknown; campsite: unknown }) => JSON.stringify([x.sites, x.placements, x.campsite]);

/** 일정 배치 수정 시작: 하던 배치는 따로 두고, 일정에 저장된 배치(없으면 빈 배치)를 배치 화면에 꺼냄 */
export function startTripEdit(tripId: string) {
  const s = getState();
  const t = s.trips.find((x) => x.id === tripId);
  if (!t) return;
  if (s.editingTripId === tripId) return;
  const stash = s.editingTripId ? s.workspaceStash : { sites: s.sites, placements: s.placements, campsite: s.campsite };
  applyLayout(t.layout ?? emptyLayoutFor(t));
  setState((x) => ({ ...x, editingTripId: tripId, workspaceStash: stash }));
}

/** 수정 중인 배치가 일정에 저장된 것과 다른지 */
export function tripEditDirty(s = getState()): boolean {
  const t = s.trips.find((x) => x.id === s.editingTripId);
  if (!t) return false;
  const saved = t.layout ?? emptyLayoutFor(t);
  return layoutKey(saved) !== layoutKey(s);
}

/** [일정에 저장] 버튼: 지금 배치를 수정 중인 일정에 저장 */
export function saveTripEdit() {
  const s = getState();
  const id = s.editingTripId;
  if (!id) return;
  const snap = snapshotLayout();
  setState((x) => ({ ...x, trips: x.trips.map((t) => (t.id === id ? { ...t, layout: snap, updatedAt: Date.now() } : t)) }));
}

/** 수정 끝내기: 하던 배치로 되돌림 (저장 안 한 변경은 버림) */
export function endTripEdit() {
  const st = getState().workspaceStash;
  setState((x) => ({
    ...x,
    editingTripId: null,
    workspaceStash: null,
    ...(st ? { sites: st.sites, placements: st.placements, campsite: st.campsite } : {}),
  }));
}

/** [일정에 반영] 버튼: 배치 화면의 배치를 일정에 복사 (연결은 하지 않음) */
export function copyLayoutToTrip(tripId: string) {
  const snap = snapshotLayout();
  setState((x) => ({
    ...x,
    trips: x.trips.map((t) =>
      t.id === tripId
        ? { ...t, layout: snap, ...(!t.siteW && snap.campsite.confirmed ? { siteW: snap.campsite.w, siteH: snap.campsite.h } : {}), updatedAt: Date.now() }
        : t,
    ),
  }));
}
