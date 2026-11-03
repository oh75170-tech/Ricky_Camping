import { useSyncExternalStore } from 'react';
import { BUILTIN_GEAR } from './data/gear';
import { allGear, getState, setState, subscribeStore, uid, type AppState } from './store';
import { serverUrl } from './config';
import type { Gear, Placement, Site } from './types';

/** 공동 편집 문서 (배치 관련 상태만 공유) */
interface RoomDoc {
  sites: Site[];
  placements: Placement[];
  campsite: AppState['campsite'];
  gear: Gear[];
}

export interface SyncStatus {
  roomId: string | null;
  connected: boolean;
  peers: number;
  error: string | null;
}

let status: SyncStatus = { roomId: null, connected: false, peers: 0, error: null };
const listeners = new Set<() => void>();
const setStatus = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p };
  listeners.forEach((l) => l());
};
export const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  );

const clientId = uid('c');
const builtinIds = new Set(BUILTIN_GEAR.map((g) => g.id));
let ws: WebSocket | null = null;
let applying = false;
let unsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let retry = 0;
let last: unknown[] = [];

function buildDoc(s: AppState): RoomDoc {
  const ids = new Set(s.placements.map((p) => p.gearId));
  const gear = allGear(s).filter((g) => ids.has(g.id) && (!builtinIds.has(g.id) || s.overrides[g.id]));
  return { sites: s.sites, placements: s.placements, campsite: s.campsite, gear };
}

function applyDoc(doc: RoomDoc | null) {
  if (!doc || !Array.isArray(doc.placements)) return;
  applying = true;
  setState((s) => {
    const customGear = [...s.customGear];
    const overrides = { ...s.overrides };
    for (const g of doc.gear ?? []) {
      if (builtinIds.has(g.id)) overrides[g.id] = g;
      else {
        const i = customGear.findIndex((x) => x.id === g.id);
        if (i >= 0) customGear[i] = { ...g, custom: true };
        else customGear.push({ ...g, custom: true });
      }
    }
    return {
      ...s,
      sites: doc.sites?.length ? doc.sites : s.sites,
      placements: doc.placements,
      campsite: doc.campsite ? { ...s.campsite, ...doc.campsite, confirmed: true } : s.campsite,
      customGear,
      overrides,
    };
  });
  const st = getState();
  last = [st.sites, st.placements, st.campsite, st.customGear, st.overrides];
  applying = false;
}

function onLocalChange() {
  if (applying || !ws || ws.readyState !== WebSocket.OPEN) return;
  const s = getState();
  const cur = [s.sites, s.placements, s.campsite, s.customGear, s.overrides];
  if (cur.every((v, i) => v === last[i])) return;
  last = cur;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    ws?.send(JSON.stringify({ type: 'update', doc: buildDoc(getState()), clientId }));
  }, 250);
}

function open(roomId: string) {
  const base = serverUrl();
  if (!base) {
    setStatus({ error: '서버 주소가 설정되지 않았습니다.' });
    return;
  }
  const sock = new WebSocket(`${base.replace(/^http/, 'ws')}/rooms/${roomId}/ws`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    setStatus({ connected: true, error: null });
  };
  sock.onmessage = (e) => {
    const msg = JSON.parse(e.data as string);
    if (msg.type === 'snapshot') {
      if (msg.doc) applyDoc(msg.doc);
      else sock.send(JSON.stringify({ type: 'update', doc: buildDoc(getState()), clientId }));
    } else if (msg.type === 'update' && msg.from !== clientId) applyDoc(msg.doc);
    else if (msg.type === 'presence') setStatus({ peers: msg.count });
  };
  sock.onclose = () => {
    if (ws !== sock) return; // 의도적으로 나감
    setStatus({ connected: false });
    retry = Math.min(retry + 1, 6);
    setTimeout(() => ws === sock && open(roomId), 500 * 2 ** retry);
  };
}

export function joinRoom(roomId: string) {
  if (status.roomId === roomId && ws) return;
  leaveRoom();
  setStatus({ roomId, connected: false, peers: 0, error: null });
  open(roomId);
  unsub = subscribeStore(onLocalChange);
}

export function leaveRoom() {
  const s = ws;
  ws = null;
  s?.close();
  unsub?.();
  unsub = null;
  setStatus({ roomId: null, connected: false, peers: 0 });
}

/** 현재 배치로 새 공동 편집 방을 만들고 참여 */
export async function createRoom(): Promise<string> {
  const base = serverUrl();
  if (!base) throw new Error('설정에서 서버 주소를 먼저 입력해주세요.');
  const res = await fetch(`${base}/rooms`, { method: 'POST', body: JSON.stringify(buildDoc(getState())) });
  if (!res.ok) throw new Error(`방 만들기 실패 (${res.status})`);
  const { id } = (await res.json()) as { id: string };
  joinRoom(id);
  return id;
}

export function roomLink(id: string) {
  return `${location.origin}${location.pathname}#/planner?room=${id}`;
}

export const getSyncStatus = () => status;
