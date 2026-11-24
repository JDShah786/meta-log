/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { MANIFEST, WORKBOX } from './src/pwa/manifest.ts'

// https://vite.dev/config/
export default defineConfig({
  // Relative paths, so the app works from /meta-log/ and from PR preview subfolders.
  base: './',
  plugins: [
    react(),
    // Installable and offline (step 7). The app registers the service worker itself
    // (src/pwa/register.ts), so PR previews can skip it.
    VitePWA({
      registerType: 'prompt', // a new version waits for the next open; we never prompt
      injectRegister: false,
      manifest: MANIFEST,
      workbox: WORKBOX,
    }),
  ],
  test: {
    // Vitest blanks CSS files by default. screenFit.test.ts reads these two as text (?raw).
    // No component imports them (only main.tsx does), so screen tests are unchanged.
    css: { include: [/\/src\/ui\/(app|themes)\.css/] },
  },
})
