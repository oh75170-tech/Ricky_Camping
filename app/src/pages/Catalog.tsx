import { useMemo, useRef, useState } from 'react';
import { actions, allBrands, allGear, getState, useStore } from '../store';
import { CATEGORIES, type Gear } from '../types';
import { GearCard } from '../components/GearCard';
import { GearForm } from '../components/GearForm';
import { Modal } from '../components/Modal';
import { SettingsModal } from '../components/SettingsModal';
import { lookupGear, normalizeGear, NoKeyError } from '../ai';
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
  const [ai, setAi] = useState<{ query: string; status: string; items: Found[]; verifyOf?: Gear; blocked?: 'preview' | 'nokey' } | null>(null);
  const [draft, setDraft] = useState<Partial<Gear> | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const ql = q.trim().toLowerCase();
  const searching = ql.length > 0;
  const list = useMemo(() => {
    if (brand === '__mine') return gear.filter((g) => owned.includes(g.id) || wish.includes(g.id));
    if (searching) return gear.filter((g) => `${g.brand} ${g.name} ${g.model ?? ''}`.toLowerCase().includes(ql));
    return gear.filter((g) => g.brand === brand);
  }, [gear, brand, searching, ql, owned, wish]);

  const runAi = async (query: string, verifyOf?: Gear) => {
    abortRef.current?.abort();
    if (IS_PREVIEW) {
      setAi({
        query,
        verifyOf,
        items: [],
        blocked: 'preview',
        status: '지금은 태블릿 미리보기라 외부 통신이 막혀 있어 AI 검색을 할 수 없어요.\n정식 배포(서버 연결) 후에 사용할 수 있습니다. 지금은 "직접 입력"으로 추가해주세요.',
      });
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setAi({ query, status: '웹에서 공식 제원 검색 중… (30초~1분 정도 걸릴 수 있어요)', items: [], verifyOf });
    try {
      const fallbackBrand = verifyOf?.brand ?? query.split(/\s+/)[0];
      const res = await lookupGear(query, undefined, ac.signal);
      const items = res.items.map((g) => normalizeGear(g, fallbackBrand));
      setAi({
        query,
        verifyOf,
        items,
        status: items.length ? `${items.length}개 장비를 찾았어요. 확인 후 추가해주세요.` : `제원을 찾지 못했어요.\n${res.text.slice(0, 400)}`,
      });
    } catch (e) {
      if (e instanceof NoKeyError) {
        setAi({
          query,
          verifyOf,
          items: [],
          blocked: 'nokey',
          status: `AI 검색을 하려면 설정이 필요해요.\n${e.message}\n\n설정 없이 바로 추가하려면 "직접 입력"을 눌러주세요.`,
        });
        return;
      }
      if ((e as Error).name === 'AbortError') return;
      setAi({ query, verifyOf, items: [], status: `오류: ${(e as Error).message}` });
    }
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

      <div className="catalog-search">
        <input
          className="search"
          placeholder="브랜드·제품 검색 (예: 콜맨, 노르디스크 아스가르드)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        {searching && (
          <button className="btn small" onClick={() => runAi(q.trim())}>
            <Icon name="search" size={14} /> AI로 찾아 추가
          </button>
        )}
      </div>

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
        {searching && <p className="muted">"{q}" 검색 결과 {list.length}개 · 원하는 장비가 없으면 "AI로 찾아 추가"를 눌러주세요. 새 브랜드는 탭으로 자동 추가됩니다.</p>}
        {!searching && brand !== '__mine' && list.length === 0 && (
          <div className="empty-brand">
            <p>
              <b>{brand}</b> 장비가 아직 DB에 없어요.
              <br />
              <span className="muted small">공식 자료를 찾지 못한 브랜드입니다. AI 검색이나 직접 입력으로 채워주세요.</span>
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => runAi(`${brand} 캠핑 장비 전체 라인업`)}>
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
                  <GearCard key={g.id} gear={g} onEdit={setEditing} onVerify={(x) => runAi(`${x.brand} ${x.name} ${x.model ?? ''}`.trim(), x)} />
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
            <button className="btn small ghost" onClick={() => runAi(`${brand} ${CATEGORIES.filter((c) => !list.some((g) => g.category === c.id)).map((c) => c.label).join(', ')}`)}>
              <Icon name="search" size={14} /> 빈 항목 AI 검색
            </button>
          </div>
        )}
        <button className="fab" onClick={() => (setDraft(null), setEditing('new'))} aria-label="장비 직접 추가">
          <Icon name="plus" size={26} />
        </button>
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
          title={ai.verifyOf ? `AI 제원 확인: ${ai.verifyOf.name}` : `AI 검색: ${ai.query}`}
          onClose={() => {
            abortRef.current?.abort();
            setAi(null);
          }}
        >
          <p className={`small pre ${ai.blocked ? 'notice' : ''}`}>{ai.status}</p>
          {ai.blocked && (
            <div className="form-actions">
              {ai.blocked === 'nokey' && (
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
              <button
                className="btn primary"
                onClick={() => {
                  const words = ai.query.split(/\s+/).filter(Boolean);
                  const known = brands.find((b) => words[0] && b.includes(words[0]));
                  setDraft(
                    ai.verifyOf
                      ? ai.verifyOf
                      : { brand: known ?? words[0] ?? '', name: (known ? words.slice(1) : words.slice(1)).join(' ') || ai.query },
                  );
                  setAi(null);
                  setEditing(ai.verifyOf ?? 'new');
                }}
              >
                <Icon name="edit" size={16} /> 직접 입력
              </button>
            </div>
          )}
          {ai.items.map((g, i) => (
            <div key={i} className="gear-card">
              <div className="gear-card-head">
                <div>
                  <div className="gear-name">{g.name}</div>
                  <div className="muted small">
                    {g.brand} · {CATEGORIES.find((c) => c.id === g.category)?.label}
                  </div>
                </div>
                {g.verified ? <span className="badge ok">확인됨</span> : <span className="badge warn">추정</span>}
              </div>
              <div className="gear-dims">
                <span>
                  <Icon name="ruler" size={14} /> {g.l} × {g.w} × {g.h} cm
                </span>
                {g.material && <span className="muted">{g.material}</span>}
              </div>
              {g.note && <div className="muted small note">{g.note}</div>}
              {g.source && (
                <a className="small" href={g.source} target="_blank" rel="noreferrer">
                  출처 보기
                </a>
              )}
              <div className="gear-actions">
                {ai.verifyOf ? (
                  <button
                    className="chip primary"
                    onClick={() => {
                      actions.updateGear(ai.verifyOf!.id, { ...g, brand: ai.verifyOf!.brand, category: ai.verifyOf!.category });
                      setAi(null);
                    }}
                  >
                    이 값으로 업데이트
                  </button>
                ) : (
                  <button
                    className="chip primary"
                    onClick={(e) => {
                      actions.addGear(g);
                      (e.target as HTMLButtonElement).disabled = true;
                      (e.target as HTMLButtonElement).textContent = '추가됨';
                    }}
                  >
                    DB에 추가
                  </button>
                )}
              </div>
            </div>
          ))}
          {!ai.verifyOf && ai.items.length > 1 && (
            <button
              className="btn primary full"
              onClick={() => {
                ai.items.forEach((g) => actions.addGear(g));
                setQ('');
                setBrand(ai.items[0].brand);
                setAi(null);
              }}
            >
              전부 추가
            </button>
          )}
        </Modal>
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
