import { actions, useStore } from '../store';
import type { Gear } from '../types';

export function dimText(g: Gear) {
  return `${g.l} × ${g.w}${g.h ? ` × ${g.h}` : ''} cm`;
}

export function GearCard({
  gear,
  onPlace,
  onEdit,
  onVerify,
}: {
  gear: Gear;
  onPlace?: (g: Gear) => void;
  onEdit?: (g: Gear) => void;
  onVerify?: (g: Gear) => void;
}) {
  const owned = useStore((s) => s.owned.includes(gear.id));
  const wish = useStore((s) => s.wish.includes(gear.id));
  return (
    <div className="gear-card">
      <div className="gear-card-head">
        <div>
          <div className="gear-name">{gear.name}</div>
          <div className="muted small">
            {gear.brand}
            {gear.model ? ` · ${gear.model}` : ''}
          </div>
        </div>
        {gear.verified ? <span className="badge ok">확인됨</span> : <span className="badge warn">추정</span>}
      </div>
      <div className="gear-dims">
        <span>📏 {dimText(gear)}</span>
        {gear.material && <span>🧵 {gear.material}</span>}
        {gear.weight && <span>⚖️ {gear.weight}</span>}
      </div>
      {gear.note && <div className="muted small note">{gear.note}</div>}
      <div className="gear-actions">
        <button className={`chip ${owned ? 'on' : ''}`} onClick={() => actions.toggleOwned(gear.id)}>
          {owned ? '✔ 보유' : '+ 보유'}
        </button>
        <button className={`chip ${wish ? 'on wish' : ''}`} onClick={() => actions.toggleWish(gear.id)}>
          {wish ? '♥ 위시' : '♡ 위시'}
        </button>
        {onEdit && (
          <button className="chip" onClick={() => onEdit(gear)}>
            ✏️ 수정
          </button>
        )}
        {onVerify && (
          <button className="chip" onClick={() => onVerify(gear)}>
            🔎 AI 확인
          </button>
        )}
        {gear.source && (
          <a className="chip" href={gear.source} target="_blank" rel="noreferrer">
            출처
          </a>
        )}
        {onPlace && (
          <button className="chip primary" onClick={() => onPlace(gear)}>
            배치 →
          </button>
        )}
      </div>
    </div>
  );
}
