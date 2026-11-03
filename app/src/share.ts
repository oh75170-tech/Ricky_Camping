import { allGear, getState } from './store';

/** 배치도 캔버스 + 하단 장비 제원 목록을 합쳐 한 장의 이미지로 */
export function composeImage(map: HTMLCanvasElement, title: string): HTMLCanvasElement {
  const s = getState();
  const gear = new Map(allGear(s).map((g) => [g.id, g]));
  const rows = s.placements
    .map((p) => ({ p, g: gear.get(p.gearId), site: s.sites.find((x) => x.id === p.siteId) }))
    .filter((r) => r.g);

  const W = Math.max(1080, map.width);
  const pad = 48;
  const headerH = 120;
  const rowH = 44;
  const scale = (W - pad * 2) / map.width;
  const mapH = map.height * scale;
  const listH = rows.length ? 70 + rows.length * rowH : 0;
  const H = headerH + mapH + listH + pad * 2;

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#1f3d2b';
  ctx.font = 'bold 44px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.fillText(title, pad, pad + 40);
  ctx.fillStyle = '#6b7a68';
  ctx.font = '26px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.fillText(`사이트 ${s.campsite.w}m × ${s.campsite.h}m · 격자 1칸 = 1m · Ricky Camping`, pad, pad + 84);

  ctx.drawImage(map, pad, headerH + pad, W - pad * 2, mapH);

  if (rows.length) {
    let y = headerH + pad + mapH + 50;
    ctx.fillStyle = '#1f3d2b';
    ctx.font = 'bold 30px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    ctx.fillText('장비 제원 (길이 × 너비 × 높이 / 재질)', pad, y);
    y += 20;
    ctx.font = '24px system-ui, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    for (const { g, site } of rows) {
      y += rowH;
      ctx.fillStyle = site?.color ?? '#2f7d4f';
      ctx.beginPath();
      ctx.arc(pad + 10, y - 9, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      const line = `${g!.brand} ${g!.name}  ${g!.l}×${g!.w}${g!.h ? `×${g!.h}` : ''}cm  ${g!.material ?? ''}${g!.verified ? '' : ' (추정)'}`;
      ctx.fillText(line, pad + 30, y, W - pad * 2 - 30);
    }
  }
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('이미지 생성 실패'))), 'image/png'));
}

export function canShareFiles(): boolean {
  try {
    const f = new File([new Blob()], 'a.png', { type: 'image/png' });
    return !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** 시스템 공유 시트 (iOS/Android 에서 인스타그램·카카오톡 등 선택 가능) */
export async function shareImage(blob: Blob, title: string): Promise<'shared' | 'unsupported' | 'cancelled'> {
  const file = new File([blob], `camping-layout-${Date.now()}.png`, { type: 'image/png' });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], title, text: `${title} - 캠핑 배치도` });
    return 'shared';
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function downloadBlob(blob: Blob, name = `camping-layout-${Date.now()}.png`) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
