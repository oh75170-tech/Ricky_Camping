/**
 * CampCanvas (by Rick_Camping) 서버 (Cloudflare Workers)
 *  1) /anthropic/v1/messages : Anthropic API 프록시 – API 키는 서버 비밀값으로만 보관
 *  2) /rooms                 : 단체캠핑 배치 공동 편집 방 (Durable Object + WebSocket)
 */

export interface Env {
  ANTHROPIC_API_KEY: string;
  APP_PASSCODE: string;
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

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': (env.ANTHROPIC_API_KEY ?? '').trim(),
    'anthropic-version': req.headers.get('anthropic-version') ?? '2023-06-01',
  };
  const beta = req.headers.get('anthropic-beta');
  if (beta) headers['anthropic-beta'] = beta;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (url.pathname === '/health') return json({ ok: true, ai: !!env.ANTHROPIC_API_KEY }, 200, h);

    // 설정 화면의 "접속 코드 확인" 버튼용 (요금 없음)
    if (url.pathname === '/auth-check' && req.method === 'POST') {
      return json({ ok: passcodeOk(req, env), ai: !!env.ANTHROPIC_API_KEY }, 200, h);
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
