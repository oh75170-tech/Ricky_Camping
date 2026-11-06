import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Planner } from './pages/Planner';
import { Trips } from './pages/Trips';
import { joinRoom } from './sync';
import { getState } from './store';
import { IS_PREVIEW } from './env';

type Page = 'home' | 'catalog' | 'planner' | 'trips';

const fromHash = (): Page => {
  const [h, q] = location.hash.replace('#/', '').split('?');
  const room = new URLSearchParams(q ?? '').get('room');
  if (room && /^[a-z0-9]{8,32}$/.test(room)) {
    const hasLocal = getState().placements.length > 0;
    if (!hasLocal || confirm('공동 편집 방에 참여할까요?\n현재 기기의 배치가 방의 배치로 바뀝니다.')) joinRoom(room);
    history.replaceState(null, '', '#/planner');
  }
  if (h.startsWith('trips')) return 'trips';
  return h === 'catalog' || h === 'planner' ? h : 'home';
};

const tripFromHash = () => {
  const m = location.hash.match(/^#\/trips\/([\w-]+)/);
  return m ? m[1] : null;
};

export default function App() {
  const [page, setPage] = useState<Page>(() => (IS_PREVIEW ? 'home' : fromHash()));
  useEffect(() => {
    if (IS_PREVIEW) return;
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const [tripId, setTripId] = useState<string | null>(() => tripFromHash());
  const go = (p: Page, id?: string) => {
    setTripId(p === 'trips' ? id ?? null : null);
    if (!IS_PREVIEW) location.hash = p === 'home' ? '' : `#/${p}${p === 'trips' && id ? `/${id}` : ''}`;
    setPage(p);
  };
  if (page === 'catalog') return <Catalog onBack={() => go('home')} onPlan={() => go('planner')} />;
  if (page === 'planner') return <Planner onBack={() => go('home')} onOpenTrip={(id) => go('trips', id)} />;
  if (page === 'trips') return <Trips key={tripId ?? 'list'} initialId={tripId} onBack={() => go('home')} onPlanner={() => go('planner')} />;
  return <Home go={go} />;
}
