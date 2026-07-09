import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    entry: {
      react: 'src/react.ts',
      jsxRuntime: 'src/jsxRuntime.ts',
      hooks: 'src/hooks.ts',
      store: 'src/store.ts',
      reactDomShim: 'src/reactDomShim.ts',
      vite: 'src/vite.ts',
    },
    format: ['esm'],
    dts: true,
    external: ['react', 'react-dom', 'react/jsx-runtime', 'vite'],
    sourcemap: true,
  },
])
