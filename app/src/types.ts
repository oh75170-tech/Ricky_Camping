export type Category =
  | 'tent'
  | 'tarp'
  | 'table'
  | 'chair'
  | 'mat'
  | 'cot'
  | 'heater'
  | 'fridge'
  | 'etc';

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: 'tent', label: '텐트', emoji: '⛺' },
  { id: 'tarp', label: '타프', emoji: '🏕️' },
  { id: 'table', label: '테이블', emoji: '🪵' },
  { id: 'chair', label: '의자', emoji: '🪑' },
  { id: 'mat', label: '매트', emoji: '🟫' },
  { id: 'cot', label: '야전침대', emoji: '🛏️' },
  { id: 'heater', label: '난방', emoji: '🔥' },
  { id: 'fridge', label: '냉장고', emoji: '🧊' },
  { id: 'etc', label: '기타', emoji: '🎒' },
];

/** 평면 모양 */
export type Shape =
  | 'rect' // 사각 (캔버스/캐빈/가구)
  | 'tunnel' // 터널형 (둥근 사각)
  | 'dome' // 돔형
  | 'hex' // 육각 (원폴/헥사)
  | 'round' // 원형 (원형 테이블/화로)
  | 'tarp-hexa' // 헥사 타프
  | 'tarp-rect'; // 렉타 타프

/** 프레임 표현 방식 */
export type Frame =
  | 'none'
  | 'dome-x' // 교차 돔 폴
  | 'arches' // 터널 아치 폴 (frameCount 개)
  | 'onepole' // 원폴 + 스트링
  | 'ridge' // 양쪽 메인폴 + 능선
  | 'springbar' // 스프링바 방식 (센터폴 + 스프링바)
  | 'air'; // 에어 프레임

export interface SubLayer {
  /** 길이 cm (텐트 길이 방향) */
  l: number;
  /** 너비 cm */
  w: number;
  /** 플라이 중심에서 길이방향 오프셋 cm (+ 는 뒤쪽/오른쪽) */
  offset?: number;
}

export interface Gear {
  id: string;
  brand: string;
  category: Category;
  name: string;
  model?: string;
  /** 길이 cm */
  l: number;
  /** 너비 cm */
  w: number;
  /** 높이 cm */
  h: number;
  material?: string;
  weight?: string;
  shape?: Shape;
  frame?: Frame;
  frameCount?: number;
  /** 이너텐트 */
  inner?: SubLayer;
  /** 그라운드시트 */
  ground?: SubLayer;
  /** true: 검색으로 공식/판매처 자료 확인, false: 추정치 */
  verified?: boolean;
  note?: string;
  source?: string;
  /** 사용자가 직접 입력/AI로 추가 */
  custom?: boolean;
}

export interface Site {
  id: string;
  name: string;
  color: string;
}

export interface Placement {
  id: string;
  gearId: string;
  /** 중심 좌표 (m) */
  x: number;
  y: number;
  /** 회전 (deg) */
  rot: number;
  siteId: string;
}

export interface LayerStyle {
  ground: number;
  inner: number;
  fly: number;
  tarp: number;
  furniture: number;
  showFrame: boolean;
  showDims: boolean;
  showLabels: boolean;
}
