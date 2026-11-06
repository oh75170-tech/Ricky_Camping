import { useState } from 'react';
import { catalogToPublish, publishCatalog } from '../catalog';
import { actions, useStore } from '../store';
import { ask } from '../env';

/** 관리자: 내가 추가·수정한 장비를 모두의 장비목록으로 공유 */
export function PublishPanel() {
  const saved = useStore((s) => s.settings.adminCode);
  const sharedAt = useStore((s) => s.sharedAt);
  const sharedCount = useStore((s) => s.sharedGear.length);
  useStore((s) => s.customGear); // 개수 갱신용
  const [open, setOpen] = useState(!!saved);
  const [code, setCode] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const count = catalogToPublish().gear.length;

  return (
    <section className="data-panel">
      <button type="button" className="linklike" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 장비목록 공유 (관리자)
      </button>
      {open && (
        <div className="data-box">
          <p className="muted small">
            내가 직접 추가하거나 고친 장비를 모든 사용자의 장비목록에 넣어요. 다른 사람의 보유장비·일정·배치는 건드리지 않아요.
            {sharedAt ? ` 지금 공유된 장비 ${sharedCount}개 (${new Date(sharedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })} 기준).` : ' 아직 공유된 장비가 없어요.'}
          </p>
          <input type="password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="관리자 코드 (GitHub의 ADMIN_CODE)" autoComplete="off" />
          <button
            type="button"
            className="btn small primary"
            disabled={busy || !code.trim() || !count}
            onClick={async () => {
              if (!ask(`장비 ${count}개를 모두에게 공유할까요?`)) return;
              setBusy(true);
              setMsg('올리는 중…');
              const r = await publishCatalog(code);
              setBusy(false);
              if (r.ok) {
                actions.setSettings({ adminCode: code.trim() });
                setMsg(`✔ 장비 ${r.count}개를 공유했어요. 다른 사람은 앱을 다시 열면 보여요.`);
              } else setMsg(`✘ ${r.message}`);
            }}
          >
            내 장비 {count}개 모두에게 공유
          </button>
          {msg && <p className="small">{msg}</p>}
        </div>
      )}
    </section>
  );
}
