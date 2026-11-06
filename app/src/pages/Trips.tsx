import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { TripMap } from '../components/TripMap';
import { HomeModal } from '../components/HomeModal';
import { PhotoThumb, PhotoViewer, TripPhotoSlots } from '../components/TripPhotos';
import { deletePhotos } from '../photos';
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
import { campKey, linkCurrentLayout, openTripLayout, dday, fmtTripDates, isPastTrip, lookupSiteSize, newTrip, siteKey, todayStr } from '../trips';

const floorLabel = (f: SiteFloor | '') => SITE_FLOORS.find((x) => x.id === f)?.label ?? '';
const catLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
const tripName = (t: Trip) => t.title || t.place.name || '이름 없는 일정';

export function Trips({
  openId,
  onOpen,
  onCloseTrip,
  onBack,
  onPlanner,
}: {
  openId: string | null;
  onOpen: (id: string) => void;
  onCloseTrip: () => void;
  onBack: () => void;
  onPlanner: () => void;
}) {
  const trips = useStore((s) => s.trips);
  // 새 일정 초안 ('new' 화면에서만 사용)
  const [draftNew, setDraftNew] = useState<Trip | null>(null);
  const draft = openId === 'new' ? (draftNew ?? null) : null;
  useEffect(() => {
    if (openId === 'new' && !draftNew) setDraftNew(newTrip());
    if (openId !== 'new' && draftNew) setDraftNew(null);
  }, [openId]);
  const [showHome, setShowHome] = useState(false);
  const [viewer, setViewer] = useState<{ ids: string[]; start: number } | null>(null);
  const home = useStore((s) => s.home);

  const sorted = useMemo(() => {
    const up = trips.filter((t) => !isPastTrip(t)).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = trips.filter(isPastTrip).sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { up, past };
  }, [trips]);

  const saved = draft ? trips.find((t) => t.id === draft.id) : null;
  const open = saved ?? draft ?? trips.find((t) => t.id === openId) ?? null;
  if (open)
    return (
      <TripEditor
        key={open.id}
        initial={open}
        isNew={!!draft && !saved}
        onClose={onCloseTrip}
        onPlanner={onPlanner}
      />
    );

  const card = (t: Trip) => (
    <div
      key={t.id}
      role="button"
      tabIndex={0}
      className={`trip-card ${isPastTrip(t) ? 'past' : ''} ${t.photos?.length ? 'has-photos' : ''}`}
      onClick={() => onOpen(t.id)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}
    >
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
      {t.photos?.length ? (
        <span className={`trip-photos n${Math.min(t.photos.length, 4)}`}>
          {t.photos.slice(0, 4).map((id, n) => (
            <PhotoThumb key={id} id={id} onClick={() => setViewer({ ids: t.photos!.slice(0, 4), start: n })} />
          ))}
        </span>
      ) : (
        <Icon name="back" size={16} className="chev" />
      )}
    </div>
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
        <button className="btn small primary" onClick={() => onOpen('new')}>
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
            <button className="btn primary" onClick={() => onOpen('new')}>
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
      {viewer && <PhotoViewer ids={viewer.ids} start={viewer.start} onClose={() => setViewer(null)} />}
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

  // ── 자리번호 → 크기 기억 (입력을 마치거나 화면을 나갈 때 저장)
  const tRef = useRef(t);
  tRef.current = t;
  const remember = () => {
    const x = tRef.current;
    if (x.place.name && x.siteNo && x.siteW && x.siteH) actions.rememberSite(campKey(x.place.name), siteKey(x.siteNo), x.siteW, x.siteH);
  };
  useEffect(() => remember, []);
  /** 크기가 어디서 자동으로 들어왔는지 (직접 고치면 null) */
  const [autoSrc, setAutoSrc] = useState<'memory' | 'single' | null>(null);
  const [sizeNote, setSizeNote] = useState('');
  const singleSize = (p: Place) => (p.sizes?.length === 1 ? p.sizes[0] : null);
  const onSiteNo = (v: string, place: Place = t.place) => {
    const hint = place.name ? lookupSiteSize(place.name, v) : null;
    if (hint?.kind === 'exact' && (!t.siteW || autoSrc)) {
      update({ siteNo: v, siteW: hint.w, siteH: hint.h });
      setAutoSrc('memory');
      setSizeNote(`지난번에 입력한 ${v.trim()} 크기를 넣었어요.`);
      return;
    }
    if (autoSrc === 'memory') {
      // 다른 자리로 바꿨는데 기록이 없으면 자동으로 넣었던 크기는 비움
      const one = singleSize(place);
      update({ siteNo: v, siteW: one?.w, siteH: one?.h });
      setAutoSrc(one ? 'single' : null);
      setSizeNote('');
      return;
    }
    update({ siteNo: v });
  };
  const setSize = (patch: Partial<Trip>) => {
    update(patch);
    setAutoSrc(null);
    setSizeNote('');
  };

  // ── 캠핑장 검색
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CampResult[] | null>(null);
  const [resultSrc, setResultSrc] = useState<'gocamping' | 'osm'>('osm');
  const [searchErr, setSearchErr] = useState('');
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
    setResults(null);
    const place: Place = { name: r.name, address: r.address, lat: r.lat, lng: r.lng, source: r.source, tel: r.tel, homepage: r.homepage, info: r.info, sizes: r.sizes, floors: r.floors };
    const hint = t.siteNo ? lookupSiteSize(r.name, t.siteNo) : null;
    const one = singleSize(place);
    const canFill = !t.siteW || !!autoSrc;
    if (canFill && hint?.kind === 'exact') {
      update({ place, siteW: hint.w, siteH: hint.h });
      setAutoSrc('memory');
      setSizeNote(`지난번에 입력한 ${t.siteNo} 크기를 넣었어요.`);
    } else if (canFill && one) {
      update({ place, siteW: one.w, siteH: one.h });
      setAutoSrc('single');
      setSizeNote('이 캠핑장은 사이트 크기가 한 종류라 자동으로 넣었어요.');
    } else update({ place });
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

  // ── 배치도: 꺼내면 배치 화면이 이 일정에 연결되어 고치는 대로 자동 저장
  const activeTripId = useStore((s) => s.activeTripId);
  const ensureSaved = () => {
    if (!saved) {
      actions.saveTrip(tRef.current);
      setSaved(true);
    }
  };
  const openLayout = () => {
    ensureSaved();
    remember();
    openTripLayout(t.id);
    onPlanner();
  };
  const importCurrent = () => {
    ensureSaved();
    linkCurrentLayout(t.id);
    const fresh = getState().trips.find((x) => x.id === t.id);
    if (fresh) setT(fresh);
  };

  const remove = () => {
    if (!ask(`"${tripName(t)}" 일정을 삭제할까요?${t.photos?.length ? `\n사진 ${t.photos.length}장도 함께 지워져요.` : ''}`)) return;
    if (t.photos?.length) deletePhotos(t.photos);
    actions.removeTrip(t.id);
    onClose();
  };

  const back = () => {
    if (!saved && (t.place.name || t.title) && ask('저장하지 않은 새 일정이에요. 저장할까요?')) actions.saveTrip(t);
    onClose();
  };

  const past = isPastTrip(t);
  const sizes = t.place.sizes ?? [];
  const floors = t.place.floors ?? [];
  const hint = t.place.name && t.siteNo ? lookupSiteSize(t.place.name, t.siteNo) : null;
  const zoneHint = hint && (hint.w !== t.siteW || hint.h !== t.siteH) ? hint : null;
  const showPhotos = past || (!!t.startDate && t.startDate <= todayStr()) || !!t.photos?.length;
  const setPhotos = (ids: string[], removed?: string[]) => {
    if (removed?.length) deletePhotos(removed);
    if (saved) update({ photos: ids });
    else {
      const next = { ...t, photos: ids };
      setT(next);
      actions.saveTrip(next);
      setSaved(true);
    }
  };

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

        {/* 사진 */}
        {showPhotos && (
          <section className="trip-sec">
            <h3><Icon name="camera" size={18} /> 캠핑 사진</h3>
            <TripPhotoSlots ids={t.photos ?? []} onChange={setPhotos} />
          </section>
        )}

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
                <input value={t.siteNo} onChange={(e) => onSiteNo(e.target.value)} onBlur={remember} placeholder="예: A-12" />
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
                    onChange={(e) => setSize({ siteW: e.target.value ? Number(e.target.value) : undefined })}
                    onBlur={remember}
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
                    onChange={(e) => setSize({ siteH: e.target.value ? Number(e.target.value) : undefined })}
                    onBlur={remember}
                    placeholder="세로"
                  />
                </div>
              </label>
            </div>
            {sizeNote && <p className="small size-note">✔ {sizeNote}</p>}
            {zoneHint && (
              <div className="row">
                <span className="small">
                  {zoneHint.kind === 'exact' ? `${t.siteNo} 지난 기록:` : `${zoneHint.zone}구역 기록(${zoneHint.n}곳):`}
                </span>
                <button type="button" className="chip" onClick={() => (setSize({ siteW: zoneHint.w, siteH: zoneHint.h }), setTimeout(remember))}>
                  {zoneHint.w}×{zoneHint.h}m 넣기
                </button>
              </div>
            )}
            {sizes.length > 0 && (
              <div className="row">
                <span className="small">고캠핑 사이트 크기:</span>
                {sizes.map((s, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`chip ${t.siteW === s.w && t.siteH === s.h ? 'on' : ''}`}
                    onClick={() => setSize({ siteW: s.w, siteH: s.h })}
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
                  배치도 꺼내보기 · 수정
                </button>
                {activeTripId === t.id && <span className="muted small">배치 화면에 꺼내져 있어요</span>}
              </div>
              <p className="muted small">배치 화면에서 고치면 이 일정 배치도에 자동으로 저장돼요.</p>
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
                아직 배치도가 없어요. <b>배치 시작하기</b>를 누르면 이 일정의 사이트 크기로 배치 화면이 열리고, 놓는 장비가 이 일정에 자동으로 저장돼요.
              </p>
              <div className="row">
                <button className="btn small primary" onClick={openLayout}>
                  이 일정 배치 시작하기
                </button>
                {!activeTripId && placements > 0 && (
                  <button className="btn small" onClick={importCurrent}>
                    배치 화면의 장비 가져오기 ({placements}개)
                  </button>
                )}
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
