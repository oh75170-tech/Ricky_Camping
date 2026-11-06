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
    .filter((g): g is Gear => !!g && (!!g.custom || !!s.overrides[g.id]));
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
    const custom = snap.gear.filter((g) => g.custom && !have.has(g.id));
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
