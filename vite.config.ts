import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // 2026-09-27: Monaco Editor uygulamanın ilk açılışını yavaşlatmasın.
    // Editör `import('monaco-editor')` ile TEMBEL yüklenir; yine de Vite'ın
    // onu ana chunk'a katmaması için ayrı bir parçaya zorluyoruz. Aksi hâlde
    // giriş ekranı ~3-4 MB ek JS indirirdi.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco-editor'
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})

