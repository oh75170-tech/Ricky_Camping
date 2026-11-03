import { actions, useStore } from '../store';
import type { LayerStyle } from '../types';

const SLIDERS: { key: keyof LayerStyle; label: string }[] = [
  { key: 'ground', label: '그라운드시트' },
  { key: 'inner', label: '이너텐트' },
  { key: 'fly', label: '플라이(외피)' },
  { key: 'tarp', label: '타프' },
  { key: 'furniture', label: '가구·소품' },
];

export function LayerPanel() {
  const layer = useStore((s) => s.layer);
  const campsite = useStore((s) => s.campsite);
  return (
    <div className="panel-body">
      <h4>레이어 투명도</h4>
      {SLIDERS.map(({ key, label }) => (
        <label key={key} className="slider-row">
          <span>{label}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={layer[key] as number}
            onChange={(e) => actions.setLayer({ [key]: Number(e.target.value) })}
          />
          <span className="num">{Math.round((layer[key] as number) * 100)}%</span>
        </label>
      ))}
      <div className="toggles">
        <label>
          <input type="checkbox" checked={layer.showFrame} onChange={(e) => actions.setLayer({ showFrame: e.target.checked })} /> 프레임
        </label>
        <label>
          <input type="checkbox" checked={layer.showDims} onChange={(e) => actions.setLayer({ showDims: e.target.checked })} /> 치수
        </label>
        <label>
          <input type="checkbox" checked={layer.showLabels} onChange={(e) => actions.setLayer({ showLabels: e.target.checked })} /> 이름
        </label>
      </div>
      <h4>캠핑 사이트 크기</h4>
      <div className="row">
        <label className="inline">
          가로
          <input type="number" min={2} max={100} value={campsite.w} onChange={(e) => actions.setCampsite(Math.max(2, Number(e.target.value) || 2), campsite.h)} />m
        </label>
        <label className="inline">
          세로
          <input type="number" min={2} max={100} value={campsite.h} onChange={(e) => actions.setCampsite(campsite.w, Math.max(2, Number(e.target.value) || 2))} />m
        </label>
      </div>
    </div>
  );
}
