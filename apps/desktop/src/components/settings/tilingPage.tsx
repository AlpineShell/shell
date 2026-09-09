import { useTiling } from '../../hooks/useTiling'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Segmented from '../ui/segmented'
import Select from '../ui/select'
import Slider from '../ui/slider'
import Button from '../ui/button'

const MODE_OPTIONS: SegmentedOption<TilingMode>[] = [
  { value: 'snap', label: 'Snap zones' },
  { value: 'dynamic', label: 'Auto-tile' },
]

const DYNAMIC_LAYOUT_OPTIONS: SelectOption<TilingDynamicLayout>[] = [
  { value: 'bsp', label: 'Spiral (BSP)' },
  { value: 'columns', label: 'Columns' },
  { value: 'master-stack', label: 'Master + stack' },
]

const PLACEMENT_OPTIONS: SegmentedOption<'edge' | 'center'>[] = [
  { value: 'edge', label: 'Edge' },
  { value: 'center', label: 'Center' },
]

export default function TilingPage() {
  const { config, setConfig } = useTiling()

  return (
    <div className="flex w-full flex-col gap-section">
      <PageTitle title="Window Tiling" />

      <Section title="General">
        <Row
          label="Enable window tiling"
          description="Arrange windows into layouts. When off, Windows behaves normally."
        >
          <Toggle
            label="Enable window tiling"
            checked={config.enabled}
            onChange={(v) => setConfig({ enabled: v })}
          />
        </Row>
      </Section>

      {config.enabled && (
        <>
          <Section title="Mode">
            <div className="flex flex-col gap-3">
              <Segmented
                label="Tiling mode"
                options={MODE_OPTIONS}
                value={config.mode}
                onChange={(mode) => setConfig({ mode })}
              />
              <p className="text-xs text-ink-quiet">
                {config.mode === 'snap'
                  ? 'Recommended. Snap windows into halves and quarters with Win+Arrow; they stay where you put them.'
                  : 'Automatically arranges all windows; re-tiles as windows open and close. Experimental.'}
              </p>
            </div>
          </Section>

          {config.mode === 'snap' && (
            <Section title="Snapping">
              <div className="flex flex-col gap-3">
                <Row
                  label="Win+Arrow snapping"
                  description="Use Win+Left / Right / Up / Down to snap the focused window."
                >
                  <Toggle
                    label="Win+Arrow snapping"
                    checked={config.hotkeys}
                    onChange={(v) => setConfig({ hotkeys: v })}
                  />
                </Row>
                <Row
                  label="Drag to zone"
                  description="Drag a window to a screen edge or corner to snap it there. Dropping it on a snapped window swaps the two."
                >
                  <Toggle
                    label="Drag to zone"
                    checked={config.dragToZone}
                    onChange={(v) => setConfig({ dragToZone: v })}
                  />
                </Row>
              </div>
            </Section>
          )}

          {config.mode === 'dynamic' && (
            <Section title="Layout">
              <Row label="Layout">
                <Select
                  label="Layout"
                  options={DYNAMIC_LAYOUT_OPTIONS}
                  value={config.dynamicLayout}
                  onChange={(dynamicLayout) => setConfig({ dynamicLayout })}
                />
              </Row>
              <p className="mt-3 text-xs text-ink-quiet">
                New windows tile into place instantly. Drag a tile onto another to swap their positions, or drag
                the edge between two tiles to resize the split.
              </p>
              <div className="mt-1">
                <Row label="Split sizes" description="Reset every layout back to even splits.">
                  <Button variant="outline" size="sm" onClick={() => setConfig({ ratios: {} })}>
                    Reset split sizes
                  </Button>
                </Row>
              </div>
            </Section>
          )}

          <Section title="Spacing">
            <div className="flex flex-col gap-3">
              <Row label="Gap">
                <Slider
                  label="Gap"
                  min={0}
                  max={32}
                  value={config.gap}
                  suffix="px"
                  onChange={(v) => setConfig({ gap: v })}
                />
              </Row>
              <Row label="Outer margin">
                <Slider
                  label="Outer margin"
                  min={0}
                  max={48}
                  value={config.margin}
                  suffix="px"
                  onChange={(v) => setConfig({ margin: v })}
                />
              </Row>
            </div>
          </Section>

          <Section title="Oversized windows">
            <div className="flex flex-col gap-3">
              <Row
                label="Keep oversized windows on screen"
                description="Apps with a large minimum size (e.g. GitHub Desktop) can't shrink to fit a tile. When on, they're kept fully visible instead of overflowing onto their neighbors."
              >
                <Toggle
                  label="Keep oversized windows on screen"
                  checked={config.handleOversized}
                  onChange={(v) => setConfig({ handleOversized: v })}
                />
              </Row>
              {config.handleOversized && (
                <Row
                  label="Placement"
                  description={
                    config.centerOversized
                      ? 'Float the window centered on screen.'
                      : 'Align the window to its zone edge.'
                  }
                >
                  <Segmented
                    label="Placement"
                    options={PLACEMENT_OPTIONS}
                    value={config.centerOversized ? 'center' : 'edge'}
                    onChange={(placement) => setConfig({ centerOversized: placement === 'center' })}
                  />
                </Row>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}
