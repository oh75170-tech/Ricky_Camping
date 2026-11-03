import { useState } from 'react';
import { CATEGORIES, type Category, type Frame, type Gear, type Shape } from '../types';

const SHAPES: { id: Shape; label: string }[] = [
  { id: 'rect', label: '사각' },
  { id: 'tunnel', label: '터널' },
  { id: 'dome', label: '돔' },
  { id: 'hex', label: '육각(원폴)' },
  { id: 'round', label: '원형' },
  { id: 'tarp-hexa', label: '헥사 타프' },
  { id: 'tarp-rect', label: '렉타 타프' },
];
const FRAMES: { id: Frame; label: string }[] = [
  { id: 'none', label: '표시 안 함' },
  { id: 'dome-x', label: '돔 교차폴' },
  { id: 'arches', label: '터널 아치' },
  { id: 'onepole', label: '원폴' },
  { id: 'ridge', label: '양쪽 폴+능선' },
  { id: 'springbar', label: '스프링바' },
  { id: 'air', label: '에어프레임' },
];

type Draft = Omit<Gear, 'id'>;

export function GearForm({
  initial,
  brands,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Gear>;
  brands: string[];
  submitLabel: string;
  onSubmit: (g: Draft) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>({
    brand: initial?.brand ?? '',
    category: initial?.category ?? 'tent',
    name: initial?.name ?? '',
    model: initial?.model,
    l: initial?.l ?? 0,
    w: initial?.w ?? 0,
    h: initial?.h ?? 0,
    material: initial?.material ?? '',
    weight: initial?.weight,
    shape: initial?.shape ?? 'rect',
    frame: initial?.frame ?? 'none',
    frameCount: initial?.frameCount,
    inner: initial?.inner,
    ground: initial?.ground,
    verified: initial?.verified ?? false,
    note: initial?.note,
    source: initial?.source,
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isTent = d.category === 'tent';
  const valid = d.name.trim() && d.brand.trim() && d.l > 0 && d.w > 0;

  return (
    <form
      className="gear-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ ...d, brand: d.brand.trim(), name: d.name.trim() });
      }}
    >
      <div className="grid2">
        <label>
          브랜드
          <input list="brand-list" value={d.brand} onChange={(e) => set('brand', e.target.value)} placeholder="예: 콜맨" />
          <datalist id="brand-list">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label>
          종류
          <select value={d.category} onChange={(e) => set('category', e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        제품명
        <input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="예: 랜드락" />
      </label>
      <div className="grid3">
        <label>
          길이(cm)
          <input type="number" inputMode="decimal" value={d.l || ''} onChange={(e) => set('l', Number(e.target.value))} />
        </label>
        <label>
          너비(cm)
          <input type="number" inputMode="decimal" value={d.w || ''} onChange={(e) => set('w', Number(e.target.value))} />
        </label>
        <label>
          높이(cm)
          <input type="number" inputMode="decimal" value={d.h || ''} onChange={(e) => set('h', Number(e.target.value))} />
        </label>
      </div>
      <label>
        재질
        <input value={d.material ?? ''} onChange={(e) => set('material', e.target.value)} placeholder="예: 폴리에스터 / 알루미늄" />
      </label>
      <div className="grid2">
        <label>
          평면 모양
          <select value={d.shape} onChange={(e) => set('shape', e.target.value as Shape)}>
            {SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {(isTent || d.category === 'tarp') && (
          <label>
            프레임
            <select value={d.frame} onChange={(e) => set('frame', e.target.value as Frame)}>
              {FRAMES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {isTent && (
        <details className="sub-details" open={!!d.inner || !!d.ground}>
          <summary>이너텐트 / 그라운드시트 (선택)</summary>
          {(['inner', 'ground'] as const).map((k) => (
            <div key={k} className="grid3">
              <label>
                {k === 'inner' ? '이너' : '그라운드'} 길이
                <input
                  type="number"
                  value={d[k]?.l || ''}
                  onChange={(e) => set(k, { l: Number(e.target.value), w: d[k]?.w ?? 0, offset: d[k]?.offset ?? 0 })}
                />
              </label>
              <label>
                너비
                <input
                  type="number"
                  value={d[k]?.w || ''}
                  onChange={(e) => set(k, { l: d[k]?.l ?? 0, w: Number(e.target.value), offset: d[k]?.offset ?? 0 })}
                />
              </label>
              <label>
                중심 오프셋
                <input
                  type="number"
                  value={d[k]?.offset ?? 0}
                  onChange={(e) => set(k, { l: d[k]?.l ?? 0, w: d[k]?.w ?? 0, offset: Number(e.target.value) })}
                />
              </label>
            </div>
          ))}
          <p className="muted small">오프셋: 텐트 중심에서 길이 방향으로 이동한 거리(cm). 이너가 뒤쪽에 있으면 +값</p>
        </details>
      )}
      <label className="inline">
        <input type="checkbox" checked={!!d.verified} onChange={(e) => set('verified', e.target.checked)} /> 공식 제원으로 확인함
      </label>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className="btn primary" disabled={!valid}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
