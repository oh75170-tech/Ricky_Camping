import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' → GitHub Pages 등 하위 경로에서도 동작
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true },
});
