import { actions, useStore } from '../store';
import type { Gear } from '../types';
import { Icon } from './Icon';

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
        {gear.shared && !gear.custom && <span className="badge warn" title="다른 사용자가 추가한 장비">모두의 장비</span>}
      </div>
      <div className="gear-dims">
        <span><Icon name="ruler" size={14} /> {dimText(gear)}</span>
        {gear.material && <span className="muted">{gear.material}</span>}
        {gear.weight && <span className="muted">{gear.weight}</span>}
      </div>
      {gear.note && <div className="muted small note">{gear.note}</div>}
      <div className="gear-actions">
        <button className={`chip ${owned ? 'on' : ''}`} onClick={() => actions.toggleOwned(gear.id)}>
          <Icon name={owned ? 'check' : 'plus'} size={14} /> 보유
        </button>
        <button className={`chip ${wish ? 'on wish' : ''}`} onClick={() => actions.toggleWish(gear.id)}>
          <Icon name="heart" size={14} /> 위시
        </button>
        {onEdit && (
          <button className="chip" onClick={() => onEdit(gear)}>
            <Icon name="edit" size={14} /> 수정
          </button>
        )}
        {onVerify && (
          <button className="chip" onClick={() => onVerify(gear)}>
            <Icon name="search" size={14} /> AI 확인
          </button>
        )}
        {gear.source && (
          <a className="chip" href={gear.source} target="_blank" rel="noreferrer">
            출처
          </a>
        )}
        {onPlace && (
          <button className="chip primary" onClick={() => onPlace(gear)}>
            배치
          </button>
        )}
      </div>
    </div>
  );
}
