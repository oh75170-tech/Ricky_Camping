import { useRef, useState } from 'react';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { chat, normalizeGear, parseGearJson, plannerSystemPrompt, NoKeyError } from '../ai';
import { actions, allGear, getState } from '../store';
import type { Gear } from '../types';
import { dimText } from './GearCard';
import { IS_PREVIEW } from '../env';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  gear?: Omit<Gear, 'id'>[];
}

function buildContext(): string {
  const s = getState();
  const gear = allGear(s);
  const byId = new Map(gear.map((g) => [g.id, g]));
  const owned = s.owned.map((id) => byId.get(id)).filter(Boolean) as Gear[];
  const lines = [
    `캠핑 사이트 크기: ${s.campsite.w}m × ${s.campsite.h}m`,
    `사이트(그룹): ${s.sites.map((x) => x.name).join(', ')}`,
    `보유 장비: ${owned.map((g) => `${g.brand} ${g.name}(${dimText(g)})`).join('; ') || '없음'}`,
    `배치된 장비:`,
    ...s.placements.map((p) => {
      const g = byId.get(p.gearId);
      const site = s.sites.find((x) => x.id === p.siteId);
      return `- [${site?.name}] ${g?.brand} ${g?.name} ${g ? dimText(g) : ''} @ (${p.x}m, ${p.y}m) 회전 ${p.rot}°`;
    }),
  ];
  return lines.join('\n');
}

const stripBlocks = (t: string) => t.replace(/```(?:gear|json)[\s\S]*?(```|$)/g, '').trim();

export function ChatPanel({ onOpenSettings, onPlace }: { onOpenSettings: () => void; onPlace?: (g: Gear) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: 'assistant',
      text: '안녕하세요! 장비 제원이 애매하거나 배치가 고민되시면 물어보세요. 예) "랜드락 앞에 헥사타프 붙이면 몇 m 필요해요?", "콜맨 웨더마스터 제원 찾아서 추가해줘"',
    },
  ]);
  const [history, setHistory] = useState<BetaMessageParam[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setErr(null);
    setBusy(true);
    const nextHistory: BetaMessageParam[] = [...history, { role: 'user', content: text }];
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '…' }]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await chat(
        nextHistory,
        plannerSystemPrompt(buildContext()),
        (full) => {
          setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', text: stripBlocks(full) || '검색 중…' }]);
          endRef.current?.scrollIntoView({ block: 'end' });
        },
        ac.signal,
      );
      setHistory(res.history);
      const items = parseGearJson(res.text).map((g) => normalizeGear(g, g.brand ?? '기타'));
      setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', text: stripBlocks(res.text), gear: items.length ? items : undefined }]);
    } catch (e) {
      setMsgs((m) => m.slice(0, -1));
      if (e instanceof NoKeyError) setErr(e.message);
      else if ((e as Error).name === 'AbortError') setErr('중단했습니다.');
      else setErr(`오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    }
  };

  return (
    <div className="chat">
      {IS_PREVIEW && <p className="notice small" style={{ margin: 12 }}>미리보기에서는 Claude가 웹 검색 없이 알고 있는 정보로 답해요. 처음 한 번은 AI 사용 허용 창이 뜹니다.</p>}
      <div className="chat-log">
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-text">{m.text}</div>
            {m.gear?.map((g, j) => (
              <div key={j} className="chat-gear">
                <div>
                  <b>
                    {g.brand} {g.name}
                  </b>
                  <div className="small muted">
                    {g.l}×{g.w}×{g.h}cm · {g.material ?? ''} {g.verified ? '· 확인됨' : '· 추정'}
                  </div>
                </div>
                <button
                  className="chip primary"
                  onClick={() => {
                    const added = actions.addGear(g);
                    actions.toggleOwned(added.id);
                    onPlace?.(added);
                  }}
                >
                  {onPlace ? '추가+배치' : 'DB에 추가'}
                </button>
              </div>
            ))}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {err && (
        <div className="chat-err">
          {err}{' '}
          {err.includes('설정') && !IS_PREVIEW && (
            <button className="link" onClick={onOpenSettings}>
              설정 열기
            </button>
          )}
        </div>
      )}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="질문을 입력하세요" enterKeyHint="send" />
        {busy ? (
          <button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>
            중지
          </button>
        ) : (
          <button type="submit" className="btn primary" disabled={!input.trim()}>
            전송
          </button>
        )}
      </form>
    </div>
  );
}
