import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Planner } from './pages/Planner';
import { joinRoom } from './sync';
import { getState } from './store';
import { IS_PREVIEW } from './env';

type Page = 'home' | 'catalog' | 'planner';

const fromHash = (): Page => {
  const [h, q] = location.hash.replace('#/', '').split('?');
  const room = new URLSearchParams(q ?? '').get('room');
  if (room && /^[a-z0-9]{8,32}$/.test(room)) {
    const hasLocal = getState().placements.length > 0;
    if (!hasLocal || confirm('공동 편집 방에 참여할까요?\n현재 기기의 배치가 방의 배치로 바뀝니다.')) joinRoom(room);
    history.replaceState(null, '', '#/planner');
  }
  return h === 'catalog' || h === 'planner' ? h : 'home';
};

export default function App() {
  const [page, setPage] = useState<Page>(() => (IS_PREVIEW ? 'home' : fromHash()));
  useEffect(() => {
    if (IS_PREVIEW) return;
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: Page) => {
    if (!IS_PREVIEW) location.hash = p === 'home' ? '' : `#/${p}`;
    setPage(p);
  };
  if (page === 'catalog') return <Catalog onBack={() => go('home')} onPlan={() => go('planner')} />;
  if (page === 'planner') return <Planner onBack={() => go('home')} />;
  return <Home go={go} />;
}
