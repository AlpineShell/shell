import { useState, type ReactNode } from 'react'
import { Globe, Laptop, Router, Server } from 'lucide-react'
import { connectionLabel, dnsPlacement, formatLinkSpeed, looksLikeAddress, nodeFacts, nodeName, nodeValue } from '../../lib/networkPresentation'

const NODE_ICONS: Record<NetworkMapNode, ReactNode> = {
  pc: <Laptop size={20} />,
  router: <Router size={20} />,
  internet: <Globe size={20} />,
  dns: <Server size={20} />,
}

const NODE_PLACES: Record<Exclude<NetworkMapNode, 'dns'>, string> = {
  pc: 'col-start-1 row-start-1',
  router: 'col-start-3 row-start-1',
  internet: 'col-start-5 row-start-1',
}

const DNS_BRANCHES: Record<Exclude<DnsPlacement, 'router'>, { node: string; stem: string }> = {
  local: { node: 'col-start-3 row-start-3', stem: 'col-start-3 row-start-2' },
  internet: { node: 'col-start-5 row-start-3', stem: 'col-start-5 row-start-2' },
}

const ROUTER_DNS_TAG = 'DNS'

export default function NetworkMap({ details }: { details: NetworkDetails }) {
  const [selected, setSelected] = useState<NetworkMapNode>('pc')
  const placement = dnsPlacement(details)
  const dnsBranch = placement === 'local' || placement === 'internet' ? DNS_BRANCHES[placement] : null
  const dnsReachable = placement === 'internet' ? details.online : details.gateway !== null
  const shown = selected === 'dns' && !dnsBranch ? 'router' : selected
  const facts = nodeFacts(details, shown)

  function node(id: NetworkMapNode, place: string, reachable: boolean, tag?: string) {
    return (
      <MapNode
        place={place}
        icon={NODE_ICONS[id]}
        name={nodeName(details, id)}
        tag={tag}
        value={nodeValue(details, id)}
        selected={shown === id}
        reachable={reachable}
        onSelect={() => setSelected(id)}
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-line-hairline rounded-card bg-fill-ghost">
      <div
        role="group"
        aria-label="Connection map"
        className={`grid grid-cols-[150px_minmax(56px,1fr)_150px_minmax(56px,1fr)_150px] items-center px-5.5 pt-5.5 pb-4.5 ${
          dnsBranch ? 'grid-rows-[auto_34px_auto]' : 'grid-rows-[auto]'
        }`}
      >
        {node('pc', NODE_PLACES.pc, true)}
        <MapLink place="col-start-2 row-start-1" up top={connectionLabel(details)} bottom={formatLinkSpeed(details.linkSpeedMbps)} />
        {node('router', NODE_PLACES.router, details.gateway !== null, placement === 'router' ? ROUTER_DNS_TAG : undefined)}
        <MapLink place="col-start-4 row-start-1" up={details.online} top={details.online ? 'Online' : 'No internet'} />
        {node('internet', NODE_PLACES.internet, details.online)}
        {dnsBranch && (
          <>
            <div
              className={`${dnsBranch.stem} self-stretch justify-self-center border-l-[1.5px] ${
                dnsReachable ? 'border-solid border-ink-faint' : 'border-dashed border-line-strong'
              }`}
            />
            {node('dns', dnsBranch.node, dnsReachable)}
          </>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-9 gap-y-2.5 px-5 pt-4 pb-4.5 text-dense">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 justify-between gap-4">
            <dt className="shrink-0 text-ink-quiet">{fact.label}</dt>
            <dd title={fact.value} className={`min-w-0 truncate text-right text-ink-primary select-text ${looksLikeAddress(fact.value) ? 'font-mono text-xs leading-5' : ''}`}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function MapNode({
  place,
  icon,
  name,
  tag,
  value,
  selected,
  reachable,
  onSelect,
}: {
  place: string
  icon: ReactNode
  name: string
  tag?: string
  value: string
  selected: boolean
  reachable: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`focus-ring flex w-full min-w-0 cursor-pointer flex-col items-start gap-1.5 rounded-card p-3 text-left text-ink-primary transition-colors ${place} ${
        selected ? 'bg-fill-subtle ring-[1.5px] ring-ink-primary ring-inset' : 'bg-fill-ghost ring-1 ring-line-strong ring-inset hover:bg-fill-subtle'
      } ${reachable ? '' : 'opacity-45'}`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        {icon}
        {tag && (
          <span className="rounded-[4px] px-1.5 text-[10px] leading-4 font-medium text-ink-secondary ring-1 ring-line-strong">{tag}</span>
        )}
      </span>
      <span className="max-w-full truncate text-dense font-medium">{name}</span>
      <span className="max-w-full truncate font-mono text-[11.5px] text-ink-quiet">{value}</span>
    </button>
  )
}

function MapLink({ place, up, top, bottom }: { place: string; up: boolean; top: string; bottom?: string | null }) {
  return (
    <div className={`relative self-stretch ${place}`}>
      <div
        className={`absolute inset-x-0 top-1/2 border-t-[1.5px] ${up ? 'border-solid border-ink-faint' : 'border-dashed border-line-strong'}`}
      />
      <span className="absolute bottom-[calc(50%+6px)] left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-ink-quiet">{top}</span>
      {bottom && (
        <span className="absolute top-[calc(50%+7px)] left-1/2 -translate-x-1/2 font-mono text-[10.5px] whitespace-nowrap text-ink-quiet">
          {bottom}
        </span>
      )}
    </div>
  )
}
