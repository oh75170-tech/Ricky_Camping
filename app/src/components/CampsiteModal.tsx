import { useState } from 'react';
import { actions, useStore } from '../store';
import { Modal } from './Modal';

const PRESETS = [
  { w: 6, h: 8, label: '소형 6×8' },
  { w: 8, h: 8, label: '8×8' },
  { w: 8, h: 10, label: '일반 8×10' },
  { w: 10, h: 10, label: '10×10' },
  { w: 10, h: 12, label: '대형 10×12' },
  { w: 15, h: 12, label: '단체 15×12' },
  { w: 20, h: 15, label: '단체 20×15' },
];

/** 배치 시작 전 캠핑장(사이트) 크기 입력 */
export function CampsiteModal({ onClose }: { onClose: () => void }) {
  const campsite = useStore((s) => s.campsite);
  const [name, setName] = useState(campsite.name);
  const [w, setW] = useState(campsite.w);
  const [h, setH] = useState(campsite.h);
  const valid = w >= 2 && h >= 2 && w <= 200 && h <= 200;
  return (
    <Modal title="캠핑장 사이트 크기" onClose={onClose}>
      <div className="gear-form">
        <p className="muted small">예약한 사이트(데크/파쇄석) 크기를 입력하면 그 범위가 격자 위에 표시됩니다. 캠핑장 안내 페이지나 예약 화면의 "사이트 크기"를 참고하세요.</p>
        <label>
          캠핑장 / 사이트 이름 (선택)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: OO캠핑장 A-12" />
        </label>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className={`chip ${w === p.w && h === p.h ? 'on' : ''}`}
              onClick={() => {
                setW(p.w);
                setH(p.h);
              }}
            >
              {p.label}m
            </button>
          ))}
        </div>
        <div className="grid2">
          <label>
            가로 (m)
            <input type="number" inputMode="decimal" min={2} max={200} step={0.5} value={w || ''} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label>
            세로 (m)
            <input type="number" inputMode="decimal" min={2} max={200} step={0.5} value={h || ''} onChange={(e) => setH(Number(e.target.value))} />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn primary"
            disabled={!valid}
            onClick={() => {
              actions.setCampsite(w, h, name.trim());
              onClose();
            }}
          >
            이 크기로 시작
          </button>
        </div>
      </div>
    </Modal>
  );
}
