/**
 * 캠핑 사진 보관 (이 기기 IndexedDB)
 *  - 원본은 긴 변 1600px JPEG, 썸네일은 480px 로 줄여서 저장
 *  - localStorage(5MB 제한)에는 넣지 않고 일정에는 사진 id 만 저장
 */
import { useEffect, useState } from 'react';
import { uid } from './store';

const DB = 'campcanvas-photos';
const STORE = 'photos';
interface PhotoRec {
  id: string;
  full: Blob;
  thumb: Blob;
  createdAt: number;
}

const memory = new Map<string, PhotoRec>(); // IndexedDB 를 못 쓰는 환경(미리보기 등) 대비
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbp)
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function put(rec: PhotoRec) {
  memory.set(rec.id, rec);
  try {
    await tx('readwrite', (s) => s.put(rec));
  } catch {
    /* 메모리에만 */
  }
}

async function get(id: string): Promise<PhotoRec | undefined> {
  if (memory.has(id)) return memory.get(id);
  try {
    const r = (await tx('readonly', (s) => s.get(id))) as PhotoRec | undefined;
    if (r) memory.set(id, r);
    return r;
  } catch {
    return undefined;
  }
}

function loadImage(src: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('사진을 읽지 못했어요. (JPG/PNG 사진을 골라주세요)'));
    };
    img.src = url;
  });
}

function resize(img: HTMLImageElement, max: number, q: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('사진 변환 실패'))), 'image/jpeg', q));
}

/** 사진 파일 → 줄여서 저장하고 id 반환 */
export async function addPhoto(file: Blob): Promise<string> {
  const img = await loadImage(file);
  const [full, thumb] = await Promise.all([resize(img, 1600, 0.82), resize(img, 480, 0.78)]);
  const id = uid('ph');
  await put({ id, full, thumb, createdAt: Date.now() });
  return id;
}

export async function deletePhotos(ids: string[]) {
  for (const id of ids) {
    memory.delete(id);
    const u = urls.get(id);
    if (u) {
      URL.revokeObjectURL(u.thumb);
      URL.revokeObjectURL(u.full);
      urls.delete(id);
    }
    try {
      await tx('readwrite', (s) => s.delete(id));
    } catch {
      /* 무시 */
    }
  }
}

const urls = new Map<string, { thumb: string; full: string }>();
async function photoUrls(id: string) {
  const c = urls.get(id);
  if (c) return c;
  const r = await get(id);
  if (!r) return null;
  const u = { thumb: URL.createObjectURL(r.thumb), full: URL.createObjectURL(r.full) };
  urls.set(id, u);
  return u;
}

/** 사진 주소 (undefined: 불러오는 중, null: 이 기기에 없음) */
export function usePhoto(id: string, kind: 'thumb' | 'full'): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => urls.get(id)?.[kind]);
  useEffect(() => {
    let alive = true;
    photoUrls(id).then((u) => alive && setUrl(u ? u[kind] : null));
    return () => {
      alive = false;
    };
  }, [id, kind]);
  return url;
}

// ───────── 백업 파일용 ─────────
const toDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** 백업에 넣을 사진 (id → 원본 dataURL) */
export async function exportPhotos(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const r = await get(id);
    if (r) out[id] = await toDataUrl(r.full);
  }
  return out;
}

/** 백업에서 사진 되살리기 (같은 id 로) */
export async function importPhotos(photos: Record<string, string>) {
  for (const [id, dataUrl] of Object.entries(photos)) {
    if (await get(id)) continue;
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const img = await loadImage(blob);
      await put({ id, full: blob, thumb: await resize(img, 480, 0.78), createdAt: Date.now() });
    } catch {
      /* 손상된 사진은 건너뜀 */
    }
  }
}
