import { useSyncExternalStore } from 'react';
import { BUILTIN_GEAR, CORE_BRANDS, SEED_OWNED } from './data/gear';
import type { Gear, LayerStyle, Placement, Site } from './types';

export interface Settings {
  /** server: 우리 서버 경유(키는 서버에 보관) / direct: 개인 API 키로 직접 호출 */
  aiMode: 'server' | 'direct';
  apiKey: string;
  passcode: string;
  serverUrl: string;
  model: string;
}

export interface AppState {
  customGear: Gear[];
  overrides: Record<string, Partial<Gear>>;
  owned: string[];
  wish: string[];
  extraBrands: string[];
  sites: Site[];
  placements: Placement[];
  layer: LayerStyle;
  campsite: { w: number; h: number; name: string; confirmed: boolean };
  seedVersion: number;
  settings: Settings;
}

const KEY = 'ricky-camping-v1'; // 저장 키는 기존 데이터 유지를 위해 그대로 사용
/** 모노톤 사이트 색 (명도 차이로 구분) */
export const SITE_COLORS = ['#262626', '#8f8f8f', '#555555', '#b8b8b8', '#3d3d3d', '#737373', '#a3a3a3'];

const defaults: AppState = {
  customGear: [],
  overrides: {},
  owned: [],
  wish: [],
  extraBrands: [],
  sites: [{ id: 'site-1', name: '우리 사이트', color: '#262626' }],
  placements: [],
  layer: {
    ground: 0.9,
    inner: 0.55,
    fly: 0.35,
    tarp: 0.3,
    furniture: 0.95,
    showFrame: true,
    showDims: true,
    showLabels: true,
  },
  campsite: { w: 12, h: 10, name: '', confirmed: false },
  seedVersion: 0,
  settings: { aiMode: 'server', apiKey: '', passcode: '', serverUrl: '', model: 'claude-opus-5-5' },
};

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      ...defaults,
      ...parsed,
      layer: { ...defaults.layer, ...(parsed.layer ?? {}) },
      settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
      campsite: { ...defaults.campsite, ...(parsed.campsite ?? {}) },
      // 이전 버전의 컬러 → 모노톤 팔레트로 변환
      sites: (parsed.sites ?? defaults.sites).map((x, i) => (SITE_COLORS.includes(x.color) ? x : { ...x, color: SITE_COLORS[i % SITE_COLORS.length] })),
    };
  } catch {
    return defaults;
  }
}

function seed(s: AppState): AppState {
  if (s.seedVersion >= 2) return s;
  return { ...s, owned: [...new Set([...s.owned, ...SEED_OWNED])], seedVersion: 2 };
}

let state: AppState = seed(load());
const listeners = new Set<() => void>();

export function getState() {
  return state;
}

export function setState(updater: (s: AppState) => AppState) {
  state = updater(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 불가 환경 (사파리 프라이빗 등) */
  }
  listeners.forEach((l) => l());
}

export function subscribeStore(l: () => void) {
  return subscribe(l);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ───────── 선택자 ─────────
let cacheKey: unknown[] = [];
let cacheVal: Gear[] = [];
export function allGear(s: AppState): Gear[] {
  if (cacheKey[0] === s.customGear && cacheKey[1] === s.overrides) return cacheVal;
  const merged = [...BUILTIN_GEAR, ...s.customGear].map((g) =>
    s.overrides[g.id] ? { ...g, ...s.overrides[g.id] } : g,
  );
  cacheKey = [s.customGear, s.overrides];
  cacheVal = merged;
  return merged;
}

export function gearById(s: AppState, id: string): Gear | undefined {
  return allGear(s).find((g) => g.id === id);
}

export function allBrands(s: AppState): string[] {
  const set = new Set<string>([...CORE_BRANDS]);
  BUILTIN_GEAR.forEach((g) => set.add(g.brand));
  s.extraBrands.forEach((b) => set.add(b));
  s.customGear.forEach((g) => set.add(g.brand));
  return [...set];
}

// ───────── 액션 ─────────
export const actions = {
  toggleOwned(id: string) {
    setState((s) => ({
      ...s,
      owned: s.owned.includes(id) ? s.owned.filter((x) => x !== id) : [...s.owned, id],
    }));
  },
  toggleWish(id: string) {
    setState((s) => ({
      ...s,
      wish: s.wish.includes(id) ? s.wish.filter((x) => x !== id) : [...s.wish, id],
    }));
  },
  addGear(g: Omit<Gear, 'id'> & { id?: string }): Gear {
    const gear: Gear = { ...g, id: g.id ?? uid('g'), custom: true };
    setState((s) => ({
      ...s,
      customGear: [...s.customGear, gear],
      extraBrands: CORE_BRANDS.includes(gear.brand as (typeof CORE_BRANDS)[number]) || s.extraBrands.includes(gear.brand)
        ? s.extraBrands
        : [...s.extraBrands, gear.brand],
    }));
    return gear;
  },
  updateGear(id: string, patch: Partial<Gear>) {
    setState((s) => {
      const isCustom = s.customGear.some((g) => g.id === id);
      if (isCustom) {
        return { ...s, customGear: s.customGear.map((g) => (g.id === id ? { ...g, ...patch } : g)) };
      }
      return { ...s, overrides: { ...s.overrides, [id]: { ...(s.overrides[id] ?? {}), ...patch } } };
    });
  },
  removeGear(id: string) {
    setState((s) => ({
      ...s,
      customGear: s.customGear.filter((g) => g.id !== id),
      placements: s.placements.filter((p) => p.gearId !== id),
    }));
  },
  addBrand(name: string) {
    setState((s) =>
      s.extraBrands.includes(name) || CORE_BRANDS.includes(name as (typeof CORE_BRANDS)[number])
        ? s
        : { ...s, extraBrands: [...s.extraBrands, name] },
    );
  },
  place(gearId: string, siteId: string, x: number, y: number, rot = 0): string {
    const id = uid('p');
    setState((s) => ({ ...s, placements: [...s.placements, { id, gearId, siteId, x, y, rot }] }));
    return id;
  },
  movePlacement(id: string, patch: Partial<Placement>) {
    setState((s) => ({ ...s, placements: s.placements.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  removePlacement(id: string) {
    setState((s) => ({ ...s, placements: s.placements.filter((p) => p.id !== id) }));
  },
  reorder(id: string, dir: 'front' | 'back') {
    setState((s) => {
      const p = s.placements.find((x) => x.id === id);
      if (!p) return s;
      const rest = s.placements.filter((x) => x.id !== id);
      return { ...s, placements: dir === 'front' ? [...rest, p] : [p, ...rest] };
    });
  },
  addSite(name: string): Site {
    const site: Site = { id: uid('site'), name, color: SITE_COLORS[state.sites.length % SITE_COLORS.length] };
    setState((s) => ({ ...s, sites: [...s.sites, site] }));
    return site;
  },
  renameSite(id: string, name: string) {
    setState((s) => ({ ...s, sites: s.sites.map((x) => (x.id === id ? { ...x, name } : x)) }));
  },
  removeSite(id: string) {
    setState((s) => ({
      ...s,
      sites: s.sites.filter((x) => x.id !== id),
      placements: s.placements.filter((p) => p.siteId !== id),
    }));
  },
  setLayer(patch: Partial<LayerStyle>) {
    setState((s) => ({ ...s, layer: { ...s.layer, ...patch } }));
  },
  setCampsite(w: number, h: number, name?: string) {
    setState((s) => ({ ...s, campsite: { ...s.campsite, w, h, name: name ?? s.campsite.name, confirmed: true } }));
  },
  setSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  clearLayout() {
    setState((s) => ({ ...s, placements: [] }));
  },
};
