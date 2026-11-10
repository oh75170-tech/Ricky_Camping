import base from '../assets/home/base.webp';
import cloud1 from '../assets/home/cloud1.webp';
import cloud2 from '../assets/home/cloud2.webp';
import lantern1 from '../assets/home/lantern1.webp';
import lantern2 from '../assets/home/lantern2.webp';
import lantern3 from '../assets/home/lantern3.webp';

/** 원본 그림(1024px) 기준 위치 → % */
const box = (x: number, y: number, w: number, h: number) => ({
  left: `${(x / 1024) * 100}%`,
  top: `${(y / 1024) * 100}%`,
  width: `${(w / 1024) * 100}%`,
  height: `${(h / 1024) * 100}%`,
});

const LANTERNS = [
  { src: lantern1, b: [168, 248, 80, 146], delay: '0s', dur: '3.6s' },
  { src: lantern2, b: [768, 230, 78, 148], delay: '-1.2s', dur: '4.1s' },
  { src: lantern3, b: [836, 378, 78, 172], delay: '-2.3s', dur: '3.3s' },
] as const;

/** 눈 깜빡임용 눈꺼풀 (원본 좌표) */
const EYES = [
  { cx: 297, cy: 508, rx: 11, ry: 15, skin: '#e8b275', who: 'a' },
  { cx: 366, cy: 503, rx: 11, ry: 15, skin: '#e8b275', who: 'a' },
  { cx: 629, cy: 466, rx: 10, ry: 14, skin: '#e5ae6e', who: 'b' },
  { cx: 703, cy: 476, rx: 11, ry: 14, skin: '#e2a868', who: 'b' },
];

/** 커피 김: 머그 입구 중심 */
const STEAM = [
  { x: 320, y: 700 },
  { x: 628, y: 690 },
];

/** 첫 화면 그림: 구름이 흐르고, 랜턴이 흔들리며 반짝이고, 커피 김이 오르고, 눈을 깜빡이는 짧은 반복 애니메이션 */
export function HomeScene() {
  return (
    <div className="scene" role="img" aria-label="텐트 앞에서 커피를 마시는 캠핑 커플 일러스트 (움직이는 그림)">
      <img className="scene-base" src={base} alt="" width={800} height={800} />
      <img className="scene-cloud c1" src={cloud1} alt="" style={box(288, 132, 172, 106)} />
      <img className="scene-cloud c2" src={cloud2} alt="" style={box(596, 155, 156, 93)} />
      {LANTERNS.map((l, i) => (
        <span key={i} className="scene-lantern" style={{ ...box(l.b[0], l.b[1], l.b[2], l.b[3]), animationDelay: l.delay, animationDuration: l.dur }}>
          <img src={l.src} alt="" />
          <span className="scene-glow" style={{ animationDelay: `${i * -0.7}s` }} />
        </span>
      ))}
      <svg className="scene-fx" viewBox="0 0 1024 1024" aria-hidden>
        <defs>
          <filter id="steam-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        {STEAM.map((s, i) => (
          <g key={i} filter="url(#steam-blur)">
            {[0, 1, 2].map((j) => (
              <path
                key={j}
                className="steam"
                style={{ animationDelay: `${i * 0.9 + j * 1.15}s` }}
                d={`M ${s.x - 14 + j * 14} ${s.y} c -14 -18, 14 -30, 0 -48 s -14 -30, 2 -46`}
              />
            ))}
          </g>
        ))}
        {EYES.map((e, i) => (
          <g key={i} className={`lid lid-${e.who}`}>
            <ellipse cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={e.skin} />
            <path d={`M ${e.cx - e.rx + 1} ${e.cy + 1} Q ${e.cx} ${e.cy + e.ry * 0.55} ${e.cx + e.rx - 1} ${e.cy + 1}`} fill="none" stroke="#3a2a22" strokeWidth={3.2} strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}
