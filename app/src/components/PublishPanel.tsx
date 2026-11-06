import { useMemo, useState } from 'react';
import { deleteSharedGear, loadSharedCatalog, publishOverrides, pushMyGear } from '../catalog';
import { actions, useStore } from '../store';
import { ask } from '../env';

/** 모두의 장비목록 안내 + 관리자(삭제) 도구 */
export function PublishPanel() {
  const adminSaved = useStore((s) => s.settings.adminCode);
  const shared = useStore((s) => s.sharedGear);
  const sharedAt = useStore((s) => s.sharedAt);
  const custom = useStore((s) => s.customGear);
  const overrides = useStore((s) => s.overrides);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(adminSaved);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const mine = useMemo(() => new Set(custom.map((g) => g.id)), [custom]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return shared.filter((g) => !k || `${g.brand} ${g.name} ${g.model ?? ''}`.toLowerCase().includes(k)).slice().reverse();
  }, [shared, q]);
  const myShared = shared.filter((g) => mine.has(g.id)).length;

  return (
    <section className="data-panel">
      <div className="data-box">
        <b>모두의 장비목록</b>
        <p className="muted small">
          직접 추가하거나 AI·웹 검색으로 추가한 장비는 자동으로 모든 사용자의 장비목록에 올라가요(보유·위시·일정·배치는 올라가지 않아요). 지금 모두의 장비{' '}
          {shared.length}개 · 내가 올린 장비 {myShared}개
          {sharedAt ? ` · ${new Date(sharedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} 기준` : ''}
        </p>
        <div className="row">
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              setMsg('확인 중…');
              await pushMyGear();
              await loadSharedCatalog();
              setMsg('✔ 최신 상태예요.');
            }}
          >
            지금 새로고침
          </button>
          <button type="button" className="linklike" onClick={() => setOpen(!open)}>
            {open ? '▾' : '▸'} 관리자 (장비 지우기)
          </button>
        </div>
        {open && (
          <div className="admin-box">
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => actions.setSettings({ adminCode: code.trim() })}
              placeholder="관리자 코드 (GitHub의 ADMIN_CODE)"
              autoComplete="off"
            />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지울 장비 찾기 (브랜드·이름)" />
            <div className="admin-list">
              {list.slice(0, 60).map((g) => (
                <div key={g.id} className="admin-row">
                  <span>
                    <small className="muted">{g.brand}</small> {g.name}
                    {mine.has(g.id) && <small className="muted"> · 내가 올림</small>}
                  </span>
                  <button
                    type="button"
                    className="btn small ghost danger"
                    disabled={!code.trim() && !mine.has(g.id)}
                    onClick={async () => {
                      if (!ask(`"${g.brand} ${g.name}"을(를) 모두의 장비목록에서 지울까요?`)) return;
                      actions.setSettings({ adminCode: code.trim() });
                      const r = await deleteSharedGear(g.id, code);
                      setMsg(r.ok ? `✔ ${g.name}을(를) 지웠어요.` : `✘ ${r.message}`);
                    }}
                  >
                    지우기
                  </button>
                </div>
              ))}
              {!list.length && <p className="muted small">공유된 장비가 없어요.</p>}
            </div>
            {Object.keys(overrides).length > 0 && (
              <button
                type="button"
                className="btn small"
                disabled={!code.trim()}
                onClick={async () => {
                  if (!ask(`내가 고친 기본 장비 제원 ${Object.keys(overrides).length}개를 모두에게 반영할까요?`)) return;
                  actions.setSettings({ adminCode: code.trim() });
                  const r = await publishOverrides(code);
                  setMsg(`${r.ok ? '✔' : '✘'} ${r.message}`);
                }}
              >
                내가 고친 기본 장비 제원 모두에게 반영
              </button>
            )}
          </div>
        )}
        {msg && <p className="small">{msg}</p>}
      </div>
    </section>
  );
}
