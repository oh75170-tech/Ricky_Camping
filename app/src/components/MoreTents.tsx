import { useMemo, useState } from 'react';
import { actions, allGear, useStore } from '../store';
import type { Gear } from '../types';
import { dimText } from './GearCard';
import { Icon } from './Icon';
import { ask } from '../env';

export function MoreTents({
  activeSiteId,
  onActiveSite,
  onAddTentForSite,
}: {
  activeSiteId: string;
  onActiveSite: (id: string) => void;
  onAddTentForSite: (g: Gear, siteId: string, newSite: boolean) => void;
}) {
  const sites = useStore((s) => s.sites);
  const placements = useStore((s) => s.placements);
  const gear = useStore(allGear);
  const tents = useMemo(() => gear.filter((g) => g.category === 'tent' || g.category === 'tarp'), [gear]);
  const [name, setName] = useState(`일행 ${sites.length + 1}`);
  const [tentId, setTentId] = useState(tents[0]?.id ?? '');

  return (
    <div className="panel-body">
      <h4>사이트(일행) 목록</h4>
      <p className="muted small">선택한 사이트에 이후 추가하는 장비가 들어갑니다. 사이트마다 색이 달라요.</p>
      <ul className="site-list">
        {sites.map((s) => (
          <li key={s.id} className={s.id === activeSiteId ? 'on' : ''}>
            <button className="site-pick" onClick={() => onActiveSite(s.id)}>
              <span className="dot" style={{ background: s.color }} />
            </button>
            <input value={s.name} onChange={(e) => actions.renameSite(s.id, e.target.value)} onFocus={() => onActiveSite(s.id)} />
            <span className="muted small">{placements.filter((p) => p.siteId === s.id).length}개</span>
            {sites.length > 1 && (
              <button
                className="icon-btn"
                aria-label="사이트 삭제"
                onClick={() => {
                  if (ask(`'${s.name}' 사이트와 배치된 장비를 삭제할까요?`)) {
                    actions.removeSite(s.id);
                    if (s.id === activeSiteId) onActiveSite(sites[0].id);
                  }
                }}
              >
                <Icon name="trash" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <h4>텐트 더 놓기 (단체캠핑)</h4>
      <div className="gear-form">
        <label>
          일행/사이트 이름
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          텐트·타프
          <select value={tentId} onChange={(e) => setTentId(e.target.value)}>
            {tents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.brand} {t.name} ({dimText(t)})
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button
            className="btn ghost"
            onClick={() => {
              const t = tents.find((x) => x.id === tentId);
              if (t) onAddTentForSite(t, activeSiteId, false);
            }}
          >
            현재 사이트에 추가
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const t = tents.find((x) => x.id === tentId);
              if (!t) return;
              const site = actions.addSite(name.trim() || `일행 ${sites.length + 1}`);
              onActiveSite(site.id);
              onAddTentForSite(t, site.id, true);
              setName(`일행 ${sites.length + 2}`);
            }}
          >
            새 일행으로 옆에 배치
          </button>
        </div>
        <p className="muted small">새 텐트는 기존 텐트 오른쪽에 1.5m 간격(팩·스트링 여유)으로 놓입니다. 손가락으로 끌어 옮기고, 위쪽 동그란 손잡이로 회전하세요.</p>
      </div>
    </div>
  );
}
