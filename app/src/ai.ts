import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaContentBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { CATEGORIES, type Category, type Gear } from './types';
import { getState } from './store';
import { serverUrl } from './config';
import { IS_PREVIEW } from './env';

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

/** maxRetries: AI 검색은 자동 재시도가 하루 횟수를 깎으므로 0 */
function client(maxRetries = 2) {
  const { aiMode, apiKey, passcode } = getState().settings;
  if (aiMode === 'server') {
    const base = serverUrl();
    if (!base) throw new NoKeyError('설정에서 서버 주소를 입력해주세요.');
    if (!passcode) throw new NoKeyError();
    // 서버가 실제 API 키를 붙여 Anthropic으로 전달합니다. 브라우저에는 접속 코드만 저장됩니다.
    // 한글·공백이 있어도 헤더로 보낼 수 있게 인코딩 (서버에서 복원)
    return new Anthropic({ apiKey: encodeURIComponent(passcode.trim()), baseURL: `${base}/anthropic`, dangerouslyAllowBrowser: true, maxRetries });
  }
  if (!apiKey) throw new NoKeyError();
  // 개인 키 직접 모드: 키는 이 기기(localStorage)에만 저장되어 브라우저에서 직접 호출합니다.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries });
}

/** 설정 화면에서 접속 코드가 맞는지 서버에 확인 (요금 없음) */
export interface AuthCheck {
  result: 'ok' | 'wrong' | 'noserver' | 'offline';
  searchEnabled?: boolean;
  searchOk?: boolean;
}
export async function checkPasscode(code: string, searchCode = ''): Promise<AuthCheck> {
  const base = serverUrl();
  if (!base) return { result: 'noserver' };
  try {
    const r = await fetch(`${base}/auth-check`, {
      method: 'POST',
      headers: { 'x-api-key': encodeURIComponent(code.trim()), 'x-search-code': encodeURIComponent(searchCode.trim()) },
    });
    const j = (await r.json()) as { ok?: boolean; searchEnabled?: boolean; searchOk?: boolean };
    return { result: j.ok ? 'ok' : 'wrong', searchEnabled: j.searchEnabled, searchOk: j.searchOk };
  } catch {
    return { result: 'offline' };
  }
}

/** AI 검색(웹 검색)을 쓸 수 있는지: 서버 모드는 접속 코드 + AI 검색 코드, 개인 키 모드는 키 */
export function searchReady(): boolean {
  if (IS_PREVIEW) return true;
  const { aiMode, apiKey, passcode, searchCode } = getState().settings;
  return aiMode === 'server' ? !!(serverUrl() && passcode && searchCode.trim()) : !!apiKey;
}

/** 오늘 AI 검색 사용량 (서버 모드) */
export async function getQuota(): Promise<{ used: number; limit: number; searchEnabled: boolean } | null> {
  const base = serverUrl();
  const { aiMode, passcode } = getState().settings;
  if (IS_PREVIEW || aiMode !== 'server' || !base || !passcode) return null;
  try {
    const r = await fetch(`${base}/quota`, { headers: { 'x-api-key': encodeURIComponent(passcode.trim()) } });
    if (!r.ok) return null;
    return (await r.json()) as { used: number; limit: number; searchEnabled: boolean };
  } catch {
    return null;
  }
}

// ───────── 검색 결과 저장소(서버 캐시) ─────────
const normKey = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').replace(/https?:\/\//, '').replace(/\/+$/, '').trim();
async function cacheKey(query: string, homepage: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`lookup:${normKey(query)}|${normKey(homepage)}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function cacheReady() {
  const { passcode } = getState().settings;
  return !IS_PREVIEW && !!serverUrl() && !!passcode;
}
async function cacheGet(query: string, homepage: string): Promise<{ items: Partial<Gear>[]; savedAt: number } | null> {
  if (!cacheReady()) return null;
  try {
    const r = await fetch(`${serverUrl()}/cache/${await cacheKey(query, homepage)}`, {
      headers: { 'x-api-key': encodeURIComponent(getState().settings.passcode.trim()) },
    });
    const j = (await r.json()) as { hit?: boolean; items?: Partial<Gear>[]; savedAt?: number };
    return j.hit && Array.isArray(j.items) && j.items.length ? { items: j.items, savedAt: j.savedAt ?? 0 } : null;
  } catch {
    return null;
  }
}
async function cachePut(query: string, homepage: string, items: Partial<Gear>[]) {
  if (!cacheReady() || !items.length) return;
  try {
    await fetch(`${serverUrl()}/cache/${await cacheKey(query, homepage)}`, {
      method: 'PUT',
      headers: { 'x-api-key': encodeURIComponent(getState().settings.passcode.trim()), 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  } catch {
    /* 저장 실패해도 검색 결과는 그대로 사용 */
  }
}

/** AI를 쓸 준비가 됐는지 (서버+접속코드, 또는 개인 키) */
export function aiReady(): boolean {
  if (IS_PREVIEW) return true;
  const { aiMode, apiKey, passcode } = getState().settings;
  return aiMode === 'server' ? !!(serverUrl() && passcode) : !!apiKey;
}

const WEB_SEARCH = { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 5 };
/** 저렴한 검색 모드(Haiku): 동적 필터링 없는 기본 도구 버전 + 횟수·분량 제한 */
const CHEAP_MODEL = 'claude-haiku-5-5';
const CHEAP_SEARCH = { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 2 };
const CHEAP_FETCH = { type: 'web_fetch_20250910' as const, name: 'web_fetch' as const, max_uses: 2, max_content_tokens: 6000 };
/** 사용자가 알려준 홈페이지를 직접 열어보는 도구 (대화에 나온 URL만 열 수 있음) */
const WEB_FETCH = { type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 6 };

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

// ───────── 미리보기(Claude 아티팩트) 전용: 페이지 안에서 Claude에게 직접 묻기 ─────────
type SampleFn = (
  input: string | { role: 'user' | 'assistant'; content: string }[],
  opts?: { onText?: (u: { text: string }) => void; signal?: AbortSignal; cache?: boolean; modelTier?: string },
) => Promise<{ text: string; truncated: boolean }>;

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  samplePromise ??= c.use('sample') as Promise<SampleFn | null>;
  return samplePromise;
}

const SAMPLE_ERRORS: Record<string, string> = {
  not_granted: 'AI 사용을 허용하지 않아 실행할 수 없어요. 페이지를 새로 열고 허용을 눌러주세요.',
  sampling_disabled: '이 계정에서는 AI를 사용할 수 없어요.',
  rate_limited: '요청이 너무 많거나 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
  session_expired: 'Claude 로그인이 만료됐어요. 다시 로그인해주세요.',
  refused: '이 요청에는 답할 수 없어요. 질문을 바꿔서 시도해주세요.',
  prompt_too_large: '대화가 너무 길어요. 새로 시작해주세요.',
};

function textOf(content: BetaMessageParam['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

async function chatViaSample(
  history: BetaMessageParam[],
  system: string,
  onText: (full: string) => void,
  signal?: AbortSignal,
): Promise<ChatResult> {
  const sample = await getSample();
  if (!sample) throw new NoKeyError('이 화면에서는 AI를 쓸 수 없어요. Claude 앱이나 claude.ai에서 열어주세요.');
  const rules =
    system +
    '\n\n[이 화면에서는 웹 검색 도구가 없습니다. 알고 있는 정보로 답하고, 확실하지 않은 수치는 반드시 "추정"이라고 밝히세요.]';
  const turns = [
    { role: 'user' as const, content: rules },
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: textOf(m.content) }))
      .filter((t) => t.content.trim()),
  ];
  try {
    const { text } = await sample(turns, { cache: false, signal, onText: ({ text }) => onText(text) });
    return { history: [...history, { role: 'assistant', content: text }], text };
  } catch (e) {
    const err = e as { code?: string; message?: string; text?: string };
    if (err.code === 'cancelled') {
      const a = new Error('중단했습니다.');
      a.name = 'AbortError';
      throw a;
    }
    throw new Error(SAMPLE_ERRORS[err.code ?? ''] ?? `AI 응답 오류 (${err.code ?? 'unknown'}). 잠시 후 다시 시도해주세요.`);
  }
}

export async function chat(
  history: BetaMessageParam[],
  system: string,
  onText: (full: string) => void,
  signal?: AbortSignal,
  opts?: { fetch?: boolean; cheap?: boolean },
): Promise<ChatResult> {
  if (IS_PREVIEW) return chatViaSample(history, system, onText, signal);
  const c = client(opts?.cheap ? 0 : 2);
  const settings = getState().settings;
  const server = settings.aiMode === 'server';
  // 웹 검색은 AI 검색 코드가 있을 때만 (개인 키 모드는 본인 요금이라 허용)
  const web = server ? !!settings.searchCode.trim() : true;
  const cheap = !!opts?.cheap;
  const model = cheap ? CHEAP_MODEL : settings.model;
  const tools = !web ? undefined : cheap ? (opts?.fetch ? [CHEAP_SEARCH, CHEAP_FETCH] : [CHEAP_SEARCH]) : opts?.fetch ? [WEB_SEARCH, WEB_FETCH] : [WEB_SEARCH];
  let msgs = [...history];
  let text = '';
  for (let i = 0; i < 4; i++) {
    const headers: Record<string, string> = {};
    if (server && web) {
      headers['x-search-code'] = encodeURIComponent(settings.searchCode.trim());
      headers['x-cc-round'] = i === 0 ? 'first' : 'continue';
    }
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: cheap ? 8000 : 16000,
        system,
        messages: msgs,
        ...(tools ? { tools } : {}),
        output_config: { effort: cheap ? 'low' : 'medium' },
        ...(cheap ? {} : fallbackOpts(model)),
      },
      { signal, headers },
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

const LOOKUP_SYSTEM = `당신은 캠핑 장비 제원 조사원입니다. web_search가 있으면 공식 홈페이지(우선)와 신뢰할 수 있는 판매처를 찾아 제원을 확인하세요.
규칙:
- 단위는 cm. 텐트/타프는 설치 시 외형(플라이) 길이(l, 긴 쪽)·너비(w)·최고 높이(h).
- 가구는 사용 시 외형 치수.
- 확인되지 않은 값은 추정하되 verified를 false로 하고 note에 무엇이 추정인지 적으세요.
- 답변 마지막에 반드시 아래 형식의 JSON 코드블록 하나만 출력하세요.
\`\`\`json
{"items":[{"brand":"브랜드(한글)","category":"${CAT_IDS}","name":"제품명","model":"모델번호","l":0,"w":0,"h":0,"material":"재질","weight":"무게","shape":"rect|tunnel|dome|hex|round|tarp-hexa|tarp-rect","frame":"none|dome-x|arches|onepole|ridge|springbar|air","frameCount":0,"inner":{"l":0,"w":0,"offset":0},"verified":true,"note":"","source":"URL"}]}
\`\`\`
inner는 이너텐트가 있을 때만. 최대 12개.
- 검색어와 맞는 제품이 여러 개(사이즈·모델 변형)면 각각 별도 항목으로 모두 넣어 사용자가 고를 수 있게 하세요.
- source에는 실제로 확인한 페이지 URL을 넣으세요.`;

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

/** 브랜드/제품명으로 제원 검색 (웹검색 사용). homepage가 있으면 그 사이트를 먼저 열어 찾음 */
export async function lookupGear(query: string, onText?: (t: string) => void, signal?: AbortSignal, homepage?: string) {
  // 1) 예전에 누군가 찾은 결과가 서버에 있으면 AI 없이 바로 사용 (요금 0)
  const cached = await cacheGet(query, homepage ?? '');
  if (cached) return { text: '', items: cached.items, cached: true as const, savedAt: cached.savedAt };
  const site = homepage?.trim() ? (/^https?:\/\//i.test(homepage.trim()) ? homepage.trim() : `https://${homepage.trim()}`) : '';
  const ask = site
    ? `다음 홈페이지에서 "${query}"에 해당하는 캠핑 장비를 찾아 제원을 조사해주세요.\n홈페이지: ${site}\n먼저 web_fetch로 이 홈페이지(와 그 안의 제품 페이지)를 열어 확인하고, 부족하면 web_search로 같은 사이트나 공식 판매처를 찾아보세요.`
    : `다음 브랜드/제품의 캠핑 장비 제원을 조사해주세요: "${query}"`;
  const res = await chat(
    [{ role: 'user', content: `${ask}\n(텐트, 타프, 테이블, 의자, 매트, 야전침대, 난방, 냉장고 중 해당되는 것)` }],
    LOOKUP_SYSTEM,
    onText ?? (() => {}),
    signal,
    { fetch: !!site, cheap: true },
  );
  let items = parseGearJson(res.text);
  // 미리보기에서는 웹 검색 없이 Claude 지식으로 답하므로 항상 '추정'으로 표시
  if (IS_PREVIEW)
    items = items.map((g) => ({ ...g, verified: false, note: `AI 추정(웹 검색 없음)${g.note ? ` · ${g.note}` : ''} – 공식 제원 확인 필요` }));
  if (!IS_PREVIEW) void cachePut(query, homepage ?? '', items);
  return { text: res.text, items, cached: false as const, savedAt: 0 };
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
