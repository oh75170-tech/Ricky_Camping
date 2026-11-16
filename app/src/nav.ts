/**
 * 화면을 떠날 때 확인 (저장 안 한 내용이 있을 때)
 *  - guard 가 false 를 돌려주면 뒤로가기(기기 버튼 포함)를 막고, 화면이 직접 저장 여부를 물어봄
 */
let guard: (() => boolean) | null = null;
export function setLeaveGuard(fn: (() => boolean) | null) {
  guard = fn;
}
export function canLeave(): boolean {
  return guard ? guard() : true;
}
