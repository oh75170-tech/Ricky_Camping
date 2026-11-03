import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { CATEGORIES, type Category, type Gear } from './types';
import { getState } from './store';
import { serverUrl } from './config';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (기본·정확)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (빠름)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (가장 저렴)' },
];

export class NoKeyError extends Error {
  constructor(msg = '설정에서 AI 접속 코드(또는 API 키)를 먼저 입력해주세요.') {
    super(msg);
  }
}

function client() {
  const { aiMode, apiKey, passcode } = getState().settings;
  if (aiMode === 'server') {
    const base = serverUrl();
    if (!base) throw new NoKeyError('설정에서 서버 주소를 입력해주세요.');
    if (!passcode) throw new NoKeyError();
    // 서버가 실제 API 키를 붙여 Anthropic으로 전달합니다. 브라우저에는 접속 코드만 저장됩니다.
    return new Anthropic({ apiKey: passcode, baseURL: `${base}/anthropic`, dangerouslyAllowBrowser: true });
  }
  if (!apiKey) throw new NoKeyError();
  // 개인 키 직접 모드: 키는 이 기기(localStorage)에만 저장되어 브라우저에서 직접 호출합니다.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const WEB_SEARCH = { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 5 };

/** 모델별 서버측 폴백(거절 시 자동 대체) 옵션 */
function fallbackOpts(model: string) {
  if (model.startsWith('claude-haiku')) return {};
  return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
}

export interface ChatResult {
  /** API에 다시 보낼 전체 대화 (thinking 블록 포함, 수정 금지) */
  history: BetaMessageParam[];
  text: string;
}

/**
 * 스트리밍 대화. web_search 서버툴이 pause_turn 으로 멈추면 자동으로 이어서 요청.
 */
export async function chat(
  history: BetaMessageParam[],
  system: string,
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const c = client();
  const model = getState().settings.model;
  let msgs = [...history];
  let text = '';
  for (let i = 0; i < 4; i++) {
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        system,
        messages: msgs,
        tools: [WEB_SEARCH],
        output_config: { effort: 'medium' },
        ...fallbackOpts(model),
      },
      { signal },
    );
    stream.on('text', (delta) => {
      text += delta;
      onText(text);
    });
    const final = await stream.finalMessage();
    msgs = [...msgs, { role: 'assistant', content: final.content as BetaContentBlock[] }];
    if (final.stop_reason === 'refusal') {
      text += '\n\n(이 요청에는 답변할 수 없어요. 질문을 바꿔서 다시 시도해주세요.)';
      onText(text);
      break;
    }
    if (final.stop_reason !== 'pause_turn') break;
  }
  return { history: msgs, text };
}

const CAT_IDS = CATEGORIES.map((c) => c.id).join('|');

const LOOKUP_SYSTEM = `당신은 캠핑 장비 제원 조사원입니다. web_search로 공식 홈페이지(우선)와 신뢰할 수 있는 판매처를 찾아 제원을 확인하세요.
규칙:
- 단위는 cm. 텐트/타프는 설치 시 외형(플라이) 길이(l, 긴 쪽)·너비(w)·최고 높이(h).
- 가구는 사용 시 외형 치수.
- 확인되지 않은 값은 추정하되 verified를 false로 하고 note에 무엇이 추정인지 적으세요.
- 답변 마지막에 반드시 아래 형식의 JSON 코드블록 하나만 출력하세요.
\`\`\`json
{"items":[{"brand":"브랜드(한글)","category":"${CAT_IDS}","name":"제품명","model":"모델번호","l":0,"w":0,"h":0,"material":"재질","weight":"무게","shape":"rect|tunnel|dome|hex|round|tarp-hexa|tarp-rect","frame":"none|dome-x|arches|onepole|ridge|springbar|air","frameCount":0,"inner":{"l":0,"w":0,"offset":0},"verified":true,"note":"","source":"URL"}]}
\`\`\`
inner는 이너텐트가 있을 때만. 최대 12개.`;

export function parseGearJson(text: string): Partial<Gear>[] {
  const m = text.match(/```(?:json|gear)?\s*([\s\S]*?)```/g);
  if (!m) return [];
  for (const block of m.reverse()) {
    const body = block.replace(/```(?:json|gear)?/, '').replace(/```$/, '').trim();
    try {
      const obj = JSON.parse(body);
      const items = Array.isArray(obj) ? obj : obj.items ?? [obj];
      return (items as Partial<Gear>[]).filter((g) => g && g.name && Number(g.l) > 0 && Number(g.w) > 0);
    } catch {
      /* 다음 블록 */
    }
  }
  return [];
}

export function normalizeGear(g: Partial<Gear>, fallbackBrand: string): Omit<Gear, 'id'> {
  const cat = CATEGORIES.some((c) => c.id === g.category) ? (g.category as Category) : 'etc';
  return {
    brand: (g.brand || fallbackBrand).trim(),
    category: cat,
    name: String(g.name),
    model: g.model || undefined,
    l: Number(g.l),
    w: Number(g.w),
    h: Number(g.h) || 0,
    material: g.material,
    weight: g.weight,
    shape: g.shape ?? (cat === 'tarp' ? 'tarp-hexa' : 'rect'),
    frame: g.frame ?? 'none',
    frameCount: g.frameCount || undefined,
    inner: g.inner && g.inner.l > 0 ? g.inner : undefined,
    verified: !!g.verified,
    note: g.note,
    source: g.source,
  };
}

/** 브랜드/제품명으로 제원 검색 (웹검색 사용) */
export async function lookupGear(query: string, onText?: (t: string) => void, signal?: AbortSignal) {
  const res = await chat(
    [{ role: 'user', content: `다음 브랜드/제품의 캠핑 장비 제원을 조사해주세요: "${query}"\n(텐트, 타프, 테이블, 의자, 매트, 야전침대, 난방, 냉장고 중 해당되는 것)` }],
    LOOKUP_SYSTEM,
    onText ?? (() => {}),
    signal,
  );
  return { text: res.text, items: parseGearJson(res.text) };
}

export function plannerSystemPrompt(context: string) {
  return `당신은 캠핑 사이트 배치 도우미입니다. 사용자는 1m 격자 위에 텐트·타프·가구를 배치하는 앱을 쓰고 있어요.
- 항상 존댓말로, 간결하게 답하세요.
- 장비 제원이 애매하면 web_search로 공식 홈페이지를 확인하고, 확실하지 않은 값은 반드시 "추정"이라고 밝히세요.
- 사용자가 장비 추가를 원하면 답변 끝에 \`\`\`gear 코드블록으로 {"items":[{"brand","category"(${CAT_IDS}),"name","l","w","h"(cm),"material","shape","frame","verified","note"}]} JSON을 넣으세요. 앱이 버튼으로 추가합니다.
- 배치 조언 시 텐트 간 간격(팩·스트링 고려 최소 1~1.5m), 화기와 텐트 거리, 동선, 바람 방향 등을 고려하세요.

현재 앱 상태:
${context}`;
}
