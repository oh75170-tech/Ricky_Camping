import { Group, Rect, Line, Circle, Text, Ellipse } from 'react-konva';
import type { Gear, LayerStyle } from '../types';

export const PX_PER_M = 60; // 기본 1m = 60px

const FURNITURE = new Set(['table', 'chair', 'mat', 'cot', 'heater', 'fridge', 'etc']);

const CAT_FILL: Record<string, string> = {
  table: '#6e6e6e',
  chair: '#3a3a3a',
  mat: '#9a9a9a',
  cot: '#555555',
  heater: '#1a1a1a',
  fridge: '#808080',
  etc: '#8a8a8a',
};

function hexPoints(L: number, W: number, flat?: number) {
  // 길이 방향 꼭짓점 2개 + 상/하 각 2개 (flat: 평평한 변 길이 px)
  const a = L / 2;
  const b = W / 2;
  const c = flat ? Math.min(flat, L) / 2 : L / 4;
  return [-a, 0, -c, -b, c, -b, a, 0, c, b, -c, b];
}

function tarpHexPoints(L: number, W: number) {
  const a = L / 2;
  const b = W / 2;
  return [-a, 0, -a * 0.35, -b, a * 0.35, -b, a, 0, a * 0.35, b, -a * 0.35, b];
}

interface Props {
  gear: Gear;
  layer: LayerStyle;
  color: string;
  selected: boolean;
  scale: number; // stage 배율 (텍스트 크기 보정)
}

/** 원점(0,0)=장비 중심, x=길이 방향, y=너비 방향 (px) */
export function GearShape({ gear, layer, color, selected, scale }: Props) {
  const L = (gear.l / 100) * PX_PER_M;
  const W = (gear.w / 100) * PX_PER_M;
  const isFurniture = FURNITURE.has(gear.category);
  const isTarp = gear.category === 'tarp';
  const flatPx = gear.flat ? (gear.flat / 100) * PX_PER_M : undefined;
  const shape = gear.shape ?? (isTarp ? 'tarp-hexa' : 'rect');
  const fs = Math.max(8, 12 / scale);
  const stroke = selected ? '#000' : color;
  const sw = (selected ? 3 : 1.5) / scale;

  const flyOpacity = isTarp ? layer.tarp : layer.fly;
  const flyFill = isFurniture ? CAT_FILL[gear.category] ?? '#888' : isTarp ? '#9e9e9e' : color;

  const outline = () => {
    const common = {
      fill: flyFill,
      opacity: isFurniture ? layer.furniture : flyOpacity,
      stroke,
      strokeWidth: sw,
    };
    const strokeOnly = { stroke, strokeWidth: sw, listening: false };
    switch (shape) {
      case 'hex':
        return (
          <>
            <Line points={hexPoints(L, W, flatPx)} closed {...common} />
            <Line points={hexPoints(L, W, flatPx)} closed {...strokeOnly} />
          </>
        );
      case 'tarp-hexa':
        return (
          <>
            <Line points={tarpHexPoints(L, W)} closed {...common} />
            <Line points={tarpHexPoints(L, W)} closed {...strokeOnly} dash={[6 / scale, 4 / scale]} />
          </>
        );
      case 'round':
        return (
          <>
            <Ellipse radiusX={L / 2} radiusY={W / 2} {...common} />
            <Ellipse radiusX={L / 2} radiusY={W / 2} {...strokeOnly} />
          </>
        );
      case 'tunnel':
        return (
          <>
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} cornerRadius={Math.min(L, W) * 0.35} {...common} />
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} cornerRadius={Math.min(L, W) * 0.35} {...strokeOnly} />
          </>
        );
      case 'dome':
        return (
          <>
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} cornerRadius={Math.min(L, W) * 0.25} {...common} />
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} cornerRadius={Math.min(L, W) * 0.25} {...strokeOnly} />
          </>
        );
      case 'tarp-rect':
        return (
          <>
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} {...common} />
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} {...strokeOnly} dash={[6 / scale, 4 / scale]} />
          </>
        );
      default:
        return (
          <>
            <Rect
              x={-L / 2}
              y={-W / 2}
              width={L}
              height={W}
              cornerRadius={isFurniture ? Math.min(L, W) * 0.12 : 2}
              {...common}
            />
            <Rect x={-L / 2} y={-W / 2} width={L} height={W} cornerRadius={isFurniture ? Math.min(L, W) * 0.12 : 2} {...strokeOnly} />
          </>
        );
    }
  };

  const sub = (s: { l: number; w: number; offset?: number }, fill: string, opacity: number, dash?: boolean) => {
    const l = (s.l / 100) * PX_PER_M;
    const w = (s.w / 100) * PX_PER_M;
    const off = ((s.offset ?? 0) / 100) * PX_PER_M;
    return (
      <Rect
        x={off - l / 2}
        y={-w / 2}
        width={l}
        height={w}
        fill={fill}
        opacity={opacity}
        stroke={fill}
        strokeWidth={1 / scale}
        dash={dash ? [4 / scale, 3 / scale] : undefined}
        cornerRadius={3}
        listening={false}
      />
    );
  };

  const frame = () => {
    if (!layer.showFrame || isFurniture) return null;
    const fc = '#1b1b1b';
    const fw = 2 / scale;
    const props = { stroke: fc, strokeWidth: fw, listening: false, opacity: 0.85 };
    const pole = (x: number, y: number, k: string) => (
      <Circle key={k} x={x} y={y} radius={4 / scale} fill={fc} listening={false} />
    );
    switch (gear.frame) {
      case 'dome-x':
        return (
          <>
            <Line points={[-L * 0.42, -W * 0.42, L * 0.42, W * 0.42]} {...props} />
            <Line points={[-L * 0.42, W * 0.42, L * 0.42, -W * 0.42]} {...props} />
          </>
        );
      case 'arches': {
        const n = gear.frameCount ?? 3;
        return (
          <>
            {Array.from({ length: n }, (_, i) => {
              const x = -L / 2 + (L * (i + 1)) / (n + 1);
              return <Line key={i} points={[x, -W / 2, x - L * 0.03, 0, x, W / 2]} tension={0.5} {...props} />;
            })}
          </>
        );
      }
      case 'onepole': {
        const pts = hexPoints(L, W, flatPx);
        return (
          <>
            {Array.from({ length: 6 }, (_, i) => (
              <Line key={i} points={[0, 0, pts[i * 2], pts[i * 2 + 1]]} {...props} dash={[3 / scale, 3 / scale]} />
            ))}
            {pole(0, 0, 'c')}
          </>
        );
      }
      case 'ridge':
        return (
          <>
            <Line points={[-L / 2, 0, L / 2, 0]} {...props} />
            {pole(-L / 2, 0, 'a')}
            {pole(L / 2, 0, 'b')}
          </>
        );
      case 'springbar':
        return (
          <>
            <Line points={[-L / 2, -W / 2, L / 2, W / 2]} {...props} opacity={0.4} />
            <Line points={[-L / 2, W / 2, L / 2, -W / 2]} {...props} opacity={0.4} />
            <Line points={[-L / 2, 0, L / 2, 0]} {...props} />
            {pole(-L * 0.15, 0, 'a')}
            {pole(L * 0.15, 0, 'b')}
          </>
        );
      case 'air': {
        const lines = [];
        for (let i = 1; i <= 3; i++) {
          const x = -L / 2 + (L * i) / 4;
          lines.push(<Line key={`a${i}`} points={[x - L * 0.12, -W / 2, x + L * 0.12, W / 2]} {...props} stroke="#444" />);
          lines.push(<Line key={`b${i}`} points={[x + L * 0.12, -W / 2, x - L * 0.12, W / 2]} {...props} stroke="#444" />);
        }
        return <>{lines}</>;
      }
      default:
        return null;
    }
  };

  const big = !isFurniture;
  const dims = () => {
    if (!layer.showDims) return null;
    if (!big && !selected) return null; // 소품은 선택했을 때만 치수 표시
    const off = 6 / scale;
    const tc = '#222';
    return (
      <>
        <Text
          text={`${gear.l}cm`}
          x={-L / 2}
          y={-W / 2 - fs - off}
          width={L}
          align="center"
          fontSize={fs}
          fill={tc}
          wrap="none"
          listening={false}
        />
        <Text
          text={`${gear.w}cm`}
          x={L / 2 + off}
          y={W / 2}
          rotation={-90}
          width={W}
          align="center"
          fontSize={fs}
          fill={tc}
          wrap="none"
          listening={false}
        />
      </>
    );
  };

  return (
    <Group>
      {/* 레이어 순서: 그라운드시트 → 이너 → 플라이(투명) → 프레임 */}
      {gear.ground && sub(gear.ground, '#8c8c8c', layer.ground)}
      {gear.inner && sub(gear.inner, '#e4e4e4', layer.inner, true)}
      {outline()}
      {frame()}
      {dims()}
      {layer.showLabels && (big || selected || L * scale > 60) && (
        <Text
          text={gear.name}
          x={big ? -L / 2 : -Math.max(L, 120 / scale) / 2}
          y={big ? -fs / 2 : W / 2 + 3 / scale}
          width={big ? L : Math.max(L, 120 / scale)}
          align="center"
          fontSize={fs}
          fontStyle="bold"
          fill="#111"
          listening={false}
          wrap="none"
          ellipsis
        />
      )}
    </Group>
  );
}
