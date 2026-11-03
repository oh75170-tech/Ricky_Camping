/** 모노톤 라인 아이콘 (stroke = currentColor) */
const P: Record<string, string> = {
  tent: 'M3 20 12 4l9 16M12 4v16M8.5 20 12 13l3.5 7M2 20h20',
  tarp: 'M2 9l10-4 10 4M5 7.8V20M19 7.8V20M2 9l3 2M22 9l-3 2',
  table: 'M3 9h18M5 9l-1 11M19 9l1 11M8 9v6h8V9',
  chair: 'M7 4h10v8H7zM6 12h12l-1 3H7zM8 15l-2 5M16 15l2 5',
  mat: 'M3 7h18v10H3zM3 10h18M3 14h18',
  cot: 'M2 11h20v3H2zM4 14l-1 5M20 14l1 5M9 14l-2 5M15 14l2 5M5 11V8',
  heater: 'M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 2 1.5 3 2.5 3-.5-3 0-5.5.5-8z',
  fridge: 'M6 3h12v18H6zM6 10h12M9 6v2M9 13v3',
  etc: 'M8 7V5a4 4 0 0 1 8 0v2M5 7h14l-1 13H6zM9 12h6',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  pick: 'M4 7h16M4 12h16M4 17h10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5 12 22l10-4.5',
  chat: 'M4 5h16v11H9l-5 4z M8 10h.01M12 10h.01M16 10h.01',
  share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  check: 'M5 12l5 5 9-10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.5.6 4 2.8 4 6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  download: 'M12 3v12M7 10l5 5 5-5M5 20h14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  message: 'M12 4c5 0 9 3.1 9 7s-4 7-9 7c-1 0-2-.1-3-.4L4 20l1.2-3.6C3.8 15 3 13.1 3 11c0-3.9 4-7 9-7z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  rotl: 'M4 4v6h6M4.6 15a8 8 0 1 0 1.9-8.3L4 10',
  rotr: 'M20 4v6h-6M19.4 15a8 8 0 1 1-1.9-8.3L20 10',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  front: 'M8 8h12v12H8z M4 4h10v2M4 4v10h2',
  backw: 'M4 4h12v12H4z M20 8v12H8v-2',
  sync: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 13a8 8 0 0 0 14.6 4.5L20 16M4 4v4h4M20 20v-4h-4',
};

export function Icon({ name, size = 20, stroke = 1.6, className }: { name: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] ?? P.etc} />
    </svg>
  );
}
