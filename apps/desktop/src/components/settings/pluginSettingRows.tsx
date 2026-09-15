import { pluginSettingEntry } from '../../plugins/pluginSettingEntries'
import { ValueRow } from './registryRow'

const NO_DESCRIPTION = ''

const ROW_CLASS = '-mx-2 rounded-field px-2 py-1.5'

export default function PluginSettingRows({ pluginId, settings, wideControlStacked = false }: PluginSettingRowsProps) {
  return (
    <>
      {settings.map((setting) => {
        const entry = pluginSettingEntry(pluginId, setting)
        return (
          <div key={entry.id} data-setting={entry.id} className={ROW_CLASS}>
            <ValueRow entry={entry} description={NO_DESCRIPTION} info={setting.info} wideControlStacked={wideControlStacked} />
          </div>
        )
      })}
    </>
  )
}
