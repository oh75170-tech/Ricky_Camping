import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Planner } from './pages/Planner';
import { Trips } from './pages/Trips';
import { joinRoom } from './sync';
import { getState } from './store';
import { IS_PREVIEW } from './env';

export type Page = 'home' | 'catalog' | 'planner' | 'trips';
interface Route {
  page: Page;
  /** 일정 화면에서 열어둔 일정 id ('new' = 새 일정) */
  tripId: string | null;
}

const hashOf = (r: Route) => (r.page === 'home' ? '#/' : `#/${r.page}${r.page === 'trips' && r.tripId ? `/${r.tripId}` : ''}`);

function parse(): Route {
  const [h, q] = location.hash.replace(/^#\/?/, '').split('?');
  const room = new URLSearchParams(q ?? '').get('room');
  if (room && /^[a-z0-9]{8,32}$/.test(room)) {
    const hasLocal = getState().placements.length > 0;
    if (!hasLocal || confirm('공동 편집 방에 참여할까요?\n현재 기기의 배치가 방의 배치로 바뀝니다.')) joinRoom(room);
    history.replaceState({ idx: 0 }, '', '#/planner');
    return { page: 'planner', tripId: null };
  }
  const m = h.match(/^trips(?:\/([\w-]+))?/);
  if (m) return { page: 'trips', tripId: m[1] ?? null };
  return { page: h === 'catalog' || h === 'planner' ? h : 'home', tripId: null };
}

/** 앱 안에서 몇 번째 화면인지 (0 이면 더 돌아갈 앱 화면이 없음) */
const depth = () => (history.state as { idx?: number } | null)?.idx ?? 0;

export default function App() {
  const [route, setRoute] = useState<Route>(() => (IS_PREVIEW ? { page: 'home', tripId: null } : parse()));

  useEffect(() => {
    if (IS_PREVIEW) return;
    if (history.state == null) history.replaceState({ idx: 0 }, '', location.hash || '#/');
    const on = () => setRoute(parse());
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
    };
  }, []);

  /** 새 화면으로 이동 (뒤로가기로 돌아올 수 있게 기록) */
  const go = (page: Page, tripId: string | null = null) => {
    const r = { page, tripId };
    if (!IS_PREVIEW) history.pushState({ idx: depth() + 1 }, '', hashOf(r));
    setRoute(r);
  };
  /** 뒤로: 앱 안에서 온 화면이 있으면 그리로, 없으면 지정한 화면으로 */
  const back = (fallback: Route) => {
    if (!IS_PREVIEW && depth() > 0) return history.back();
    if (!IS_PREVIEW) history.replaceState({ idx: 0 }, '', hashOf(fallback));
    setRoute(fallback);
  };
  const toHome = () => back({ page: 'home', tripId: null });

  if (route.page === 'catalog') return <Catalog onBack={toHome} onPlan={() => go('planner')} />;
  if (route.page === 'planner') return <Planner onBack={toHome} onOpenTrip={(id) => go('trips', id)} />;
  if (route.page === 'trips')
    return (
      <Trips
        openId={route.tripId}
        onOpen={(id) => go('trips', id)}
        onCloseTrip={() => back({ page: 'trips', tripId: null })}
        onBack={toHome}
        onPlanner={() => go('planner')}
      />
    );
  return <Home go={go} />;
}
