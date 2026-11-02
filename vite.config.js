import { defineConfig } from 'vite';

// Đường dẫn tương đối để bản build chạy được cả ở localhost lẫn GitHub Pages (/ares-3d/).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
