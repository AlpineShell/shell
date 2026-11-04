import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    env: {
      ELECTRON_OVERRIDE_DIST_PATH: 'electron-binary-is-never-downloaded-by-tests',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
          // Several settings suites re-import their page in beforeEach after vi.resetModules, and the
          // first import pulls in @alpine/ui with Motion and Base UI; under a full parallel run on
          // Windows that alone can pass the default 10s.
          hookTimeout: 30_000,
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
      {
        extends: true,
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.js'],
        },
      },
    ],
  },
})
