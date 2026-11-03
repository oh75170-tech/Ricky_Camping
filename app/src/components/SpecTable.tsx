import { useMemo } from 'react';
import { allGear, useStore } from '../store';
import { CATEGORIES } from '../types';

const fmt = (cm: number) => (cm >= 100 ? `${(cm / 100).toFixed(2)}m` : `${cm}cm`);

export function SpecTable({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const placements = useStore((s) => s.placements);
  const sites = useStore((s) => s.sites);
  const gear = useStore(allGear);
  const map = useMemo(() => new Map(gear.map((g) => [g.id, g])), [gear]);

  if (placements.length === 0) {
    return <div className="spec-empty">배치한 장비가 없습니다. 위에서 장비를 골라 추가해보세요.</div>;
  }
  return (
    <div className="spec-scroll">
      <table className="spec-table">
        <thead>
          <tr>
            <th>사이트</th>
            <th>장비</th>
            <th>길이</th>
            <th>너비</th>
            <th>높이</th>
            <th>재질</th>
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => {
            const g = map.get(p.gearId);
            if (!g) return null;
            const site = sites.find((s) => s.id === p.siteId);
            const cat = CATEGORIES.find((c) => c.id === g.category);
            return (
              <tr key={p.id} className={p.id === selectedId ? 'sel' : ''} onClick={() => onSelect(p.id)}>
                <td>
                  <span className="dot" style={{ background: site?.color }} />
                  {site?.name}
                </td>
                <td>
                  {cat?.emoji} <b>{g.name}</b>
                  <div className="muted small">
                    {g.brand}
                    {!g.verified && <span className="badge warn">추정</span>}
                  </div>
                </td>
                <td>{fmt(g.l)}</td>
                <td>{fmt(g.w)}</td>
                <td>{g.h ? fmt(g.h) : '-'}</td>
                <td className="small">{g.material ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
