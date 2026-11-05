import { getState } from './store';

/** 배포된 기본 서버 (Cloudflare Workers) */
export const DEFAULT_SERVER = 'https://ricky-camping-server.oh75170.workers.dev';

/** 서버 주소: 설정값 > 빌드 시 환경변수(VITE_API_BASE) > 기본 서버 */
export function serverUrl(): string {
  const s = getState().settings.serverUrl.trim() || (import.meta.env.VITE_API_BASE as string | undefined) || DEFAULT_SERVER;
  return s.replace(/\/+$/, '');
}
