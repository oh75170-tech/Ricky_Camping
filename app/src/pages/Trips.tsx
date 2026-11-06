import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { TripMap } from '../components/TripMap';
import { HomeModal } from '../components/HomeModal';
import { CATEGORIES, SITE_FLOORS, type Place, type SiteFloor, type Trip } from '../types';
import { actions, getState, useStore } from '../store';
import { ask, IS_PREVIEW } from '../env';
import {
  fmtDuration,
  routeTime,
  searchCampgrounds,
  geocode,
  straightKm,
  tripWeather,
  weatherLabel,
  type CampResult,
  type RouteInfo,
  type WeatherResult,
} from '../geo';
import { applyLayout, dday, fmtTripDates, isPastTrip, newTrip, snapshotLayout } from '../trips';

const floorLabel = (f: SiteFloor | '') => SITE_FLOORS.find((x) => x.id === f)?.label ?? '';
const catLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
const tripName = (t: Trip) => t.title || t.place.name || '이름 없는 일정';

export function Trips({ onBack, onPlanner, initialId }: { onBack: () => void; onPlanner: () => void; initialId?: string | null }) {
  const trips = useStore((s) => s.trips);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [draftNew, setDraftNew] = useState<Trip | null>(null);
  const [showHome, setShowHome] = useState(false);
  const home = useStore((s) => s.home);

  const sorted = useMemo(() => {
    const up = trips.filter((t) => !isPastTrip(t)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = trips.filter(isPastTrip).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { up, past };
  }, [trips]);

  const open = draftNew ?? trips.find((t) => t.id === openId) ?? null;
  if (open)
    return (
      <TripEditor
        key={open.id}
        initial={open}
        isNew={!!draftNew}
        onClose={() => {
          setDraftNew(null);
          setOpenId(null);
        }}
        onPlanner={onPlanner}
      />
    );

  const card = (t: Trip) => (
    <button key={t.id} className={`trip-card ${isPastTrip(t) ? 'past' : ''}`} onClick={() => setOpenId(t.id)}>
      <span className="trip-dday">{dday(t)}</span>
      <span className="trip-main">
        <b>{tripName(t)}</b>
        <small>{fmtTripDates(t)}</small>
        <small className="trip-tags">
          {t.title && t.place.name && <span>{t.place.name}</span>}
          {t.siteNo && <span>{t.siteNo}</span>}
          {t.floor && <span>{floorLabel(t.floor)}</span>}
          {t.siteW && t.siteH ? <span>{t.siteW}×{t.siteH}m</span> : null}
          {t.layout && <span className="on">배치도 · 장비 {t.layout.gearList.reduce((n, g) => n + g.count, 0)}개</span>}
        </small>
      </span>
      <Icon name="back" size={16} className="chev" />
    </button>
  );

  return (
    <div className="catalog trips">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="메인으로">
          <Icon name="back" />
        </button>
        <h1>캠핑 일정</h1>
        <button className="site-badge" onClick={() => setShowHome(true)} title="집 위치">
          <Icon name="home" size={14} /> {home ? '집 설정됨' : '집 위치'}
        </button>
        <button className="btn small primary" onClick={() => setDraftNew(newTrip())}>
          <Icon name="plus" size={16} /> 새 일정
        </button>
      </header>
      <div className="catalog-body trips-body">
        {!trips.length && (
          <div className="empty-box">
            <Icon name="calendar" size={40} stroke={1.2} />
            <p>
              아직 일정이 없어요.
              <br />
              <b>새 일정</b>을 만들고 캠핑장·날짜를 넣은 뒤, 배치 화면의 배치도를 저장해두세요.
            </p>
            <button className="btn primary" onClick={() => setDraftNew(newTrip())}>
              첫 일정 만들기
            </button>
          </div>
        )}
        {sorted.up.length > 0 && (
          <section>
            <h3 className="trip-h">다가오는 캠핑 <span className="muted small">{sorted.up.length}</span></h3>
            <div className="trip-list">{sorted.up.map(card)}</div>
          </section>
        )}
        {sorted.past.length > 0 && (
          <section>
            <h3 className="trip-h">다녀온 캠핑 <span className="muted small">{sorted.past.length}</span></h3>
            <div className="trip-list">{sorted.past.map(card)}</div>
          </section>
        )}
      </div>
      {showHome && <HomeModal onClose={() => setShowHome(false)} />}
    </div>
  );
}

// ───────────────────────── 일정 편집 ─────────────────────────
function TripEditor({ initial, isNew, onClose, onPlanner }: { initial: Trip; isNew: boolean; onClose: () => void; onPlanner: () => void }) {
  const [t, setT] = useState<Trip>(initial);
  const [saved, setSaved] = useState(!isNew);
  const home = useStore((s) => s.home);
  const placements = useStore((s) => s.placements.length);
  const [showHome, setShowHome] = useState(false);

  // 기존 일정은 바뀔 때마다 자동 저장, 새 일정은 "저장"을 누를 때 처음 저장
  const update = (patch: Partial<Trip>) => {
    setT((x) => {
      const next = { ...x, ...patch };
      if (saved) actions.saveTrip(next);
      return next;
    });
  };
  const setPlace = (p: Partial<Place>) => update({ place: { ...t.place, ...p } });

  const save = () => {
    actions.saveTrip(t);
    setSaved(true);
  };

  // ── 캠핑장 검색
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CampResult[] | null>(null);
  const [resultSrc, setResultSrc] = useState<'gocamping' | 'osm'>('osm');
  const [searchErr, setSearchErr] = useState('');
  const [picked, setPicked] = useState<CampResult | null>(null);
  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchErr('');
    setResults(null);
    try {
      const r = await searchCampgrounds(q.trim());
      setResults(r.items);
      setResultSrc(r.source);
    } catch {
      setSearchErr(IS_PREVIEW ? '미리보기에서는 외부 검색이 막혀 있어요. 설치한 앱에서 사용해주세요.' : '검색 서버에 연결하지 못했어요. 아래에 직접 입력해주세요.');
    } finally {
      setSearching(false);
    }
  };
  const pick = (r: CampResult) => {
    setPicked(r);
    setResults(null);
    const first = r.sizes?.[0];
    update({
      place: { name: r.name, address: r.address, lat: r.lat, lng: r.lng, source: r.source, tel: r.tel, homepage: r.homepage, info: r.info },
      ...(first && !t.siteW ? { siteW: first.w, siteH: first.h } : {}),
    });
  };

  // 주소/이름으로 위치만 찾기 (직접 입력한 캠핑장)
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const locate = async () => {
    const query = t.place.address || t.place.name;
    if (!query) return;
    setLocating(true);
    setLocErr('');
    try {
      const r = await geocode(query);
      if (r[0]) setPlace({ lat: r[0].lat, lng: r[0].lng, source: t.place.source ?? 'manual' });
      else setLocErr('위치를 찾지 못했어요. 주소를 "OO군 OO면"처럼 넣어보세요.');
    } catch {
      setLocErr('위치 검색 서버에 연결하지 못했어요.');
    } finally {
      setLocating(false);
    }
  };

  // ── 소요시간
  const hasLoc = t.place.lat != null && t.place.lng != null;
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeErr, setRouteErr] = useState('');
  useEffect(() => {
    setRoute(null);
    setRouteErr('');
    if (!hasLoc || !home) return;
    let alive = true;
    routeTime(home, { lat: t.place.lat!, lng: t.place.lng! })
      .then((r) => alive && setRoute(r))
      .catch(() => alive && setRouteErr('경로 서버에 연결하지 못했어요.'));
    return () => {
      alive = false;
    };
  }, [t.place.lat, t.place.lng, home?.lat, home?.lng]);

  // ── 날씨
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [wErr, setWErr] = useState('');
  useEffect(() => {
    setWeather(null);
    setWErr('');
    if (!hasLoc || !t.startDate) return;
    const end = t.endDate && t.endDate >= t.startDate ? t.endDate : t.startDate;
    if (Date.parse(end) - Date.parse(t.startDate) > 14 * 86400000) return setWErr('날씨는 2주 이내 일정만 보여드려요.');
    let alive = true;
    tripWeather(t.place.lat!, t.place.lng!, t.startDate, end)
      .then((w) => alive && setWeather(w))
      .catch(() => alive && setWErr('날씨 서버에 연결하지 못했어요.'));
    return () => {
      alive = false;
    };
  }, [t.place.lat, t.place.lng, t.startDate, t.endDate]);

  // ── 배치도
  const saveLayout = () => {
    if (!placements) return;
    if (t.layout && !ask('이 일정에 저장된 배치도를 지금 배치 화면의 배치로 바꿀까요?')) return;
    const snap = snapshotLayout();
    const patch: Partial<Trip> = { layout: snap };
    if (!t.siteW && snap.campsite.confirmed) Object.assign(patch, { siteW: snap.campsite.w, siteH: snap.campsite.h });
    update(patch);
  };
  const openLayout = () => {
    if (!t.layout) return;
    if (getState().placements.length && !ask('배치 화면의 지금 배치가 이 일정의 배치도로 바뀝니다.\n(지금 배치를 남기려면 먼저 다른 일정에 저장해두세요)\n계속할까요?')) return;
    applyLayout(t.layout);
    onPlanner();
  };
  const startLayout = () => {
    // 이 일정 사이트 크기로 새 배치 시작
    if (getState().placements.length && !ask('배치 화면을 비우고 이 일정의 사이트 크기로 새로 배치할까요?')) return;
    actions.clearLayout();
    if (t.siteW && t.siteH) actions.setCampsite(t.siteW, t.siteH, [t.place.name, t.siteNo].filter(Boolean).join(' '));
    if (!saved) save();
    onPlanner();
  };

  const remove = () => {
    if (!ask(`"${tripName(t)}" 일정을 삭제할까요?`)) return;
    actions.removeTrip(t.id);
    onClose();
  };

  const back = () => {
    if (!saved && (t.place.name || t.title) && ask('저장하지 않은 새 일정이에요. 저장할까요?')) actions.saveTrip(t);
    onClose();
  };

  const past = isPastTrip(t);
  const sizes = picked?.sizes ?? [];
  const floors = picked?.floors ?? [];

  return (
    <div className="catalog trips">
      <header className="topbar">
        <button className="icon-btn" onClick={back} aria-label="일정 목록">
          <Icon name="back" />
        </button>
        <h1>
          {isNew && !saved ? '새 일정' : tripName(t)}
          <small className="topbar-sub">{fmtTripDates(t)}</small>
        </h1>
        {saved ? (
          <span className="site-badge">
            <Icon name="check" size={14} /> 자동 저장
          </span>
        ) : (
          <button className="btn small primary" onClick={save}>
            저장
          </button>
        )}
      </header>
      <div className="catalog-body trips-body trip-edit">
        {/* 날짜 */}
        <section className="trip-sec">
          <h3><Icon name="calendar" size={18} /> 날짜</h3>
          <div className="gear-form">
            <label>
              일정 이름 (선택)
              <input value={t.title} onChange={(e) => update({ title: e.target.value })} placeholder="예: 가을 가족캠핑" />
            </label>
            <div className="row nowrap">
              <label style={{ flex: 1 }}>
                가는 날
                <input
                  type="date"
                  value={t.startDate}
                  onChange={(e) => update({ startDate: e.target.value, endDate: t.endDate && t.endDate < e.target.value ? e.target.value : t.endDate })}
                />
              </label>
              <label style={{ flex: 1 }}>
                오는 날
                <input type="date" value={t.endDate} min={t.startDate} onChange={(e) => update({ endDate: e.target.value })} />
              </label>
            </div>
          </div>
        </section>

        {/* 장소 */}
        <section className="trip-sec">
          <h3><Icon name="pin" size={18} /> 캠핑장</h3>
          <div className="gear-form">
            <form
              className="row nowrap"
              onSubmit={(e) => {
                e.preventDefault();
                doSearch();
              }}
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="캠핑장 이름으로 검색 (예: 자라섬)" style={{ flex: 1 }} />
              <button className="btn small primary" disabled={searching || !q.trim()}>
                <Icon name="search" size={16} /> 검색
              </button>
            </form>
            {searching && <p className="muted small">찾는 중…</p>}
            {searchErr && <p className="small">{searchErr}</p>}
            {results && (
              <div className="place-results">
                <p className="muted small">
                  {results.length ? `${results.length}곳 찾음 · ` : '찾지 못했어요. 아래에 직접 입력해주세요. · '}
                  {resultSrc === 'gocamping' ? '고캠핑(한국관광공사) 자료' : 'OpenStreetMap 자료'}
                </p>
                {results.map((r, i) => (
                  <button type="button" key={i} className="place-item" onClick={() => pick(r)}>
                    <b>{r.name}</b>
                    <span>{r.address}</span>
                    {(r.sizes?.length || r.floors?.length) ? (
                      <span className="muted">
                        {r.floors?.join('·')}
                        {r.sizes?.length ? ` · 사이트 ${r.sizes.map((s) => `${s.w}×${s.h}m`).join(', ')}` : ''}
                      </span>
                    ) : null}
                  </button>
                ))}
                <button type="button" className="btn small ghost" onClick={() => setResults(null)}>
                  닫기
                </button>
              </div>
            )}
            <label>
              캠핑장 이름
              <input value={t.place.name} onChange={(e) => setPlace({ name: e.target.value })} placeholder="직접 입력" />
            </label>
            <label>
              주소 (선택 – 지도·소요시간 계산용)
              <div className="row nowrap">
                <input
                  value={t.place.address ?? ''}
                  onChange={(e) => setPlace({ address: e.target.value })}
                  placeholder="예: 경기도 가평군 가평읍"
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn small" onClick={locate} disabled={locating || !(t.place.address || t.place.name)}>
                  {locating ? '찾는 중' : hasLoc ? '위치 다시 찾기' : '위치 찾기'}
                </button>
              </div>
            </label>
            {locErr && <p className="small">{locErr}</p>}
            <div className="row nowrap">
              <label style={{ flex: 1 }}>
                몇 번 자리
                <input value={t.siteNo} onChange={(e) => update({ siteNo: e.target.value })} placeholder="예: A-12" />
              </label>
              <label style={{ flex: 1.4 }}>
                사이트 크기 (m)
                <div className="row nowrap size-inputs">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={200}
                    step={0.5}
                    value={t.siteW ?? ''}
                    onChange={(e) => update({ siteW: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="가로"
                  />
                  <span>×</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={200}
                    step={0.5}
                    value={t.siteH ?? ''}
                    onChange={(e) => update({ siteH: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="세로"
                  />
                </div>
              </label>
            </div>
            {sizes.length > 0 && (
              <div className="row">
                <span className="small">고캠핑 사이트 크기:</span>
                {sizes.map((s, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`chip ${t.siteW === s.w && t.siteH === s.h ? 'on' : ''}`}
                    onClick={() => update({ siteW: s.w, siteH: s.h })}
                  >
                    {s.w}×{s.h}m{s.count ? ` (${s.count}면)` : ''}
                  </button>
                ))}
              </div>
            )}
            <div>
              <div className="small" style={{ marginBottom: 4 }}>
                바닥{floors.length ? <span className="muted"> · 이 캠핑장: {floors.join('·')}</span> : null}
              </div>
              <div className="seg">
                {SITE_FLOORS.map((f) => (
                  <button type="button" key={f.id} className={t.floor === f.id ? 'on' : ''} onClick={() => update({ floor: t.floor === f.id ? '' : f.id })}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {(t.place.tel || t.place.homepage || t.place.info) && (
              <div className="place-info small">
                {t.place.info && <p>{t.place.info}</p>}
                <div className="row">
                  {t.place.tel && (
                    <a className="chip" href={`tel:${t.place.tel}`}>
                      ☎ {t.place.tel}
                    </a>
                  )}
                  {t.place.homepage && (
                    <a className="chip" href={t.place.homepage} target="_blank" rel="noopener noreferrer">
                      홈페이지
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 지도 + 소요시간 */}
        <section className="trip-sec">
          <h3><Icon name="map" size={18} /> 지도 · 가는 시간</h3>
          {!hasLoc ? (
            <p className="muted small">캠핑장을 검색해서 고르거나, 주소를 넣고 "위치 찾기"를 누르면 지도와 소요시간이 나와요.</p>
          ) : (
            <>
              <TripMap site={{ lat: t.place.lat!, lng: t.place.lng! }} home={home} line={route?.line} />
              <div className="route-box">
                {!home ? (
                  <button className="btn small" onClick={() => setShowHome(true)}>
                    <Icon name="home" size={16} /> 집 위치 설정하고 소요시간 보기
                  </button>
                ) : route ? (
                  <p>
                    집에서 자동차로 약 <b>{fmtDuration(route.minutes)}</b> · {route.km}km
                    <span className="muted small"> (실시간 교통 미반영, 개략)</span>
                  </p>
                ) : routeErr ? (
                  <p className="small">
                    {routeErr} 직선거리 약 <b>{straightKm(home, { lat: t.place.lat!, lng: t.place.lng! })}km</b>
                  </p>
                ) : (
                  <p className="muted small">소요시간 계산 중…</p>
                )}
                <div className="row">
                  <a className="chip" href={`https://map.kakao.com/link/to/${encodeURIComponent(t.place.name || '캠핑장')},${t.place.lat},${t.place.lng}`} target="_blank" rel="noopener noreferrer">
                    카카오맵 길찾기
                  </a>
                  <a className="chip" href={`https://www.google.com/maps/dir/?api=1&destination=${t.place.lat},${t.place.lng}`} target="_blank" rel="noopener noreferrer">
                    구글 지도
                  </a>
                  {home && (
                    <button className="chip" onClick={() => setShowHome(true)}>
                      집 위치 변경
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        {/* 날씨 */}
        <section className="trip-sec">
          <h3>☀︎ 날씨</h3>
          {!hasLoc ? (
            <p className="muted small">캠핑장 위치가 정해지면 날씨가 나와요.</p>
          ) : wErr ? (
            <p className="small">{wErr}</p>
          ) : !weather ? (
            <p className="muted small">날씨 불러오는 중…</p>
          ) : (
            <>
              <p className="muted small">{weather.note}</p>
              <div className="weather-row">
                {weather.days.map((d) => {
                  const w = weatherLabel(d.code);
                  const dt = new Date(`${d.date}T00:00:00`);
                  return (
                    <div key={d.date} className="weather-day">
                      <small>
                        {dt.getMonth() + 1}/{dt.getDate()}({'일월화수목금토'[dt.getDay()]})
                      </small>
                      <span className="w-icon" aria-hidden>{w.icon}</span>
                      <b>{w.text}</b>
                      <span>
                        {d.tMin}° / {d.tMax}°
                      </span>
                      {d.rainProb != null && <small>강수 {d.rainProb}%</small>}
                      {d.rainMm != null && d.rainMm > 0 && <small>비 {Math.round(d.rainMm * 10) / 10}mm</small>}
                      {d.windMax != null && <small>바람 {Math.round((d.windMax / 3.6) * 10) / 10}m/s</small>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* 배치도 + 장비 목록 */}
        <section className="trip-sec">
          <h3><Icon name="tent" size={18} /> 배치도 · {past ? '썼던 장비' : '가져갈 장비'}</h3>
          {t.layout ? (
            <>
              <p className="muted small">
                {new Date(t.layout.savedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} 저장 · 사이트{' '}
                {t.layout.campsite.w}×{t.layout.campsite.h}m · 그룹 {t.layout.sites.length}개
              </p>
              <div className="row">
                <button className="btn small primary" onClick={openLayout}>
                  배치도 꺼내보기
                </button>
                <button className="btn small" onClick={saveLayout} disabled={!placements}>
                  지금 배치로 바꾸기
                </button>
              </div>
              <table className="trip-gear">
                <thead>
                  <tr>
                    <th>종류</th>
                    <th>장비</th>
                    <th>크기</th>
                    <th>수량</th>
                  </tr>
                </thead>
                <tbody>
                  {t.layout.gearList.map((g) => (
                    <tr key={g.id}>
                      <td>{catLabel(g.category)}</td>
                      <td>
                        <small className="muted">{g.brand}</small> {g.name}
                      </td>
                      <td>{g.size}</td>
                      <td>{g.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <p className="muted small">
                배치 화면에서 배치한 뒤 여기서 저장하거나, 배치 화면 위쪽의 <b>일정</b> 버튼으로 저장할 수 있어요. 저장하면 그때 쓴 장비 목록도 함께 남아요.
              </p>
              <div className="row">
                <button className="btn small primary" onClick={saveLayout} disabled={!placements}>
                  지금 배치 저장 {placements ? `(${placements}개)` : ''}
                </button>
                <button className="btn small" onClick={startLayout}>
                  이 일정으로 새로 배치하기
                </button>
              </div>
            </>
          )}
        </section>

        {/* 메모 */}
        <section className="trip-sec">
          <h3><Icon name="edit" size={18} /> 메모</h3>
          <textarea className="trip-memo" value={t.memo ?? ''} onChange={(e) => update({ memo: e.target.value })} placeholder="예약번호, 체크인 시간, 준비물…" rows={3} />
        </section>

        <div className="form-actions">
          {saved ? (
            <button className="btn ghost danger" onClick={remove}>
              <Icon name="trash" size={16} /> 일정 삭제
            </button>
          ) : (
            <button className="btn primary" onClick={save}>
              일정 저장
            </button>
          )}
        </div>
      </div>
      {showHome && <HomeModal onClose={() => setShowHome(false)} />}
    </div>
  );
}
