import { useStore } from '../store';
import { dday, fmtTripDates, isPastTrip } from '../trips';
import { Icon } from '../components/Icon';
import { IS_PREVIEW } from '../env';
import { isNativeApp } from '../share';
import illust from '../assets/home-illust.webp';

const INSTAGRAM = 'https://www.instagram.com/ricky_camping/';

export function Home({ go }: { go: (p: 'catalog' | 'planner' | 'trips', id?: string) => void }) {
  const owned = useStore((s) => s.owned.length);
  const placed = useStore((s) => s.placements.length);
  const trips = useStore((s) => s.trips);
  const next = trips.filter((t) => !isPastTrip(t)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return (
    <div className="home">
      <div className="home-hero">
        <div className="logo"><Icon name="tent" size={56} stroke={1.2} /></div>
        <h1>CampCanvas</h1>
        <div className="home-by">
          by{' '}
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            @ricky_camping
          </a>
          {IS_PREVIEW && <span className="preview-pill">태블릿 미리보기</span>}
        </div>
        <p>텐트·타프·가구를 1m 격자 위에 미리 배치해보는 캠핑 시뮬레이터</p>
      </div>
      <div className="home-actions">
        <button className="home-card" onClick={() => go('catalog')}>
          <span className="home-icon"><Icon name="book" size={30} stroke={1.3} /></span>
          <span>
            <b>장비제원</b>
            <small>브랜드별 텐트·타프·테이블·의자 등 제원 보기 · 내 장비/위시 등록</small>
          </span>
          {owned > 0 && <em>{owned}</em>}
        </button>
        <button className="home-card primary" onClick={() => go('planner')}>
          <span className="home-icon"><Icon name="map" size={30} stroke={1.3} /></span>
          <span>
            <b>장비배치</b>
            <small>장비 고르기·직접 입력 · AI 채팅 · 텐트 더 놓기 · 공유</small>
          </span>
          {placed > 0 && <em>{placed}</em>}
        </button>
        <button className="home-card" onClick={() => (next ? go('trips', next.id) : go('trips'))}>
          <span className="home-icon"><Icon name="calendar" size={30} stroke={1.3} /></span>
          <span>
            <b>캠핑일정</b>
            {next ? (
              <small>
                <strong>{dday(next)}</strong> {next.title || next.place.name || '다음 캠핑'} · {fmtTripDates(next)}
              </small>
            ) : (
              <small>캠핑장 검색·지도·가는 시간·날씨 · 배치도와 장비 목록 저장</small>
            )}
          </span>
          {trips.length > 0 && <em>{trips.length}</em>}
        </button>
        {next && (
          <button className="linklike home-trips-all" onClick={() => go('trips')}>
            전체 일정 보기
          </button>
        )}
      </div>
      {!IS_PREVIEW && !isNativeApp() && (
        <section className="install-box">
          <h2>앱으로 설치하기</h2>
          <div className="install-grid">
            <a className="install-item" href="./CampCanvas.apk" download>
              <b>안드로이드 · 갤럭시탭</b>
              <span>CampCanvas.apk 내려받기 → 설치</span>
            </a>
            <div className="install-item">
              <b>아이폰 · 아이패드</b>
              <span>Safari에서 공유 버튼 → "홈 화면에 추가"</span>
            </div>
          </div>
          <p className="muted small">안드로이드는 "출처를 알 수 없는 앱" 허용과 Play 프로텍트 "무시하고 설치"가 필요할 수 있어요.</p>
        </section>
      )}
      <figure className="home-illust">
        <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="인스타그램 @ricky_camping 열기">
          <img src={illust} alt="텐트 앞에서 커피를 마시는 캠핑 커플 일러스트" width={720} height={720} />
        </a>
        <figcaption>
          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer">
            Instagram @ricky_camping
          </a>
        </figcaption>
      </figure>
      <p className="home-foot muted small">
        제원의 "추정" 표시는 공식 자료로 확인하지 못한 값입니다. 구매·배치 전 공식 홈페이지에서 꼭 확인해주세요.
      </p>
    </div>
  );
}
