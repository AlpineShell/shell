import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const RENDERER_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' alpine-plugin:",
  "style-src 'self' 'unsafe-inline' alpine-plugin:",
  "img-src 'self' data: blob: https: http: alpine-plugin: alpine-wallpaper:",
  "font-src 'self' data: alpine-plugin:",
  "media-src 'self' data: blob: https: http: alpine-plugin:",
  "connect-src 'self' https: http: wss: ws: alpine-plugin:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

function rendererContentSecurityPolicy(): Plugin {
  return {
    name: 'alpine-renderer-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: RENDERER_CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    rendererContentSecurityPolicy(),
  ],
  base: './',
  build: {
    target: 'esnext',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
