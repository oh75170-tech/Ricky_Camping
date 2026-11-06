import { useRef, useState } from 'react';
import { actions, getState, useStore } from '../store';
import { deletePhotos } from '../photos';
import { applyBackup, makeBackup, readBackup, type BackupFile, resolveConflict, syncNow, useCloudStatus } from '../cloud';
import { downloadBlob } from '../share';
import { ask, IS_PREVIEW } from '../env';
import { Icon } from './Icon';

/** 설정 화면의 "내 데이터": 서버 자동 동기화 + 백업 파일 */
export function DataPanel() {
  const code = useStore((s) => s.settings.syncCode);
  const passcode = useStore((s) => s.settings.passcode);
  const cloud = useCloudStatus();
  const [draft, setDraft] = useState(code);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<({ name: string } & BackupFile) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const time = (t: number | null) => (t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <section className="data-panel">
      <h4>내 데이터</h4>

      {!IS_PREVIEW && (
        <div className="data-box">
          <b>서버 자동 동기화</b>
          <p className="muted small">
            동기화 코드를 정해두면 장비·보유목록·배치가 서버에 자동 저장돼요. 앱을 다시 깔거나 다른 기기에서도 같은 코드를 넣으면 그대로 불러옵니다.
            {!passcode && ' (먼저 위에서 AI 접속 코드를 넣어주세요)'}
          </p>
          <div className="row">
            <input
              id="sync-code"
              className="search"
              style={{ flex: 1, minWidth: 0 }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="예: 리키캠핑-우리집-2026 (나만 아는 코드)"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn small primary"
              disabled={!draft.trim() || !passcode}
              onClick={() => {
                actions.setSettings({ syncCode: draft.trim() });
                syncNow({ firstConnect: true });
              }}
            >
              {code && code === draft.trim() ? '다시 동기화' : '연결'}
            </button>
          </div>
          {code && (
            <div className="row small">
              <span className={`status-dot ${cloud.state === 'saved' ? 'on' : ''}`} />
              <span>
                {cloud.message || '대기 중'}
                {cloud.savedAt && cloud.state === 'saved' ? ` · ${time(cloud.savedAt)}` : ''}
              </span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  actions.setSettings({ syncCode: '' });
                  setDraft('');
                  syncNow();
                }}
              >
                동기화 끄기
              </button>
            </div>
          )}
          {cloud.state === 'conflict' && cloud.remote && (
            <div className="notice small">
              서버에 저장된 데이터와 이 기기의 데이터가 둘 다 있어요. 어느 쪽을 쓸까요?
              <div className="form-actions" style={{ marginTop: 8 }}>
                <button type="button" className="btn small ghost" onClick={() => resolveConflict(false)}>
                  이 기기 데이터로 덮어쓰기
                </button>
                <button type="button" className="btn small primary" onClick={() => resolveConflict(true)}>
                  서버 데이터 불러오기
                </button>
              </div>
            </div>
          )}
          <p className="muted small">코드를 아는 사람은 같은 데이터를 볼 수 있으니, 남이 짐작하기 어려운 코드로 정해주세요.</p>
        </div>
      )}

      <div className="data-box">
        <b>백업 파일</b>
        <p className="muted small">지금 데이터를 파일로 저장해 두고, 나중에 불러올 수 있어요.</p>
        <div className="row">
          <button
            type="button"
            className="btn small"
            disabled={IS_PREVIEW}
            onClick={async () => {
              const d = new Date();
              const name = `campcanvas-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
              try {
                const where = await downloadBlob(await makeBackup(), name);
                setMsg(where ? `백업을 저장했어요: ${where} 폴더의 ${name}` : `백업 파일(${name})을 저장했어요.`);
              } catch (e) {
                setMsg(`저장 실패: ${(e as Error).message}`);
              }
            }}
          >
            <Icon name="download" size={14} /> 백업 파일 저장
          </button>
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            <Icon name="share" size={14} /> 백업 불러오기
          </button>
          <input
            ref={fileRef}
            id="backup-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setPending({ name: f.name, ...(await readBackup(f)) });
                setMsg(null);
              } catch (err) {
                setMsg((err as Error).message);
              }
            }}
          />
        </div>
        {IS_PREVIEW && <p className="muted small">미리보기에서는 파일 저장이 막혀 있어요. 설치한 앱에서 저장해주세요.</p>}
        {pending && (
          <div className="notice small">
            <b>{pending.name}</b> · 장비 {pending.data.customGear.length}개 직접 추가, 보유 {pending.data.owned.length}개, 배치 {pending.data.placements.length}개, 일정 {pending.data.trips?.length ?? 0}개{Object.keys(pending.photos).length ? `, 사진 ${Object.keys(pending.photos).length}장` : ''}
            <br />
            불러오면 지금 이 기기의 장비·보유목록·배치가 백업 내용으로 바뀝니다.
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button type="button" className="btn small ghost" onClick={() => setPending(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn small primary"
                onClick={async () => {
                  await applyBackup(pending);
                  setPending(null);
                  setMsg('백업을 불러왔어요.');
                }}
              >
                불러오기
              </button>
            </div>
          </div>
        )}
        {msg && <p className="small notice">{msg}</p>}
      </div>
      <div className="data-box">
        <b>처음 상태로 초기화</b>
        <p className="muted small">보유·위시 목록, 직접 추가한 장비, 배치, 캠핑일정·사진, 집 위치를 모두 지워요. 설정(코드)과 공유 장비목록은 남아요. 내 데이터 동기화를 켜 두었다면 서버의 내 데이터도 비워져요.</p>
        <button
          type="button"
          className="btn small ghost danger"
          onClick={async () => {
            if (!ask('정말 모두 지울까요? 되돌릴 수 없어요.\n(필요하면 먼저 백업 파일을 저장하세요)')) return;
            const photos = getState().trips.flatMap((t) => t.photos ?? []);
            if (photos.length) await deletePhotos(photos);
            actions.resetData();
            setMsg('처음 상태로 초기화했어요.');
          }}
        >
          <Icon name="trash" size={14} /> 모두 지우고 새로 시작
        </button>
      </div>
    </section>
  );
}
