import { useEffect, useState } from 'react';
import { canShareFiles, canvasToBlob, composeImage, downloadBlob, shareImage } from '../share';
import { Icon } from './Icon';

export function SharePanel({ getMap }: { getMap: () => Promise<HTMLCanvasElement> }) {
  const [title, setTitle] = useState('우리 캠핑 배치도');
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareable = canShareFiles();

  const build = async () => {
    setBusy(true);
    try {
      const map = await getMap();
      const c = composeImage(map, title);
      const blob = await canvasToBlob(c);
      if (preview) URL.revokeObjectURL(preview.url);
      const p = { url: URL.createObjectURL(blob), blob };
      setPreview(p);
      return p;
    } finally {
      setBusy(false);
    }
  };

  // 패널 열 때 미리 이미지 생성 → 공유 버튼 탭 시 바로 공유 시트 호출(모바일 사용자 제스처 유지)
  useEffect(() => {
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doShare = async (target: string) => {
    setMsg(null);
    const p = preview ?? (await build());
    const r = await shareImage(p.blob, title).catch((e) => {
      setMsg(`공유 실패: ${(e as Error).message}`);
      return 'cancelled' as const;
    });
    if (r === 'unsupported') {
      downloadBlob(p.blob);
      setMsg(`이 브라우저는 바로 공유를 지원하지 않아 이미지를 저장했어요. 사진 앱에서 ${target}(으)로 공유해주세요.`);
    }
  };

  return (
    <div className="panel-body">
      <label className="gear-form">
        이미지 제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="share-grid">
        <button className="share-btn insta" onClick={() => doShare('인스타그램')} disabled={busy}>
          <Icon name="camera" size={24} />인스타그램
        </button>
        <button className="share-btn kakao" onClick={() => doShare('카카오톡')} disabled={busy}>
          <Icon name="message" size={24} />카카오톡
        </button>
        <button
          className="share-btn save"
          disabled={busy}
          onClick={async () => {
            const p = preview ?? (await build());
            downloadBlob(p.blob);
            setMsg('이미지를 저장했어요. (iPhone: 공유 버튼 → "이미지 저장"으로도 사진앱에 저장 가능)');
          }}
        >
          <Icon name="download" size={24} />사진 저장
        </button>
        <button className="share-btn more" onClick={() => doShare('원하는 앱')} disabled={busy}>
          <Icon name="more" size={24} />더보기
        </button>
      </div>
      {!shareable && <p className="muted small">PC 브라우저에서는 "사진 저장" 후 업로드해주세요. 휴대폰에서는 공유 시트에서 인스타그램·카카오톡을 고를 수 있어요.</p>}
      {msg && <p className="small notice">{msg}</p>}
      <button className="btn ghost full" onClick={build} disabled={busy}>
        {busy ? '이미지 만드는 중…' : '미리보기 새로고침'}
      </button>
      {preview && <img className="share-preview" src={preview.url} alt="배치도 미리보기" />}
    </div>
  );
}
