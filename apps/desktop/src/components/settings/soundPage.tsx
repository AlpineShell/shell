import { useVolume } from '../../hooks/useVolume'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Slider from '../ui/slider'

export default function SoundPage() {
  const { volume, setVolume, muted, toggleMute } = useVolume()

  return (
    <Section title="Output">
      <div className="flex flex-col gap-3">
        <Row label="Volume" disabled={muted}>
          <Slider label="Volume" min={0} max={100} step={1} value={volume} suffix="%" onChange={setVolume} />
        </Row>
        <Row label="Mute">
          <Toggle label="Mute" checked={muted} onChange={toggleMute} />
        </Row>
      </div>
    </Section>
  )
}
