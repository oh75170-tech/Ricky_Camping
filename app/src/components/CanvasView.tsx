import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Text, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import { GearShape, PX_PER_M } from './GearShape';
import { actions, allGear, useStore } from '../store';

Konva.hitOnDragEnabled = true;

export interface CanvasHandle {
  fit: () => void;
  zoom: (f: number) => void;
  /** 캠핑장 전체를 PNG dataURL로 */
  snapshot: () => Promise<HTMLCanvasElement>;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const CanvasView = forwardRef<CanvasHandle, Props>(function CanvasView({ selectedId, onSelect }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [size, setSize] = useState({ w: 300, h: 300 });
  const [view, setView] = useState({ x: 20, y: 20, s: 1 });
  const placements = useStore((s) => s.placements);
  const sites = useStore((s) => s.sites);
  const layer = useStore((s) => s.layer);
  const campsite = useStore((s) => s.campsite);
  const gearList = useStore(allGear);
  const gearMap = useMemo(() => new Map(gearList.map((g) => [g.id, g])), [gearList]);
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const exporting = false;

  // 크기 추적
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 컨텐츠 경계 (m)
  const bounds = () => {
    let minX = 0, minY = 0, maxX = campsite.w, maxY = campsite.h;
    for (const p of placements) {
      const g = gearMap.get(p.gearId);
      if (!g) continue;
      const r = Math.max(g.l, g.w) / 200;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }
    return { minX: Math.floor(minX) - 1, minY: Math.floor(minY) - 1, maxX: Math.ceil(maxX) + 1, maxY: Math.ceil(maxY) + (sites.length > 1 ? 2 : 1) };
  };

  const fitTo = (w: number, h: number) => {
    const b = bounds();
    const cw = (b.maxX - b.minX) * PX_PER_M;
    const ch = (b.maxY - b.minY) * PX_PER_M;
    const s = Math.min(w / cw, h / ch);
    const v = { s, x: (w - cw * s) / 2 - b.minX * PX_PER_M * s, y: (h - ch * s) / 2 - b.minY * PX_PER_M * s };
    setView(v);
    return v;
  };

  // 첫 렌더 시 맞춤
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && size.w > 50) {
      fitted.current = true;
      fitTo(size.w, size.h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const zoomAt = (factor: number, cx: number, cy: number) => {
    setView((v) => {
      const s = Math.min(8, Math.max(0.1, v.s * factor));
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };

  useImperativeHandle(ref, () => ({
    fit: () => fitTo(size.w, size.h),
    zoom: (f) => zoomAt(f, size.w / 2, size.h / 2),
    snapshot: async () => {
      const stage = stageRef.current!;
      const tr = trRef.current!;
      // React 렌더를 기다리지 않고 Konva 노드를 직접 조작해서 전체 영역을 캡처
      const b = bounds();
      const cw = (b.maxX - b.minX) * PX_PER_M;
      const ch = (b.maxY - b.minY) * PX_PER_M;
      const s = 1600 / Math.max(cw, ch);
      const prevNodes = tr.nodes();
      tr.nodes([]);
      stage.scale({ x: s, y: s });
      stage.position({ x: -b.minX * PX_PER_M * s, y: -b.minY * PX_PER_M * s });
      stage.size({ width: cw * s, height: ch * s });
      stage.draw();
      const canvas = stage.toCanvas({ pixelRatio: 1.25 });
      stage.scale({ x: view.s, y: view.s });
      stage.position({ x: view.x, y: view.y });
      stage.size({ width: size.w, height: size.h });
      tr.nodes(prevNodes);
      stage.batchDraw();
      return canvas;
    },
  }));

  // 선택 → 트랜스포머
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selectedId && !exporting ? stage.findOne(`#${selectedId}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, placements, exporting]);

  // ───── 핀치 줌 / 휠 줌 ─────
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const t = e.evt.touches;
    if (t.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current!;
    if (stage.isDragging()) stage.stopDrag();
    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: t[0].clientX - rect.left, y: t[0].clientY - rect.top };
    const p2 = { x: t[1].clientX - rect.left, y: t[1].clientY - rect.top };
    const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    if (!pinch.current) {
      pinch.current = { d, cx, cy };
      return;
    }
    const prev = pinch.current;
    setView((v) => {
      const s = Math.min(8, Math.max(0.1, (v.s * d) / prev.d));
      const k = s / v.s;
      return { s, x: cx - (prev.cx - v.x) * k, y: cy - (prev.cy - v.y) * k };
    });
    pinch.current = { d, cx, cy };
  };
  const onTouchEnd = () => {
    pinch.current = null;
  };
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition();
    if (!p) return;
    zoomAt(e.evt.deltaY > 0 ? 0.9 : 1.1, p.x, p.y);
  };

  // ───── 격자 ─────
  const grid = useMemo(() => {
    const w = exporting ? Infinity : size.w;
    const b = bounds();
    const toM = (px: number, o: number) => (px - o) / (view.s * PX_PER_M);
    const x0 = Math.floor(Math.min(b.minX, toM(0, view.x))) - 1;
    const x1 = Math.ceil(Math.max(b.maxX, w === Infinity ? b.maxX : toM(size.w, view.x))) + 1;
    const y0 = Math.floor(Math.min(b.minY, toM(0, view.y))) - 1;
    const y1 = Math.ceil(Math.max(b.maxY, w === Infinity ? b.maxY : toM(size.h, view.y))) + 1;
    const lines = [];
    const sw = 1 / view.s;
    for (let x = x0; x <= x1; x++) {
      lines.push(
        <Line
          key={`x${x}`}
          points={[x * PX_PER_M, y0 * PX_PER_M, x * PX_PER_M, y1 * PX_PER_M]}
          stroke={x % 5 === 0 ? '#9fb39a' : '#cfdccb'}
          strokeWidth={x % 5 === 0 ? sw * 1.5 : sw}
          listening={false}
        />,
      );
    }
    for (let y = y0; y <= y1; y++) {
      lines.push(
        <Line
          key={`y${y}`}
          points={[x0 * PX_PER_M, y * PX_PER_M, x1 * PX_PER_M, y * PX_PER_M]}
          stroke={y % 5 === 0 ? '#9fb39a' : '#cfdccb'}
          strokeWidth={y % 5 === 0 ? sw * 1.5 : sw}
          listening={false}
        />,
      );
    }
    // 눈금 숫자 (캠핑장 가장자리)
    const fs = 11 / view.s;
    const pxPerM = view.s * PX_PER_M;
    const step = pxPerM < 22 ? 5 : pxPerM < 40 ? 2 : 1;
    for (let x = 0; x <= campsite.w; x += step) {
      lines.push(<Text key={`lx${x}`} x={x * PX_PER_M + 2 / view.s} y={-fs - 3 / view.s} text={`${x}m`} fontSize={fs} fill="#5a6b57" listening={false} />);
    }
    for (let y = step; y <= campsite.h; y += step) {
      lines.push(<Text key={`ly${y}`} x={-fs * 2.6} y={y * PX_PER_M - fs / 2} text={`${y}m`} fontSize={fs} fill="#5a6b57" listening={false} />);
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, size, campsite, exporting, placements]);

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        x={view.x}
        y={view.y}
        scaleX={view.s}
        scaleY={view.s}
        draggable
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)}
        onTap={(e) => e.target === e.target.getStage() && onSelect(null)}
      >
        <Layer>
          <Rect
            x={-1e5}
            y={-1e5}
            width={2e5}
            height={2e5}
            fill="#f3f6ef"
            onMouseDown={() => onSelect(null)}
            onTap={() => onSelect(null)}
          />
          <Rect
            x={0}
            y={0}
            width={campsite.w * PX_PER_M}
            height={campsite.h * PX_PER_M}
            fill="#e3edd9"
            stroke="#5f8a4d"
            strokeWidth={2 / view.s}
            dash={[10 / view.s, 6 / view.s]}
            listening={false}
          />
          {grid}
          <Text
            x={0}
            y={campsite.h * PX_PER_M + 6 / view.s}
            text={`캠핑 사이트 ${campsite.w}m × ${campsite.h}m  (격자 1칸 = 1m)`}
            fontSize={12 / view.s}
            fill="#5a6b57"
            listening={false}
          />
        </Layer>
        <Layer>
          {placements.map((p) => {
            const g = gearMap.get(p.gearId);
            if (!g) return null;
            const site = siteMap.get(p.siteId);
            return (
              <Group
                key={p.id}
                id={p.id}
                x={p.x * PX_PER_M}
                y={p.y * PX_PER_M}
                rotation={p.rot}
                draggable
                onMouseDown={() => onSelect(p.id)}
                onTap={() => onSelect(p.id)}
                onDragStart={() => onSelect(p.id)}
                onDragEnd={(e) => {
                  const snap = (v: number) => Math.round(v * 10) / 10; // 10cm 스냅
                  actions.movePlacement(p.id, { x: snap(e.target.x() / PX_PER_M), y: snap(e.target.y() / PX_PER_M) });
                }}
                onTransformEnd={(e) => {
                  const n = e.target;
                  actions.movePlacement(p.id, {
                    rot: Math.round(n.rotation()),
                    x: Math.round((n.x() / PX_PER_M) * 10) / 10,
                    y: Math.round((n.y() / PX_PER_M) * 10) / 10,
                  });
                }}
              >
                <GearShape gear={g} layer={layer} color={site?.color ?? '#2f7d4f'} selected={p.id === selectedId && !exporting} scale={view.s} />
              </Group>
            );
          })}
          <Transformer
            ref={trRef}
            resizeEnabled={false}
            rotateEnabled
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={6}
            rotateAnchorOffset={30}
            anchorSize={22}
            borderStroke="#ff9f1c"
            anchorStroke="#ff9f1c"
            anchorCornerRadius={11}
          />
        </Layer>
        {/* 사이트(그룹) 범례 */}
        {sites.length > 1 && (
          <Layer listening={false}>
            {sites.map((s, i) => (
              <Group key={s.id} x={(i % 3) * (130 / view.s)} y={campsite.h * PX_PER_M + (26 + Math.floor(i / 3) * 18) / view.s}>
                <Rect width={12 / view.s} height={12 / view.s} fill={s.color} cornerRadius={2 / view.s} />
                <Text x={16 / view.s} text={s.name} fontSize={12 / view.s} fill="#333" />
              </Group>
            ))}
          </Layer>
        )}
      </Stage>
    </div>
  );
});
