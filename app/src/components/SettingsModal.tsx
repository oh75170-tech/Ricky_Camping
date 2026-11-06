import { useState } from 'react';
import { checkPasscode, MODELS } from '../ai';
import { DEFAULT_SERVER } from '../config';
import { actions, getState, useStore } from '../store';
import { Modal } from './Modal';
import { DataPanel } from './DataPanel';
import { PublishPanel } from './PublishPanel';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const [d, setD] = useState(settings);
  const envServer = (import.meta.env.VITE_API_BASE as string | undefined) || DEFAULT_SERVER;
  const [check, setCheck] = useState<string | null>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((x) => ({ ...x, [k]: v }));

  return (
    <Modal title="설정" onClose={onClose}>
      <div className="gear-form">
        <label>
          서버 주소 (AI·공동 편집)
          <input value={d.serverUrl} onChange={(e) => set('serverUrl', e.target.value)} placeholder={envServer || 'https://ricky-camping-server.xxx.workers.dev'} />
        </label>
        {envServer && !d.serverUrl && <p className="muted small">기본 서버: {envServer}</p>}

        <div className="seg">
          <button type="button" className={d.aiMode === 'server' ? 'on' : ''} onClick={() => set('aiMode', 'server')}>
            서버 경유 (권장)
          </button>
          <button type="button" className={d.aiMode === 'direct' ? 'on' : ''} onClick={() => set('aiMode', 'direct')}>
            개인 API 키
          </button>
        </div>
        {d.aiMode === 'server' && (
          <>
            <label>
              AI 접속 코드
              <input type="password" value={d.passcode} onChange={(e) => (set('passcode', e.target.value), setCheck(null))} placeholder="관리자에게 받은 코드" autoComplete="off" />
            </label>
            <label>
              AI 검색 코드 (웹 검색용, 관리자가 따로 제공)
              <input
                type="password"
                value={d.searchCode}
                onChange={(e) => (set('searchCode', e.target.value), setCheck(null))}
                placeholder="없으면 비워두세요 – 브라우저 검색·직접 입력은 그대로 쓸 수 있어요"
                autoComplete="off"
              />
            </label>
            <div className="row">
              <button
                type="button"
                className="btn small"
                disabled={!d.passcode.trim()}
                onClick={async () => {
                  setCheck('확인 중…');
                  // 입력한 서버 주소로 확인하도록 잠시 반영
                  actions.setSettings({ serverUrl: d.serverUrl.trim() });
                  const r = await checkPasscode(d.passcode, d.searchCode);
                  if (r.result !== 'ok') {
                    setCheck(
                      r.result === 'wrong'
                        ? '✘ 접속 코드가 서버와 달라요. GitHub에 등록한 APP_PASSCODE 값과 똑같이(대소문자 포함) 입력해주세요.'
                        : r.result === 'offline'
                          ? '✘ 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.'
                          : '✘ 서버 주소가 없어요.',
                    );
                    return;
                  }
                  const search = !d.searchCode.trim()
                    ? 'AI 검색 코드는 비어 있어요(AI 검색 없이 사용).'
                    : !r.searchEnabled
                      ? '서버에 AI 검색이 아직 켜져 있지 않아요.'
                      : r.searchOk
                        ? '✔ AI 검색 코드도 맞아요.'
                        : '✘ AI 검색 코드가 달라요.';
                  setCheck(`✔ 접속 코드가 맞아요. ${search}`);
                }}
              >
                코드 확인
              </button>
              {check && <span className="small">{check}</span>}
            </div>
          </>
        )}
        {d.aiMode !== 'server' && (
          <label>
            Anthropic API 키
            <input type="password" value={d.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
          </label>
        )}
        <p className="muted small">
          {d.aiMode === 'server'
            ? '실제 API 키는 서버에만 있고, 이 기기에는 접속 코드만 저장됩니다.'
            : '키가 이 기기 브라우저에 저장되어 Anthropic으로 직접 전송됩니다. 본인 기기에서만 사용하세요.'}
        </p>
        <label>
          AI 모델
          <select value={d.model} onChange={(e) => set('model', e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <DataPanel />
        <PublishPanel />
        <div className="form-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const cleared = { ...d, apiKey: '', passcode: '', searchCode: '' };
              setD(cleared);
              actions.setSettings({ ...cleared, syncCode: getState().settings.syncCode, adminCode: '' });
            }}
          >
            키·코드 삭제
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              actions.setSettings({ ...d, syncCode: getState().settings.syncCode, adminCode: getState().settings.adminCode, serverUrl: d.serverUrl.trim(), apiKey: d.apiKey.trim(), passcode: d.passcode.trim(), searchCode: d.searchCode.trim() });
              onClose();
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}
