import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' → GitHub Pages 등 하위 경로에서도 동작
// mode "preview": 한 파일로 묶는 태블릿 미리보기용 빌드 (scripts/build-preview.mjs)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  server: { host: true },
  build:
    mode === 'preview'
      ? {
          outDir: 'dist-preview',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rolldownOptions: { output: { codeSplitting: false } },
        }
      : undefined,
}));
