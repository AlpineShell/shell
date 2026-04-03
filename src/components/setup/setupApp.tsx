import { useState, useEffect } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'

type Page = 'welcome' | 'options' | 'installing' | 'complete' | 'error'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
        checked ? 'bg-white' : 'bg-neutral-700'
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full absolute top-0.5 transition-all ${
          checked ? 'left-5.5 bg-neutral-950' : 'left-0.5 bg-neutral-400'
        }`}
      />
    </button>
  )
}

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

export default function SetupApp() {
  const [page, setPage] = useState<Page>('welcome')
  const [installCursor, setInstallCursor] = useState(true)
  const [installShell, setInstallShell] = useState(true)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [currentStep, setCurrentStep] = useState('')

  useEffect(() => {
    window.setup.status().then(setStatus)
    window.setup.onProgress(setCurrentStep)
  }, [])

  async function handleInstall() {
    setCurrentStep('')
    setPage('installing')
    const res = await window.setup.install({ shell: installShell, cursor: installCursor })
    setResult(res)
    setPage(res.error ? 'error' : 'complete')
  }

  async function handleSkip() {
    setCurrentStep('')
    setPage('installing')
    await window.setup.skip()
    window.setup.relaunch()
  }

  return (
    <div className="w-screen h-screen bg-linear-to-br from-[#001C30] to-[#005896] text-white flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 opacity-[0.6] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px' }} />
      <div className="h-8 flex items-center justify-end px-2 shrink-0 relative z-10" style={dragRegion}>
        <button
          onClick={() => window.close()}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
          style={noDragRegion}
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 flex flex-col px-10 pt-2 pb-5 relative z-10">
        {page === 'welcome' && (
          <div className="flex-1 flex justify-between flex-col">
            <div>
              <img src="./AlpineShellLogo.svg" className="w-fit h-10 mb-4" />
              <p className="text-white text-[19px] leading">
                Welcome to a faster, cleaner Windows experience
              </p>
            </div>
            <div>
              <button
                onClick={() => setPage('options')}
                className="mt-20 w-full h-11 bg-white cursor-pointer text-neutral-950 rounded-lg font-medium text-[15px] hover:bg-neutral-200 transition-colors"
              >
                Install Preset
              </button>
              <button
                onClick={handleSkip}
                className="mt-3 w-full h-11 cursor-pointer text-white text-sm hover:text-neutral-300 transition-colors"
              >
                Customize Install
              </button>
            </div>
          </div>
        )}

        {page === 'options' && (
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-2xl font-semibold tracking-tight">Configure</h1>
            <p className="text-neutral-400 mt-2 text-sm">Choose what to set up.</p>

            <div className="mt-8 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium">Desktop Environment</div>
                  <div className="text-sm text-neutral-500 mt-0.5">
                    Replace Explorer with Alpine Shell
                  </div>
                  {status?.gpoBlocked && (
                    <div className="flex items-center gap-1.5 mt-1.5 text-amber-400 text-xs">
                      <AlertTriangle size={12} />
                      <span>Group Policy may prevent this change</span>
                    </div>
                  )}
                </div>
                <Toggle checked={installShell} onChange={setInstallShell} />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[15px] font-medium">Custom Cursor</div>
                  <div className="text-sm text-neutral-500 mt-0.5">
                    Install the Moga White cursor pack
                  </div>
                </div>
                <Toggle checked={installCursor} onChange={setInstallCursor} />
              </div>
            </div>

            <button
              onClick={handleInstall}
              className="mt-10 w-full h-11 bg-white text-neutral-950 rounded-lg font-medium text-[15px] hover:bg-neutral-200 transition-colors cursor-default"
            >
              Install
            </button>
            <button
              onClick={() => setPage('welcome')}
              className="mt-3 w-full h-11 text-neutral-500 text-sm hover:text-neutral-300 transition-colors cursor-default"
            >
              Back
            </button>
          </div>
        )}

        {page === 'installing' && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
            <p className="mt-5 text-[15px]">Installing</p>
            <p className="mt-2 text-xs text-neutral-600 h-4 transition-all">
              {currentStep}
            </p>
          </div>
        )}

        {page === 'error' && result && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <X size={24} strokeWidth={2.5} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-5">Installation failed</h1>
            <p className="text-neutral-500 text-sm mt-2 leading-relaxed">
              Something went wrong during installation.
            </p>
            <p className="mt-3 text-xs text-red-400/80 bg-red-400/5 rounded-lg px-3 py-2 font-mono break-all">
              {result.error}
            </p>
            <button
              onClick={() => setPage('options')}
              className="mt-8 w-full h-11 bg-white text-neutral-950 rounded-lg font-medium text-[15px] hover:bg-neutral-200 transition-colors cursor-default"
            >
              Try Again
            </button>
            <button
              onClick={() => window.close()}
              className="mt-3 w-full h-11 text-neutral-500 text-sm hover:text-neutral-300 transition-colors cursor-default"
            >
              Close
            </button>
          </div>
        )}

        {page === 'complete' && result && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <Check size={24} strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight mt-5">Setup complete</h1>
            <p className="text-neutral-500 text-sm mt-2 leading-relaxed">
              Restart your computer to start using Alpine Shell.
            </p>

            <div className="mt-5 space-y-1.5 text-xs text-neutral-600">
              {result.shell && (
                <p className="flex items-center gap-2">
                  <Check size={11} className="text-neutral-500 shrink-0" />
                  Set as default desktop environment
                </p>
              )}
              {result.startup && (
                <p className="flex items-center gap-2">
                  <Check size={11} className="text-neutral-500 shrink-0" />
                  Added to startup
                </p>
              )}
              {result.cursor && (
                <p className="flex items-center gap-2">
                  <Check size={11} className="text-neutral-500 shrink-0" />
                  Custom cursor installed
                </p>
              )}
              {result.gpoBlocked && (
                <p className="flex items-center gap-2 text-amber-500">
                  <AlertTriangle size={11} className="shrink-0" />
                  Group Policy may have blocked shell replacement
                </p>
              )}
            </div>

            <button
              onClick={() => window.setup.restartWindows()}
              className="mt-8 w-full h-11 bg-white text-neutral-950 rounded-lg font-medium text-[15px] hover:bg-neutral-200 transition-colors cursor-default"
            >
              Restart Now
            </button>
            <button
              onClick={() => window.close()}
              className="mt-3 w-full h-11 text-neutral-500 text-sm hover:text-neutral-300 transition-colors cursor-default"
            >
              Restart Later
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
