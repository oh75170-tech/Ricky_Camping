import { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { Catalog } from './pages/Catalog';
import { Planner } from './pages/Planner';

type Page = 'home' | 'catalog' | 'planner';

const fromHash = (): Page => {
  const h = location.hash.replace('#/', '');
  return h === 'catalog' || h === 'planner' ? h : 'home';
};

export default function App() {
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: Page) => {
    location.hash = p === 'home' ? '' : `#/${p}`;
    setPage(p);
  };
  if (page === 'catalog') return <Catalog onBack={() => go('home')} onPlan={() => go('planner')} />;
  if (page === 'planner') return <Planner onBack={() => go('home')} />;
  return <Home go={go} />;
}
