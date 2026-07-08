export interface AlpinePluginPresetOptions {
  entry: string
  outDir?: string
}

export function alpinePluginPreset(opts: AlpinePluginPresetOptions): import('vite').UserConfig {
  return {
    esbuild: { jsx: 'automatic', jsxImportSource: '@alpine/plugin-sdk' },
    build: {
      outDir: opts.outDir ?? 'dist',
      lib: { entry: opts.entry, formats: ['es'], fileName: () => 'renderer.js' },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          '@alpine/plugin-sdk',
          '@alpine/plugin-sdk/react',
          '@alpine/plugin-sdk/jsx-runtime',
          '@alpine/plugin-sdk/hooks',
        ],
      },
      cssCodeSplit: false,
      target: 'es2022',
    },
  }
}
