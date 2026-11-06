import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Pt {
  lat: number;
  lng: number;
}

/** 캠핑장(검정 점)·집(흰 점)·경로선을 보여주는 지도 (OpenStreetMap) */
export function TripMap({ site, home, line }: { site?: Pt; home?: Pt | null; line?: [number, number][] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    m.setView([36.4, 127.8], 6);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    if (line && line.length > 1) {
      L.polyline(line, { color: '#141414', weight: 4, opacity: 0.55 }).addTo(g);
      pts.push(...line);
    }
    if (home) {
      L.circleMarker([home.lat, home.lng], { radius: 7, color: '#141414', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip('집')
        .addTo(g);
      pts.push([home.lat, home.lng]);
    }
    if (site) {
      L.circleMarker([site.lat, site.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#141414', fillOpacity: 1 })
        .bindTooltip('캠핑장')
        .addTo(g);
      pts.push([site.lat, site.lng]);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 13 });
    else if (site) m.setView([site.lat, site.lng], 12);
    else if (home) m.setView([home.lat, home.lng], 11);
    setTimeout(() => m.invalidateSize(), 50);
  }, [site?.lat, site?.lng, home?.lat, home?.lng, line]);

  return <div ref={el} className="trip-map" />;
}
