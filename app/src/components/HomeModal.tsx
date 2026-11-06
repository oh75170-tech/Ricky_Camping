import { useState } from 'react';
import { geocode, type CampResult } from '../geo';
import { actions, useStore } from '../store';
import { Modal } from './Modal';

/** 집(출발지) 위치 설정 – 소요시간 계산용. 이 기기(와 내 데이터 동기화)에만 저장 */
export function HomeModal({ onClose }: { onClose: () => void }) {
  const home = useStore((s) => s.home);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [list, setList] = useState<CampResult[]>([]);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await geocode(q.trim());
      setList(r);
      if (!r.length) setMsg('찾지 못했어요. "OO시 OO동"처럼 동네 이름으로 입력해보세요.');
    } catch {
      setMsg('위치 검색 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const useGps = () => {
    if (!navigator.geolocation) return setMsg('이 기기에서는 현재 위치를 쓸 수 없어요.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setBusy(false);
        actions.setHome({ label: '현재 위치에서 설정', lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 });
        onClose();
      },
      () => {
        setBusy(false);
        setMsg('현재 위치를 가져오지 못했어요. 위치 권한을 허용하거나 주소로 찾아주세요.');
      },
      { timeout: 10000 },
    );
  };

  return (
    <Modal title="집 위치 (출발지)" onClose={onClose}>
      <div className="gear-form">
        <p className="muted small">캠핑장까지 걸리는 시간을 계산할 때만 써요. 동네 수준(예: "수원시 영통동")으로 입력해도 충분합니다.</p>
        {home && (
          <p className="small" style={{ color: 'var(--ink)' }}>
            현재: <b>{home.label}</b>
          </p>
        )}
        <form
          className="row nowrap"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="주소 또는 동네 이름" style={{ flex: 1 }} />
          <button className="btn small primary" disabled={busy || !q.trim()}>
            찾기
          </button>
        </form>
        <button type="button" className="btn small" onClick={useGps} disabled={busy}>
          지금 위치를 집으로 설정
        </button>
        {busy && <p className="muted small">찾는 중…</p>}
        {msg && <p className="small">{msg}</p>}
        {list.length > 0 && (
          <div className="place-results">
            {list.map((x, i) => (
              <button
                type="button"
                key={i}
                className="place-item"
                onClick={() => {
                  actions.setHome({ label: x.address?.split(',').slice(0, 3).join(',') || x.name, lat: x.lat!, lng: x.lng! });
                  onClose();
                }}
              >
                <b>{x.name}</b>
                <span>{x.address}</span>
              </button>
            ))}
          </div>
        )}
        {home && (
          <div className="form-actions">
            <button type="button" className="btn ghost danger" onClick={() => (actions.setHome(null), onClose())}>
              집 위치 지우기
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
