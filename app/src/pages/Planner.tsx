import { useMemo, useRef, useState } from 'react';
import { CanvasView, type CanvasHandle } from '../components/CanvasView';
import { GearPicker } from '../components/GearPicker';
import { GearForm } from '../components/GearForm';
import { LayerPanel } from '../components/LayerPanel';
import { MoreTents } from '../components/MoreTents';
import { ChatPanel } from '../components/ChatPanel';
import { SharePanel } from '../components/SharePanel';
import { SpecTable } from '../components/SpecTable';
import { SettingsModal } from '../components/SettingsModal';
import { actions, allBrands, allGear, getState, useStore } from '../store';
import type { Gear } from '../types';

type Tab = 'pick' | 'custom' | 'more' | 'layer' | 'chat' | 'share';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'pick', label: '장비 고르기', icon: '🎒' },
  { id: 'custom', label: '직접 입력', icon: '✏️' },
  { id: 'more', label: '텐트 더 놓기', icon: '⛺' },
  { id: 'layer', label: '레이어', icon: '🗂️' },
  { id: 'chat', label: 'AI 채팅', icon: '🤖' },
  { id: 'share', label: '공유하기', icon: '📤' },
];

const BIG = new Set(['tent', 'tarp']);

/** 새 장비 위치 계산 (m) */
function suggestPosition(g: Gear, siteId: string, forceNewColumn: boolean) {
  const s = getState();
  const gear = new Map(allGear(s).map((x) => [x.id, x]));
  const L = g.l / 100;
  const W = g.w / 100;
  const sitePl = s.placements.filter((p) => p.siteId === siteId);
  if (BIG.has(g.category)) {
    let maxRight = -Infinity;
    let refY = 1 + W / 2;
    const pool = forceNewColumn || sitePl.length === 0 ? s.placements : sitePl;
    for (const p of pool) {
      const pg = gear.get(p.gearId);
      if (!pg || !BIG.has(pg.category)) continue;
      const r = Math.max(pg.l, pg.w) / 200;
      if (p.x + r > maxRight) {
        maxRight = p.x + r;
        refY = p.y;
      }
    }
    if (maxRight === -Infinity) return { x: Math.round((1 + L / 2) * 10) / 10, y: Math.round(refY * 10) / 10 };
    return { x: Math.round((maxRight + 1.5 + L / 2) * 10) / 10, y: Math.round(refY * 10) / 10 };
  }
  // 가구: 사이트의 첫 텐트 근처 (조금씩 흩어서)
  const tent = sitePl.map((p) => ({ p, g: gear.get(p.gearId) })).find((x) => x.g && BIG.has(x.g.category));
  const n = sitePl.length;
  const jitter = ((n % 5) - 2) * 0.6;
  if (tent) return { x: Math.round((tent.p.x + jitter) * 10) / 10, y: Math.round((tent.p.y + ((n % 3) - 1) * 0.5) * 10) / 10 };
  return { x: s.campsite.w / 2 + jitter, y: s.campsite.h / 2 };
}

export function Planner({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<CanvasHandle>(null);
  const [tab, setTab] = useState<Tab | null>('pick');
  const [selected, setSelected] = useState<string | null>(null);
  const [activeSite, setActiveSite] = useState(() => getState().sites[0].id);
  const [showSettings, setShowSettings] = useState(false);
  const [specOpen, setSpecOpen] = useState(() => window.innerWidth >= 760 || window.innerHeight > 900);
  const sites = useStore((s) => s.sites);
  const placements = useStore((s) => s.placements);
  const extraBrands = useStore((s) => s.extraBrands);
  const customGear = useStore((s) => s.customGear);
  const brands = useMemo(() => allBrands(getState()), [extraBrands, customGear]);
  const site = sites.find((s) => s.id === activeSite) ?? sites[0];
  const selPl = placements.find((p) => p.id === selected);

  const placeGear = (g: Gear, siteId = site.id, newCol = false) => {
    const pos = suggestPosition(g, siteId, newCol);
    const id = actions.place(g.id, siteId, pos.x, pos.y, 0);
    setSelected(id);
    if (window.innerWidth < 760) setTab(null); // 폰: 패널 닫고 캔버스 보이기
  };

  const panel = () => {
    switch (tab) {
      case 'pick':
        return <GearPicker onPick={(g) => placeGear(g)} />;
      case 'custom':
        return (
          <div className="panel-body">
            <p className="muted small">DB에 없는 장비는 직접 입력하세요. 입력한 장비는 "장비제원"에도 저장됩니다.</p>
            <GearForm
              brands={brands}
              submitLabel="추가하고 배치"
              onSubmit={(d) => {
                const g = actions.addGear(d);
                actions.toggleOwned(g.id);
                placeGear(g);
              }}
            />
          </div>
        );
      case 'more':
        return (
          <MoreTents
            activeSiteId={site.id}
            onActiveSite={setActiveSite}
            onAddTentForSite={(g, sid, isNew) => placeGear(g, sid, isNew)}
          />
        );
      case 'layer':
        return <LayerPanel />;
      case 'chat':
        return <ChatPanel onOpenSettings={() => setShowSettings(true)} onPlace={(g) => placeGear(g)} />;
      case 'share':
        return <SharePanel getMap={() => canvasRef.current!.snapshot()} />;
      default:
        return null;
    }
  };

  return (
    <div className="planner">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="메인으로">
          ←
        </button>
        <h1>장비 배치</h1>
        <div className="site-badge" onClick={() => setTab('more')}>
          <span className="dot" style={{ background: site.color }} />
          {site.name}
        </div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="설정">
          ⚙️
        </button>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => {
              if (t.id === 'share') setSelected(null); // 내보내기 이미지에 선택 표시 제외
              if (t.id === 'chat' && window.innerWidth < 760) setSpecOpen(false); // 폰: 채팅 입력창 공간 확보
              setTab(tab === t.id ? null : t.id);
            }}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="planner-main">
        {tab && (
          <aside className="side-panel">
            <div className="sheet-handle" onClick={() => setTab(null)}>
              <span />
              <b>{TABS.find((t) => t.id === tab)?.label}</b>
              <button className="icon-btn" aria-label="패널 닫기">
                ✕
              </button>
            </div>
            <div className="side-scroll">{panel()}</div>
          </aside>
        )}
        <div className="stage-area">
          <CanvasView ref={canvasRef} selectedId={selected} onSelect={setSelected} />
          <div className="zoom-ctl">
            <button onClick={() => canvasRef.current?.zoom(1.25)} aria-label="확대">
              ＋
            </button>
            <button onClick={() => canvasRef.current?.zoom(0.8)} aria-label="축소">
              －
            </button>
            <button onClick={() => canvasRef.current?.fit()} aria-label="전체 보기">
              ⤢
            </button>
          </div>
          {selPl && (
            <div className="sel-bar">
              <button onClick={() => actions.movePlacement(selPl.id, { rot: (selPl.rot - 15 + 360) % 360 })}>↺ 15°</button>
              <button onClick={() => actions.movePlacement(selPl.id, { rot: (selPl.rot + 15) % 360 })}>↻ 15°</button>
              <button onClick={() => actions.movePlacement(selPl.id, { rot: (selPl.rot + 90) % 360 })}>90°</button>
              <button onClick={() => actions.reorder(selPl.id, 'front')}>앞으로</button>
              <button onClick={() => actions.reorder(selPl.id, 'back')}>뒤로</button>
              <button
                onClick={() => {
                  const id = actions.place(selPl.gearId, selPl.siteId, selPl.x + 0.5, selPl.y + 0.5, selPl.rot);
                  setSelected(id);
                }}
              >
                복제
              </button>
              <button
                className="danger"
                onClick={() => {
                  actions.removePlacement(selPl.id);
                  setSelected(null);
                }}
              >
                삭제
              </button>
            </div>
          )}
          {placements.length === 0 && (
            <div className="empty-hint">
              ← "장비 고르기"에서 텐트부터 골라보세요.
              <br />
              두 손가락으로 확대/축소, 빈 곳을 끌면 화면 이동
            </div>
          )}
        </div>
      </div>
      <footer className={`spec-bar ${specOpen ? 'open' : ''}`}>
        <button className="spec-toggle" onClick={() => setSpecOpen((o) => !o)}>
          📋 내가 고른 장비 제원 ({placements.length}) {specOpen ? '▾' : '▴'}
        </button>
        {specOpen && <SpecTable selectedId={selected} onSelect={setSelected} />}
      </footer>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
