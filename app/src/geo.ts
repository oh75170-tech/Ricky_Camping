/**
 * 지도·위치·날씨 (무료 공개 서비스)
 *  - 캠핑장 검색: 우리 서버의 고캠핑(한국관광공사) 프록시 → 없거나 실패하면 OpenStreetMap Nominatim
 *  - 주소 → 좌표: Nominatim
 *  - 집 → 캠핑장 소요시간: OSRM 공개 경로 서버 (자동차, 개략)
 *  - 날씨: Open-Meteo (16일 예보, 그 이후는 작년 같은 날 기록)
 */
import { getState } from './store';
import { serverUrl } from './config';
import type { Place } from './types';

export interface CampResult extends Place {
  /** 고캠핑 사이트 크기 후보 (m) */
  sizes?: { w: number; h: number; count?: number }[];
  /** 고캠핑 바닥 종류 보유 현황 */
  floors?: string[];
}

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

async function nominatim(q: string, limit = 8): Promise<CampResult[]> {
  const url = `${NOMINATIM}?format=jsonv2&addressdetails=0&accept-language=ko&countrycodes=kr&limit=${limit}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`위치 검색 오류 (${r.status})`);
  const list = (await r.json()) as { display_name: string; name?: string; lat: string; lon: string; type?: string }[];
  return list.map((x) => ({
    name: x.name || x.display_name.split(',')[0],
    address: x.display_name,
    lat: Number(x.lat),
    lng: Number(x.lon),
    source: 'osm' as const,
  }));
}

/** 캠핑장 검색: 고캠핑(서버에 키가 있을 때) 우선, 없으면 OpenStreetMap */
export async function searchCampgrounds(q: string): Promise<{ items: CampResult[]; source: 'gocamping' | 'osm' }> {
  const base = serverUrl();
  const { passcode } = getState().settings;
  if (base && passcode) {
    try {
      const r = await fetch(`${base}/camp/search?keyword=${encodeURIComponent(q)}`, {
        headers: { 'x-api-key': encodeURIComponent(passcode.trim()) },
      });
      if (r.ok) {
        const j = (await r.json()) as { enabled?: boolean; items?: CampResult[] };
        if (j.enabled && j.items && j.items.length) return { items: j.items, source: 'gocamping' };
      }
    } catch {
      /* 서버 실패 시 OSM 으로 */
    }
  }
  // OSM: "캠핑장" 단어가 없으면 붙여서 한 번 더
  let items = await nominatim(q);
  if (!items.length && !/캠핑|오토캠|글램핑|야영/.test(q)) items = await nominatim(`${q} 캠핑장`);
  return { items, source: 'osm' };
}

/** 주소·장소 이름 → 좌표 (집 위치 설정용) */
export async function geocode(q: string): Promise<CampResult[]> {
  return nominatim(q, 5);
}

export interface RouteInfo {
  km: number;
  minutes: number;
  /** 경로 선 [lat, lng][] */
  line?: [number, number][];
}

/** 집 → 목적지 자동차 소요시간 (OSRM 공개 서버, 실시간 교통 미반영) */
export async function routeTime(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteInfo> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`경로 계산 오류 (${r.status})`);
  const j = (await r.json()) as { code: string; routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[] };
  const route = j.routes?.[0];
  if (j.code !== 'Ok' || !route) throw new Error('경로를 찾지 못했어요.');
  return {
    km: Math.round(route.distance / 100) / 10,
    minutes: Math.round(route.duration / 60),
    line: route.geometry?.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

/** 직선거리 (경로 서버 실패 시 대략 표시용) */
export function straightKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`);

// ───────── 날씨 ─────────
export interface DayWeather {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
  rainProb?: number;
  rainMm?: number;
  windMax?: number;
}
export interface WeatherResult {
  kind: 'forecast' | 'lastYear';
  days: DayWeather[];
  note: string;
}

/** WMO 날씨 코드 → 한글 + 아이콘 문자 */
export function weatherLabel(code: number): { text: string; icon: string } {
  if (code === 0) return { text: '맑음', icon: '☀️' };
  if (code <= 2) return { text: '구름 조금', icon: '🌤️' };
  if (code === 3) return { text: '흐림', icon: '☁️' };
  if (code === 45 || code === 48) return { text: '안개', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { text: '이슬비', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { text: '비', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { text: '눈', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { text: '소나기', icon: '🌦️' };
  if (code >= 85 && code <= 86) return { text: '눈 소나기', icon: '🌨️' };
  if (code >= 95) return { text: '뇌우', icon: '⛈️' };
  return { text: '-', icon: '·' };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** 캠핑 날짜의 날씨: 16일 이내면 예보, 그 이후(또는 지난 일정)는 작년 같은 날짜 기록 */
export async function tripWeather(lat: number, lng: number, start: string, end: string): Promise<WeatherResult> {
  const today = iso(new Date());
  const last = end || start;
  const horizon = addDays(today, 15);
  const daily = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';
  if (start >= today && last <= horizon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=${daily},precipitation_probability_max&timezone=Asia%2FSeoul&start_date=${start}&end_date=${last}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`날씨 오류 (${r.status})`);
    const j = await r.json();
    return { kind: 'forecast', days: toDays(j), note: '기상 예보 (Open-Meteo)' };
  }
  // 예보 범위 밖: 작년 같은 날짜의 실제 기록을 참고로
  const ly = (s: string) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
  const isPast = last < today;
  const s0 = isPast ? start : ly(start);
  const e0 = isPast ? last : ly(last);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&daily=${daily}&timezone=Asia%2FSeoul&start_date=${s0}&end_date=${e0}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`날씨 기록 오류 (${r.status})`);
  const j = await r.json();
  return {
    kind: 'lastYear',
    days: toDays(j),
    note: isPast ? '다녀온 날의 실제 날씨 기록' : '예보는 16일 전부터 나와요. 작년 같은 날짜의 실제 날씨를 참고로 보여드려요.',
  };
}

function toDays(j: {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
  };
}): DayWeather[] {
  const d = j.daily;
  if (!d) return [];
  return d.time.map((t, i) => ({
    date: t,
    code: d.weather_code[i],
    tMax: Math.round(d.temperature_2m_max[i]),
    tMin: Math.round(d.temperature_2m_min[i]),
    rainMm: d.precipitation_sum?.[i],
    rainProb: d.precipitation_probability_max?.[i],
    windMax: d.wind_speed_10m_max?.[i],
  }));
}
