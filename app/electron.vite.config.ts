import { resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The GitHub OAuth Client ID is public by design (Device Flow) and is baked into release builds
// so end users never touch .env. Read from the repo-root .env at build time.
const env = loadEnv('', resolve(__dirname, '..'), 'SAKAI_')
// Fallback for machines without a .env: the committed, non-secret public-config.json.
const pub = resolve(__dirname, 'public-config.json')
const clientId = env.SAKAI_GITHUB_CLIENT_ID || (existsSync(pub) ? (JSON.parse(readFileSync(pub, 'utf8')).githubClientId as string) : '')

export default defineConfig({
  main: {
    define: { __GITHUB_CLIENT_ID__: JSON.stringify(clientId ?? '') },
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
