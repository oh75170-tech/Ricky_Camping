import { getState } from './store';

/** 서버 주소: 설정값 > 빌드 시 환경변수(VITE_API_BASE) */
export function serverUrl(): string {
  const s = getState().settings.serverUrl.trim() || (import.meta.env.VITE_API_BASE as string | undefined) || '';
  return s.replace(/\/+$/, '');
}
