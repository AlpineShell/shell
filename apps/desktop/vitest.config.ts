import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'electron',
          environment: 'node',
          include: ['electron/**/*.test.js'],
        },
      },
    ],
  },
})
