import { useMemo, useRef, useState } from 'react';
import { actions, allBrands, allGear, getState, useStore } from '../store';
import { CATEGORIES, type Gear } from '../types';
import { GearCard } from '../components/GearCard';
import { GearForm } from '../components/GearForm';
import { Modal } from '../components/Modal';
import { SettingsModal } from '../components/SettingsModal';
import { aiReady, lookupGear, normalizeGear, NoKeyError } from '../ai';
import { CORE_BRANDS } from '../data/gear';
import { Icon } from '../components/Icon';
import { ask, IS_PREVIEW } from '../env';

type Found = Omit<Gear, 'id'>;

export function Catalog({ onBack, onPlan }: { onBack: () => void; onPlan: () => void }) {
  const gear = useStore(allGear);
  const extraBrands = useStore((s) => s.extraBrands);
  const customGear = useStore((s) => s.customGear);
  const owned = useStore((s) => s.owned);
  const wish = useStore((s) => s.wish);
  const brands = useMemo(() => allBrands(getState()), [extraBrands, customGear]);
  const [brand, setBrand] = useState<string>(CORE_BRANDS[0]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Gear | 'new' | null>(null);
  const [ai, setAi] = useState<{
    query: string;
    homepage: string;
    status: string;
    items: Found[];
    selected: number[];
    busy: boolean;
    verifyOf?: Gear;
    blocked?: 'preview' | 'nokey';
  } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Gear> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const ql = q.trim().toLowerCase();
  const searching = ql.length > 0;
  const list = useMemo(() => {
    if (brand === '__mine') return gear.filter((g) => owned.includes(g.id) || wish.includes(g.id));
    if (searching) return gear.filter((g) => `${g.brand} ${g.name} ${g.model ?? ''}`.toLowerCase().includes(ql));
    return gear.filter((g) => g.brand === brand);
  }, [gear, brand, searching, ql, owned, wish]);

  const norm = (t: string) => t.toLowerCase().replace(/[\s()·\-_.]/g, '');
  const isDup = (g: Found) => gear.some((x) => norm(x.brand) === norm(g.brand) && norm(x.name) === norm(g.name));

  /** 검색 창 열기 (자동으로 바로 검색 시작) */
  const openSearch = (query: string, verifyOf?: Gear, homepage = '') => {
    setAi({ query, homepage, status: '', items: [], selected: [], busy: false, verifyOf });
    if (query.trim()) runAi(query, homepage, verifyOf);
  };

  /** AI 없이도 되는 검색: 기기 브라우저에서 구글 검색 (홈페이지가 있으면 그 사이트 안에서) */
  const browserSearchUrl = (query: string, homepage: string) => {
    let site = '';
    try {
      if (homepage.trim()) site = ` site:${new URL(/^https?:\/\//.test(homepage) ? homepage : `https://${homepage}`).hostname}`;
    } catch {
      /* 잘못된 주소는 무시 */
    }
    return `https://www.google.com/search?q=${encodeURIComponent(`${query} 사이즈 제원${site}`)}`;
  };

  const runAi = async (query: string, homepage: string, verifyOf?: Gear) => {
    abortRef.current?.abort();
    if (!aiReady()) {
      const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setAi({
        query,
        homepage,
        verifyOf,
        items: [],
        selected: [],
        busy: false,
        blocked: 'nokey',
        status: `AI가 아직 연결되지 않아 자동 검색을 할 수 없어요. (${t})\n· 설정에서 AI 접속 코드(서버 배포 후) 또는 개인 Anthropic API 키를 넣으면 자동으로 찾아 드려요.\n· 지금은 "브라우저에서 검색"으로 찾아보고 "직접 입력"으로 추가할 수 있어요.`,
      });
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    const status = IS_PREVIEW
      ? `Claude에게 제원을 묻는 중… (처음 한 번은 AI 사용 허용 창이 떠요. 30초~1분)${homepage ? '\n※ 미리보기에서는 홈페이지를 직접 열 수 없어 Claude가 아는 정보로 찾습니다.' : ''}`
      : homepage
        ? `${homepage} 에서 "${query}" 장비를 찾는 중… (1~2분 걸릴 수 있어요)`
        : `웹에서 "${query}" 장비를 검색 중… (30초~1분 정도 걸릴 수 있어요)`;
    setAi({ query, homepage, status, items: [], selected: [], busy: true, verifyOf });
    try {
      const fallbackBrand = verifyOf?.brand ?? query.split(/\s+/)[0];
      const res = await lookupGear(query, undefined, ac.signal, homepage);
      const items = res.items.map((g) => normalizeGear(g, fallbackBrand));
      const selected = items.map((g, i) => (isDup(g) ? -1 : i)).filter((i) => i >= 0);
      setAi({
        query,
        homepage,
        verifyOf,
        items,
        selected,
        busy: false,
        status: items.length
          ? `${items.length}개 장비를 찾았어요. 추가할 장비를 골라주세요.${IS_PREVIEW ? '\n(웹 검색 없이 Claude가 아는 정보라 모두 "추정"으로 저장됩니다)' : ''}`
          : `해당하는 장비를 찾지 못했어요. 검색어를 바꾸거나 홈페이지 주소를 넣어보세요.\n${res.text.slice(0, 300)}`,
      });
    } catch (e) {
      if (e instanceof NoKeyError) {
        setAi({
          query,
          homepage,
          verifyOf,
          items: [],
          selected: [],
          busy: false,
          blocked: 'nokey',
          status: `AI 검색을 하려면 설정이 필요해요.\n${e.message}\n\n설정 없이 바로 추가하려면 "직접 입력"을 눌러주세요.`,
        });
        return;
      }
      if ((e as Error).name === 'AbortError') return;
      setAi({ query, homepage, verifyOf, items: [], selected: [], busy: false, status: `오류: ${(e as Error).message}` });
    }
  };

  const addSelected = () => {
    if (!ai) return;
    const picked = ai.selected.map((i) => ai.items[i]).filter(Boolean);
    if (!picked.length) return;
    picked.forEach((g) => actions.addGear(g));
    setQ('');
    setBrand(picked[0].brand);
    setAi(null);
    setFlash(`${picked.length}개 장비를 장비목록에 추가했어요. 카드의 "보유"를 누르면 보유목록에 들어갑니다.`);
    setTimeout(() => setFlash(null), 6000);
  };

  const brandTabs = [...brands];

  return (
    <div className="catalog">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="메인으로">
          <Icon name="back" />
        </button>
        <h1>장비제원</h1>
        <button className="btn small primary" onClick={onPlan}>
          배치하기
        </button>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="설정">
          <Icon name="settings" />
        </button>
      </header>

      <form
        className="catalog-search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = (searchRef.current?.value ?? q).trim(); // 한글 입력 조합 중이어도 실제 값 사용
          setQ(v);
          openSearch(v);
        }}
      >
        <div className="search-box">
          <input
            ref={searchRef}
            className="search"
            placeholder="장비명 입력 후 돋보기 → 웹에서 검색 (예: 엑스페드 메가매트)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            aria-label="장비 검색"
          />
          <button type="submit" className="search-go" aria-label="웹에서 검색">
            <Icon name="search" size={18} />
          </button>
        </div>
        <button type="button" className="btn small ghost" onClick={() => openSearch('', undefined)}>
          <Icon name="link" size={14} /> 홈페이지에서 찾기
        </button>
      </form>
      {flash && <div className="flash">{flash}</div>}

      <nav className="brand-tabs">
        <button className={brand === '__mine' && !searching ? 'on' : ''} onClick={() => (setQ(''), setBrand('__mine'))}>
          <Icon name="star" size={14} /> 내 장비
        </button>
        {brandTabs.map((b) => (
          <button key={b} className={brand === b && !searching ? 'on' : ''} onClick={() => (setQ(''), setBrand(b))}>
            {b}
            {!CORE_BRANDS.includes(b as (typeof CORE_BRANDS)[number]) && <span className="new-dot" />}
          </button>
        ))}
      </nav>

      <main className="catalog-body">
        {searching && <p className="muted">현재 목록에서 "{q}" {list.length}개 · 오른쪽 돋보기를 누르면 웹에서 더 찾아 골라 추가할 수 있어요.</p>}
        {!searching && brand !== '__mine' && list.length === 0 && (
          <div className="empty-brand">
            <p>
              <b>{brand}</b> 장비가 아직 DB에 없어요.
              <br />
              <span className="muted small">공식 자료를 찾지 못한 브랜드입니다. AI 검색이나 직접 입력으로 채워주세요.</span>
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => openSearch(`${brand} 캠핑 장비 전체 라인업`)}>
                <Icon name="search" size={16} /> AI로 {brand} 장비 검색
              </button>
              <button className="btn ghost" onClick={() => (setDraft(null), setEditing('new'))}>
                <Icon name="edit" size={16} /> 직접 입력
              </button>
            </div>
          </div>
        )}

        {CATEGORIES.map((c) => {
          const items = list.filter((g) => g.category === c.id);
          if (items.length === 0) return null;
          return (
            <section key={c.id} className="cat-section">
              <h3>
                <Icon name={c.id} size={18} /> {c.label} <span className="muted small">{items.length}</span>
              </h3>
              <div className="card-grid">
                {items.map((g) => (
                  <GearCard key={g.id} gear={g} onEdit={setEditing} onVerify={(x) => openSearch(`${x.brand} ${x.name} ${x.model ?? ''}`.trim(), x, x.source ?? '')} />
                ))}
              </div>
            </section>
          );
        })}
        {!searching && brand !== '__mine' && list.length > 0 && (
          <div className="empty-cats">
            {CATEGORIES.filter((c) => !list.some((g) => g.category === c.id)).map((c) => (
              <span key={c.id} className="muted small">
                {c.label}: 등록 없음
              </span>
            ))}
            <button className="btn small ghost" onClick={() => openSearch(`${brand} ${CATEGORIES.filter((c) => !list.some((g) => g.category === c.id)).map((c) => c.label).join(', ')}`)}>
              <Icon name="search" size={14} /> 빈 항목 AI 검색
            </button>
          </div>
        )}
        {!ai && !editing && (
          <button className="fab" onClick={() => (setDraft(null), setEditing('new'))} aria-label="장비 직접 추가">
            <Icon name="plus" size={26} />
          </button>
        )}
      </main>

      {editing && (
        <Modal
          title={editing === 'new' ? '장비 직접 추가' : `${editing.name} 수정`}
          onClose={() => {
            setEditing(null);
            setDraft(null);
          }}
        >
          <GearForm
            brands={brands}
            initial={editing === 'new' ? draft ?? { brand: brand === '__mine' ? '' : brand } : editing}
            submitLabel={editing === 'new' ? '추가' : '저장'}
            onCancel={() => setEditing(null)}
            onSubmit={(d) => {
              if (editing === 'new') {
                const g = actions.addGear(d);
                setBrand(g.brand);
              } else actions.updateGear(editing.id, d);
              setEditing(null);
              setDraft(null);
            }}
          />
          {editing !== 'new' && editing.custom && (
            <button
              className="btn ghost danger full"
              onClick={() => {
                if (ask('이 장비를 삭제할까요?')) {
                  actions.removeGear(editing.id);
                  setEditing(null);
                }
              }}
            >
              장비 삭제
            </button>
          )}
        </Modal>
      )}

      {ai && (
        <Modal
          title={ai.verifyOf ? `AI 제원 확인: ${ai.verifyOf.name}` : '장비 웹 검색'}
          onClose={() => {
            abortRef.current?.abort();
            setAi(null);
          }}
        >
          <form
            className="gear-form web-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ai.query.trim()) runAi(ai.query.trim(), ai.homepage.trim(), ai.verifyOf);
            }}
          >
            <label>
              장비명 / 브랜드
              <input value={ai.query} onChange={(e) => setAi({ ...ai, query: e.target.value })} placeholder="예: 엑스페드 메가매트 듀오" />
            </label>
            <label>
              홈페이지 (선택)
              <input
                value={ai.homepage}
                onChange={(e) => setAi({ ...ai, homepage: e.target.value })}
                placeholder="예: https://www.exped.com"
                inputMode="url"
                autoCapitalize="off"
              />
            </label>
            <p className="muted small">홈페이지를 넣으면 그 사이트에서 먼저 찾아봅니다. 비워두면 웹 전체에서 찾아요.</p>
            {!aiReady() && !ai.status && <p className="notice small">AI가 아직 연결되지 않았어요. 검색을 누르면 브라우저 검색·직접 입력 방법을 안내해 드려요.</p>}
            <div className="form-actions">
              {ai.busy ? (
                <button type="button" className="btn ghost" onClick={() => (abortRef.current?.abort(), setAi({ ...ai, busy: false, status: '중단했어요.' }))}>
                  중지
                </button>
              ) : (
                <button type="submit" className="btn primary" disabled={!ai.query.trim()}>
                  <Icon name="search" size={16} /> 검색
                </button>
              )}
            </div>
          </form>
          {ai.status && <p key={ai.status} className={`small pre ${ai.blocked ? 'notice warn-box' : ''} ${ai.busy ? 'loading' : ''}`}>{ai.status}</p>}
          {ai.blocked && (
            <div className="form-actions">
              {ai.blocked === 'nokey' && !IS_PREVIEW && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setAi(null);
                    setShowSettings(true);
                  }}
                >
                  <Icon name="settings" size={16} /> 설정 열기
                </button>
              )}
              {ai.query.trim() && (
                <a className="btn ghost" href={browserSearchUrl(ai.query, ai.homepage)} target="_blank" rel="noreferrer">
                  <Icon name="search" size={16} /> 브라우저에서 검색
                </a>
              )}
              <button
                className="btn primary"
                onClick={() => {
                  const words = ai.query.split(/\s+/).filter(Boolean);
                  const known = brands.find((b) => words[0] && b.includes(words[0]));
                  setDraft(ai.verifyOf ? ai.verifyOf : { brand: known ?? words[0] ?? '', name: words.slice(1).join(' ') || ai.query });
                  setAi(null);
                  setEditing(ai.verifyOf ?? 'new');
                }}
              >
                <Icon name="edit" size={16} /> 직접 입력
              </button>
            </div>
          )}
          {ai.items.map((g, i) => {
            const dup = isDup(g);
            const on = ai.selected.includes(i);
            return (
              <div key={i} className={`gear-card pick-card ${on ? 'on' : ''}`}>
                <div className="gear-card-head">
                  {!ai.verifyOf && (
                    <input
                      type="checkbox"
                      aria-label={`${g.name} 선택`}
                      checked={on}
                      onChange={() => setAi({ ...ai, selected: on ? ai.selected.filter((x) => x !== i) : [...ai.selected, i] })}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gear-name">{g.name}</div>
                    <div className="muted small">
                      {g.brand} · {CATEGORIES.find((c) => c.id === g.category)?.label}
                      {g.model ? ` · ${g.model}` : ''}
                      {dup && <span className="badge warn">이미 목록에 있음</span>}
                    </div>
                  </div>
                  {g.verified ? <span className="badge ok">확인됨</span> : <span className="badge warn">추정</span>}
                </div>
                <div className="gear-dims">
                  <span>
                    <Icon name="ruler" size={14} /> {g.l} × {g.w} × {g.h} cm
                  </span>
                  {g.material && <span className="muted">{g.material}</span>}
                  {g.weight && <span className="muted">{g.weight}</span>}
                </div>
                {g.note && <div className="muted small note">{g.note}</div>}
                {g.source && (
                  <a className="small" href={g.source} target="_blank" rel="noreferrer">
                    출처 보기
                  </a>
                )}
                {ai.verifyOf && (
                  <div className="gear-actions">
                    <button
                      className="chip primary"
                      onClick={() => {
                        actions.updateGear(ai.verifyOf!.id, { ...g, brand: ai.verifyOf!.brand, category: ai.verifyOf!.category });
                        setAi(null);
                      }}
                    >
                      이 값으로 업데이트
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!ai.verifyOf && ai.items.length > 0 && (
            <div className="sticky-actions">
              <button className="btn ghost" onClick={() => setAi({ ...ai, selected: ai.selected.length === ai.items.length ? [] : ai.items.map((_, i) => i) })}>
                {ai.selected.length === ai.items.length ? '전체 해제' : '전체 선택'}
              </button>
              <button className="btn primary" disabled={!ai.selected.length} onClick={addSelected}>
                선택한 {ai.selected.length}개 장비목록에 추가
              </button>
            </div>
          )}
        </Modal>
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
