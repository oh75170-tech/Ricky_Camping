import { useMemo, useState } from 'react';
import { allGear, useStore } from '../store';
import { CATEGORIES, type Category, type Gear } from '../types';
import { dimText } from './GearCard';

export function GearPicker({ onPick }: { onPick: (g: Gear) => void }) {
  const gear = useStore(allGear);
  const owned = useStore((s) => s.owned);
  const wish = useStore((s) => s.wish);
  const [scope, setScope] = useState<'mine' | 'all'>(owned.length + wish.length > 0 ? 'mine' : 'all');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return gear.filter((g) => {
      if (scope === 'mine' && !owned.includes(g.id) && !wish.includes(g.id)) return false;
      if (cat !== 'all' && g.category !== cat) return false;
      if (ql && !`${g.brand} ${g.name} ${g.model ?? ''}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [gear, scope, cat, q, owned, wish]);

  return (
    <div className="panel-body">
      <div className="seg">
        <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
          내 장비 ({owned.length + wish.length})
        </button>
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
          전체 DB
        </button>
      </div>
      <input className="search" placeholder="브랜드·제품명 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips-scroll">
        <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>
          전체
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className="muted small">
          {scope === 'mine' ? '장비제원 탭에서 "보유/위시"를 눌러 내 장비를 등록하거나, 전체 DB에서 골라보세요.' : '검색 결과가 없습니다. "직접 입력"이나 AI 채팅으로 추가해보세요.'}
        </p>
      )}
      <ul className="pick-list">
        {list.map((g) => (
          <li key={g.id}>
            <button onClick={() => onPick(g)}>
              <span className="pick-emoji">{CATEGORIES.find((c) => c.id === g.category)?.emoji}</span>
              <span className="pick-main">
                <b>{g.name}</b>
                <span className="muted small">
                  {g.brand} · {dimText(g)}
                  {owned.includes(g.id) ? ' · 보유' : wish.includes(g.id) ? ' · 위시' : ''}
                </span>
              </span>
              <span className="pick-add">＋</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
