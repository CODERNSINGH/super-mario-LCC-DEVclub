import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The GitHub OAuth Client ID is public by design (Device Flow) and is baked into release builds
// so end users never touch .env. Read from the repo-root .env at build time.
const env = loadEnv('', resolve(__dirname, '..'), 'SAKAI_')

export default defineConfig({
  main: {
    define: { __GITHUB_CLIENT_ID__: JSON.stringify(env.SAKAI_GITHUB_CLIENT_ID ?? '') },
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), tailwindcss()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
})
