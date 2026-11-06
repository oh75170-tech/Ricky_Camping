import { useEffect, useRef, useState } from 'react';
import { addPhoto, usePhoto } from '../photos';
import { Icon } from './Icon';
import { ask } from '../env';

export const MAX_PHOTOS = 4;

/** 썸네일 한 장 */
export function PhotoThumb({ id, onClick }: { id: string; onClick?: () => void }) {
  const url = usePhoto(id, 'thumb');
  return (
    <button
      type="button"
      className="photo-thumb"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label="사진 크게 보기"
    >
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="photo-missing">{url === null ? '이 기기에 없음' : ''}</span>}
    </button>
  );
}

/** 사진 크게 보기 (좌우 넘기기, 스와이프) */
export function PhotoViewer({ ids, start, onClose, onDelete }: { ids: string[]; start: number; onClose: () => void; onDelete?: (id: string) => void }) {
  const [i, setI] = useState(start);
  const idx = Math.min(i, ids.length - 1);
  const id = ids[idx];
  const url = usePhoto(id ?? '', 'full');
  const touch = useRef<number | null>(null);
  const go = (d: number) => setI((x) => (x + d + ids.length) % ids.length);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  useEffect(() => {
    if (!ids.length) onClose();
  }, [ids.length]);
  if (!id) return null;

  return (
    <div
      className="viewer-back"
      onClick={onClose}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50 && ids.length > 1) go(dx < 0 ? 1 : -1);
      }}
      role="dialog"
      aria-label="사진 보기"
    >
      <div className="viewer-top" onClick={(e) => e.stopPropagation()}>
        <span>
          {idx + 1} / {ids.length}
        </span>
        <span style={{ flex: 1 }} />
        {onDelete && (
          <button className="viewer-btn" onClick={() => onDelete(id)} aria-label="사진 삭제">
            <Icon name="trash" />
          </button>
        )}
        <button className="viewer-btn" onClick={onClose} aria-label="닫기">
          <Icon name="close" />
        </button>
      </div>
      {url ? (
        <img className="viewer-img" src={url} alt="" onClick={(e) => e.stopPropagation()} />
      ) : (
        <p className="viewer-missing">{url === null ? '이 사진은 다른 기기에서 넣은 사진이에요.' : '불러오는 중…'}</p>
      )}
      {ids.length > 1 && (
        <>
          <button className="viewer-nav prev" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="이전 사진">
            <Icon name="back" size={28} />
          </button>
          <button className="viewer-nav next" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="다음 사진">
            <Icon name="back" size={28} />
          </button>
        </>
      )}
    </div>
  );
}

/** 일정 화면의 사진 칸 4개 (추가·보기·삭제) */
export function TripPhotoSlots({ ids, onChange }: { ids: string[]; onChange: (ids: string[], removed?: string[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = MAX_PHOTOS - ids.length;

  const add = async (list: FileList | null) => {
    const files = list ? [...list] : []; // input 을 비우면 FileList 도 비워지므로 먼저 복사
    if (!files.length) return;
    setBusy(true);
    setErr('');
    const next = [...ids];
    try {
      for (const f of files.slice(0, left)) next.push(await addPhoto(f));
      if (files.length > left) setErr(`사진은 최대 ${MAX_PHOTOS}장까지 넣을 수 있어요.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      onChange(next);
    }
  };

  return (
    <>
      <div className="photo-slots">
        {ids.map((id, n) => (
          <PhotoThumb key={id} id={id} onClick={() => setView(n)} />
        ))}
        {left > 0 && (
          <button type="button" className="photo-add" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="camera" size={26} />
            <span>{busy ? '넣는 중…' : `사진 추가 (${ids.length}/${MAX_PHOTOS})`}</span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      {err && <p className="small">{err}</p>}
      <p className="muted small">사진은 이 기기에 저장돼요(내 데이터 동기화에는 포함되지 않음). 백업 파일에는 함께 들어가요.</p>
      {view != null && (
        <PhotoViewer
          ids={ids}
          start={view}
          onClose={() => setView(null)}
          onDelete={(id) => {
            if (!ask('이 사진을 삭제할까요?')) return;
            const next = ids.filter((x) => x !== id);
            onChange(next, [id]);
            if (!next.length) setView(null);
            else setView((v) => Math.min(v ?? 0, next.length - 1));
          }}
        />
      )}
    </>
  );
}
