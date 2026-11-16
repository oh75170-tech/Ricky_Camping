import { useMemo, useState } from 'react';
import { actions, getState, useStore } from '../store';
import { dday, fmtTripDates, isPastTrip, copyLayoutToTrip, newTrip } from '../trips';
import { ask } from '../env';
import { Modal } from './Modal';

/** 배치 화면 → 지금 배치를 캠핑 일정에 저장 */
export function SaveTripModal({ onClose, onOpenTrip }: { onClose: () => void; onOpenTrip: (id: string) => void }) {
  const trips = useStore((s) => s.trips);
  const campsite = useStore((s) => s.campsite);
  const [done, setDone] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [camp, setCamp] = useState(campsite.name);
  const [start, setStart] = useState(newTrip().startDate);
  const [end, setEnd] = useState(newTrip().endDate);
  const list = useMemo(
    () => [...trips.filter((t) => !isPastTrip(t)).sort((a, b) => a.startDate.localeCompare(b.startDate)), ...trips.filter(isPastTrip).sort((a, b) => b.startDate.localeCompare(a.startDate))],
    [trips],
  );

  const saveTo = (id: string) => {
    const t = getState().trips.find((x) => x.id === id);
    if (!t) return;
    if (t.layout?.placements.length && !ask(`"${t.title || t.place.name}" 일정에 이미 배치도가 있어요. 지금 배치로 바꿀까요?`)) return;
    copyLayoutToTrip(id);
    setDone(id);
  };
  const createNew = () => {
    const cs = getState().campsite;
    const t = {
      ...newTrip(),
      title: title.trim(),
      startDate: start,
      endDate: end < start ? start : end,
      place: { name: camp.trim(), source: 'manual' as const },
      ...(cs.confirmed ? { siteW: cs.w, siteH: cs.h } : {}),
    };
    actions.saveTrip(t);
    copyLayoutToTrip(t.id);
    setDone(t.id);
  };

  if (done)
    return (
      <Modal title="일정에 반영했어요" onClose={onClose}>
        <div className="gear-form">
          <p style={{ color: 'var(--ink)' }}>지금 배치와 장비 목록을 일정에 복사해 저장했어요(이 기기). 여기서 계속 고쳐도 일정은 바뀌지 않아요. 일정 배치를 고치려면 일정에서 [배치 확인·수정]을 누르거나, 다시 [일정에 반영]을 누르세요.</p>
          <div className="form-actions">
            <button className="btn ghost" onClick={onClose}>
              계속 배치하기
            </button>
            <button className="btn primary" onClick={() => onOpenTrip(done)}>
              일정 보기
            </button>
          </div>
        </div>
      </Modal>
    );

  return (
    <Modal title="일정에 배치 반영" onClose={onClose}>
      <div className="gear-form">
        <p className="muted small">지금 배치(장비 {getState().placements.length}개)를 골라 둔 일정에 복사해 저장해요. 반영한 뒤에는 서로 연결되지 않아요.</p>
        {list.length > 0 && (
          <>
            <b className="small" style={{ color: 'var(--ink)' }}>기존 일정에 반영</b>
            <div className="place-results">
              {list.map((t) => (
                <button type="button" key={t.id} className="place-item" onClick={() => saveTo(t.id)}>
                  <b>
                    {t.title || t.place.name || '이름 없는 일정'} <span className="muted">{dday(t)}</span>
                  </b>
                  <span>
                    {fmtTripDates(t)}
                    {t.layout?.placements.length ? ' · 배치도 있음 (바꿔 저장)' : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <b className="small" style={{ color: 'var(--ink)' }}>새 일정 만들기</b>
        <label>
          캠핑장
          <input value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="예: 자라섬 캠핑장 (검색·자리번호는 일정에서)" />
        </label>
        <label>
          일정 이름 (선택)
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 가을 가족캠핑" />
        </label>
        <div className="row nowrap">
          <label style={{ flex: 1 }}>
            가는 날
            <input type="date" value={start} onChange={(e) => (setStart(e.target.value), end < e.target.value && setEnd(e.target.value))} />
          </label>
          <label style={{ flex: 1 }}>
            오는 날
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="btn primary" onClick={createNew} disabled={!start}>
            새 일정 만들고 반영
          </button>
        </div>
      </div>
    </Modal>
  );
}
