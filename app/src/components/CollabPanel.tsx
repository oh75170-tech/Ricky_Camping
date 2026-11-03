import { useState } from 'react';
import { createRoom, leaveRoom, roomLink, useSyncStatus } from '../sync';
import { serverUrl } from '../config';
import { Icon } from './Icon';

export function CollabPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const st = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasServer = !!serverUrl();

  const link = st.roomId ? roomLink(st.roomId) : '';
  const copy = async () => {
    try {
      if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
        await navigator.share({ title: '캠핑 배치 같이 편집하기', url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* 취소 */
    }
  };

  return (
    <div className="panel-body">
      <h4>같이 편집하기</h4>
      <p className="muted small">링크를 받은 일행이 같은 배치도를 실시간으로 함께 수정할 수 있어요. 장비 이동·추가·삭제가 바로 반영됩니다.</p>
      {!hasServer && (
        <p className="notice small">
          서버 주소가 필요합니다.{' '}
          <button className="link" onClick={onOpenSettings}>
            설정 열기
          </button>
        </p>
      )}
      {st.roomId ? (
        <>
          <div className="room-box">
            <div className="row">
              <span className={`status-dot ${st.connected ? 'on' : ''}`} />
              <b>{st.connected ? '연결됨' : '연결 중…'}</b>
              <span className="muted small">
                <Icon name="users" size={14} /> {st.peers}명 접속
              </span>
            </div>
            <input className="search" readOnly value={link} onFocus={(e) => e.target.select()} />
            <div className="form-actions">
              <button className="btn ghost" onClick={() => leaveRoom()}>
                나가기
              </button>
              <button className="btn primary" onClick={copy}>
                <Icon name="link" size={16} /> {copied ? '복사됨' : '링크 공유'}
              </button>
            </div>
          </div>
          <p className="muted small">마지막으로 저장된 변경이 우선 적용됩니다. 같은 장비를 동시에 움직이면 나중에 놓은 위치가 남아요.</p>
        </>
      ) : (
        <button
          className="btn primary full"
          disabled={!hasServer || busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await createRoom();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="users" size={16} /> {busy ? '만드는 중…' : '현재 배치로 공동 편집 시작'}
        </button>
      )}
      {(err || st.error) && <p className="small danger">{err || st.error}</p>}
    </div>
  );
}
