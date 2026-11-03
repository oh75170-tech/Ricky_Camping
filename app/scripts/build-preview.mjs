// 태블릿 미리보기용: dist-preview 를 한 개의 HTML 조각으로 합칩니다 (Claude 아티팩트 게시용)
// 사용: npx vite build --mode preview && node scripts/build-preview.mjs <출력경로>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-preview/assets';
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8'));
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8'));
if (js.length !== 1) throw new Error(`JS 파일이 1개여야 합니다: ${js.length}`);
const out = process.argv[2] ?? 'dist-preview/campcanvas-preview.html';
const html = `<title>CampCanvas</title>
<style>${css.join('\n')}</style>
<div id="root"></div>
<script type="module">${js[0].replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}</script>
`;
writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} KB)`);
