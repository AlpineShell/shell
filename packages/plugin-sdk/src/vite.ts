export interface AlpinePluginPresetOptions {
  entry: string
  outDir?: string
}

export function alpinePluginPreset(opts: AlpinePluginPresetOptions): import('vite').UserConfig {
  return {
    esbuild: { jsx: 'automatic', jsxImportSource: '@alpine/plugin-sdk' },
    resolve: {
      alias: {
        'react/jsx-runtime': '@alpine/plugin-sdk/jsx-runtime',
        'react/jsx-dev-runtime': '@alpine/plugin-sdk/jsx-runtime',
        'react-dom': '@alpine/plugin-sdk/react-dom',
        react: '@alpine/plugin-sdk/react',
      },
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir: opts.outDir ?? 'dist',
      lib: { entry: opts.entry, formats: ['es'], fileName: () => 'renderer.js' },
      cssCodeSplit: false,
      target: 'es2022',
    },
  }
}
