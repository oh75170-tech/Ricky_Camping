/**
 * CampCanvas (by Rick_Camping) 서버 (Cloudflare Workers)
 *  1) /anthropic/v1/messages : Anthropic API 프록시 – API 키는 서버 비밀값으로만 보관
 *  2) /rooms                 : 단체캠핑 배치 공동 편집 방 (Durable Object + WebSocket)
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_PASSCODE: string;
  /** AI 검색(웹 검색) 전용 코드 – 없으면 AI 검색 꺼짐 */
  SEARCH_CODE?: string;
  /** 하루 AI 검색 횟수 제한 (기본 20) */
  DAILY_SEARCH_LIMIT?: string;
  /** (선택) 공공데이터포털 한국관광공사 고캠핑 정보 서비스 키 */
  GOCAMPING_KEY?: string;
  ALLOWED_ORIGINS: string;
  ROOMS: DurableObjectNamespace;
}

const ALLOWED_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const MAX_TOKENS_CAP = 16000;
const MAX_DOC_BYTES = 512 * 1024;
const ROOM_ID = /^[a-z0-9]{8,32}$/;

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0] ?? '',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    // SDK가 보내는 헤더(x-stainless-*, authorization 등)가 버전마다 달라서, 브라우저가 요청한 헤더를 그대로 허용
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ||
      'content-type,x-api-key,authorization,anthropic-version,anthropic-beta,anthropic-dangerous-direct-browser-access',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json' } });
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function newRoomId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

/** 접속 코드 비교: 앞뒤 공백 무시, 한글 등은 앱이 URL 인코딩해서 보냄 */
function passcodeOk(req: Request, env: Env) {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const raw = (req.headers.get('x-api-key') || bearer).trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* 인코딩 안 된 값 */
  }
  const want = (env.APP_PASSCODE ?? '').trim();
  return safeEqual(raw, want) || safeEqual(decoded.trim(), want);
}

const CHEAP_MODEL = 'claude-haiku-5-5';
const SEARCH_MAX_USES = 2;
const FETCH_MAX_TOKENS = 6000;

function decodeHeader(v: string | null) {
  const raw = (v ?? '').trim();
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

/** 한국 시간 기준 날짜 */
const todayKST = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const dailyLimit = (env: Env) => Math.max(0, Number(env.DAILY_SEARCH_LIMIT ?? '20') || 20);

async function quota(env: Env, op: 'get' | 'incr') {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(`quota:${todayKST()}`));
  const r = await stub.fetch(`https://room/${op === 'incr' ? 'incr' : 'count'}`, { method: op === 'incr' ? 'POST' : 'GET' });
  const j = (await r.json()) as { count: number };
  return j.count;
}

const errJson = (type: string, message: string, status: number, h: Record<string, string>) =>
  json({ type: 'error', error: { type, message: `${message} (${type})` } }, status, h);

async function proxyAnthropic(req: Request, env: Env, h: Record<string, string>) {
  if (!passcodeOk(req, env)) {
    return json({ type: 'error', error: { type: 'passcode_error', message: '앱 접속 코드가 올바르지 않습니다. (passcode_error)' } }, 401, h);
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: 'invalid json' } }, 400, h);
  }
  if (!ALLOWED_MODELS.has(String(body.model))) {
    return json({ type: 'error', error: { type: 'invalid_request_error', message: '허용되지 않은 모델입니다.' } }, 400, h);
  }
  body.max_tokens = Math.min(Number(body.max_tokens) || MAX_TOKENS_CAP, MAX_TOKENS_CAP);

  // ── AI 검색(웹 도구) 요청: 검색 코드·하루 횟수 확인 + 비용 절감 설정 강제 ──
  const tools = Array.isArray(body.tools) ? (body.tools as { type?: string }[]) : [];
  const usesWeb = tools.some((t) => /web_(search|fetch)/.test(String(t?.type)));
  let betaHeader = req.headers.get('anthropic-beta');
  if (usesWeb) {
    const code = (env.SEARCH_CODE ?? '').trim();
    if (!code) return errJson('search_disabled', 'AI 검색이 꺼져 있습니다. 관리자가 AI 검색 코드를 등록해야 합니다.', 403, h);
    if (!safeEqual(decodeHeader(req.headers.get('x-search-code')), code)) {
      return errJson('search_code_error', 'AI 검색 코드가 올바르지 않습니다.', 403, h);
    }
    // 한 번의 검색에서 이어지는 요청(pause_turn 계속)은 횟수에 넣지 않음
    if (req.headers.get('x-cc-round') !== 'continue') {
      const used = await quota(env, 'incr');
      if (used > dailyLimit(env)) {
        return errJson('daily_limit', `오늘 AI 검색 횟수(하루 ${dailyLimit(env)}회)를 모두 썼습니다.`, 429, h);
      }
    }
    body.model = CHEAP_MODEL;
    body.tools = tools.map((t) => {
      if (/web_search/.test(String(t.type))) return { type: 'web_search_20250305', name: 'web_search', max_uses: SEARCH_MAX_USES };
      if (/web_fetch/.test(String(t.type)))
        return { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: SEARCH_MAX_USES, max_content_tokens: FETCH_MAX_TOKENS };
      return t;
    });
    delete body.fallbacks; // Haiku는 서버측 폴백 미지원
    body.output_config = { effort: 'low' };
    body.max_tokens = Math.min(Number(body.max_tokens), 8000);
    betaHeader = (betaHeader ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith('server-side-fallback'))
      .join(',');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': (env.ANTHROPIC_API_KEY ?? '').trim(),
    'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
  };
  if (betaHeader) headers['anthropic-beta'] = betaHeader;

  const send = () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
  let upstream = await send();
  // Haiku에서 web_fetch가 거부되면 웹 검색만으로 한 번 다시 시도
  if (usesWeb && upstream.status === 400) {
    const text = await upstream.clone().text();
    if (/web_fetch/i.test(text)) {
      body.tools = (body.tools as { type?: string }[]).filter((t) => !/web_fetch/.test(String(t.type)));
      upstream = await send();
    }
  }
  if (upstream.status === 401 || upstream.status === 403) {
    // 서버에 등록된 Anthropic 키 문제 – 접속 코드 문제와 구분되게 502로 알리고, Anthropic이 준 이유를 함께 전달
    let reason = '';
    try {
      const j = (await upstream.json()) as { error?: { type?: string; message?: string } };
      reason = `${j.error?.type ?? ''}: ${j.error?.message ?? ''}`;
    } catch {
      /* 본문 없음 */
    }
    const k = (env.ANTHROPIC_API_KEY ?? '').trim();
    const hint = `키 길이 ${k.length}자(정상 키는 100자 이상), 시작 ${k.slice(0, 7)}…`;
    return json(
      {
        type: 'error',
        error: { type: 'upstream_auth', message: `Anthropic이 ${upstream.status}로 거부 (upstream_auth) – ${reason} [${hint}]` },
      },
      502,
      h,
    );
  }
  const out = new Headers(h);
  const ct = upstream.headers.get('content-type');
  if (ct) out.set('content-type', ct);
  const rid = upstream.headers.get('request-id');
  if (rid) out.set('request-id', rid);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

// ───────── 고캠핑 ─────────
const FLOOR_FIELDS: [string, string][] = [
  ['siteBottomCl1', '잔디'],
  ['siteBottomCl2', '파쇄석'],
  ['siteBottomCl3', '데크'],
  ['siteBottomCl4', '자갈'],
  ['siteBottomCl5', '맨흙'],
];

async function campSearch(keyword: string, env: Env, h: Record<string, string>) {
  const key = (env.GOCAMPING_KEY ?? '').trim();
  const kw = keyword.trim().slice(0, 50);
  if (!key) return json({ enabled: false, items: [] }, 200, h);
  if (!kw) return json({ enabled: true, items: [] }, 200, h);
  // 키는 인코딩/디코딩 두 형태가 있어서, 이미 %가 있으면 그대로 사용
  const sk = key.includes('%') ? key : encodeURIComponent(key);
  const api = `https://apis.data.go.kr/B551011/GoCamping/searchList?serviceKey=${sk}&numOfRows=15&pageNo=1&MobileOS=ETC&MobileApp=CampCanvas&_type=json&keyword=${encodeURIComponent(kw)}`;
  try {
    const r = await fetch(api);
    const text = await r.text();
    if (!r.ok || text.trim().startsWith('<')) return json({ enabled: true, error: `gocamping_${r.status}`, items: [] }, 200, h);
    const j = JSON.parse(text) as { response?: { body?: { items?: { item?: unknown } | '' } } };
    const raw = j.response?.body?.items && typeof j.response.body.items === 'object' ? j.response.body.items.item : [];
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, string | number | undefined>[];
    const num = (v: unknown) => (v === undefined || v === '' ? 0 : Number(v));
    const items = list.map((x) => {
      const sizes: { w: number; h: number; count?: number }[] = [];
      for (const i of [1, 2, 3]) {
        const w = num(x[`siteMg${i}Width`]);
        const hh = num(x[`siteMg${i}Vrticl`]);
        if (w > 0 && hh > 0) sizes.push({ w, h: hh, count: num(x[`siteMg${i}Co`]) || undefined });
      }
      const floors = FLOOR_FIELDS.filter(([k]) => num(x[k]) > 0).map(([, label]) => label);
      const lat = num(x.mapY);
      const lng = num(x.mapX);
      return {
        name: String(x.facltNm ?? ''),
        address: [x.addr1, x.addr2].filter(Boolean).join(' '),
        lat: lat || undefined,
        lng: lng || undefined,
        tel: x.tel ? String(x.tel) : undefined,
        homepage: x.homepage ? String(x.homepage) : undefined,
        info: x.lineIntro ? String(x.lineIntro) : undefined,
        source: 'gocamping',
        sizes,
        floors,
      };
    });
    return json({ enabled: true, items: items.filter((x) => x.name) }, 200, h);
  } catch (e) {
    return json({ enabled: true, error: String(e).slice(0, 200), items: [] }, 200, h);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (url.pathname === '/health') return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY }, 200, h);

    // 오늘 AI 검색 사용량
    if (url.pathname === '/quota' && req.method === 'GET') {
      if (!passcodeOk(req, env)) return json({ error: 'passcode_error' }, 401, h);
      return json({ used: await quota(env, 'get'), limit: dailyLimit(env), searchEnabled: !!(env.SEARCH_CODE ?? '').trim() }, 200, h);
    }

    // 검색 결과 저장소(캐시): 한 번 찾은 제품은 다시 AI를 부르지 않음 (60일 보관)
    const cm = url.pathname.match(/^\/cache\/([a-f0-9]{64})$/);
    if (cm) {
      if (!passcodeOk(req, env)) return json({ error: 'passcode_error' }, 401, h);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(`cache:${cm[1]}`));
      if (req.method === 'GET') {
        const r = await stub.fetch('https://room/doc');
        if (r.status === 404) return json({ hit: false }, 200, h);
        const st = (await r.json()) as { doc: unknown; updatedAt: number };
        if (Date.now() - st.updatedAt > 60 * 86400_000) return json({ hit: false }, 200, h);
        return json({ hit: true, ...(st.doc as object), savedAt: st.updatedAt }, 200, h);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_DOC_BYTES) return json({ error: 'too large' }, 413, h);
        await stub.fetch('https://room/doc', { method: 'PUT', body });
        return json({ ok: true }, 200, h);
      }
    }

    // 설정 화면의 "접속 코드 확인" 버튼용 (요금 없음)
    if (url.pathname === '/auth-check' && req.method === 'POST') {
      const sc = (env.SEARCH_CODE ?? '').trim();
      const sGiven = decodeHeader(req.headers.get('x-search-code'));
      return json(
        { ok: passcodeOk(req, env), ai: !!env.ANTHROPIC_API_KEY, searchEnabled: !!sc, searchOk: !!sc && !!sGiven && safeEqual(sGiven, sc) },
        200,
        h,
      );
    }

    // 캠핑장 검색 (고캠핑 프록시, 키 없으면 enabled:false → 앱이 OpenStreetMap 사용)
    if (url.pathname === '/camp/search' && req.method === 'GET') {
      if (!passcodeOk(req, env)) return json({ error: 'passcode_error' }, 401, h);
      return campSearch(url.searchParams.get('keyword') ?? '', env, h);
    }

    if (url.pathname === '/anthropic/v1/messages' && req.method === 'POST') return proxyAnthropic(req, env, h);

    // 방 만들기
    if (url.pathname === '/rooms' && req.method === 'POST') {
      const id = newRoomId();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
      const body = await req.text();
      if (body.length > MAX_DOC_BYTES) return json({ error: 'too large' }, 413, h);
      await stub.fetch('https://room/doc', { method: 'PUT', body });
      return json({ id }, 200, h);
    }

    // 내 데이터 동기화: /sync/<동기화 코드의 SHA-256 해시>  (접속 코드 필요)
    const sm = url.pathname.match(/^\/sync\/([a-f0-9]{64})$/);
    if (sm) {
      if (!passcodeOk(req, env)) return json({ error: 'passcode_error' }, 401, h);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(`sync:${sm[1]}`));
      if (req.method === 'GET') {
        const r = await stub.fetch('https://room/doc');
        if (r.status === 404) return json({ doc: null }, 200, h);
        return new Response(r.body, { status: r.status, headers: { ...h, 'content-type': 'application/json' } });
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_DOC_BYTES * 2) return json({ error: 'too large' }, 413, h);
        await stub.fetch('https://room/doc', { method: 'PUT', body });
        return json({ ok: true, savedAt: Date.now() }, 200, h);
      }
      return json({ error: 'method' }, 405, h);
    }

    const m = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/);
    if (m) {
      const id = m[1];
      if (!ROOM_ID.test(id)) return json({ error: 'bad room id' }, 400, h);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(id));
      if (m[2]) {
        if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426, h);
        return stub.fetch('https://room/ws', req);
      }
      if (req.method === 'GET') {
        const r = await stub.fetch('https://room/doc');
        return new Response(r.body, { status: r.status, headers: { ...h, 'content-type': 'application/json' } });
      }
    }
    return json({ error: 'not found' }, 404, h);
  },
};

interface Stored {
  doc: unknown;
  version: number;
  updatedAt: number;
}

/** 방 하나 = Durable Object 하나. 마지막 저장값 우선(last-write-wins) 으로 전체 배치 문서를 동기화 */
export class Room implements DurableObject {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private async load(): Promise<Stored | undefined> {
    return this.ctx.storage.get<Stored>('state');
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) {
        try {
          ws.send(s);
        } catch {
          /* 끊긴 연결 */
        }
      }
    }
  }

  private presence() {
    this.broadcast({ type: 'presence', count: this.ctx.getWebSockets().length });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/incr' || url.pathname === '/count') {
      // 하루 검색 횟수 카운터 (DO는 한 번에 하나씩 처리하므로 안전하게 증가)
      let count = (await this.ctx.storage.get<number>('count')) ?? 0;
      if (url.pathname === '/incr') {
        count += 1;
        await this.ctx.storage.put('count', count);
      }
      return new Response(JSON.stringify({ count }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      const st = await this.load();
      server.send(JSON.stringify({ type: 'snapshot', doc: st?.doc ?? null, version: st?.version ?? 0 }));
      this.presence();
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/doc' && req.method === 'PUT') {
      const text = await req.text();
      const doc = text ? JSON.parse(text) : null;
      await this.ctx.storage.put('state', { doc, version: 1, updatedAt: Date.now() } satisfies Stored);
      return new Response('ok');
    }
    if (url.pathname === '/doc') {
      const st = await this.load();
      if (!st) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      return new Response(JSON.stringify(st));
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_DOC_BYTES) return;
    let msg: { type?: string; doc?: unknown; clientId?: string };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (msg.type === 'update' && msg.doc) {
      const prev = await this.load();
      const next: Stored = { doc: msg.doc, version: (prev?.version ?? 0) + 1, updatedAt: Date.now() };
      await this.ctx.storage.put('state', next);
      this.broadcast({ type: 'update', doc: next.doc, version: next.version, from: msg.clientId }, ws);
      ws.send(JSON.stringify({ type: 'ack', version: next.version }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      /* noop */
    }
    this.presence();
  }

  async webSocketError() {
    this.presence();
  }
}
