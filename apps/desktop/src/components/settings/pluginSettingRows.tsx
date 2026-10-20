import { pluginSettingEntry } from '../../plugins/pluginSettingEntries'
import { ValueRow } from './registryRow'

const NO_DESCRIPTION = ''

export default function PluginSettingRows({ pluginId, settings, wideControlStacked = false }: PluginSettingRowsProps) {
  return (
    <>
      {settings.map((setting) => {
        const entry = pluginSettingEntry(pluginId, setting)
        return (
          <div key={entry.id} data-setting={entry.id}>
            <ValueRow entry={entry} description={setting.info ?? NO_DESCRIPTION} wideControlStacked={wideControlStacked} />
          </div>
        )
      })}
    </>
  )
}
