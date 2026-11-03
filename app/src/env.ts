/** 태블릿 미리보기(Claude 아티팩트) 빌드 여부 – 외부 통신·다운로드·공유가 막힌 환경 */
export const IS_PREVIEW = import.meta.env.MODE === 'preview';

/** 확인창: 미리보기 환경에서는 confirm()이 항상 false라 바로 진행 */
export function ask(message: string): boolean {
  if (IS_PREVIEW) return true;
  return confirm(message);
}
