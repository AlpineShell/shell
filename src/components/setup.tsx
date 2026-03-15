import { useState } from 'react'

type View = 'main' | 'advanced' | 'installing' | 'done'

export default function Setup() {
  const [view, setView] = useState<View>('main')
  const [installCursor, setInstallCursor] = useState(true)
  const [result, setResult] = useState<SetupResult | null>(null)

  async function install(options: SetupOptions) {
    setView('installing')
    const res = await window.setup.install(options)
    setResult(res)
    setView('done')
  }

  if (view === 'main') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold text-white">Alpine Shell Setup</h1>
        <p className="text-sm text-gray-400 text-center max-w-md">
          This will set Alpine Shell as your default Windows shell, add it to startup, and optionally install a custom cursor.
        </p>
        <div className="flex flex-col gap-3 w-64">
          <button
            onClick={() => install({ cursor: true })}
            className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            Install Preset
          </button>
          <button
            onClick={() => setView('advanced')}
            className="px-6 py-2.5 bg-white/10 text-white rounded-lg font-medium text-sm hover:bg-white/20 transition-colors"
          >
            Advanced
          </button>
          <button
            onClick={async () => { await window.setup.skip(); window.close() }}
            className="px-6 py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (view === 'advanced') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-2xl font-semibold text-white">Advanced Setup</h1>
        <div className="flex flex-col gap-4 w-72">
          <label className="flex items-center gap-3 text-sm text-white cursor-pointer">
            <input type="checkbox" checked disabled className="w-4 h-4 accent-white" />
            Replace explorer.exe as shell
          </label>
          <label className="flex items-center gap-3 text-sm text-white cursor-pointer">
            <input type="checkbox" checked disabled className="w-4 h-4 accent-white" />
            Start on login
          </label>
          <label className="flex items-center gap-3 text-sm text-white cursor-pointer">
            <input
              type="checkbox"
              checked={installCursor}
              onChange={(e) => setInstallCursor(e.target.checked)}
              className="w-4 h-4 accent-white"
            />
            Install custom cursor
          </label>
        </div>
        <div className="flex gap-3 w-72">
          <button
            onClick={() => setView('main')}
            className="flex-1 px-4 py-2.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => install({ cursor: installCursor })}
            className="flex-1 px-4 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    )
  }

  if (view === 'installing') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Installing...</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-white">Setup Complete</h1>
      <div className="flex flex-col gap-1 text-sm">
        <p className={result?.shell ? 'text-green-400' : 'text-red-400'}>
          {result?.shell ? 'Shell replacement configured' : 'Shell replacement failed'}
        </p>
        <p className={result?.startup ? 'text-green-400' : 'text-red-400'}>
          {result?.startup ? 'Startup entry added' : 'Startup entry failed'}
        </p>
        {result?.cursor !== undefined && (
          <p className={result.cursor ? 'text-green-400' : 'text-red-400'}>
            {result.cursor ? 'Cursor installed' : 'Cursor installation failed'}
          </p>
        )}
      </div>
      <p className="text-xs text-gray-500 text-center max-w-sm">
        Log out and back in for the shell replacement to take effect.
      </p>
      <button
        onClick={() => window.close()}
        className="px-6 py-2.5 bg-white text-black rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
      >
        Done
      </button>
    </div>
  )
}
