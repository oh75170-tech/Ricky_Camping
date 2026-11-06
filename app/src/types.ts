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

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'tent', label: '텐트' },
  { id: 'tarp', label: '타프' },
  { id: 'table', label: '테이블' },
  { id: 'chair', label: '의자' },
  { id: 'mat', label: '매트' },
  { id: 'cot', label: '야전침대' },
  { id: 'heater', label: '난방' },
  { id: 'fridge', label: '냉장고' },
  { id: 'etc', label: '기타' },
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
  /** 가구 상세 표현: 테이블(slat 원목/대나무, fabric 패브릭, plate 판재, igt IGT 프레임), 의자(sling 헬리녹스형, sling-high 하이백, arm 팔걸이형) */
  style?: 'slat' | 'fabric' | 'plate' | 'igt' | 'sling' | 'sling-high' | 'arm';
  /** IGT 유닛 수 등 */
  units?: number;
  /** 육각형(hex)일 때 위·아래 평평한 변의 길이 cm (없으면 길이의 1/2) */
  flat?: number;
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
  /** 관리자가 공유한 장비목록에서 받은 장비 */
  shared?: boolean;
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

// ───────── 캠핑 일정 ─────────
export type SiteFloor = 'crushed' | 'deck' | 'grass' | 'masato';
export const SITE_FLOORS: { id: SiteFloor; label: string }[] = [
  { id: 'crushed', label: '파쇄석' },
  { id: 'deck', label: '데크' },
  { id: 'grass', label: '잔디' },
  { id: 'masato', label: '마사토' },
];

export interface Place {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  /** 검색 출처 (gocamping / osm / manual) */
  source?: 'gocamping' | 'osm' | 'manual';
  tel?: string;
  homepage?: string;
  /** 고캠핑 등에서 가져온 사이트 정보 요약 */
  info?: string;
  /** 고캠핑 사이트 크기 후보 (m) */
  sizes?: { w: number; h: number; count?: number }[];
  /** 고캠핑 바닥 종류 */
  floors?: string[];
}

/** 일정에 저장한 배치도 (그 시점의 사본) */
export interface LayoutSnapshot {
  savedAt: number;
  sites: Site[];
  placements: Placement[];
  campsite: { w: number; h: number; name: string; confirmed: boolean };
  /** 배치에 쓰인 직접 추가/수정 장비 (다른 기기·나중에도 보이도록) */
  gear: Gear[];
  /** 장비 목록 요약 (브랜드·이름·치수) */
  gearList: { id: string; brand: string; name: string; category: Category; size: string; count: number }[];
}

export interface Trip {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  place: Place;
  siteNo: string;
  floor: SiteFloor | '';
  /** 사이트 크기 (m) */
  siteW?: number;
  siteH?: number;
  layout?: LayoutSnapshot;
  memo?: string;
  /** 캠핑 사진 id (최대 4장, 사진 자체는 이 기기 IndexedDB에 보관) */
  photos?: string[];
  createdAt: number;
}

export interface HomePlace {
  label: string;
  lat: number;
  lng: number;
}
