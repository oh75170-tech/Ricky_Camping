import { useState } from 'react';
import { MODELS } from '../ai';
import { actions, useStore } from '../store';
import { Modal } from './Modal';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const [key, setKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  return (
    <Modal title="설정" onClose={onClose}>
      <div className="gear-form">
        <label>
          Anthropic API 키 (AI 채팅·제원 검색용)
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." autoComplete="off" />
        </label>
        <p className="muted small">
          키는 이 기기의 브라우저에만 저장되고, AI 요청 시 Anthropic API로 직접 전송됩니다. 공용 기기에서는 사용 후 지워주세요.
          키는 console.anthropic.com 에서 발급할 수 있습니다.
        </p>
        <label>
          AI 모델
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button
            className="btn ghost"
            onClick={() => {
              setKey('');
              actions.setSettings({ apiKey: '' });
            }}
          >
            키 삭제
          </button>
          <button
            className="btn primary"
            onClick={() => {
              actions.setSettings({ apiKey: key.trim(), model });
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
